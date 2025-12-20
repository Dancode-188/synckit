namespace SyncKit.Server.WebSockets.Protocol;

/// <summary>
/// Base interface for all protocol messages.
/// </summary>
/// <remarks>
/// Full message type definitions will be added in P2-03.
/// This minimal interface is defined here to allow protocol handlers (P2-02)
/// to reference the base type.
/// </remarks>
public interface IMessage
{
    /// <summary>
    /// Unique identifier for this message.
    /// </summary>
    string Id { get; set; }

    /// <summary>
    /// Unix timestamp in milliseconds when the message was created.
    /// </summary>
    long Timestamp { get; set; }
}
