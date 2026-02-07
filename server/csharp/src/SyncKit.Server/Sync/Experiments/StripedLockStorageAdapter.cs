using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace SyncKit.Server.Sync.Experiments;

/// <summary>
/// Striped locking storage adapter that distributes lock contention across
/// multiple stripes based on document ID hash.
///
/// This reduces contention compared to a single global lock while maintaining
/// the simplicity of lock-based synchronization.
///
/// Key differences from single-lock implementation:
/// - 64 stripe locks instead of one
/// - Documents hash to stripes, reducing per-stripe contention
/// - Same synchronous semantics as lock-based approach
/// - Lower overhead than actor model for multi-document scenarios
/// </summary>
public class StripedLockStorageAdapter
{
    private const int StripeCount = 64;
    private const int StripeMask = StripeCount - 1; // For fast modulo with power of 2

    private readonly object[] _stripes;
    private readonly ConcurrentDictionary<string, Document> _documents = new();
    private readonly ConcurrentDictionary<string, SessionEntry> _sessions = new();
    private readonly ILogger _logger;

    public StripedLockStorageAdapter(ILogger logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _stripes = new object[StripeCount];
        for (int i = 0; i < StripeCount; i++)
        {
            _stripes[i] = new object();
        }
    }

    /// <summary>
    /// Get the stripe lock for a document ID using fast hash distribution.
    /// </summary>
    [MethodImpl(MethodImplOptions.AggressiveInlining)]
    private object GetStripe(string documentId)
    {
        // Use string.GetHashCode() and mask for fast modulo
        var hash = documentId.GetHashCode() & 0x7FFFFFFF;
        return _stripes[hash & StripeMask];
    }

    /// <summary>
    /// Get or create a document with stripe-level locking.
    /// </summary>
    public Document GetOrCreateDocument(string documentId)
    {
        // Fast path: document already exists
        if (_documents.TryGetValue(documentId, out var existing))
        {
            return existing;
        }

        // Slow path: create with stripe lock
        var stripe = GetStripe(documentId);
        lock (stripe)
        {
            // Double-check after acquiring lock
            if (_documents.TryGetValue(documentId, out existing))
            {
                return existing;
            }

            var doc = new Document(documentId);
            _documents[documentId] = doc;
            return doc;
        }
    }

    /// <summary>
    /// Save a delta with stripe-level locking.
    /// </summary>
    public DeltaEntry SaveDelta(DeltaEntry delta)
    {
        var stripe = GetStripe(delta.DocumentId);
        StoredDelta stored;

        lock (stripe)
        {
            var document = GetOrCreateDocument(delta.DocumentId);

            if (delta.VectorClock != null && delta.VectorClock.Count > 0)
            {
                stored = new StoredDelta
                {
                    Id = delta.Id ?? Guid.NewGuid().ToString(),
                    ClientId = delta.ClientId,
                    Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    Data = delta.Value ?? JsonDocument.Parse("{}").RootElement,
                    VectorClock = VectorClock.FromDict(delta.VectorClock)
                };
                document.AddDelta(stored);
            }
            else
            {
                stored = document.AddDeltaWithIncrementedClock(
                    delta.ClientId,
                    delta.Value ?? JsonDocument.Parse("{}").RootElement,
                    delta.Id
                );
            }
        }

        var clockValueForClient = stored.VectorClock.Get(delta.ClientId);

        return delta with
        {
            Id = stored.Id,
            Timestamp = DateTimeOffset.FromUnixTimeMilliseconds(stored.Timestamp).UtcDateTime,
            MaxClockValue = clockValueForClient,
            ClockValue = clockValueForClient,
            OperationType = delta.OperationType ?? "set",
            FieldPath = delta.FieldPath ?? string.Empty,
            VectorClock = stored.VectorClock.ToDict()
        };
    }

    /// <summary>
    /// Get document state with stripe-level locking.
    /// </summary>
    public Dictionary<string, object?> GetDocumentState(string documentId)
    {
        if (!_documents.TryGetValue(documentId, out var doc))
        {
            return new Dictionary<string, object?>();
        }

        var stripe = GetStripe(documentId);
        lock (stripe)
        {
            return doc.BuildState();
        }
    }

    /// <summary>
    /// Get all deltas for a document with stripe-level locking.
    /// </summary>
    public IReadOnlyList<DeltaEntry> GetDeltas(string documentId, int limit = 100)
    {
        if (!_documents.TryGetValue(documentId, out var doc))
        {
            return Array.Empty<DeltaEntry>();
        }

        var stripe = GetStripe(documentId);
        lock (stripe)
        {
            var takeLimit = limit <= 0 ? int.MaxValue : limit;
            return doc.GetAllDeltas().Take(takeLimit).Select(d => new DeltaEntry
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
        }
    }

    /// <summary>
    /// Delete a document with stripe-level locking.
    /// </summary>
    public bool DeleteDocument(string documentId)
    {
        var stripe = GetStripe(documentId);
        lock (stripe)
        {
            return _documents.TryRemove(documentId, out _);
        }
    }

    /// <summary>
    /// Clear all documents (for testing).
    /// </summary>
    public void ClearAll()
    {
        // Lock all stripes to ensure consistency
        var locksTaken = new bool[StripeCount];
        try
        {
            for (int i = 0; i < StripeCount; i++)
            {
                Monitor.Enter(_stripes[i], ref locksTaken[i]);
            }
            _documents.Clear();
            _sessions.Clear();
            _logger.LogInformation("Striped storage cleared");
        }
        finally
        {
            for (int i = 0; i < StripeCount; i++)
            {
                if (locksTaken[i])
                {
                    Monitor.Exit(_stripes[i]);
                }
            }
        }
    }
}

/// <summary>
/// Models for the striped lock adapter (duplicated here for self-containment).
/// In production, would use the existing Storage/Models.cs.
/// </summary>
public record DeltaEntry
{
    public string? Id { get; init; }
    public required string DocumentId { get; init; }
    public required string ClientId { get; init; }
    public string? OperationType { get; init; }
    public string? FieldPath { get; init; }
    public JsonElement? Value { get; init; }
    public long? ClockValue { get; init; }
    public long? MaxClockValue { get; init; }
    public DateTime? Timestamp { get; init; }
    public Dictionary<string, long>? VectorClock { get; init; }
}

public record SessionEntry
{
    public required string Id { get; init; }
    public required string UserId { get; init; }
    public DateTime ConnectedAt { get; init; }
    public DateTime LastSeen { get; init; }
    public Dictionary<string, object>? Metadata { get; init; }
}
