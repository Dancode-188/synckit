using System.Text.Json;
using System.Text.Json.Serialization;

namespace SyncKit.Server.WebSockets.Protocol.Messages;

/// <summary>
/// Current awareness state for all clients in a document.
/// </summary>
public class AwarenessStateMessage : BaseMessage
{
    [JsonPropertyName("type")]
    public override MessageType Type => MessageType.AwarenessState;

    /// <summary>
    /// ID of the document.
    /// </summary>
    [JsonPropertyName("documentId")]
    public required string DocumentId { get; set; }

    /// <summary>
    /// Current awareness states for all clients.
    /// </summary>
    [JsonPropertyName("states")]
    public required List<AwarenessClientState> States { get; set; }
}

/// <summary>
/// Individual client's awareness state.
/// </summary>
public class AwarenessClientState
{
    /// <summary>
    /// Client ID.
    /// </summary>
    [JsonPropertyName("clientId")]
    public required string ClientId { get; set; }

    /// <summary>
    /// Client's awareness state.
    /// Can be any JSON-serializable object representing the client's presence state.
    /// </summary>
    [JsonPropertyName("state")]
    public required JsonElement State { get; set; }

    /// <summary>
    /// Logical clock for this state.
    /// </summary>
    [JsonPropertyName("clock")]
    public required long Clock { get; set; }
}
