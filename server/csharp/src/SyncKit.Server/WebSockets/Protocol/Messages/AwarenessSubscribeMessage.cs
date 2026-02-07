using System.Text.Json.Serialization;

namespace SyncKit.Server.WebSockets.Protocol.Messages;

/// <summary>
/// Subscribe to awareness (presence) updates for a document.
/// </summary>
public class AwarenessSubscribeMessage : BaseMessage
{
    [JsonPropertyName("type")]
    public override MessageType Type => MessageType.AwarenessSubscribe;

    /// <summary>
    /// ID of the document to subscribe to awareness updates for.
    /// </summary>
    [JsonPropertyName("documentId")]
    public required string DocumentId { get; set; }
}
