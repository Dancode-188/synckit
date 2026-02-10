using SyncKit.Server.Configuration;

namespace SyncKit.Server.Tests.Security;

/// <summary>
/// Tests for rate limiting configuration properties and CORS configuration.
/// Verifies that SyncKitConfig defaults match the TypeScript server's SECURITY_LIMITS
/// and that configuration binding works correctly.
/// </summary>
public class RateLimitTests
{
    [Fact]
    public void SyncKitConfig_DefaultRateLimitPerMinute_Is100()
    {
        var config = new SyncKitConfig { JwtSecret = new string('x', 32) };
        Assert.Equal(100, config.RateLimitPerMinute);
    }

    [Fact]
    public void SyncKitConfig_DefaultMaxConnectionsPerIp_Is50()
    {
        var config = new SyncKitConfig { JwtSecret = new string('x', 32) };
        Assert.Equal(50, config.MaxConnectionsPerIp);
    }

    [Fact]
    public void SyncKitConfig_RateLimitPerMinute_CanBeOverridden()
    {
        var config = new SyncKitConfig
        {
            JwtSecret = new string('x', 32),
            RateLimitPerMinute = 200
        };
        Assert.Equal(200, config.RateLimitPerMinute);
    }

    [Fact]
    public void SyncKitConfig_MaxConnectionsPerIp_CanBeOverridden()
    {
        var config = new SyncKitConfig
        {
            JwtSecret = new string('x', 32),
            MaxConnectionsPerIp = 25
        };
        Assert.Equal(25, config.MaxConnectionsPerIp);
    }

    [Fact]
    public void SyncKitConfig_DefaultCorsAllowedOrigins_IsWildcard()
    {
        var config = new SyncKitConfig { JwtSecret = new string('x', 32) };
        Assert.Single(config.CorsAllowedOrigins);
        Assert.Equal("*", config.CorsAllowedOrigins[0]);
    }

    [Fact]
    public void SyncKitConfig_CorsAllowedOrigins_CanBeSetToSpecificOrigins()
    {
        var config = new SyncKitConfig
        {
            JwtSecret = new string('x', 32),
            CorsAllowedOrigins = ["https://example.com", "https://app.example.com"]
        };
        Assert.Equal(2, config.CorsAllowedOrigins.Length);
        Assert.Equal("https://example.com", config.CorsAllowedOrigins[0]);
        Assert.Equal("https://app.example.com", config.CorsAllowedOrigins[1]);
    }

    [Fact]
    public void SyncKitConfig_RateLimitAndCorsProperties_ExistOnConfig()
    {
        var configType = typeof(SyncKitConfig);

        Assert.NotNull(configType.GetProperty(nameof(SyncKitConfig.RateLimitPerMinute)));
        Assert.NotNull(configType.GetProperty(nameof(SyncKitConfig.MaxConnectionsPerIp)));
        Assert.NotNull(configType.GetProperty(nameof(SyncKitConfig.CorsAllowedOrigins)));
    }
}
