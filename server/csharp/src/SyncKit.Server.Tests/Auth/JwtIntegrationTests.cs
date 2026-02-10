using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using SyncKit.Server.Auth;
using SyncKit.Server.Configuration;

namespace SyncKit.Server.Tests.Auth;

/// <summary>
/// Integration tests demonstrating JWT generation and validation working together.
/// These tests verify the complete token lifecycle matching TypeScript server behavior.
/// </summary>
public class JwtIntegrationTests
{
    private const string Secret = "test-secret-key-for-development-32-chars";

    [Fact]
    public void TokenLifecycle_GenerateValidateRefresh_WorksEndToEnd()
    {
        // Arrange
        var config = CreateConfig();
        var generator = new JwtGenerator(config, NullLogger<JwtGenerator>.Instance);
        var validator = new JwtValidator(config, NullLogger<JwtValidator>.Instance);

        var permissions = new DocumentPermissions
        {
            CanRead = new[] { "doc-1", "doc-2", "doc-3" },
            CanWrite = new[] { "doc-1" },
            IsAdmin = false
        };

        // Act - Generate token pair
        var (accessToken, refreshToken) = generator.GenerateTokenPair(
            "user-123",
            "user@example.com",
            permissions);

        // Act - Validate access token
        var accessPayload = validator.Validate(accessToken);

        // Act - Validate refresh token
        var refreshPayload = validator.Validate(refreshToken);

        // Assert - Access token validation
        Assert.NotNull(accessPayload);
        Assert.Equal("user-123", accessPayload!.UserId);
        Assert.Equal("user@example.com", accessPayload.Email);
        Assert.Equal(3, accessPayload.Permissions.CanRead.Length);
        Assert.Single(accessPayload.Permissions.CanWrite);
        Assert.False(accessPayload.Permissions.IsAdmin);
        Assert.False(validator.IsExpired(accessPayload));

        // Assert - Refresh token validation
        Assert.NotNull(refreshPayload);
        Assert.Equal("user-123", refreshPayload!.UserId);
        Assert.False(validator.IsExpired(refreshPayload));
    }

    [Fact]
    public void AdminUser_TokenLifecycle_WorksCorrectly()
    {
        // Arrange
        var config = CreateConfig();
        var generator = new JwtGenerator(config, NullLogger<JwtGenerator>.Instance);
        var validator = new JwtValidator(config, NullLogger<JwtValidator>.Instance);

        var adminPermissions = new DocumentPermissions
        {
            CanRead = Array.Empty<string>(),
            CanWrite = Array.Empty<string>(),
            IsAdmin = true
        };

        // Act
        var accessToken = generator.GenerateAccessToken("admin-456", "admin@example.com", adminPermissions);
        var payload = validator.Validate(accessToken);

        // Assert
        Assert.NotNull(payload);
        Assert.Equal("admin-456", payload!.UserId);
        Assert.Equal("admin@example.com", payload.Email);
        Assert.True(payload.Permissions.IsAdmin);
        Assert.Empty(payload.Permissions.CanRead);
        Assert.Empty(payload.Permissions.CanWrite);
    }

    [Fact]
    public void MultipleTokens_ForDifferentUsers_ValidateIndependently()
    {
        // Arrange
        var config = CreateConfig();
        var generator = new JwtGenerator(config, NullLogger<JwtGenerator>.Instance);
        var validator = new JwtValidator(config, NullLogger<JwtValidator>.Instance);

        var user1Permissions = new DocumentPermissions
        {
            CanRead = new[] { "doc-1" },
            CanWrite = new[] { "doc-1" },
            IsAdmin = false
        };

        var user2Permissions = new DocumentPermissions
        {
            CanRead = new[] { "doc-2", "doc-3" },
            CanWrite = Array.Empty<string>(),
            IsAdmin = false
        };

        // Act
        var token1 = generator.GenerateAccessToken("user-1", "user1@example.com", user1Permissions);
        var token2 = generator.GenerateAccessToken("user-2", "user2@example.com", user2Permissions);

        var payload1 = validator.Validate(token1);
        var payload2 = validator.Validate(token2);

        // Assert
        Assert.NotNull(payload1);
        Assert.NotNull(payload2);

        Assert.Equal("user-1", payload1!.UserId);
        Assert.Equal("user-2", payload2!.UserId);

        Assert.Equal(new[] { "doc-1" }, payload1.Permissions.CanRead);
        Assert.Equal(new[] { "doc-2", "doc-3" }, payload2.Permissions.CanRead);

        Assert.Single(payload1.Permissions.CanWrite);
        Assert.Empty(payload2.Permissions.CanWrite);
    }

    [Fact]
    public void TokenWithDifferentSecret_FailsValidation()
    {
        // Arrange - Generator uses one secret, validator uses another
        var generatorConfig = CreateConfig(secret: "secret-one-32-characters-long!!!");
        var validatorConfig = CreateConfig(secret: "different-secret-32-characters!");

        var generator = new JwtGenerator(generatorConfig, NullLogger<JwtGenerator>.Instance);
        var validator = new JwtValidator(validatorConfig, NullLogger<JwtValidator>.Instance);

        var permissions = new DocumentPermissions { IsAdmin = false };

        // Act
        var token = generator.GenerateAccessToken("user-123", null, permissions);
        var payload = validator.Validate(token);

        // Assert - Validation should fail due to signature mismatch
        Assert.Null(payload);
    }

    [Fact]
    public void CustomExpiryConfiguration_IsRespected()
    {
        // Arrange - Short-lived tokens for testing
        var config = CreateConfig(accessTokenExpiry: "1h", refreshTokenExpiry: "2h");
        var generator = new JwtGenerator(config, NullLogger<JwtGenerator>.Instance);
        var validator = new JwtValidator(config, NullLogger<JwtValidator>.Instance);

        var permissions = new DocumentPermissions();

        // Act
        var (accessToken, refreshToken) = generator.GenerateTokenPair("user-123", null, permissions);
        var accessPayload = validator.Validate(accessToken);
        var refreshPayload = validator.Validate(refreshToken);

        // Assert
        Assert.NotNull(accessPayload);
        Assert.NotNull(refreshPayload);

        // Refresh token should expire later than access token
        Assert.True(refreshPayload!.Exp > accessPayload!.Exp);

        // Both should be valid now
        Assert.False(validator.IsExpired(accessPayload));
        Assert.False(validator.IsExpired(refreshPayload));
    }

    [Fact]
    public void TokenWithIssuerAndAudience_ValidatesCorrectly()
    {
        // Arrange
        var config = CreateConfig(issuer: "synckit-test", audience: "synckit-client");
        var generator = new JwtGenerator(config, NullLogger<JwtGenerator>.Instance);
        var validator = new JwtValidator(config, NullLogger<JwtValidator>.Instance);

        var permissions = new DocumentPermissions { IsAdmin = true };

        // Act
        var token = generator.GenerateAccessToken("user-123", "user@example.com", permissions);
        var payload = validator.Validate(token);

        // Assert
        Assert.NotNull(payload);
        Assert.Equal("user-123", payload!.UserId);
        Assert.True(payload.Permissions.IsAdmin);
    }

    [Fact]
    public void OptionalEmail_IsHandledCorrectly()
    {
        // Arrange
        var config = CreateConfig();
        var generator = new JwtGenerator(config, NullLogger<JwtGenerator>.Instance);
        var validator = new JwtValidator(config, NullLogger<JwtValidator>.Instance);

        var permissions = new DocumentPermissions { CanRead = new[] { "doc-1" } };

        // Act - Generate token without email
        var token = generator.GenerateAccessToken("user-789", null, permissions);
        var payload = validator.Validate(token);

        // Assert
        Assert.NotNull(payload);
        Assert.Equal("user-789", payload!.UserId);
        Assert.Null(payload.Email);
        Assert.Single(payload.Permissions.CanRead);
    }

    private IOptions<SyncKitConfig> CreateConfig(
        string secret = Secret,
        string? issuer = null,
        string? audience = null,
        string accessTokenExpiry = "24h",
        string refreshTokenExpiry = "7d")
    {
        return Options.Create(new SyncKitConfig
        {
            JwtSecret = secret,
            JwtExpiresIn = accessTokenExpiry,
            JwtRefreshExpiresIn = refreshTokenExpiry,
            JwtIssuer = issuer,
            JwtAudience = audience
        });
    }
}
