using System.Buffers;
using System.Net.WebSockets;
using SyncKit.Server.WebSockets.Protocol;

namespace SyncKit.Server.WebSockets;

/// <summary>
/// Manages an individual WebSocket connection.
/// Handles connection lifecycle, protocol detection, and message processing.
/// </summary>
public class Connection : IConnection
{
    private const int BufferSize = 4096;

    private readonly WebSocket _webSocket;
    private readonly IProtocolHandler _jsonHandler;
    private readonly IProtocolHandler _binaryHandler;
    private readonly ILogger<Connection> _logger;
    private readonly CancellationTokenSource _cts = new();
    private readonly HashSet<string> _subscribedDocuments = new();
    private byte[]? _rentedBuffer;

    /// <inheritdoc />
    public string Id { get; }

    /// <inheritdoc />
    public ConnectionState State { get; private set; }

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
    }

    /// <inheritdoc />
    public async Task ProcessMessagesAsync(CancellationToken cancellationToken = default)
    {
        State = ConnectionState.Authenticating;
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

                // Detect protocol type from first message
                if (Protocol == ProtocolType.Unknown)
                {
                    DetectProtocol(new ReadOnlySpan<byte>(buffer, 0, result.Count));
                }

                // Process the message - full implementation in P2-02
                var messageBytes = new ReadOnlyMemory<byte>(buffer, 0, result.Count);
                await HandleMessageAsync(messageBytes, linkedCts.Token);
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

            // Send the message synchronously (WebSocket SendAsync is thread-safe)
            _webSocket.SendAsync(data, messageType, true, CancellationToken.None)
                .AsTask()
                .GetAwaiter()
                .GetResult();

            _logger.LogTrace("Sent message {MessageId} to connection {ConnectionId} ({ByteCount} bytes)",
                message.Id, Id, data.Length);

            return true;
        }
        catch (WebSocketException ex)
        {
            _logger.LogDebug(ex, "WebSocket exception sending message to connection {ConnectionId}", Id);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error sending message to connection {ConnectionId}", Id);
            return false;
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
        _subscribedDocuments.Add(documentId);
    }

    /// <inheritdoc />
    public void RemoveSubscription(string documentId)
    {
        _subscribedDocuments.Remove(documentId);
    }

    /// <inheritdoc />
    public IReadOnlySet<string> GetSubscriptions() => _subscribedDocuments;

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
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

        if (_rentedBuffer is not null)
        {
            ArrayPool<byte>.Shared.Return(_rentedBuffer);
            _rentedBuffer = null;
        }

        GC.SuppressFinalize(this);
    }
}
