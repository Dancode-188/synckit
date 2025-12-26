using System.Text.Json;
using SyncKit.Server.Awareness;
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
    private readonly IAwarenessStore _awarenessStore;
    private readonly IConnectionManager _connectionManager;
    private readonly ILogger<AwarenessUpdateMessageHandler> _logger;

    public MessageType[] HandledTypes => _handledTypes;

    public AwarenessUpdateMessageHandler(
        AuthGuard authGuard,
        IAwarenessStore awarenessStore,
        IConnectionManager connectionManager,
        ILogger<AwarenessUpdateMessageHandler> logger)
    {
        _authGuard = authGuard ?? throw new ArgumentNullException(nameof(authGuard));
        _awarenessStore = awarenessStore ?? throw new ArgumentNullException(nameof(awarenessStore));
        _connectionManager = connectionManager ?? throw new ArgumentNullException(nameof(connectionManager));
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

        // Verify the connection is subscribed to this document
        if (!connection.GetSubscriptions().Contains(update.DocumentId))
        {
            _logger.LogWarning(
                "Connection {ConnectionId} sent awareness update for unsubscribed document {DocumentId}",
                connection.Id, update.DocumentId);
            connection.SendError("Not subscribed to document", new { documentId = update.DocumentId });
            return;
        }

        // Validate state format: must be object or null
        if (update.State.HasValue && update.State.Value.ValueKind != JsonValueKind.Object && update.State.Value.ValueKind != JsonValueKind.Null)
        {
            _logger.LogWarning("Connection {ConnectionId} sent invalid awareness state format for document {DocumentId}", connection.Id, update.DocumentId);
            connection.SendError("Invalid awareness state format");
            return;
        }

        // Store the awareness update (SetAsync returns true if applied)
        var applied = await _awarenessStore.SetAsync(update.DocumentId, update.ClientId,
            AwarenessState.Create(update.ClientId, update.State, update.Clock), update.Clock);

        if (!applied)
        {
            _logger.LogDebug("Ignored stale awareness update from connection {ConnectionId} (clock {Clock})",
                connection.Id, update.Clock);
            return;
        }

        _logger.LogInformation(
            "Connection {ConnectionId} (user {UserId}) sent awareness update for document {DocumentId}",
            connection.Id, connection.UserId, update.DocumentId);

        // Broadcast awareness update to other subscribers (excluding sender)
        var broadcastMessage = new AwarenessUpdateMessage
        {
            Id = Guid.NewGuid().ToString(),
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = update.DocumentId,
            ClientId = update.ClientId,
            State = update.State,
            Clock = update.Clock
        };

        await _connectionManager.BroadcastToDocumentAsync(
            update.DocumentId,
            broadcastMessage,
            excludeConnectionId: connection.Id);
    }
}
