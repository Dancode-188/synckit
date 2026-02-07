using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Handlers;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.Tests.WebSockets.Handlers;

/// <summary>
/// Tests for the MessageDispatcher that routes messages to appropriate handlers.
/// </summary>
public class MessageDispatcherTests
{
    [Fact]
    public async Task DispatchAsync_ValidMessage_RoutesToCorrectHandler()
    {
        // Arrange
        var authHandler = new Mock<IMessageHandler>();
        authHandler.Setup(h => h.HandledTypes).Returns(new[] { MessageType.Auth });

        var dispatcher = new MessageDispatcher(
            new[] { authHandler.Object },
            NullLogger<MessageDispatcher>.Instance);

        var connection = new Mock<IConnection>();
        var message = new AuthMessage { Id = "1", Timestamp = 123 };

        // Act
        await dispatcher.DispatchAsync(connection.Object, message);

        // Assert
        authHandler.Verify(h => h.HandleAsync(connection.Object, message), Times.Once);
    }

    [Fact]
    public async Task DispatchAsync_UnknownMessageType_SendsErrorResponse()
    {
        // Arrange
        var dispatcher = new MessageDispatcher(
            Array.Empty<IMessageHandler>(),
            NullLogger<MessageDispatcher>.Instance);

        var connection = new Mock<IConnection>();
        var message = new Mock<IMessage>();
        message.Setup(m => m.Type).Returns(MessageType.Delta);
        message.Setup(m => m.Id).Returns("msg-1");

        // Act
        await dispatcher.DispatchAsync(connection.Object, message.Object);

        // Assert - verify Send was called with ErrorMessage
        connection.Verify(
            c => c.Send(It.IsAny<ErrorMessage>()),
            Times.Once);
    }

    [Fact]
    public async Task DispatchAsync_UnknownMessageType_LogsWarning()
    {
        // Arrange
        var logger = new Mock<ILogger<MessageDispatcher>>();
        var dispatcher = new MessageDispatcher(
            Array.Empty<IMessageHandler>(),
            logger.Object);

        var connection = new Mock<IConnection>();
        var message = new Mock<IMessage>();
        message.Setup(m => m.Type).Returns(MessageType.Delta);
        message.Setup(m => m.Id).Returns("msg-1");

        // Act
        await dispatcher.DispatchAsync(connection.Object, message.Object);

        // Assert
        logger.Verify(
            x => x.Log(
                LogLevel.Warning,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((v, t) => v.ToString()!.Contains("No handler registered")),
                It.IsAny<Exception>(),
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.Once);
    }

    [Fact]
    public async Task DispatchAsync_HandlerThrowsException_DoesNotCrash()
    {
        // Arrange
        var handler = new Mock<IMessageHandler>();
        handler.Setup(h => h.HandledTypes).Returns(new[] { MessageType.Auth });
        handler.Setup(h => h.HandleAsync(It.IsAny<IConnection>(), It.IsAny<IMessage>()))
            .ThrowsAsync(new InvalidOperationException("Handler error"));

        var dispatcher = new MessageDispatcher(
            new[] { handler.Object },
            NullLogger<MessageDispatcher>.Instance);

        var connection = new Mock<IConnection>();
        var message = new AuthMessage { Id = "1", Timestamp = 123 };

        // Act & Assert - should not throw
        var exception = await Record.ExceptionAsync(
            async () => await dispatcher.DispatchAsync(connection.Object, message));

        Assert.Null(exception);
    }

    [Fact]
    public async Task DispatchAsync_HandlerThrowsException_SendsErrorResponse()
    {
        // Arrange
        var handler = new Mock<IMessageHandler>();
        handler.Setup(h => h.HandledTypes).Returns(new[] { MessageType.Auth });
        handler.Setup(h => h.HandleAsync(It.IsAny<IConnection>(), It.IsAny<IMessage>()))
            .ThrowsAsync(new InvalidOperationException("Handler error"));

        var dispatcher = new MessageDispatcher(
            new[] { handler.Object },
            NullLogger<MessageDispatcher>.Instance);

        var connection = new Mock<IConnection>();
        var message = new AuthMessage { Id = "1", Timestamp = 123 };

        // Act
        await dispatcher.DispatchAsync(connection.Object, message);

        // Assert - verify Send was called with ErrorMessage
        connection.Verify(
            c => c.Send(It.IsAny<ErrorMessage>()),
            Times.Once);
    }

    [Fact]
    public async Task DispatchAsync_HandlerThrowsException_LogsError()
    {
        // Arrange
        var handler = new Mock<IMessageHandler>();
        handler.Setup(h => h.HandledTypes).Returns(new[] { MessageType.Auth });
        handler.Setup(h => h.HandleAsync(It.IsAny<IConnection>(), It.IsAny<IMessage>()))
            .ThrowsAsync(new InvalidOperationException("Test handler error"));

        var logger = new Mock<ILogger<MessageDispatcher>>();
        var dispatcher = new MessageDispatcher(
            new[] { handler.Object },
            logger.Object);

        var connection = new Mock<IConnection>();
        var message = new AuthMessage { Id = "1", Timestamp = 123 };

        // Act
        await dispatcher.DispatchAsync(connection.Object, message);

        // Assert
        logger.Verify(
            x => x.Log(
                LogLevel.Error,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((v, t) => v.ToString()!.Contains("Error in handler")),
                It.IsAny<Exception>(),
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.Once);
    }

    [Fact]
    public async Task DispatchAsync_MultipleHandlers_RoutesToCorrectOne()
    {
        // Arrange
        var authHandler = new Mock<IMessageHandler>();
        authHandler.Setup(h => h.HandledTypes).Returns(new[] { MessageType.Auth });

        var subscribeHandler = new Mock<IMessageHandler>();
        subscribeHandler.Setup(h => h.HandledTypes).Returns(new[] { MessageType.Subscribe });

        var dispatcher = new MessageDispatcher(
            new[] { authHandler.Object, subscribeHandler.Object },
            NullLogger<MessageDispatcher>.Instance);

        var connection = new Mock<IConnection>();
        var authMessage = new AuthMessage { Id = "1", Timestamp = 123 };

        // Act
        await dispatcher.DispatchAsync(connection.Object, authMessage);

        // Assert
        authHandler.Verify(h => h.HandleAsync(connection.Object, authMessage), Times.Once);
        subscribeHandler.Verify(
            h => h.HandleAsync(It.IsAny<IConnection>(), It.IsAny<IMessage>()),
            Times.Never);
    }

    [Fact]
    public void Constructor_RegistersAllHandlers()
    {
        // Arrange
        var authHandler = new Mock<IMessageHandler>();
        authHandler.Setup(h => h.HandledTypes).Returns(new[] { MessageType.Auth });

        var subscribeHandler = new Mock<IMessageHandler>();
        subscribeHandler.Setup(h => h.HandledTypes).Returns(new[] { MessageType.Subscribe });

        var logger = new Mock<ILogger<MessageDispatcher>>();

        // Act
        var dispatcher = new MessageDispatcher(
            new[] { authHandler.Object, subscribeHandler.Object },
            logger.Object);

        // Assert - verify both handlers were registered via debug logs
        logger.Verify(
            x => x.Log(
                LogLevel.Debug,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((v, t) =>
                    v.ToString()!.Contains("Registered handler") &&
                    v.ToString()!.Contains("Auth")),
                It.IsAny<Exception>(),
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.Once);

        logger.Verify(
            x => x.Log(
                LogLevel.Debug,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((v, t) =>
                    v.ToString()!.Contains("Registered handler") &&
                    v.ToString()!.Contains("Subscribe")),
                It.IsAny<Exception>(),
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.Once);
    }

    [Fact]
    public void Constructor_DuplicateType_LogsWarningAndUsesLast()
    {
        // Arrange
        var handler1 = new Mock<IMessageHandler>();
        handler1.Setup(h => h.HandledTypes).Returns(new[] { MessageType.Auth });

        var handler2 = new Mock<IMessageHandler>();
        handler2.Setup(h => h.HandledTypes).Returns(new[] { MessageType.Auth });

        var logger = new Mock<ILogger<MessageDispatcher>>();

        // Act
        var dispatcher = new MessageDispatcher(
            new[] { handler1.Object, handler2.Object },
            logger.Object);

        // Assert - verify warning was logged for duplicate
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
    public async Task Constructor_NoHandlers_CreatesEmptyDispatcher()
    {
        // Arrange
        var dispatcher = new MessageDispatcher(
            Array.Empty<IMessageHandler>(),
            NullLogger<MessageDispatcher>.Instance);

        var connection = new Mock<IConnection>();
        var message = new Mock<IMessage>();
        message.Setup(m => m.Type).Returns(MessageType.Auth);
        message.Setup(m => m.Id).Returns("msg-1");

        // Act
        await dispatcher.DispatchAsync(connection.Object, message.Object);

        // Assert - should send error for unknown type
        connection.Verify(
            c => c.Send(It.IsAny<ErrorMessage>()),
            Times.Once);
    }
}
