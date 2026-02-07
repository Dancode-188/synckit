using System.Text.Json.Serialization;

namespace SyncKit.Server.WebSockets.Protocol.Messages;

/// <summary>
/// Authentication error response.
/// </summary>
public class AuthErrorMessage : BaseMessage
{
    [JsonPropertyName("type")]
    public override MessageType Type => MessageType.AuthError;

    /// <summary>
    /// Error message describing the authentication failure.
    /// </summary>
    [JsonPropertyName("error")]
    public required string Error { get; set; }

    /// <summary>
    /// Optional additional error details (e.g., error code).
    /// </summary>
    [JsonPropertyName("details")]
    public Dictionary<string, object>? Details { get; set; }
}
