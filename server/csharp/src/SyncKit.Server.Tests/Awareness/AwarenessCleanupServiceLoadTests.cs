using Microsoft.Extensions.Logging;
using Moq;
using SyncKit.Server.Awareness;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Protocol;
using System.Text.Json;

namespace SyncKit.Server.Tests.Awareness;

public class AwarenessCleanupServiceLoadTests
{
    [Fact]
    public async Task RunCleanupOnceAsync_HandlesHighVolumeExpirationsWithMixedFailures()
    {
        // Arrange - simulate many documents and entries
        const int documents = 50; // keep test fast but meaningful
        const int entriesPerDocument = 5; // total 250 expired entries
        var expired = new List<AwarenessEntry>();
        var docMap = new Dictionary<string, List<Mock<IConnection>>>();

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        for (int i = 0; i < documents; i++)
        {
            var docId = $"doc-load-{i}";
            var subs = new List<Mock<IConnection>>();

            // Create a few subscribers per document
            for (int s = 0; s < 3; s++)
            {
                var subId = $"{docId}-sub-{s}";
                var sub = ConnectionManagerTestHelper.CreateMockConnection(subId);

                // Randomly make some sends throw to simulate intermittent failures
                if ((i + s) % 7 == 0)
                {
                    sub.Setup(c => c.Send(It.IsAny<IMessage>())).Throws(new Exception("simulated send failure"));
                }

                subs.Add(sub);
            }

            docMap[docId] = subs;

            // Create several expired awareness entries for this document
            for (int e = 0; e < entriesPerDocument; e++)
            {
                var clientId = $"{docId}-client-{e}";
                var state = AwarenessState.Create(clientId, TestHelpers.ToNullableJsonElement(new { cursor = new { x = e } }), 1);
                var entry = AwarenessEntry.FromState(docId, state, timeoutMs: 1);
                entry.ExpiresAt = now - 1000; // expired
                expired.Add(entry);
            }
        }

        var mockStore = new Mock<IAwarenessStore>();
        mockStore.Setup(s => s.GetExpiredAsync()).ReturnsAsync(expired);
        mockStore.Setup(s => s.PruneExpiredAsync()).Returns(Task.CompletedTask);

        var mockConnManager = ConnectionManagerTestHelper.CreateMockManagerWithDocumentSubscribers(docMap);

        var mockLogger = new Mock<ILogger<AwarenessCleanupService>>();
        var service = new AwarenessCleanupService(mockStore.Object, mockConnManager.Object, mockLogger.Object);

        // Act
        await service.RunCleanupOnceAsync();

        // Assert - Broadcast should be called once per expired entry
        mockConnManager.Verify(cm => cm.BroadcastToDocumentAsync(It.IsAny<string>(), It.IsAny<IMessage>(), It.IsAny<string?>()), Times.Exactly(expired.Count));

        // Prune still called
        mockStore.Verify(s => s.PruneExpiredAsync(), Times.Once);

        // At least one failure should have been logged (since we introduced some throws)
        mockLogger.Verify(l => l.Log(
            LogLevel.Debug,
            It.IsAny<EventId>(),
            It.Is<It.IsAnyType>((o, t) => o.ToString()!.Contains("Failed to broadcast expired awareness")),
            It.IsAny<Exception>(),
            It.IsAny<Func<It.IsAnyType, Exception?, string>>()), Times.AtLeastOnce);
    }
}
