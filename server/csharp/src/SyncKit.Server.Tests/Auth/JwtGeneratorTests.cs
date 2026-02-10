using System.IdentityModel.Tokens.Jwt;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using SyncKit.Server.Auth;
using SyncKit.Server.Configuration;

namespace SyncKit.Server.Tests.Auth;

/// <summary>
/// Comprehensive tests for JwtGenerator matching TypeScript server behavior.
/// Verifies token generation with correct claims, expiry, and permissions structure.
///
/// Test categories:
/// 1. Access Token Generation - Standard access tokens with permissions
/// 2. Refresh Token Generation - Long-lived refresh tokens
/// 3. Token Pair Generation - Generating both tokens together
/// 4. Expiry Configuration - Custom expiry durations
/// 5. Permissions Encoding - DocumentPermissions serialization
/// 6. Validation Integration - Generated tokens pass validator
/// 7. Edge Cases - Empty permissions, missing email, etc.
/// </summary>
public class JwtGeneratorTests
{
    private const string Secret = "test-secret-key-for-development-32-chars";
    private const string Issuer = "test-issuer";
    private const string Audience = "test-audience";

    #region Access Token Generation

    [Fact]
    public void GenerateAccessToken_CreatesValidToken_WithAllClaims()
    {
        // Arrange
        var generator = CreateGenerator();
        var permissions = new DocumentPermissions
        {
            CanRead = new[] { "doc-1", "doc-2" },
            CanWrite = new[] { "doc-1" },
            IsAdmin = false
        };

        // Act
        var token = generator.GenerateAccessToken("user-123", "user@example.com", permissions);

        // Assert
        Assert.NotNull(token);
        Assert.NotEmpty(token);

        // Decode and verify token structure
        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);

        Assert.Equal("user-123", jwt.Subject);
        Assert.Contains(jwt.Claims, c => c.Type == JwtRegisteredClaimNames.Email && c.Value == "user@example.com");
        Assert.Contains(jwt.Claims, c => c.Type == JwtRegisteredClaimNames.Iat);
        Assert.True(jwt.ValidTo > DateTime.UtcNow);
    }

    [Fact]
    public void GenerateAccessToken_IncludesPermissions_AsJsonClaim()
    {
        // Arrange
        var generator = CreateGenerator();
        var permissions = new DocumentPermissions
        {
            CanRead = new[] { "doc-1", "doc-2" },
            CanWrite = new[] { "doc-1" },
            IsAdmin = false
        };

        // Act
        var token = generator.GenerateAccessToken("user-123", "user@example.com", permissions);

        // Assert
        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);
        var permissionsClaim = jwt.Claims.FirstOrDefault(c => c.Type == "permissions");

        Assert.NotNull(permissionsClaim);

        // Parse JSON and verify structure matches TypeScript format
        var permissionsJson = JsonDocument.Parse(permissionsClaim.Value);
        var root = permissionsJson.RootElement;

        Assert.True(root.TryGetProperty("canRead", out var canRead));
        Assert.Equal(JsonValueKind.Array, canRead.ValueKind);
        Assert.Equal(2, canRead.GetArrayLength());

        Assert.True(root.TryGetProperty("canWrite", out var canWrite));
        Assert.Equal(JsonValueKind.Array, canWrite.ValueKind);
        Assert.Equal(1, canWrite.GetArrayLength());

        Assert.True(root.TryGetProperty("isAdmin", out var isAdmin));
        Assert.False(isAdmin.GetBoolean());
    }

    [Fact]
    public void GenerateAccessToken_SupportsAdminPermissions()
    {
        // Arrange
        var generator = CreateGenerator();
        var permissions = new DocumentPermissions
        {
            CanRead = Array.Empty<string>(),
            CanWrite = Array.Empty<string>(),
            IsAdmin = true
        };

        // Act
        var token = generator.GenerateAccessToken("admin-123", "admin@example.com", permissions);

        // Assert
        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);
        var permissionsClaim = jwt.Claims.FirstOrDefault(c => c.Type == "permissions")?.Value;

        Assert.NotNull(permissionsClaim);
        var permissionsJson = JsonDocument.Parse(permissionsClaim);
        var isAdmin = permissionsJson.RootElement.GetProperty("isAdmin").GetBoolean();
        Assert.True(isAdmin);
    }

    [Fact]
    public void GenerateAccessToken_WorksWithoutEmail()
    {
        // Arrange - Email is optional in TypeScript server
        var generator = CreateGenerator();
        var permissions = new DocumentPermissions { IsAdmin = false };

        // Act
        var token = generator.GenerateAccessToken("user-123", null, permissions);

        // Assert
        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);

        Assert.Equal("user-123", jwt.Subject);
        Assert.DoesNotContain(jwt.Claims, c => c.Type == JwtRegisteredClaimNames.Email);
    }

    [Fact]
    public void GenerateAccessToken_UsesHS256Algorithm()
    {
        // Arrange
        var generator = CreateGenerator();
        var permissions = new DocumentPermissions();

        // Act
        var token = generator.GenerateAccessToken("user-123", null, permissions);

        // Assert
        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);

        Assert.Equal(SecurityAlgorithms.HmacSha256, jwt.Header.Alg);
    }

    [Fact]
    public void GenerateAccessToken_IncludesIssuerAndAudience()
    {
        // Arrange
        var generator = CreateGenerator(issuer: Issuer, audience: Audience);
        var permissions = new DocumentPermissions();

        // Act
        var token = generator.GenerateAccessToken("user-123", null, permissions);

        // Assert
        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);

        Assert.Equal(Issuer, jwt.Issuer);
        Assert.Contains(Audience, jwt.Audiences);
    }

    [Fact]
    public void GenerateAccessToken_ThrowsException_ForNullUserId()
    {
        // Arrange
        var generator = CreateGenerator();
        var permissions = new DocumentPermissions();

        // Act & Assert
        Assert.Throws<ArgumentException>(() =>
            generator.GenerateAccessToken(null!, null, permissions));
    }

    [Fact]
    public void GenerateAccessToken_ThrowsException_ForEmptyUserId()
    {
        // Arrange
        var generator = CreateGenerator();
        var permissions = new DocumentPermissions();

        // Act & Assert
        Assert.Throws<ArgumentException>(() =>
            generator.GenerateAccessToken("", null, permissions));
    }

    #endregion

    #region Refresh Token Generation

    [Fact]
    public void GenerateRefreshToken_CreatesValidToken()
    {
        // Arrange
        var generator = CreateGenerator();

        // Act
        var token = generator.GenerateRefreshToken("user-123");

        // Assert
        Assert.NotNull(token);
        Assert.NotEmpty(token);

        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);

        Assert.Equal("user-123", jwt.Subject);
        Assert.Contains(jwt.Claims, c => c.Type == JwtRegisteredClaimNames.Iat);
    }

    [Fact]
    public void GenerateRefreshToken_DoesNotIncludePermissions()
    {
        // Arrange
        var generator = CreateGenerator();

        // Act
        var token = generator.GenerateRefreshToken("user-123");

        // Assert
        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);

        Assert.DoesNotContain(jwt.Claims, c => c.Type == "permissions");
        Assert.DoesNotContain(jwt.Claims, c => c.Type == JwtRegisteredClaimNames.Email);
    }

    [Fact]
    public void GenerateRefreshToken_HasLongerExpiry_ThanAccessToken()
    {
        // Arrange
        var generator = CreateGenerator();
        var permissions = new DocumentPermissions();

        // Act
        var accessToken = generator.GenerateAccessToken("user-123", null, permissions);
        var refreshToken = generator.GenerateRefreshToken("user-123");

        // Assert
        var handler = new JwtSecurityTokenHandler();
        var accessJwt = handler.ReadJwtToken(accessToken);
        var refreshJwt = handler.ReadJwtToken(refreshToken);

        Assert.True(refreshJwt.ValidTo > accessJwt.ValidTo);
    }

    [Fact]
    public void GenerateRefreshToken_ThrowsException_ForNullUserId()
    {
        // Arrange
        var generator = CreateGenerator();

        // Act & Assert
        Assert.Throws<ArgumentException>(() =>
            generator.GenerateRefreshToken(null!));
    }

    #endregion

    #region Token Pair Generation

    [Fact]
    public void GenerateTokenPair_CreatesBothTokens()
    {
        // Arrange
        var generator = CreateGenerator();
        var permissions = new DocumentPermissions
        {
            CanRead = new[] { "doc-1" },
            IsAdmin = false
        };

        // Act
        var (accessToken, refreshToken) = generator.GenerateTokenPair("user-123", "user@example.com", permissions);

        // Assert
        Assert.NotNull(accessToken);
        Assert.NotNull(refreshToken);
        Assert.NotEmpty(accessToken);
        Assert.NotEmpty(refreshToken);
        Assert.NotEqual(accessToken, refreshToken);
    }

    [Fact]
    public void GenerateTokenPair_BothTokensHaveSameSubject()
    {
        // Arrange
        var generator = CreateGenerator();
        var permissions = new DocumentPermissions();

        // Act
        var (accessToken, refreshToken) = generator.GenerateTokenPair("user-123", null, permissions);

        // Assert
        var handler = new JwtSecurityTokenHandler();
        var accessJwt = handler.ReadJwtToken(accessToken);
        var refreshJwt = handler.ReadJwtToken(refreshToken);

        Assert.Equal("user-123", accessJwt.Subject);
        Assert.Equal("user-123", refreshJwt.Subject);
    }

    [Fact]
    public void GenerateTokenPair_AccessTokenHasPermissions_RefreshTokenDoesNot()
    {
        // Arrange
        var generator = CreateGenerator();
        var permissions = new DocumentPermissions { CanRead = new[] { "doc-1" } };

        // Act
        var (accessToken, refreshToken) = generator.GenerateTokenPair("user-123", null, permissions);

        // Assert
        var handler = new JwtSecurityTokenHandler();
        var accessJwt = handler.ReadJwtToken(accessToken);
        var refreshJwt = handler.ReadJwtToken(refreshToken);

        Assert.Contains(accessJwt.Claims, c => c.Type == "permissions");
        Assert.DoesNotContain(refreshJwt.Claims, c => c.Type == "permissions");
    }

    #endregion

    #region Expiry Configuration

    [Theory]
    [InlineData("1h", 1)]
    [InlineData("24h", 24)]
    [InlineData("2d", 48)]
    public void GenerateAccessToken_UsesConfiguredExpiry(string expiryConfig, int expectedHours)
    {
        // Arrange
        var generator = CreateGenerator(accessTokenExpiry: expiryConfig);
        var permissions = new DocumentPermissions();
        var now = DateTimeOffset.UtcNow;

        // Act
        var token = generator.GenerateAccessToken("user-123", null, permissions);

        // Assert
        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);
        var expiryTime = new DateTimeOffset(jwt.ValidTo, TimeSpan.Zero);
        var expectedExpiry = now.AddHours(expectedHours);

        // Allow 5 second tolerance for test execution time
        Assert.True(Math.Abs((expiryTime - expectedExpiry).TotalSeconds) < 5);
    }

    [Theory]
    [InlineData("7d", 7)]
    [InlineData("14d", 14)]
    [InlineData("1w", 7)]
    public void GenerateRefreshToken_UsesConfiguredExpiry(string expiryConfig, int expectedDays)
    {
        // Arrange
        var generator = CreateGenerator(refreshTokenExpiry: expiryConfig);
        var now = DateTimeOffset.UtcNow;

        // Act
        var token = generator.GenerateRefreshToken("user-123");

        // Assert
        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);
        var expiryTime = new DateTimeOffset(jwt.ValidTo, TimeSpan.Zero);
        var expectedExpiry = now.AddDays(expectedDays);

        // Allow 5 second tolerance for test execution time
        Assert.True(Math.Abs((expiryTime - expectedExpiry).TotalSeconds) < 5);
    }

    [Theory]
    [InlineData("30s", 30)]
    [InlineData("5m", 300)]
    [InlineData("2h", 7200)]
    public void ParseExpiry_SupportsVariousFormats(string format, int expectedSeconds)
    {
        // Arrange
        var generator = CreateGenerator(accessTokenExpiry: format);
        var permissions = new DocumentPermissions();
        var now = DateTimeOffset.UtcNow;

        // Act
        var token = generator.GenerateAccessToken("user-123", null, permissions);

        // Assert
        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);
        var expiryTime = new DateTimeOffset(jwt.ValidTo, TimeSpan.Zero);
        var expectedExpiry = now.AddSeconds(expectedSeconds);

        Assert.True(Math.Abs((expiryTime - expectedExpiry).TotalSeconds) < 5);
    }

    [Fact]
    public void ParseExpiry_UsesDefault_ForInvalidFormat()
    {
        // Arrange - Invalid format should fall back to default (24h)
        var generator = CreateGenerator(accessTokenExpiry: "invalid");
        var permissions = new DocumentPermissions();
        var now = DateTimeOffset.UtcNow;

        // Act
        var token = generator.GenerateAccessToken("user-123", null, permissions);

        // Assert
        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);
        var expiryTime = new DateTimeOffset(jwt.ValidTo, TimeSpan.Zero);
        var expectedExpiry = now.AddHours(24); // Default

        Assert.True(Math.Abs((expiryTime - expectedExpiry).TotalSeconds) < 5);
    }

    #endregion

    #region Validation Integration

    [Fact]
    public void GeneratedToken_PassesValidation()
    {
        // Arrange
        var config = CreateConfig();
        var generator = new JwtGenerator(config, NullLogger<JwtGenerator>.Instance);
        var validator = new JwtValidator(config, NullLogger<JwtValidator>.Instance);
        var permissions = new DocumentPermissions
        {
            CanRead = new[] { "doc-1" },
            CanWrite = new[] { "doc-2" },
            IsAdmin = false
        };

        // Act
        var token = generator.GenerateAccessToken("user-123", "user@example.com", permissions);
        var payload = validator.Validate(token);

        // Assert
        Assert.NotNull(payload);
        Assert.Equal("user-123", payload!.UserId);
        Assert.Equal("user@example.com", payload.Email);
        Assert.Equal(new[] { "doc-1" }, payload.Permissions.CanRead);
        Assert.Equal(new[] { "doc-2" }, payload.Permissions.CanWrite);
        Assert.False(payload.Permissions.IsAdmin);
    }

    [Fact]
    public void GeneratedRefreshToken_PassesValidation()
    {
        // Arrange
        var config = CreateConfig();
        var generator = new JwtGenerator(config, NullLogger<JwtGenerator>.Instance);
        var validator = new JwtValidator(config, NullLogger<JwtValidator>.Instance);

        // Act
        var token = generator.GenerateRefreshToken("user-456");
        var payload = validator.Validate(token);

        // Assert
        Assert.NotNull(payload);
        Assert.Equal("user-456", payload!.UserId);
    }

    [Fact]
    public void GeneratedTokenPair_BothPassValidation()
    {
        // Arrange
        var config = CreateConfig();
        var generator = new JwtGenerator(config, NullLogger<JwtGenerator>.Instance);
        var validator = new JwtValidator(config, NullLogger<JwtValidator>.Instance);
        var permissions = new DocumentPermissions { IsAdmin = true };

        // Act
        var (accessToken, refreshToken) = generator.GenerateTokenPair("admin-789", "admin@example.com", permissions);
        var accessPayload = validator.Validate(accessToken);
        var refreshPayload = validator.Validate(refreshToken);

        // Assert
        Assert.NotNull(accessPayload);
        Assert.NotNull(refreshPayload);
        Assert.Equal("admin-789", accessPayload!.UserId);
        Assert.Equal("admin-789", refreshPayload!.UserId);
        Assert.True(accessPayload.Permissions.IsAdmin);
    }

    #endregion

    #region Edge Cases

    [Fact]
    public void GenerateAccessToken_HandlesEmptyPermissions()
    {
        // Arrange
        var generator = CreateGenerator();
        var permissions = new DocumentPermissions
        {
            CanRead = Array.Empty<string>(),
            CanWrite = Array.Empty<string>(),
            IsAdmin = false
        };

        // Act
        var token = generator.GenerateAccessToken("user-123", null, permissions);

        // Assert
        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);
        var permissionsClaim = jwt.Claims.FirstOrDefault(c => c.Type == "permissions")?.Value;

        Assert.NotNull(permissionsClaim);
        var permissionsJson = JsonDocument.Parse(permissionsClaim);
        var root = permissionsJson.RootElement;

        Assert.Equal(0, root.GetProperty("canRead").GetArrayLength());
        Assert.Equal(0, root.GetProperty("canWrite").GetArrayLength());
        Assert.False(root.GetProperty("isAdmin").GetBoolean());
    }

    [Fact]
    public void GenerateAccessToken_HandlesLargePermissionSets()
    {
        // Arrange
        var generator = CreateGenerator();
        var docIds = Enumerable.Range(1, 100).Select(i => $"doc-{i}").ToArray();
        var permissions = new DocumentPermissions
        {
            CanRead = docIds,
            CanWrite = docIds,
            IsAdmin = false
        };

        // Act
        var token = generator.GenerateAccessToken("user-123", "user@example.com", permissions);

        // Assert
        Assert.NotNull(token);

        // Verify it validates correctly
        var config = CreateConfig();
        var validator = new JwtValidator(config, NullLogger<JwtValidator>.Instance);
        var payload = validator.Validate(token);

        Assert.NotNull(payload);
        Assert.Equal(100, payload!.Permissions.CanRead.Length);
        Assert.Equal(100, payload.Permissions.CanWrite.Length);
    }

    [Fact]
    public void GenerateAccessToken_HandlesSpecialCharactersInUserId()
    {
        // Arrange
        var generator = CreateGenerator();
        var permissions = new DocumentPermissions();
        var specialUserId = "user_123-abc@test.com|oauth";

        // Act
        var token = generator.GenerateAccessToken(specialUserId, null, permissions);

        // Assert
        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);

        Assert.Equal(specialUserId, jwt.Subject);
    }

    #endregion

    #region Helper Methods

    private IJwtGenerator CreateGenerator(
        string? issuer = null,
        string? audience = null,
        string accessTokenExpiry = "24h",
        string refreshTokenExpiry = "7d")
    {
        var config = CreateConfig(issuer, audience, accessTokenExpiry, refreshTokenExpiry);
        return new JwtGenerator(config, NullLogger<JwtGenerator>.Instance);
    }

    private IOptions<SyncKitConfig> CreateConfig(
        string? issuer = null,
        string? audience = null,
        string accessTokenExpiry = "24h",
        string refreshTokenExpiry = "7d")
    {
        return Options.Create(new SyncKitConfig
        {
            JwtSecret = Secret,
            JwtExpiresIn = accessTokenExpiry,
            JwtRefreshExpiresIn = refreshTokenExpiry,
            JwtIssuer = issuer,
            JwtAudience = audience
        });
    }

    #endregion
}
