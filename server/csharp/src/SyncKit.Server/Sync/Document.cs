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
        lock (_lock)
        {
            _deltas.Add(delta);
            VectorClock = VectorClock.Merge(delta.VectorClock);
            UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
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

    /// <summary>
    /// Build the current document state by applying all deltas.
    /// Returns a dictionary representing field name to value mappings.
    /// </summary>
    /// <returns>Document state as a dictionary</returns>
    public Dictionary<string, object?> BuildState()
    {
        lock (_lock)
        {
            var state = new Dictionary<string, object?>();

            foreach (var delta in _deltas)
            {
                // Each delta's Data should be an object with field/value pairs
                // e.g., { "counter": 42 } or { "name": "test" }
                if (delta.Data.ValueKind == JsonValueKind.Object)
                {
                    foreach (var property in delta.Data.EnumerateObject())
                    {
                        // Check for tombstone marker (delete operation)
                        // { fieldName: { __deleted: true } }
                        if (IsTombstone(property.Value))
                        {
                            // Remove the field from state
                            state.Remove(property.Name);
                        }
                        else
                        {
                            // Convert JsonElement to appropriate .NET type for JSON serialization
                            state[property.Name] = ConvertJsonElement(property.Value);
                        }
                    }
                }
            }

            return state;
        }
    }

    /// <summary>
    /// Check if a value is a tombstone marker (delete operation).
    /// Tombstones are objects with { __deleted: true }
    /// </summary>
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

    /// <summary>
    /// Convert a JsonElement to an appropriate .NET object.
    /// </summary>
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
