using System.Text.Json;
using SyncKit.Server.Sync;
using SyncKit.Server.Storage;
using SyncKit.Server.Services;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.WebSockets.Handlers;

/// <summary>
/// Handles DELTA messages to apply document changes.
/// Implements Last-Write-Wins (LWW) conflict resolution:
/// - Applies delta to server state
/// - Resolves conflicts based on timestamps
/// - Batches rapid updates (50ms window) before broadcast for efficiency
/// - Broadcasts authoritative state to ALL subscribers (including sender)
/// Uses object pooling to reduce allocations during high-throughput scenarios.
/// </summary>
public class DeltaMessageHandler : IMessageHandler
{
    private static readonly MessageType[] _handledTypes = [MessageType.Delta];

    private readonly AuthGuard _authGuard;
    private readonly Sync.ISyncCoordinator _coordinator;
    private readonly IConnectionManager _connectionManager;
    private readonly DeltaBatchingService? _batchingService;
    private readonly MessagePool? _messagePool;
    private readonly PubSub.IRedisPubSub? _redis;
    private readonly ILogger<DeltaMessageHandler> _logger;

    public MessageType[] HandledTypes => _handledTypes;

    // Backwards-compatible constructor for existing tests (no redis or batching parameters)
    public DeltaMessageHandler(
        AuthGuard authGuard,
        Sync.ISyncCoordinator coordinator,
        IConnectionManager connectionManager,
        ILogger<DeltaMessageHandler> logger)
        : this(authGuard, coordinator, connectionManager, null, null, null, logger)
    {
    }

    public DeltaMessageHandler(
        AuthGuard authGuard,
        Sync.ISyncCoordinator coordinator,
        IConnectionManager connectionManager,
        PubSub.IRedisPubSub? redis,
        ILogger<DeltaMessageHandler> logger)
        : this(authGuard, coordinator, connectionManager, null, null, redis, logger)
    {
    }

    public DeltaMessageHandler(
        AuthGuard authGuard,
        Sync.ISyncCoordinator coordinator,
        IConnectionManager connectionManager,
        DeltaBatchingService? batchingService,
        PubSub.IRedisPubSub? redis,
        ILogger<DeltaMessageHandler> logger)
        : this(authGuard, coordinator, connectionManager, batchingService, null, redis, logger)
    {
    }

    public DeltaMessageHandler(
        AuthGuard authGuard,
        Sync.ISyncCoordinator coordinator,
        IConnectionManager connectionManager,
        DeltaBatchingService? batchingService,
        MessagePool? messagePool,
        PubSub.IRedisPubSub? redis,
        ILogger<DeltaMessageHandler> logger)
    {
        _authGuard = authGuard ?? throw new ArgumentNullException(nameof(authGuard));
        _coordinator = coordinator ?? throw new ArgumentNullException(nameof(coordinator));
        _connectionManager = connectionManager ?? throw new ArgumentNullException(nameof(connectionManager));
        _batchingService = batchingService;
        _messagePool = messagePool;
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

        // Validate delta (check for undefined/null ValueKind since JsonElement is a struct)
        if (delta.Delta.ValueKind == JsonValueKind.Undefined)
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

        // Apply delta via sync coordinator (handles persistence and in-memory state)
        var currentState = await _coordinator.ApplyDeltaAsync(
            delta.DocumentId,
            deltaData,
            delta.VectorClock,
            delta.Timestamp,
            connection.ClientId ?? connection.Id,
            delta.Id);

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
        // Use batching service if available to coalesce rapid updates
        if (_batchingService != null)
        {
            // Batch the delta for efficient broadcast (50ms coalescing window)
            _batchingService.AddToBatch(delta.DocumentId, authoritativeDelta, delta.VectorClock);

            _logger.LogDebug(
                "Queued authoritative delta for batched broadcast to document {DocumentId}: {Delta}",
                delta.DocumentId, JsonSerializer.Serialize(authoritativeDelta));
        }
        else
        {
            // Fallback: direct broadcast (for backwards compatibility/testing)
            // Convert dictionary to JsonElement for source-generated serialization
            var authoritativeDeltaJson = JsonSerializer.SerializeToElement(authoritativeDelta);

            var broadcastMessage = new DeltaMessage
            {
                Id = Guid.NewGuid().ToString(),
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                DocumentId = delta.DocumentId,
                Delta = authoritativeDeltaJson,
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
        }

        // Send ACK to the sender (use pooled message if available)
        AckMessage ackMessage;
        if (_messagePool != null)
        {
            ackMessage = _messagePool.RentAckMessage(delta.Id);
        }
        else
        {
            ackMessage = new AckMessage
            {
                Id = Guid.NewGuid().ToString(),
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                MessageId = delta.Id
            };
        }

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
