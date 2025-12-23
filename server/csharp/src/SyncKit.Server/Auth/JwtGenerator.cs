using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using SyncKit.Server.Configuration;

namespace SyncKit.Server.Auth;

/// <summary>
/// HS256 JWT token generator matching TypeScript server behavior.
/// Generates access tokens (24h default) and refresh tokens (7d default).
/// </summary>
public class JwtGenerator : IJwtGenerator
{
    private readonly ILogger<JwtGenerator> _logger;
    private readonly SymmetricSecurityKey _signingKey;
    private readonly SigningCredentials _signingCredentials;
    private readonly TimeSpan _accessTokenExpiry;
    private readonly TimeSpan _refreshTokenExpiry;
    private readonly string? _issuer;
    private readonly string? _audience;
    private readonly JwtSecurityTokenHandler _tokenHandler = new();

    public JwtGenerator(IOptions<SyncKitConfig> config, ILogger<JwtGenerator> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        if (config == null) throw new ArgumentNullException(nameof(config));

        var settings = config.Value ?? throw new ArgumentException("Configuration value is missing", nameof(config));
        if (string.IsNullOrWhiteSpace(settings.JwtSecret))
        {
            throw new ArgumentException("JWT secret is not configured", nameof(config));
        }

        var keyBytes = Encoding.UTF8.GetBytes(settings.JwtSecret);
        _signingKey = new SymmetricSecurityKey(keyBytes);
        _signingCredentials = new SigningCredentials(_signingKey, SecurityAlgorithms.HmacSha256);

        _accessTokenExpiry = ParseExpiry(settings.JwtExpiresIn, TimeSpan.FromHours(24));
        _refreshTokenExpiry = ParseExpiry(settings.JwtRefreshExpiresIn, TimeSpan.FromDays(7));

        _issuer = string.IsNullOrWhiteSpace(settings.JwtIssuer) ? null : settings.JwtIssuer;
        _audience = string.IsNullOrWhiteSpace(settings.JwtAudience) ? null : settings.JwtAudience;
    }

    public string GenerateAccessToken(string userId, string? email, DocumentPermissions permissions)
    {
        if (string.IsNullOrWhiteSpace(userId))
        {
            throw new ArgumentException("UserId cannot be null or empty", nameof(userId));
        }

        var now = DateTimeOffset.UtcNow;
        var expires = now.Add(_accessTokenExpiry);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, userId),
            new(JwtRegisteredClaimNames.Iat, now.ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64)
        };

        // Add email if provided
        if (!string.IsNullOrWhiteSpace(email))
        {
            claims.Add(new Claim(JwtRegisteredClaimNames.Email, email));
        }

        // Serialize permissions as JSON (matches TypeScript structure)
        var permissionsJson = JsonSerializer.Serialize(new
        {
            canRead = permissions.CanRead,
            canWrite = permissions.CanWrite,
            isAdmin = permissions.IsAdmin
        });
        claims.Add(new Claim("permissions", permissionsJson, JsonClaimValueTypes.Json));

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = expires.UtcDateTime,
            SigningCredentials = _signingCredentials,
            Issuer = _issuer,
            Audience = _audience
        };

        var token = _tokenHandler.CreateToken(tokenDescriptor);
        var encodedToken = _tokenHandler.WriteToken(token);

        _logger.LogDebug("Generated access token for user {UserId} (expires: {Expires})", userId, expires);

        return encodedToken;
    }

    public string GenerateRefreshToken(string userId)
    {
        if (string.IsNullOrWhiteSpace(userId))
        {
            throw new ArgumentException("UserId cannot be null or empty", nameof(userId));
        }

        var now = DateTimeOffset.UtcNow;
        var expires = now.Add(_refreshTokenExpiry);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, userId),
            new(JwtRegisteredClaimNames.Iat, now.ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64)
        };

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = expires.UtcDateTime,
            SigningCredentials = _signingCredentials,
            Issuer = _issuer,
            Audience = _audience
        };

        var token = _tokenHandler.CreateToken(tokenDescriptor);
        var encodedToken = _tokenHandler.WriteToken(token);

        _logger.LogDebug("Generated refresh token for user {UserId} (expires: {Expires})", userId, expires);

        return encodedToken;
    }

    public (string AccessToken, string RefreshToken) GenerateTokenPair(
        string userId,
        string? email,
        DocumentPermissions permissions)
    {
        var accessToken = GenerateAccessToken(userId, email, permissions);
        var refreshToken = GenerateRefreshToken(userId);

        return (accessToken, refreshToken);
    }

    /// <summary>
    /// Parse expiry string (e.g., "24h", "7d", "1w") to TimeSpan.
    /// Matches TypeScript server expiry parsing behavior.
    /// </summary>
    private TimeSpan ParseExpiry(string expiry, TimeSpan defaultValue)
    {
        if (string.IsNullOrWhiteSpace(expiry))
        {
            return defaultValue;
        }

        expiry = expiry.Trim().ToLowerInvariant();

        // Extract numeric part and unit
        var numericPart = new string(expiry.TakeWhile(char.IsDigit).ToArray());
        var unitPart = expiry.Substring(numericPart.Length).Trim();

        if (!int.TryParse(numericPart, out var value) || value <= 0)
        {
            _logger.LogWarning("Invalid expiry format '{Expiry}', using default {Default}", expiry, defaultValue);
            return defaultValue;
        }

        var result = unitPart switch
        {
            "s" or "sec" or "second" or "seconds" => TimeSpan.FromSeconds(value),
            "m" or "min" or "minute" or "minutes" => TimeSpan.FromMinutes(value),
            "h" or "hr" or "hour" or "hours" => TimeSpan.FromHours(value),
            "d" or "day" or "days" => TimeSpan.FromDays(value),
            "w" or "week" or "weeks" => TimeSpan.FromDays(value * 7),
            _ => defaultValue
        };

        _logger.LogDebug("Parsed expiry '{Expiry}' as {Result}", expiry, result);
        return result;
    }
}
