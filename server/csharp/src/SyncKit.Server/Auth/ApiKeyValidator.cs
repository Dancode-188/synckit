using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SyncKit.Server.Configuration;

namespace SyncKit.Server.Auth;

/// <summary>
/// Validates API keys as an alternative to JWT authentication.
/// API keys provide full permissions when valid.
/// </summary>
public class ApiKeyValidator : IApiKeyValidator
{
    private readonly HashSet<string> _validKeys;
    private readonly ILogger<ApiKeyValidator> _logger;

    public ApiKeyValidator(IOptions<SyncKitConfig> config, ILogger<ApiKeyValidator> logger)
    {
        _logger = logger;

        // Load API keys from configuration
        var apiKeys = config.Value.ApiKeys ?? Array.Empty<string>();
        _validKeys = new HashSet<string>(
            apiKeys.Where(k => !string.IsNullOrWhiteSpace(k)),
            StringComparer.Ordinal  // Case-sensitive comparison
        );

        _logger.LogInformation("Loaded {Count} API keys", _validKeys.Count);
    }

    public TokenPayload? Validate(string apiKey)
    {
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogDebug("API key validation failed: empty key");
            return null;
        }

        if (!_validKeys.Contains(apiKey))
        {
            _logger.LogWarning("API key validation failed: invalid key");
            return null;
        }

        _logger.LogDebug("API key validated successfully");

        // Return synthetic payload with full permissions
        // This matches the TypeScript server's DocumentPermissions model
        return new TokenPayload
        {
            UserId = "api-key-user",
            Email = null,
            Permissions = new DocumentPermissions
            {
                CanRead = Array.Empty<string>(),  // Empty = not used
                CanWrite = Array.Empty<string>(), // Empty = not used
                IsAdmin = true  // Admin grants full access to all documents
            },
            Iat = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            Exp = DateTimeOffset.UtcNow.AddYears(100).ToUnixTimeSeconds()  // Effectively never expires
        };
    }
}
