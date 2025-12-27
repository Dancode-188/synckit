using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using SyncKit.Server.Sync;

namespace SyncKit.Server.Storage;

/// <summary>
/// In-memory implementation of {@link IStorageAdapter} backed by in-process collections.
/// </summary>
public class InMemoryStorageAdapter : IStorageAdapter
{
    private readonly ConcurrentDictionary<string, Document> _documents = new();
    private readonly ConcurrentDictionary<string, SessionEntry> _sessions = new();
    private readonly ILogger _logger;

    // Accept non-generic ILogger for easier compatibility with legacy wrappers
    public InMemoryStorageAdapter(ILogger logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    // === Connection lifecycle ===
    public Task ConnectAsync(CancellationToken ct = default) => Task.CompletedTask;
    public Task DisconnectAsync(CancellationToken ct = default) => Task.CompletedTask;
    public bool IsConnected => true;
    public Task<bool> HealthCheckAsync(CancellationToken ct = default) => Task.FromResult(true);

    // === IStorageAdapter Document operations ===
    public Task<DocumentState?> GetDocumentAsync(string id, CancellationToken ct = default)
    {
        _documents.TryGetValue(id, out var doc);
        if (doc == null) return Task.FromResult<DocumentState?>(null);

        // No structured state is tracked in the current Document model; return empty state for now.
        var emptyState = JsonDocument.Parse("{}").RootElement;
        var ds = new DocumentState(id, emptyState, doc.UpdatedAt, DateTimeOffset.FromUnixTimeMilliseconds(doc.CreatedAt).UtcDateTime, DateTimeOffset.FromUnixTimeMilliseconds(doc.UpdatedAt).UtcDateTime);
        return Task.FromResult<DocumentState?>(ds);
    }

    public Task<DocumentState> SaveDocumentAsync(string id, JsonElement state, CancellationToken ct = default)
    {
        var doc = _documents.GetOrAdd(id, id2 => new Document(id2));
        // bump updated timestamp
        // There is no persisted 'state' stored in Document today; we only update UpdatedAt
        // Convert timestamps
        var updatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        // reflect into Document by adding a no-op delta maybe; we simply update UpdatedAt by adding an internal delta
        // For now, keep it simple and return DocumentState
        var ds = new DocumentState(id, state, updatedAt, DateTimeOffset.FromUnixTimeMilliseconds(doc.CreatedAt).UtcDateTime, DateTimeOffset.FromUnixTimeMilliseconds(updatedAt).UtcDateTime);
        return Task.FromResult(ds);
    }

    public Task<DocumentState> UpdateDocumentAsync(string id, JsonElement state, CancellationToken ct = default)
    {
        if (!_documents.ContainsKey(id)) throw new InvalidOperationException("Document does not exist");
        return SaveDocumentAsync(id, state, ct);
    }

    public Task<bool> DeleteDocumentAsync(string id, CancellationToken ct = default)
    {
        var removed = _documents.TryRemove(id, out _);
        return Task.FromResult(removed);
    }

    public Task<IReadOnlyList<DocumentState>> ListDocumentsAsync(int limit = 100, int offset = 0, CancellationToken ct = default)
    {
        var items = _documents.Values.Skip(offset).Take(limit).Select(d => new DocumentState(d.Id, JsonDocument.Parse("{}").RootElement, d.UpdatedAt, DateTimeOffset.FromUnixTimeMilliseconds(d.CreatedAt).UtcDateTime, DateTimeOffset.FromUnixTimeMilliseconds(d.UpdatedAt).UtcDateTime)).ToList().AsReadOnly();
        return Task.FromResult<IReadOnlyList<DocumentState>>(items);
    }

    // === Vector clock operations ===
    public Task<Dictionary<string, long>> GetVectorClockAsync(string documentId, CancellationToken ct = default)
    {
        _documents.TryGetValue(documentId, out var doc);
        return Task.FromResult(doc != null ? doc.VectorClock.ToDict() : new Dictionary<string, long>());
    }

    public Task UpdateVectorClockAsync(string documentId, string clientId, long clockValue, CancellationToken ct = default)
    {
        var document = _documents.GetOrAdd(documentId, id => new Document(id));
        // There's no direct setter on VectorClock, so simulate by saving an internal delta
        var delta = new StoredDelta
        {
            Id = Guid.NewGuid().ToString(),
            ClientId = clientId,
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Data = JsonDocument.Parse("{}").RootElement,
            VectorClock = VectorClock.FromDict(new Dictionary<string, long> { [clientId] = clockValue })
        };
        document.AddDelta(delta);
        return Task.CompletedTask;
    }

    public Task MergeVectorClockAsync(string documentId, Dictionary<string, long> clock, CancellationToken ct = default)
    {
        var document = _documents.GetOrAdd(documentId, id => new Document(id));
        var vc = VectorClock.FromDict(clock);
        // merge by adding a no-op delta with that vector clock
        var delta = new StoredDelta
        {
            Id = Guid.NewGuid().ToString(),
            ClientId = "system",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Data = JsonDocument.Parse("{}").RootElement,
            VectorClock = vc
        };
        document.AddDelta(delta);
        return Task.CompletedTask;
    }

    // === Delta operations ===
    public Task<DeltaEntry> SaveDeltaAsync(DeltaEntry delta, CancellationToken ct = default)
    {
        var stored = new StoredDelta
        {
            Id = delta.Id ?? Guid.NewGuid().ToString(),
            ClientId = delta.ClientId,
            Timestamp = delta.Timestamp.HasValue ? new DateTimeOffset(delta.Timestamp.Value).ToUnixTimeMilliseconds() : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Data = delta.Value ?? JsonDocument.Parse("{}").RootElement,
            VectorClock = delta.VectorClock != null ? VectorClock.FromDict(delta.VectorClock) : new VectorClock()
        };

        var document = _documents.GetOrAdd(delta.DocumentId, id => new Document(id));
        document.AddDelta(stored);

        // compute MaxClockValue as maximum of vector clock values
        var max = delta.VectorClock?.Values.DefaultIfEmpty(0).Max() ?? stored.VectorClock.Entries.DefaultIfEmpty().Max(kv => kv.Value);
        var result = delta with { Id = stored.Id, Timestamp = DateTime.UtcNow, MaxClockValue = max, OperationType = delta.OperationType ?? "set", FieldPath = delta.FieldPath ?? string.Empty };

        return Task.FromResult(result);
    }

    public Task<IReadOnlyList<DeltaEntry>> GetDeltasAsync(string documentId, int limit = 100, CancellationToken ct = default)
    {
        _documents.TryGetValue(documentId, out var doc);
        if (doc == null) return Task.FromResult<IReadOnlyList<DeltaEntry>>(Array.Empty<DeltaEntry>());

        var deltas = doc.GetAllDeltas().Take(limit).Select(d => new DeltaEntry
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

        return Task.FromResult<IReadOnlyList<DeltaEntry>>(deltas);
    }

    public Task<IReadOnlyList<DeltaEntry>> GetDeltasSinceAsync(string documentId, long? sinceMaxClock, CancellationToken ct = default)
    {
        _documents.TryGetValue(documentId, out var doc);
        if (doc == null) return Task.FromResult<IReadOnlyList<DeltaEntry>>(Array.Empty<DeltaEntry>());

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

        return Task.FromResult<IReadOnlyList<DeltaEntry>>(deltas);
    }

    // === Session operations ===
    public Task<SessionEntry> SaveSessionAsync(SessionEntry session, CancellationToken ct = default)
    {
        _sessions[session.Id] = session with { ConnectedAt = session.ConnectedAt == default ? DateTime.UtcNow : session.ConnectedAt };
        return Task.FromResult(_sessions[session.Id]);
    }

    public Task UpdateSessionAsync(string sessionId, DateTime lastSeen, Dictionary<string, object>? metadata = null, CancellationToken ct = default)
    {
        if (_sessions.TryGetValue(sessionId, out var session))
        {
            var updated = session with { LastSeen = lastSeen, Metadata = metadata ?? session.Metadata };
            _sessions[sessionId] = updated;
        }

        return Task.CompletedTask;
    }

    public Task<bool> DeleteSessionAsync(string sessionId, CancellationToken ct = default)
    {
        var removed = _sessions.TryRemove(sessionId, out _);
        return Task.FromResult(removed);
    }

    public Task<IReadOnlyList<SessionEntry>> GetSessionsAsync(string userId, CancellationToken ct = default)
    {
        var sessions = _sessions.Values.Where(s => s.UserId == userId).ToList().AsReadOnly();
        return Task.FromResult<IReadOnlyList<SessionEntry>>(sessions);
    }

    // === Maintenance ===
    public Task<CleanupResult> CleanupAsync(CleanupOptions? options = null, CancellationToken ct = default)
    {
        var opts = options ?? new CleanupOptions();
        var cutoff = DateTime.UtcNow.AddHours(-opts.OldSessionsHours);
        var removedSessions = _sessions.Where(kvp => kvp.Value.LastSeen < cutoff).Select(kvp => kvp.Key).ToList();
        foreach (var id in removedSessions) _sessions.TryRemove(id, out _);

        // Deltas cleanup not implemented in-memory (could filter by timestamp)
        return Task.FromResult(new CleanupResult(removedSessions.Count, 0));
    }

}
