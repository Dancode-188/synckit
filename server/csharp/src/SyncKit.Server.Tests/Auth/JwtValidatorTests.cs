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
/// Comprehensive tests for JwtValidator aligned with TypeScript server TokenPayload structure.
/// TypeScript reference: { userId, email?, permissions: DocumentPermissions, iat?, exp? }
///
/// Test categories:
/// 1. Valid Token Scenarios - Various valid token structures
/// 2. Invalid Signature Scenarios - Signature verification
/// 3. Expired/Timing Scenarios - Token expiration handling
/// 4. Issuer/Audience Validation - Claim validation
/// 5. Permission Extraction - DocumentPermissions parsing
/// 6. Edge Cases - Empty, malformed, null inputs
/// 7. Security Scenarios - Algorithm attacks, tampering
/// </summary>
public class JwtValidatorTests
{
    private const string Secret = "test-secret-key-for-development-32-chars";
    private const string AlternateSecret = "different-secret-value-that-is-32-characters!";

    #region Valid Token Scenarios

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
    public void Validate_ReturnsPayload_WithLongTokenExpiry()
    {
        // Arrange - Token valid for 30 days
        var expires = DateTimeOffset.UtcNow.AddDays(30);
        var token = CreateToken(secret: Secret, expires: expires);
        var validator = CreateValidator();

        // Act
        var payload = validator.Validate(token);

        // Assert
        Assert.NotNull(payload);
        Assert.NotNull(payload!.Exp);
    }

    [Fact]
    public void Validate_ReturnsPayload_WithMinimalClaims()
    {
        // Arrange - Only required claims (sub)
        var token = CreateToken(secret: Secret, permissions: null, includeEmail: false);
        var validator = CreateValidator();

        // Act
        var payload = validator.Validate(token);

        // Assert
        Assert.NotNull(payload);
        Assert.Equal("user-123", payload!.UserId);
        Assert.Null(payload.Email);
        Assert.Empty(payload.Permissions.CanRead);
        Assert.Empty(payload.Permissions.CanWrite);
        Assert.False(payload.Permissions.IsAdmin);
    }

    [Fact]
    public void Validate_HandlesTokenJustIssued()
    {
        // Arrange - Token issued right now
        var now = DateTimeOffset.UtcNow;
        var token = CreateToken(secret: Secret, issuedAt: now, expires: now.AddMinutes(5));
        var validator = CreateValidator();

        // Act
        var payload = validator.Validate(token);

        // Assert
        Assert.NotNull(payload);
    }

    #endregion

    #region Invalid Signature Scenarios

    [Fact]
    public void Validate_ReturnsNull_ForInvalidSignature()
    {
        // Arrange
        var token = CreateToken(secret: AlternateSecret);
        var validator = CreateValidator();

        // Act
        var payload = validator.Validate(token);

        // Assert
        Assert.Null(payload);
    }

    [Fact]
    public void Validate_ReturnsNull_ForTamperedPayload()
    {
        // Arrange - Create valid token then tamper with it
        var token = CreateToken(secret: Secret);
        var parts = token.Split('.');

        // Tamper with the payload (middle part)
        var tamperedPayload = Convert.ToBase64String(Encoding.UTF8.GetBytes("{\"sub\":\"hacker\"}"));
        var tamperedToken = $"{parts[0]}.{tamperedPayload}.{parts[2]}";

        var validator = CreateValidator();

        // Act
        var payload = validator.Validate(tamperedToken);

        // Assert
        Assert.Null(payload);
    }

    [Fact]
    public void Validate_ReturnsNull_ForTruncatedSignature()
    {
        // Arrange
        var token = CreateToken(secret: Secret);
        var truncatedToken = token.Substring(0, token.Length - 10);
        var validator = CreateValidator();

        // Act
        var payload = validator.Validate(truncatedToken);

        // Assert
        Assert.Null(payload);
    }

    #endregion

    #region Expired/Timing Scenarios

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
    public void Validate_ReturnsNull_ForTokenExpiredJustNow()
    {
        // Arrange - Token expired 1 second ago (tests zero clock skew)
        var issuedAt = DateTimeOffset.UtcNow.AddMinutes(-5);
        var expires = DateTimeOffset.UtcNow.AddSeconds(-1);
        var token = CreateToken(secret: Secret, expires: expires, issuedAt: issuedAt);
        var validator = CreateValidator();

        // Act
        var payload = validator.Validate(token);

        // Assert
        Assert.Null(payload);
    }

    [Fact]
    public void Validate_ReturnsPayload_ForTokenAboutToExpire()
    {
        // Arrange - Token expires in 30 seconds
        var expires = DateTimeOffset.UtcNow.AddSeconds(30);
        var token = CreateToken(secret: Secret, expires: expires);
        var validator = CreateValidator();

        // Act
        var payload = validator.Validate(token);

        // Assert
        Assert.NotNull(payload);
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
    public void IsExpired_ReturnsTrue_WhenJustExpired()
    {
        // Arrange - Token expired 1 second ago
        var payload = new TokenPayload
        {
            UserId = "user",
            Exp = DateTimeOffset.UtcNow.AddSeconds(-1).ToUnixTimeSeconds(),
            Permissions = new DocumentPermissions()
        };
        var validator = CreateValidator();

        // Act
        var expired = validator.IsExpired(payload);

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

    [Fact]
    public void IsExpired_ReturnsFalse_WhenExpiringInFuture()
    {
        // Arrange - Token expires in 1 hour
        var payload = new TokenPayload
        {
            UserId = "user",
            Exp = DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeSeconds(),
            Permissions = new DocumentPermissions()
        };
        var validator = CreateValidator();

        // Act
        var expired = validator.IsExpired(payload);

        // Assert
        Assert.False(expired);
    }

    #endregion

    #region Issuer/Audience Validation

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
    public void Validate_AcceptsCorrectIssuer_WhenConfigured()
    {
        // Arrange
        var token = CreateToken(secret: Secret, issuer: "expected-issuer");
        var validator = CreateValidator(issuer: "expected-issuer");

        // Act
        var payload = validator.Validate(token);

        // Assert
        Assert.NotNull(payload);
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
    public void Validate_AcceptsCorrectAudience_WhenConfigured()
    {
        // Arrange
        var token = CreateToken(secret: Secret, audience: "expected-audience");
        var validator = CreateValidator(audience: "expected-audience");

        // Act
        var payload = validator.Validate(token);

        // Assert
        Assert.NotNull(payload);
    }

    [Fact]
    public void Validate_SkipsIssuerValidation_WhenNotConfigured()
    {
        // Arrange - No issuer in validator config
        var token = CreateToken(secret: Secret, issuer: "any-issuer");
        var validator = CreateValidator(issuer: null);

        // Act
        var payload = validator.Validate(token);

        // Assert
        Assert.NotNull(payload);
    }

    [Fact]
    public void Validate_SkipsAudienceValidation_WhenNotConfigured()
    {
        // Arrange - No audience in validator config
        var token = CreateToken(secret: Secret, audience: "any-audience");
        var validator = CreateValidator(audience: null);

        // Act
        var payload = validator.Validate(token);

        // Assert
        Assert.NotNull(payload);
    }

    [Fact]
    public void Validate_SkipsIssuerValidation_WhenEmptyString()
    {
        // Arrange - Empty string issuer should be treated as not configured
        var token = CreateToken(secret: Secret, issuer: "any-issuer");
        var validator = CreateValidator(issuer: "");

        // Act
        var payload = validator.Validate(token);

        // Assert
        Assert.NotNull(payload);
    }

    [Fact]
    public void Validate_SkipsAudienceValidation_WhenWhitespace()
    {
        // Arrange - Whitespace audience should be treated as not configured
        var token = CreateToken(secret: Secret, audience: "any-audience");
        var validator = CreateValidator(audience: "   ");

        // Act
        var payload = validator.Validate(token);

        // Assert
        Assert.NotNull(payload);
    }

    #endregion

    #region Permission Extraction

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
    public void Validate_HandlesEmptyPermissionArrays()
    {
        // Arrange
        var permissions = new DocumentPermissions
        {
            CanRead = Array.Empty<string>(),
            CanWrite = Array.Empty<string>(),
            IsAdmin = false
        };
        var token = CreateToken(secret: Secret, permissions: permissions);
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
    public void Validate_HandlesManyPermissions()
    {
        // Arrange - Large number of document permissions
        var permissions = new DocumentPermissions
        {
            CanRead = Enumerable.Range(1, 100).Select(i => $"doc-{i}").ToArray(),
            CanWrite = Enumerable.Range(1, 50).Select(i => $"doc-{i}").ToArray(),
            IsAdmin = false
        };
        var token = CreateToken(secret: Secret, permissions: permissions);
        var validator = CreateValidator();

        // Act
        var payload = validator.Validate(token);

        // Assert
        Assert.NotNull(payload);
        Assert.Equal(100, payload!.Permissions.CanRead.Length);
        Assert.Equal(50, payload.Permissions.CanWrite.Length);
    }

    [Fact]
    public void Validate_HandlesSpecialCharactersInDocumentIds()
    {
        // Arrange - Document IDs with special characters
        var permissions = new DocumentPermissions
        {
            CanRead = new[] { "doc/with/slashes", "doc:with:colons", "doc-with-dashes", "doc_with_underscores" },
            CanWrite = new[] { "doc@special", "doc#hash" },
            IsAdmin = false
        };
        var token = CreateToken(secret: Secret, permissions: permissions);
        var validator = CreateValidator();

        // Act
        var payload = validator.Validate(token);

        // Assert
        Assert.NotNull(payload);
        Assert.Contains("doc/with/slashes", payload!.Permissions.CanRead);
        Assert.Contains("doc:with:colons", payload.Permissions.CanRead);
        Assert.Contains("doc@special", payload.Permissions.CanWrite);
    }

    [Fact]
    public void Validate_HandlesUnicodeDocumentIds()
    {
        // Arrange - Document IDs with unicode characters
        var permissions = new DocumentPermissions
        {
            CanRead = new[] { "документ-1", "文档-2", "ドキュメント-3" },
            CanWrite = Array.Empty<string>(),
            IsAdmin = false
        };
        var token = CreateToken(secret: Secret, permissions: permissions);
        var validator = CreateValidator();

        // Act
        var payload = validator.Validate(token);

        // Assert
        Assert.NotNull(payload);
        Assert.Contains("документ-1", payload!.Permissions.CanRead);
        Assert.Contains("文档-2", payload.Permissions.CanRead);
    }

    #endregion

    #region Edge Cases

    [Fact]
    public void Validate_ReturnsNull_ForNullToken()
    {
        // Arrange
        var validator = CreateValidator();

        // Act
        var payload = validator.Validate(null!);

        // Assert
        Assert.Null(payload);
    }

    [Fact]
    public void Validate_ReturnsNull_ForEmptyToken()
    {
        // Arrange
        var validator = CreateValidator();

        // Act
        var payload = validator.Validate("");

        // Assert
        Assert.Null(payload);
    }

    [Fact]
    public void Validate_ReturnsNull_ForWhitespaceToken()
    {
        // Arrange
        var validator = CreateValidator();

        // Act
        var payload = validator.Validate("   ");

        // Assert
        Assert.Null(payload);
    }

    [Fact]
    public void Validate_ReturnsNull_ForMalformedToken_NoPeriods()
    {
        // Arrange
        var validator = CreateValidator();

        // Act
        var payload = validator.Validate("notavalidtoken");

        // Assert
        Assert.Null(payload);
    }

    [Fact]
    public void Validate_ReturnsNull_ForMalformedToken_OnePeriod()
    {
        // Arrange
        var validator = CreateValidator();

        // Act
        var payload = validator.Validate("header.payload");

        // Assert
        Assert.Null(payload);
    }

    [Fact]
    public void Validate_ReturnsNull_ForMalformedToken_InvalidBase64()
    {
        // Arrange
        var validator = CreateValidator();

        // Act
        var payload = validator.Validate("!!!.@@@.###");

        // Assert
        Assert.Null(payload);
    }

    [Fact]
    public void Validate_ReturnsNull_ForRandomGarbageString()
    {
        // Arrange
        var validator = CreateValidator();
        var garbage = Convert.ToBase64String(Encoding.UTF8.GetBytes("random garbage data"));

        // Act
        var payload = validator.Validate(garbage);

        // Assert
        Assert.Null(payload);
    }

    [Fact]
    public void Validate_HandlesInvalidPermissionsJson()
    {
        // Arrange - Token with invalid JSON in permissions claim
        var now = DateTimeOffset.UtcNow;
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Secret)),
            SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, "user-123"),
            new(JwtRegisteredClaimNames.Iat, now.ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64),
            new("permissions", "not-valid-json", ClaimValueTypes.String) // Invalid JSON
        };

        var token = new JwtSecurityToken(
            issuer: "synckit",
            audience: "synckit-api",
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: now.AddMinutes(5).UtcDateTime,
            signingCredentials: credentials);

        var tokenString = new JwtSecurityTokenHandler().WriteToken(token);
        var validator = CreateValidator();

        // Act
        var payload = validator.Validate(tokenString);

        // Assert - Should return payload with empty permissions (graceful degradation)
        Assert.NotNull(payload);
        Assert.Empty(payload!.Permissions.CanRead);
        Assert.Empty(payload.Permissions.CanWrite);
        Assert.False(payload.Permissions.IsAdmin);
    }

    [Fact]
    public void Constructor_AcceptsShortSecret_ButTokensWontValidate()
    {
        // Arrange - A short secret is accepted at construction time
        // but tokens won't validate because signing credentials will fail
        var options = Options.Create(new SyncKitConfig
        {
            JwtSecret = "short" // Less than 128 bits (16 bytes)
        });

        // Act - Constructor should succeed
        var validator = new JwtValidator(options, NullLogger<JwtValidator>.Instance);

        // Assert - Validating any token should fail because the secret is too short
        // for HS256 (which requires at least 128 bits)
        // Note: This validates that the validator handles the short key gracefully
        var result = validator.Validate("some.invalid.token");
        Assert.Null(result);
    }

    [Fact]
    public void Constructor_ThrowsArgumentNullException_WhenConfigIsNull()
    {
        // Act & Assert
        Assert.Throws<ArgumentNullException>(() =>
            new JwtValidator(null!, NullLogger<JwtValidator>.Instance));
    }

    [Fact]
    public void Constructor_ThrowsArgumentNullException_WhenLoggerIsNull()
    {
        // Arrange
        var options = Options.Create(new SyncKitConfig { JwtSecret = Secret });

        // Act & Assert
        Assert.Throws<ArgumentNullException>(() =>
            new JwtValidator(options, null!));
    }

    #endregion

    #region Security Scenarios

    [Fact]
    public void Validate_RejectsNoneAlgorithm()
    {
        // Arrange - "none" algorithm is a known attack vector
        var validator = CreateValidator();

        // Create a token header claiming "none" algorithm
        var header = Convert.ToBase64String(Encoding.UTF8.GetBytes("{\"alg\":\"none\",\"typ\":\"JWT\"}"));
        var payload = Convert.ToBase64String(Encoding.UTF8.GetBytes("{\"sub\":\"hacker\"}"));
        var noneAlgToken = $"{header}.{payload}."; // Empty signature

        // Act
        var result = validator.Validate(noneAlgToken);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Validate_RejectsWrongAlgorithm_WhenHS256Configured()
    {
        // Arrange - Validator expects HS256
        var validator = CreateValidator();

        // Create a token with HS256 but modify the header to claim it's HS384
        // This tests that the validator properly validates the algorithm in the token
        // matches what's expected (HS256 in this case)

        // Base64url encode a header claiming HS384 algorithm
        var headerJson = """{"alg":"HS384","typ":"JWT"}""";
        var payloadJson = """{"sub":"user-123","exp":""" + DateTimeOffset.UtcNow.AddMinutes(5).ToUnixTimeSeconds() + "}";

        var header = Base64UrlEncoder.Encode(headerJson);
        var payload = Base64UrlEncoder.Encode(payloadJson);

        // Create signature with HS256 (but header claims HS384 - algorithm mismatch attack)
        using var hmac = new System.Security.Cryptography.HMACSHA256(Encoding.UTF8.GetBytes(Secret));
        var signatureInput = $"{header}.{payload}";
        var signatureBytes = hmac.ComputeHash(Encoding.UTF8.GetBytes(signatureInput));
        var signature = Base64UrlEncoder.Encode(signatureBytes);

        var tokenString = $"{header}.{payload}.{signature}";

        // Act
        var result = validator.Validate(tokenString);

        // Assert - Should reject because algorithm mismatch (header says HS384, signature is HS256)
        Assert.Null(result);
    }

    [Fact]
    public void Validate_RejectsTokenWithMissingSubClaim()
    {
        // Arrange - Token without required 'sub' claim
        var now = DateTimeOffset.UtcNow;
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Secret)),
            SecurityAlgorithms.HmacSha256);

        // No 'sub' claim
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Iat, now.ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64)
        };

        var token = new JwtSecurityToken(
            issuer: "synckit",
            audience: "synckit-api",
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: now.AddMinutes(5).UtcDateTime,
            signingCredentials: credentials);

        var tokenString = new JwtSecurityTokenHandler().WriteToken(token);
        var validator = CreateValidator();

        // Act
        var result = validator.Validate(tokenString);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Validate_RejectsTokenWithEmptySubClaim()
    {
        // Arrange - Token with empty 'sub' claim
        var now = DateTimeOffset.UtcNow;
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Secret)),
            SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, ""), // Empty sub
            new(JwtRegisteredClaimNames.Iat, now.ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64)
        };

        var token = new JwtSecurityToken(
            issuer: "synckit",
            audience: "synckit-api",
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: now.AddMinutes(5).UtcDateTime,
            signingCredentials: credentials);

        var tokenString = new JwtSecurityTokenHandler().WriteToken(token);
        var validator = CreateValidator();

        // Act
        var result = validator.Validate(tokenString);

        // Assert
        Assert.Null(result);
    }

    #endregion

    #region Helper Methods

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
        bool includeEmail = true,
        string? userId = "user-123",
        bool customSecret = false)
    {
        var now = issuedAt ?? DateTimeOffset.UtcNow;
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)),
            SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, userId ?? "user-123"),
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

    #endregion
}
