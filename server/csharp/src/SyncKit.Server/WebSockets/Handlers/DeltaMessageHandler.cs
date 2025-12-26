using System.Text.Json;
using SyncKit.Server.Sync;
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
    private readonly IDocumentStore _documentStore;
    private readonly IConnectionManager _connectionManager;
    private readonly ILogger<DeltaMessageHandler> _logger;

    public MessageType[] HandledTypes => _handledTypes;

    public DeltaMessageHandler(
        AuthGuard authGuard,
        IDocumentStore documentStore,
        IConnectionManager connectionManager,
        ILogger<DeltaMessageHandler> logger)
    {
        _authGuard = authGuard ?? throw new ArgumentNullException(nameof(authGuard));
        _documentStore = documentStore ?? throw new ArgumentNullException(nameof(documentStore));
        _connectionManager = connectionManager ?? throw new ArgumentNullException(nameof(connectionManager));
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

        // Create stored delta with vector clock
        var storedDelta = new StoredDelta
        {
            Id = delta.Id,
            ClientId = connection.ClientId ?? connection.Id,
            Timestamp = delta.Timestamp,
            Data = deltaData,
            VectorClock = VectorClock.FromDict(delta.VectorClock)
        };

        // Store the delta
        await _documentStore.AddDeltaAsync(delta.DocumentId, storedDelta);

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
