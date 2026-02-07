using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Handlers;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.Tests.WebSockets.Handlers;

/// <summary>
/// Tests for PongMessageHandler that processes heartbeat pong responses.
/// </summary>
public class PongMessageHandlerTests
{
    [Fact]
    public void HandledTypes_ReturnsPong()
    {
        // Arrange
        var handler = new PongMessageHandler(NullLogger<PongMessageHandler>.Instance);

        // Act
        var handledTypes = handler.HandledTypes;

        // Assert
        Assert.Single(handledTypes);
        Assert.Equal(MessageType.Pong, handledTypes[0]);
    }

    [Fact]
    public async Task HandleAsync_PongMessage_CallsHandlePong()
    {
        // Arrange
        var handler = new PongMessageHandler(NullLogger<PongMessageHandler>.Instance);

        var connection = new Mock<IConnection>();
        var pongMessage = new PongMessage
        {
            Id = "pong-1",
            Timestamp = 123456789
        };

        // Act
        await handler.HandleAsync(connection.Object, pongMessage);

        // Assert - verify HandlePong was called to update heartbeat status
        connection.Verify(
            c => c.HandlePong(),
            Times.Once);
    }

    [Fact]
    public async Task HandleAsync_NonPongMessage_DoesNotCallHandlePong()
    {
        // Arrange
        var handler = new PongMessageHandler(NullLogger<PongMessageHandler>.Instance);

        var connection = new Mock<IConnection>();
        var authMessage = new AuthMessage
        {
            Id = "auth-1",
            Timestamp = 123456789,
            Token = "token"
        };

        // Act
        await handler.HandleAsync(connection.Object, authMessage);

        // Assert - verify HandlePong was not called
        connection.Verify(
            c => c.HandlePong(),
            Times.Never);
    }
}
