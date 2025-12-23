using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.WebSockets.Handlers;

/// <summary>
/// Handles SUBSCRIBE messages to subscribe clients to document updates.
/// Enforces read permissions before allowing subscription.
/// </summary>
public class SubscribeMessageHandler : IMessageHandler
{
    private readonly AuthGuard _authGuard;
    private readonly ILogger<SubscribeMessageHandler> _logger;

    public MessageType[] HandledTypes => new[] { MessageType.Subscribe };

    public SubscribeMessageHandler(
        AuthGuard authGuard,
        ILogger<SubscribeMessageHandler> logger)
    {
        _authGuard = authGuard ?? throw new ArgumentNullException(nameof(authGuard));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task HandleAsync(IConnection connection, IMessage message)
    {
        if (message is not SubscribeMessage subscribe)
        {
            _logger.LogWarning("SubscribeMessageHandler received non-subscribe message type: {Type}",
                message.Type);
            return;
        }

        _logger.LogDebug("Connection {ConnectionId} subscribing to document {DocumentId}",
            connection.Id, subscribe.DocumentId);

        // Enforce read permission
        if (!_authGuard.RequireRead(connection, subscribe.DocumentId))
        {
            _logger.LogDebug("Subscribe rejected for connection {ConnectionId} to document {DocumentId}",
                connection.Id, subscribe.DocumentId);
            return;
        }

        // TODO: Implement subscription logic in Phase 4 (Sync Engine)
        // For now, just log success and add to connection's subscription list
        connection.AddSubscription(subscribe.DocumentId);

        _logger.LogInformation(
            "Connection {ConnectionId} (user {UserId}) subscribed to document {DocumentId}",
            connection.Id, connection.UserId, subscribe.DocumentId);

        // TODO: Send SYNC_RESPONSE with current document state
        // This will be implemented in Phase 4
        await Task.CompletedTask;
    }
}
