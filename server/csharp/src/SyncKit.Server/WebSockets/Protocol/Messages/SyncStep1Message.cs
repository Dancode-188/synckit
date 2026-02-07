using System.Text.Json.Serialization;

namespace SyncKit.Server.WebSockets.Protocol.Messages;

/// <summary>
/// Sync step 1 message — client sends its state vector so the server
/// can determine which operations the client is missing.
/// </summary>
public class SyncStep1Message : BaseMessage
{
    [JsonPropertyName("type")]
    public override MessageType Type => MessageType.SyncStep1;

    /// <summary>
    /// ID of the document to sync.
    /// </summary>
    [JsonPropertyName("documentId")]
    public required string DocumentId { get; set; }

    /// <summary>
    /// State vector mapping client IDs to the highest sequence number seen.
    /// </summary>
    [JsonPropertyName("stateVector")]
    public required Dictionary<string, long> StateVector { get; set; }
}
