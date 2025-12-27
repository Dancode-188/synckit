using System.Text.Json;
using Microsoft.Extensions.Logging;
using Moq;
using SyncKit.Server.Sync;
using Xunit;

namespace SyncKit.Server.Tests.Sync;

/// <summary>
/// Tests for InMemoryStorageAdapter implementation.
/// </summary>
public class InMemoryStorageAdapterTests
{
    private readonly Mock<ILogger> _mockLogger;
    private readonly InMemoryStorageAdapter _store;

    public InMemoryStorageAdapterTests()
    {
        _mockLogger = new Mock<ILogger>();
        _store = new InMemoryStorageAdapter(_mockLogger.Object);
    }

    #region SaveDocument Tests

    [Fact]
    public async Task SaveAndGetDocument_ShouldCreateAndRetrieveDocument()
    {
        // Arrange
        var docId = "test-doc";

        // Pre-condition: document should not exist
        var before = await _store.GetDocumentAsync(docId);
        Assert.Null(before);

        // Act - create document
        await _store.SaveDocumentAsync(docId, JsonDocument.Parse("{}").RootElement);

        // Assert - now document state should be retrievable
        var ds = await _store.GetDocumentAsync(docId);
        Assert.NotNull(ds);
        Assert.Equal(docId, ds!.Id);
    }

    [Fact]
    public async Task SaveDocumentAsync_ExistingDocument_ReturnsState()
    {
        // Arrange
        var docId = "test-doc";
        await _store.SaveDocumentAsync(docId, JsonDocument.Parse("{}").RootElement);

        // Act
        var second = await _store.GetDocumentAsync(docId);

        // Assert
        Assert.NotNull(second);
        Assert.Equal(docId, second!.Id);
    }

    [Fact]
    public async Task SaveDocumentAsync_MultipleDocuments_CreatesSeparately()
    {
        // Arrange
        var docId1 = "doc-1";
        var docId2 = "doc-2";

        // Act
        await _store.SaveDocumentAsync(docId1, JsonDocument.Parse("{}").RootElement);
        await _store.SaveDocumentAsync(docId2, JsonDocument.Parse("{}").RootElement);

        var d1 = await _store.GetDocumentAsync(docId1);
        var d2 = await _store.GetDocumentAsync(docId2);

        // Assert
        Assert.NotNull(d1);
        Assert.NotNull(d2);
        Assert.Equal(docId1, d1!.Id);
        Assert.Equal(docId2, d2!.Id);
    }

    #endregion

    #region GetAsync Tests

    [Fact]
    public async Task GetDocumentAsync_NonExistentDocument_ReturnsNull()
    {
        // Arrange
        var docId = "non-existent";

        // Act
        var ds = await _store.GetDocumentAsync(docId);

        // Assert
        Assert.Null(ds);
    }

    [Fact]
    public async Task GetDocumentAsync_ExistingDocument_ReturnsDocument()
    {
        // Arrange
        var docId = "test-doc";
        await _store.SaveDocumentAsync(docId, JsonDocument.Parse("{}").RootElement);

        // Act
        var retrieved = await _store.GetDocumentAsync(docId);

        // Assert
        Assert.NotNull(retrieved);
        Assert.Equal(docId, retrieved!.Id);
    }

    #endregion

    #region Existence Tests

    [Fact]
    public async Task DocumentExistence_NonExistentDocument_ReturnsFalse()
    {
        // Arrange
        var docId = "non-existent";

        // Act
        var exists = (await _store.GetDocumentAsync(docId)) != null;

        // Assert
        Assert.False(exists);
    }

    [Fact]
    public async Task DocumentExistence_ExistingDocument_ReturnsTrue()
    {
        // Arrange
        var docId = "test-doc";
        await _store.SaveDocumentAsync(docId, JsonDocument.Parse("{}").RootElement);

        // Act
        var exists = (await _store.GetDocumentAsync(docId)) != null;

        // Assert
        Assert.True(exists);
    }

    #endregion

    #region Delete Tests

    [Fact]
    public async Task DeleteDocument_ExistingDocument_RemovesDocument()
    {
        // Arrange
        var docId = "test-doc";
        await _store.SaveDocumentAsync(docId, JsonDocument.Parse("{}").RootElement);

        // Act
        var removed = await _store.DeleteDocumentAsync(docId);

        // Assert - Document should no longer exist
        Assert.True(removed);
        var doc = await _store.GetDocumentAsync(docId);
        Assert.Null(doc);
    }

    [Fact]
    public async Task DeleteDocument_NonExistentDocument_NoError()
    {
        // Arrange
        var docId = "non-existent";

        // Act
        var removed = await _store.DeleteDocumentAsync(docId);

        // Assert - should return false and not throw
        Assert.False(removed);
    }

    [Fact]
    public async Task DeleteDocument_DocumentWithDeltas_RemovesEverything()
    {
        // Arrange
        var docId = "test-doc";
        var delta = CreateTestDelta("delta-1", "client-1");
        await _store.SaveDeltaAsync(delta with { DocumentId = docId });

        // Act
        var removed = await _store.DeleteDocumentAsync(docId);

        // Assert
        Assert.True(removed);
        var deltas = await _store.GetDeltasAsync(docId);
        Assert.Empty(deltas);
    }

    #endregion

    #region Document Listing Tests

    [Fact]
    public async Task ListDocuments_NoDocuments_ReturnsEmpty()
    {
        // Act
        var docs = await _store.ListDocumentsAsync();
        var ids = docs.Select(d => d.Id).ToList();

        // Assert
        Assert.Empty(ids);
    }

    [Fact]
    public async Task ListDocuments_MultipleDocuments_ReturnsAllIds()
    {
        // Arrange
        await _store.SaveDocumentAsync("doc-1", JsonDocument.Parse("{}").RootElement);
        await _store.SaveDocumentAsync("doc-2", JsonDocument.Parse("{}").RootElement);
        await _store.SaveDocumentAsync("doc-3", JsonDocument.Parse("{}").RootElement);

        // Act
        var docs = await _store.ListDocumentsAsync();
        var ids = docs.Select(d => d.Id).ToList();

        // Assert
        Assert.Equal(3, ids.Count);
        Assert.Contains("doc-1", ids);
        Assert.Contains("doc-2", ids);
        Assert.Contains("doc-3", ids);
    }

    [Fact]
    public async Task ListDocuments_AfterDeletion_ExcludesDeleted()
    {
        // Arrange
        await _store.SaveDocumentAsync("doc-1", JsonDocument.Parse("{}").RootElement);
        await _store.SaveDocumentAsync("doc-2", JsonDocument.Parse("{}").RootElement);
        await _store.DeleteDocumentAsync("doc-1");

        // Act
        var docs = await _store.ListDocumentsAsync();
        var ids = docs.Select(d => d.Id).ToList();

        // Assert
        Assert.Single(ids);
        Assert.Contains("doc-2", ids);
        Assert.DoesNotContain("doc-1", ids);
    }

    #endregion

    #region Delta Tests

    [Fact]
    public async Task SaveDeltaAsync_NonExistentDocument_CreatesAndAddsDelta()
    {
        // Arrange
        var docId = "test-doc";
        var delta = CreateTestDelta("delta-1", "client-1");

        // Act
        await _store.SaveDeltaAsync(delta with { DocumentId = docId });

        // Assert - Verify that a delta was saved
        var deltas = await _store.GetDeltasAsync(docId);
        Assert.Equal(1, deltas.Count);
    }

    [Fact]
    public async Task SaveDeltaAsync_ExistingDocument_AddsDelta()
    {
        // Arrange
        var docId = "test-doc";
        await _store.SaveDocumentAsync(docId, JsonDocument.Parse("{}").RootElement);
        var delta = CreateTestDelta("delta-1", "client-1");

        // Act
        await _store.SaveDeltaAsync(delta with { DocumentId = docId });

        // Assert - Verify that a delta was saved
        var deltas = await _store.GetDeltasAsync(docId);
        Assert.Equal(1, deltas.Count);
    }

    [Fact]
    public async Task SaveDeltaAsync_MultipleDeltas_AddsAll()
    {
        // Arrange
        var docId = "test-doc";
        var delta1 = CreateTestDelta("delta-1", "client-1", 1);
        var delta2 = CreateTestDelta("delta-2", "client-1", 2);
        var delta3 = CreateTestDelta("delta-3", "client-2", 1);

        // Act - Save all deltas
        await _store.SaveDeltaAsync(delta1 with { DocumentId = docId });
        await _store.SaveDeltaAsync(delta2 with { DocumentId = docId });
        await _store.SaveDeltaAsync(delta3 with { DocumentId = docId });

        // Assert - All deltas should be present
        var deltas = await _store.GetDeltasAsync(docId);
        Assert.Equal(3, deltas.Count);
    }

    [Fact]
    public async Task SaveDeltaAsync_UpdatesVectorClock()
    {
        // Arrange
        var docId = "test-doc";
        var delta1 = CreateTestDelta("delta-1", "client-1", 1);
        var delta2 = CreateTestDelta("delta-2", "client-2", 1);

        // Act - Save both deltas
        await _store.SaveDeltaAsync(delta1 with { DocumentId = docId });
        await _store.SaveDeltaAsync(delta2 with { DocumentId = docId });

        // Assert - Vector clock should reflect both clients
        var vc = await _store.GetVectorClockAsync(docId);
        Assert.Equal(1L, vc["client-1"]);
        Assert.Equal(1L, vc["client-2"]);
    }

    #endregion

    #region GetDeltasSince (VectorClock-based) Tests

    [Fact]
    public async Task GetDeltasSince_NonExistentDocument_ReturnsEmpty()
    {
        // Arrange
        var docId = "non-existent";

        // Act
        var deltas = await _store.GetDeltasSinceViaAdapterAsync(docId, null);

        // Assert
        Assert.Empty(deltas);
    }

    [Fact]
    public async Task GetDeltasSince_NoDeltas_ReturnsEmpty()
    {
        // Arrange
        var docId = "test-doc";
        await _store.SaveDocumentAsync(docId, JsonDocument.Parse("{}").RootElement);

        // Act
        var deltas = await _store.GetDeltasSinceViaAdapterAsync(docId, null);

        // Assert
        Assert.Empty(deltas);
    }

    [Fact]
    public async Task GetDeltasSince_NullSince_ReturnsAllDeltas()
    {
        // Arrange
        var docId = "test-doc";
        var delta1 = CreateTestDelta("delta-1", "client-1", 1);
        var delta2 = CreateTestDelta("delta-2", "client-1", 2);
        var delta3 = CreateTestDelta("delta-3", "client-2", 1);

        await _store.SaveDeltaAsync(delta1 with { DocumentId = docId });
        await _store.SaveDeltaAsync(delta2 with { DocumentId = docId });
        await _store.SaveDeltaAsync(delta3 with { DocumentId = docId });

        // Act
        var deltas = await _store.GetDeltasSinceViaAdapterAsync(docId, null);

        // Assert
        Assert.Equal(3, deltas.Count);
    }

    [Fact]
    public async Task GetDeltasSince_WithSince_FiltersCorrectly()
    {
        // Arrange
        var docId = "test-doc";
        var delta1 = CreateTestDelta("delta-1", "client-1", 1);
        var delta2 = CreateTestDelta("delta-2", "client-1", 2);
        var delta3 = CreateTestDelta("delta-3", "client-2", 1);

        await _store.SaveDeltaAsync(delta1 with { DocumentId = docId });
        await _store.SaveDeltaAsync(delta2 with { DocumentId = docId });
        await _store.SaveDeltaAsync(delta3 with { DocumentId = docId });

        var since = new VectorClock(new Dictionary<string, long>
        {
            ["client-1"] = 1
        });

        // Act
        var deltas = await _store.GetDeltasSinceViaAdapterAsync(docId, since);

        // Assert
        Assert.Equal(2, deltas.Count);
        Assert.Contains(deltas, d => d.Id == "delta-2");
        Assert.Contains(deltas, d => d.Id == "delta-3");
    }

    [Fact]
    public async Task GetDeltasSince_CurrentState_ReturnsEmpty()
    {
        // Arrange
        var docId = "test-doc";
        var delta = CreateTestDelta("delta-1", "client-1", 1);
        await _store.SaveDeltaAsync(delta with { DocumentId = docId });

        var currentClock = await _store.GetVectorClockAsync(docId);

        // Act
        var deltas = await _store.GetDeltasSinceViaAdapterAsync(docId, VectorClock.FromDict(currentClock));

        // Assert
        Assert.Empty(deltas);
    }

    #endregion

    #region Document listing and delta summary

    [Fact]
    public async Task ListDocumentsAndDeltas_ShouldReportCounts()
    {
        // Arrange - create two documents
        await _store.SaveDocumentAsync("doc-1", JsonDocument.Parse("{}").RootElement);
        await _store.SaveDocumentAsync("doc-2", JsonDocument.Parse("{}").RootElement);

        var delta1 = CreateTestDelta("delta-1", "client-1", 1);
        var delta2 = CreateTestDelta("delta-2", "client-1", 2);
        await _store.SaveDeltaAsync(delta1 with { DocumentId = "doc-1" });
        await _store.SaveDeltaAsync(delta2 with { DocumentId = "doc-1" });

        // Act
        var docs = await _store.ListDocumentsAsync();
        var deltas = await _store.GetDeltasAsync("doc-1");

        // Assert
        Assert.Equal(2, docs.Count);
        Assert.Equal(2, deltas.Count);
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
                    await _store.SaveDeltaAsync(delta with { DocumentId = docId });
                }
            }));
        }

        await Task.WhenAll(tasks);

        // Assert - Verify total deltas
        var deltas = await _store.GetDeltasAsync(docId);
        Assert.Equal(clientCount * deltasPerClient, deltas.Count);

        // Verify all client clocks are correct
        var vc = await _store.GetVectorClockAsync(docId);
        for (int i = 0; i < clientCount; i++)
        {
            var clientId = $"client-{i}";
            Assert.Equal(deltasPerClient, vc[clientId]);
        }
    }

    [Fact]
    public async Task ConcurrentAccess_GetOrCreate_CreatesSingleInstance()
    {
        // Arrange
        var docId = "test-doc";
        var tasks = new List<Task<Document>>();
        var threadCount = 100;

        // Act - Multiple threads trying to save the same document concurrently
        for (int i = 0; i < threadCount; i++)
        {
            tasks.Add(_store.SaveDocumentAsync(docId, JsonDocument.Parse("{}").RootElement));
        }

        await Task.WhenAll(tasks);

        // Assert - The document should exist and only one entry should be listed
        var docs = await _store.ListDocumentsAsync();
        Assert.Single(docs.Where(d => d.Id == docId));
    }

    #endregion

    #region Helper Methods

    private static Storage.DeltaEntry CreateTestDelta(
        string id,
        string clientId,
        long clockValue = 1)
    {
        var vc = new Dictionary<string, long> { [clientId] = clockValue };

        return new Storage.DeltaEntry
        {
            Id = id,
            DocumentId = string.Empty, // caller will set DocumentId when needed
            ClientId = clientId,
            OperationType = "set",
            FieldPath = string.Empty,
            Value = JsonDocument.Parse("{}").RootElement,
            ClockValue = clockValue,
            Timestamp = DateTime.UtcNow,
            VectorClock = vc
        };
    }

    #endregion
}
