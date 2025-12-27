using SyncKit.Server.Sync;
using SyncKit.Server.Storage;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.WebSockets.Handlers;

/// <summary>
/// Handles UNSUBSCRIBE messages to remove clients from document subscriptions.
/// Manages bidirectional subscription tracking and sends acknowledgment.
/// </summary>
public class UnsubscribeMessageHandler : IMessageHandler
{
    private static readonly MessageType[] _handledTypes = [MessageType.Unsubscribe];

    private readonly Storage.IStorageAdapter _storage;
    private readonly IConnectionManager _connectionManager;
    private readonly PubSub.IRedisPubSub? _redis;
    private readonly ILogger<UnsubscribeMessageHandler> _logger;

    public MessageType[] HandledTypes => _handledTypes;

    // Backwards-compatible constructor for tests that used older 2-arg signature
    public UnsubscribeMessageHandler(
        Storage.IStorageAdapter storage,
        ILogger<UnsubscribeMessageHandler> logger)
        : this(storage, new DefaultConnectionManager(), null, logger)
    {
    }

    public UnsubscribeMessageHandler(
        Storage.IStorageAdapter storage,
        IConnectionManager connectionManager,
        PubSub.IRedisPubSub? redis,
        ILogger<UnsubscribeMessageHandler> logger)
    {
        _storage = storage ?? throw new ArgumentNullException(nameof(storage));
        _connectionManager = connectionManager ?? throw new ArgumentNullException(nameof(connectionManager));
        _redis = redis;
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }


    public async Task HandleAsync(IConnection connection, IMessage message)
    {
        if (message is not UnsubscribeMessage unsubscribe)
        {
            _logger.LogWarning("UnsubscribeMessageHandler received non-unsubscribe message type: {Type}",
                message.Type);
            return;
        }

        _logger.LogDebug("Connection {ConnectionId} unsubscribing from document {DocumentId}",
            connection.Id, unsubscribe.DocumentId);


        // Remove document from connection's subscriptions
        connection.RemoveSubscription(unsubscribe.DocumentId);

        // Send ACK to confirm unsubscribe
        var ack = new AckMessage
        {
            Id = Guid.NewGuid().ToString(),
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            MessageId = unsubscribe.Id
        };

        connection.Send(ack);

        _logger.LogInformation(
            "Connection {ConnectionId} (user {UserId}) unsubscribed from document {DocumentId}",
            connection.Id, connection.UserId, unsubscribe.DocumentId);

        // If Redis is configured and there are no more local subscribers, unsubscribe from Redis
        if (_redis != null)
        {
            var localSubs = _connectionManager.GetConnectionsByDocument(unsubscribe.DocumentId).Count;
            if (localSubs == 0)
            {
                await _redis.UnsubscribeAsync(unsubscribe.DocumentId);
            }
        }
    }
}
