namespace SyncKit.Server.Auth;

/// <summary>
/// Validates JWT access tokens.
/// </summary>
public interface IJwtValidator
{
    /// <summary>
    /// Validates a JWT and returns the parsed payload if valid; otherwise null.
    /// </summary>
    /// <param name="token">Encoded JWT token.</param>
    /// <returns>Parsed token payload or null when validation fails.</returns>
    TokenPayload? Validate(string token);

    /// <summary>
    /// Returns true when the payload is expired relative to the current UTC time.
    /// </summary>
    /// <param name="payload">Token payload to check.</param>
    bool IsExpired(TokenPayload payload);
}
