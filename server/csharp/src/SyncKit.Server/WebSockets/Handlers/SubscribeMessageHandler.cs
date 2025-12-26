using SyncKit.Server.Sync;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.WebSockets.Handlers;

/// <summary>
/// Handles SUBSCRIBE messages to subscribe clients to document updates.
/// Enforces read permissions, manages document subscriptions, and sends initial state.
/// </summary>
public class SubscribeMessageHandler : IMessageHandler
{
    private static readonly MessageType[] _handledTypes = [MessageType.Subscribe];

    private readonly AuthGuard _authGuard;
    private readonly IDocumentStore _documentStore;
    private readonly ILogger<SubscribeMessageHandler> _logger;

    public MessageType[] HandledTypes => _handledTypes;

    public SubscribeMessageHandler(
        AuthGuard authGuard,
        IDocumentStore documentStore,
        ILogger<SubscribeMessageHandler> logger)
    {
        _authGuard = authGuard ?? throw new ArgumentNullException(nameof(authGuard));
        _documentStore = documentStore ?? throw new ArgumentNullException(nameof(documentStore));
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

        // Get or create document
        var document = await _documentStore.GetOrCreateAsync(subscribe.DocumentId);

        // Add subscription (both document and connection track this)
        document.Subscribe(connection.Id);
        connection.AddSubscription(subscribe.DocumentId);

        // Get all deltas for initial sync
        var deltas = document.GetDeltasSince(null);

        // Build delta payloads for response
        var deltaPayloads = deltas.Select(d => new DeltaPayload
        {
            Delta = d.Data,
            VectorClock = d.VectorClock.ToDict()
        }).ToList();

        // Send SYNC_RESPONSE with current document state
        var response = new SyncResponseMessage
        {
            Id = Guid.NewGuid().ToString(),
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            RequestId = subscribe.Id,
            DocumentId = subscribe.DocumentId,
            State = document.VectorClock.ToDict(),
            Deltas = deltaPayloads
        };

        connection.Send(response);

        _logger.LogInformation(
            "Connection {ConnectionId} (user {UserId}) subscribed to document {DocumentId} with {DeltaCount} deltas",
            connection.Id, connection.UserId, subscribe.DocumentId, deltas.Count);
    }
}
