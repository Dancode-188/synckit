using SyncKit.Server.WebSockets.Protocol;

namespace SyncKit.Server.WebSockets.Handlers;

/// <summary>
/// Dispatches incoming messages to their appropriate handlers.
/// Routes messages based on type and provides error handling.
/// </summary>
public interface IMessageDispatcher
{
    /// <summary>
    /// Dispatch a message to the appropriate handler.
    /// </summary>
    /// <param name="connection">The connection that received the message.</param>
    /// <param name="message">The message to dispatch.</param>
    /// <returns>Task that completes when dispatching is done.</returns>
    Task DispatchAsync(IConnection connection, IMessage message);
}
