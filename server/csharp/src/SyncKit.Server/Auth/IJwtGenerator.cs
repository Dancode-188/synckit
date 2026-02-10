namespace SyncKit.Server.Auth;

/// <summary>
/// Generates JWT access and refresh tokens.
/// Matches the TypeScript server's token generation pattern.
/// </summary>
public interface IJwtGenerator
{
    /// <summary>
    /// Generates a JWT access token with user identity and permissions.
    /// </summary>
    /// <param name="userId">User identifier (becomes sub claim).</param>
    /// <param name="email">Optional user email.</param>
    /// <param name="permissions">Document-level permissions.</param>
    /// <returns>Signed JWT access token.</returns>
    string GenerateAccessToken(string userId, string? email, DocumentPermissions permissions);

    /// <summary>
    /// Generates a long-lived JWT refresh token.
    /// </summary>
    /// <param name="userId">User identifier (becomes sub claim).</param>
    /// <returns>Signed JWT refresh token.</returns>
    string GenerateRefreshToken(string userId);

    /// <summary>
    /// Generates both access and refresh tokens for a user.
    /// </summary>
    /// <param name="userId">User identifier.</param>
    /// <param name="email">Optional user email.</param>
    /// <param name="permissions">Document-level permissions.</param>
    /// <returns>Tuple containing access token and refresh token.</returns>
    (string AccessToken, string RefreshToken) GenerateTokenPair(
        string userId,
        string? email,
        DocumentPermissions permissions);
}
