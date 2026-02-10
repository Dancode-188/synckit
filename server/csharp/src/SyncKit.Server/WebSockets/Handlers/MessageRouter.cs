using SyncKit.Server.WebSockets.Protocol;

namespace SyncKit.Server.WebSockets.Handlers;

/// <summary>
/// Routes incoming messages to the appropriate IMessageHandler.
/// </summary>
public class MessageRouter
{
    private readonly Dictionary<MessageType, IMessageHandler> _handlers;
    private readonly ILogger<MessageRouter> _logger;

    public MessageRouter(
        IEnumerable<IMessageHandler> handlers,
        ILogger<MessageRouter> logger)
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
                        "Message type {Type} already registered to {Existing}, overwriting with {New}",
                        type, existing.GetType().Name, handler.GetType().Name);
                }
                _handlers[type] = handler;
                _logger.LogDebug("Registered handler {Handler} for message type {Type}",
                    handler.GetType().Name, type);
            }
        }
    }

    /// <summary>
    /// Route a message to its handler.
    /// </summary>
    /// <param name="connection">The connection that received the message.</param>
    /// <param name="message">The message to route.</param>
    /// <returns>True if a handler was found and invoked, false otherwise.</returns>
    public async Task<bool> RouteAsync(IConnection connection, IMessage message)
    {
        if (_handlers.TryGetValue(message.Type, out var handler))
        {
            _logger.LogTrace("Routing {Type} message to {Handler}",
                message.Type, handler.GetType().Name);

            await handler.HandleAsync(connection, message);
            return true;
        }

        _logger.LogDebug("No handler registered for message type {Type}", message.Type);
        return false;
    }
}
