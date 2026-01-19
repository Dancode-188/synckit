using SyncKit.Server.Services;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.WebSockets.Handlers;

/// <summary>
/// Handles ACK messages from clients acknowledging receipt of server messages.
/// Integrates with AckTracker to clear pending ACKs and cancel retry timers.
/// </summary>
public class AckMessageHandler : IMessageHandler
{
    private static readonly MessageType[] _handledTypes = [MessageType.Ack];

    private readonly AckTracker? _ackTracker;
    private readonly ILogger<AckMessageHandler> _logger;

    public MessageType[] HandledTypes => _handledTypes;

    /// <summary>
    /// Creates an AckMessageHandler with optional ACK tracking support.
    /// </summary>
    /// <param name="logger">Logger for diagnostics.</param>
    /// <param name="ackTracker">Optional ACK tracker for retry support. If null, ACKs are logged but not tracked.</param>
    public AckMessageHandler(ILogger<AckMessageHandler> logger, AckTracker? ackTracker = null)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _ackTracker = ackTracker;
    }

    public Task HandleAsync(IConnection connection, IMessage message)
    {
        if (message is not AckMessage ack)
        {
            _logger.LogWarning("AckMessageHandler received non-ack message type: {Type}", message.Type);
            return Task.CompletedTask;
        }

        // Process ACK through the tracker if available
        if (_ackTracker != null)
        {
            var wasTracked = _ackTracker.AcknowledgeMessage(connection.Id, ack.MessageId);
            if (wasTracked)
            {
                _logger.LogDebug("ACK processed for message {MessageId} from connection {ConnectionId}",
                    ack.MessageId, connection.Id);
            }
            else
            {
                _logger.LogTrace("ACK for unknown/duplicate message {MessageId} from connection {ConnectionId}",
                    ack.MessageId, connection.Id);
            }
        }
        else
        {
            // No tracker - just log for diagnostics
            _logger.LogDebug("Received ACK from connection {ConnectionId} for message {MessageId}",
                connection.Id, ack.MessageId);
        }

        return Task.CompletedTask;
    }
}
