using SyncKit.Server.Auth;

namespace SyncKit.Server.Controllers.Auth;

/// <summary>
/// Request body for POST /auth/login endpoint.
/// </summary>
public class LoginRequest
{
    /// <summary>User email address.</summary>
    public string Email { get; set; } = null!;

    /// <summary>User password (demo only - not validated).</summary>
    public string Password { get; set; } = null!;

    /// <summary>Optional permissions to assign (for demo/testing purposes).</summary>
    public PermissionsInput? Permissions { get; set; }
}

/// <summary>
/// Response body for POST /auth/login endpoint.
/// </summary>
public class LoginResponse
{
    /// <summary>Generated user ID.</summary>
    public string UserId { get; set; } = null!;

    /// <summary>User's email address.</summary>
    public string Email { get; set; } = null!;

    /// <summary>JWT access token (expires in 24h by default).</summary>
    public string AccessToken { get; set; } = null!;

    /// <summary>JWT refresh token (expires in 7d by default).</summary>
    public string RefreshToken { get; set; } = null!;

    /// <summary>User's document-level permissions.</summary>
    public DocumentPermissions Permissions { get; set; } = null!;
}

/// <summary>
/// Request body for POST /auth/refresh endpoint.
/// </summary>
public class RefreshRequest
{
    /// <summary>JWT refresh token to exchange for a new access token.</summary>
    public string RefreshToken { get; set; } = null!;
}

/// <summary>
/// Response body for POST /auth/refresh endpoint.
/// </summary>
public class RefreshResponse
{
    /// <summary>New JWT access token.</summary>
    public string AccessToken { get; set; } = null!;

    /// <summary>New JWT refresh token.</summary>
    public string RefreshToken { get; set; } = null!;
}

/// <summary>
/// Response body for GET /auth/me endpoint.
/// </summary>
public class MeResponse
{
    /// <summary>User ID from token.</summary>
    public string UserId { get; set; } = null!;

    /// <summary>User's email from token (if present).</summary>
    public string? Email { get; set; }

    /// <summary>User's document-level permissions.</summary>
    public DocumentPermissions Permissions { get; set; } = null!;
}

/// <summary>
/// Request body for POST /auth/verify endpoint.
/// </summary>
public class VerifyRequest
{
    /// <summary>JWT token to verify.</summary>
    public string Token { get; set; } = null!;
}

/// <summary>
/// Response body for POST /auth/verify endpoint.
/// </summary>
public class VerifyResponse
{
    /// <summary>Whether the token is valid and not expired.</summary>
    public bool Valid { get; set; }

    /// <summary>User ID from token (if valid).</summary>
    public string? UserId { get; set; }

    /// <summary>Token expiration timestamp in Unix epoch seconds (if valid).</summary>
    public long? ExpiresAt { get; set; }
}

/// <summary>
/// Permissions input for login request (used for demo/testing).
/// </summary>
public class PermissionsInput
{
    /// <summary>Document IDs the user can read.</summary>
    public string[]? CanRead { get; set; }

    /// <summary>Document IDs the user can write.</summary>
    public string[]? CanWrite { get; set; }

    /// <summary>Whether the user should have admin access.</summary>
    public bool IsAdmin { get; set; }
}

/// <summary>
/// Generic error response for authentication failures.
/// </summary>
public class ErrorResponse
{
    /// <summary>Error message.</summary>
    public string Error { get; set; } = null!;
}
