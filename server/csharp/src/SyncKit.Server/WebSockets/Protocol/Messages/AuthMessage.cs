using System.Text.Json.Serialization;

namespace SyncKit.Server.WebSockets.Protocol.Messages;

/// <summary>
/// Authentication request message.
/// </summary>
public class AuthMessage : BaseMessage
{
    [JsonPropertyName("type")]
    public override MessageType Type => MessageType.Auth;

    /// <summary>
    /// JWT token for authentication.
    /// </summary>
    [JsonPropertyName("token")]
    public string? Token { get; set; }

    /// <summary>
    /// API key for authentication (alternative to JWT).
    /// </summary>
    [JsonPropertyName("apiKey")]
    public string? ApiKey { get; set; }
}
