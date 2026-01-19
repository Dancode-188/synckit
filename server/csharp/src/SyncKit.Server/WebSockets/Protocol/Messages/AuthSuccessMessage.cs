using System.Text.Json;
using System.Text.Json.Serialization;

namespace SyncKit.Server.WebSockets.Protocol.Messages;

/// <summary>
/// Successful authentication response.
/// </summary>
public class AuthSuccessMessage : BaseMessage
{
    [JsonPropertyName("type")]
    public override MessageType Type => MessageType.AuthSuccess;

    /// <summary>
    /// Authenticated user ID.
    /// </summary>
    [JsonPropertyName("userId")]
    public required string UserId { get; set; }

    /// <summary>
    /// User permissions (document access, roles, etc.).
    /// Uses JsonElement to preserve the exact JSON structure and enable source-generated serialization.
    /// </summary>
    [JsonPropertyName("permissions")]
    public required JsonElement Permissions { get; set; }
}
