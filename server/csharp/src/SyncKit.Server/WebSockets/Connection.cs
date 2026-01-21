using System;
using System.Buffers;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Linq;
using System.Net.WebSockets;
using System.Threading;
using SyncKit.Server.Services;
using SyncKit.Server.WebSockets.Protocol;

namespace SyncKit.Server.WebSockets;

/// <summary>
/// Manages an individual WebSocket connection.
/// Handles connection lifecycle, protocol detection, and message processing.
/// Uses direct send with SemaphoreSlim for thread-safety (matches TypeScript's ws.send() pattern).
/// </summary>
public class Connection : IConnection
{
    private const int BufferSize = 8192; // Increased to 8KB per receive
    private const int MaxMessageSize = 10 * 1024 * 1024; // 10MB max message size

    // Static performance counters for send operations
    private static long _totalSendAttempts = 0;
    private static long _totalSendSuccesses = 0;
    private static long _totalSendDropped = 0;
    private static long _totalSendTimeMs = 0;
    private static long _maxSendTimeMs = 0;
    private static long _totalQueueDepth = 0;
    private static long _maxQueueDepth = 0;

    /// <summary>
    /// Get connection send performance metrics for diagnostics.
    /// </summary>
    public static (long SendAttempts, long SendSuccesses, long SendDropped, long TotalSendTimeMs, long MaxSendTimeMs, long AvgQueueDepth, long MaxQueueDepth) GetSendMetrics()
    {
        var attempts = Interlocked.Read(ref _totalSendAttempts);
        var successes = Interlocked.Read(ref _totalSendSuccesses);
        var dropped = Interlocked.Read(ref _totalSendDropped);
        var totalTime = Interlocked.Read(ref _totalSendTimeMs);
        var maxTime = Interlocked.Read(ref _maxSendTimeMs);
        var totalDepth = Interlocked.Read(ref _totalQueueDepth);
        var maxDepth = Interlocked.Read(ref _maxQueueDepth);
        return (attempts, successes, dropped, totalTime, maxTime, attempts > 0 ? totalDepth / attempts : 0, maxDepth);
    }

    /// <summary>
    /// Reset connection send performance metrics.
    /// </summary>
    public static void ResetSendMetrics()
    {
        Interlocked.Exchange(ref _totalSendAttempts, 0);
        Interlocked.Exchange(ref _totalSendSuccesses, 0);
        Interlocked.Exchange(ref _totalSendDropped, 0);
        Interlocked.Exchange(ref _totalSendTimeMs, 0);
        Interlocked.Exchange(ref _maxSendTimeMs, 0);
        Interlocked.Exchange(ref _totalQueueDepth, 0);
        Interlocked.Exchange(ref _maxQueueDepth, 0);
    }

    private readonly WebSocket _webSocket;
    private readonly IProtocolHandler _jsonHandler;
    private readonly IProtocolHandler _binaryHandler;
    private readonly ILogger<Connection> _logger;
    private readonly CancellationTokenSource _cts = new();
    private readonly ConcurrentDictionary<string, byte> _subscribedDocuments = new();

    /// <inheritdoc />
    public event Action<string, bool>? SubscriptionChanged;

    private byte[]? _rentedBuffer;
    private Timer? _heartbeatTimer;
    private DateTime _lastPong;
    private readonly MemoryStream _messageBuffer = new(); // For accumulating fragmented messages
    private readonly SemaphoreSlim _sendLock = new(1, 1); // Serializes WebSocket sends (required by .NET WebSocket)

    /// <inheritdoc />
    public string Id { get; }

    /// <inheritdoc />
    public ConnectionState State { get; set; }

    /// <inheritdoc />
    public ProtocolType Protocol { get; private set; } = ProtocolType.Unknown;

    /// <inheritdoc />
    public string? UserId { get; set; }

    /// <inheritdoc />
    public string? ClientId { get; set; }

    /// <inheritdoc />
    public Auth.TokenPayload? TokenPayload { get; set; }

    /// <inheritdoc />
    public DateTime LastActivity { get; private set; }

    /// <inheritdoc />
    public bool IsAlive { get; private set; } = true;

    /// <inheritdoc />
    public WebSocket WebSocket => _webSocket;

    /// <inheritdoc />
    public event EventHandler<IMessage>? MessageReceived;

    /// <summary>
    /// Creates a new connection instance.
    /// </summary>
    /// <param name="webSocket">The WebSocket to wrap.</param>
    /// <param name="connectionId">Unique identifier for this connection.</param>
    /// <param name="jsonHandler">JSON protocol handler.</param>
    /// <param name="binaryHandler">Binary protocol handler.</param>
    /// <param name="logger">Logger instance.</param>
    public Connection(
        WebSocket webSocket,
        string connectionId,
        IProtocolHandler jsonHandler,
        IProtocolHandler binaryHandler,
        ILogger<Connection> logger)
    {
        _webSocket = webSocket ?? throw new ArgumentNullException(nameof(webSocket));
        Id = connectionId ?? throw new ArgumentNullException(nameof(connectionId));
        _jsonHandler = jsonHandler ?? throw new ArgumentNullException(nameof(jsonHandler));
        _binaryHandler = binaryHandler ?? throw new ArgumentNullException(nameof(binaryHandler));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        State = ConnectionState.Connecting;
        LastActivity = DateTime.UtcNow;
        _lastPong = DateTime.UtcNow;
    }

    /// <inheritdoc />
    public async Task ProcessMessagesAsync(CancellationToken cancellationToken = default)
    {
        // Only transition to Authenticating if not already authenticated (e.g., auto-auth when auth disabled)
        if (State != ConnectionState.Authenticated)
        {
            State = ConnectionState.Authenticating;
        }
        _rentedBuffer = ArrayPool<byte>.Shared.Rent(BufferSize);
        var buffer = _rentedBuffer;

        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _cts.Token);

        try
        {
            while (_webSocket.State == WebSocketState.Open && !linkedCts.Token.IsCancellationRequested)
            {
                var result = await _webSocket.ReceiveAsync(
                    new ArraySegment<byte>(buffer),
                    linkedCts.Token);

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    _logger.LogDebug("Client {ConnectionId} requested close: {CloseStatus} - {CloseDescription}",
                        Id, result.CloseStatus, result.CloseStatusDescription);
                    await CloseAsync(
                        result.CloseStatus ?? WebSocketCloseStatus.NormalClosure,
                        result.CloseStatusDescription ?? "Client initiated close",
                        CancellationToken.None);
                    break;
                }

                LastActivity = DateTime.UtcNow;
                IsAlive = true;

                // Accumulate message fragments
                _messageBuffer.Write(buffer, 0, result.Count);

                // Check if this is the end of the message
                if (!result.EndOfMessage)
                {
                    // Check for oversized messages
                    if (_messageBuffer.Length > MaxMessageSize)
                    {
                        _logger.LogWarning("Message from connection {ConnectionId} exceeds max size {MaxSize}",
                            Id, MaxMessageSize);
                        _messageBuffer.SetLength(0);
                        await CloseAsync(
                            WebSocketCloseStatus.MessageTooBig,
                            "Message too large",
                            CancellationToken.None);
                        break;
                    }

                    // Wait for more fragments
                    continue;
                }

                // Complete message received
                var completeMessage = _messageBuffer.ToArray();
                _messageBuffer.SetLength(0); // Reset buffer for next message

                // Detect protocol type from first message
                if (Protocol == ProtocolType.Unknown)
                {
                    DetectProtocol(new ReadOnlySpan<byte>(completeMessage));
                }

                // Process the complete message
                await HandleMessageAsync(new ReadOnlyMemory<byte>(completeMessage), linkedCts.Token);
            }
        }
        finally
        {
            State = ConnectionState.Disconnected;
        }
    }

    /// <summary>
    /// Detects the protocol type from the first message.
    /// JSON messages start with '{' (0x7B), '[' (0x5B), or whitespace characters.
    /// Binary messages start with type codes (0x01-0x42 or 0xFF).
    /// Matches the TypeScript implementation exactly.
    /// </summary>
    private void DetectProtocol(ReadOnlySpan<byte> data)
    {
        if (Protocol != ProtocolType.Unknown)
            return;

        // Empty message defaults to Binary
        if (data.Length == 0)
        {
            Protocol = ProtocolType.Binary;
            _logger.LogDebug(
                "Connection {ConnectionId} protocol detected: {Protocol} (empty message, defaulting to binary)",
                Id, Protocol);
            return;
        }

        var firstByte = data[0];

        // Check for JSON indicators
        // JSON starts with '{' (0x7B), '[' (0x5B), or whitespace
        if (firstByte == 0x7B ||  // '{'
            firstByte == 0x5B ||  // '['
            firstByte == 0x20 ||  // space
            firstByte == 0x09 ||  // tab
            firstByte == 0x0A ||  // newline
            firstByte == 0x0D)    // carriage return
        {
            Protocol = ProtocolType.Json;
        }
        else
        {
            Protocol = ProtocolType.Binary;
        }

        _logger.LogDebug(
            "Connection {ConnectionId} protocol detected: {Protocol} (first byte: 0x{FirstByte:X2})",
            Id, Protocol, firstByte);
    }

    /// <summary>
    /// Handles an incoming message.
    /// </summary>
    private Task HandleMessageAsync(ReadOnlyMemory<byte> message, CancellationToken cancellationToken)
    {
        _logger.LogTrace("Connection {ConnectionId} received {ByteCount} bytes ({Protocol})",
            Id, message.Length, Protocol);

        // Select the correct protocol handler
        var handler = Protocol == ProtocolType.Json ? _jsonHandler : _binaryHandler;

        // Parse the message
        var parsedMessage = handler.Parse(message);

        if (parsedMessage is not null)
        {
            // Raise the MessageReceived event for higher-level handlers
            MessageReceived?.Invoke(this, parsedMessage);
        }
        else
        {
            _logger.LogWarning("Failed to parse message from connection {ConnectionId}", Id);
        }

        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public bool Send(IMessage message)
    {
        Interlocked.Increment(ref _totalSendAttempts);

        if (_webSocket.State != WebSocketState.Open)
        {
            _logger.LogDebug("Cannot send message on connection {ConnectionId}: WebSocket not open (State: {State})",
                Id, _webSocket.State);
            return false;
        }

        try
        {
            // Select the correct protocol handler based on detected protocol
            var handler = Protocol == ProtocolType.Json ? _jsonHandler : _binaryHandler;

            // Serialize the message
            var data = handler.Serialize(message);

            if (data.Length == 0)
            {
                _logger.LogWarning("Failed to serialize message {MessageId} on connection {ConnectionId}",
                    message.Id, Id);
                return false;
            }

            // Determine message type (Text for JSON, Binary for Binary protocol)
            var messageType = Protocol == ProtocolType.Json
                ? WebSocketMessageType.Text
                : WebSocketMessageType.Binary;

            // Fire-and-forget async send with semaphore protection
            // This matches TypeScript's synchronous ws.send() pattern
            _ = SendDirectAsync(message, messageType, data);
            
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error preparing message for connection {ConnectionId}", Id);
            return false;
        }
    }

    /// <summary>
    /// Sends a message directly over the WebSocket with semaphore protection.
    /// Uses SemaphoreSlim to serialize sends (required by .NET WebSocket).
    /// This matches TypeScript's direct ws.send() pattern for low latency.
    /// </summary>
    private async Task SendDirectAsync(IMessage message, WebSocketMessageType messageType, ReadOnlyMemory<byte> data)
    {
        var sw = Stopwatch.StartNew();
        
        try
        {
            // Acquire send lock (required because .NET WebSocket doesn't support concurrent sends)
            await _sendLock.WaitAsync(_cts.Token);
            
            try
            {
                if (_webSocket.State != WebSocketState.Open)
                {
                    _logger.LogDebug("Cannot send - WebSocket not open for connection {ConnectionId}", Id);
                    return;
                }

                await _webSocket.SendAsync(data, messageType, true, _cts.Token);
                
                sw.Stop();
                var elapsedMs = sw.ElapsedMilliseconds;
                Interlocked.Increment(ref _totalSendSuccesses);
                Interlocked.Add(ref _totalSendTimeMs, elapsedMs);

                // Track max send time (compare-and-swap loop)
                long currentMax;
                do
                {
                    currentMax = Interlocked.Read(ref _maxSendTimeMs);
                    if (elapsedMs <= currentMax) break;
                } while (Interlocked.CompareExchange(ref _maxSendTimeMs, elapsedMs, currentMax) != currentMax);

                _logger.LogTrace("Sent message {MessageType} {MessageId} to connection {ConnectionId} ({ByteCount} bytes, {ElapsedMs}ms)",
                    message.Type, message.Id, Id, data.Length, elapsedMs);
            }
            finally
            {
                _sendLock.Release();
            }
        }
        catch (OperationCanceledException)
        {
            _logger.LogDebug("Send cancelled for message {MessageId} on connection {ConnectionId}", message.Id, Id);
        }
        catch (WebSocketException ex)
        {
            Interlocked.Increment(ref _totalSendDropped);
            _logger.LogDebug(ex, "WebSocket exception sending message {MessageId} to connection {ConnectionId}", message.Id, Id);
        }
        catch (Exception ex)
        {
            Interlocked.Increment(ref _totalSendDropped);
            _logger.LogError(ex, "Error sending message {MessageId} to connection {ConnectionId}", message.Id, Id);
        }
    }

    /// <inheritdoc />
    public async Task CloseAsync(WebSocketCloseStatus status, string description, CancellationToken cancellationToken = default)
    {
        if (State == ConnectionState.Disconnecting || State == ConnectionState.Disconnected)
            return;

        State = ConnectionState.Disconnecting;

        try
        {
            if (_webSocket.State == WebSocketState.Open || _webSocket.State == WebSocketState.CloseReceived)
            {
                await _webSocket.CloseAsync(status, description, cancellationToken);
            }
        }
        catch (WebSocketException ex)
        {
            _logger.LogDebug(ex, "WebSocket exception during close for connection {ConnectionId}", Id);
        }
        finally
        {
            State = ConnectionState.Disconnected;
        }
    }

    /// <inheritdoc />
    public void AddSubscription(string documentId)
    {
        if (_subscribedDocuments.TryAdd(documentId, 0))
        {
            SubscriptionChanged?.Invoke(documentId, true);
        }
    }

    /// <inheritdoc />
    public void RemoveSubscription(string documentId)
    {
        if (_subscribedDocuments.TryRemove(documentId, out _))
        {
            SubscriptionChanged?.Invoke(documentId, false);
        }
    }

    /// <inheritdoc />
    public IReadOnlySet<string> GetSubscriptions() => _subscribedDocuments.Keys.ToHashSet();

    /// <summary>
    /// Start the heartbeat timer to monitor connection health.
    /// Sends periodic PING messages and terminates the connection if no PONG is received.
    /// </summary>
    /// <param name="intervalMs">Time between ping messages in milliseconds.</param>
    /// <param name="timeoutMs">Maximum time to wait for pong response in milliseconds.</param>
    public void StartHeartbeat(int intervalMs, int timeoutMs)
    {
        // Stop any existing heartbeat timer
        StopHeartbeat();

        _lastPong = DateTime.UtcNow;

        _heartbeatTimer = new Timer(async _ =>
        {
            try
            {
                // Check if connection is stale
                var timeSinceLastPong = (DateTime.UtcNow - _lastPong).TotalMilliseconds;
                if (timeSinceLastPong > timeoutMs)
                {
                    _logger.LogWarning(
                        "Connection {ConnectionId} heartbeat timeout ({ElapsedMs}ms since last pong) - terminating",
                        Id, timeSinceLastPong);
                    await CloseAsync(
                        WebSocketCloseStatus.PolicyViolation,
                        "Heartbeat timeout",
                        CancellationToken.None);
                    return;
                }

                // Send ping
                IsAlive = false; // Will be set to true when pong received
                var pingMessage = new Protocol.Messages.PingMessage
                {
                    Id = Guid.NewGuid().ToString(),
                    Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                };

                if (!Send(pingMessage))
                {
                    _logger.LogDebug("Failed to send ping to connection {ConnectionId}", Id);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in heartbeat timer for connection {ConnectionId}", Id);
            }
        }, null, intervalMs, intervalMs);

        _logger.LogDebug(
            "Started heartbeat for connection {ConnectionId} (interval: {IntervalMs}ms, timeout: {TimeoutMs}ms)",
            Id, intervalMs, timeoutMs);
    }

    /// <summary>
    /// Stop the heartbeat timer.
    /// </summary>
    public void StopHeartbeat()
    {
        if (_heartbeatTimer is not null)
        {
            _heartbeatTimer.Dispose();
            _heartbeatTimer = null;
            _logger.LogDebug("Stopped heartbeat for connection {ConnectionId}", Id);
        }
    }

    /// <summary>
    /// Handle a PONG message received from the client.
    /// Updates last pong timestamp and marks connection as alive.
    /// </summary>
    public void HandlePong()
    {
        _lastPong = DateTime.UtcNow;
        IsAlive = true;
        _logger.LogTrace("Received pong from connection {ConnectionId}", Id);
    }

    /// <summary>
    /// Handle a PING message received from the client.
    /// Responds with a PONG message.
    /// </summary>
    /// <param name="ping">The ping message received.</param>
    public void HandlePing(Protocol.Messages.PingMessage ping)
    {
        var pongMessage = new Protocol.Messages.PongMessage
        {
            Id = Guid.NewGuid().ToString(),
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };

        if (Send(pongMessage))
        {
            _logger.LogTrace("Sent pong to connection {ConnectionId} in response to ping {PingId}",
                Id, ping.Id);
        }
        else
        {
            _logger.LogDebug("Failed to send pong to connection {ConnectionId}", Id);
        }
    }

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        StopHeartbeat();

        await _cts.CancelAsync();
        _cts.Dispose();

        if (_webSocket.State != WebSocketState.Closed && _webSocket.State != WebSocketState.Aborted)
        {
            try
            {
                await _webSocket.CloseAsync(
                    WebSocketCloseStatus.NormalClosure,
                    "Connection disposed",
                    CancellationToken.None);
            }
            catch (WebSocketException)
            {
                // Ignore - socket may already be closed
            }
        }

        _webSocket.Dispose();
        _sendLock.Dispose();

        if (_rentedBuffer is not null)
        {
            ArrayPool<byte>.Shared.Return(_rentedBuffer);
            _rentedBuffer = null;
        }

        _messageBuffer.Dispose();

        GC.SuppressFinalize(this);
    }
}
