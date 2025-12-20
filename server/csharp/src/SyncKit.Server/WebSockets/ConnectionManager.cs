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
        IOptions<SyncKitConfig> options)
    {
        _loggerFactory = loggerFactory ?? throw new ArgumentNullException(nameof(loggerFactory));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _config = options?.Value ?? throw new ArgumentNullException(nameof(options));
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

            await connection.DisposeAsync();
        }
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
