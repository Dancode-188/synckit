using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.WebSockets.Handlers;

/// <summary>
/// Handles ACK messages from clients acknowledging receipt of server messages.
/// Currently a no-op handler - ACK tracking is not yet implemented.
/// </summary>
public class AckMessageHandler : IMessageHandler
{
    private static readonly MessageType[] _handledTypes = [MessageType.Ack];

    private readonly ILogger<AckMessageHandler> _logger;

    public MessageType[] HandledTypes => _handledTypes;

    public AckMessageHandler(ILogger<AckMessageHandler> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public Task HandleAsync(IConnection connection, IMessage message)
    {
        if (message is not AckMessage ack)
        {
            _logger.LogWarning("AckMessageHandler received non-ack message type: {Type}", message.Type);
            return Task.CompletedTask;
        }

        // ACK messages acknowledge receipt of server messages
        // Currently a no-op - we could track pending messages and clear timeouts here
        _logger.LogDebug("Received ACK from connection {ConnectionId} for message {MessageId}",
            connection.Id, ack.MessageId);

        return Task.CompletedTask;
    }
}
