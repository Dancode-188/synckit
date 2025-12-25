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
    private readonly Mock<IDocumentStore> _mockDocumentStore;
    private readonly Mock<IConnection> _mockConnection;
    private readonly Mock<ILogger<UnsubscribeMessageHandler>> _mockLogger;
    private readonly UnsubscribeMessageHandler _handler;

    public UnsubscribeMessageHandlerTests()
    {
        _mockDocumentStore = new Mock<IDocumentStore>();
        _mockConnection = new Mock<IConnection>();
        _mockLogger = new Mock<ILogger<UnsubscribeMessageHandler>>();
        _handler = new UnsubscribeMessageHandler(
            _mockDocumentStore.Object,
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
    public async Task HandleAsync_WithExistingDocument_ShouldUnsubscribeConnectionFromDocument()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";
        var document = new Document(documentId);
        document.Subscribe(connectionId);

        _mockConnection.Setup(c => c.Id).Returns(connectionId);
        _mockConnection.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);
        _mockDocumentStore.Setup(ds => ds.GetAsync(documentId))
            .ReturnsAsync(document);

        var message = new UnsubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        // Act
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert
        Assert.DoesNotContain(connectionId, document.GetSubscribers());
        _mockDocumentStore.Verify(ds => ds.GetAsync(documentId), Times.Once);
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
        _mockDocumentStore.Setup(ds => ds.GetAsync(documentId))
            .ReturnsAsync(document);

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
        _mockDocumentStore.Setup(ds => ds.GetAsync(documentId))
            .ReturnsAsync(document);

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
        _mockDocumentStore.Setup(ds => ds.GetAsync(documentId))
            .ReturnsAsync((Document?)null);

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

        // Assert - should not interact with store or connection
        _mockDocumentStore.Verify(ds => ds.GetAsync(It.IsAny<string>()), Times.Never);
        _mockConnection.Verify(c => c.RemoveSubscription(It.IsAny<string>()), Times.Never);
        _mockConnection.Verify(c => c.Send(It.IsAny<IMessage>()), Times.Never);
    }

    [Fact]
    public async Task HandleAsync_WithMultipleSubscribers_ShouldOnlyRemoveSpecifiedConnection()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId1 = "conn-1";
        var connectionId2 = "conn-2";
        var connectionId3 = "conn-3";

        var document = new Document(documentId);
        document.Subscribe(connectionId1);
        document.Subscribe(connectionId2);
        document.Subscribe(connectionId3);

        _mockConnection.Setup(c => c.Id).Returns(connectionId2);
        _mockConnection.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);
        _mockDocumentStore.Setup(ds => ds.GetAsync(documentId))
            .ReturnsAsync(document);

        var message = new UnsubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        // Act
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert
        var subscribers = document.GetSubscribers();
        Assert.Equal(2, subscribers.Count);
        Assert.Contains(connectionId1, subscribers);
        Assert.DoesNotContain(connectionId2, subscribers);
        Assert.Contains(connectionId3, subscribers);
    }

    [Fact]
    public async Task HandleAsync_WhenConnectionNotSubscribed_ShouldNotThrowError()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";
        var document = new Document(documentId);
        // Note: connection is NOT subscribed

        _mockConnection.Setup(c => c.Id).Returns(connectionId);
        _mockConnection.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);
        _mockDocumentStore.Setup(ds => ds.GetAsync(documentId))
            .ReturnsAsync(document);

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
    public void Constructor_WithNullDocumentStore_ShouldThrowArgumentNullException()
    {
        // Act & Assert
        var exception = Assert.Throws<ArgumentNullException>(() =>
            new UnsubscribeMessageHandler(null!, _mockLogger.Object));

        Assert.Equal("documentStore", exception.ParamName);
    }

    [Fact]
    public void Constructor_WithNullLogger_ShouldThrowArgumentNullException()
    {
        // Act & Assert
        var exception = Assert.Throws<ArgumentNullException>(() =>
            new UnsubscribeMessageHandler(_mockDocumentStore.Object, null!));

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
        _mockDocumentStore.Setup(ds => ds.GetAsync(documentId))
            .ReturnsAsync((Document?)null);

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
        _mockDocumentStore.Setup(ds => ds.GetAsync(documentId))
            .ReturnsAsync(new Document(documentId));

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
