using SyncKit.Server.Sync;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.WebSockets.Handlers;

/// <summary>
/// Handles UNSUBSCRIBE messages to remove clients from document subscriptions.
/// Manages bidirectional subscription tracking and sends acknowledgment.
/// </summary>
public class UnsubscribeMessageHandler : IMessageHandler
{
    private readonly IDocumentStore _documentStore;
    private readonly ILogger<UnsubscribeMessageHandler> _logger;

    public MessageType[] HandledTypes => new[] { MessageType.Unsubscribe };

    public UnsubscribeMessageHandler(
        IDocumentStore documentStore,
        ILogger<UnsubscribeMessageHandler> logger)
    {
        _documentStore = documentStore ?? throw new ArgumentNullException(nameof(documentStore));
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

        // Get document if it exists (no error if it doesn't)
        var document = await _documentStore.GetAsync(unsubscribe.DocumentId);

        // Remove subscription from document (if document exists)
        if (document != null)
        {
            document.Unsubscribe(connection.Id);
        }

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
    }
}
