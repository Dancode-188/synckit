using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.WebSockets.Handlers;

/// <summary>
/// Handles PONG messages received from clients in response to PING messages.
/// Updates connection heartbeat status to indicate the connection is still alive.
/// </summary>
public class PongMessageHandler : IMessageHandler
{
    private static readonly MessageType[] _handledTypes = [MessageType.Pong];

    private readonly ILogger<PongMessageHandler> _logger;

    public MessageType[] HandledTypes => _handledTypes;

    public PongMessageHandler(ILogger<PongMessageHandler> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public Task HandleAsync(IConnection connection, IMessage message)
    {
        if (message is not PongMessage pong)
        {
            _logger.LogWarning("PongMessageHandler received non-pong message type: {Type}", message.Type);
            return Task.CompletedTask;
        }

        _logger.LogTrace("Received pong from connection {ConnectionId}", connection.Id);

        // Mark connection as alive (heartbeat timer uses this)
        connection.HandlePong();

        return Task.CompletedTask;
    }
}
