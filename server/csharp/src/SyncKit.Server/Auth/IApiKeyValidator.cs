namespace SyncKit.Server.Auth;

/// <summary>
/// Validates API keys as an alternative to JWT authentication.
/// </summary>
public interface IApiKeyValidator
{
    /// <summary>
    /// Validates an API key and returns a synthetic TokenPayload if valid.
    /// </summary>
    /// <param name="apiKey">The API key to validate</param>
    /// <returns>TokenPayload with full permissions if valid, null otherwise</returns>
    TokenPayload? Validate(string apiKey);
}
