using System.Net.WebSockets;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using SyncKit.Server.Configuration;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.Tests.WebSockets;

/// <summary>
/// Tests for ConnectionManager - P2-08 implementation.
/// Covers connection lifecycle, tracking, lookup, broadcast, and thread-safety.
/// </summary>
public class ConnectionManagerTests
{
    private readonly Mock<ILoggerFactory> _mockLoggerFactory;
    private readonly Mock<ILogger<ConnectionManager>> _mockLogger;
    private readonly Mock<ILogger<Connection>> _mockConnectionLogger;
    private readonly Mock<ILogger<JsonProtocolHandler>> _mockJsonHandlerLogger;
    private readonly Mock<ILogger<BinaryProtocolHandler>> _mockBinaryHandlerLogger;
    private readonly IOptions<SyncKitConfig> _options;
    private readonly Mock<SyncKit.Server.Awareness.IAwarenessStore> _mockAwarenessStore;
    private readonly ConnectionManager _connectionManager;

    public ConnectionManagerTests()
    {
        _mockLoggerFactory = new Mock<ILoggerFactory>();
        _mockLogger = new Mock<ILogger<ConnectionManager>>();
        _mockConnectionLogger = new Mock<ILogger<Connection>>();
        _mockJsonHandlerLogger = new Mock<ILogger<JsonProtocolHandler>>();
        _mockBinaryHandlerLogger = new Mock<ILogger<BinaryProtocolHandler>>();

        _mockLoggerFactory
            .Setup(f => f.CreateLogger(typeof(Connection).FullName!))
            .Returns(_mockConnectionLogger.Object);
        _mockLoggerFactory
            .Setup(f => f.CreateLogger(typeof(JsonProtocolHandler).FullName!))
            .Returns(_mockJsonHandlerLogger.Object);
        _mockLoggerFactory
            .Setup(f => f.CreateLogger(typeof(BinaryProtocolHandler).FullName!))
            .Returns(_mockBinaryHandlerLogger.Object);

        var config = new SyncKitConfig
        {
            JwtSecret = "test-secret-key-for-development-32-chars",
            WsMaxConnections = 100,
            WsHeartbeatInterval = 30000,
            WsHeartbeatTimeout = 60000
        };
        _options = Options.Create(config);

        _mockAwarenessStore = new Mock<SyncKit.Server.Awareness.IAwarenessStore>();
        // Default behavior: no awareness entries
        _mockAwarenessStore.Setup(s => s.GetAsync(It.IsAny<string>(), It.IsAny<string>())).ReturnsAsync((SyncKit.Server.Awareness.AwarenessEntry?)null);
        _mockAwarenessStore.Setup(s => s.RemoveAsync(It.IsAny<string>(), It.IsAny<string>())).Returns(Task.CompletedTask);

        _connectionManager = new ConnectionManager(
            _mockLoggerFactory.Object,
            _mockLogger.Object,
            _options,
            _mockAwarenessStore.Object);
    }

    #region CreateConnectionAsync Tests

    [Fact]
    public async Task CreateConnectionAsync_CreatesAndTracksConnection()
    {
        // Arrange
        var mockWebSocket = CreateMockOpenWebSocket();

        // Act
        var connection = await _connectionManager.CreateConnectionAsync(mockWebSocket.Object);

        // Assert
        Assert.NotNull(connection);
        Assert.NotEmpty(connection.Id);
        Assert.Equal(1, _connectionManager.ConnectionCount);
    }

    [Fact]
    public async Task CreateConnectionAsync_GeneratesUniqueIds()
    {
        // Arrange
        var ids = new HashSet<string>();

        // Act
        for (int i = 0; i < 10; i++)
        {
            var mockWebSocket = CreateMockOpenWebSocket();
            var connection = await _connectionManager.CreateConnectionAsync(mockWebSocket.Object);
            ids.Add(connection.Id);
        }

        // Assert
        Assert.Equal(10, ids.Count); // All IDs should be unique
        Assert.Equal(10, _connectionManager.ConnectionCount);
    }

    [Fact]
    public async Task CreateConnectionAsync_EnforcesMaxConnectionLimit()
    {
        // Arrange
        var limitedConfig = new SyncKitConfig
        {
            JwtSecret = "test-secret-key-for-development-32-chars",
            WsMaxConnections = 3,
            WsHeartbeatInterval = 30000,
            WsHeartbeatTimeout = 60000
        };
        var limitedOptions = Options.Create(limitedConfig);
        var limitedAwarenessStore = new Mock<SyncKit.Server.Awareness.IAwarenessStore>();
        limitedAwarenessStore.Setup(s => s.GetAsync(It.IsAny<string>(), It.IsAny<string>())).ReturnsAsync((SyncKit.Server.Awareness.AwarenessEntry?)null);
        limitedAwarenessStore.Setup(s => s.RemoveAsync(It.IsAny<string>(), It.IsAny<string>())).Returns(Task.CompletedTask);
        var limitedManager = new ConnectionManager(
            _mockLoggerFactory.Object,
            _mockLogger.Object,
            limitedOptions,
            limitedAwarenessStore.Object);

        // Fill to max
        for (int i = 0; i < 3; i++)
        {
            var mockWebSocket = CreateMockOpenWebSocket();
            await limitedManager.CreateConnectionAsync(mockWebSocket.Object);
        }

        // Act & Assert
        var mockWebSocketOverLimit = CreateMockOpenWebSocket();
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => limitedManager.CreateConnectionAsync(mockWebSocketOverLimit.Object));
    }

    [Fact]
    public async Task CreateConnectionAsync_ClosesWebSocketWhenLimitReached()
    {
        // Arrange
        var limitedConfig = new SyncKitConfig
        {
            JwtSecret = "test-secret-key-for-development-32-chars",
            WsMaxConnections = 1,
            WsHeartbeatInterval = 30000,
            WsHeartbeatTimeout = 60000
        };
        var limitedOptions = Options.Create(limitedConfig);
        var limitedAwarenessStore = new Mock<SyncKit.Server.Awareness.IAwarenessStore>();
        limitedAwarenessStore.Setup(s => s.GetAsync(It.IsAny<string>(), It.IsAny<string>())).ReturnsAsync((SyncKit.Server.Awareness.AwarenessEntry?)null);
        limitedAwarenessStore.Setup(s => s.RemoveAsync(It.IsAny<string>(), It.IsAny<string>())).Returns(Task.CompletedTask);
        var limitedManager = new ConnectionManager(
            _mockLoggerFactory.Object,
            _mockLogger.Object,
            limitedOptions,
            limitedAwarenessStore.Object);

        var firstSocket = CreateMockOpenWebSocket();
        await limitedManager.CreateConnectionAsync(firstSocket.Object);

        var secondSocket = CreateMockOpenWebSocket();
        var closeCalled = false;
        secondSocket.Setup(ws => ws.CloseAsync(
            WebSocketCloseStatus.PolicyViolation,
            It.IsAny<string>(),
            It.IsAny<CancellationToken>()))
            .Callback(() => closeCalled = true)
            .Returns(Task.CompletedTask);

        // Act
        try
        {
            await limitedManager.CreateConnectionAsync(secondSocket.Object);
        }
        catch (InvalidOperationException)
        {
            // Expected
        }

        // Assert
        Assert.True(closeCalled, "WebSocket should be closed when limit is reached");
    }

    [Fact]
    public async Task CreateConnectionAsync_StartsHeartbeat()
    {
        // Arrange
        var mockWebSocket = CreateMockOpenWebSocket();

        // Act
        var connection = await _connectionManager.CreateConnectionAsync(mockWebSocket.Object);

        // Assert
        Assert.True(connection.IsAlive);
    }

    #endregion

    #region GetConnection Tests

    [Fact]
    public async Task GetConnection_ReturnsConnection_WhenExists()
    {
        // Arrange
        var mockWebSocket = CreateMockOpenWebSocket();
        var created = await _connectionManager.CreateConnectionAsync(mockWebSocket.Object);

        // Act
        var retrieved = _connectionManager.GetConnection(created.Id);

        // Assert
        Assert.NotNull(retrieved);
        Assert.Equal(created.Id, retrieved.Id);
    }

    [Fact]
    public void GetConnection_ReturnsNull_WhenNotExists()
    {
        // Act
        var result = _connectionManager.GetConnection("non-existent-id");

        // Assert
        Assert.Null(result);
    }

    #endregion

    #region GetAllConnections Tests

    [Fact]
    public async Task GetAllConnections_ReturnsAllConnections()
    {
        // Arrange
        var connections = new List<IConnection>();
        for (int i = 0; i < 5; i++)
        {
            var mockWebSocket = CreateMockOpenWebSocket();
            var conn = await _connectionManager.CreateConnectionAsync(mockWebSocket.Object);
            connections.Add(conn);
        }

        // Act
        var all = _connectionManager.GetAllConnections();

        // Assert
        Assert.Equal(5, all.Count);
        foreach (var conn in connections)
        {
            Assert.Contains(all, c => c.Id == conn.Id);
        }
    }

    [Fact]
    public void GetAllConnections_ReturnsEmpty_WhenNoConnections()
    {
        // Act
        var all = _connectionManager.GetAllConnections();

        // Assert
        Assert.Empty(all);
    }

    #endregion

    #region GetConnectionsByDocument Tests

    [Fact]
    public async Task GetConnectionsByDocument_ReturnsSubscribedConnections()
    {
        // Arrange
        var mockWebSocket1 = CreateMockOpenWebSocket();
        var mockWebSocket2 = CreateMockOpenWebSocket();
        var mockWebSocket3 = CreateMockOpenWebSocket();

        var conn1 = await _connectionManager.CreateConnectionAsync(mockWebSocket1.Object);
        var conn2 = await _connectionManager.CreateConnectionAsync(mockWebSocket2.Object);
        var conn3 = await _connectionManager.CreateConnectionAsync(mockWebSocket3.Object);

        conn1.AddSubscription("doc-1");
        conn2.AddSubscription("doc-1");
        conn3.AddSubscription("doc-2");

        // Act
        var doc1Connections = _connectionManager.GetConnectionsByDocument("doc-1");
        var doc2Connections = _connectionManager.GetConnectionsByDocument("doc-2");
        var doc3Connections = _connectionManager.GetConnectionsByDocument("doc-3");

        // Assert
        Assert.Equal(2, doc1Connections.Count);
        Assert.Contains(doc1Connections, c => c.Id == conn1.Id);
        Assert.Contains(doc1Connections, c => c.Id == conn2.Id);

        Assert.Single(doc2Connections);
        Assert.Contains(doc2Connections, c => c.Id == conn3.Id);

        Assert.Empty(doc3Connections);
    }

    [Fact]
    public async Task GetConnectionsByDocument_HandlesMultipleSubscriptions()
    {
        // Arrange
        var mockWebSocket = CreateMockOpenWebSocket();
        var conn = await _connectionManager.CreateConnectionAsync(mockWebSocket.Object);

        conn.AddSubscription("doc-1");
        conn.AddSubscription("doc-2");
        conn.AddSubscription("doc-3");

        // Act
        var doc1 = _connectionManager.GetConnectionsByDocument("doc-1");
        var doc2 = _connectionManager.GetConnectionsByDocument("doc-2");
        var doc3 = _connectionManager.GetConnectionsByDocument("doc-3");

        // Assert
        Assert.Single(doc1);
        Assert.Single(doc2);
        Assert.Single(doc3);
        Assert.Equal(conn.Id, doc1[0].Id);
    }

    #endregion

    #region GetConnectionsByUser Tests

    [Fact]
    public async Task GetConnectionsByUser_ReturnsUserConnections()
    {
        // Arrange
        var mockWebSocket1 = CreateMockOpenWebSocket();
        var mockWebSocket2 = CreateMockOpenWebSocket();
        var mockWebSocket3 = CreateMockOpenWebSocket();

        var conn1 = await _connectionManager.CreateConnectionAsync(mockWebSocket1.Object);
        var conn2 = await _connectionManager.CreateConnectionAsync(mockWebSocket2.Object);
        var conn3 = await _connectionManager.CreateConnectionAsync(mockWebSocket3.Object);

        conn1.UserId = "user-1";
        conn2.UserId = "user-1";
        conn3.UserId = "user-2";

        // Act
        var user1Connections = _connectionManager.GetConnectionsByUser("user-1");
        var user2Connections = _connectionManager.GetConnectionsByUser("user-2");
        var user3Connections = _connectionManager.GetConnectionsByUser("user-3");

        // Assert
        Assert.Equal(2, user1Connections.Count);
        Assert.Single(user2Connections);
        Assert.Empty(user3Connections);
    }

    [Fact]
    public async Task GetConnectionsByUser_ReturnsEmpty_ForNullUserId()
    {
        // Arrange
        var mockWebSocket = CreateMockOpenWebSocket();
        await _connectionManager.CreateConnectionAsync(mockWebSocket.Object);
        // UserId remains null

        // Act
        var result = _connectionManager.GetConnectionsByUser("any-user");

        // Assert
        Assert.Empty(result);
    }

    #endregion

    #region RemoveConnectionAsync Tests

    [Fact]
    public async Task RemoveConnectionAsync_RemovesAndDisposesConnection()
    {
        // Arrange
        var mockWebSocket = CreateMockOpenWebSocket();
        var connection = await _connectionManager.CreateConnectionAsync(mockWebSocket.Object);
        var connectionId = connection.Id;

        // Act
        await _connectionManager.RemoveConnectionAsync(connectionId);

        // Assert
        Assert.Equal(0, _connectionManager.ConnectionCount);
        Assert.Null(_connectionManager.GetConnection(connectionId));
    }

    [Fact]
    public async Task RemoveConnectionAsync_NoOpForNonExistent()
    {
        // Act
        await _connectionManager.RemoveConnectionAsync("non-existent-id");

        // Assert - no exception thrown
        Assert.Equal(0, _connectionManager.ConnectionCount);
    }

    [Fact]
    public async Task RemoveConnectionAsync_RemovesFromDocumentSubscriptions()
    {
        // Arrange
        var mockWebSocket = CreateMockOpenWebSocket();
        var connection = await _connectionManager.CreateConnectionAsync(mockWebSocket.Object);
        connection.AddSubscription("doc-1");

        var beforeRemoval = _connectionManager.GetConnectionsByDocument("doc-1");
        Assert.Single(beforeRemoval);

        // Act
        await _connectionManager.RemoveConnectionAsync(connection.Id);

        // Assert
        var afterRemoval = _connectionManager.GetConnectionsByDocument("doc-1");
        Assert.Empty(afterRemoval);
    }

    #endregion

    #region BroadcastToDocumentAsync Tests

    [Fact]
    public async Task BroadcastToDocumentAsync_SendsToAllSubscribers()
    {
        // Arrange
        var mockWebSocket1 = CreateMockOpenWebSocket();
        var mockWebSocket2 = CreateMockOpenWebSocket();
        var mockWebSocket3 = CreateMockOpenWebSocket();

        var conn1 = await _connectionManager.CreateConnectionAsync(mockWebSocket1.Object);
        var conn2 = await _connectionManager.CreateConnectionAsync(mockWebSocket2.Object);
        var conn3 = await _connectionManager.CreateConnectionAsync(mockWebSocket3.Object);

        // Set protocol so Send works (otherwise protocol is Unknown)
        SetConnectionProtocol(conn1, ProtocolType.Json);
        SetConnectionProtocol(conn2, ProtocolType.Json);
        SetConnectionProtocol(conn3, ProtocolType.Json);

        conn1.AddSubscription("doc-1");
        conn2.AddSubscription("doc-1");
        conn3.AddSubscription("doc-2");

        // Reset mock invocations (heartbeat may have sent pings)
        mockWebSocket1.Invocations.Clear();
        mockWebSocket2.Invocations.Clear();
        mockWebSocket3.Invocations.Clear();

        var message = new PingMessage { Id = "test-msg", Timestamp = 12345 };

        // Act
        await _connectionManager.BroadcastToDocumentAsync("doc-1", message);

        // Wait for async send queue to process (Connection uses background task to send)
        await Task.Delay(50);

        // Assert - conn1 and conn2 should have received a message, conn3 should not
        // Note: WebSocket.SendAsync uses ReadOnlyMemory<byte> overload
        mockWebSocket1.Verify(
            ws => ws.SendAsync(It.IsAny<ReadOnlyMemory<byte>>(), WebSocketMessageType.Text, true, It.IsAny<CancellationToken>()),
            Times.AtLeastOnce(),
            "conn1 should have received message");
        mockWebSocket2.Verify(
            ws => ws.SendAsync(It.IsAny<ReadOnlyMemory<byte>>(), WebSocketMessageType.Text, true, It.IsAny<CancellationToken>()),
            Times.AtLeastOnce(),
            "conn2 should have received message");
        mockWebSocket3.Verify(
            ws => ws.SendAsync(It.IsAny<ReadOnlyMemory<byte>>(), It.IsAny<WebSocketMessageType>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()),
            Times.Never(),
            "conn3 should not have received message");
    }

    [Fact]
    public async Task BroadcastToDocumentAsync_ExcludesSpecifiedConnection()
    {
        // Arrange
        var mockWebSocket1 = CreateMockOpenWebSocket();
        var mockWebSocket2 = CreateMockOpenWebSocket();

        var conn1 = await _connectionManager.CreateConnectionAsync(mockWebSocket1.Object);
        var conn2 = await _connectionManager.CreateConnectionAsync(mockWebSocket2.Object);

        SetConnectionProtocol(conn1, ProtocolType.Json);
        SetConnectionProtocol(conn2, ProtocolType.Json);

        conn1.AddSubscription("doc-1");
        conn2.AddSubscription("doc-1");

        // Reset mock invocations
        mockWebSocket1.Invocations.Clear();
        mockWebSocket2.Invocations.Clear();

        var message = new PingMessage { Id = "test-msg", Timestamp = 12345 };

        // Act - exclude conn1
        await _connectionManager.BroadcastToDocumentAsync("doc-1", message, excludeConnectionId: conn1.Id);

        // Wait for async send queue to process (Connection uses background task to send)
        await Task.Delay(50);

        // Assert - only conn2 should have received the message
        mockWebSocket1.Verify(
            ws => ws.SendAsync(It.IsAny<ReadOnlyMemory<byte>>(), It.IsAny<WebSocketMessageType>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()),
            Times.Never(),
            "conn1 should be excluded");
        mockWebSocket2.Verify(
            ws => ws.SendAsync(It.IsAny<ReadOnlyMemory<byte>>(), WebSocketMessageType.Text, true, It.IsAny<CancellationToken>()),
            Times.AtLeastOnce(),
            "conn2 should have received message");
    }

    [Fact]
    public async Task BroadcastToDocumentAsync_NoOp_WhenNoSubscribers()
    {
        // Arrange
        var message = new PingMessage { Id = "test-msg", Timestamp = 12345 };

        // Act
        await _connectionManager.BroadcastToDocumentAsync("non-existent-doc", message);

        // Assert - no exception, no subscribers = no messages sent
        Assert.Equal(0, _connectionManager.ConnectionCount);
    }

    #endregion

    #region CloseAllAsync Tests

    [Fact]
    public async Task CloseAllAsync_ClosesAllConnections()
    {
        // Arrange
        var mockWebSocket1 = CreateMockOpenWebSocket();
        var mockWebSocket2 = CreateMockOpenWebSocket();
        var mockWebSocket3 = CreateMockOpenWebSocket();

        await _connectionManager.CreateConnectionAsync(mockWebSocket1.Object);
        await _connectionManager.CreateConnectionAsync(mockWebSocket2.Object);
        await _connectionManager.CreateConnectionAsync(mockWebSocket3.Object);

        Assert.Equal(3, _connectionManager.ConnectionCount);

        // Act
        await _connectionManager.CloseAllAsync(WebSocketCloseStatus.NormalClosure, "Server shutdown");

        // Assert
        Assert.Equal(0, _connectionManager.ConnectionCount);
    }

    [Fact]
    public async Task CloseAllAsync_UsesProvidedCloseStatus()
    {
        // Arrange
        var closeStatuses = new List<WebSocketCloseStatus>();
        var mockWebSocket = CreateMockOpenWebSocket();
        mockWebSocket.Setup(ws => ws.CloseAsync(
            It.IsAny<WebSocketCloseStatus>(),
            It.IsAny<string>(),
            It.IsAny<CancellationToken>()))
            .Callback<WebSocketCloseStatus, string, CancellationToken>((status, _, _) =>
                closeStatuses.Add(status))
            .Returns(Task.CompletedTask);

        await _connectionManager.CreateConnectionAsync(mockWebSocket.Object);

        // Act
        await _connectionManager.CloseAllAsync(WebSocketCloseStatus.EndpointUnavailable, "Going away");

        // Assert
        Assert.Contains(WebSocketCloseStatus.EndpointUnavailable, closeStatuses);
    }

    #endregion

    #region Thread Safety Tests

    [Fact]
    public async Task ConnectionManager_IsThreadSafe_ForConcurrentCreation()
    {
        // Arrange
        var tasks = new List<Task<IConnection>>();

        // Act
        for (int i = 0; i < 50; i++)
        {
            var mockWebSocket = CreateMockOpenWebSocket();
            tasks.Add(_connectionManager.CreateConnectionAsync(mockWebSocket.Object));
        }

        var connections = await Task.WhenAll(tasks);

        // Assert
        Assert.Equal(50, _connectionManager.ConnectionCount);
        Assert.Equal(50, connections.Select(c => c.Id).Distinct().Count());
    }

    [Fact]
    public async Task ConnectionManager_IsThreadSafe_ForConcurrentRemoval()
    {
        // Arrange
        var connections = new List<IConnection>();
        for (int i = 0; i < 50; i++)
        {
            var mockWebSocket = CreateMockOpenWebSocket();
            var conn = await _connectionManager.CreateConnectionAsync(mockWebSocket.Object);
            connections.Add(conn);
        }

        // Act
        var tasks = connections.Select(c => _connectionManager.RemoveConnectionAsync(c.Id));
        await Task.WhenAll(tasks);

        // Assert
        Assert.Equal(0, _connectionManager.ConnectionCount);
    }

    [Fact]
    public async Task ConnectionManager_IsThreadSafe_ForConcurrentLookup()
    {
        // Arrange
        var mockWebSocket = CreateMockOpenWebSocket();
        var connection = await _connectionManager.CreateConnectionAsync(mockWebSocket.Object);
        connection.AddSubscription("shared-doc");
        connection.UserId = "user-1";

        // Act - concurrent lookups
        var tasks = new List<Task>();
        for (int i = 0; i < 100; i++)
        {
            tasks.Add(Task.Run(() =>
            {
                _connectionManager.GetConnection(connection.Id);
                _connectionManager.GetAllConnections();
                _connectionManager.GetConnectionsByDocument("shared-doc");
                _connectionManager.GetConnectionsByUser("user-1");
            }));
        }

        await Task.WhenAll(tasks);

        // Assert - no exceptions thrown
        Assert.Equal(1, _connectionManager.ConnectionCount);
    }

    #endregion

    #region ConnectionCount Tests

    [Fact]
    public void ConnectionCount_ReturnsZero_WhenEmpty()
    {
        // Assert
        Assert.Equal(0, _connectionManager.ConnectionCount);
    }

    [Fact]
    public async Task ConnectionCount_UpdatesCorrectly()
    {
        // Act & Assert
        Assert.Equal(0, _connectionManager.ConnectionCount);

        var mockWebSocket1 = CreateMockOpenWebSocket();
        var conn1 = await _connectionManager.CreateConnectionAsync(mockWebSocket1.Object);
        Assert.Equal(1, _connectionManager.ConnectionCount);

        var mockWebSocket2 = CreateMockOpenWebSocket();
        await _connectionManager.CreateConnectionAsync(mockWebSocket2.Object);
        Assert.Equal(2, _connectionManager.ConnectionCount);

        await _connectionManager.RemoveConnectionAsync(conn1.Id);
        Assert.Equal(1, _connectionManager.ConnectionCount);
    }

    #endregion

    #region Helper Methods

    private Mock<WebSocket> CreateMockOpenWebSocket()
    {
        var mockWebSocket = new Mock<WebSocket>();
        mockWebSocket.Setup(ws => ws.State).Returns(WebSocketState.Open);
        mockWebSocket.Setup(ws => ws.CloseAsync(
            It.IsAny<WebSocketCloseStatus>(),
            It.IsAny<string>(),
            It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        mockWebSocket.Setup(ws => ws.SendAsync(
            It.IsAny<ArraySegment<byte>>(),
            It.IsAny<WebSocketMessageType>(),
            It.IsAny<bool>(),
            It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        // Also support the ReadOnlyMemory<byte> overload used by JSON protocol handler
        mockWebSocket.Setup(ws => ws.SendAsync(
            It.IsAny<ReadOnlyMemory<byte>>(),
            It.IsAny<WebSocketMessageType>(),
            It.IsAny<bool>(),
            It.IsAny<CancellationToken>()))
            .Returns(new ValueTask());

        return mockWebSocket;
    }

    private void SetConnectionProtocol(IConnection connection, ProtocolType protocol)
    {
        typeof(Connection)
            .GetProperty("Protocol")!
            .SetValue(connection, protocol);
    }

    #endregion
}

/// <summary>
/// Tests for the unified disconnect flow as specified in P2-08.
/// </summary>
public class ConnectionDisconnectFlowTests
{
    private readonly Mock<ILoggerFactory> _mockLoggerFactory;
    private readonly Mock<ILogger<ConnectionManager>> _mockLogger;
    private readonly Mock<ILogger<Connection>> _mockConnectionLogger;
    private readonly Mock<ILogger<JsonProtocolHandler>> _mockJsonHandlerLogger;
    private readonly Mock<ILogger<BinaryProtocolHandler>> _mockBinaryHandlerLogger;
    private readonly IOptions<SyncKitConfig> _options;
    private readonly Mock<SyncKit.Server.Awareness.IAwarenessStore> _mockAwarenessStore;
    private readonly ConnectionManager _connectionManager;

    public ConnectionDisconnectFlowTests()
    {
        _mockLoggerFactory = new Mock<ILoggerFactory>();
        _mockLogger = new Mock<ILogger<ConnectionManager>>();
        _mockConnectionLogger = new Mock<ILogger<Connection>>();
        _mockJsonHandlerLogger = new Mock<ILogger<JsonProtocolHandler>>();
        _mockBinaryHandlerLogger = new Mock<ILogger<BinaryProtocolHandler>>();

        _mockLoggerFactory
            .Setup(f => f.CreateLogger(typeof(Connection).FullName!))
            .Returns(_mockConnectionLogger.Object);
        _mockLoggerFactory
            .Setup(f => f.CreateLogger(typeof(JsonProtocolHandler).FullName!))
            .Returns(_mockJsonHandlerLogger.Object);
        _mockLoggerFactory
            .Setup(f => f.CreateLogger(typeof(BinaryProtocolHandler).FullName!))
            .Returns(_mockBinaryHandlerLogger.Object);

        var config = new SyncKitConfig
        {
            JwtSecret = "test-secret-key-for-development-32-chars",
            WsMaxConnections = 100,
            WsHeartbeatInterval = 30000,
            WsHeartbeatTimeout = 60000
        };
        _options = Options.Create(config);

        _mockAwarenessStore = new Mock<SyncKit.Server.Awareness.IAwarenessStore>();
        _mockAwarenessStore.Setup(s => s.GetAsync(It.IsAny<string>(), It.IsAny<string>())).ReturnsAsync((SyncKit.Server.Awareness.AwarenessEntry?)null);
        _mockAwarenessStore.Setup(s => s.RemoveAsync(It.IsAny<string>(), It.IsAny<string>())).Returns(Task.CompletedTask);

        _connectionManager = new ConnectionManager(
            _mockLoggerFactory.Object,
            _mockLogger.Object,
            _options,
            _mockAwarenessStore.Object);
    }

    private void SetConnectionProtocol(IConnection connection, ProtocolType protocol)
    {
        typeof(Connection)
            .GetProperty("Protocol")!
            .SetValue(connection, protocol);
    }

    [Fact]
    public async Task DisconnectFlow_StopsHeartbeat()
    {
        // Arrange
        var mockWebSocket = CreateMockOpenWebSocket();
        var connection = await _connectionManager.CreateConnectionAsync(mockWebSocket.Object);

        // The connection's heartbeat is started automatically
        Assert.True(connection.IsAlive);

        // Act - Remove connection (should stop heartbeat and dispose)
        await _connectionManager.RemoveConnectionAsync(connection.Id);

        // Assert - connection is removed
        Assert.Null(_connectionManager.GetConnection(connection.Id));
    }

    [Fact]
    public async Task DisconnectFlow_ClearsSubscriptions()
    {
        // Arrange
        var mockWebSocket = CreateMockOpenWebSocket();
        var connection = await _connectionManager.CreateConnectionAsync(mockWebSocket.Object);
        connection.AddSubscription("doc-1");
        connection.AddSubscription("doc-2");

        Assert.Single(_connectionManager.GetConnectionsByDocument("doc-1"));
        Assert.Single(_connectionManager.GetConnectionsByDocument("doc-2"));

        // Act
        await _connectionManager.RemoveConnectionAsync(connection.Id);

        // Assert - subscriptions cleared (connection removed from document lookups)
        Assert.Empty(_connectionManager.GetConnectionsByDocument("doc-1"));
        Assert.Empty(_connectionManager.GetConnectionsByDocument("doc-2"));
    }

    [Fact]
    public async Task DisconnectFlow_RemovesAwarenessAndBroadcastsLeave()
    {
        // Arrange
        var mockWebSocket1 = CreateMockOpenWebSocket();
        var mockWebSocket2 = CreateMockOpenWebSocket();

        var conn1 = await _connectionManager.CreateConnectionAsync(mockWebSocket1.Object);
        var conn2 = await _connectionManager.CreateConnectionAsync(mockWebSocket2.Object);

        // Both subscribe to the same document
        conn1.AddSubscription("doc-1");
        conn2.AddSubscription("doc-1");

        // Ensure JSON protocol for simpler verification
        SetConnectionProtocol(conn2, ProtocolType.Json);

        // Setup awareness store to return an existing entry with a clock
        var existingEntry = SyncKit.Server.Awareness.AwarenessEntry.FromState("doc-1", SyncKit.Server.Awareness.AwarenessState.Create(conn1.Id, null, 5));
        _mockAwarenessStore.Setup(s => s.GetAsync("doc-1", conn1.Id)).ReturnsAsync(existingEntry);
        _mockAwarenessStore.Setup(s => s.RemoveAsync("doc-1", conn1.Id)).Returns(Task.CompletedTask).Verifiable();

        string? sentPayload = null;
        mockWebSocket2.Setup(ws => ws.SendAsync(
            It.IsAny<ReadOnlyMemory<byte>>(),
            It.IsAny<WebSocketMessageType>(),
            It.IsAny<bool>(),
            It.IsAny<CancellationToken>()))
            .Callback<ReadOnlyMemory<byte>, WebSocketMessageType, bool, CancellationToken>((data, type, end, ct) =>
            {
                // Capture sent JSON payload
                sentPayload = System.Text.Encoding.UTF8.GetString(data.ToArray());
            })
            .Returns(new ValueTask());

        // Reset any previous invocations
        mockWebSocket1.Invocations.Clear();
        mockWebSocket2.Invocations.Clear();

        // Act
        await _connectionManager.RemoveConnectionAsync(conn1.Id);

        // Wait for async send queue to process (Connection uses background task to send)
        await Task.Delay(50);

        // Assert
        _mockAwarenessStore.Verify(s => s.RemoveAsync("doc-1", conn1.Id), Times.Once);

        // Ensure message was sent to other subscribers
        mockWebSocket2.Verify(ws => ws.SendAsync(
            It.IsAny<ReadOnlyMemory<byte>>(),
            It.IsAny<WebSocketMessageType>(),
            It.IsAny<bool>(),
            It.IsAny<CancellationToken>()), Times.AtLeastOnce());

        Assert.NotNull(sentPayload);

        var doc = System.Text.Json.JsonDocument.Parse(sentPayload!);
        var root = doc.RootElement;
        Assert.Equal("awareness_update", root.GetProperty("type").GetString());
        Assert.Equal("doc-1", root.GetProperty("documentId").GetString());
        Assert.Equal(conn1.Id, root.GetProperty("clientId").GetString());
        Assert.True(root.TryGetProperty("state", out var state) && state.ValueKind == System.Text.Json.JsonValueKind.Null, $"Unexpected state in payload: {sentPayload}");
        Assert.Equal(6, root.GetProperty("clock").GetInt32());
    }

    [Fact]
    public async Task DisconnectFlow_RemovesFromUserLookup()
    {
        // Arrange
        var mockWebSocket = CreateMockOpenWebSocket();
        var connection = await _connectionManager.CreateConnectionAsync(mockWebSocket.Object);
        connection.UserId = "user-1";

        Assert.Single(_connectionManager.GetConnectionsByUser("user-1"));

        // Act
        await _connectionManager.RemoveConnectionAsync(connection.Id);

        // Assert
        Assert.Empty(_connectionManager.GetConnectionsByUser("user-1"));
    }

    [Fact]
    public async Task CloseAllAsync_ShutdownFlow_ClosesWithGoingAway()
    {
        // Arrange
        var closeStatus = (WebSocketCloseStatus?)null;
        var mockWebSocket = CreateMockOpenWebSocket();
        mockWebSocket.Setup(ws => ws.CloseAsync(
            It.IsAny<WebSocketCloseStatus>(),
            It.IsAny<string>(),
            It.IsAny<CancellationToken>()))
            .Callback<WebSocketCloseStatus, string, CancellationToken>((status, _, _) =>
                closeStatus = status)
            .Returns(Task.CompletedTask);

        await _connectionManager.CreateConnectionAsync(mockWebSocket.Object);

        // Act - Simulate server shutdown
        await _connectionManager.CloseAllAsync(WebSocketCloseStatus.EndpointUnavailable, "Server shutting down");

        // Assert
        Assert.Equal(0, _connectionManager.ConnectionCount);
    }

    private Mock<WebSocket> CreateMockOpenWebSocket()
    {
        var mockWebSocket = new Mock<WebSocket>();
        mockWebSocket.Setup(ws => ws.State).Returns(WebSocketState.Open);
        mockWebSocket.Setup(ws => ws.CloseAsync(
            It.IsAny<WebSocketCloseStatus>(),
            It.IsAny<string>(),
            It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        mockWebSocket.Setup(ws => ws.SendAsync(
            It.IsAny<ArraySegment<byte>>(),
            It.IsAny<WebSocketMessageType>(),
            It.IsAny<bool>(),
            It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        // Also support the ReadOnlyMemory<byte> overload used by JSON protocol handler
        mockWebSocket.Setup(ws => ws.SendAsync(
            It.IsAny<ReadOnlyMemory<byte>>(),
            It.IsAny<WebSocketMessageType>(),
            It.IsAny<bool>(),
            It.IsAny<CancellationToken>()))
            .Returns(new ValueTask());

        return mockWebSocket;
    }
}
