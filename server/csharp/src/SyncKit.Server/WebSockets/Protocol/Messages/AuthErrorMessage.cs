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
}
