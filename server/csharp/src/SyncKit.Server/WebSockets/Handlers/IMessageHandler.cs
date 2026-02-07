using SyncKit.Server.WebSockets.Protocol;

namespace SyncKit.Server.WebSockets.Handlers;

/// <summary>
/// Interface for handling specific WebSocket message types.
/// Implementations process messages and perform actions on the connection.
/// </summary>
public interface IMessageHandler
{
    /// <summary>
    /// The message types this handler can process.
    /// </summary>
    MessageType[] HandledTypes { get; }

    /// <summary>
    /// Handle an incoming message.
    /// </summary>
    /// <param name="connection">The connection that received the message.</param>
    /// <param name="message">The parsed message.</param>
    /// <returns>Task that completes when handling is done.</returns>
    Task HandleAsync(IConnection connection, IMessage message);
}
