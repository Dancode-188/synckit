using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using SyncKit.Server.Auth;
using SyncKit.Server.Configuration;

namespace SyncKit.Server.Tests.Auth;

/// <summary>
/// Tests for JwtValidator aligned with TypeScript server TokenPayload structure.
/// TypeScript reference: { userId, email?, permissions: DocumentPermissions, iat?, exp? }
/// </summary>
public class JwtValidatorTests
{
    private const string Secret = "test-secret-key-for-development-32-chars";

    [Fact]
    public void Validate_ReturnsPayload_ForValidToken()
    {
        // Arrange
        var issuedAt = DateTimeOffset.UtcNow;
        var permissions = new DocumentPermissions
        {
            CanRead = new[] { "doc-1", "doc-2" },
            CanWrite = new[] { "doc-1" },
            IsAdmin = false
        };
        var token = CreateToken(secret: Secret, issuedAt: issuedAt, permissions: permissions);
        var validator = CreateValidator();

        // Act
        var payload = validator.Validate(token);

        // Assert
        Assert.NotNull(payload);
        Assert.Equal("user-123", payload!.UserId);
        Assert.Equal("user@example.com", payload.Email);
        Assert.Equal(issuedAt.ToUnixTimeSeconds(), payload.Iat);
        Assert.Equal(new[] { "doc-1", "doc-2" }, payload.Permissions.CanRead);
        Assert.Equal(new[] { "doc-1" }, payload.Permissions.CanWrite);
        Assert.False(payload.Permissions.IsAdmin);
    }

    [Fact]
    public void Validate_ReturnsPayload_ForAdminUser()
    {
        // Arrange
        var permissions = new DocumentPermissions
        {
            CanRead = Array.Empty<string>(),
            CanWrite = Array.Empty<string>(),
            IsAdmin = true
        };
        var token = CreateToken(secret: Secret, permissions: permissions);
        var validator = CreateValidator();

        // Act
        var payload = validator.Validate(token);

        // Assert
        Assert.NotNull(payload);
        Assert.True(payload!.Permissions.IsAdmin);
    }

    [Fact]
    public void Validate_ReturnsNull_ForInvalidSignature()
    {
        // Arrange
        var token = CreateToken(secret: "different-secret-value-that-is-32-characters!");
        var validator = CreateValidator();

        // Act
        var payload = validator.Validate(token);

        // Assert
        Assert.Null(payload);
    }

    [Fact]
    public void Validate_ReturnsNull_ForExpiredToken()
    {
        // Arrange - token issued 10 mins ago and expired 5 mins ago
        var issuedAt = DateTimeOffset.UtcNow.AddMinutes(-10);
        var expires = DateTimeOffset.UtcNow.AddMinutes(-5);
        var token = CreateToken(secret: Secret, expires: expires, issuedAt: issuedAt);
        var validator = CreateValidator();

        // Act
        var payload = validator.Validate(token);

        // Assert
        Assert.Null(payload);
    }

    [Fact]
    public void Validate_EnforcesIssuer_WhenConfigured()
    {
        // Arrange
        var token = CreateToken(secret: Secret, issuer: "unexpected-issuer");
        var validator = CreateValidator(issuer: "expected-issuer");

        // Act
        var payload = validator.Validate(token);

        // Assert
        Assert.Null(payload);
    }

    [Fact]
    public void Validate_EnforcesAudience_WhenConfigured()
    {
        // Arrange
        var token = CreateToken(secret: Secret, audience: "unexpected-audience");
        var validator = CreateValidator(audience: "expected-audience");

        // Act
        var payload = validator.Validate(token);

        // Assert
        Assert.Null(payload);
    }

    [Fact]
    public void Validate_ExtractsDocumentPermissions_Correctly()
    {
        // Arrange - matches TypeScript DocumentPermissions structure
        var permissions = new DocumentPermissions
        {
            CanRead = new[] { "project-1", "project-2", "shared-doc" },
            CanWrite = new[] { "project-1" },
            IsAdmin = false
        };
        var token = CreateToken(secret: Secret, permissions: permissions);
        var validator = CreateValidator();

        // Act
        var payload = validator.Validate(token);

        // Assert
        Assert.NotNull(payload);
        Assert.Equal(3, payload!.Permissions.CanRead.Length);
        Assert.Contains("project-1", payload.Permissions.CanRead);
        Assert.Contains("project-2", payload.Permissions.CanRead);
        Assert.Contains("shared-doc", payload.Permissions.CanRead);
        Assert.Single(payload.Permissions.CanWrite);
        Assert.Contains("project-1", payload.Permissions.CanWrite);
        Assert.False(payload.Permissions.IsAdmin);
    }

    [Fact]
    public void Validate_ReturnsEmptyPermissions_WhenNoPermissionsClaim()
    {
        // Arrange - token without permissions claim
        var token = CreateToken(secret: Secret, permissions: null);
        var validator = CreateValidator();

        // Act
        var payload = validator.Validate(token);

        // Assert
        Assert.NotNull(payload);
        Assert.Empty(payload!.Permissions.CanRead);
        Assert.Empty(payload.Permissions.CanWrite);
        Assert.False(payload.Permissions.IsAdmin);
    }

    [Fact]
    public void Validate_ReturnsPayload_WithOptionalEmailMissing()
    {
        // Arrange - TypeScript allows email to be optional
        var token = CreateToken(secret: Secret, includeEmail: false);
        var validator = CreateValidator();

        // Act
        var payload = validator.Validate(token);

        // Assert
        Assert.NotNull(payload);
        Assert.Equal("user-123", payload!.UserId);
        Assert.Null(payload.Email);
    }

    [Fact]
    public void IsExpired_ReturnsTrue_WhenPastExpiration()
    {
        // Arrange
        var expiredPayload = new TokenPayload
        {
            UserId = "user",
            Exp = DateTimeOffset.UtcNow.AddMinutes(-1).ToUnixTimeSeconds(),
            Iat = DateTimeOffset.UtcNow.AddMinutes(-2).ToUnixTimeSeconds(),
            Permissions = new DocumentPermissions()
        };
        var validator = CreateValidator();

        // Act
        var expired = validator.IsExpired(expiredPayload);

        // Assert
        Assert.True(expired);
    }

    [Fact]
    public void IsExpired_ReturnsFalse_WhenExpIsNull()
    {
        // Arrange - TypeScript allows exp to be optional
        var payload = new TokenPayload
        {
            UserId = "user",
            Exp = null,
            Permissions = new DocumentPermissions()
        };
        var validator = CreateValidator();

        // Act
        var expired = validator.IsExpired(payload);

        // Assert
        Assert.False(expired);
    }

    [Fact]
    public void IsExpired_ReturnsFalse_WhenNotExpired()
    {
        // Arrange
        var payload = new TokenPayload
        {
            UserId = "user",
            Exp = DateTimeOffset.UtcNow.AddMinutes(5).ToUnixTimeSeconds(),
            Permissions = new DocumentPermissions()
        };
        var validator = CreateValidator();

        // Act
        var expired = validator.IsExpired(payload);

        // Assert
        Assert.False(expired);
    }

    private static JwtValidator CreateValidator(string? issuer = null, string? audience = null)
    {
        var options = Options.Create(new SyncKitConfig
        {
            JwtSecret = Secret,
            JwtIssuer = issuer,
            JwtAudience = audience
        });

        return new JwtValidator(options, NullLogger<JwtValidator>.Instance);
    }

    private static string CreateToken(
        string secret,
        DateTimeOffset? expires = null,
        DateTimeOffset? issuedAt = null,
        string? issuer = null,
        string? audience = null,
        DocumentPermissions? permissions = null,
        bool includeEmail = true)
    {
        var now = issuedAt ?? DateTimeOffset.UtcNow;
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)),
            SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, "user-123"),
            new(JwtRegisteredClaimNames.Iat, now.ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64)
        };

        if (includeEmail)
        {
            claims.Add(new Claim(JwtRegisteredClaimNames.Email, "user@example.com"));
        }

        if (permissions != null)
        {
            // Serialize permissions as JSON object (TypeScript format)
            var permissionsJson = JsonSerializer.Serialize(new
            {
                canRead = permissions.CanRead,
                canWrite = permissions.CanWrite,
                isAdmin = permissions.IsAdmin
            });
            claims.Add(new Claim("permissions", permissionsJson, JsonClaimValueTypes.Json));
        }

        var token = new JwtSecurityToken(
            issuer: issuer ?? "synckit",
            audience: audience ?? "synckit-api",
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: (expires ?? now.AddMinutes(5)).UtcDateTime,
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
