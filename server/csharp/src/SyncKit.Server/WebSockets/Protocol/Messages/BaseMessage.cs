using System.Text.Json.Serialization;

namespace SyncKit.Server.WebSockets.Protocol.Messages;

/// <summary>
/// Base class for all protocol messages.
/// </summary>
public abstract class BaseMessage : IMessage
{
    /// <summary>
    /// The type of the message.
    /// </summary>
    [JsonPropertyName("type")]
    public abstract MessageType Type { get; }

    /// <summary>
    /// Unique identifier for this message.
    /// </summary>
    [JsonPropertyName("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    /// <summary>
    /// Unix timestamp in milliseconds when the message was created.
    /// </summary>
    [JsonPropertyName("timestamp")]
    public long Timestamp { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}
