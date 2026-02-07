namespace SyncKit.Server.Auth;

/// <summary>
/// JWT token payload containing user identity and permissions.
/// Matches the TypeScript server's TokenPayload interface.
/// </summary>
public class TokenPayload
{
    /// <summary>User ID (sub claim, maps to TypeScript userId).</summary>
    public string UserId { get; set; } = null!;

    /// <summary>User's email address (optional).</summary>
    public string? Email { get; set; }

    /// <summary>Document-level permissions.</summary>
    public DocumentPermissions Permissions { get; set; } = new();

    /// <summary>Token issued-at timestamp (Unix epoch seconds).</summary>
    public long? Iat { get; set; }

    /// <summary>Token expiration timestamp (Unix epoch seconds).</summary>
    public long? Exp { get; set; }
}

/// <summary>
/// Document-level permissions matching TypeScript DocumentPermissions interface.
/// </summary>
public class DocumentPermissions
{
    /// <summary>Document IDs the user can read.</summary>
    public string[] CanRead { get; set; } = Array.Empty<string>();

    /// <summary>Document IDs the user can write.</summary>
    public string[] CanWrite { get; set; } = Array.Empty<string>();

    /// <summary>Whether the user is an admin (has access to all documents).</summary>
    public bool IsAdmin { get; set; }
}
