using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.WebSockets.Handlers;

/// <summary>
/// Handles AWARENESS_UPDATE messages to update user presence/awareness state.
/// Enforces authentication before allowing awareness updates.
/// </summary>
public class AwarenessUpdateMessageHandler : IMessageHandler
{
    private static readonly MessageType[] _handledTypes = [MessageType.AwarenessUpdate];

    private readonly AuthGuard _authGuard;
    private readonly ILogger<AwarenessUpdateMessageHandler> _logger;

    public MessageType[] HandledTypes => _handledTypes;

    public AwarenessUpdateMessageHandler(
        AuthGuard authGuard,
        ILogger<AwarenessUpdateMessageHandler> logger)
    {
        _authGuard = authGuard ?? throw new ArgumentNullException(nameof(authGuard));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task HandleAsync(IConnection connection, IMessage message)
    {
        if (message is not AwarenessUpdateMessage update)
        {
            _logger.LogWarning("AwarenessUpdateMessageHandler received non-awareness-update message type: {Type}",
                message.Type);
            return;
        }

        _logger.LogDebug("Connection {ConnectionId} sending awareness update for document {DocumentId}",
            connection.Id, update.DocumentId);

        // Enforce awareness permission (authentication)
        if (!_authGuard.RequireAwareness(connection))
        {
            _logger.LogDebug("Awareness update rejected for connection {ConnectionId}",
                connection.Id);
            return;
        }

        // TODO: Implement awareness update logic in Phase 5 (Awareness)
        // For now, just log success
        _logger.LogInformation(
            "Connection {ConnectionId} (user {UserId}) sent awareness update for document {DocumentId}",
            connection.Id, connection.UserId, update.DocumentId);

        // TODO: Broadcast awareness update to other subscribers
        // This will be implemented in Phase 5
        await Task.CompletedTask;
    }
}
