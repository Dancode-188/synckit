using Microsoft.Extensions.Logging;
using Moq;
using SyncKit.Server.Sync;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Handlers;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;
namespace SyncKit.Server.Tests.WebSockets.Handlers;

public class UnsubscribeMessageHandlerTests
{
    private readonly Mock<SyncKit.Server.Storage.IStorageAdapter> _mockStorage;
    private readonly Mock<IConnection> _mockConnection;
    private readonly Mock<ILogger<UnsubscribeMessageHandler>> _mockLogger;
    private readonly UnsubscribeMessageHandler _handler;

    public UnsubscribeMessageHandlerTests()
    {
        _mockStorage = new Mock<SyncKit.Server.Storage.IStorageAdapter>();
        _mockConnection = new Mock<IConnection>();
        _mockLogger = new Mock<ILogger<UnsubscribeMessageHandler>>();
        var mockConnManager = new Mock<IConnectionManager>();
        _handler = new UnsubscribeMessageHandler(
            _mockStorage.Object,
            mockConnManager.Object,
            null,
            _mockLogger.Object);
    }

    [Fact]
    public void HandledTypes_ShouldReturnUnsubscribe()
    {
        // Arrange & Act
        var types = _handler.HandledTypes;

        // Assert
        Assert.Single(types);
        Assert.Equal(MessageType.Unsubscribe, types[0]);
    }

    [Fact]
    public async Task HandleAsync_WithExistingDocument_ShouldRemoveSubscriptionAndAck()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";

        _mockConnection.Setup(c => c.Id).Returns(connectionId);
        _mockConnection.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);

        var message = new UnsubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        // Act
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert - connection subscription removed and ACK sent
        _mockConnection.Verify(c => c.RemoveSubscription(documentId), Times.Once);
        _mockConnection.Verify(c => c.Send(It.IsAny<AckMessage>()), Times.Once);
    }

    [Fact]
    public async Task HandleAsync_ShouldRemoveDocumentFromConnectionSubscriptions()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";
        var document = new Document(documentId);

        _mockConnection.Setup(c => c.Id).Returns(connectionId);
        _mockConnection.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);

        var message = new UnsubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        // Act
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert
        _mockConnection.Verify(c => c.RemoveSubscription(documentId), Times.Once);
    }

    [Fact]
    public async Task HandleAsync_ShouldSendAckMessage()
    {
        // Arrange
        var documentId = "doc-123";
        var messageId = "msg-1";
        var document = new Document(documentId);

        _mockConnection.Setup(c => c.Id).Returns("conn-456");
        _mockConnection.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);

        var message = new UnsubscribeMessage
        {
            Id = messageId,
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        AckMessage? sentAck = null;
        _mockConnection.Setup(c => c.Send(It.IsAny<AckMessage>()))
            .Callback<IMessage>(msg => sentAck = msg as AckMessage)
            .Returns(true);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert
        Assert.NotNull(sentAck);
        Assert.Equal(MessageType.Ack, sentAck.Type);
        Assert.Equal(messageId, sentAck.MessageId);
        Assert.NotEmpty(sentAck.Id);
        Assert.True(sentAck.Timestamp > 0);
    }

    [Fact]
    public async Task HandleAsync_WithNonExistentDocument_ShouldNotThrowError()
    {
        // Arrange
        var documentId = "doc-nonexistent";
        var connectionId = "conn-456";

        _mockConnection.Setup(c => c.Id).Returns(connectionId);
        _mockConnection.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);


        var message = new UnsubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        // Act & Assert - should not throw
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert connection subscription still removed
        _mockConnection.Verify(c => c.RemoveSubscription(documentId), Times.Once);

        // Assert ACK still sent
        _mockConnection.Verify(c => c.Send(It.IsAny<AckMessage>()), Times.Once);
    }

    [Fact]
    public async Task HandleAsync_WithWrongMessageType_ShouldLogWarningAndReturn()
    {
        // Arrange
        var wrongMessage = new SubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = "doc-123"
        };

        // Act
        await _handler.HandleAsync(_mockConnection.Object, wrongMessage);

        // Assert - should not interact with storage adapter or connection
        _mockStorage.Verify(s => s.GetDocumentAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        _mockConnection.Verify(c => c.RemoveSubscription(It.IsAny<string>()), Times.Never);
        _mockConnection.Verify(c => c.Send(It.IsAny<IMessage>()), Times.Never);
    }

    [Fact]
    public async Task HandleAsync_WithMultipleSubscribers_ShouldOnlyRemoveSpecifiedConnection()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId2 = "conn-2";

        _mockConnection.Setup(c => c.Id).Returns(connectionId2);
        _mockConnection.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);

        var message = new UnsubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        // Act
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert - Ensure connection subscription removed and ACK sent
        _mockConnection.Verify(c => c.RemoveSubscription(documentId), Times.Once);
        _mockConnection.Verify(c => c.Send(It.IsAny<AckMessage>()), Times.Once);
    }

    [Fact]
    public async Task HandleAsync_WhenConnectionNotSubscribed_ShouldNotThrowError()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";
        // Note: connection is NOT subscribed

        _mockConnection.Setup(c => c.Id).Returns(connectionId);
        _mockConnection.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);

        var message = new UnsubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        // Act & Assert - should not throw
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert operations still performed gracefully
        _mockConnection.Verify(c => c.RemoveSubscription(documentId), Times.Once);
        _mockConnection.Verify(c => c.Send(It.IsAny<AckMessage>()), Times.Once);
    }

    [Fact]
    public void Constructor_WithNullStorage_ShouldThrowArgumentNullException()
    {
        // Act & Assert
        var exception = Assert.Throws<ArgumentNullException>(() =>
            new UnsubscribeMessageHandler((SyncKit.Server.Storage.IStorageAdapter)null!, new Mock<IConnectionManager>().Object, null!, _mockLogger.Object));

        Assert.Equal("storage", exception.ParamName);
    }

    [Fact]
    public void Constructor_WithNullLogger_ShouldThrowArgumentNullException()
    {
        // Act & Assert
        var exception = Assert.Throws<ArgumentNullException>(() =>
            new UnsubscribeMessageHandler(_mockStorage.Object, new Mock<IConnectionManager>().Object, null!, null!));

        Assert.Equal("logger", exception.ParamName);
    }

    [Fact]
    public async Task HandleAsync_ShouldLogDebugMessageAtStart()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";

        _mockConnection.Setup(c => c.Id).Returns(connectionId);
        _mockConnection.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);

        var message = new UnsubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        // Act
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert - verify debug logging occurred
        _mockLogger.Verify(
            l => l.Log(
                LogLevel.Debug,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((o, t) => o.ToString()!.Contains("unsubscribing")),
                null,
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.Once);
    }

    [Fact]
    public async Task HandleAsync_ShouldLogInformationMessageAtEnd()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";
        var userId = "user-789";

        _mockConnection.Setup(c => c.Id).Returns(connectionId);
        _mockConnection.Setup(c => c.UserId).Returns(userId);
        _mockConnection.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);

        var message = new UnsubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        // Act
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert - verify information logging occurred
        _mockLogger.Verify(
            l => l.Log(
                LogLevel.Information,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((o, t) => o.ToString()!.Contains("unsubscribed")),
                null,
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.Once);
    }
}
