using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SyncKit.Server.Services;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.Tests.Services;

public class AckTrackerTests
{
    private readonly Mock<IConnectionManager> _mockConnectionManager;
    private readonly AckTracker _tracker;
    private readonly AckTracker.AckTrackerOptions _options;

    public AckTrackerTests()
    {
        _mockConnectionManager = new Mock<IConnectionManager>();
        _options = new AckTracker.AckTrackerOptions
        {
            AckTimeout = TimeSpan.FromMilliseconds(100), // Short timeout for tests
            MaxRetries = 2
        };
        _tracker = new AckTracker(
            _mockConnectionManager.Object,
            NullLogger<AckTracker>.Instance,
            _options);
    }

    [Fact]
    public void TrackMessage_ShouldAddPendingAck()
    {
        // Arrange
        var connectionId = "conn-1";
        var documentId = "doc-1";
        var message = CreateDeltaMessage("msg-1", documentId);

        // Act
        _tracker.TrackMessage(connectionId, documentId, message);

        // Assert
        var (pendingCount, _, _) = _tracker.GetStats();
        Assert.Equal(1, pendingCount);
    }

    [Fact]
    public void AcknowledgeMessage_WithValidAck_ShouldRemovePendingAck()
    {
        // Arrange
        var connectionId = "conn-1";
        var documentId = "doc-1";
        var message = CreateDeltaMessage("msg-1", documentId);
        _tracker.TrackMessage(connectionId, documentId, message);

        // Act
        var result = _tracker.AcknowledgeMessage(connectionId, message.Id);

        // Assert
        Assert.True(result);
        var (pendingCount, _, _) = _tracker.GetStats();
        Assert.Equal(0, pendingCount);
    }

    [Fact]
    public void AcknowledgeMessage_WithUnknownMessage_ShouldReturnFalse()
    {
        // Arrange
        var connectionId = "conn-1";

        // Act
        var result = _tracker.AcknowledgeMessage(connectionId, "unknown-msg");

        // Assert
        Assert.False(result);
    }

    [Fact]
    public void AcknowledgeMessage_FromWrongConnection_ShouldReturnFalse()
    {
        // Arrange
        var connectionId = "conn-1";
        var wrongConnectionId = "conn-2";
        var documentId = "doc-1";
        var message = CreateDeltaMessage("msg-1", documentId);
        _tracker.TrackMessage(connectionId, documentId, message);

        // Act
        var result = _tracker.AcknowledgeMessage(wrongConnectionId, message.Id);

        // Assert
        Assert.False(result);
        // Message should still be tracked
        var (pendingCount, _, _) = _tracker.GetStats();
        Assert.Equal(1, pendingCount);
    }

    [Fact]
    public void AcknowledgeMessage_SameMessageTwice_ShouldReturnFalseOnSecond()
    {
        // Arrange
        var connectionId = "conn-1";
        var documentId = "doc-1";
        var message = CreateDeltaMessage("msg-1", documentId);
        _tracker.TrackMessage(connectionId, documentId, message);

        // Act
        var result1 = _tracker.AcknowledgeMessage(connectionId, message.Id);
        var result2 = _tracker.AcknowledgeMessage(connectionId, message.Id);

        // Assert
        Assert.True(result1);
        Assert.False(result2);
    }

    [Fact]
    public void RemovePendingAcksForConnection_ShouldRemoveAllForConnection()
    {
        // Arrange
        var connectionId1 = "conn-1";
        var connectionId2 = "conn-2";
        var documentId = "doc-1";

        _tracker.TrackMessage(connectionId1, documentId, CreateDeltaMessage("msg-1", documentId));
        _tracker.TrackMessage(connectionId1, documentId, CreateDeltaMessage("msg-2", documentId));
        _tracker.TrackMessage(connectionId2, documentId, CreateDeltaMessage("msg-3", documentId));

        // Act
        var removed = _tracker.RemovePendingAcksForConnection(connectionId1);

        // Assert
        Assert.Equal(2, removed);
        var (pendingCount, uniqueConnections, _) = _tracker.GetStats();
        Assert.Equal(1, pendingCount);
        Assert.Equal(1, uniqueConnections);
    }

    [Fact]
    public void RemovePendingAcksForConnection_WithNoAcks_ShouldReturnZero()
    {
        // Arrange & Act
        var removed = _tracker.RemovePendingAcksForConnection("nonexistent-conn");

        // Assert
        Assert.Equal(0, removed);
    }

    [Fact]
    public void GetStats_ShouldReturnCorrectCounts()
    {
        // Arrange
        _tracker.TrackMessage("conn-1", "doc-1", CreateDeltaMessage("msg-1", "doc-1"));
        _tracker.TrackMessage("conn-1", "doc-2", CreateDeltaMessage("msg-2", "doc-2"));
        _tracker.TrackMessage("conn-2", "doc-1", CreateDeltaMessage("msg-3", "doc-1"));

        // Act
        var (pendingCount, uniqueConnections, uniqueDocuments) = _tracker.GetStats();

        // Assert
        Assert.Equal(3, pendingCount);
        Assert.Equal(2, uniqueConnections);
        Assert.Equal(2, uniqueDocuments);
    }

    [Fact]
    public void TrackMessage_DuplicateMessageId_ShouldNotOverwrite()
    {
        // Arrange
        var connectionId = "conn-1";
        var documentId = "doc-1";
        var message = CreateDeltaMessage("msg-1", documentId);

        // Act - Track same message twice
        _tracker.TrackMessage(connectionId, documentId, message);
        _tracker.TrackMessage(connectionId, documentId, message);

        // Assert - Should still only have one pending ACK
        var (pendingCount, _, _) = _tracker.GetStats();
        Assert.Equal(1, pendingCount);
    }

    [Fact]
    public async Task StartAsync_ShouldCompleteSuccessfully()
    {
        // Act & Assert (no exceptions)
        await _tracker.StartAsync(CancellationToken.None);
    }

    [Fact]
    public async Task StopAsync_ShouldCompleteSuccessfully()
    {
        // Arrange
        await _tracker.StartAsync(CancellationToken.None);

        // Act & Assert (no exceptions)
        await _tracker.StopAsync(CancellationToken.None);
    }

    [Fact]
    public void Dispose_ShouldClearPendingAcks()
    {
        // Arrange
        var tracker = new AckTracker(
            _mockConnectionManager.Object,
            NullLogger<AckTracker>.Instance,
            _options);
        tracker.TrackMessage("conn-1", "doc-1", CreateDeltaMessage("msg-1", "doc-1"));

        // Act
        tracker.Dispose();

        // Assert - GetStats should return zeros after dispose
        var (pendingCount, _, _) = tracker.GetStats();
        Assert.Equal(0, pendingCount);
    }

    [Fact]
    public void TrackMessage_AfterDispose_ShouldNotTrack()
    {
        // Arrange
        var tracker = new AckTracker(
            _mockConnectionManager.Object,
            NullLogger<AckTracker>.Instance,
            _options);
        tracker.Dispose();

        // Act - Should not throw, but should not track
        tracker.TrackMessage("conn-1", "doc-1", CreateDeltaMessage("msg-1", "doc-1"));

        // Assert
        var (pendingCount, _, _) = tracker.GetStats();
        Assert.Equal(0, pendingCount);
    }

    [Fact]
    public async Task TimeoutHandling_ShouldRetryMessage()
    {
        // Arrange - Use longer timeout for test reliability
        var testOptions = new AckTracker.AckTrackerOptions
        {
            AckTimeout = TimeSpan.FromMilliseconds(50),
            MaxRetries = 2
        };
        var testTracker = new AckTracker(
            _mockConnectionManager.Object,
            NullLogger<AckTracker>.Instance,
            testOptions);

        var connectionId = "conn-1";
        var documentId = "doc-1";
        var message = CreateDeltaMessage("msg-1", documentId);

        var mockConnection = new Mock<IConnection>();
        mockConnection.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);

        _mockConnectionManager.Setup(cm => cm.GetConnection(connectionId))
            .Returns(mockConnection.Object);

        await testTracker.StartAsync(CancellationToken.None);
        testTracker.TrackMessage(connectionId, documentId, message);

        // Act - Wait for timeout + cleanup cycle (50ms timeout + 1000ms cleanup interval + buffer)
        await Task.Delay(TimeSpan.FromMilliseconds(1500));

        // Assert - Message should have been retried
        _mockConnectionManager.Verify(cm => cm.GetConnection(connectionId), Times.AtLeastOnce);

        // Cleanup
        await testTracker.StopAsync(CancellationToken.None);
        testTracker.Dispose();
    }

    [Fact]
    public async Task TimeoutHandling_ConnectionGone_ShouldDropMessage()
    {
        // Arrange - Use shorter intervals for test reliability
        var testOptions = new AckTracker.AckTrackerOptions
        {
            AckTimeout = TimeSpan.FromMilliseconds(50),
            MaxRetries = 1
        };
        var testTracker = new AckTracker(
            _mockConnectionManager.Object,
            NullLogger<AckTracker>.Instance,
            testOptions);

        var connectionId = "conn-1";
        var documentId = "doc-1";
        var message = CreateDeltaMessage("msg-1", documentId);

        _mockConnectionManager.Setup(cm => cm.GetConnection(connectionId))
            .Returns((IConnection?)null);

        await testTracker.StartAsync(CancellationToken.None);
        testTracker.TrackMessage(connectionId, documentId, message);

        // Act - Wait for timeout + cleanup cycle (50ms timeout + 1000ms cleanup interval + buffer)
        // With maxRetries=1 and connection gone, should drop after first timeout
        await Task.Delay(TimeSpan.FromMilliseconds(1500));

        // Assert - Message should be dropped (connection gone)
        var (pendingCount, _, _) = testTracker.GetStats();
        Assert.Equal(0, pendingCount);

        // Cleanup
        await testTracker.StopAsync(CancellationToken.None);
        testTracker.Dispose();
    }

    private static DeltaMessage CreateDeltaMessage(string messageId, string documentId)
    {
        return new DeltaMessage
        {
            Id = messageId,
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId,
            Delta = System.Text.Json.JsonSerializer.SerializeToElement(new Dictionary<string, object>
            {
                ["field"] = "value"
            }),
            VectorClock = new Dictionary<string, long> { ["client-1"] = 1 }
        };
    }
}
