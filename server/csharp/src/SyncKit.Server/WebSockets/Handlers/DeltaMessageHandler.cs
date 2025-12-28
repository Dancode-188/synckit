using System.Text.Json;
using SyncKit.Server.Sync;
using SyncKit.Server.Storage;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.WebSockets.Handlers;

/// <summary>
/// Handles DELTA messages to apply document changes.
/// Validates permissions, stores deltas, broadcasts to subscribers, and sends ACK.
/// </summary>
public class DeltaMessageHandler : IMessageHandler
{
    private static readonly MessageType[] _handledTypes = [MessageType.Delta];

    private readonly AuthGuard _authGuard;
    private readonly Storage.IStorageAdapter _storage;
    private readonly IConnectionManager _connectionManager;
    private readonly PubSub.IRedisPubSub? _redis;
    private readonly ILogger<DeltaMessageHandler> _logger;

    public MessageType[] HandledTypes => _handledTypes;

    // Backwards-compatible constructor for existing tests (no redis parameter)
    public DeltaMessageHandler(
        AuthGuard authGuard,
        Storage.IStorageAdapter storage,
        IConnectionManager connectionManager,
        ILogger<DeltaMessageHandler> logger)
        : this(authGuard, storage, connectionManager, null, logger)
    {
    }

    public DeltaMessageHandler(
        AuthGuard authGuard,
        Storage.IStorageAdapter storage,
        IConnectionManager connectionManager,
        PubSub.IRedisPubSub? redis,
        ILogger<DeltaMessageHandler> logger)
    {
        _authGuard = authGuard ?? throw new ArgumentNullException(nameof(authGuard));
        _storage = storage ?? throw new ArgumentNullException(nameof(storage));
        _connectionManager = connectionManager ?? throw new ArgumentNullException(nameof(connectionManager));
        _redis = redis;
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

        // Verify the connection is subscribed to this document
        if (!connection.GetSubscriptions().Contains(delta.DocumentId))
        {
            _logger.LogWarning(
                "Connection {ConnectionId} sent delta for unsubscribed document {DocumentId}",
                connection.Id, delta.DocumentId);
            connection.SendError("Not subscribed to document", new { documentId = delta.DocumentId });
            return;
        }

        // Convert the delta data to JsonElement for storage
        JsonElement deltaData;
        if (delta.Delta is JsonElement jsonElement)
        {
            deltaData = jsonElement;
        }
        else
        {
            // Serialize and deserialize to get a proper JsonElement
            var jsonString = JsonSerializer.Serialize(delta.Delta);
            deltaData = JsonSerializer.Deserialize<JsonElement>(jsonString);
        }

        // Create storage delta entry from incoming message
        var deltaEntry = new SyncKit.Server.Storage.DeltaEntry
        {
            Id = delta.Id,
            DocumentId = delta.DocumentId,
            ClientId = connection.ClientId ?? connection.Id,
            OperationType = "set",
            FieldPath = string.Empty,
            Value = deltaData,
            ClockValue = delta.VectorClock.Values.DefaultIfEmpty(0).Max(),
            Timestamp = DateTimeOffset.FromUnixTimeMilliseconds(delta.Timestamp).UtcDateTime,
            VectorClock = delta.VectorClock
        };

        // Store the delta via storage adapter
        await _storage.SaveDeltaAsync(deltaEntry);

        _logger.LogDebug(
            "Stored delta {DeltaId} for document {DocumentId} from client {ClientId}",
            delta.Id, delta.DocumentId, connection.ClientId ?? connection.Id);

        // Broadcast to other subscribers (excluding the sender)
        var broadcastMessage = new DeltaMessage
        {
            Id = Guid.NewGuid().ToString(),
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = delta.DocumentId,
            Delta = delta.Delta,
            VectorClock = delta.VectorClock
        };

        await _connectionManager.BroadcastToDocumentAsync(
            delta.DocumentId,
            broadcastMessage,
            excludeConnectionId: connection.Id);

        // Publish to Redis for other instances
        if (_redis != null)
        {
            try
            {
                await _redis.PublishDeltaAsync(delta.DocumentId, broadcastMessage);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to publish delta to Redis for document {DocumentId}", delta.DocumentId);
            }
        }

        // Send ACK to the sender
        var ackMessage = new AckMessage
        {
            Id = Guid.NewGuid().ToString(),
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            MessageId = delta.Id
        };

        connection.Send(ackMessage);

        _logger.LogInformation(
            "Connection {ConnectionId} (user {UserId}) applied delta {DeltaId} to document {DocumentId}",
            connection.Id, connection.UserId, delta.Id, delta.DocumentId);
    }
}
