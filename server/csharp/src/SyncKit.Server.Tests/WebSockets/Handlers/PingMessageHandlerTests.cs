using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Handlers;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.Tests.WebSockets.Handlers;

/// <summary>
/// Tests for PingMessageHandler that responds to heartbeat ping messages.
/// </summary>
public class PingMessageHandlerTests
{
    [Fact]
    public void HandledTypes_ReturnsPing()
    {
        // Arrange
        var handler = new PingMessageHandler(NullLogger<PingMessageHandler>.Instance);

        // Act
        var handledTypes = handler.HandledTypes;

        // Assert
        Assert.Single(handledTypes);
        Assert.Equal(MessageType.Ping, handledTypes[0]);
    }

    [Fact]
    public async Task HandleAsync_PingMessage_SendsPongResponse()
    {
        // Arrange
        var handler = new PingMessageHandler(NullLogger<PingMessageHandler>.Instance);

        var connection = new Mock<IConnection>();
        var pingMessage = new PingMessage
        {
            Id = "ping-1",
            Timestamp = 123456789
        };

        // Act
        await handler.HandleAsync(connection.Object, pingMessage);

        // Assert - verify Pong message was sent
        connection.Verify(
            c => c.Send(It.Is<PongMessage>(
                m => m.Id != null && m.Timestamp > 0)),
            Times.Once);
    }

    [Fact]
    public async Task HandleAsync_NonPingMessage_DoesNotSendPong()
    {
        // Arrange
        var handler = new PingMessageHandler(NullLogger<PingMessageHandler>.Instance);

        var connection = new Mock<IConnection>();
        var authMessage = new AuthMessage
        {
            Id = "auth-1",
            Timestamp = 123456789,
            Token = "token"
        };

        // Act
        await handler.HandleAsync(connection.Object, authMessage);

        // Assert - verify no Send was called
        connection.Verify(
            c => c.Send(It.IsAny<IMessage>()),
            Times.Never);
    }
}
