using System.Text.Json.Serialization;

namespace SyncKit.Server.WebSockets.Protocol.Messages;

/// <summary>
/// Request to sync a document.
/// </summary>
public class SyncRequestMessage : BaseMessage
{
    [JsonPropertyName("type")]
    public override MessageType Type => MessageType.SyncRequest;

    /// <summary>
    /// ID of the document to sync.
    /// </summary>
    [JsonPropertyName("documentId")]
    public required string DocumentId { get; set; }

    /// <summary>
    /// Optional vector clock representing client's current state.
    /// Maps client IDs to their logical clock values.
    /// </summary>
    [JsonPropertyName("vectorClock")]
    public Dictionary<string, long>? VectorClock { get; set; }
}
