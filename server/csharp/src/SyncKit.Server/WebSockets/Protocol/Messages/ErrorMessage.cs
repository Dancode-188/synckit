using System.Text.Json.Serialization;

namespace SyncKit.Server.WebSockets.Protocol.Messages;

/// <summary>
/// Error message.
/// </summary>
public class ErrorMessage : BaseMessage
{
    [JsonPropertyName("type")]
    public override MessageType Type => MessageType.Error;

    /// <summary>
    /// Error message description.
    /// </summary>
    [JsonPropertyName("error")]
    public required string Error { get; set; }

    /// <summary>
    /// Optional additional error details.
    /// </summary>
    [JsonPropertyName("details")]
    public object? Details { get; set; }
}
