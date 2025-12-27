using SyncKit.Server.Sync;
using SyncKit.Server.Storage;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.WebSockets.Handlers;

/// <summary>
/// Handles SYNC_REQUEST messages for clients requesting missed updates since their vector clock.
/// Validates authentication/authorization, retrieves deltas since client's clock, and returns current server state.
/// </summary>
public class SyncRequestMessageHandler : IMessageHandler
{
    private static readonly MessageType[] _handledTypes = [MessageType.SyncRequest];

    private readonly AuthGuard _authGuard;
    private readonly Storage.IStorageAdapter _storage;
    private readonly ILogger<SyncRequestMessageHandler> _logger;

    public MessageType[] HandledTypes => _handledTypes;

    public SyncRequestMessageHandler(
        AuthGuard authGuard,
        Storage.IStorageAdapter storage,
        ILogger<SyncRequestMessageHandler> logger)
    {
        _authGuard = authGuard ?? throw new ArgumentNullException(nameof(authGuard));
        _storage = storage ?? throw new ArgumentNullException(nameof(storage));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }


    public async Task HandleAsync(IConnection connection, IMessage message)
    {
        if (message is not SyncRequestMessage request)
        {
            _logger.LogWarning("SyncRequestMessageHandler received non-sync-request message type: {Type}",
                message.Type);
            return;
        }

        _logger.LogDebug("Connection {ConnectionId} requesting sync for document {DocumentId}",
            connection.Id, request.DocumentId);

        // Enforce authentication and read permission
        if (!_authGuard.RequireRead(connection, request.DocumentId))
        {
            _logger.LogDebug("Sync request rejected for connection {ConnectionId} to document {DocumentId}",
                connection.Id, request.DocumentId);
            return;
        }


        // Determine whether the document exists. Prefer adapter-check; fall back to legacy store when present.
        var docState = await _storage.GetDocumentAsync(request.DocumentId);
        var documentExists = docState != null;

        if (!documentExists)
        {
            // Document doesn't exist - send empty response
            _logger.LogDebug(
                "Sync request for non-existent document {DocumentId} from connection {ConnectionId}",
                request.DocumentId, connection.Id);

            var emptyResponse = new SyncResponseMessage
            {
                Id = Guid.NewGuid().ToString(),
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                RequestId = request.Id,
                DocumentId = request.DocumentId,
                State = new Dictionary<string, long>(),
                Deltas = new List<DeltaPayload>()
            };

            connection.Send(emptyResponse);
            return;
        }


        // Get client's vector clock (may be null for initial sync)
        var clientClock = request.VectorClock != null
            ? VectorClock.FromDict(request.VectorClock)
            : null;

        // Get deltas since client's vector clock via adapter helper
        var deltas = await _storage.GetDeltasSinceViaAdapterAsync(request.DocumentId, clientClock);

        _logger.LogDebug(
            "Sync request for {DocumentId}: returning {DeltaCount} deltas since clock {Clock}",
            request.DocumentId, deltas.Count,
            clientClock != null ? string.Join(", ", clientClock.Entries.Select(e => $"{e.Key}:{e.Value}")) : "null");

        // Build delta payloads for response
        var deltaPayloads = deltas.Select(d => new DeltaPayload
        {
            Delta = d.Data,
            VectorClock = d.VectorClock?.ToDict() ?? new Dictionary<string, long>()
        }).ToList();

        // Send SYNC_RESPONSE with current document state and missed deltas
        var response = new SyncResponseMessage
        {
            Id = Guid.NewGuid().ToString(),
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            RequestId = request.Id,
            DocumentId = request.DocumentId,
            State = await _storage.GetVectorClockAsync(request.DocumentId),
            Deltas = deltaPayloads
        };

        connection.Send(response);
        _logger.LogInformation(
            "Connection {ConnectionId} (user {UserId}) sync request for document {DocumentId}: returned {DeltaCount} deltas",
            connection.Id, connection.UserId, request.DocumentId, deltas.Count);
    }
}
