using System.Text.Json.Serialization;

namespace SyncKit.Server.WebSockets.Protocol.Messages;

/// <summary>
/// Delta update message containing a document change.
/// </summary>
public class DeltaMessage : BaseMessage
{
    [JsonPropertyName("type")]
    public override MessageType Type => MessageType.Delta;

    /// <summary>
    /// ID of the document being updated.
    /// </summary>
    [JsonPropertyName("documentId")]
    public required string DocumentId { get; set; }

    /// <summary>
    /// The delta/change to apply.
    /// </summary>
    [JsonPropertyName("delta")]
    public required object Delta { get; set; }

    /// <summary>
    /// Vector clock representing the state after this delta.
    /// </summary>
    [JsonPropertyName("vectorClock")]
    public required Dictionary<string, long> VectorClock { get; set; }
}
