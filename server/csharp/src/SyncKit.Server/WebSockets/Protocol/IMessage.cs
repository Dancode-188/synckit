namespace SyncKit.Server.WebSockets.Protocol;

/// <summary>
/// Base interface for all protocol messages.
/// </summary>
public interface IMessage
{
    /// <summary>
    /// The type of the message.
    /// </summary>
    MessageType Type { get; }

    /// <summary>
    /// Unique identifier for this message.
    /// </summary>
    string Id { get; set; }

    /// <summary>
    /// Unix timestamp in milliseconds when the message was created.
    /// </summary>
    long Timestamp { get; set; }
}
