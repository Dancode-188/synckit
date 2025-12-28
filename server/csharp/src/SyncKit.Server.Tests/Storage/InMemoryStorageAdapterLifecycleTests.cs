using Microsoft.Extensions.Logging;
using Moq;
using SyncKit.Server.Storage;
using System.Text.Json;
using Xunit;

namespace SyncKit.Server.Tests.Unit.Storage;

public class InMemoryStorageAdapterLifecycleTests
{
    private readonly Mock<ILogger<InMemoryStorageAdapter>> _mockLogger = new();
    private readonly InMemoryStorageAdapter _store;

    public InMemoryStorageAdapterLifecycleTests()
    {
        _store = new InMemoryStorageAdapter(_mockLogger.Object);
    }

    [Fact]
    public async Task ConnectDisconnect_HealthCheck_IsConnected()
    {
        // Act
        await _store.ConnectAsync();
        var connected = _store.IsConnected;
        var healthy = await _store.HealthCheckAsync();
        await _store.DisconnectAsync();

        // Assert
        Assert.True(connected);
        Assert.True(healthy);
    }

    [Fact]
    public async Task UpdateDocumentAsync_NonExistent_Throws()
    {
        // Arrange
        var docId = "missing-doc";

        // Act & Assert
        await Assert.ThrowsAsync<InvalidOperationException>(() => _store.UpdateDocumentAsync(docId, JsonDocument.Parse("{}").RootElement));
    }

    [Fact]
    public async Task UpdateDocumentAsync_Existing_Updates()
    {
        // Arrange
        var docId = "doc-1";
        await _store.SaveDocumentAsync(docId, JsonDocument.Parse("{ \"a\": 1 }").RootElement);

        // Act
        var updated = await _store.UpdateDocumentAsync(docId, JsonDocument.Parse("{ \"a\": 2 }").RootElement);

        // Assert
        Assert.Equal(docId, updated.Id);
        Assert.Equal(2, updated.State.GetProperty("a").GetInt32());
    }

    [Fact]
    public async Task Session_SaveUpdateDeleteAndCleanup_Works()
    {
        // Arrange
        var session = new SessionEntry
        {
            Id = "s1",
            UserId = "u1",
            ClientId = "c1",
            ConnectedAt = DateTime.UtcNow.AddHours(-48),
            LastSeen = DateTime.UtcNow.AddHours(-48),
            Metadata = new Dictionary<string, object> { ["ip"] = "1.2.3.4" }
        };

        // Act - save, update, query
        await _store.SaveSessionAsync(session);
        var sessionsBefore = await _store.GetSessionsAsync("u1");
        Assert.Single(sessionsBefore);

        await _store.UpdateSessionAsync("s1", DateTime.UtcNow, new Dictionary<string, object> { ["ip"] = "2.2.2.2" });
        var sessionsAfter = await _store.GetSessionsAsync("u1");
        Assert.Single(sessionsAfter);
        Assert.Equal("2.2.2.2", sessionsAfter[0].Metadata!["ip"]);

        // Cleanup old sessions - by default OldSessionsHours=24 should remove the old connectedAt entry
        var result = await _store.CleanupAsync(new CleanupOptions(OldSessionsHours: 1, OldDeltasDays: 1));

        // Assert - session should be removed
        var sessionsPostCleanup = await _store.GetSessionsAsync("u1");
        Assert.Empty(sessionsPostCleanup);
        Assert.Equal(1, result.SessionsDeleted);
    }

    [Fact]
    public async Task GetDeltasSince_WithMaxClock_FiltersCorrectly()
    {
        // Arrange
        var docId = "doc-clock";
        var d1 = CreateTestDelta("d1", "c1", 1);
        var d2 = CreateTestDelta("d2", "c1", 2);
        var d3 = CreateTestDelta("d3", "c2", 5);

        await _store.SaveDeltaAsync(d1 with { DocumentId = docId });
        await _store.SaveDeltaAsync(d2 with { DocumentId = docId });
        await _store.SaveDeltaAsync(d3 with { DocumentId = docId });

        // Act - request deltas since max clock 2 (should return d3 only)
        var deltas = await _store.GetDeltasSinceAsync(docId, 2);

        // Assert
        Assert.Single(deltas);
        Assert.Equal("d3", deltas[0].Id);
    }

    #region Helpers

    private static SyncKit.Server.Storage.DeltaEntry CreateTestDelta(string id, string clientId, long clockValue = 1)
    {
        var vc = new Dictionary<string, long> { [clientId] = clockValue };

        return new SyncKit.Server.Storage.DeltaEntry
        {
            Id = id,
            DocumentId = string.Empty,
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
