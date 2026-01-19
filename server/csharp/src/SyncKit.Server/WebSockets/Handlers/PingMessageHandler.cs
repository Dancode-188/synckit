using SyncKit.Server.Services;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.WebSockets.Handlers;

/// <summary>
/// Handles PING messages to maintain connection health and detect dead connections.
/// Responds with a PONG message.
/// Uses object pooling to reduce allocations during high-frequency heartbeats.
/// </summary>
public class PingMessageHandler : IMessageHandler
{
    private static readonly MessageType[] _handledTypes = [MessageType.Ping];

    private readonly MessagePool? _messagePool;
    private readonly ILogger<PingMessageHandler> _logger;

    public MessageType[] HandledTypes => _handledTypes;

    public PingMessageHandler(ILogger<PingMessageHandler> logger)
        : this(logger, null)
    {
    }

    public PingMessageHandler(ILogger<PingMessageHandler> logger, MessagePool? messagePool)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _messagePool = messagePool;
    }

    public Task HandleAsync(IConnection connection, IMessage message)
    {
        if (message is not PingMessage ping)
        {
            _logger.LogWarning("PingMessageHandler received non-ping message type: {Type}", message.Type);
            return Task.CompletedTask;
        }

        _logger.LogTrace("Received ping from connection {ConnectionId}", connection.Id);

        // Send PONG response (use pooled message if available)
        PongMessage pongMessage;
        if (_messagePool != null)
        {
            pongMessage = _messagePool.RentPongMessage();
        }
        else
        {
            pongMessage = new PongMessage
            {
                Id = Guid.NewGuid().ToString(),
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            };
        }

        connection.Send(pongMessage);

        // Note: We don't return the message to pool here because it may still be
        // in the connection's send queue. For fire-and-forget messages like PONG,
        // the allocation savings come from reusing the same pooled instance on
        // subsequent pings (eventually the pool fills and stabilizes).

        return Task.CompletedTask;
    }
}
