using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using SyncKit.Server.Auth;
using SyncKit.Server.Configuration;

namespace SyncKit.Server.Tests.Auth;

/// <summary>
/// Comprehensive tests for ApiKeyValidator service.
/// API keys provide full admin permissions when valid.
///
/// Test categories:
/// 1. Valid Key Scenarios - Successful validation
/// 2. Invalid Key Scenarios - Rejection of invalid keys
/// 3. Multiple Keys - Support for multiple configured keys
/// 4. Edge Cases - Empty, null, whitespace handling
/// 5. Permission Verification - Admin permissions granted
/// 6. Timestamp Verification - Iat/Exp timestamps set correctly
/// 7. Configuration Scenarios - Various config states
/// </summary>
public class ApiKeyValidatorTests
{
    #region Valid Key Scenarios

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
    public void Validate_ValidKey_ReturnsConsistentUserId()
    {
        // Arrange
        var validator = CreateValidator("test-key-123");

        // Act
        var result1 = validator.Validate("test-key-123");
        var result2 = validator.Validate("test-key-123");

        // Assert - Same key should return same user ID
        Assert.NotNull(result1);
        Assert.NotNull(result2);
        Assert.Equal(result1!.UserId, result2!.UserId);
    }

    [Fact]
    public void Validate_LongApiKey_Works()
    {
        // Arrange - Very long API key
        var longKey = "sk_live_" + new string('a', 200);
        var validator = CreateValidator(longKey);

        // Act
        var result = validator.Validate(longKey);

        // Assert
        Assert.NotNull(result);
        Assert.True(result.Permissions.IsAdmin);
    }

    [Fact]
    public void Validate_ApiKeyWithSpecialCharacters_Works()
    {
        // Arrange - API key with various special characters
        var specialKey = "sk_test_abc123-XYZ_789+/=";
        var validator = CreateValidator(specialKey);

        // Act
        var result = validator.Validate(specialKey);

        // Assert
        Assert.NotNull(result);
    }

    [Fact]
    public void Validate_UuidStyleApiKey_Works()
    {
        // Arrange - UUID-style API key
        var uuidKey = "550e8400-e29b-41d4-a716-446655440000";
        var validator = CreateValidator(uuidKey);

        // Act
        var result = validator.Validate(uuidKey);

        // Assert
        Assert.NotNull(result);
    }

    #endregion

    #region Invalid Key Scenarios

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
    public void Validate_TabOnlyKey_ReturnsNull()
    {
        // Arrange
        var validator = CreateValidator("valid-key");

        // Act
        var result = validator.Validate("\t\t");

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Validate_NewlineKey_ReturnsNull()
    {
        // Arrange
        var validator = CreateValidator("valid-key");

        // Act
        var result = validator.Validate("\n\r");

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Validate_KeyWithLeadingWhitespace_ReturnsNull()
    {
        // Arrange - Key stored without whitespace, validated with whitespace
        var validator = CreateValidator("valid-key");

        // Act
        var result = validator.Validate("  valid-key");

        // Assert - Should not match (exact match required)
        Assert.Null(result);
    }

    [Fact]
    public void Validate_KeyWithTrailingWhitespace_ReturnsNull()
    {
        // Arrange
        var validator = CreateValidator("valid-key");

        // Act
        var result = validator.Validate("valid-key  ");

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Validate_PartialKeyMatch_ReturnsNull()
    {
        // Arrange
        var validator = CreateValidator("valid-key-full");

        // Act
        var result = validator.Validate("valid-key");

        // Assert - Partial match should fail
        Assert.Null(result);
    }

    [Fact]
    public void Validate_SupersetKeyMatch_ReturnsNull()
    {
        // Arrange
        var validator = CreateValidator("valid-key");

        // Act
        var result = validator.Validate("valid-key-extended");

        // Assert - Superset should fail
        Assert.Null(result);
    }

    #endregion

    #region Multiple Keys

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
    public void Validate_MultipleKeys_OrderDoesNotMatter()
    {
        // Arrange - Keys in different orders
        var validator1 = CreateValidator("key1", "key2", "key3");
        var validator2 = CreateValidator("key3", "key1", "key2");

        // Act & Assert - Both validators should accept all keys
        Assert.NotNull(validator1.Validate("key1"));
        Assert.NotNull(validator1.Validate("key3"));
        Assert.NotNull(validator2.Validate("key1"));
        Assert.NotNull(validator2.Validate("key3"));
    }

    [Fact]
    public void Validate_DuplicateKeysInConfig_StillWorks()
    {
        // Arrange - Duplicate keys in configuration
        var validator = CreateValidator("key1", "key1", "key2");

        // Act & Assert
        Assert.NotNull(validator.Validate("key1"));
        Assert.NotNull(validator.Validate("key2"));
    }

    [Fact]
    public void Validate_LargeNumberOfKeys_Works()
    {
        // Arrange - Many API keys
        var keys = Enumerable.Range(1, 1000).Select(i => $"api-key-{i}").ToArray();
        var validator = CreateValidator(keys);

        // Act & Assert
        Assert.NotNull(validator.Validate("api-key-1"));
        Assert.NotNull(validator.Validate("api-key-500"));
        Assert.NotNull(validator.Validate("api-key-1000"));
        Assert.Null(validator.Validate("api-key-1001"));
    }

    #endregion

    #region Case Sensitivity

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
    public void Validate_CaseSensitive_MixedCase()
    {
        // Arrange
        var validator = CreateValidator("MyApiKey");

        // Act & Assert
        Assert.Null(validator.Validate("MyAPIKey"));
        Assert.Null(validator.Validate("myAPIkey"));
    }

    [Fact]
    public void Validate_CaseSensitive_AllVariations()
    {
        // Arrange
        var validator = CreateValidator("AbCdEf");

        // Act & Assert
        Assert.NotNull(validator.Validate("AbCdEf"));
        Assert.Null(validator.Validate("abcdef"));
        Assert.Null(validator.Validate("ABCDEF"));
        Assert.Null(validator.Validate("abCDef"));
        Assert.Null(validator.Validate("ABcDEF"));
    }

    #endregion

    #region Configuration Scenarios

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
    public void Constructor_FiltersNullKeys()
    {
        // Arrange - includes null keys (edge case)
        var config = Options.Create(new SyncKitConfig
        {
            JwtSecret = "test-secret-key-for-development-32-chars",
            ApiKeys = new[] { "valid-key", null!, "another-key" }
        });
        var validator = new ApiKeyValidator(config, NullLogger<ApiKeyValidator>.Instance);

        // Act & Assert
        Assert.NotNull(validator.Validate("valid-key"));
        Assert.NotNull(validator.Validate("another-key"));
    }

    [Fact]
    public void Constructor_HandlesAllEmptyKeys()
    {
        // Arrange - All keys are empty or whitespace
        var validator = CreateValidator("", "  ", "\t", "\n");

        // Act
        var result = validator.Validate("any-key");

        // Assert
        Assert.Null(result);
    }

    #endregion

    #region Permission Verification

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
    public void Validate_AdminPermissions_GrantFullAccess()
    {
        // Arrange
        var validator = CreateValidator("test-key");

        // Act
        var result = validator.Validate("test-key");

        // Assert - API key users should have admin which grants access to everything
        Assert.NotNull(result);
        Assert.True(Rbac.IsAdmin(result));
        Assert.True(Rbac.CanReadDocument(result, "any-document-id"));
        Assert.True(Rbac.CanWriteDocument(result, "any-document-id"));
    }

    [Fact]
    public void Validate_PermissionsStructure_MatchesTypeScript()
    {
        // Arrange
        var validator = CreateValidator("test-key");

        // Act
        var result = validator.Validate("test-key");

        // Assert - Verify structure matches TypeScript DocumentPermissions
        Assert.NotNull(result);
        Assert.NotNull(result.Permissions);
        Assert.NotNull(result.Permissions.CanRead);
        Assert.NotNull(result.Permissions.CanWrite);
        // IsAdmin is value type, always has value
    }

    #endregion

    #region Timestamp Verification

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

    [Fact]
    public void Validate_IatIsCurrentTime()
    {
        // Arrange
        var validator = CreateValidator("test-key");
        var before = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        // Act
        var result = validator.Validate("test-key");

        // Assert
        Assert.NotNull(result);
        Assert.NotNull(result.Iat);
        var after = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        Assert.InRange(result.Iat!.Value, before, after);
    }

    [Fact]
    public void Validate_ExpIsFarInFuture()
    {
        // Arrange
        var validator = CreateValidator("test-key");

        // Act
        var result = validator.Validate("test-key");

        // Assert
        Assert.NotNull(result);
        Assert.NotNull(result.Exp);

        // Should be at least 50 years from now
        var fiftyYearsFromNow = DateTimeOffset.UtcNow.AddYears(50).ToUnixTimeSeconds();
        Assert.True(result.Exp > fiftyYearsFromNow);
    }

    [Fact]
    public void Validate_TokenNeverExpires_ForPracticalPurposes()
    {
        // Arrange
        var validator = CreateValidator("test-key");

        // Act
        var result = validator.Validate("test-key");

        // Assert - Check that IsExpired returns false
        Assert.NotNull(result);

        // Create a mock validator to check expiry
        var jwtConfig = Options.Create(new SyncKitConfig { JwtSecret = "test-secret-key-for-development-32-chars" });
        var jwtValidator = new JwtValidator(jwtConfig, NullLogger<JwtValidator>.Instance);

        Assert.False(jwtValidator.IsExpired(result));
    }

    #endregion

    #region Security Scenarios

    [Fact]
    public void Validate_DoesNotLeakKeyInUserId()
    {
        // Arrange
        var secretKey = "super-secret-api-key-12345";
        var validator = CreateValidator(secretKey);

        // Act
        var result = validator.Validate(secretKey);

        // Assert - UserId should not contain the full API key
        Assert.NotNull(result);
        Assert.DoesNotContain(secretKey, result.UserId);
    }

    [Fact]
    public void Validate_UsesGenericUserId()
    {
        // Arrange
        var validator = CreateValidator("any-key");

        // Act
        var result = validator.Validate("any-key");

        // Assert - Should use a generic user ID for all API key users
        Assert.NotNull(result);
        Assert.Equal("api-key-user", result.UserId);
    }

    [Fact]
    public void Validate_DifferentKeys_SameUserId()
    {
        // Arrange
        var validator = CreateValidator("key1", "key2");

        // Act
        var result1 = validator.Validate("key1");
        var result2 = validator.Validate("key2");

        // Assert - Different keys should still return same user ID
        Assert.NotNull(result1);
        Assert.NotNull(result2);
        Assert.Equal(result1!.UserId, result2!.UserId);
    }

    #endregion

    #region Edge Cases

    [Fact]
    public void Validate_SingleCharacterKey_Works()
    {
        // Arrange
        var validator = CreateValidator("X");

        // Act
        var result = validator.Validate("X");

        // Assert
        Assert.NotNull(result);
    }

    [Fact]
    public void Validate_NumericOnlyKey_Works()
    {
        // Arrange
        var validator = CreateValidator("123456789");

        // Act
        var result = validator.Validate("123456789");

        // Assert
        Assert.NotNull(result);
    }

    [Fact]
    public void Validate_UnicodeKey_Works()
    {
        // Arrange - API key with unicode characters
        var unicodeKey = "api-key-日本語-中文-한국어";
        var validator = CreateValidator(unicodeKey);

        // Act
        var result = validator.Validate(unicodeKey);

        // Assert
        Assert.NotNull(result);
    }

    [Fact]
    public void Validate_KeyWithEmoji_Works()
    {
        // Arrange
        var emojiKey = "api-key-🔑-secure";
        var validator = CreateValidator(emojiKey);

        // Act
        var result = validator.Validate(emojiKey);

        // Assert
        Assert.NotNull(result);
    }

    #endregion

    #region Helper Methods

    private static ApiKeyValidator CreateValidator(params string[] keys)
    {
        var config = Options.Create(new SyncKitConfig
        {
            JwtSecret = "test-secret-key-for-development-32-chars",
            ApiKeys = keys
        });
        return new ApiKeyValidator(config, NullLogger<ApiKeyValidator>.Instance);
    }

    #endregion
}
