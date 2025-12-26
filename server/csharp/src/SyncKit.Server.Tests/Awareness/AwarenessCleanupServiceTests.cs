using Microsoft.Extensions.Logging;
using Moq;
using SyncKit.Server.Awareness;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;
using System.Text.Json;

namespace SyncKit.Server.Tests.Awareness;

public class AwarenessCleanupServiceTests
{
    [Fact]
    public void Constructor_WithNullDependencies_Throws()
    {
        var logger = new Mock<ILogger<AwarenessCleanupService>>().Object;
        var store = new Mock<IAwarenessStore>().Object;
        var cm = new Mock<IConnectionManager>().Object;

        Assert.Throws<ArgumentNullException>(() => new AwarenessCleanupService(null!, cm, logger));
        Assert.Throws<ArgumentNullException>(() => new AwarenessCleanupService(store, null!, logger));
        Assert.Throws<ArgumentNullException>(() => new AwarenessCleanupService(store, cm, null!));
    }

    [Fact]
    public async Task RunCleanupOnceAsync_BroadcastsAndPrunesExpiredEntries()
    {
        // Arrange
        var documentId = "doc-1";
        var clientId = "conn-1";

        var state = AwarenessState.Create(clientId, TestHelpers.ToNullableJsonElement(new { cursor = new { x = 1 } }), 5);
        var entry = AwarenessEntry.FromState(documentId, state, timeoutMs: 1);
        // force it to be expired
        entry.ExpiresAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - 1000;

        var mockStore = new Mock<IAwarenessStore>();
        mockStore.Setup(s => s.GetExpiredAsync()).ReturnsAsync(new List<AwarenessEntry> { entry });
        mockStore.Setup(s => s.PruneExpiredAsync()).Returns(Task.CompletedTask);

        var mockConnManager = new Mock<IConnectionManager>();
        mockConnManager.Setup(cm => cm.BroadcastToDocumentAsync(It.IsAny<string>(), It.IsAny<IMessage>(), It.IsAny<string?>())).Returns(Task.CompletedTask);

        var logger = new Mock<ILogger<AwarenessCleanupService>>().Object;

        var service = new AwarenessCleanupService(mockStore.Object, mockConnManager.Object, logger);

        // Act
        await service.RunCleanupOnceAsync();

        // Assert - broadcast called with leave message (state null) and clock = entry.Clock + 1
        mockConnManager.Verify(cm => cm.BroadcastToDocumentAsync(
            documentId,
            It.Is<AwarenessUpdateMessage>(m => m.ClientId == clientId && m.DocumentId == documentId && (m.State == null || (m.State.HasValue && m.State.Value.ValueKind == JsonValueKind.Null)) && m.Clock == entry.Clock + 1),
            It.IsAny<string?>()), Times.Once);

        // Prune called
        mockStore.Verify(s => s.PruneExpiredAsync(), Times.Once);
    }
}
