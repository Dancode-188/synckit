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
    /// Can be any JSON-serializable object representing the user's permissions.
    /// </summary>
    [JsonPropertyName("permissions")]
    public required object Permissions { get; set; }
}
