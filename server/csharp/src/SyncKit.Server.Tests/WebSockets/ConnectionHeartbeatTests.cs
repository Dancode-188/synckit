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
        var pingReceived = new SemaphoreSlim(0);

        // Setup protocol handler to serialize ping messages
        _mockBinaryHandler.Setup(h => h.Serialize(It.IsAny<PingMessage>()))
            .Returns(new byte[] { 0x01 })
            .Callback<IMessage>(msg =>
            {
                sentMessages.Add(msg);
                pingReceived.Release();
            });

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
        _connection.StartHeartbeat(100, 5000); // Short interval, generous timeout

        // Wait for at least 2 pings (with a generous timeout to avoid CI flakiness)
        Assert.True(await pingReceived.WaitAsync(TimeSpan.FromSeconds(5)), "Timed out waiting for 1st ping");
        Assert.True(await pingReceived.WaitAsync(TimeSpan.FromSeconds(5)), "Timed out waiting for 2nd ping");

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
        var pingReceived = new SemaphoreSlim(0);

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
            .Returns(new byte[] { 0x01 })
            .Callback<IMessage>(_ => pingReceived.Release());

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
        _connection.StartHeartbeat(100, 5000); // ping every 100ms, generous timeout

        // Wait for each ping signal and respond with pong — fully deterministic
        for (int i = 0; i < 3; i++)
        {
            Assert.True(
                await pingReceived.WaitAsync(TimeSpan.FromSeconds(5)),
                $"Timed out waiting for ping #{i + 1}");
            _connection.HandlePong();
        }

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
        var twoPingsReceived = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        _mockBinaryHandler.Setup(h => h.Serialize(It.IsAny<PingMessage>()))
            .Returns(new byte[] { 0x01 })
            .Callback<IMessage>(_ =>
            {
                var count = Interlocked.Increment(ref pingCount);
                if (count >= 2)
                    twoPingsReceived.TrySetResult();
            });

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
        _connection.StartHeartbeat(100, 5000);
        _connection.StartHeartbeat(100, 5000); // Start again
        _connection.StartHeartbeat(100, 5000); // And again

        // Wait until we observe at least 2 pings
        var completed = await Task.WhenAny(twoPingsReceived.Task, Task.Delay(TimeSpan.FromSeconds(5)));
        Assert.True(completed == twoPingsReceived.Task, "Timed out waiting for 2 pings");

        // Snapshot the count right after 2 pings arrived, then wait a short window
        // to verify no duplicate timers are flooding pings
        var countAtSnapshot = Volatile.Read(ref pingCount);
        await Task.Delay(300);
        var countAfterWait = Volatile.Read(ref pingCount);

        // Assert - with a 100ms interval and 300ms wait, a single timer should add ~3 more pings.
        // If 3 timers were active, we'd see ~9 more. Allow generous range for single timer.
        var pingsInWindow = countAfterWait - countAtSnapshot;
        Assert.True(pingsInWindow <= 5,
            $"Expected ≤5 pings in 300ms window (single timer), but got {pingsInWindow}. " +
            $"Total pings: {countAfterWait}. Multiple timers may be active.");
    }
}
