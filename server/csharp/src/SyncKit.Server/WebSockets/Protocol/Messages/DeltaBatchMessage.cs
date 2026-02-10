using System.Text.Json;
using System.Text.Json.Serialization;

namespace SyncKit.Server.WebSockets.Protocol.Messages;

/// <summary>
/// Batch of delta operations for a document, sent as a single message
/// to reduce round-trips and improve throughput.
/// </summary>
public class DeltaBatchMessage : BaseMessage
{
    [JsonPropertyName("type")]
    public override MessageType Type => MessageType.DeltaBatch;

    /// <summary>
    /// ID of the document being updated.
    /// </summary>
    [JsonPropertyName("documentId")]
    public required string DocumentId { get; set; }

    /// <summary>
    /// Array of delta operations to apply.
    /// Uses JsonElement to preserve the exact JSON structure.
    /// </summary>
    [JsonPropertyName("deltas")]
    public required List<JsonElement> Deltas { get; set; }
}
