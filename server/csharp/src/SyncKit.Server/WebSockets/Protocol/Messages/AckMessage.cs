using System.Text.Json.Serialization;

namespace SyncKit.Server.WebSockets.Protocol.Messages;

/// <summary>
/// Acknowledgment message for received messages.
/// </summary>
public class AckMessage : BaseMessage
{
    [JsonPropertyName("type")]
    public override MessageType Type => MessageType.Ack;

    /// <summary>
    /// ID of the message being acknowledged.
    /// </summary>
    [JsonPropertyName("messageId")]
    public required string MessageId { get; set; }
}
