using System.Text.Json;
using SyncKit.Server.Sync;
using Xunit;

namespace SyncKit.Server.Tests.Sync;

/// <summary>
/// Dedicated LWW (Last-Writer-Wins) conflict resolution tests targeting
/// <see cref="Document.BuildState"/> and the internal ApplyDeltaToResolvedStateInternal logic.
/// Covers multi-level tiebreaking: timestamp → clock counter → clientId (lexicographic).
/// </summary>
public class LwwConflictResolutionTests
{
    #region Test 1: Later timestamp wins

    [Fact]
    public void LaterTimestamp_WinsOverEarlierTimestamp()
    {
        var doc = new Document("doc-1");

        var earlier = CreateStoredDeltaWithData("d1", "clientA", 1, timestamp: 1000,
            new { name = "Alice" });
        var later = CreateStoredDeltaWithData("d2", "clientB", 1, timestamp: 2000,
            new { name = "Bob" });

        doc.AddDelta(earlier);
        doc.AddDelta(later);

        var state = doc.BuildState();
        Assert.Equal("Bob", state["name"]);
    }

    [Fact]
    public void EarlierTimestamp_DoesNotOverwriteLater()
    {
        var doc = new Document("doc-1");

        // Add later first, then earlier — earlier should NOT win
        var later = CreateStoredDeltaWithData("d1", "clientA", 1, timestamp: 2000,
            new { name = "Alice" });
        var earlier = CreateStoredDeltaWithData("d2", "clientB", 1, timestamp: 1000,
            new { name = "Bob" });

        doc.AddDelta(later);
        doc.AddDelta(earlier);

        var state = doc.BuildState();
        Assert.Equal("Alice", state["name"]);
    }

    #endregion

    #region Test 2: Same timestamp — higher clock counter wins

    [Fact]
    public void SameTimestamp_HigherClockCounter_Wins()
    {
        var doc = new Document("doc-1");

        var lowClock = CreateStoredDeltaWithData("d1", "clientA", 1, timestamp: 1000,
            new { score = 10 });
        var highClock = CreateStoredDeltaWithData("d2", "clientA", 5, timestamp: 1000,
            new { score = 50 });

        doc.AddDelta(lowClock);
        doc.AddDelta(highClock);

        var state = doc.BuildState();
        Assert.Equal(50L, state["score"]);
    }

    [Fact]
    public void SameTimestamp_LowerClockCounter_DoesNotWin()
    {
        var doc = new Document("doc-1");

        var highClock = CreateStoredDeltaWithData("d1", "clientA", 5, timestamp: 1000,
            new { score = 50 });
        var lowClock = CreateStoredDeltaWithData("d2", "clientA", 1, timestamp: 1000,
            new { score = 10 });

        doc.AddDelta(highClock);
        doc.AddDelta(lowClock);

        var state = doc.BuildState();
        Assert.Equal(50L, state["score"]);
    }

    #endregion

    #region Test 3: Same timestamp + same clock — lexicographically higher clientId wins

    [Fact]
    public void SameTimestampAndClock_HigherClientId_Wins()
    {
        var doc = new Document("doc-1");

        var clientA = CreateStoredDeltaWithData("d1", "clientA", 1, timestamp: 1000,
            new { color = "red" });
        var clientZ = CreateStoredDeltaWithData("d2", "clientZ", 1, timestamp: 1000,
            new { color = "blue" });

        doc.AddDelta(clientA);
        doc.AddDelta(clientZ);

        var state = doc.BuildState();
        // "clientZ" > "clientA" lexicographically
        Assert.Equal("blue", state["color"]);
    }

    [Fact]
    public void SameTimestampAndClock_LowerClientId_DoesNotWin()
    {
        var doc = new Document("doc-1");

        var clientZ = CreateStoredDeltaWithData("d1", "clientZ", 1, timestamp: 1000,
            new { color = "blue" });
        var clientA = CreateStoredDeltaWithData("d2", "clientA", 1, timestamp: 1000,
            new { color = "red" });

        doc.AddDelta(clientZ);
        doc.AddDelta(clientA);

        var state = doc.BuildState();
        Assert.Equal("blue", state["color"]);
    }

    #endregion

    #region Test 4: First write to field always applies

    [Fact]
    public void FirstWrite_AlwaysApplies()
    {
        var doc = new Document("doc-1");

        var delta = CreateStoredDeltaWithData("d1", "clientA", 1, timestamp: 1000,
            new { title = "Hello World" });

        doc.AddDelta(delta);

        var state = doc.BuildState();
        Assert.Single(state);
        Assert.Equal("Hello World", state["title"]);
    }

    [Fact]
    public void FirstWrite_MultipleFields_AllApply()
    {
        var doc = new Document("doc-1");

        var delta = CreateStoredDeltaWithData("d1", "clientA", 1, timestamp: 1000,
            new { title = "Hello", count = 42, active = true });

        doc.AddDelta(delta);

        var state = doc.BuildState();
        Assert.Equal(3, state.Count);
        Assert.Equal("Hello", state["title"]);
        Assert.Equal(42L, state["count"]);
        Assert.Equal(true, state["active"]);
    }

    #endregion

    #region Test 5: Tombstone removes field from BuildState output

    [Fact]
    public void Tombstone_RemovesField_FromBuildState()
    {
        var doc = new Document("doc-1");

        var write = CreateStoredDeltaWithData("d1", "clientA", 1, timestamp: 1000,
            new { name = "Alice" });
        var tombstone = CreateStoredDeltaWithJson("d2", "clientA", 2, timestamp: 2000,
            """{"name": {"__deleted": true}}""");

        doc.AddDelta(write);
        doc.AddDelta(tombstone);

        var state = doc.BuildState();
        Assert.DoesNotContain("name", state.Keys);
    }

    [Fact]
    public void Tombstone_OnlyAffectsTargetField()
    {
        var doc = new Document("doc-1");

        var write = CreateStoredDeltaWithData("d1", "clientA", 1, timestamp: 1000,
            new { name = "Alice", age = 30 });
        var tombstone = CreateStoredDeltaWithJson("d2", "clientA", 2, timestamp: 2000,
            """{"name": {"__deleted": true}}""");

        doc.AddDelta(write);
        doc.AddDelta(tombstone);

        var state = doc.BuildState();
        Assert.DoesNotContain("name", state.Keys);
        Assert.Equal(30L, state["age"]);
    }

    #endregion

    #region Test 6: Later write overwrites tombstone (field reappears)

    [Fact]
    public void LaterWrite_OverwritesTombstone_FieldReappears()
    {
        var doc = new Document("doc-1");

        var write1 = CreateStoredDeltaWithData("d1", "clientA", 1, timestamp: 1000,
            new { name = "Alice" });
        var tombstone = CreateStoredDeltaWithJson("d2", "clientA", 2, timestamp: 2000,
            """{"name": {"__deleted": true}}""");
        var write2 = CreateStoredDeltaWithData("d3", "clientA", 3, timestamp: 3000,
            new { name = "Bob" });

        doc.AddDelta(write1);
        doc.AddDelta(tombstone);
        doc.AddDelta(write2);

        var state = doc.BuildState();
        Assert.Equal("Bob", state["name"]);
    }

    #endregion

    #region Test 7: Later tombstone overwrites write (field disappears)

    [Fact]
    public void LaterTombstone_OverwritesWrite_FieldDisappears()
    {
        var doc = new Document("doc-1");

        var write = CreateStoredDeltaWithData("d1", "clientA", 1, timestamp: 1000,
            new { status = "active" });
        var tombstone = CreateStoredDeltaWithJson("d2", "clientB", 1, timestamp: 2000,
            """{"status": {"__deleted": true}}""");

        doc.AddDelta(write);
        doc.AddDelta(tombstone);

        var state = doc.BuildState();
        Assert.DoesNotContain("status", state.Keys);
    }

    [Fact]
    public void EarlierTombstone_DoesNotOverwriteLaterWrite()
    {
        var doc = new Document("doc-1");

        var write = CreateStoredDeltaWithData("d1", "clientA", 1, timestamp: 3000,
            new { status = "active" });
        var tombstone = CreateStoredDeltaWithJson("d2", "clientB", 1, timestamp: 1000,
            """{"status": {"__deleted": true}}""");

        // Add write first, then tombstone with earlier timestamp
        doc.AddDelta(write);
        doc.AddDelta(tombstone);

        var state = doc.BuildState();
        Assert.Equal("active", state["status"]);
    }

    #endregion

    #region Test 8: Multiple fields in single delta resolved independently

    [Fact]
    public void MultipleFields_InSingleDelta_ResolvedIndependently()
    {
        var doc = new Document("doc-1");

        // First delta sets name and color
        var delta1 = CreateStoredDeltaWithData("d1", "clientA", 1, timestamp: 1000,
            new { name = "Alice", color = "red" });
        // Second delta sets name (later ts) and color (same ts, lower clock)
        var delta2 = CreateStoredDeltaWithData("d2", "clientA", 2, timestamp: 2000,
            new { name = "Bob" });
        // Third delta only updates color with a later timestamp
        var delta3 = CreateStoredDeltaWithData("d3", "clientB", 1, timestamp: 3000,
            new { color = "blue" });

        doc.AddDelta(delta1);
        doc.AddDelta(delta2);
        doc.AddDelta(delta3);

        var state = doc.BuildState();
        // name: d2 wins (ts 2000 > 1000), color: d3 wins (ts 3000 > 1000)
        Assert.Equal("Bob", state["name"]);
        Assert.Equal("blue", state["color"]);
    }

    [Fact]
    public void SingleDelta_MultipleFields_SomeTombstoned()
    {
        var doc = new Document("doc-1");

        var write = CreateStoredDeltaWithData("d1", "clientA", 1, timestamp: 1000,
            new { x = 1, y = 2, z = 3 });
        // Tombstone y and z but leave x
        var partial = CreateStoredDeltaWithJson("d2", "clientA", 2, timestamp: 2000,
            """{"y": {"__deleted": true}, "z": {"__deleted": true}}""");

        doc.AddDelta(write);
        doc.AddDelta(partial);

        var state = doc.BuildState();
        Assert.Equal(1L, state["x"]);
        Assert.DoesNotContain("y", state.Keys);
        Assert.DoesNotContain("z", state.Keys);
    }

    #endregion

    #region Test 9: Rebuild from constructor deltas matches incremental AddDelta

    [Fact]
    public void ConstructorRebuild_MatchesIncrementalAddDelta()
    {
        // Build state incrementally
        var docIncremental = new Document("doc-1");
        var deltas = new List<StoredDelta>
        {
            CreateStoredDeltaWithData("d1", "clientA", 1, timestamp: 1000,
                new { name = "Alice", score = 10 }),
            CreateStoredDeltaWithData("d2", "clientB", 1, timestamp: 1500,
                new { name = "Bob", color = "red" }),
            CreateStoredDeltaWithData("d3", "clientA", 2, timestamp: 2000,
                new { score = 99 }),
            CreateStoredDeltaWithJson("d4", "clientC", 1, timestamp: 2500,
                """{"color": {"__deleted": true}}"""),
        };

        foreach (var d in deltas)
            docIncremental.AddDelta(d);

        var stateIncremental = docIncremental.BuildState();

        // Rebuild from constructor
        var clock = new VectorClock(new Dictionary<string, long>
        {
            ["clientA"] = 2, ["clientB"] = 1, ["clientC"] = 1
        });
        var docRebuilt = new Document("doc-1", clock, deltas);
        var stateRebuilt = docRebuilt.BuildState();

        // Both should produce the same resolved state
        Assert.Equal(stateIncremental.Count, stateRebuilt.Count);
        foreach (var kvp in stateIncremental)
        {
            Assert.True(stateRebuilt.ContainsKey(kvp.Key),
                $"Rebuilt state missing key '{kvp.Key}'");
            Assert.Equal(kvp.Value, stateRebuilt[kvp.Key]);
        }
    }

    [Fact]
    public void ConstructorRebuild_WithConflicts_ResolvesIdentically()
    {
        var deltas = new List<StoredDelta>
        {
            CreateStoredDeltaWithData("d1", "clientA", 1, timestamp: 1000,
                new { field = "A" }),
            CreateStoredDeltaWithData("d2", "clientB", 1, timestamp: 1000,
                new { field = "B" }),
            CreateStoredDeltaWithData("d3", "clientC", 1, timestamp: 1000,
                new { field = "C" }),
        };

        var docIncremental = new Document("doc-1");
        foreach (var d in deltas)
            docIncremental.AddDelta(d);

        var clock = new VectorClock(new Dictionary<string, long>
        {
            ["clientA"] = 1, ["clientB"] = 1, ["clientC"] = 1
        });
        var docRebuilt = new Document("doc-1", clock, deltas);

        Assert.Equal(
            docIncremental.BuildState()["field"],
            docRebuilt.BuildState()["field"]);
    }

    #endregion

    #region Test 10: Concurrent writes from 3+ clients resolve deterministically

    [Fact]
    public void ThreeClients_SameTimestampAndClock_DeterministicResolution()
    {
        // All same timestamp and clock counter — clientId lexicographic order decides
        var deltaA = CreateStoredDeltaWithData("d1", "clientA", 1, timestamp: 1000,
            new { winner = "A" });
        var deltaB = CreateStoredDeltaWithData("d2", "clientB", 1, timestamp: 1000,
            new { winner = "B" });
        var deltaC = CreateStoredDeltaWithData("d3", "clientC", 1, timestamp: 1000,
            new { winner = "C" });

        // Try all 6 permutations — result must always be the same
        var permutations = new[]
        {
            new[] { deltaA, deltaB, deltaC },
            new[] { deltaA, deltaC, deltaB },
            new[] { deltaB, deltaA, deltaC },
            new[] { deltaB, deltaC, deltaA },
            new[] { deltaC, deltaA, deltaB },
            new[] { deltaC, deltaB, deltaA },
        };

        string? expectedWinner = null;

        foreach (var perm in permutations)
        {
            var doc = new Document("doc-1");
            foreach (var d in perm)
                doc.AddDelta(d);

            var state = doc.BuildState();
            var winner = (string)state["winner"]!;

            if (expectedWinner == null)
            {
                expectedWinner = winner;
            }
            else
            {
                Assert.Equal(expectedWinner, winner);
            }
        }

        // "clientC" should win because it's lexicographically highest
        Assert.Equal("C", expectedWinner);
    }

    [Fact]
    public void FiveClients_MixedTiebreakers_DeterministicResolution()
    {
        var deltas = new List<StoredDelta>
        {
            // ts=1000, clock=1 — lowest priority
            CreateStoredDeltaWithData("d1", "clientA", 1, timestamp: 1000,
                new { value = "A" }),
            // ts=2000, clock=1 — wins by timestamp
            CreateStoredDeltaWithData("d2", "clientB", 1, timestamp: 2000,
                new { value = "B" }),
            // ts=2000, clock=2 — wins by clock counter over B
            CreateStoredDeltaWithData("d3", "clientC", 2, timestamp: 2000,
                new { value = "C" }),
            // ts=2000, clock=2 — ties C on ts+clock, clientD > clientC lexicographically
            CreateStoredDeltaWithData("d4", "clientD", 2, timestamp: 2000,
                new { value = "D" }),
            // ts=2000, clock=2 — ties D on ts+clock, clientE > clientD lexicographically
            CreateStoredDeltaWithData("d5", "clientE", 2, timestamp: 2000,
                new { value = "E" }),
        };

        // Try forward and reverse ordering
        var doc1 = new Document("doc-1");
        foreach (var d in deltas) doc1.AddDelta(d);

        var doc2 = new Document("doc-2");
        foreach (var d in deltas.AsEnumerable().Reverse()) doc2.AddDelta(d);

        var state1 = doc1.BuildState();
        var state2 = doc2.BuildState();

        Assert.Equal(state1["value"], state2["value"]);
        // clientE wins: ts=2000 (tied), clock=2 (tied), "clientE" > all others
        Assert.Equal("E", state1["value"]);
    }

    [Fact]
    public void ConcurrentWrites_MultipleFields_EachFieldResolvedIndependently()
    {
        var doc = new Document("doc-1");

        // clientA wins "name" (later timestamp), clientB wins "color" (later timestamp)
        doc.AddDelta(CreateStoredDeltaWithData("d1", "clientA", 1, timestamp: 2000,
            new { name = "Alice" }));
        doc.AddDelta(CreateStoredDeltaWithData("d2", "clientB", 1, timestamp: 1000,
            new { name = "Bob" }));
        doc.AddDelta(CreateStoredDeltaWithData("d3", "clientA", 2, timestamp: 1000,
            new { color = "red" }));
        doc.AddDelta(CreateStoredDeltaWithData("d4", "clientB", 2, timestamp: 2000,
            new { color = "blue" }));
        doc.AddDelta(CreateStoredDeltaWithData("d5", "clientC", 1, timestamp: 3000,
            new { status = "online" }));

        var state = doc.BuildState();
        Assert.Equal("Alice", state["name"]);
        Assert.Equal("blue", state["color"]);
        Assert.Equal("online", state["status"]);
    }

    #endregion

    #region Helper Methods

    /// <summary>
    /// Creates a StoredDelta with actual JSON field data from an anonymous object.
    /// </summary>
    private static StoredDelta CreateStoredDeltaWithData(
        string id, string clientId, long clockValue, long timestamp, object fieldData)
    {
        var json = JsonSerializer.Serialize(fieldData);
        return CreateStoredDeltaWithJson(id, clientId, clockValue, timestamp, json);
    }

    /// <summary>
    /// Creates a StoredDelta from a raw JSON string (useful for tombstones).
    /// </summary>
    private static StoredDelta CreateStoredDeltaWithJson(
        string id, string clientId, long clockValue, long timestamp, string json)
    {
        var clock = new VectorClock(new Dictionary<string, long> { [clientId] = clockValue });
        return new StoredDelta
        {
            Id = id,
            ClientId = clientId,
            Timestamp = timestamp,
            Data = JsonDocument.Parse(json).RootElement,
            VectorClock = clock
        };
    }

    #endregion
}
