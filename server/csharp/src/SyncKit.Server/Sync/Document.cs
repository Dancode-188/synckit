using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;

namespace SyncKit.Server.Sync;

/// <summary>
/// Represents a document with its state, deltas, and subscriptions.
/// Thread-safe document state management for sync operations.
///
/// Performance optimization: Uses lock-free ConcurrentDictionary with atomic Compare-And-Swap (CAS)
/// operations for high-throughput concurrent updates without lock contention.
/// LWW resolution is applied at write-time rather than read-time.
/// This makes BuildState() O(fields) instead of O(deltas), dramatically improving performance
/// for documents with many historical deltas.
/// </summary>
public class Document
{
    // Lock-free collections for high-throughput scenarios
    private readonly ConcurrentQueue<StoredDelta> _deltas = new();
    private readonly ConcurrentDictionary<string, byte> _subscribedConnections = new();

    /// <summary>
    /// Cached resolved state - LWW applied at write-time for O(1) reads.
    /// Maps field name to (Value, Timestamp, ClockCounter, ClientId).
    /// Uses ConcurrentDictionary with atomic AddOrUpdate for lock-free LWW resolution.
    /// </summary>
    private readonly ConcurrentDictionary<string, FieldEntry> _resolvedFields = new();

    /// <summary>
    /// Atomic vector clock using interlocked operations.
    /// </summary>
    private VectorClock _vectorClock;
    private readonly object _vectorClockLock = new(); // Lightweight lock only for clock merge

    /// <summary>
    /// Tracks a field's resolved value and metadata for LWW comparison.
    /// Immutable record enables safe atomic replacement via CAS.
    /// </summary>
    private record FieldEntry(object? Value, long Timestamp, long ClockCounter, string ClientId, bool IsTombstone);

    /// <summary>
    /// Unique identifier for the document.
    /// </summary>
    public string Id { get; }

    /// <summary>
    /// Vector clock tracking causality for this document.
    /// Thread-safe property accessor.
    /// </summary>
    public VectorClock VectorClock
    {
        get
        {
            lock (_vectorClockLock)
            {
                return _vectorClock;
            }
        }
        private set
        {
            lock (_vectorClockLock)
            {
                _vectorClock = value;
            }
        }
    }

    /// <summary>
    /// When the document was created (Unix milliseconds).
    /// </summary>
    public long CreatedAt { get; }

    /// <summary>
    /// When the document was last updated (Unix milliseconds).
    /// Uses Interlocked for lock-free atomic updates.
    /// </summary>
    private long _updatedAt;
    public long UpdatedAt
    {
        get => Interlocked.Read(ref _updatedAt);
        private set => Interlocked.Exchange(ref _updatedAt, value);
    }

    /// <summary>
    /// Create a new empty document.
    /// </summary>
    /// <param name="id">Document identifier</param>
    public Document(string id)
    {
        Id = id;
        _vectorClock = new VectorClock();
        CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        _updatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }

    /// <summary>
    /// Create a document from existing state (e.g., loaded from storage).
    /// Rebuilds the resolved state cache by applying LWW to all deltas.
    /// </summary>
    /// <param name="id">Document identifier</param>
    /// <param name="vectorClock">Existing vector clock</param>
    /// <param name="deltas">Existing deltas</param>
    public Document(string id, VectorClock vectorClock, IEnumerable<StoredDelta> deltas)
    {
        Id = id;
        _vectorClock = vectorClock;
        CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        _updatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        // Add existing deltas to the queue (preserves order) and rebuild resolved state
        foreach (var delta in deltas)
        {
            _deltas.Enqueue(delta);
            ApplyDeltaToResolvedState(delta);
        }
    }

    /// <summary>
    /// Add a delta to the document.
    /// Merges the delta's vector clock and updates the timestamp.
    /// Uses lock-free LWW resolution via atomic CAS operations.
    /// </summary>
    /// <param name="delta">Delta to add</param>
    public void AddDelta(StoredDelta delta)
    {
        // Add to deltas queue (lock-free, preserves FIFO order)
        _deltas.Enqueue(delta);

        // Merge vector clock (lightweight lock)
        lock (_vectorClockLock)
        {
            _vectorClock = _vectorClock.Merge(delta.VectorClock);
        }

        // Update timestamp atomically
        UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        // Apply LWW resolution (lock-free CAS)
        ApplyDeltaToResolvedState(delta);
    }

    /// <summary>
    /// Atomically increment the vector clock for a client and add a delta.
    /// This ensures proper ordering when multiple deltas arrive concurrently from the same client.
    /// Uses lock-free LWW resolution for O(1) state reads.
    /// </summary>
    /// <param name="clientId">Client ID to increment clock for</param>
    /// <param name="data">Delta data (JSON payload)</param>
    /// <param name="deltaId">Optional delta ID (generated if not provided)</param>
    /// <returns>The stored delta with the assigned vector clock</returns>
    public StoredDelta AddDeltaWithIncrementedClock(string clientId, JsonElement data, string? deltaId = null)
    {
        VectorClock incrementedClock;

        // Atomic clock increment (lightweight lock only on vector clock)
        lock (_vectorClockLock)
        {
            incrementedClock = _vectorClock.Increment(clientId);
            _vectorClock = incrementedClock;
        }

        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var stored = new StoredDelta
        {
            Id = deltaId ?? Guid.NewGuid().ToString(),
            ClientId = clientId,
            Timestamp = timestamp,
            Data = data,
            VectorClock = incrementedClock
        };

        // Add to deltas queue (lock-free, preserves FIFO order)
        _deltas.Enqueue(stored);

        // Update timestamp atomically
        UpdatedAt = timestamp;

        // Apply LWW resolution (lock-free CAS)
        ApplyDeltaToResolvedState(stored);

        return stored;
    }

    /// <summary>
    /// Get all deltas that occurred after the given vector clock.
    /// Returns deltas that the client hasn't seen yet.
    /// Note: ConcurrentQueue enumeration is thread-safe and preserves FIFO order.
    /// </summary>
    /// <param name="since">Vector clock representing client's current state (null for all deltas)</param>
    /// <returns>List of deltas the client needs</returns>
    public IReadOnlyList<StoredDelta> GetDeltasSince(VectorClock? since)
    {
        // Snapshot the deltas for filtering (ConcurrentQueue.ToList() is thread-safe)
        var allDeltas = _deltas.ToList();

        if (since == null)
        {
            return allDeltas;
        }

        return allDeltas
            .Where(d => !d.VectorClock.HappensBefore(since) &&
                       !d.VectorClock.Equals(since))
            .ToList();
    }

    /// <summary>
    /// Subscribe a connection to this document's updates.
    /// </summary>
    /// <param name="connectionId">Connection identifier</param>
    public void Subscribe(string connectionId)
    {
        _subscribedConnections.TryAdd(connectionId, 0);
    }

    /// <summary>
    /// Unsubscribe a connection from this document's updates.
    /// </summary>
    /// <param name="connectionId">Connection identifier</param>
    public void Unsubscribe(string connectionId)
    {
        _subscribedConnections.TryRemove(connectionId, out _);
    }

    /// <summary>
    /// Get all connections subscribed to this document.
    /// </summary>
    /// <returns>Read-only set of connection IDs</returns>
    public IReadOnlySet<string> GetSubscribers()
    {
        return _subscribedConnections.Keys.ToHashSet();
    }

    /// <summary>
    /// Get the number of subscribers.
    /// </summary>
    public int SubscriberCount => _subscribedConnections.Count;

    /// <summary>
    /// Get all deltas (for debugging/inspection).
    /// Thread-safe enumeration of ConcurrentQueue.
    /// </summary>
    public IReadOnlyList<StoredDelta> GetAllDeltas()
    {
        return _deltas.ToList();
    }

    /// <summary>
    /// Get delta count (for debugging/metrics).
    /// </summary>
    public int DeltaCount => _deltas.Count;

    /// <summary>
    /// Build the current document state from the cached resolved fields.
    /// This is O(fields) instead of O(deltas) because LWW is applied at write-time.
    /// Thread-safe: uses ConcurrentDictionary snapshot enumeration.
    ///
    /// Uses multi-level LWW conflict resolution (matching TypeScript server):
    /// 1. Timestamp (wall-clock) - later writes win
    /// 2. Vector clock counter - higher counter wins (for same timestamp)
    /// 3. ClientId (lexicographic) - deterministic tiebreaker for concurrent updates
    /// </summary>
    /// <returns>Document state as a dictionary</returns>
    public Dictionary<string, object?> BuildState()
    {
        var state = new Dictionary<string, object?>();

        // Snapshot enumeration of ConcurrentDictionary is thread-safe
        foreach (var kvp in _resolvedFields)
        {
            var entry = kvp.Value;
            // Skip tombstoned fields - they represent deleted fields
            if (!entry.IsTombstone)
            {
                state[kvp.Key] = entry.Value;
            }
        }

        return state;
    }

    /// <summary>
    /// Apply a delta to the resolved state cache using LWW resolution.
    /// Uses lock-free atomic AddOrUpdate with CAS for thread-safe concurrent updates.
    /// </summary>
    private void ApplyDeltaToResolvedState(StoredDelta delta)
    {
        if (delta.Data.ValueKind != JsonValueKind.Object)
            return;

        var deltaTs = delta.Timestamp;
        var clientId = delta.ClientId ?? string.Empty;
        var clockCounter = delta.VectorClock.Get(clientId);

        foreach (var property in delta.Data.EnumerateObject())
        {
            var fieldName = property.Name;
            var isTombstone = IsTombstone(property.Value);
            var value = isTombstone ? null : ConvertJsonElement(property.Value);

            var newEntry = new FieldEntry(value, deltaTs, clockCounter, clientId, isTombstone);

            // Atomic AddOrUpdate with LWW comparison
            // This is lock-free and thread-safe via CAS (Compare-And-Swap)
            _resolvedFields.AddOrUpdate(
                fieldName,
                // Add factory - first write for this field
                newEntry,
                // Update factory - compare with existing using LWW
                (_, existing) =>
                {
                    // Multi-level LWW comparison (matches TypeScript server):
                    // 1. Timestamp wins
                    var timestampWins = deltaTs > existing.Timestamp;
                    var timestampTie = deltaTs == existing.Timestamp;

                    // 2. Clock counter wins (for same timestamp)
                    var clockWins = clockCounter > existing.ClockCounter;
                    var clockTie = clockCounter == existing.ClockCounter;

                    // 3. Client ID wins (lexicographic, for same timestamp & clock)
                    var clientIdWins = string.Compare(clientId, existing.ClientId, StringComparison.Ordinal) > 0;

                    var thisWins = timestampWins ||
                                  (timestampTie && clockWins) ||
                                  (timestampTie && clockTie && clientIdWins);

                    return thisWins ? newEntry : existing;
                });
        }
    }

    private static bool IsTombstone(JsonElement element)
    {
        if (element.ValueKind != JsonValueKind.Object)
            return false;

        if (element.TryGetProperty("__deleted", out var deletedProp))
        {
            return deletedProp.ValueKind == JsonValueKind.True;
        }

        return false;
    }

    private static object? ConvertJsonElement(JsonElement element)
    {
        return element.ValueKind switch
        {
            JsonValueKind.Null => null,
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Number when element.TryGetInt64(out var l) => l,
            JsonValueKind.Number => element.GetDouble(),
            JsonValueKind.String => element.GetString(),
            JsonValueKind.Array => element.EnumerateArray()
                .Select(ConvertJsonElement)
                .ToList(),
            JsonValueKind.Object => element.EnumerateObject()
                .ToDictionary(p => p.Name, p => ConvertJsonElement(p.Value)),
            _ => element.ToString()
        };
    }
}

/// <summary>
/// A stored delta with metadata for causality tracking.
/// </summary>
public class StoredDelta
{
    /// <summary>
    /// Unique identifier for this delta (message ID).
    /// </summary>
    public required string Id { get; init; }

    /// <summary>
    /// Client that created this delta.
    /// </summary>
    public required string ClientId { get; init; }

    /// <summary>
    /// Timestamp when the delta was created (Unix milliseconds).
    /// </summary>
    public required long Timestamp { get; init; }

    /// <summary>
    /// The actual delta data (JSON payload).
    /// </summary>
    public required JsonElement Data { get; init; }

    /// <summary>
    /// Vector clock representing the state after this delta.
    /// </summary>
    public required VectorClock VectorClock { get; init; }
}
