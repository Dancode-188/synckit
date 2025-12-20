using System.Text.Json.Serialization;

namespace SyncKit.Server.WebSockets.Protocol.Messages;

/// <summary>
/// Awareness (presence) update message.
/// </summary>
public class AwarenessUpdateMessage : BaseMessage
{
    [JsonPropertyName("type")]
    public override MessageType Type => MessageType.AwarenessUpdate;

    /// <summary>
    /// ID of the document the awareness update is for.
    /// </summary>
    [JsonPropertyName("documentId")]
    public required string DocumentId { get; set; }

    /// <summary>
    /// Client ID of the user.
    /// </summary>
    [JsonPropertyName("clientId")]
    public required string ClientId { get; set; }

    /// <summary>
    /// Awareness state (cursor position, selection, user info, etc.).
    /// Null means the client has left.
    /// </summary>
    [JsonPropertyName("state")]
    public Dictionary<string, object>? State { get; set; }

    /// <summary>
    /// Logical clock for ordering awareness updates.
    /// </summary>
    [JsonPropertyName("clock")]
    public required long Clock { get; set; }
}
