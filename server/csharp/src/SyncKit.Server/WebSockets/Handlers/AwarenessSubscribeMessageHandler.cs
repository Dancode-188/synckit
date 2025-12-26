using System.Linq;
using System.Text.Json;
using SyncKit.Server.Awareness;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.WebSockets.Handlers;

/// <summary>
/// Handles AWARENESS_SUBSCRIBE messages to subscribe to awareness updates.
/// Enforces authentication before allowing awareness subscription.
/// Sends current AWARENESS_STATE for the requested document.
/// </summary>
public class AwarenessSubscribeMessageHandler : IMessageHandler
{
    private static readonly MessageType[] _handledTypes = [MessageType.AwarenessSubscribe];

    private readonly AuthGuard _authGuard;
    private readonly IAwarenessStore _awarenessStore;
    private readonly ILogger<AwarenessSubscribeMessageHandler> _logger;

    public MessageType[] HandledTypes => _handledTypes;

    public AwarenessSubscribeMessageHandler(
        AuthGuard authGuard,
        IAwarenessStore awarenessStore,
        ILogger<AwarenessSubscribeMessageHandler> logger)
    {
        _authGuard = authGuard ?? throw new ArgumentNullException(nameof(authGuard));
        _awarenessStore = awarenessStore ?? throw new ArgumentNullException(nameof(awarenessStore));
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

        // Track subscription on the connection
        connection.AddSubscription(subscribe.DocumentId);

        // Fetch current active awareness entries (GetAllAsync excludes expired)
        var entries = await _awarenessStore.GetAllAsync(subscribe.DocumentId);

        var states = entries.Select(e =>
        {
            var stateElement = e.State.State ?? JsonDocument.Parse("null").RootElement;
            return new AwarenessClientState
            {
                ClientId = e.ClientId,
                State = stateElement,
                Clock = e.Clock
            };
        }).ToList();

        var response = new AwarenessStateMessage
        {
            Id = subscribe.Id,
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = subscribe.DocumentId,
            States = states
        };

        connection.Send(response);

        _logger.LogInformation(
            "Connection {ConnectionId} (user {UserId}) subscribed to awareness for document {DocumentId} and received {StateCount} states",
            connection.Id, connection.UserId, subscribe.DocumentId, states.Count);
    }
}
