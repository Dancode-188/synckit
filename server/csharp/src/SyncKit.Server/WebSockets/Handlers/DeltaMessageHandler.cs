using System.Text.Json;
using SyncKit.Server.Sync;
using SyncKit.Server.Storage;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.WebSockets.Handlers;

/// <summary>
/// Handles DELTA messages to apply document changes.
/// Implements Last-Write-Wins (LWW) conflict resolution:
/// - Applies delta to server state
/// - Resolves conflicts based on timestamps
/// - Broadcasts authoritative state to ALL subscribers (including sender)
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

        // Auto-subscribe client to document if not already subscribed (matches TypeScript server behavior)
        if (!connection.GetSubscriptions().Contains(delta.DocumentId))
        {
            connection.AddSubscription(delta.DocumentId);
            _logger.LogDebug("Connection {ConnectionId} auto-subscribed to document {DocumentId} on delta",
                connection.Id, delta.DocumentId);
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

        // Get current document state to determine authoritative values (LWW)
        // IMPORTANT: This is AFTER saving the delta, so it reflects LWW resolution
        var currentState = await _storage.GetDocumentStateAsync(delta.DocumentId);

        // Build authoritative delta by checking current state
        // For LWW, we always use the server's current state (which includes all applied deltas)
        var authoritativeDelta = new Dictionary<string, object?>();

        if (deltaData.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in deltaData.EnumerateObject())
            {
                var fieldName = property.Name;

                // Check if this is a tombstone (delete operation)
                var isTombstone = property.Value.ValueKind == JsonValueKind.Object &&
                                  property.Value.TryGetProperty("__deleted", out var deletedProp) &&
                                  deletedProp.ValueKind == JsonValueKind.True;

                // After LWW resolution, check what the authoritative state is
                var fieldExistsInCurrentState = currentState?.ContainsKey(fieldName) == true;

                if (isTombstone)
                {
                    // For deletes: check if delete WON in LWW resolution
                    // If field doesn't exist in current state, delete won → send tombstone
                    // If field exists in current state, a concurrent write WON → send the value
                    if (!fieldExistsInCurrentState)
                    {
                        // Delete won - send tombstone
                        authoritativeDelta[fieldName] = new Dictionary<string, object> { { "__deleted", true } };
                    }
                    else
                    {
                        // A concurrent write won - send the authoritative value
                        authoritativeDelta[fieldName] = currentState![fieldName];
                    }
                }
                else
                {
                    // For sets: check if this write WON in LWW resolution
                    if (fieldExistsInCurrentState)
                    {
                        // Use the authoritative value from current state (may be our value or a concurrent write's value)
                        authoritativeDelta[fieldName] = currentState![fieldName];
                    }
                    else
                    {
                        // Field was deleted by a concurrent operation that won
                        // Send tombstone to ensure all clients converge
                        authoritativeDelta[fieldName] = new Dictionary<string, object> { { "__deleted", true } };
                    }
                }
            }
        }

        // Broadcast authoritative delta to ALL subscribers (including the sender!)
        // This ensures everyone converges to the same state
        var broadcastMessage = new DeltaMessage
        {
            Id = Guid.NewGuid().ToString(),
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = delta.DocumentId,
            Delta = authoritativeDelta,
            VectorClock = delta.VectorClock
        };

        _logger.LogDebug(
            "Broadcasting authoritative delta to document {DocumentId}: {Delta}",
            delta.DocumentId, JsonSerializer.Serialize(authoritativeDelta));

        // Broadcast to ALL subscribers (including sender for convergence)
        await _connectionManager.BroadcastToDocumentAsync(
            delta.DocumentId,
            broadcastMessage,
            excludeConnectionId: null); // Don't exclude anyone!

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

    /// <summary>
    /// Convert a JsonElement to an appropriate .NET object.
    /// </summary>
    private static object? ConvertJsonElement(JsonElement element)
    {
        return element.ValueKind switch
        {
            JsonValueKind.Null => null,
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Number when element.TryGetInt64(out var l) => l,
            JsonValueKind.Number => element.GetDouble(),
            JsonValueKind.String => element.GetString(),
            JsonValueKind.Array => element.EnumerateArray()
                .Select(ConvertJsonElement)
                .ToList(),
            JsonValueKind.Object => element.EnumerateObject()
                .ToDictionary(p => p.Name, p => ConvertJsonElement(p.Value)),
            _ => element.ToString()
        };
    }
}
