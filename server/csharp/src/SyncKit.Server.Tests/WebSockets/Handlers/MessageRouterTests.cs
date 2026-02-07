using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Handlers;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;
using Xunit;

namespace SyncKit.Server.Tests.WebSockets.Handlers;

public class MessageRouterTests
{
    [Fact]
    public async Task RouteAsync_AuthMessage_RoutesToAuthHandler()
    {
        // Arrange
        var authHandler = new Mock<IMessageHandler>();
        authHandler.Setup(h => h.HandledTypes).Returns(new[] { MessageType.Auth });

        var router = new MessageRouter(
            new[] { authHandler.Object },
            NullLogger<MessageRouter>.Instance);

        var connection = new Mock<IConnection>();
        var message = new AuthMessage { Id = "1", Timestamp = 123 };

        // Act
        var handled = await router.RouteAsync(connection.Object, message);

        // Assert
        Assert.True(handled);
        authHandler.Verify(h => h.HandleAsync(connection.Object, message), Times.Once);
    }

    [Fact]
    public async Task RouteAsync_UnknownMessageType_ReturnsFalse()
    {
        // Arrange
        var router = new MessageRouter(
            Array.Empty<IMessageHandler>(),
            NullLogger<MessageRouter>.Instance);

        var connection = new Mock<IConnection>();
        var message = new Mock<IMessage>();
        message.Setup(m => m.Type).Returns(MessageType.Delta);

        // Act
        var handled = await router.RouteAsync(connection.Object, message.Object);

        // Assert
        Assert.False(handled);
    }

    [Fact]
    public async Task RouteAsync_MultipleHandlers_RoutesToCorrectOne()
    {
        // Arrange
        var authHandler = new Mock<IMessageHandler>();
        authHandler.Setup(h => h.HandledTypes).Returns(new[] { MessageType.Auth });

        var subscribeHandler = new Mock<IMessageHandler>();
        subscribeHandler.Setup(h => h.HandledTypes).Returns(new[] { MessageType.Subscribe });

        var router = new MessageRouter(
            new[] { authHandler.Object, subscribeHandler.Object },
            NullLogger<MessageRouter>.Instance);

        var connection = new Mock<IConnection>();
        var authMessage = new AuthMessage { Id = "1", Timestamp = 123 };

        // Act
        var handled = await router.RouteAsync(connection.Object, authMessage);

        // Assert
        Assert.True(handled);
        authHandler.Verify(h => h.HandleAsync(connection.Object, authMessage), Times.Once);
        subscribeHandler.Verify(h => h.HandleAsync(It.IsAny<IConnection>(), It.IsAny<IMessage>()), Times.Never);
    }

    [Fact]
    public async Task RouteAsync_HandlerForMultipleTypes_RegistersAllTypes()
    {
        // Arrange
        var multiHandler = new Mock<IMessageHandler>();
        multiHandler.Setup(h => h.HandledTypes).Returns(new[] { MessageType.Auth, MessageType.Subscribe });

        var router = new MessageRouter(
            new[] { multiHandler.Object },
            NullLogger<MessageRouter>.Instance);

        var connection = new Mock<IConnection>();
        var authMessage = new AuthMessage { Id = "1", Timestamp = 123 };
        var subscribeMessage = new SubscribeMessage { Id = "2", Timestamp = 456, DocumentId = "doc1" };

        // Act
        var authHandled = await router.RouteAsync(connection.Object, authMessage);
        var subscribeHandled = await router.RouteAsync(connection.Object, subscribeMessage);

        // Assert
        Assert.True(authHandled);
        Assert.True(subscribeHandled);
        multiHandler.Verify(h => h.HandleAsync(connection.Object, authMessage), Times.Once);
        multiHandler.Verify(h => h.HandleAsync(connection.Object, subscribeMessage), Times.Once);
    }

    [Fact]
    public void Constructor_DuplicateMessageType_LogsWarningAndUsesLast()
    {
        // Arrange
        var handler1 = new Mock<IMessageHandler>();
        handler1.Setup(h => h.HandledTypes).Returns(new[] { MessageType.Auth });

        var handler2 = new Mock<IMessageHandler>();
        handler2.Setup(h => h.HandledTypes).Returns(new[] { MessageType.Auth });

        var logger = new Mock<ILogger<MessageRouter>>();

        // Act
        var router = new MessageRouter(
            new[] { handler1.Object, handler2.Object },
            logger.Object);

        // Assert - verify warning was logged
        logger.Verify(
            x => x.Log(
                LogLevel.Warning,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((v, t) => v.ToString()!.Contains("already registered")),
                It.IsAny<Exception>(),
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.Once);
    }

    [Fact]
    public async Task RouteAsync_HandlerThrowsException_PropagatesException()
    {
        // Arrange
        var handler = new Mock<IMessageHandler>();
        handler.Setup(h => h.HandledTypes).Returns(new[] { MessageType.Auth });
        handler.Setup(h => h.HandleAsync(It.IsAny<IConnection>(), It.IsAny<IMessage>()))
            .ThrowsAsync(new InvalidOperationException("Handler error"));

        var router = new MessageRouter(
            new[] { handler.Object },
            NullLogger<MessageRouter>.Instance);

        var connection = new Mock<IConnection>();
        var message = new AuthMessage { Id = "1", Timestamp = 123 };

        // Act & Assert
        await Assert.ThrowsAsync<InvalidOperationException>(
            async () => await router.RouteAsync(connection.Object, message));
    }

    [Fact]
    public async Task Constructor_NoHandlers_CreatesEmptyRouter()
    {
        // Arrange & Act
        var router = new MessageRouter(
            Array.Empty<IMessageHandler>(),
            NullLogger<MessageRouter>.Instance);

        var connection = new Mock<IConnection>();
        var message = new Mock<IMessage>();
        message.Setup(m => m.Type).Returns(MessageType.Auth);

        // Act
        var handled = await router.RouteAsync(connection.Object, message.Object);

        // Assert
        Assert.False(handled);
    }
}
