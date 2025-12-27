using SyncKit.Server.Sync;
using SyncKit.Server.Storage;
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
    private readonly Storage.IStorageAdapter _storage;
    private readonly IConnectionManager _connectionManager;
    private readonly PubSub.IRedisPubSub? _redis;
    private readonly ILogger<SubscribeMessageHandler> _logger;

    public MessageType[] HandledTypes => _handledTypes;

    // Backwards-compatible constructor for tests that used old 3-arg constructor
    public SubscribeMessageHandler(
        AuthGuard authGuard,
        Storage.IStorageAdapter storage,
        ILogger<SubscribeMessageHandler> logger)
        : this(authGuard, storage, new DefaultConnectionManager(), null, logger)
    {
    }

    public SubscribeMessageHandler(
        AuthGuard authGuard,
        Storage.IStorageAdapter storage,
        IConnectionManager connectionManager,
        PubSub.IRedisPubSub? redis,
        ILogger<SubscribeMessageHandler> logger)
    {
        _authGuard = authGuard ?? throw new ArgumentNullException(nameof(authGuard));
        _storage = storage ?? throw new ArgumentNullException(nameof(storage));
        _connectionManager = connectionManager ?? throw new ArgumentNullException(nameof(connectionManager));
        _redis = redis;
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

        // Get or create document (supports legacy Document operations via adapter)
        var document = await _storage.GetOrCreateDocumentAsync(subscribe.DocumentId);

        // Add subscription (both document and connection track this)
        document.Subscribe(connection.Id);
        connection.AddSubscription(subscribe.DocumentId);

        // If Redis is configured and this is the first local subscriber, subscribe to Redis channels
        if (_redis != null)
        {
            var localSubs = _connectionManager.GetConnectionsByDocument(subscribe.DocumentId).Count;
            if (localSubs == 1)
            {
                // Register a handler that broadcasts messages to local connections
                await _redis.SubscribeAsync(subscribe.DocumentId, async (msg) =>
                {
                    await _connectionManager.BroadcastToDocumentAsync(subscribe.DocumentId, msg, excludeConnectionId: null);
                });
            }
        }

        // Get all deltas for initial sync
        var deltas = await _storage.GetDeltasSinceViaAdapterAsync(subscribe.DocumentId, null);

        // Build delta payloads for response
        var deltaPayloads = deltas.Select(d => new DeltaPayload
        {
            Delta = d.Data,
            VectorClock = d.VectorClock?.ToDict() ?? new Dictionary<string, long>()
        }).ToList();

        // Send SYNC_RESPONSE with current document state
        var response = new SyncResponseMessage
        {
            Id = Guid.NewGuid().ToString(),
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            RequestId = subscribe.Id,
            DocumentId = subscribe.DocumentId,
            State = await _storage.GetVectorClockAsync(subscribe.DocumentId),
            Deltas = deltaPayloads
        };

        connection.Send(response);

        _logger.LogInformation(
            "Connection {ConnectionId} (user {UserId}) subscribed to document {DocumentId} with {DeltaCount} deltas",
            connection.Id, connection.UserId, subscribe.DocumentId, deltas.Count);
    }
}
