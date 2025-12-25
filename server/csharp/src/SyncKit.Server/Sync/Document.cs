using System.Text.Json;

namespace SyncKit.Server.Sync;

/// <summary>
/// Represents a document with its state, deltas, and subscriptions.
/// Thread-safe document state management for sync operations.
/// </summary>
public class Document
{
    private readonly object _lock = new();
    private readonly List<StoredDelta> _deltas = new();
    private readonly HashSet<string> _subscribedConnections = new();

    /// <summary>
    /// Unique identifier for the document.
    /// </summary>
    public string Id { get; }

    /// <summary>
    /// Vector clock tracking causality for this document.
    /// </summary>
    public VectorClock VectorClock { get; private set; }

    /// <summary>
    /// When the document was created.
    /// </summary>
    public DateTime CreatedAt { get; }

    /// <summary>
    /// When the document was last updated.
    /// </summary>
    public DateTime UpdatedAt { get; private set; }

    /// <summary>
    /// Create a new empty document.
    /// </summary>
    /// <param name="id">Document identifier</param>
    public Document(string id)
    {
        Id = id;
        VectorClock = new VectorClock();
        CreatedAt = DateTime.UtcNow;
        UpdatedAt = DateTime.UtcNow;
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
        CreatedAt = DateTime.UtcNow;
        UpdatedAt = DateTime.UtcNow;
    }

    /// <summary>
    /// Add a delta to the document.
    /// Merges the delta's vector clock and updates the timestamp.
    /// </summary>
    /// <param name="delta">Delta to add</param>
    public void AddDelta(StoredDelta delta)
    {
        lock (_lock)
        {
            _deltas.Add(delta);
            VectorClock = VectorClock.Merge(delta.VectorClock);
            UpdatedAt = DateTime.UtcNow;
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
        lock (_lock)
        {
            if (since == null)
            {
                return _deltas.ToList();
            }

            // Return deltas that the client hasn't seen
            // A delta should be included if:
            // 1. It doesn't happen-before the client's state (not already seen)
            // 2. It's not equal to the client's state (not the exact same state)
            return _deltas
                .Where(d => !d.VectorClock.HappensBefore(since) &&
                           !d.VectorClock.Equals(since))
                .ToList();
        }
    }

    /// <summary>
    /// Subscribe a connection to this document's updates.
    /// </summary>
    /// <param name="connectionId">Connection identifier</param>
    public void Subscribe(string connectionId)
    {
        lock (_lock)
        {
            _subscribedConnections.Add(connectionId);
        }
    }

    /// <summary>
    /// Unsubscribe a connection from this document's updates.
    /// </summary>
    /// <param name="connectionId">Connection identifier</param>
    public void Unsubscribe(string connectionId)
    {
        lock (_lock)
        {
            _subscribedConnections.Remove(connectionId);
        }
    }

    /// <summary>
    /// Get all connections subscribed to this document.
    /// </summary>
    /// <returns>Read-only set of connection IDs</returns>
    public IReadOnlySet<string> GetSubscribers()
    {
        lock (_lock)
        {
            return _subscribedConnections.ToHashSet();
        }
    }

    /// <summary>
    /// Get the number of subscribers.
    /// </summary>
    public int SubscriberCount
    {
        get
        {
            lock (_lock)
            {
                return _subscribedConnections.Count;
            }
        }
    }

    /// <summary>
    /// Get all deltas (for debugging/inspection).
    /// </summary>
    public IReadOnlyList<StoredDelta> GetAllDeltas()
    {
        lock (_lock)
        {
            return _deltas.ToList();
        }
    }

    /// <summary>
    /// Get delta count (for debugging/metrics).
    /// </summary>
    public int DeltaCount
    {
        get
        {
            lock (_lock)
            {
                return _deltas.Count;
            }
        }
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
