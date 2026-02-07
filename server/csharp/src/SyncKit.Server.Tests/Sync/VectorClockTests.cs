using SyncKit.Server.Sync;

namespace SyncKit.Server.Tests.Sync;

/// <summary>
/// Unit tests for VectorClock implementation.
/// Tests verify properties specified in protocol/tla/vector_clock.tla
/// and compatibility with core/src/sync/vector_clock.rs
/// </summary>
public class VectorClockTests
{
    [Fact]
    public void Constructor_Empty_CreatesEmptyClock()
    {
        var clock = new VectorClock();

        Assert.NotNull(clock);
        Assert.Empty(clock.Entries);
    }

    [Fact]
    public void Constructor_WithEntries_CopiesEntries()
    {
        var entries = new Dictionary<string, long>
        {
            ["client-1"] = 5,
            ["client-2"] = 3
        };

        var clock = new VectorClock(entries);

        Assert.Equal(2, clock.Entries.Count);
        Assert.Equal(5, clock.Get("client-1"));
        Assert.Equal(3, clock.Get("client-2"));
    }

    [Fact]
    public void Get_NonExistentClient_ReturnsZero()
    {
        var clock = new VectorClock();

        Assert.Equal(0, clock.Get("client-1"));
    }

    [Fact]
    public void Get_ExistingClient_ReturnsValue()
    {
        var clock = new VectorClock(new Dictionary<string, long> { ["client-1"] = 5 });

        Assert.Equal(5, clock.Get("client-1"));
    }

    [Fact]
    public void Increment_NewClient_SetsToOne()
    {
        var clock = new VectorClock();

        var incremented = clock.Increment("client-1");

        Assert.Equal(1, incremented.Get("client-1"));
        // Original unchanged (immutable)
        Assert.Equal(0, clock.Get("client-1"));
    }

    [Fact]
    public void Increment_ExistingClient_IncrementsValue()
    {
        var clock = new VectorClock(new Dictionary<string, long> { ["client-1"] = 5 });

        var incremented = clock.Increment("client-1");

        Assert.Equal(6, incremented.Get("client-1"));
        // Original unchanged (immutable)
        Assert.Equal(5, clock.Get("client-1"));
    }

    [Fact]
    public void Increment_PreservesOtherClients()
    {
        var clock = new VectorClock(new Dictionary<string, long>
        {
            ["client-1"] = 5,
            ["client-2"] = 3
        });

        var incremented = clock.Increment("client-1");

        Assert.Equal(6, incremented.Get("client-1"));
        Assert.Equal(3, incremented.Get("client-2"));
    }

    [Fact]
    public void Merge_EmptyWithEmpty_ReturnsEmpty()
    {
        var clock1 = new VectorClock();
        var clock2 = new VectorClock();

        var merged = clock1.Merge(clock2);

        Assert.Empty(merged.Entries);
    }

    [Fact]
    public void Merge_TakesMaxValues()
    {
        var clock1 = new VectorClock(new Dictionary<string, long>
        {
            ["a"] = 1,
            ["b"] = 3
        });
        var clock2 = new VectorClock(new Dictionary<string, long>
        {
            ["a"] = 2,
            ["c"] = 1
        });

        var merged = clock1.Merge(clock2);

        Assert.Equal(2, merged.Get("a")); // max(1, 2)
        Assert.Equal(3, merged.Get("b")); // max(3, 0)
        Assert.Equal(1, merged.Get("c")); // max(0, 1)
    }

    [Fact]
    public void Merge_PreservesImmutability()
    {
        var clock1 = new VectorClock(new Dictionary<string, long> { ["a"] = 1 });
        var clock2 = new VectorClock(new Dictionary<string, long> { ["a"] = 2 });

        var merged = clock1.Merge(clock2);

        Assert.Equal(1, clock1.Get("a")); // Original unchanged
        Assert.Equal(2, clock2.Get("a")); // Original unchanged
        Assert.Equal(2, merged.Get("a")); // Merged has max
    }

    [Fact]
    public void HappensBefore_EmptyClocks_ReturnsFalse()
    {
        var clock1 = new VectorClock();
        var clock2 = new VectorClock();

        Assert.False(clock1.HappensBefore(clock2));
        Assert.False(clock2.HappensBefore(clock1));
    }

    [Fact]
    public void HappensBefore_IdenticalClocks_ReturnsFalse()
    {
        var clock1 = new VectorClock(new Dictionary<string, long> { ["a"] = 1 });
        var clock2 = new VectorClock(new Dictionary<string, long> { ["a"] = 1 });

        Assert.False(clock1.HappensBefore(clock2));
        Assert.False(clock2.HappensBefore(clock1));
    }

    [Fact]
    public void HappensBefore_Causal_ReturnsTrue()
    {
        var clock1 = new VectorClock(new Dictionary<string, long> { ["a"] = 1 });
        var clock2 = new VectorClock(new Dictionary<string, long> { ["a"] = 2 });

        Assert.True(clock1.HappensBefore(clock2));
        Assert.False(clock2.HappensBefore(clock1));
    }

    [Fact]
    public void HappensBefore_MultipleClients_Causal()
    {
        var clock1 = new VectorClock(new Dictionary<string, long>
        {
            ["a"] = 1,
            ["b"] = 2
        });
        var clock2 = new VectorClock(new Dictionary<string, long>
        {
            ["a"] = 2,
            ["b"] = 3
        });

        Assert.True(clock1.HappensBefore(clock2));
        Assert.False(clock2.HappensBefore(clock1));
    }

    [Fact]
    public void HappensBefore_PartialOrdering_Causal()
    {
        // clock1 = {a:1, b:1}
        // clock2 = {a:2, b:1}
        // clock1 happened before clock2 (a increased, b same)
        var clock1 = new VectorClock(new Dictionary<string, long>
        {
            ["a"] = 1,
            ["b"] = 1
        });
        var clock2 = new VectorClock(new Dictionary<string, long>
        {
            ["a"] = 2,
            ["b"] = 1
        });

        Assert.True(clock1.HappensBefore(clock2));
        Assert.False(clock2.HappensBefore(clock1));
    }

    [Fact]
    public void HappensBefore_Concurrent_ReturnsFalse()
    {
        var clock1 = new VectorClock(new Dictionary<string, long>
        {
            ["a"] = 2,
            ["b"] = 1
        });
        var clock2 = new VectorClock(new Dictionary<string, long>
        {
            ["a"] = 1,
            ["b"] = 2
        });

        // Neither happened before the other (concurrent)
        Assert.False(clock1.HappensBefore(clock2));
        Assert.False(clock2.HappensBefore(clock1));
    }

    [Fact]
    public void IsConcurrent_EmptyClocks_ReturnsFalse()
    {
        var clock1 = new VectorClock();
        var clock2 = new VectorClock();

        // Empty clocks are equal, not concurrent
        Assert.False(clock1.IsConcurrent(clock2));
    }

    [Fact]
    public void IsConcurrent_IdenticalClocks_ReturnsFalse()
    {
        var clock1 = new VectorClock(new Dictionary<string, long> { ["a"] = 1 });
        var clock2 = new VectorClock(new Dictionary<string, long> { ["a"] = 1 });

        // Identical clocks are equal, not concurrent
        Assert.False(clock1.IsConcurrent(clock2));
    }

    [Fact]
    public void IsConcurrent_CausalClocks_ReturnsFalse()
    {
        var clock1 = new VectorClock(new Dictionary<string, long> { ["a"] = 1 });
        var clock2 = new VectorClock(new Dictionary<string, long> { ["a"] = 2 });

        // One happened before the other, not concurrent
        Assert.False(clock1.IsConcurrent(clock2));
        Assert.False(clock2.IsConcurrent(clock1));
    }

    [Fact]
    public void IsConcurrent_ConcurrentClocks_ReturnsTrue()
    {
        // clock1 = {a:2, b:1}
        // clock2 = {a:1, b:2}
        // These are concurrent (neither happened before the other)
        var clock1 = new VectorClock(new Dictionary<string, long>
        {
            ["a"] = 2,
            ["b"] = 1
        });
        var clock2 = new VectorClock(new Dictionary<string, long>
        {
            ["a"] = 1,
            ["b"] = 2
        });

        Assert.True(clock1.IsConcurrent(clock2));
        Assert.True(clock2.IsConcurrent(clock1));
    }

    [Fact]
    public void IsConcurrent_DisjointClients_ReturnsTrue()
    {
        // clock1 = {a:1}
        // clock2 = {b:1}
        // These are concurrent (different clients)
        var clock1 = new VectorClock(new Dictionary<string, long> { ["a"] = 1 });
        var clock2 = new VectorClock(new Dictionary<string, long> { ["b"] = 1 });

        Assert.True(clock1.IsConcurrent(clock2));
        Assert.True(clock2.IsConcurrent(clock1));
    }

    [Fact]
    public void Equals_EmptyClocks_ReturnsTrue()
    {
        var clock1 = new VectorClock();
        var clock2 = new VectorClock();

        Assert.True(clock1.Equals(clock2));
        Assert.True(clock2.Equals(clock1));
    }

    [Fact]
    public void Equals_IdenticalClocks_ReturnsTrue()
    {
        var clock1 = new VectorClock(new Dictionary<string, long>
        {
            ["a"] = 1,
            ["b"] = 2
        });
        var clock2 = new VectorClock(new Dictionary<string, long>
        {
            ["a"] = 1,
            ["b"] = 2
        });

        Assert.True(clock1.Equals(clock2));
        Assert.True(clock2.Equals(clock1));
    }

    [Fact]
    public void Equals_DifferentClocks_ReturnsFalse()
    {
        var clock1 = new VectorClock(new Dictionary<string, long> { ["a"] = 1 });
        var clock2 = new VectorClock(new Dictionary<string, long> { ["a"] = 2 });

        Assert.False(clock1.Equals(clock2));
        Assert.False(clock2.Equals(clock1));
    }

    [Fact]
    public void Equals_Null_ReturnsFalse()
    {
        var clock = new VectorClock();

        Assert.False(clock.Equals(null));
    }

    [Fact]
    public void ToDict_ReturnsEntries()
    {
        var entries = new Dictionary<string, long>
        {
            ["a"] = 1,
            ["b"] = 2
        };
        var clock = new VectorClock(entries);

        var dict = clock.ToDict();

        Assert.Equal(2, dict.Count);
        Assert.Equal(1, dict["a"]);
        Assert.Equal(2, dict["b"]);
    }

    [Fact]
    public void FromDict_Null_ReturnsEmptyClock()
    {
        var clock = VectorClock.FromDict(null);

        Assert.NotNull(clock);
        Assert.Empty(clock.Entries);
    }

    [Fact]
    public void FromDict_ValidDict_CreatesClock()
    {
        var dict = new Dictionary<string, long>
        {
            ["a"] = 1,
            ["b"] = 2
        };

        var clock = VectorClock.FromDict(dict);

        Assert.Equal(1, clock.Get("a"));
        Assert.Equal(2, clock.Get("b"));
    }

    [Fact]
    public void SerializationRoundTrip_PreservesValues()
    {
        var original = new VectorClock(new Dictionary<string, long>
        {
            ["client-1"] = 5,
            ["client-2"] = 3
        });

        var dict = original.ToDict();
        var restored = VectorClock.FromDict(dict);

        Assert.Equal(original, restored);
        Assert.Equal(5, restored.Get("client-1"));
        Assert.Equal(3, restored.Get("client-2"));
    }

    [Fact]
    public void ToString_EmptyClock_ReturnsEmptyString()
    {
        var clock = new VectorClock();

        var str = clock.ToString();

        Assert.Equal("VectorClock {}", str);
    }

    [Fact]
    public void ToString_WithEntries_ReturnsFormattedString()
    {
        var clock = new VectorClock(new Dictionary<string, long>
        {
            ["a"] = 1,
            ["b"] = 2
        });

        var str = clock.ToString();

        Assert.Contains("a: 1", str);
        Assert.Contains("b: 2", str);
    }

    // Property-based tests (TLA+ properties)

    [Fact]
    public void Property_MergeCorrectness_MergedClockDominatesBoth()
    {
        // Property from TLA+: merged clock should be >= both inputs
        var clock1 = new VectorClock(new Dictionary<string, long> { ["a"] = 1 });
        var clock2 = new VectorClock(new Dictionary<string, long> { ["b"] = 1 });

        var merged = clock1.Merge(clock2);

        Assert.False(merged.HappensBefore(clock1));
        Assert.False(merged.HappensBefore(clock2));
    }

    [Fact]
    public void Property_Transitivity_HappensBeforeIsTransitive()
    {
        // If A→B and B→C, then A→C
        var clockA = new VectorClock(new Dictionary<string, long> { ["x"] = 1 });
        var clockB = new VectorClock(new Dictionary<string, long> { ["x"] = 2 });
        var clockC = new VectorClock(new Dictionary<string, long> { ["x"] = 3 });

        Assert.True(clockA.HappensBefore(clockB));
        Assert.True(clockB.HappensBefore(clockC));
        Assert.True(clockA.HappensBefore(clockC)); // Transitivity
    }

    [Fact]
    public void Property_Monotonicity_IncrementAlwaysIncreases()
    {
        // Property: tick never decreases clock values
        var clock = new VectorClock(new Dictionary<string, long> { ["a"] = 5 });

        var incremented = clock.Increment("a");

        Assert.True(clock.HappensBefore(incremented));
        Assert.Equal(6, incremented.Get("a"));
    }

    [Fact]
    public void Property_AntiSymmetry_NotBothHappenBefore()
    {
        // If A→B, then NOT B→A (unless A==B)
        var clock1 = new VectorClock(new Dictionary<string, long> { ["a"] = 1 });
        var clock2 = new VectorClock(new Dictionary<string, long> { ["a"] = 2 });

        if (clock1.HappensBefore(clock2))
        {
            Assert.False(clock2.HappensBefore(clock1));
        }
    }
}
