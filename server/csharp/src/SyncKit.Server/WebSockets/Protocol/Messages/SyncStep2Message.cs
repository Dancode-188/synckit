using System.Text.Json;
using System.Text.Json.Serialization;

namespace SyncKit.Server.WebSockets.Protocol.Messages;

/// <summary>
/// Sync step 2 message — server responds with the operations
/// the client is missing based on the state vector from step 1.
/// </summary>
public class SyncStep2Message : BaseMessage
{
    [JsonPropertyName("type")]
    public override MessageType Type => MessageType.SyncStep2;

    /// <summary>
    /// ID of the document being synced.
    /// </summary>
    [JsonPropertyName("documentId")]
    public required string DocumentId { get; set; }

    /// <summary>
    /// Operations the client is missing.
    /// Uses JsonElement to preserve the exact JSON structure.
    /// </summary>
    [JsonPropertyName("operations")]
    public required List<JsonElement> Operations { get; set; }
}
