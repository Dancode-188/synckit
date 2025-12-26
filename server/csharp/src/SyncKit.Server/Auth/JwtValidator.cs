using System.IdentityModel.Tokens.Jwt;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using SyncKit.Server.Configuration;

namespace SyncKit.Server.Auth;

/// <summary>
/// HS256 JWT validator that mirrors the TypeScript server semantics.
/// </summary>
public class JwtValidator : IJwtValidator
{
    private readonly ILogger<JwtValidator> _logger;
    private readonly byte[] _secretBytes;
    private readonly string? _issuer;
    private readonly string? _audience;
    private readonly JwtSecurityTokenHandler _tokenHandler = new();

    public JwtValidator(IOptions<SyncKitConfig> config, ILogger<JwtValidator> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        if (config == null) throw new ArgumentNullException(nameof(config));

        var settings = config.Value ?? throw new ArgumentException("Configuration value is missing", nameof(config));
        if (string.IsNullOrWhiteSpace(settings.JwtSecret))
        {
            throw new ArgumentException("JWT secret is not configured", nameof(config));
        }

        _secretBytes = Encoding.UTF8.GetBytes(settings.JwtSecret);
        _issuer = string.IsNullOrWhiteSpace(settings.JwtIssuer) ? null : settings.JwtIssuer;
        _audience = string.IsNullOrWhiteSpace(settings.JwtAudience) ? null : settings.JwtAudience;
    }

    public TokenPayload? Validate(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return null;
        }

        try
        {
            var validationParameters = new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(_secretBytes),
                ValidateIssuer = !string.IsNullOrEmpty(_issuer),
                ValidIssuer = _issuer,
                ValidateAudience = !string.IsNullOrEmpty(_audience),
                ValidAudience = _audience,
                ValidateLifetime = true,
                RequireExpirationTime = true,
                RequireSignedTokens = true,
                ClockSkew = TimeSpan.Zero,
                ValidAlgorithms = new[] { SecurityAlgorithms.HmacSha256 }
            };

            var principal = _tokenHandler.ValidateToken(token, validationParameters, out var validatedToken);

            if (validatedToken is not JwtSecurityToken jwt ||
                !string.Equals(jwt.Header.Alg, SecurityAlgorithms.HmacSha256, StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogWarning("Token validation failed: unsupported algorithm {Algorithm}",
                    (validatedToken as JwtSecurityToken)?.Header.Alg);
                return null;
            }

            // Extract userId from sub claim (matches TypeScript: userId)
            var userId = jwt.Subject ?? principal.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
            if (string.IsNullOrWhiteSpace(userId))
            {
                _logger.LogWarning("Token validation failed: missing sub claim");
                return null;
            }

            // Extract optional claims
            TryParseUnixTime(jwt.Claims.FirstOrDefault(c => c.Type == JwtRegisteredClaimNames.Exp)?.Value, out var exp);
            TryParseUnixTime(jwt.Claims.FirstOrDefault(c => c.Type == JwtRegisteredClaimNames.Iat)?.Value, out var iat);

            // Email claim - check both registered name and common alternatives
            var email = jwt.Claims.FirstOrDefault(c => c.Type == JwtRegisteredClaimNames.Email)?.Value
                        ?? jwt.Claims.FirstOrDefault(c => c.Type == "email")?.Value
                        ?? principal.FindFirst(JwtRegisteredClaimNames.Email)?.Value
                        ?? principal.FindFirst("email")?.Value;

            // Extract permissions object (matches TypeScript DocumentPermissions structure)
            var permissions = ExtractPermissions(jwt);

            return new TokenPayload
            {
                UserId = userId,
                Email = email,
                Permissions = permissions,
                Iat = iat > 0 ? iat : null,
                Exp = exp > 0 ? exp : null
            };
        }
        catch (SecurityTokenExpiredException ex)
        {
            _logger.LogWarning("Token expired: {Message}", ex.Message);
            return null;
        }
        catch (SecurityTokenException ex)
        {
            _logger.LogWarning("Token validation failed: {Message}", ex.Message);
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error validating token");
            return null;
        }
    }

    public bool IsExpired(TokenPayload payload)
    {
        // `payload.Exp` is in Unix epoch seconds per RFC 7519; convert with FromUnixTimeSeconds.
        if (payload.Exp == null) return false;
        var expiration = DateTimeOffset.FromUnixTimeSeconds(payload.Exp.Value);
        return expiration <= DateTimeOffset.UtcNow;
    }

    /// <summary>
    /// Extract DocumentPermissions from JWT claims.
    /// Supports JSON object in "permissions" claim matching TypeScript structure.
    /// </summary>
    private DocumentPermissions ExtractPermissions(JwtSecurityToken jwt)
    {
        var permissionsClaim = jwt.Claims.FirstOrDefault(c => c.Type == "permissions")?.Value;

        if (string.IsNullOrWhiteSpace(permissionsClaim))
        {
            return new DocumentPermissions();
        }

        try
        {
            // Try to parse as JSON object (TypeScript format)
            var jsonDoc = JsonDocument.Parse(permissionsClaim);
            var root = jsonDoc.RootElement;

            return new DocumentPermissions
            {
                CanRead = ExtractStringArray(root, "canRead"),
                CanWrite = ExtractStringArray(root, "canWrite"),
                IsAdmin = root.TryGetProperty("isAdmin", out var isAdminProp) && isAdminProp.GetBoolean()
            };
        }
        catch (JsonException)
        {
            // Not valid JSON - return empty permissions
            _logger.LogWarning("Could not parse permissions claim as JSON");
            return new DocumentPermissions();
        }
    }

    private static string[] ExtractStringArray(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var prop) || prop.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<string>();
        }

        return prop.EnumerateArray()
            .Where(e => e.ValueKind == JsonValueKind.String)
            .Select(e => e.GetString()!)
            .ToArray();
    }

    // Parse numeric claim values expected to be Unix epoch seconds (iat/exp per RFC 7519).
    private static bool TryParseUnixTime(string? value, out long unixTime)
    {
        if (long.TryParse(value, out unixTime))
        {
            return true;
        }

        if (double.TryParse(value, out var doubleValue))
        {
            unixTime = Convert.ToInt64(doubleValue);
            return true;
        }

        unixTime = 0;
        return false;
    }
}
