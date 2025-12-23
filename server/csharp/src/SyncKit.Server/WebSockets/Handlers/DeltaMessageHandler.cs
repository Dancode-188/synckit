using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.WebSockets.Handlers;

/// <summary>
/// Handles DELTA messages to apply document changes.
/// Enforces write permissions before allowing delta application.
/// </summary>
public class DeltaMessageHandler : IMessageHandler
{
    private readonly AuthGuard _authGuard;
    private readonly ILogger<DeltaMessageHandler> _logger;

    public MessageType[] HandledTypes => new[] { MessageType.Delta };

    public DeltaMessageHandler(
        AuthGuard authGuard,
        ILogger<DeltaMessageHandler> logger)
    {
        _authGuard = authGuard ?? throw new ArgumentNullException(nameof(authGuard));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task HandleAsync(IConnection connection, IMessage message)
    {
        if (message is not DeltaMessage delta)
        {
            _logger.LogWarning("DeltaMessageHandler received non-delta message type: {Type}",
                message.Type);
            return;
        }

        _logger.LogDebug("Connection {ConnectionId} sending delta for document {DocumentId}",
            connection.Id, delta.DocumentId);

        // Validate delta (Delta is an object, so we just check for null)
        if (delta.Delta == null)
        {
            connection.SendError("Invalid delta message: missing or empty delta");
            return;
        }

        // Enforce write permission
        if (!_authGuard.RequireWrite(connection, delta.DocumentId))
        {
            _logger.LogDebug("Delta rejected for connection {ConnectionId} to document {DocumentId}",
                connection.Id, delta.DocumentId);
            return;
        }

        // TODO: Implement delta application logic in Phase 4 (Sync Engine)
        // For now, just log success
        _logger.LogInformation(
            "Connection {ConnectionId} (user {UserId}) sent delta for document {DocumentId}",
            connection.Id, connection.UserId, delta.DocumentId);

        // TODO: Apply delta, broadcast to subscribers, send ACK
        // This will be implemented in Phase 4
        await Task.CompletedTask;
    }
}
