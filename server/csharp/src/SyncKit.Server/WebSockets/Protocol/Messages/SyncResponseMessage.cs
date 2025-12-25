using System.Text.Json.Serialization;

namespace SyncKit.Server.WebSockets.Protocol.Messages;

/// <summary>
/// Response to a sync request.
/// </summary>
public class SyncResponseMessage : BaseMessage
{
    [JsonPropertyName("type")]
    public override MessageType Type => MessageType.SyncResponse;

    /// <summary>
    /// ID of the original sync request.
    /// </summary>
    [JsonPropertyName("requestId")]
    public required string RequestId { get; set; }

    /// <summary>
    /// ID of the document being synced.
    /// </summary>
    [JsonPropertyName("documentId")]
    public required string DocumentId { get; set; }

    /// <summary>
    /// Full document state (for initial sync).
    /// Vector clock represented as a dictionary of client ID to clock value.
    /// </summary>
    [JsonPropertyName("state")]
    public Dictionary<string, long>? State { get; set; }

    /// <summary>
    /// Delta updates (for incremental sync).
    /// Each delta includes the delta data and its associated vector clock.
    /// </summary>
    [JsonPropertyName("deltas")]
    public List<DeltaPayload>? Deltas { get; set; }
}
