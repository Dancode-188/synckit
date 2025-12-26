using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.WebSockets.Handlers;

/// <summary>
/// Handles PING messages to maintain connection health and detect dead connections.
/// Responds with a PONG message.
/// </summary>
public class PingMessageHandler : IMessageHandler
{
    private static readonly MessageType[] _handledTypes = [MessageType.Ping];

    private readonly ILogger<PingMessageHandler> _logger;

    public MessageType[] HandledTypes => _handledTypes;

    public PingMessageHandler(ILogger<PingMessageHandler> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public Task HandleAsync(IConnection connection, IMessage message)
    {
        if (message is not PingMessage ping)
        {
            _logger.LogWarning("PingMessageHandler received non-ping message type: {Type}", message.Type);
            return Task.CompletedTask;
        }

        _logger.LogTrace("Received ping from connection {ConnectionId}", connection.Id);

        // Send PONG response
        var pongMessage = new PongMessage
        {
            Id = Guid.NewGuid().ToString(),
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };

        connection.Send(pongMessage);

        return Task.CompletedTask;
    }
}
