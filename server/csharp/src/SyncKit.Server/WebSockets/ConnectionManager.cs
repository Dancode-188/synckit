using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net.WebSockets;
using System.Threading;
using Microsoft.Extensions.Options;
using SyncKit.Server.Configuration;
using SyncKit.Server.Services;
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
    private readonly SemaphoreSlim? _connectionSemaphore;
    private readonly int _wsConnectionCreationConcurrency;
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, IConnection>> _documentSubscriptions = new();
    private readonly ConcurrentDictionary<string, Action<string, bool>> _subscriptionHandlers = new();

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

        _wsConnectionCreationConcurrency = _config.WsConnectionCreationConcurrency;

        // Only create semaphore if throttling is enabled (value > 0)
        if (_wsConnectionCreationConcurrency > 0)
        {
            _connectionSemaphore = new SemaphoreSlim(_wsConnectionCreationConcurrency, _wsConnectionCreationConcurrency);
            _logger.LogInformation("Connection creation throttling enabled: {Concurrency} concurrent creations", _wsConnectionCreationConcurrency);
        }
        else
        {
            _logger.LogInformation("Connection creation throttling disabled (unlimited concurrency)");
        }
    }

    /// <inheritdoc />
    public int ConnectionCount => _connections.Count;

    /// <inheritdoc />
    public async Task<IConnection> CreateConnectionAsync(WebSocket webSocket, CancellationToken cancellationToken = default)
    {
        // Throttle concurrent connection creation if throttling is enabled
        // This helps prevent macOS socket race condition (dotnet/runtime#47020)
        if (_connectionSemaphore is not null)
        {
            await _connectionSemaphore.WaitAsync(cancellationToken);
        }

        try
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
                connectionLogger,
                _config.WsMaxPendingSendsPerConnection);

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
                        CanRead = ["*"],
                        CanWrite = ["*"],
                        IsAdmin = false
                    }
                };
                _logger.LogInformation("Connection {ConnectionId} auto-authenticated (auth disabled)", connectionId);
            }

            TrackConnectionSubscriptions(connection);

            _logger.LogDebug("Connection created: {ConnectionId} (Total: {ConnectionCount})",
                connectionId, _connections.Count);

            return connection;
        }
        finally
        {
            _connectionSemaphore?.Release();
        }
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
        if (_documentSubscriptions.TryGetValue(documentId, out var connections))
        {
            return connections.Values.ToList();
        }

        return Array.Empty<IConnection>();
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

            if (_subscriptionHandlers.TryRemove(connectionId, out var handler))
            {
                connection.SubscriptionChanged -= handler;
            }

            var subscribedDocs = connection.GetSubscriptions().ToList();

            foreach (var docId in subscribedDocs)
            {
                var existing = await _awarenessStore.GetAsync(docId, connectionId);
                var leaveClock = existing?.Clock + 1 ?? 1;

                await _awarenessStore.RemoveAsync(docId, connectionId);

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
                RemoveConnectionFromDocument(docId, connectionId);
            }

            await connection.DisposeAsync();
        }
    }

    // Performance counters for diagnostics
    private static long _totalBroadcastCount = 0;
    private static long _totalBroadcastTimeMs = 0;
    private static long _totalMessagesSent = 0;
    private static long _totalMessagesFailed = 0;
    private static long _maxBroadcastTimeMs = 0;

    /// <summary>
    /// Get broadcast performance metrics for diagnostics.
    /// </summary>
    public static (long BroadcastCount, long TotalTimeMs, long AvgTimeMs, long MaxTimeMs, long MessagesSent, long MessagesFailed) GetBroadcastMetrics()
    {
        var count = Interlocked.Read(ref _totalBroadcastCount);
        var totalTime = Interlocked.Read(ref _totalBroadcastTimeMs);
        var maxTime = Interlocked.Read(ref _maxBroadcastTimeMs);
        var sent = Interlocked.Read(ref _totalMessagesSent);
        var failed = Interlocked.Read(ref _totalMessagesFailed);
        return (count, totalTime, count > 0 ? totalTime / count : 0, maxTime, sent, failed);
    }

    /// <summary>
    /// Reset broadcast performance metrics.
    /// </summary>
    public static void ResetBroadcastMetrics()
    {
        Interlocked.Exchange(ref _totalBroadcastCount, 0);
        Interlocked.Exchange(ref _totalBroadcastTimeMs, 0);
        Interlocked.Exchange(ref _totalMessagesSent, 0);
        Interlocked.Exchange(ref _totalMessagesFailed, 0);
        Interlocked.Exchange(ref _maxBroadcastTimeMs, 0);
    }

    /// <inheritdoc />
    public Task BroadcastToDocumentAsync(string documentId, Protocol.IMessage message, string? excludeConnectionId = null)
    {
        var sw = Stopwatch.StartNew();

        if (!_documentSubscriptions.TryGetValue(documentId, out var connections))
        {
            return Task.CompletedTask;
        }

        var getSubsTime = sw.ElapsedTicks;
        var subCount = connections.Count;
        var sendCount = 0;
        var failCount = 0;

        // Use sequential loop - Connection.Send() is non-blocking (queues to channel)
        // Parallel.ForEach adds thread pool overhead without benefit for non-blocking sends
        foreach (var connection in connections.Values)
        {
            if (excludeConnectionId != null && connection.Id == excludeConnectionId)
                continue;

            // Use Trace level for per-connection logging (hot path)
            _logger.LogTrace("Attempting to send to connection {ConnectionId} (State: {State})",
                connection.Id, connection.State);

            if (connection.Send(message))
            {
                sendCount++;
            }
            else
            {
                failCount++;
                _logger.LogWarning("Failed to send to connection {ConnectionId} (State: {State})",
                    connection.Id, connection.State);
            }
        }

        sw.Stop();
        var elapsedMs = sw.ElapsedMilliseconds;

        // Update performance counters
        Interlocked.Increment(ref _totalBroadcastCount);
        Interlocked.Add(ref _totalBroadcastTimeMs, elapsedMs);
        Interlocked.Add(ref _totalMessagesSent, sendCount);
        Interlocked.Add(ref _totalMessagesFailed, failCount);

        // Record to centralized performance metrics for convergence tracking
        PerformanceMetrics.RecordDeltasBroadcast(sendCount);
        PerformanceMetrics.RecordDeltasDropped(failCount);
        PerformanceMetrics.RecordBroadcastLatency(elapsedMs);

        // Track max broadcast time (compare-and-swap loop)
        long currentMax;
        do
        {
            currentMax = Interlocked.Read(ref _maxBroadcastTimeMs);
            if (elapsedMs <= currentMax)
                break;
        } while (Interlocked.CompareExchange(ref _maxBroadcastTimeMs, elapsedMs, currentMax) != currentMax);

        // Log timing breakdown for broadcasts that take > 1ms
        if (elapsedMs > 1)
        {
            var getSubsTimeMs = (getSubsTime * 1000.0) / Stopwatch.Frequency;
            _logger.LogDebug(
                "Broadcast to document {DocumentId}: {SubCount} subs, {SendCount} sent, {FailCount} failed, " +
                "getSubsTime={GetSubsTime:F2}ms, totalTime={TotalTime}ms",
                documentId, subCount, sendCount, failCount, getSubsTimeMs, elapsedMs);
        }
        else if (failCount > 0)
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

    private void TrackConnectionSubscriptions(IConnection connection)
    {
        void Handler(string documentId, bool subscribed)
        {
            if (subscribed)
            {
                AddConnectionToDocument(documentId, connection);
            }
            else
            {
                RemoveConnectionFromDocument(documentId, connection.Id);
            }
        }

        if (_subscriptionHandlers.TryAdd(connection.Id, Handler))
        {
            connection.SubscriptionChanged += Handler;
        }
    }

    private void AddConnectionToDocument(string documentId, IConnection connection)
    {
        var bucket = _documentSubscriptions.GetOrAdd(documentId, _ => new ConcurrentDictionary<string, IConnection>());
        bucket[connection.Id] = connection;
    }

    private void RemoveConnectionFromDocument(string documentId, string connectionId)
    {
        if (_documentSubscriptions.TryGetValue(documentId, out var bucket))
        {
            bucket.TryRemove(connectionId, out _);

            if (bucket.IsEmpty)
            {
                _documentSubscriptions.TryRemove(documentId, out _);
            }
        }
    }

    /// <summary>
    /// Generates a unique connection ID.
    /// Format: "conn-{counter}" (matches TypeScript server format)
    /// </summary>
    private string GenerateConnectionId()
    {
        var counter = Interlocked.Increment(ref _connectionCounter);
        return $"conn-{counter}";
    }
}
