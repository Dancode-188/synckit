namespace SyncKit.Server.Auth;

/// <summary>
/// JWT token payload containing user identity and permissions.
/// Matches the TypeScript TokenPayload interface.
/// </summary>
/// <remarks>
/// Full JWT implementation will be added in Phase 3 (P3-01 through P3-05).
/// This class is defined here to allow Connection (P2-02) to store token data.
/// </remarks>
public class TokenPayload
{
    /// <summary>
    /// User ID from the token.
    /// </summary>
    public required string UserId { get; set; }

    /// <summary>
    /// User's email address (optional).
    /// </summary>
    public string? Email { get; set; }

    /// <summary>
    /// Document-level permissions for this user.
    /// </summary>
    public required DocumentPermissions Permissions { get; set; }

    /// <summary>
    /// Token issued at timestamp (Unix epoch seconds).
    /// </summary>
    public long? Iat { get; set; }

    /// <summary>
    /// Token expiration timestamp (Unix epoch seconds).
    /// </summary>
    public long? Exp { get; set; }
}

/// <summary>
/// Document-level permissions for a user.
/// </summary>
public class DocumentPermissions
{
    /// <summary>
    /// Document IDs the user can read.
    /// </summary>
    public string[] CanRead { get; set; } = Array.Empty<string>();

    /// <summary>
    /// Document IDs the user can write.
    /// </summary>
    public string[] CanWrite { get; set; } = Array.Empty<string>();

    /// <summary>
    /// Whether the user is an admin (has access to all documents).
    /// </summary>
    public bool IsAdmin { get; set; }
}
