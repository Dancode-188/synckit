using System.Text.Json;
using Microsoft.Extensions.Logging;
using Moq;
using SyncKit.Server.Sync;
using Xunit;

namespace SyncKit.Server.Tests.Sync;

/// <summary>
/// Tests for InMemoryDocumentStore implementation.
/// </summary>
public class InMemoryDocumentStoreTests
{
    private readonly Mock<ILogger<InMemoryDocumentStore>> _mockLogger;
    private readonly InMemoryDocumentStore _store;

    public InMemoryDocumentStoreTests()
    {
        _mockLogger = new Mock<ILogger<InMemoryDocumentStore>>();
        _store = new InMemoryDocumentStore(_mockLogger.Object);
    }

    #region GetOrCreateAsync Tests

    [Fact]
    public async Task GetOrCreateAsync_NewDocument_CreatesDocument()
    {
        // Arrange
        var docId = "test-doc";

        // Act
        var doc = await _store.GetOrCreateAsync(docId);

        // Assert
        Assert.NotNull(doc);
        Assert.Equal(docId, doc.Id);
        Assert.Equal(0, doc.DeltaCount);
        Assert.Equal(0, doc.SubscriberCount);
    }

    [Fact]
    public async Task GetOrCreateAsync_ExistingDocument_ReturnsExisting()
    {
        // Arrange
        var docId = "test-doc";
        var first = await _store.GetOrCreateAsync(docId);

        // Act
        var second = await _store.GetOrCreateAsync(docId);

        // Assert
        Assert.Same(first, second);
    }

    [Fact]
    public async Task GetOrCreateAsync_MultipleDocuments_CreatesSeparately()
    {
        // Arrange
        var docId1 = "doc-1";
        var docId2 = "doc-2";

        // Act
        var doc1 = await _store.GetOrCreateAsync(docId1);
        var doc2 = await _store.GetOrCreateAsync(docId2);

        // Assert
        Assert.NotSame(doc1, doc2);
        Assert.Equal(docId1, doc1.Id);
        Assert.Equal(docId2, doc2.Id);
    }

    #endregion

    #region GetAsync Tests

    [Fact]
    public async Task GetAsync_NonExistentDocument_ReturnsNull()
    {
        // Arrange
        var docId = "non-existent";

        // Act
        var doc = await _store.GetAsync(docId);

        // Assert
        Assert.Null(doc);
    }

    [Fact]
    public async Task GetAsync_ExistingDocument_ReturnsDocument()
    {
        // Arrange
        var docId = "test-doc";
        var created = await _store.GetOrCreateAsync(docId);

        // Act
        var retrieved = await _store.GetAsync(docId);

        // Assert
        Assert.NotNull(retrieved);
        Assert.Same(created, retrieved);
    }

    #endregion

    #region ExistsAsync Tests

    [Fact]
    public async Task ExistsAsync_NonExistentDocument_ReturnsFalse()
    {
        // Arrange
        var docId = "non-existent";

        // Act
        var exists = await _store.ExistsAsync(docId);

        // Assert
        Assert.False(exists);
    }

    [Fact]
    public async Task ExistsAsync_ExistingDocument_ReturnsTrue()
    {
        // Arrange
        var docId = "test-doc";
        await _store.GetOrCreateAsync(docId);

        // Act
        var exists = await _store.ExistsAsync(docId);

        // Assert
        Assert.True(exists);
    }

    #endregion

    #region DeleteAsync Tests

    [Fact]
    public async Task DeleteAsync_ExistingDocument_RemovesDocument()
    {
        // Arrange
        var docId = "test-doc";
        await _store.GetOrCreateAsync(docId);

        // Act
        await _store.DeleteAsync(docId);

        // Assert
        var exists = await _store.ExistsAsync(docId);
        Assert.False(exists);

        var doc = await _store.GetAsync(docId);
        Assert.Null(doc);
    }

    [Fact]
    public async Task DeleteAsync_NonExistentDocument_NoError()
    {
        // Arrange
        var docId = "non-existent";

        // Act & Assert (should not throw)
        await _store.DeleteAsync(docId);
    }

    [Fact]
    public async Task DeleteAsync_DocumentWithDeltas_RemovesEverything()
    {
        // Arrange
        var docId = "test-doc";
        var delta = CreateTestDelta("delta-1", "client-1");
        await _store.AddDeltaAsync(docId, delta);

        // Act
        await _store.DeleteAsync(docId);

        // Assert
        var deltas = await _store.GetDeltasSinceAsync(docId, null);
        Assert.Empty(deltas);
    }

    #endregion

    #region GetDocumentIdsAsync Tests

    [Fact]
    public async Task GetDocumentIdsAsync_NoDocuments_ReturnsEmpty()
    {
        // Act
        var ids = await _store.GetDocumentIdsAsync();

        // Assert
        Assert.Empty(ids);
    }

    [Fact]
    public async Task GetDocumentIdsAsync_MultipleDocuments_ReturnsAllIds()
    {
        // Arrange
        await _store.GetOrCreateAsync("doc-1");
        await _store.GetOrCreateAsync("doc-2");
        await _store.GetOrCreateAsync("doc-3");

        // Act
        var ids = await _store.GetDocumentIdsAsync();

        // Assert
        Assert.Equal(3, ids.Count);
        Assert.Contains("doc-1", ids);
        Assert.Contains("doc-2", ids);
        Assert.Contains("doc-3", ids);
    }

    [Fact]
    public async Task GetDocumentIdsAsync_AfterDeletion_ExcludesDeleted()
    {
        // Arrange
        await _store.GetOrCreateAsync("doc-1");
        await _store.GetOrCreateAsync("doc-2");
        await _store.DeleteAsync("doc-1");

        // Act
        var ids = await _store.GetDocumentIdsAsync();

        // Assert
        Assert.Single(ids);
        Assert.Contains("doc-2", ids);
        Assert.DoesNotContain("doc-1", ids);
    }

    #endregion

    #region AddDeltaAsync Tests

    [Fact]
    public async Task AddDeltaAsync_NonExistentDocument_CreatesAndAddsDelta()
    {
        // Arrange
        var docId = "test-doc";
        var delta = CreateTestDelta("delta-1", "client-1");

        // Act
        await _store.AddDeltaAsync(docId, delta);

        // Assert
        var doc = await _store.GetAsync(docId);
        Assert.NotNull(doc);
        Assert.Equal(1, doc.DeltaCount);
    }

    [Fact]
    public async Task AddDeltaAsync_ExistingDocument_AddsDelta()
    {
        // Arrange
        var docId = "test-doc";
        await _store.GetOrCreateAsync(docId);
        var delta = CreateTestDelta("delta-1", "client-1");

        // Act
        await _store.AddDeltaAsync(docId, delta);

        // Assert
        var doc = await _store.GetAsync(docId);
        Assert.NotNull(doc);
        Assert.Equal(1, doc.DeltaCount);
    }

    [Fact]
    public async Task AddDeltaAsync_MultipleDeltas_AddsAll()
    {
        // Arrange
        var docId = "test-doc";
        var delta1 = CreateTestDelta("delta-1", "client-1", 1);
        var delta2 = CreateTestDelta("delta-2", "client-1", 2);
        var delta3 = CreateTestDelta("delta-3", "client-2", 1);

        // Act
        await _store.AddDeltaAsync(docId, delta1);
        await _store.AddDeltaAsync(docId, delta2);
        await _store.AddDeltaAsync(docId, delta3);

        // Assert
        var doc = await _store.GetAsync(docId);
        Assert.NotNull(doc);
        Assert.Equal(3, doc.DeltaCount);
    }

    [Fact]
    public async Task AddDeltaAsync_UpdatesVectorClock()
    {
        // Arrange
        var docId = "test-doc";
        var delta1 = CreateTestDelta("delta-1", "client-1", 1);
        var delta2 = CreateTestDelta("delta-2", "client-2", 1);

        // Act
        await _store.AddDeltaAsync(docId, delta1);
        await _store.AddDeltaAsync(docId, delta2);

        // Assert
        var doc = await _store.GetAsync(docId);
        Assert.NotNull(doc);
        Assert.Equal(1, doc.VectorClock.Get("client-1"));
        Assert.Equal(1, doc.VectorClock.Get("client-2"));
    }

    #endregion

    #region GetDeltasSinceAsync Tests

    [Fact]
    public async Task GetDeltasSinceAsync_NonExistentDocument_ReturnsEmpty()
    {
        // Arrange
        var docId = "non-existent";

        // Act
        var deltas = await _store.GetDeltasSinceAsync(docId, null);

        // Assert
        Assert.Empty(deltas);
    }

    [Fact]
    public async Task GetDeltasSinceAsync_NoDeltas_ReturnsEmpty()
    {
        // Arrange
        var docId = "test-doc";
        await _store.GetOrCreateAsync(docId);

        // Act
        var deltas = await _store.GetDeltasSinceAsync(docId, null);

        // Assert
        Assert.Empty(deltas);
    }

    [Fact]
    public async Task GetDeltasSinceAsync_NullSince_ReturnsAllDeltas()
    {
        // Arrange
        var docId = "test-doc";
        var delta1 = CreateTestDelta("delta-1", "client-1", 1);
        var delta2 = CreateTestDelta("delta-2", "client-1", 2);
        var delta3 = CreateTestDelta("delta-3", "client-2", 1);

        await _store.AddDeltaAsync(docId, delta1);
        await _store.AddDeltaAsync(docId, delta2);
        await _store.AddDeltaAsync(docId, delta3);

        // Act
        var deltas = await _store.GetDeltasSinceAsync(docId, null);

        // Assert
        Assert.Equal(3, deltas.Count);
    }

    [Fact]
    public async Task GetDeltasSinceAsync_WithSince_FiltersCorrectly()
    {
        // Arrange
        var docId = "test-doc";
        var delta1 = CreateTestDelta("delta-1", "client-1", 1);
        var delta2 = CreateTestDelta("delta-2", "client-1", 2);
        var delta3 = CreateTestDelta("delta-3", "client-2", 1);

        await _store.AddDeltaAsync(docId, delta1);
        await _store.AddDeltaAsync(docId, delta2);
        await _store.AddDeltaAsync(docId, delta3);

        var since = new VectorClock(new Dictionary<string, long>
        {
            ["client-1"] = 1
        });

        // Act
        var deltas = await _store.GetDeltasSinceAsync(docId, since);

        // Assert
        Assert.Equal(2, deltas.Count);
        Assert.Contains(deltas, d => d.Id == "delta-2");
        Assert.Contains(deltas, d => d.Id == "delta-3");
    }

    [Fact]
    public async Task GetDeltasSinceAsync_CurrentState_ReturnsEmpty()
    {
        // Arrange
        var docId = "test-doc";
        var delta = CreateTestDelta("delta-1", "client-1", 1);
        await _store.AddDeltaAsync(docId, delta);

        var doc = await _store.GetAsync(docId);
        var currentClock = doc!.VectorClock;

        // Act
        var deltas = await _store.GetDeltasSinceAsync(docId, currentClock);

        // Assert
        Assert.Empty(deltas);
    }

    #endregion

    #region GetStats Tests

    [Fact]
    public void GetStats_EmptyStore_ReturnsZeros()
    {
        // Act
        var stats = _store.GetStats();

        // Assert
        Assert.Equal(0, stats.DocumentCount);
        Assert.Equal(0, stats.TotalDeltas);
        Assert.Equal(0, stats.TotalSubscribers);
    }

    [Fact]
    public async Task GetStats_WithDocuments_ReturnsAccurateStats()
    {
        // Arrange
        await _store.GetOrCreateAsync("doc-1");
        await _store.GetOrCreateAsync("doc-2");

        var delta1 = CreateTestDelta("delta-1", "client-1", 1);
        var delta2 = CreateTestDelta("delta-2", "client-1", 2);
        await _store.AddDeltaAsync("doc-1", delta1);
        await _store.AddDeltaAsync("doc-1", delta2);

        var doc1 = await _store.GetAsync("doc-1");
        doc1!.Subscribe("conn-1");
        doc1.Subscribe("conn-2");

        var doc2 = await _store.GetAsync("doc-2");
        doc2!.Subscribe("conn-3");

        // Act
        var stats = _store.GetStats();

        // Assert
        Assert.Equal(2, stats.DocumentCount);
        Assert.Equal(2, stats.TotalDeltas);
        Assert.Equal(3, stats.TotalSubscribers);
    }

    #endregion

    #region Concurrent Access Tests

    [Fact]
    public async Task ConcurrentAccess_MultipleThreads_Threadsafe()
    {
        // Arrange
        var docId = "test-doc";
        var tasks = new List<Task>();
        var clientCount = 10;
        var deltasPerClient = 5;

        // Act - Multiple threads adding deltas concurrently
        for (int i = 0; i < clientCount; i++)
        {
            var clientId = $"client-{i}";
            tasks.Add(Task.Run(async () =>
            {
                for (int j = 1; j <= deltasPerClient; j++)
                {
                    var delta = CreateTestDelta($"{clientId}-delta-{j}", clientId, j);
                    await _store.AddDeltaAsync(docId, delta);
                }
            }));
        }

        await Task.WhenAll(tasks);

        // Assert
        var doc = await _store.GetAsync(docId);
        Assert.NotNull(doc);
        Assert.Equal(clientCount * deltasPerClient, doc.DeltaCount);

        // Verify all client clocks are correct
        for (int i = 0; i < clientCount; i++)
        {
            var clientId = $"client-{i}";
            Assert.Equal(deltasPerClient, doc.VectorClock.Get(clientId));
        }
    }

    [Fact]
    public async Task ConcurrentAccess_GetOrCreate_CreatesSingleInstance()
    {
        // Arrange
        var docId = "test-doc";
        var tasks = new List<Task<Document>>();
        var threadCount = 100;

        // Act - Multiple threads trying to get/create the same document
        for (int i = 0; i < threadCount; i++)
        {
            tasks.Add(_store.GetOrCreateAsync(docId));
        }

        var documents = await Task.WhenAll(tasks);

        // Assert - All threads should get the same instance
        var firstDoc = documents[0];
        Assert.All(documents, doc => Assert.Same(firstDoc, doc));
    }

    #endregion

    #region Helper Methods

    private static StoredDelta CreateTestDelta(
        string id,
        string clientId,
        long clockValue = 1)
    {
        var vectorClock = new VectorClock(new Dictionary<string, long>
        {
            [clientId] = clockValue
        });

        return new StoredDelta
        {
            Id = id,
            ClientId = clientId,
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Data = JsonDocument.Parse("{}").RootElement,
            VectorClock = vectorClock
        };
    }

    #endregion
}
