using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;

namespace SyncKit.Server.Sync;

/// <summary>
/// Represents a document with its state, deltas, and subscriptions.
/// Thread-safe document state management for sync operations.
/// </summary>
public class Document
{
    private readonly ReaderWriterLockSlim _stateLock = new(LockRecursionPolicy.NoRecursion);
    private readonly List<StoredDelta> _deltas = new();
    private readonly ConcurrentDictionary<string, byte> _subscribedConnections = new();

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
    }

    /// <summary>
    /// Add a delta to the document.
    /// Merges the delta's vector clock and updates the timestamp.
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
    /// Build the current document state by applying all deltas.
    /// Returns a dictionary representing field name to value mappings.
    /// </summary>
    /// <returns>Document state as a dictionary</returns>
    public Dictionary<string, object?> BuildState()
    {
        _stateLock.EnterReadLock();
        try
        {
            var state = new Dictionary<string, object?>();
            var lastWriteInfo = new Dictionary<string, (long Timestamp, string? ClientId)>();

            foreach (var delta in _deltas)
            {
                if (delta.Data.ValueKind == JsonValueKind.Object)
                {
                    foreach (var property in delta.Data.EnumerateObject())
                    {
                        var fieldName = property.Name;
                        var deltaTs = delta.Timestamp;
                        var clientId = delta.ClientId ?? string.Empty;

                        var isTombstone = IsTombstone(property.Value);

                        if (!lastWriteInfo.TryGetValue(fieldName, out var last))
                        {
                            if (isTombstone)
                                state.Remove(fieldName);
                            else
                                state[fieldName] = ConvertJsonElement(property.Value);

                            lastWriteInfo[fieldName] = (deltaTs, clientId);
                        }
                        else if (deltaTs > last.Timestamp ||
                                 (deltaTs == last.Timestamp &&
                                  string.Compare(clientId, last.ClientId, StringComparison.Ordinal) > 0))
                        {
                            if (isTombstone)
                                state.Remove(fieldName);
                            else
                                state[fieldName] = ConvertJsonElement(property.Value);

                            lastWriteInfo[fieldName] = (deltaTs, clientId);
                        }
                    }
                }
            }

            return state;
        }
        finally
        {
            _stateLock.ExitReadLock();
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
