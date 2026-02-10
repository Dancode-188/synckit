using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using SyncKit.Server.Sync;
using SyncKit.Server.Sync.Experiments;

namespace SyncKit.Server.Storage;

/// <summary>
/// Actor-model storage adapter that uses ActorDocument instead of Document.
/// 
/// Each document is an actor with a Channel<T>-based message queue and single consumer.
/// This eliminates lock contention by replacing shared-state synchronization with
/// sequential message processing per document.
/// 
/// Performance characteristics:
/// - No lock contention under high concurrency
/// - Predictable latency (queue depth dependent)
/// - Slightly higher base latency due to async overhead
/// - Better burst handling due to message buffering
/// </summary>
public class ActorModelStorageAdapter : IStorageAdapter, IAsyncDisposable
{
    private readonly ConcurrentDictionary<string, ActorDocument> _documents = new();
    private readonly ConcurrentDictionary<string, SessionEntry> _sessions = new();
    private readonly ILogger<ActorModelStorageAdapter> _logger;

    public ActorModelStorageAdapter(ILogger<ActorModelStorageAdapter> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    // === Connection lifecycle ===
    public ValueTask ConnectAsync(CancellationToken ct = default) => ValueTask.CompletedTask;
    public ValueTask DisconnectAsync(CancellationToken ct = default) => ValueTask.CompletedTask;
    public bool IsConnected => true;
    public ValueTask<bool> HealthCheckAsync(CancellationToken ct = default) => ValueTask.FromResult(true);

    // === IStorageAdapter Document operations ===
    public ValueTask<DocumentState?> GetDocumentAsync(string id, CancellationToken ct = default)
    {
        _documents.TryGetValue(id, out var doc);
        if (doc == null)
            return ValueTask.FromResult<DocumentState?>(null);

        var emptyState = JsonDocument.Parse("{}").RootElement;
        var ds = new DocumentState(id, emptyState, doc.UpdatedAt, DateTimeOffset.FromUnixTimeMilliseconds(doc.CreatedAt).UtcDateTime, DateTimeOffset.FromUnixTimeMilliseconds(doc.UpdatedAt).UtcDateTime);
        return ValueTask.FromResult<DocumentState?>(ds);
    }

    public ValueTask<DocumentState> SaveDocumentAsync(string id, JsonElement state, CancellationToken ct = default)
    {
        var doc = _documents.GetOrAdd(id, id2 => new ActorDocument(id2));
        var updatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var ds = new DocumentState(id, state, updatedAt, DateTimeOffset.FromUnixTimeMilliseconds(doc.CreatedAt).UtcDateTime, DateTimeOffset.FromUnixTimeMilliseconds(updatedAt).UtcDateTime);
        return ValueTask.FromResult(ds);
    }

    public ValueTask<DocumentState> UpdateDocumentAsync(string id, JsonElement state, CancellationToken ct = default)
    {
        if (!_documents.ContainsKey(id))
            throw new InvalidOperationException("Document does not exist");
        return SaveDocumentAsync(id, state, ct);
    }

    public ValueTask<bool> DeleteDocumentAsync(string id, CancellationToken ct = default)
    {
        var removed = _documents.TryRemove(id, out var doc);
        if (doc != null)
        {
            // Fire and forget disposal - don't block delete
            _ = doc.DisposeAsync();
        }
        return ValueTask.FromResult(removed);
    }

    public ValueTask<IReadOnlyList<DocumentState>> ListDocumentsAsync(int limit = 100, int offset = 0, CancellationToken ct = default)
    {
        var items = _documents.Values.Skip(offset).Take(limit).Select(d => new DocumentState(d.Id, JsonDocument.Parse("{}").RootElement, d.UpdatedAt, DateTimeOffset.FromUnixTimeMilliseconds(d.CreatedAt).UtcDateTime, DateTimeOffset.FromUnixTimeMilliseconds(d.UpdatedAt).UtcDateTime)).ToList().AsReadOnly();
        return ValueTask.FromResult<IReadOnlyList<DocumentState>>(items);
    }

    public ValueTask<Dictionary<string, object?>> GetDocumentStateAsync(string documentId, CancellationToken ct = default)
    {
        _documents.TryGetValue(documentId, out var doc);
        if (doc == null)
        {
            _logger.LogDebug("GetDocumentStateAsync: Document {DocumentId} not found, returning empty state", documentId);
            return ValueTask.FromResult(new Dictionary<string, object?>());
        }
        var state = doc.BuildState();
        _logger.LogDebug("GetDocumentStateAsync: Document {DocumentId} has {DeltaCount} deltas, built state with {FieldCount} fields: {State}",
            documentId, doc.DeltaCount, state.Count, System.Text.Json.JsonSerializer.Serialize(state));
        return ValueTask.FromResult(state);
    }

    // === Vector clock operations ===
    public ValueTask<Dictionary<string, long>> GetVectorClockAsync(string documentId, CancellationToken ct = default)
    {
        _documents.TryGetValue(documentId, out var doc);
        return ValueTask.FromResult(doc != null ? doc.VectorClock.ToDict() : new Dictionary<string, long>());
    }

    public async ValueTask UpdateVectorClockAsync(string documentId, string clientId, long clockValue, CancellationToken ct = default)
    {
        var document = _documents.GetOrAdd(documentId, id => new ActorDocument(id));
        var delta = new StoredDelta
        {
            Id = Guid.NewGuid().ToString(),
            ClientId = clientId,
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Data = JsonDocument.Parse("{}").RootElement,
            VectorClock = VectorClock.FromDict(new Dictionary<string, long> { [clientId] = clockValue })
        };
        await document.AddDeltaAsync(delta);
    }

    public async ValueTask MergeVectorClockAsync(string documentId, Dictionary<string, long> clock, CancellationToken ct = default)
    {
        var document = _documents.GetOrAdd(documentId, id => new ActorDocument(id));
        var vc = VectorClock.FromDict(clock);
        var delta = new StoredDelta
        {
            Id = Guid.NewGuid().ToString(),
            ClientId = "system",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Data = JsonDocument.Parse("{}").RootElement,
            VectorClock = vc
        };
        await document.AddDeltaAsync(delta);
    }

    // === Delta operations ===
    public async ValueTask<DeltaEntry> SaveDeltaAsync(DeltaEntry delta, CancellationToken ct = default)
    {
        var document = _documents.GetOrAdd(delta.DocumentId, id => new ActorDocument(id));

        StoredDelta stored;

        if (delta.VectorClock != null && delta.VectorClock.Count > 0)
        {
            // Use provided vector clock (test scenario)
            stored = new StoredDelta
            {
                Id = delta.Id ?? Guid.NewGuid().ToString(),
                ClientId = delta.ClientId,
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                Data = delta.Value ?? JsonDocument.Parse("{}").RootElement,
                VectorClock = VectorClock.FromDict(delta.VectorClock)
            };
            await document.AddDeltaAsync(stored);
        }
        else
        {
            // Use atomic increment-and-add via actor channel
            stored = await document.AddDeltaWithIncrementedClockAsync(
                delta.ClientId,
                delta.Value ?? JsonDocument.Parse("{}").RootElement,
                delta.Id
            );
        }

        var clockValueForClient = stored.VectorClock.Get(delta.ClientId);

        var result = delta with
        {
            Id = stored.Id,
            Timestamp = DateTimeOffset.FromUnixTimeMilliseconds(stored.Timestamp).UtcDateTime,
            MaxClockValue = clockValueForClient,
            ClockValue = clockValueForClient,
            OperationType = delta.OperationType ?? "set",
            FieldPath = delta.FieldPath ?? string.Empty,
            VectorClock = stored.VectorClock.ToDict()
        };

        return result;
    }

    public ValueTask<IReadOnlyList<DeltaEntry>> GetDeltasAsync(string documentId, int limit = 100, CancellationToken ct = default)
    {
        _documents.TryGetValue(documentId, out var doc);
        if (doc == null)
            return ValueTask.FromResult<IReadOnlyList<DeltaEntry>>(Array.Empty<DeltaEntry>());

        var takeLimit = limit <= 0 ? int.MaxValue : limit;
        var deltas = doc.GetAllDeltas().Take(takeLimit).Select(d => new DeltaEntry
        {
            Id = d.Id,
            DocumentId = documentId,
            ClientId = d.ClientId,
            OperationType = "set",
            FieldPath = string.Empty,
            Value = d.Data,
            ClockValue = d.VectorClock.Entries.DefaultIfEmpty().Max(kv => kv.Value),
            Timestamp = DateTimeOffset.FromUnixTimeMilliseconds(d.Timestamp).UtcDateTime,
            VectorClock = d.VectorClock.ToDict()
        }).ToList().AsReadOnly();

        return ValueTask.FromResult<IReadOnlyList<DeltaEntry>>(deltas);
    }

    public ValueTask<IReadOnlyList<DeltaEntry>> GetDeltasSinceAsync(string documentId, long? sinceMaxClock, CancellationToken ct = default)
    {
        _documents.TryGetValue(documentId, out var doc);
        if (doc == null)
            return ValueTask.FromResult<IReadOnlyList<DeltaEntry>>(Array.Empty<DeltaEntry>());

        var deltas = doc.GetAllDeltas()
            .Where(d =>
            {
                var max = d.VectorClock.Entries.DefaultIfEmpty().Max(kv => kv.Value);
                return sinceMaxClock == null || max > sinceMaxClock.Value;
            })
            .Select(d => new DeltaEntry
            {
                Id = d.Id,
                DocumentId = documentId,
                ClientId = d.ClientId,
                OperationType = "set",
                FieldPath = string.Empty,
                Value = d.Data,
                ClockValue = d.VectorClock.Entries.DefaultIfEmpty().Max(kv => kv.Value),
                Timestamp = DateTimeOffset.FromUnixTimeMilliseconds(d.Timestamp).UtcDateTime,
                VectorClock = d.VectorClock.ToDict()
            }).ToList().AsReadOnly();

        return ValueTask.FromResult<IReadOnlyList<DeltaEntry>>(deltas);
    }

    // === Session operations ===
    public ValueTask<SessionEntry> SaveSessionAsync(SessionEntry session, CancellationToken ct = default)
    {
        _sessions[session.Id] = session with { ConnectedAt = session.ConnectedAt == default ? DateTime.UtcNow : session.ConnectedAt };
        return ValueTask.FromResult(_sessions[session.Id]);
    }

    public ValueTask UpdateSessionAsync(string sessionId, DateTime lastSeen, Dictionary<string, object>? metadata = null, CancellationToken ct = default)
    {
        if (_sessions.TryGetValue(sessionId, out var session))
        {
            var updated = session with { LastSeen = lastSeen, Metadata = metadata ?? session.Metadata };
            _sessions[sessionId] = updated;
        }

        return ValueTask.CompletedTask;
    }

    public ValueTask<bool> DeleteSessionAsync(string sessionId, CancellationToken ct = default)
    {
        var removed = _sessions.TryRemove(sessionId, out _);
        return ValueTask.FromResult(removed);
    }

    public ValueTask<IReadOnlyList<SessionEntry>> GetSessionsAsync(string userId, CancellationToken ct = default)
    {
        var sessions = _sessions.Values.Where(s => s.UserId == userId).ToList().AsReadOnly();
        return ValueTask.FromResult<IReadOnlyList<SessionEntry>>(sessions);
    }

    // === Maintenance ===
    public ValueTask<CleanupResult> CleanupAsync(CleanupOptions? options = null, CancellationToken ct = default)
    {
        var opts = options ?? new CleanupOptions();
        var cutoff = DateTime.UtcNow.AddHours(-opts.OldSessionsHours);
        var removedSessions = _sessions.Where(kvp => kvp.Value.ConnectedAt < cutoff || kvp.Value.LastSeen < cutoff).Select(kvp => kvp.Key).ToList();
        foreach (var id in removedSessions)
            _sessions.TryRemove(id, out _);

        return ValueTask.FromResult(new CleanupResult(removedSessions.Count, 0));
    }

    /// <summary>
    /// Clear all storage (test/development mode only).
    /// </summary>
    public async ValueTask ClearAllAsync(CancellationToken ct = default)
    {
        // Dispose all actor documents
        var docs = _documents.Values.ToList();
        _documents.Clear();
        _sessions.Clear();

        foreach (var doc in docs)
        {
            await doc.DisposeAsync();
        }

        _logger.LogInformation("Actor-model storage cleared");
    }

    public async ValueTask DisposeAsync()
    {
        foreach (var doc in _documents.Values)
        {
            await doc.DisposeAsync();
        }
        _documents.Clear();
    }
}
