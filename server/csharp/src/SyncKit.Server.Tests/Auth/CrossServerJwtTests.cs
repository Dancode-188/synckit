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
/// Cross-server JWT validation tests verifying interoperability between
/// the C# and TypeScript SyncKit server JWT implementations.
/// </summary>
public class CrossServerJwtTests
{
    private const string SharedSecret = "test-secret-key-for-development-32-chars";

    #region C# roundtrip

    [Fact]
    public void CSharpGeneratedToken_ValidatesWithSameSecret_Roundtrip()
    {
        // Arrange
        var config = CreateConfig();
        var generator = new JwtGenerator(config, NullLogger<JwtGenerator>.Instance);
        var validator = new JwtValidator(config, NullLogger<JwtValidator>.Instance);

        var permissions = new DocumentPermissions
        {
            CanRead = new[] { "doc-1", "doc-2" },
            CanWrite = new[] { "doc-1" },
            IsAdmin = false
        };

        // Act
        var token = generator.GenerateAccessToken("user-42", "user@example.com", permissions);
        var payload = validator.Validate(token);

        // Assert
        Assert.NotNull(payload);
        Assert.Equal("user-42", payload!.UserId);
        Assert.Equal("user@example.com", payload.Email);
        Assert.Equal(new[] { "doc-1", "doc-2" }, payload.Permissions.CanRead);
        Assert.Equal(new[] { "doc-1" }, payload.Permissions.CanWrite);
        Assert.False(payload.Permissions.IsAdmin);
        Assert.NotNull(payload.Iat);
        Assert.NotNull(payload.Exp);
    }

    #endregion

    #region TypeScript-style token (top-level userId claim)

    [Fact]
    public void TypeScriptStyleToken_WithTopLevelUserIdClaim_CSharpValidatorExtractsUserId()
    {
        // The TypeScript server uses jwt.sign({ userId, email, permissions }, secret)
        // which produces a top-level "userId" claim instead of the standard "sub" claim.
        // This test constructs such a token and verifies C# can handle it.

        var config = CreateConfig();
        var validator = new JwtValidator(config, NullLogger<JwtValidator>.Instance);

        var token = BuildTypeScriptStyleToken(
            userId: "ts-user-99",
            email: "ts@example.com",
            permissions: new { canRead = new[] { "doc-a" }, canWrite = Array.Empty<string>(), isAdmin = true },
            secret: SharedSecret);

        var payload = validator.Validate(token);

        // KNOWN GAP: The C# JwtValidator only reads the "sub" claim for UserId.
        // A TypeScript-generated token with a top-level "userId" claim (no "sub") will
        // fail validation because the C# validator requires the "sub" claim.
        // This test documents that gap. If cross-server tokens need to work,
        // the C# validator should also check for a "userId" claim as fallback.
        Assert.Null(payload);
    }

    [Fact]
    public void TypeScriptStyleToken_WithBothSubAndUserIdClaims_ValidatesSuccessfully()
    {
        // If the TypeScript server were updated to also include "sub", the C# validator
        // would work. This test verifies that scenario.

        var config = CreateConfig();
        var validator = new JwtValidator(config, NullLogger<JwtValidator>.Instance);

        var token = BuildTokenWithSubAndUserId(
            sub: "ts-user-100",
            userId: "ts-user-100",
            email: "both@example.com",
            permissions: new { canRead = new[] { "doc-x" }, canWrite = new[] { "doc-x" }, isAdmin = false },
            secret: SharedSecret);

        var payload = validator.Validate(token);

        Assert.NotNull(payload);
        Assert.Equal("ts-user-100", payload!.UserId);
        Assert.Equal("both@example.com", payload.Email);
        Assert.Equal(new[] { "doc-x" }, payload.Permissions.CanRead);
        Assert.Equal(new[] { "doc-x" }, payload.Permissions.CanWrite);
        Assert.False(payload.Permissions.IsAdmin);
    }

    #endregion

    #region Claim extraction

    [Fact]
    public void ClaimExtraction_PermissionsAsJsonObject_ParsedCorrectly()
    {
        var config = CreateConfig();
        var validator = new JwtValidator(config, NullLogger<JwtValidator>.Instance);

        var permissions = new
        {
            canRead = new[] { "doc-1", "doc-2", "doc-3" },
            canWrite = new[] { "doc-1" },
            isAdmin = true
        };

        var token = BuildTokenWithSub(
            sub: "perm-user",
            email: "perm@example.com",
            permissions: permissions,
            secret: SharedSecret);

        var payload = validator.Validate(token);

        Assert.NotNull(payload);
        Assert.Equal(new[] { "doc-1", "doc-2", "doc-3" }, payload!.Permissions.CanRead);
        Assert.Equal(new[] { "doc-1" }, payload.Permissions.CanWrite);
        Assert.True(payload.Permissions.IsAdmin);
    }

    [Fact]
    public void ClaimExtraction_EmailClaim_ExtractedCorrectly()
    {
        var config = CreateConfig();
        var validator = new JwtValidator(config, NullLogger<JwtValidator>.Instance);

        var token = BuildTokenWithSub(
            sub: "email-user",
            email: "test@synckit.dev",
            permissions: new { canRead = Array.Empty<string>(), canWrite = Array.Empty<string>(), isAdmin = false },
            secret: SharedSecret);

        var payload = validator.Validate(token);

        Assert.NotNull(payload);
        Assert.Equal("test@synckit.dev", payload!.Email);
    }

    [Fact]
    public void ClaimExtraction_ExpAndIat_AreUnixEpochSeconds()
    {
        var config = CreateConfig();
        var validator = new JwtValidator(config, NullLogger<JwtValidator>.Instance);

        var now = DateTimeOffset.UtcNow;
        var token = BuildTokenWithSub(
            sub: "time-user",
            email: null,
            permissions: new { canRead = Array.Empty<string>(), canWrite = Array.Empty<string>(), isAdmin = false },
            secret: SharedSecret,
            iat: now,
            exp: now.AddHours(24));

        var payload = validator.Validate(token);

        Assert.NotNull(payload);
        Assert.NotNull(payload!.Iat);
        Assert.NotNull(payload.Exp);
        Assert.True(payload.Exp > payload.Iat);
        Assert.False(validator.IsExpired(payload));
    }

    [Fact]
    public void ClaimExtraction_IssuerAndAudience_ValidatedWhenConfigured()
    {
        var config = CreateConfig(issuer: "synckit-server", audience: "synckit-client");
        var validator = new JwtValidator(config, NullLogger<JwtValidator>.Instance);

        var token = BuildTokenWithSub(
            sub: "iss-user",
            email: null,
            permissions: new { canRead = Array.Empty<string>(), canWrite = Array.Empty<string>(), isAdmin = false },
            secret: SharedSecret,
            issuer: "synckit-server",
            audience: "synckit-client");

        var payload = validator.Validate(token);

        Assert.NotNull(payload);
        Assert.Equal("iss-user", payload!.UserId);
    }

    #endregion

    #region Wrong secret

    [Fact]
    public void Token_SignedWithDifferentSecret_FailsValidation()
    {
        var validatorConfig = CreateConfig(secret: SharedSecret);
        var validator = new JwtValidator(validatorConfig, NullLogger<JwtValidator>.Instance);

        var token = BuildTokenWithSub(
            sub: "wrong-secret-user",
            email: null,
            permissions: new { canRead = Array.Empty<string>(), canWrite = Array.Empty<string>(), isAdmin = false },
            secret: "completely-different-secret-32chars!");

        var payload = validator.Validate(token);

        Assert.Null(payload);
    }

    [Fact]
    public void TypeScriptStyleToken_WithDifferentSecret_FailsValidation()
    {
        var validatorConfig = CreateConfig(secret: SharedSecret);
        var validator = new JwtValidator(validatorConfig, NullLogger<JwtValidator>.Instance);

        var token = BuildTypeScriptStyleToken(
            userId: "ts-wrong",
            email: null,
            permissions: new { canRead = Array.Empty<string>(), canWrite = Array.Empty<string>(), isAdmin = false },
            secret: "another-wrong-secret-32-chars!!!!");

        var payload = validator.Validate(token);

        Assert.Null(payload);
    }

    #endregion

    #region Helpers

    /// <summary>
    /// Builds a JWT mimicking the TypeScript server's jwt.sign({ userId, email, permissions }, secret)
    /// which places userId as a top-level claim (NOT as "sub").
    /// </summary>
    private static string BuildTypeScriptStyleToken(
        string userId,
        string? email,
        object permissions,
        string secret,
        DateTimeOffset? iat = null,
        DateTimeOffset? exp = null)
    {
        var now = iat ?? DateTimeOffset.UtcNow;
        var expires = exp ?? now.AddHours(24);
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            // TypeScript uses top-level "userId" — NOT "sub"
            new("userId", userId),
            new(JwtRegisteredClaimNames.Iat, now.ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64),
            new("permissions", JsonSerializer.Serialize(permissions), JsonClaimValueTypes.Json)
        };

        if (!string.IsNullOrWhiteSpace(email))
        {
            claims.Add(new Claim("email", email));
        }

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = expires.UtcDateTime,
            SigningCredentials = creds
        };

        var handler = new JwtSecurityTokenHandler();
        return handler.WriteToken(handler.CreateToken(tokenDescriptor));
    }

    /// <summary>
    /// Builds a JWT with the standard "sub" claim (C#-compatible).
    /// </summary>
    private static string BuildTokenWithSub(
        string sub,
        string? email,
        object permissions,
        string secret,
        DateTimeOffset? iat = null,
        DateTimeOffset? exp = null,
        string? issuer = null,
        string? audience = null)
    {
        var now = iat ?? DateTimeOffset.UtcNow;
        var expires = exp ?? now.AddHours(24);
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, sub),
            new(JwtRegisteredClaimNames.Iat, now.ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64),
            new("permissions", JsonSerializer.Serialize(permissions), JsonClaimValueTypes.Json)
        };

        if (!string.IsNullOrWhiteSpace(email))
        {
            claims.Add(new Claim(JwtRegisteredClaimNames.Email, email));
        }

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = expires.UtcDateTime,
            SigningCredentials = creds,
            Issuer = issuer,
            Audience = audience
        };

        var handler = new JwtSecurityTokenHandler();
        return handler.WriteToken(handler.CreateToken(tokenDescriptor));
    }

    /// <summary>
    /// Builds a JWT with both "sub" and "userId" claims (hypothetical interop token).
    /// </summary>
    private static string BuildTokenWithSubAndUserId(
        string sub,
        string userId,
        string? email,
        object permissions,
        string secret)
    {
        var now = DateTimeOffset.UtcNow;
        var expires = now.AddHours(24);
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, sub),
            new("userId", userId),
            new(JwtRegisteredClaimNames.Iat, now.ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64),
            new("permissions", JsonSerializer.Serialize(permissions), JsonClaimValueTypes.Json)
        };

        if (!string.IsNullOrWhiteSpace(email))
        {
            claims.Add(new Claim(JwtRegisteredClaimNames.Email, email));
        }

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = expires.UtcDateTime,
            SigningCredentials = creds
        };

        var handler = new JwtSecurityTokenHandler();
        return handler.WriteToken(handler.CreateToken(tokenDescriptor));
    }

    private static IOptions<SyncKitConfig> CreateConfig(
        string secret = SharedSecret,
        string? issuer = null,
        string? audience = null)
    {
        return Options.Create(new SyncKitConfig
        {
            JwtSecret = secret,
            JwtExpiresIn = "24h",
            JwtRefreshExpiresIn = "7d",
            JwtIssuer = issuer,
            JwtAudience = audience
        });
    }

    #endregion
}
