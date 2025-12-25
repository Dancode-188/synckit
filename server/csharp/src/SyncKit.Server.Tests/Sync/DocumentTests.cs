using System.Text.Json;
using SyncKit.Server.Sync;
using Xunit;

namespace SyncKit.Server.Tests.Sync;

/// <summary>
/// Tests for Document class - document state management with deltas and subscriptions.
/// </summary>
public class DocumentTests
{
    #region Constructor Tests

    [Fact]
    public void Constructor_EmptyDocument_CreatesWithEmptyClock()
    {
        // Act
        var doc = new Document("test-doc");

        // Assert
        Assert.Equal("test-doc", doc.Id);
        Assert.Empty(doc.VectorClock.Entries);
        Assert.Equal(0, doc.DeltaCount);
        Assert.Equal(0, doc.SubscriberCount);
        Assert.True(doc.CreatedAt <= DateTime.UtcNow);
        Assert.True(doc.UpdatedAt <= DateTime.UtcNow);
    }

    [Fact]
    public void Constructor_WithState_RestoresFromStorage()
    {
        // Arrange
        var clock = new VectorClock(new Dictionary<string, long>
        {
            ["client-1"] = 5,
            ["client-2"] = 3
        });

        var deltas = new List<StoredDelta>
        {
            CreateStoredDelta("delta-1", "client-1", 1),
            CreateStoredDelta("delta-2", "client-1", 2)
        };

        // Act
        var doc = new Document("test-doc", clock, deltas);

        // Assert
        Assert.Equal("test-doc", doc.Id);
        Assert.Equal(5, doc.VectorClock.Get("client-1"));
        Assert.Equal(3, doc.VectorClock.Get("client-2"));
        Assert.Equal(2, doc.DeltaCount);
    }

    #endregion

    #region AddDelta Tests

    [Fact]
    public void AddDelta_FirstDelta_UpdatesVectorClock()
    {
        // Arrange
        var doc = new Document("test-doc");
        var delta = CreateStoredDelta("delta-1", "client-1", 1);

        // Act
        doc.AddDelta(delta);

        // Assert
        Assert.Equal(1, doc.VectorClock.Get("client-1"));
        Assert.Equal(1, doc.DeltaCount);
    }

    [Fact]
    public void AddDelta_MultipleDeltasFromSameClient_MergesClock()
    {
        // Arrange
        var doc = new Document("test-doc");
        var delta1 = CreateStoredDelta("delta-1", "client-1", 1);
        var delta2 = CreateStoredDelta("delta-2", "client-1", 2);

        // Act
        doc.AddDelta(delta1);
        doc.AddDelta(delta2);

        // Assert
        Assert.Equal(2, doc.VectorClock.Get("client-1"));
        Assert.Equal(2, doc.DeltaCount);
    }

    [Fact]
    public void AddDelta_MultipleDeltasFromDifferentClients_MergesAllClocks()
    {
        // Arrange
        var doc = new Document("test-doc");
        var delta1 = CreateStoredDelta("delta-1", "client-1", 1);
        var delta2 = CreateStoredDelta("delta-2", "client-2", 1);
        var delta3 = CreateStoredDelta("delta-3", "client-1", 2);

        // Act
        doc.AddDelta(delta1);
        doc.AddDelta(delta2);
        doc.AddDelta(delta3);

        // Assert
        Assert.Equal(2, doc.VectorClock.Get("client-1"));
        Assert.Equal(1, doc.VectorClock.Get("client-2"));
        Assert.Equal(3, doc.DeltaCount);
    }

    [Fact]
    public void AddDelta_UpdatesTimestamp()
    {
        // Arrange
        var doc = new Document("test-doc");
        var originalUpdateTime = doc.UpdatedAt;
        Thread.Sleep(10); // Ensure time passes

        var delta = CreateStoredDelta("delta-1", "client-1", 1);

        // Act
        doc.AddDelta(delta);

        // Assert
        Assert.True(doc.UpdatedAt > originalUpdateTime);
    }

    #endregion

    #region GetDeltasSince Tests

    [Fact]
    public void GetDeltasSince_NullClock_ReturnsAllDeltas()
    {
        // Arrange
        var doc = new Document("test-doc");
        doc.AddDelta(CreateStoredDelta("delta-1", "client-1", 1));
        doc.AddDelta(CreateStoredDelta("delta-2", "client-1", 2));
        doc.AddDelta(CreateStoredDelta("delta-3", "client-2", 1));

        // Act
        var deltas = doc.GetDeltasSince(null);

        // Assert
        Assert.Equal(3, deltas.Count);
        Assert.Equal("delta-1", deltas[0].Id);
        Assert.Equal("delta-2", deltas[1].Id);
        Assert.Equal("delta-3", deltas[2].Id);
    }

    [Fact]
    public void GetDeltasSince_EmptyClock_ReturnsAllDeltas()
    {
        // Arrange
        var doc = new Document("test-doc");
        doc.AddDelta(CreateStoredDelta("delta-1", "client-1", 1));
        doc.AddDelta(CreateStoredDelta("delta-2", "client-2", 1));

        // Act
        var deltas = doc.GetDeltasSince(new VectorClock());

        // Assert
        Assert.Equal(2, deltas.Count);
    }

    [Fact]
    public void GetDeltasSince_ExactMatch_ReturnsEmpty()
    {
        // Arrange
        var doc = new Document("test-doc");
        var delta = CreateStoredDelta("delta-1", "client-1", 1);
        doc.AddDelta(delta);

        var since = new VectorClock(new Dictionary<string, long> { ["client-1"] = 1 });

        // Act
        var deltas = doc.GetDeltasSince(since);

        // Assert
        Assert.Empty(deltas);
    }

    [Fact]
    public void GetDeltasSince_ClientBehind_ReturnsNewDeltas()
    {
        // Arrange
        var doc = new Document("test-doc");
        doc.AddDelta(CreateStoredDelta("delta-1", "client-1", 1));
        doc.AddDelta(CreateStoredDelta("delta-2", "client-1", 2));
        doc.AddDelta(CreateStoredDelta("delta-3", "client-1", 3));

        var since = new VectorClock(new Dictionary<string, long> { ["client-1"] = 1 });

        // Act
        var deltas = doc.GetDeltasSince(since);

        // Assert
        Assert.Equal(2, deltas.Count);
        Assert.Equal("delta-2", deltas[0].Id);
        Assert.Equal("delta-3", deltas[1].Id);
    }

    [Fact]
    public void GetDeltasSince_MultipleClients_FiltersCorrectly()
    {
        // Arrange
        var doc = new Document("test-doc");
        doc.AddDelta(CreateStoredDelta("delta-1", "client-1", 1));
        doc.AddDelta(CreateStoredDelta("delta-2", "client-2", 1));
        doc.AddDelta(CreateStoredDelta("delta-3", "client-1", 2));

        // Client has seen client-1's first delta but nothing from client-2
        var since = new VectorClock(new Dictionary<string, long> { ["client-1"] = 1 });

        // Act
        var deltas = doc.GetDeltasSince(since);

        // Assert
        Assert.Equal(2, deltas.Count);
        Assert.Contains(deltas, d => d.Id == "delta-2");
        Assert.Contains(deltas, d => d.Id == "delta-3");
    }

    [Fact]
    public void GetDeltasSince_ClientAhead_ReturnsEmpty()
    {
        // Arrange
        var doc = new Document("test-doc");
        doc.AddDelta(CreateStoredDelta("delta-1", "client-1", 1));

        // Client thinks they're ahead (shouldn't normally happen)
        var since = new VectorClock(new Dictionary<string, long> { ["client-1"] = 5 });

        // Act
        var deltas = doc.GetDeltasSince(since);

        // Assert
        Assert.Empty(deltas);
    }

    [Fact]
    public void GetDeltasSince_ConcurrentDeltas_ReturnsAll()
    {
        // Arrange
        var doc = new Document("test-doc");
        doc.AddDelta(CreateStoredDelta("delta-1", "client-1", 1));
        doc.AddDelta(CreateStoredDelta("delta-2", "client-2", 1));

        // Client has seen from client-1 but not client-2
        var since = new VectorClock(new Dictionary<string, long> { ["client-1"] = 1 });

        // Act
        var deltas = doc.GetDeltasSince(since);

        // Assert
        Assert.Single(deltas);
        Assert.Equal("delta-2", deltas[0].Id);
    }

    #endregion

    #region Subscription Tests

    [Fact]
    public void Subscribe_FirstSubscriber_AddsConnection()
    {
        // Arrange
        var doc = new Document("test-doc");

        // Act
        doc.Subscribe("conn-1");

        // Assert
        Assert.Equal(1, doc.SubscriberCount);
        Assert.Contains("conn-1", doc.GetSubscribers());
    }

    [Fact]
    public void Subscribe_MultipleSubscribers_AddsAll()
    {
        // Arrange
        var doc = new Document("test-doc");

        // Act
        doc.Subscribe("conn-1");
        doc.Subscribe("conn-2");
        doc.Subscribe("conn-3");

        // Assert
        Assert.Equal(3, doc.SubscriberCount);
        var subscribers = doc.GetSubscribers();
        Assert.Contains("conn-1", subscribers);
        Assert.Contains("conn-2", subscribers);
        Assert.Contains("conn-3", subscribers);
    }

    [Fact]
    public void Subscribe_DuplicateConnection_OnlyAddsOnce()
    {
        // Arrange
        var doc = new Document("test-doc");

        // Act
        doc.Subscribe("conn-1");
        doc.Subscribe("conn-1");

        // Assert
        Assert.Equal(1, doc.SubscriberCount);
    }

    [Fact]
    public void Unsubscribe_ExistingSubscriber_RemovesConnection()
    {
        // Arrange
        var doc = new Document("test-doc");
        doc.Subscribe("conn-1");
        doc.Subscribe("conn-2");

        // Act
        doc.Unsubscribe("conn-1");

        // Assert
        Assert.Equal(1, doc.SubscriberCount);
        Assert.DoesNotContain("conn-1", doc.GetSubscribers());
        Assert.Contains("conn-2", doc.GetSubscribers());
    }

    [Fact]
    public void Unsubscribe_NonExistentSubscriber_NoError()
    {
        // Arrange
        var doc = new Document("test-doc");

        // Act & Assert (should not throw)
        doc.Unsubscribe("non-existent");
        Assert.Equal(0, doc.SubscriberCount);
    }

    [Fact]
    public void Unsubscribe_LastSubscriber_EmptiesSet()
    {
        // Arrange
        var doc = new Document("test-doc");
        doc.Subscribe("conn-1");

        // Act
        doc.Unsubscribe("conn-1");

        // Assert
        Assert.Equal(0, doc.SubscriberCount);
        Assert.Empty(doc.GetSubscribers());
    }

    [Fact]
    public void GetSubscribers_ReturnsReadOnlyCopy()
    {
        // Arrange
        var doc = new Document("test-doc");
        doc.Subscribe("conn-1");

        // Act
        var subscribers1 = doc.GetSubscribers();
        doc.Subscribe("conn-2");
        var subscribers2 = doc.GetSubscribers();

        // Assert - original set unchanged
        Assert.Single(subscribers1);
        Assert.Equal(2, subscribers2.Count);
    }

    #endregion

    #region Thread Safety Tests

    [Fact]
    public async Task ConcurrentAddDelta_ThreadSafe_AllDeltasAdded()
    {
        // Arrange
        var doc = new Document("test-doc");
        var tasks = new List<Task>();
        var deltaCount = 100;

        // Act - Add deltas concurrently
        for (int i = 0; i < deltaCount; i++)
        {
            var deltaId = i;
            tasks.Add(Task.Run(() =>
            {
                var delta = CreateStoredDelta($"delta-{deltaId}", "client-1", deltaId + 1);
                doc.AddDelta(delta);
            }));
        }

        await Task.WhenAll(tasks.ToArray());

        // Assert
        Assert.Equal(deltaCount, doc.DeltaCount);
    }

    [Fact]
    public async Task ConcurrentSubscribe_ThreadSafe_AllSubscribersAdded()
    {
        // Arrange
        var doc = new Document("test-doc");
        var tasks = new List<Task>();
        var subscriberCount = 50;

        // Act - Subscribe concurrently
        for (int i = 0; i < subscriberCount; i++)
        {
            var connId = i;
            tasks.Add(Task.Run(() =>
            {
                doc.Subscribe($"conn-{connId}");
            }));
        }

        await Task.WhenAll(tasks.ToArray());

        // Assert
        Assert.Equal(subscriberCount, doc.SubscriberCount);
    }

    [Fact]
    public async Task ConcurrentSubscribeUnsubscribe_ThreadSafe_ConsistentState()
    {
        // Arrange
        var doc = new Document("test-doc");
        var tasks = new List<Task>();

        // Act - Mix subscribes and unsubscribes
        for (int i = 0; i < 50; i++)
        {
            var connId = i;
            tasks.Add(Task.Run(() => doc.Subscribe($"conn-{connId}")));

            if (i % 2 == 0)
            {
                tasks.Add(Task.Run(() => doc.Unsubscribe($"conn-{connId}")));
            }
        }

        await Task.WhenAll(tasks.ToArray());

        // Assert - Should have roughly half subscribed
        Assert.True(doc.SubscriberCount >= 20 && doc.SubscriberCount <= 30);
    }

    [Fact]
    public async Task ConcurrentGetDeltasSince_ThreadSafe_ReturnsConsistentResults()
    {
        // Arrange
        var doc = new Document("test-doc");
        for (int i = 1; i <= 10; i++)
        {
            doc.AddDelta(CreateStoredDelta($"delta-{i}", "client-1", i));
        }

        var since = new VectorClock(new Dictionary<string, long> { ["client-1"] = 5 });
        var tasks = new List<Task<int>>();

        // Act - Read deltas concurrently while adding more
        for (int i = 0; i < 20; i++)
        {
            tasks.Add(Task.Run(() => doc.GetDeltasSince(since).Count));

            if (i % 5 == 0)
            {
                var newDelta = i + 11;
                _ = Task.Run(() => doc.AddDelta(CreateStoredDelta($"delta-{newDelta}", "client-1", newDelta)));
            }
        }

        await Task.WhenAll(tasks.ToArray());

        // Assert - All reads should complete without error
        Assert.All(tasks, t => Assert.True(t.Result >= 5));
    }

    #endregion

    #region Helper Methods

    private static StoredDelta CreateStoredDelta(string id, string clientId, long clockValue)
    {
        var clock = new VectorClock(new Dictionary<string, long> { [clientId] = clockValue });

        return new StoredDelta
        {
            Id = id,
            ClientId = clientId,
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Data = JsonDocument.Parse("{}").RootElement,
            VectorClock = clock
        };
    }

    #endregion
}
