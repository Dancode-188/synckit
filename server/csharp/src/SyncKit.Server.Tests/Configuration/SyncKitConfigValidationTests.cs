using System.ComponentModel.DataAnnotations;
using SyncKit.Server.Configuration;

namespace SyncKit.Server.Tests.Configuration;

/// <summary>
/// Tests for SyncKitConfig validation using DataAnnotations.
/// </summary>
public class SyncKitConfigValidationTests
{
    [Fact]
    public void Validation_Fails_WhenJwtSecretMissing()
    {
        // Arrange
        var config = new SyncKitConfig();

        // Act
        var validationResults = ValidateConfig(config);

        // Assert
        Assert.Contains(validationResults, r =>
            r.MemberNames.Contains(nameof(SyncKitConfig.JwtSecret)) &&
            r.ErrorMessage!.Contains("required"));
    }

    [Fact]
    public void Validation_Fails_WhenJwtSecretTooShort()
    {
        // Arrange
        var config = new SyncKitConfig
        {
            JwtSecret = "short-secret" // Less than 32 characters
        };

        // Act
        var validationResults = ValidateConfig(config);

        // Assert
        Assert.Contains(validationResults, r =>
            r.MemberNames.Contains(nameof(SyncKitConfig.JwtSecret)) &&
            r.ErrorMessage!.Contains("32"));
    }

    [Fact]
    public void Validation_Succeeds_WhenJwtSecretValid()
    {
        // Arrange
        var config = new SyncKitConfig
        {
            JwtSecret = "valid-secret-that-is-at-least-32-characters-long"
        };

        // Act
        var validationResults = ValidateConfig(config);

        // Assert
        Assert.Empty(validationResults);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(65536)]
    public void Validation_Fails_WhenPortOutOfRange(int port)
    {
        // Arrange
        var config = new SyncKitConfig
        {
            JwtSecret = "valid-secret-that-is-at-least-32-characters-long",
            Port = port
        };

        // Act
        var validationResults = ValidateConfig(config);

        // Assert
        Assert.Contains(validationResults, r =>
            r.MemberNames.Contains(nameof(SyncKitConfig.Port)));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(8080)]
    [InlineData(65535)]
    public void Validation_Succeeds_WhenPortInRange(int port)
    {
        // Arrange
        var config = new SyncKitConfig
        {
            JwtSecret = "valid-secret-that-is-at-least-32-characters-long",
            Port = port
        };

        // Act
        var validationResults = ValidateConfig(config);

        // Assert
        Assert.DoesNotContain(validationResults, r =>
            r.MemberNames.Contains(nameof(SyncKitConfig.Port)));
    }

    [Fact]
    public void Validation_Fails_WhenWsHeartbeatIntervalZero()
    {
        // Arrange
        var config = new SyncKitConfig
        {
            JwtSecret = "valid-secret-that-is-at-least-32-characters-long",
            WsHeartbeatInterval = 0
        };

        // Act
        var validationResults = ValidateConfig(config);

        // Assert
        Assert.Contains(validationResults, r =>
            r.MemberNames.Contains(nameof(SyncKitConfig.WsHeartbeatInterval)));
    }

    [Fact]
    public void Validation_Fails_WhenDatabasePoolMinZero()
    {
        // Arrange
        var config = new SyncKitConfig
        {
            JwtSecret = "valid-secret-that-is-at-least-32-characters-long",
            DatabasePoolMin = 0
        };

        // Act
        var validationResults = ValidateConfig(config);

        // Assert
        Assert.Contains(validationResults, r =>
            r.MemberNames.Contains(nameof(SyncKitConfig.DatabasePoolMin)));
    }

    [Fact]
    public void Validation_MatchesTypeScriptZodSchema()
    {
        // This test ensures our validation matches the TypeScript Zod schema
        // TypeScript schema requires:
        // - port: positive integer
        // - jwtSecret: min 32 characters
        // - wsHeartbeatInterval: positive integer
        // - wsHeartbeatTimeout: positive integer
        // - wsMaxConnections: positive integer
        // - syncBatchSize: positive integer
        // - syncBatchDelay: positive integer (can be 0)

        var config = new SyncKitConfig
        {
            JwtSecret = "valid-secret-that-is-at-least-32-characters-long",
            Port = 8080,
            WsHeartbeatInterval = 30000,
            WsHeartbeatTimeout = 60000,
            WsMaxConnections = 10000,
            SyncBatchSize = 100,
            SyncBatchDelay = 50,
            DatabasePoolMin = 2,
            DatabasePoolMax = 10
        };

        var validationResults = ValidateConfig(config);
        Assert.Empty(validationResults);
    }

    private static List<ValidationResult> ValidateConfig(SyncKitConfig config)
    {
        var validationResults = new List<ValidationResult>();
        var validationContext = new ValidationContext(config);
        Validator.TryValidateObject(config, validationContext, validationResults, validateAllProperties: true);
        return validationResults;
    }
}
