using System.Text.Json.Serialization;

namespace SyncKit.Server.WebSockets.Protocol.Messages;

/// <summary>
/// Subscribe to document updates.
/// </summary>
public class SubscribeMessage : BaseMessage
{
    [JsonPropertyName("type")]
    public override MessageType Type => MessageType.Subscribe;

    /// <summary>
    /// ID of the document to subscribe to.
    /// </summary>
    [JsonPropertyName("documentId")]
    public required string DocumentId { get; set; }
}
