using System.Text.Json.Serialization;

namespace SyncKit.Server.WebSockets.Protocol.Messages;

/// <summary>
/// Unsubscribe from document updates.
/// </summary>
public class UnsubscribeMessage : BaseMessage
{
    [JsonPropertyName("type")]
    public override MessageType Type => MessageType.Unsubscribe;

    /// <summary>
    /// ID of the document to unsubscribe from.
    /// </summary>
    [JsonPropertyName("documentId")]
    public required string DocumentId { get; set; }
}
