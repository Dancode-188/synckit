using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.WebSockets.Handlers;

/// <summary>
/// Handles AWARENESS_SUBSCRIBE messages to subscribe to awareness updates.
/// Enforces authentication before allowing awareness subscription.
/// </summary>
public class AwarenessSubscribeMessageHandler : IMessageHandler
{
    private readonly AuthGuard _authGuard;
    private readonly ILogger<AwarenessSubscribeMessageHandler> _logger;

    public MessageType[] HandledTypes => new[] { MessageType.AwarenessSubscribe };

    public AwarenessSubscribeMessageHandler(
        AuthGuard authGuard,
        ILogger<AwarenessSubscribeMessageHandler> logger)
    {
        _authGuard = authGuard ?? throw new ArgumentNullException(nameof(authGuard));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task HandleAsync(IConnection connection, IMessage message)
    {
        if (message is not AwarenessSubscribeMessage subscribe)
        {
            _logger.LogWarning("AwarenessSubscribeMessageHandler received non-awareness-subscribe message type: {Type}",
                message.Type);
            return;
        }

        _logger.LogDebug("Connection {ConnectionId} subscribing to awareness for document {DocumentId}",
            connection.Id, subscribe.DocumentId);

        // Enforce awareness permission (authentication)
        if (!_authGuard.RequireAwareness(connection))
        {
            _logger.LogDebug("Awareness subscribe rejected for connection {ConnectionId}",
                connection.Id);
            return;
        }

        // TODO: Implement awareness subscription logic in Phase 5 (Awareness)
        // For now, just log success
        _logger.LogInformation(
            "Connection {ConnectionId} (user {UserId}) subscribed to awareness for document {DocumentId}",
            connection.Id, connection.UserId, subscribe.DocumentId);

        // TODO: Send AWARENESS_STATE with current awareness state
        // This will be implemented in Phase 5
        await Task.CompletedTask;
    }
}
