using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using SyncKit.Server.Auth;
using SyncKit.Server.Configuration;

namespace SyncKit.Server.Tests.Auth;

/// <summary>
/// Tests for ApiKeyValidator service.
/// API keys provide full admin permissions when valid.
/// </summary>
public class ApiKeyValidatorTests
{
    [Fact]
    public void Validate_ValidKey_ReturnsPayloadWithFullPermissions()
    {
        // Arrange
        var validator = CreateValidator("test-key-123");

        // Act
        var result = validator.Validate("test-key-123");

        // Assert
        Assert.NotNull(result);
        Assert.Equal("api-key-user", result.UserId);
        Assert.Null(result.Email);
        Assert.True(result.Permissions.IsAdmin);
        Assert.Empty(result.Permissions.CanRead);
        Assert.Empty(result.Permissions.CanWrite);
        Assert.NotNull(result.Iat);
        Assert.NotNull(result.Exp);

        // Verify token doesn't expire soon
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        Assert.True(result.Exp > now + (365 * 24 * 60 * 60)); // At least 1 year
    }

    [Fact]
    public void Validate_InvalidKey_ReturnsNull()
    {
        // Arrange
        var validator = CreateValidator("valid-key");

        // Act
        var result = validator.Validate("invalid-key");

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Validate_EmptyKey_ReturnsNull()
    {
        // Arrange
        var validator = CreateValidator("valid-key");

        // Act
        var result = validator.Validate("");

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Validate_NullKey_ReturnsNull()
    {
        // Arrange
        var validator = CreateValidator("valid-key");

        // Act
        var result = validator.Validate(null!);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Validate_WhitespaceKey_ReturnsNull()
    {
        // Arrange
        var validator = CreateValidator("valid-key");

        // Act
        var result = validator.Validate("   ");

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Validate_MultipleKeys_AllValid()
    {
        // Arrange
        var validator = CreateValidator("key1", "key2", "key3");

        // Act & Assert
        Assert.NotNull(validator.Validate("key1"));
        Assert.NotNull(validator.Validate("key2"));
        Assert.NotNull(validator.Validate("key3"));
        Assert.Null(validator.Validate("key4"));
    }

    [Fact]
    public void Validate_CaseSensitive()
    {
        // Arrange
        var validator = CreateValidator("MyApiKey");

        // Act & Assert
        Assert.NotNull(validator.Validate("MyApiKey"));
        Assert.Null(validator.Validate("myapikey"));
        Assert.Null(validator.Validate("MYAPIKEY"));
    }

    [Fact]
    public void Constructor_FiltersEmptyKeys()
    {
        // Arrange - includes empty and whitespace keys
        var validator = CreateValidator("valid-key", "", "  ", "another-key");

        // Act & Assert - only non-empty keys are valid
        Assert.NotNull(validator.Validate("valid-key"));
        Assert.NotNull(validator.Validate("another-key"));
        Assert.Null(validator.Validate(""));
        Assert.Null(validator.Validate("  "));
    }

    [Fact]
    public void Constructor_HandlesNullApiKeysArray()
    {
        // Arrange
        var config = Options.Create(new SyncKitConfig
        {
            JwtSecret = "test-secret-key-for-development-32-chars",
            ApiKeys = null!
        });
        var validator = new ApiKeyValidator(config, NullLogger<ApiKeyValidator>.Instance);

        // Act
        var result = validator.Validate("any-key");

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Constructor_HandlesEmptyApiKeysArray()
    {
        // Arrange
        var validator = CreateValidator();

        // Act
        var result = validator.Validate("any-key");

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Validate_ReturnsAdminPermissions()
    {
        // Arrange
        var validator = CreateValidator("test-key");

        // Act
        var result = validator.Validate("test-key");

        // Assert
        Assert.NotNull(result);
        Assert.True(result.Permissions.IsAdmin, "API key should grant admin permissions");

        // Admin permissions mean empty arrays for CanRead/CanWrite
        Assert.Empty(result.Permissions.CanRead);
        Assert.Empty(result.Permissions.CanWrite);
    }

    [Fact]
    public void Validate_SetsTimestamps()
    {
        // Arrange
        var validator = CreateValidator("test-key");
        var beforeValidation = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        // Act
        var result = validator.Validate("test-key");
        var afterValidation = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        // Assert
        Assert.NotNull(result);
        Assert.NotNull(result.Iat);
        Assert.NotNull(result.Exp);

        // Iat should be around now
        Assert.True(result.Iat >= beforeValidation);
        Assert.True(result.Iat <= afterValidation);

        // Exp should be far in the future (100 years)
        var expectedMinExp = DateTimeOffset.UtcNow.AddYears(99).ToUnixTimeSeconds();
        Assert.True(result.Exp > expectedMinExp);
    }

    private static ApiKeyValidator CreateValidator(params string[] keys)
    {
        var config = Options.Create(new SyncKitConfig
        {
            JwtSecret = "test-secret-key-for-development-32-chars",
            ApiKeys = keys
        });
        return new ApiKeyValidator(config, NullLogger<ApiKeyValidator>.Instance);
    }
}
