using System.Net.WebSockets;
using Microsoft.Extensions.Logging;
using Moq;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.Tests.WebSockets;

/// <summary>
/// Tests for Connection heartbeat mechanism (ping/pong).
/// </summary>
public class ConnectionHeartbeatTests
{
    private readonly Mock<WebSocket> _mockWebSocket;
    private readonly Mock<IProtocolHandler> _mockJsonHandler;
    private readonly Mock<IProtocolHandler> _mockBinaryHandler;
    private readonly Mock<ILogger<Connection>> _mockLogger;
    private Connection _connection;

    public ConnectionHeartbeatTests()
    {
        _mockWebSocket = new Mock<WebSocket>();
        _mockJsonHandler = new Mock<IProtocolHandler>();
        _mockBinaryHandler = new Mock<IProtocolHandler>();
        _mockLogger = new Mock<ILogger<Connection>>();

        // Setup WebSocket to be open
        _mockWebSocket.Setup(ws => ws.State).Returns(WebSocketState.Open);

        _connection = new Connection(
            _mockWebSocket.Object,
            "test-conn-1",
            _mockJsonHandler.Object,
            _mockBinaryHandler.Object,
            _mockLogger.Object);
    }

    [Fact]
    public void StartHeartbeat_InitializesLastPongTime()
    {
        // Arrange
        var beforeStart = DateTime.UtcNow;

        // Act
        _connection.StartHeartbeat(30000, 60000);

        // Assert
        Assert.True(_connection.IsAlive);
    }

    [Fact]
    public void StopHeartbeat_CanBeCalledSafely()
    {
        // Arrange
        _connection.StartHeartbeat(30000, 60000);

        // Act
        _connection.StopHeartbeat();

        // Assert - no exception thrown
        Assert.True(true);
    }

    [Fact]
    public void StopHeartbeat_CanBeCalledWhenNotStarted()
    {
        // Act
        _connection.StopHeartbeat();

        // Assert - no exception thrown
        Assert.True(true);
    }

    [Fact]
    public async Task StartHeartbeat_SendsPingMessages()
    {
        // Arrange
        var sentMessages = new List<IMessage>();

        // Setup protocol handler to serialize ping messages
        _mockBinaryHandler.Setup(h => h.Serialize(It.IsAny<PingMessage>()))
            .Returns(new byte[] { 0x01 })
            .Callback<IMessage>(msg => sentMessages.Add(msg));

        // Setup WebSocket SendAsync
        _mockWebSocket.Setup(ws => ws.SendAsync(
            It.IsAny<ArraySegment<byte>>(),
            It.IsAny<WebSocketMessageType>(),
            It.IsAny<bool>(),
            It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        // Set protocol to Binary so it uses the mock handler
        typeof(Connection)
            .GetProperty("Protocol")!
            .SetValue(_connection, ProtocolType.Binary);

        // Act
        _connection.StartHeartbeat(100, 500); // Short interval for testing
        await Task.Delay(250); // Wait for at least 2 pings

        // Assert
        Assert.True(sentMessages.Count >= 2, $"Expected at least 2 ping messages, got {sentMessages.Count}");
        Assert.All(sentMessages, msg => Assert.IsType<PingMessage>(msg));
    }

    [Fact]
    public async Task StartHeartbeat_TerminatesStaleConnection()
    {
        // Arrange
        var closeStatusCaptured = (WebSocketCloseStatus?)null;
        var closeDescriptionCaptured = (string?)null;

        _mockWebSocket.Setup(ws => ws.CloseAsync(
            It.IsAny<WebSocketCloseStatus>(),
            It.IsAny<string>(),
            It.IsAny<CancellationToken>()))
            .Callback<WebSocketCloseStatus, string, CancellationToken>((status, desc, _) =>
            {
                closeStatusCaptured = status;
                closeDescriptionCaptured = desc;
            })
            .Returns(Task.CompletedTask);

        // Setup protocol handler
        _mockBinaryHandler.Setup(h => h.Serialize(It.IsAny<PingMessage>()))
            .Returns(new byte[] { 0x01 });

        _mockWebSocket.Setup(ws => ws.SendAsync(
            It.IsAny<ArraySegment<byte>>(),
            It.IsAny<WebSocketMessageType>(),
            It.IsAny<bool>(),
            It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        typeof(Connection)
            .GetProperty("Protocol")!
            .SetValue(_connection, ProtocolType.Binary);

        // Act
        _connection.StartHeartbeat(50, 100); // Short timeout for testing
        // Don't call HandlePong - connection should timeout
        await Task.Delay(200); // Wait for timeout

        // Assert
        Assert.Equal(WebSocketCloseStatus.PolicyViolation, closeStatusCaptured);
        Assert.Equal("Heartbeat timeout", closeDescriptionCaptured);
    }

    [Fact]
    public async Task HandlePong_KeepsConnectionAlive()
    {
        // Arrange
        var connectionClosed = false;

        _mockWebSocket.Setup(ws => ws.CloseAsync(
            It.IsAny<WebSocketCloseStatus>(),
            It.IsAny<string>(),
            It.IsAny<CancellationToken>()))
            .Callback<WebSocketCloseStatus, string, CancellationToken>((_, _, _) =>
            {
                connectionClosed = true;
            })
            .Returns(Task.CompletedTask);

        _mockBinaryHandler.Setup(h => h.Serialize(It.IsAny<PingMessage>()))
            .Returns(new byte[] { 0x01 });

        _mockWebSocket.Setup(ws => ws.SendAsync(
            It.IsAny<ArraySegment<byte>>(),
            It.IsAny<WebSocketMessageType>(),
            It.IsAny<bool>(),
            It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        typeof(Connection)
            .GetProperty("Protocol")!
            .SetValue(_connection, ProtocolType.Binary);

        // Act
        _connection.StartHeartbeat(50, 200); // Give enough time to test

        // Respond to pings
        for (int i = 0; i < 5; i++)
        {
            await Task.Delay(60); // Wait for ping
            _connection.HandlePong(); // Respond
        }

        await Task.Delay(50); // Wait a bit more

        // Assert
        Assert.False(connectionClosed, "Connection should not be closed when pongs are received");
    }

    [Fact]
    public void HandlePong_UpdatesLastPongTime()
    {
        // Arrange
        _connection.StartHeartbeat(30000, 60000);
        var initialIsAlive = _connection.IsAlive;

        // Simulate ping sent (IsAlive set to false)
        typeof(Connection)
            .GetProperty("IsAlive")!
            .SetValue(_connection, false);

        // Act
        _connection.HandlePong();

        // Assert
        Assert.True(_connection.IsAlive, "IsAlive should be true after HandlePong");
    }

    [Fact]
    public void HandlePing_SendsPongResponse()
    {
        // Arrange
        IMessage? sentMessage = null;

        _mockBinaryHandler.Setup(h => h.Serialize(It.IsAny<PongMessage>()))
            .Returns(new byte[] { 0x02 })
            .Callback<IMessage>(msg => sentMessage = msg);

        _mockWebSocket.Setup(ws => ws.SendAsync(
            It.IsAny<ArraySegment<byte>>(),
            It.IsAny<WebSocketMessageType>(),
            It.IsAny<bool>(),
            It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        typeof(Connection)
            .GetProperty("Protocol")!
            .SetValue(_connection, ProtocolType.Binary);

        var pingMessage = new PingMessage
        {
            Id = "ping-123",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };

        // Act
        _connection.HandlePing(pingMessage);

        // Assert
        Assert.NotNull(sentMessage);
        var pongMessage = Assert.IsType<PongMessage>(sentMessage);
        Assert.NotNull(pongMessage.Id);
        Assert.True(pongMessage.Timestamp > 0);
    }

    [Fact]
    public void HandlePing_JsonProtocol_SendsPongResponse()
    {
        // Arrange
        IMessage? sentMessage = null;

        _mockJsonHandler.Setup(h => h.Serialize(It.IsAny<PongMessage>()))
            .Returns(new byte[] { 0x7B, 0x7D }) // {}
            .Callback<IMessage>(msg => sentMessage = msg);

        _mockWebSocket.Setup(ws => ws.SendAsync(
            It.IsAny<ArraySegment<byte>>(),
            It.IsAny<WebSocketMessageType>(),
            It.IsAny<bool>(),
            It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        typeof(Connection)
            .GetProperty("Protocol")!
            .SetValue(_connection, ProtocolType.Json);

        var pingMessage = new PingMessage
        {
            Id = "ping-456",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };

        // Act
        _connection.HandlePing(pingMessage);

        // Assert
        Assert.NotNull(sentMessage);
        Assert.IsType<PongMessage>(sentMessage);
    }

    [Fact]
    public async Task DisposeAsync_StopsHeartbeat()
    {
        // Arrange
        _connection.StartHeartbeat(30000, 60000);

        // Act
        await _connection.DisposeAsync();

        // Assert - no exception thrown, heartbeat stopped
        Assert.True(true);
    }

    [Fact]
    public void HandlePing_ClosedConnection_DoesNotThrow()
    {
        // Arrange
        _mockWebSocket.Setup(ws => ws.State).Returns(WebSocketState.Closed);

        var pingMessage = new PingMessage
        {
            Id = "ping-789",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };

        // Act
        _connection.HandlePing(pingMessage);

        // Assert - no exception thrown
        Assert.True(true);
    }

    [Fact]
    public async Task StartHeartbeat_MultipleStartCalls_OnlyOneTimerActive()
    {
        // Arrange
        var pingCount = 0;

        _mockBinaryHandler.Setup(h => h.Serialize(It.IsAny<PingMessage>()))
            .Returns(new byte[] { 0x01 })
            .Callback<IMessage>(_ => Interlocked.Increment(ref pingCount));

        _mockWebSocket.Setup(ws => ws.SendAsync(
            It.IsAny<ArraySegment<byte>>(),
            It.IsAny<WebSocketMessageType>(),
            It.IsAny<bool>(),
            It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        typeof(Connection)
            .GetProperty("Protocol")!
            .SetValue(_connection, ProtocolType.Binary);

        // Act
        _connection.StartHeartbeat(100, 500);
        _connection.StartHeartbeat(100, 500); // Start again
        _connection.StartHeartbeat(100, 500); // And again

        await Task.Delay(250);

        // Assert - should have roughly 2 pings (one timer active), not 6 (three timers)
        Assert.InRange(pingCount, 1, 3);
    }
}
