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
/// Performance optimization: LWW resolution is applied at write-time rather than read-time.
/// This makes BuildState() O(fields) instead of O(deltas), dramatically improving performance
/// for documents with many historical deltas.
/// </summary>
public class Document
{
    private readonly ReaderWriterLockSlim _stateLock = new(LockRecursionPolicy.NoRecursion);
    private readonly List<StoredDelta> _deltas = new();
    private readonly ConcurrentDictionary<string, byte> _subscribedConnections = new();

    /// <summary>
    /// Cached resolved state - LWW applied at write-time for O(1) reads.
    /// Maps field name to (Value, Timestamp, ClockCounter, ClientId).
    /// </summary>
    private readonly Dictionary<string, FieldEntry> _resolvedFields = new();

    /// <summary>
    /// Tracks a field's resolved value and metadata for LWW comparison.
    /// </summary>
    private record FieldEntry(object? Value, long Timestamp, long ClockCounter, string ClientId, bool IsTombstone);

    /// <summary>
    /// Unique identifier for the document.
    /// </summary>
    public string Id { get; }

    /// <summary>
    /// Vector clock tracking causality for this document.
    /// </summary>
    public VectorClock VectorClock { get; private set; }

    /// <summary>
    /// When the document was created (Unix milliseconds).
    /// </summary>
    public long CreatedAt { get; }

    /// <summary>
    /// When the document was last updated (Unix milliseconds).
    /// </summary>
    public long UpdatedAt { get; private set; }

    /// <summary>
    /// Create a new empty document.
    /// </summary>
    /// <param name="id">Document identifier</param>
    public Document(string id)
    {
        Id = id;
        VectorClock = new VectorClock();
        CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
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
        VectorClock = vectorClock;
        _deltas = deltas.ToList();
        CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        // Rebuild the resolved state cache from existing deltas
        foreach (var delta in _deltas)
        {
            ApplyDeltaToResolvedStateInternal(delta);
        }
    }

    /// <summary>
    /// Add a delta to the document.
    /// Merges the delta's vector clock and updates the timestamp.
    /// Also applies LWW resolution at write-time for O(1) state reads.
    /// </summary>
    /// <param name="delta">Delta to add</param>
    public void AddDelta(StoredDelta delta)
    {
        _stateLock.EnterWriteLock();
        try
        {
            _deltas.Add(delta);
            VectorClock = VectorClock.Merge(delta.VectorClock);
            UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            // Apply LWW resolution at write-time
            ApplyDeltaToResolvedState(delta);
        }
        finally
        {
            _stateLock.ExitWriteLock();
        }
    }

    /// <summary>
    /// Atomically increment the vector clock for a client and add a delta.
    /// This ensures proper ordering when multiple deltas arrive concurrently from the same client.
    /// Also applies LWW resolution at write-time for O(1) state reads.
    /// </summary>
    /// <param name="clientId">Client ID to increment clock for</param>
    /// <param name="data">Delta data (JSON payload)</param>
    /// <param name="deltaId">Optional delta ID (generated if not provided)</param>
    /// <returns>The stored delta with the assigned vector clock</returns>
    public StoredDelta AddDeltaWithIncrementedClock(string clientId, JsonElement data, string? deltaId = null)
    {
        _stateLock.EnterWriteLock();
        try
        {
            // Atomically increment and capture the new clock value
            var incrementedClock = VectorClock.Increment(clientId);

            var stored = new StoredDelta
            {
                Id = deltaId ?? Guid.NewGuid().ToString(),
                ClientId = clientId,
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                Data = data,
                VectorClock = incrementedClock
            };

            _deltas.Add(stored);
            VectorClock = incrementedClock;
            UpdatedAt = stored.Timestamp;

            // Apply LWW resolution at write-time
            ApplyDeltaToResolvedState(stored);

            return stored;
        }
        finally
        {
            _stateLock.ExitWriteLock();
        }
    }

    /// <summary>
    /// Get all deltas that occurred after the given vector clock.
    /// Returns deltas that the client hasn't seen yet.
    /// </summary>
    /// <param name="since">Vector clock representing client's current state (null for all deltas)</param>
    /// <returns>List of deltas the client needs</returns>
    public IReadOnlyList<StoredDelta> GetDeltasSince(VectorClock? since)
    {
        _stateLock.EnterReadLock();
        try
        {
            if (since == null)
            {
                return _deltas.ToList();
            }

            return _deltas
                .Where(d => !d.VectorClock.HappensBefore(since) &&
                           !d.VectorClock.Equals(since))
                .ToList();
        }
        finally
        {
            _stateLock.ExitReadLock();
        }
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
    /// </summary>
    public IReadOnlyList<StoredDelta> GetAllDeltas()
    {
        _stateLock.EnterReadLock();
        try
        {
            return _deltas.ToList();
        }
        finally
        {
            _stateLock.ExitReadLock();
        }
    }

    /// <summary>
    /// Get delta count (for debugging/metrics).
    /// </summary>
    public int DeltaCount
    {
        get
        {
            _stateLock.EnterReadLock();
            try
            {
                return _deltas.Count;
            }
            finally
            {
                _stateLock.ExitReadLock();
            }
        }
    }

    /// <summary>
    /// Build the current document state from the cached resolved fields.
    /// This is O(fields) instead of O(deltas) because LWW is applied at write-time.
    ///
    /// Uses multi-level LWW conflict resolution (matching TypeScript server):
    /// 1. Timestamp (wall-clock) - later writes win
    /// 2. Vector clock counter - higher counter wins (for same timestamp)
    /// 3. ClientId (lexicographic) - deterministic tiebreaker for concurrent updates
    /// </summary>
    /// <returns>Document state as a dictionary</returns>
    public Dictionary<string, object?> BuildState()
    {
        _stateLock.EnterReadLock();
        try
        {
            var state = new Dictionary<string, object?>();

            foreach (var (fieldName, entry) in _resolvedFields)
            {
                // Skip tombstoned fields - they represent deleted fields
                if (!entry.IsTombstone)
                {
                    state[fieldName] = entry.Value;
                }
            }

            return state;
        }
        finally
        {
            _stateLock.ExitReadLock();
        }
    }

    /// <summary>
    /// Apply a delta to the resolved state cache using LWW resolution.
    /// Must be called within a write lock.
    /// </summary>
    private void ApplyDeltaToResolvedState(StoredDelta delta)
    {
        ApplyDeltaToResolvedStateInternal(delta);
    }

    /// <summary>
    /// Internal implementation of LWW state resolution.
    /// Shared by AddDelta, AddDeltaWithIncrementedClock, and constructor.
    /// </summary>
    private void ApplyDeltaToResolvedStateInternal(StoredDelta delta)
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

            if (!_resolvedFields.TryGetValue(fieldName, out var existing))
            {
                // First write for this field
                _resolvedFields[fieldName] = newEntry;
            }
            else
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

                if (thisWins)
                {
                    _resolvedFields[fieldName] = newEntry;
                }
            }
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
