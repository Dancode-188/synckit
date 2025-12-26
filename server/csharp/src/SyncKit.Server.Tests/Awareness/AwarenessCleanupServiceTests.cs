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

    [Fact]
    public async Task RunCleanupOnceAsync_BroadcastInvokesSubscriberSend()
    {
        // Arrange
        var documentId = "doc-subscribers";
        var clientId = "client-sub";

        var state = AwarenessState.Create(clientId, TestHelpers.ToNullableJsonElement(new { cursor = new { x = 1 } }), 5);
        var entry = AwarenessEntry.FromState(documentId, state, timeoutMs: 1);
        entry.ExpiresAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - 1000;

        var mockStore = new Mock<IAwarenessStore>();
        mockStore.Setup(s => s.GetExpiredAsync()).ReturnsAsync(new List<AwarenessEntry> { entry });
        mockStore.Setup(s => s.PruneExpiredAsync()).Returns(Task.CompletedTask);

        var subA = ConnectionManagerTestHelper.CreateMockConnection("sub-a");
        var subB = ConnectionManagerTestHelper.CreateMockConnection("sub-b");

        var mockConnManager = ConnectionManagerTestHelper.CreateMockManagerWithSubscribers(documentId, new[] { subA, subB });

        var logger = new Mock<ILogger<AwarenessCleanupService>>().Object;

        var service = new AwarenessCleanupService(mockStore.Object, mockConnManager.Object, logger);

        // Act
        await service.RunCleanupOnceAsync();

        // Assert - both subscriber Send methods should have been invoked by the broadcast helper
        subA.Verify(s => s.Send(It.IsAny<IMessage>()), Times.Once);
        subB.Verify(s => s.Send(It.IsAny<IMessage>()), Times.Once);
        mockStore.Verify(s => s.PruneExpiredAsync(), Times.Once);
    }

    [Fact]
    public async Task RunCleanupOnceAsync_SubscriberSendFailure_LoggedAndPruneStillCalled()
    {
        // Arrange
        var documentId = "doc-failure";
        var clientId = "client-fail";

        var state = AwarenessState.Create(clientId, TestHelpers.ToNullableJsonElement(new { cursor = new { x = 1 } }), 5);
        var entry = AwarenessEntry.FromState(documentId, state, timeoutMs: 1);
        entry.ExpiresAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - 1000;

        var mockStore = new Mock<IAwarenessStore>();
        mockStore.Setup(s => s.GetExpiredAsync()).ReturnsAsync(new List<AwarenessEntry> { entry });
        mockStore.Setup(s => s.PruneExpiredAsync()).Returns(Task.CompletedTask);

        var good = ConnectionManagerTestHelper.CreateMockConnection("good");
        var bad = ConnectionManagerTestHelper.CreateMockConnection("bad");
        // Simulate Send throwing for one subscriber
        bad.Setup(s => s.Send(It.IsAny<IMessage>())).Throws(new Exception("send failed"));

        var mockConnManager = ConnectionManagerTestHelper.CreateMockManagerWithSubscribers(documentId, new[] { bad, good });

        var mockLogger = new Mock<ILogger<AwarenessCleanupService>>();

        var service = new AwarenessCleanupService(mockStore.Object, mockConnManager.Object, mockLogger.Object);

        // Act
        await service.RunCleanupOnceAsync();

        // Assert - good subscriber should still receive a send (depending on order, broadcast may short-circuit on exception; we ensure prune still happens)
        good.Verify(s => s.Send(It.IsAny<IMessage>()), Times.AtLeastOnce);
        mockStore.Verify(s => s.PruneExpiredAsync(), Times.Once);

        // Verify the exception was logged as a Debug (caught) message
        mockLogger.Verify(l => l.Log(
            LogLevel.Debug,
            It.IsAny<EventId>(),
            It.Is<It.IsAnyType>((o, t) => o.ToString()!.Contains("Failed to broadcast expired awareness")),
            It.IsAny<Exception>(),
            It.IsAny<Func<It.IsAnyType, Exception?, string>>()), Times.AtLeastOnce);
    }

    [Fact]
    public async Task RunCleanupOnceAsync_MultipleDocuments_MixedSubscriberFailures()
    {
        // Arrange - two documents with expired entries
        var docA = "doc-multi-a";
        var docB = "doc-multi-b";

        var clientA = "client-a";
        var clientB = "client-b";

        var stateA = AwarenessState.Create(clientA, TestHelpers.ToNullableJsonElement(new { cursor = new { x = 1 } }), 5);
        var stateB = AwarenessState.Create(clientB, TestHelpers.ToNullableJsonElement(new { cursor = new { x = 2 } }), 5);

        var entryA = AwarenessEntry.FromState(docA, stateA, timeoutMs: 1);
        entryA.ExpiresAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - 1000;

        var entryB = AwarenessEntry.FromState(docB, stateB, timeoutMs: 1);
        entryB.ExpiresAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - 1000;

        var mockStore = new Mock<IAwarenessStore>();
        mockStore.Setup(s => s.GetExpiredAsync()).ReturnsAsync(new List<AwarenessEntry> { entryA, entryB });
        mockStore.Setup(s => s.PruneExpiredAsync()).Returns(Task.CompletedTask);

        // Subscribers for docA: one bad (throws), one good
        var badA = ConnectionManagerTestHelper.CreateMockConnection("bad-A");
        var goodA = ConnectionManagerTestHelper.CreateMockConnection("good-A");
        badA.Setup(s => s.Send(It.IsAny<IMessage>())).Throws(new Exception("send failed A"));

        // Subscribers for docB: all good
        var goodB1 = ConnectionManagerTestHelper.CreateMockConnection("good-B1");
        var goodB2 = ConnectionManagerTestHelper.CreateMockConnection("good-B2");

        var docMap = new Dictionary<string, List<Mock<IConnection>>>
        {
            [docA] = new List<Mock<IConnection>> { badA, goodA },
            [docB] = new List<Mock<IConnection>> { goodB1, goodB2 }
        };

        var mockConnManager = ConnectionManagerTestHelper.CreateMockManagerWithDocumentSubscribers(docMap);

        var mockLogger = new Mock<ILogger<AwarenessCleanupService>>();

        var service = new AwarenessCleanupService(mockStore.Object, mockConnManager.Object, mockLogger.Object);

        // Act
        await service.RunCleanupOnceAsync();

        // Assert - good subscribers should receive sends for their docs
        goodA.Verify(s => s.Send(It.IsAny<IMessage>()), Times.AtLeastOnce);
        goodB1.Verify(s => s.Send(It.IsAny<IMessage>()), Times.AtLeastOnce);
        goodB2.Verify(s => s.Send(It.IsAny<IMessage>()), Times.AtLeastOnce);

        // Prune still called
        mockStore.Verify(s => s.PruneExpiredAsync(), Times.Once);

        // Ensure exception for badA was logged
        mockLogger.Verify(l => l.Log(
            LogLevel.Debug,
            It.IsAny<EventId>(),
            It.Is<It.IsAnyType>((o, t) => o.ToString()!.Contains("Failed to broadcast expired awareness")),
            It.IsAny<Exception>(),
            It.IsAny<Func<It.IsAnyType, Exception?, string>>()), Times.AtLeastOnce);
    }

    [Fact]
    public async Task ExecuteAsync_RunsPeriodicallyAndPrunesExpiredEntries()
    {
        var documentId = "doc-periodic";
        var clientId = "client-periodic";

        var state = AwarenessState.Create(clientId, TestHelpers.ToNullableJsonElement(new { cursor = new { x = 1 } }), 5);
        var entry = AwarenessEntry.FromState(documentId, state, timeoutMs: 1);
        entry.ExpiresAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - 1000;

        var mockStore = new Mock<IAwarenessStore>();
        mockStore.SetupSequence(s => s.GetExpiredAsync())
            .ReturnsAsync(new List<AwarenessEntry> { entry })
            .ReturnsAsync(new List<AwarenessEntry>());
        mockStore.Setup(s => s.PruneExpiredAsync()).Returns(Task.CompletedTask);

        var mockConnManager = new Mock<IConnectionManager>();
        mockConnManager.Setup(cm => cm.BroadcastToDocumentAsync(It.IsAny<string>(), It.IsAny<IMessage>(), It.IsAny<string?>())).Returns(Task.CompletedTask);

        var logger = new Mock<ILogger<AwarenessCleanupService>>().Object;

        var service = new AwarenessCleanupService(mockStore.Object, mockConnManager.Object, logger, TimeSpan.FromMilliseconds(10));

        await service.StartAsync(CancellationToken.None);
        // Let it run a few iterations
        await Task.Delay(100);
        await service.StopAsync(CancellationToken.None);

        // Verify broadcast happened at least once and prune called
        mockConnManager.Verify(cm => cm.BroadcastToDocumentAsync(documentId, It.IsAny<IMessage>(), null), Times.AtLeastOnce);
        mockStore.Verify(s => s.PruneExpiredAsync(), Times.AtLeastOnce);
    }

    [Fact]
    public async Task ExecuteAsync_GracefulShutdownStopsService()
    {
        var mockStore = new Mock<IAwarenessStore>();
        mockStore.Setup(s => s.GetExpiredAsync()).ReturnsAsync(new List<AwarenessEntry>());

        var mockConnManager = new Mock<IConnectionManager>();
        var logger = new Mock<ILogger<AwarenessCleanupService>>().Object;

        var service = new AwarenessCleanupService(mockStore.Object, mockConnManager.Object, logger, TimeSpan.FromSeconds(1)); // long interval

        await service.StartAsync(CancellationToken.None);

        var sw = System.Diagnostics.Stopwatch.StartNew();
        await service.StopAsync(CancellationToken.None);
        sw.Stop();

        Assert.True(sw.ElapsedMilliseconds < 500, $"StopAsync took too long: {sw.ElapsedMilliseconds}ms");
    }
}
