namespace SyncKit.Server.Sync;

/// <summary>
/// Vector clock for tracking causality between operations in a distributed system.
///
/// This implementation follows the TLA+ verified specification in protocol/tla/vector_clock.tla
/// and is compatible with the Rust implementation in core/src/sync/vector_clock.rs.
///
/// Properties verified:
/// - CausalityPreserved: Happens-before relationship is correct
/// - Transitivity: If A→B and B→C, then A→C
/// - Monotonicity: Clock values only increase
/// - ConcurrentDetection: Concurrent operations detected correctly
/// - MergeCorrectness: Clock merging preserves causality
/// </summary>
public class VectorClock : IEquatable<VectorClock>
{
    private readonly Dictionary<string, long> _entries;

    /// <summary>
    /// Create a new empty vector clock.
    /// </summary>
    public VectorClock()
    {
        _entries = new Dictionary<string, long>();
    }

    /// <summary>
    /// Create a vector clock from existing entries.
    /// </summary>
    /// <param name="entries">Dictionary of client IDs to clock values</param>
    public VectorClock(Dictionary<string, long> entries)
    {
        _entries = new Dictionary<string, long>(entries);
    }

    /// <summary>
    /// Read-only view of clock entries.
    /// </summary>
    public IReadOnlyDictionary<string, long> Entries => _entries;

    /// <summary>
    /// Increment the clock for the given client.
    /// This is called when a client performs a local operation.
    /// </summary>
    /// <param name="clientId">Client ID to increment</param>
    /// <returns>New vector clock with incremented value</returns>
    public VectorClock Increment(string clientId)
    {
        var newEntries = new Dictionary<string, long>(_entries)
        {
            [clientId] = Get(clientId) + 1
        };
        return new VectorClock(newEntries);
    }

    /// <summary>
    /// Get the clock value for a client (0 if not present).
    /// </summary>
    /// <param name="clientId">Client ID to query</param>
    /// <returns>Clock value for the client</returns>
    public long Get(string clientId)
    {
        return _entries.GetValueOrDefault(clientId, 0);
    }

    /// <summary>
    /// Merge with another clock (take max of each entry).
    /// This operation is used when receiving remote operations.
    /// It ensures that all causal dependencies are tracked.
    /// </summary>
    /// <param name="other">Other vector clock to merge with</param>
    /// <returns>New vector clock with merged values</returns>
    public VectorClock Merge(VectorClock other)
    {
        var merged = new Dictionary<string, long>(_entries);

        foreach (var (clientId, value) in other._entries)
        {
            merged[clientId] = Math.Max(merged.GetValueOrDefault(clientId, 0), value);
        }

        return new VectorClock(merged);
    }

    /// <summary>
    /// Check if this clock causally precedes (happens-before) another.
    ///
    /// A happens-before B iff:
    /// - A[i] ≤ B[i] for all i (all entries in A are less than or equal to B)
    /// - A[j] &lt; B[j] for some j (at least one entry in A is strictly less than B)
    ///
    /// This determines if operation A causally preceded operation B.
    /// </summary>
    /// <param name="other">Other vector clock to compare with</param>
    /// <returns>True if this clock happened before other</returns>
    public bool HappensBefore(VectorClock other)
    {
        var allLessOrEqual = true;
        var someLess = false;

        var allKeys = _entries.Keys.Union(other._entries.Keys);

        foreach (var key in allKeys)
        {
            var thisValue = Get(key);
            var otherValue = other.Get(key);

            if (thisValue > otherValue)
            {
                allLessOrEqual = false;
                break;
            }

            if (thisValue < otherValue)
            {
                someLess = true;
            }
        }

        return allLessOrEqual && someLess;
    }

    /// <summary>
    /// Check if this clock is concurrent with another.
    ///
    /// Two clocks are concurrent if neither happened before the other.
    /// This indicates conflicting operations that need resolution (e.g., via LWW).
    /// </summary>
    /// <param name="other">Other vector clock to compare with</param>
    /// <returns>True if the clocks are concurrent</returns>
    public bool IsConcurrent(VectorClock other)
    {
        return !HappensBefore(other) && !other.HappensBefore(this) && !Equals(other);
    }

    /// <summary>
    /// Check equality with another vector clock.
    /// Two clocks are equal if all their entries match.
    /// </summary>
    /// <param name="other">Other vector clock to compare with</param>
    /// <returns>True if clocks are equal</returns>
    public bool Equals(VectorClock? other)
    {
        if (other is null) return false;
        if (ReferenceEquals(this, other)) return true;

        var allKeys = _entries.Keys.Union(other._entries.Keys);
        return allKeys.All(k => Get(k) == other.Get(k));
    }

    /// <summary>
    /// Check equality with another object.
    /// </summary>
    /// <param name="obj">Object to compare with</param>
    /// <returns>True if objects are equal</returns>
    public override bool Equals(object? obj) => Equals(obj as VectorClock);

    /// <summary>
    /// Compute hash code for use in hash-based collections.
    /// </summary>
    /// <returns>Hash code</returns>
    public override int GetHashCode()
    {
        var hash = new HashCode();
        foreach (var (key, value) in _entries.OrderBy(e => e.Key))
        {
            hash.Add(key);
            hash.Add(value);
        }
        return hash.ToHashCode();
    }

    /// <summary>
    /// Convert to dictionary for serialization.
    /// </summary>
    /// <returns>Dictionary of client IDs to clock values</returns>
    public Dictionary<string, long> ToDict() => new(_entries);

    /// <summary>
    /// Convert to JSON-serializable dictionary.
    /// Alias for ToDict() for semantic clarity.
    /// </summary>
    /// <returns>Dictionary of client IDs to clock values</returns>
    public Dictionary<string, long> ToJson() => ToDict();

    /// <summary>
    /// Create vector clock from dictionary (for deserialization).
    /// </summary>
    /// <param name="dict">Dictionary of client IDs to clock values</param>
    /// <returns>New vector clock</returns>
    public static VectorClock FromDict(Dictionary<string, long>? dict)
    {
        return dict == null ? new VectorClock() : new VectorClock(dict);
    }

    /// <summary>
    /// String representation for debugging.
    /// </summary>
    /// <returns>String representation</returns>
    public override string ToString()
    {
        if (_entries.Count == 0)
        {
            return "VectorClock {}";
        }

        var entries = string.Join(", ", _entries.OrderBy(e => e.Key).Select(e => $"{e.Key}: {e.Value}"));
        return $"VectorClock {{ {entries} }}";
    }
}
