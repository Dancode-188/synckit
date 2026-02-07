namespace SyncKit.Server.WebSockets.Protocol;

/// <summary>
/// Interface for protocol-specific message parsing and serialization.
/// </summary>
/// <remarks>
/// Implementations:
/// - JsonProtocolHandler (P2-04): For test suite compatibility
/// - BinaryProtocolHandler (P2-05): For SDK client efficiency
/// </remarks>
public interface IProtocolHandler
{
    /// <summary>
    /// Parses a raw message into a strongly-typed message object.
    /// </summary>
    /// <param name="data">The raw message bytes.</param>
    /// <returns>The parsed message, or null if parsing failed.</returns>
    IMessage? Parse(ReadOnlyMemory<byte> data);

    /// <summary>
    /// Serializes a message into raw bytes for transmission.
    /// </summary>
    /// <param name="message">The message to serialize.</param>
    /// <returns>The serialized message bytes.</returns>
    ReadOnlyMemory<byte> Serialize(IMessage message);
}
