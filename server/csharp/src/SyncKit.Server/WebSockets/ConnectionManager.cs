using System.Collections.Concurrent;
using System.Net.WebSockets;
using Microsoft.Extensions.Options;
using SyncKit.Server.Configuration;
using SyncKit.Server.WebSockets.Protocol;

namespace SyncKit.Server.WebSockets;

/// <summary>
/// Manages all active WebSocket connections.
/// Provides thread-safe connection tracking, lookup, and broadcast capabilities.
/// </summary>
public class ConnectionManager : IConnectionManager
{
    private readonly ConcurrentDictionary<string, IConnection> _connections = new();
    private readonly ILoggerFactory _loggerFactory;
    private readonly ILogger<ConnectionManager> _logger;
    private readonly SyncKitConfig _config;
    private readonly SyncKit.Server.Awareness.IAwarenessStore _awarenessStore;
    private int _connectionCounter;

    /// <summary>
    /// Creates a new ConnectionManager instance.
    /// </summary>
    /// <param name="loggerFactory">Logger factory for creating connection loggers.</param>
    /// <param name="logger">Logger for this manager.</param>
    /// <param name="options">SyncKit configuration options.</param>
    public ConnectionManager(
        ILoggerFactory loggerFactory,
        ILogger<ConnectionManager> logger,
        IOptions<SyncKitConfig> options,
        SyncKit.Server.Awareness.IAwarenessStore awarenessStore)
    {
        _loggerFactory = loggerFactory ?? throw new ArgumentNullException(nameof(loggerFactory));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _config = options?.Value ?? throw new ArgumentNullException(nameof(options));
        _awarenessStore = awarenessStore ?? throw new ArgumentNullException(nameof(awarenessStore));
    }

    /// <inheritdoc />
    public int ConnectionCount => _connections.Count;

    /// <inheritdoc />
    public async Task<IConnection> CreateConnectionAsync(WebSocket webSocket, CancellationToken cancellationToken = default)
    {
        // Check max connections limit
        if (_connections.Count >= _config.WsMaxConnections)
        {
            _logger.LogWarning("Max connection limit reached ({MaxConnections}), rejecting new connection",
                _config.WsMaxConnections);

            await webSocket.CloseAsync(
                WebSocketCloseStatus.PolicyViolation,
                "Server connection limit reached",
                cancellationToken);

            throw new InvalidOperationException("Maximum connection limit reached");
        }

        // Generate unique connection ID
        var connectionId = GenerateConnectionId();

        // Create protocol handlers
        var jsonHandlerLogger = _loggerFactory.CreateLogger<JsonProtocolHandler>();
        var binaryHandlerLogger = _loggerFactory.CreateLogger<BinaryProtocolHandler>();
        var jsonHandler = new JsonProtocolHandler(jsonHandlerLogger);
        var binaryHandler = new BinaryProtocolHandler(binaryHandlerLogger);

        // Create connection instance
        var connectionLogger = _loggerFactory.CreateLogger<Connection>();
        var connection = new Connection(
            webSocket,
            connectionId,
            jsonHandler,
            binaryHandler,
            connectionLogger);

        // Track the connection
        if (!_connections.TryAdd(connectionId, connection))
        {
            // Extremely unlikely - regenerate ID
            _logger.LogWarning("Connection ID collision, regenerating: {ConnectionId}", connectionId);
            await connection.DisposeAsync();
            return await CreateConnectionAsync(webSocket, cancellationToken);
        }

        // Start heartbeat monitoring
        connection.StartHeartbeat(_config.WsHeartbeatInterval, _config.WsHeartbeatTimeout);

        // Auto-authenticate if auth is disabled (development/testing mode)
        if (!_config.AuthRequired)
        {
            connection.State = ConnectionState.Authenticated;
            connection.UserId = "anonymous";
            connection.ClientId = "anonymous";
            connection.TokenPayload = new Auth.TokenPayload
            {
                UserId = "anonymous",
                Permissions = new Auth.DocumentPermissions
                {
                    CanRead = [],
                    CanWrite = [],
                    IsAdmin = true
                }
            };
            _logger.LogInformation("Connection {ConnectionId} auto-authenticated (auth disabled)", connectionId);
        }

        _logger.LogDebug("Connection created: {ConnectionId} (Total: {ConnectionCount})",
            connectionId, _connections.Count);

        return connection;
    }

    /// <inheritdoc />
    public IConnection? GetConnection(string connectionId)
    {
        _connections.TryGetValue(connectionId, out var connection);
        return connection;
    }

    /// <inheritdoc />
    public IReadOnlyList<IConnection> GetAllConnections()
    {
        return _connections.Values.ToList();
    }

    /// <inheritdoc />
    public IReadOnlyList<IConnection> GetConnectionsByDocument(string documentId)
    {
        return _connections.Values
            .Where(c => c.GetSubscriptions().Contains(documentId))
            .ToList();
    }

    /// <inheritdoc />
    public IReadOnlyList<IConnection> GetConnectionsByUser(string userId)
    {
        return _connections.Values
            .Where(c => c.UserId == userId)
            .ToList();
    }

    /// <inheritdoc />
    public async Task RemoveConnectionAsync(string connectionId)
    {
        if (_connections.TryRemove(connectionId, out var connection))
        {
            _logger.LogDebug("Connection removed: {ConnectionId} (Total: {ConnectionCount})",
                connectionId, _connections.Count);

            // Capture subscribed documents before disposing the connection so we know which documents to notify
            var subscribedDocs = connection.GetSubscriptions().ToList();

            // Remove awareness entries and notify remaining subscribers for each subscribed document
            foreach (var docId in subscribedDocs)
            {
                // Attempt to fetch existing awareness entry to compute a leave clock
                var existing = await _awarenessStore.GetAsync(docId, connectionId);
                var leaveClock = existing?.Clock + 1 ?? 1;

                // Remove the awareness entry from the store
                await _awarenessStore.RemoveAsync(docId, connectionId);

                // Broadcast a leave (null state) to remaining subscribers
                var leaveMsg = new Protocol.Messages.AwarenessUpdateMessage
                {
                    Id = Guid.NewGuid().ToString(),
                    Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    DocumentId = docId,
                    ClientId = connectionId,
                    // Use an explicit Json null element so the JSON serializer emits "state": null
                    State = System.Text.Json.JsonDocument.Parse("null").RootElement,
                    Clock = leaveClock
                };

                await BroadcastToDocumentAsync(docId, leaveMsg, excludeConnectionId: connectionId);
            }

            await connection.DisposeAsync();
        }
    }

    /// <inheritdoc />
    public Task BroadcastToDocumentAsync(string documentId, Protocol.IMessage message, string? excludeConnectionId = null)
    {
        var connections = GetConnectionsByDocument(documentId);

        var sendCount = 0;
        var failCount = 0;

        foreach (var connection in connections)
        {
            if (excludeConnectionId != null && connection.Id == excludeConnectionId)
                continue;

            if (connection.Send(message))
            {
                sendCount++;
            }
            else
            {
                failCount++;
            }
        }

        if (failCount > 0)
        {
            _logger.LogDebug("Broadcast to document {DocumentId}: {SendCount} sent, {FailCount} failed",
                documentId, sendCount, failCount);
        }
        else if (sendCount > 0)
        {
            _logger.LogTrace("Broadcast message {MessageId} to document {DocumentId}: {SendCount} connections",
                message.Id, documentId, sendCount);
        }

        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public async Task CloseAllAsync(WebSocketCloseStatus status, string description)
    {
        _logger.LogInformation("Closing all connections: {Description} (Count: {ConnectionCount})",
            description, _connections.Count);

        var closeTasks = _connections.Values.Select(async connection =>
        {
            try
            {
                await connection.CloseAsync(status, description);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Error closing connection {ConnectionId}", connection.Id);
            }
        });

        await Task.WhenAll(closeTasks);

        // Clear and dispose all
        foreach (var kvp in _connections)
        {
            if (_connections.TryRemove(kvp.Key, out var connection))
            {
                await connection.DisposeAsync();
            }
        }
    }

    /// <summary>
    /// Generates a unique connection ID.
    /// Format: "conn_{counter}_{timestamp}"
    /// </summary>
    private string GenerateConnectionId()
    {
        var counter = Interlocked.Increment(ref _connectionCounter);
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        return $"conn_{counter}_{timestamp}";
    }
}
