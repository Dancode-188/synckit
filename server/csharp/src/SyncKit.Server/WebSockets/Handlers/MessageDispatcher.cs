using SyncKit.Server.WebSockets.Protocol;

namespace SyncKit.Server.WebSockets.Handlers;

/// <summary>
/// Routes incoming messages to the appropriate handler based on message type.
/// Provides centralized message dispatch with error handling and logging.
/// Unknown message types are logged with a warning.
/// Handler exceptions are caught and logged without crashing the server.
/// </summary>
public class MessageDispatcher : IMessageDispatcher
{
    private readonly Dictionary<MessageType, IMessageHandler> _handlers;
    private readonly ILogger<MessageDispatcher> _logger;

    /// <summary>
    /// Creates a new message dispatcher with registered handlers.
    /// </summary>
    /// <param name="handlers">Collection of all registered message handlers.</param>
    /// <param name="logger">Logger for this dispatcher.</param>
    public MessageDispatcher(
        IEnumerable<IMessageHandler> handlers,
        ILogger<MessageDispatcher> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _handlers = new Dictionary<MessageType, IMessageHandler>();

        // Register all handlers
        foreach (var handler in handlers)
        {
            foreach (var type in handler.HandledTypes)
            {
                if (_handlers.TryGetValue(type, out var existing))
                {
                    _logger.LogWarning(
                        "Message type {MessageType} already registered to {ExistingHandler}, " +
                        "overwriting with {NewHandler}",
                        type, existing.GetType().Name, handler.GetType().Name);
                }

                _handlers[type] = handler;
                _logger.LogDebug("Registered handler {HandlerName} for message type {MessageType}",
                    handler.GetType().Name, type);
            }
        }
    }

    /// <inheritdoc />
    public async Task DispatchAsync(IConnection connection, IMessage message)
    {
        // Check if we have a handler for this message type
        if (!_handlers.TryGetValue(message.Type, out var handler))
        {
            _logger.LogWarning("No handler registered for message type: {MessageType}", message.Type);

            // Send error response for unknown message types
            connection.SendError($"Unknown message type: {message.Type}");
            return;
        }

        // Handler found - invoke it with exception handling
        try
        {
            _logger.LogTrace("Dispatching {MessageType} message {MessageId} to {HandlerName}",
                message.Type, message.Id, handler.GetType().Name);

            await handler.HandleAsync(connection, message);
        }
        catch (Exception ex)
        {
            // Log handler exceptions without crashing the server
            _logger.LogError(ex,
                "Error in handler {HandlerName} while processing {MessageType} message {MessageId}",
                handler.GetType().Name, message.Type, message.Id);

            // Send error response to client
            try
            {
                connection.SendError("Internal server error");
            }
            catch (Exception sendEx)
            {
                _logger.LogError(sendEx,
                    "Failed to send error response to connection {ConnectionId}",
                    connection.Id);
            }
        }
    }
}
