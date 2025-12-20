using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using SyncKit.Server.Configuration;

namespace SyncKit.Server.Tests.Configuration;

/// <summary>
/// Tests for SyncKitConfig configuration class and validation.
/// </summary>
public class SyncKitConfigTests
{
    [Fact]
    public void DefaultValues_AreCorrect()
    {
        var config = new SyncKitConfig
        {
            JwtSecret = "test-secret-that-is-at-least-32-characters-long"
        };

        Assert.Equal(8080, config.Port);
        Assert.Equal("0.0.0.0", config.Host);
        Assert.Equal("Development", config.Environment);
        Assert.Null(config.DatabaseUrl);
        Assert.Equal(2, config.DatabasePoolMin);
        Assert.Equal(10, config.DatabasePoolMax);
        Assert.Null(config.RedisUrl);
        Assert.Equal("synckit:", config.RedisChannelPrefix);
        Assert.Equal("24h", config.JwtExpiresIn);
        Assert.Equal("7d", config.JwtRefreshExpiresIn);
        Assert.Equal(30000, config.WsHeartbeatInterval);
        Assert.Equal(60000, config.WsHeartbeatTimeout);
        Assert.Equal(10000, config.WsMaxConnections);
        Assert.Equal(100, config.SyncBatchSize);
        Assert.Equal(50, config.SyncBatchDelay);
        Assert.True(config.AuthRequired);
    }

    [Fact]
    public void Configuration_LoadsFromAppSettings()
    {
        // Arrange
        var inMemorySettings = new Dictionary<string, string?>
        {
            { "SyncKit:Port", "9090" },
            { "SyncKit:Host", "127.0.0.1" },
            { "SyncKit:JwtSecret", "test-secret-that-is-at-least-32-characters-long" },
            { "SyncKit:WsHeartbeatInterval", "15000" },
            { "SyncKit:AuthRequired", "false" }
        };

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(inMemorySettings)
            .Build();

        var services = new ServiceCollection();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddSyncKitConfiguration(configuration);

        var serviceProvider = services.BuildServiceProvider();

        // Act
        var config = serviceProvider.GetRequiredService<IOptions<SyncKitConfig>>().Value;

        // Assert
        Assert.Equal(9090, config.Port);
        Assert.Equal("127.0.0.1", config.Host);
        Assert.Equal("test-secret-that-is-at-least-32-characters-long", config.JwtSecret);
        Assert.Equal(15000, config.WsHeartbeatInterval);
        Assert.False(config.AuthRequired);
    }

    [Fact]
    public void Configuration_EnvironmentVariables_OverrideAppSettings()
    {
        // Arrange - Set environment variables before building config
        Environment.SetEnvironmentVariable("PORT", "3000");
        Environment.SetEnvironmentVariable("JWT_SECRET", "env-secret-that-is-at-least-32-characters-long");
        Environment.SetEnvironmentVariable("SYNCKIT_AUTH_REQUIRED", "false");

        try
        {
            var inMemorySettings = new Dictionary<string, string?>
            {
                { "SyncKit:Port", "9090" },
                { "SyncKit:JwtSecret", "config-secret-that-is-at-least-32-characters-long" },
                { "SyncKit:AuthRequired", "true" }
            };

            var configuration = new ConfigurationBuilder()
                .AddInMemoryCollection(inMemorySettings)
                .Build();

            var services = new ServiceCollection();
            services.AddSingleton<IConfiguration>(configuration);
            services.AddSyncKitConfiguration(configuration);

            var serviceProvider = services.BuildServiceProvider();

            // Act
            var config = serviceProvider.GetRequiredService<IOptions<SyncKitConfig>>().Value;

            // Assert - Environment variables should override appsettings
            Assert.Equal(3000, config.Port);
            Assert.Equal("env-secret-that-is-at-least-32-characters-long", config.JwtSecret);
            Assert.False(config.AuthRequired);
        }
        finally
        {
            // Cleanup environment variables
            Environment.SetEnvironmentVariable("PORT", null);
            Environment.SetEnvironmentVariable("JWT_SECRET", null);
            Environment.SetEnvironmentVariable("SYNCKIT_AUTH_REQUIRED", null);
        }
    }

    [Fact]
    public void Configuration_DatabaseSettings_LoadCorrectly()
    {
        // Arrange
        Environment.SetEnvironmentVariable("DATABASE_URL", "postgresql://localhost:5432/testdb");
        Environment.SetEnvironmentVariable("DB_POOL_MIN", "5");
        Environment.SetEnvironmentVariable("DB_POOL_MAX", "20");

        try
        {
            var inMemorySettings = new Dictionary<string, string?>
            {
                { "SyncKit:JwtSecret", "test-secret-that-is-at-least-32-characters-long" }
            };

            var configuration = new ConfigurationBuilder()
                .AddInMemoryCollection(inMemorySettings)
                .Build();

            var services = new ServiceCollection();
            services.AddSingleton<IConfiguration>(configuration);
            services.AddSyncKitConfiguration(configuration);

            var serviceProvider = services.BuildServiceProvider();

            // Act
            var config = serviceProvider.GetRequiredService<IOptions<SyncKitConfig>>().Value;

            // Assert
            Assert.Equal("postgresql://localhost:5432/testdb", config.DatabaseUrl);
            Assert.Equal(5, config.DatabasePoolMin);
            Assert.Equal(20, config.DatabasePoolMax);
        }
        finally
        {
            Environment.SetEnvironmentVariable("DATABASE_URL", null);
            Environment.SetEnvironmentVariable("DB_POOL_MIN", null);
            Environment.SetEnvironmentVariable("DB_POOL_MAX", null);
        }
    }

    [Fact]
    public void Configuration_RedisSettings_LoadCorrectly()
    {
        // Arrange
        Environment.SetEnvironmentVariable("REDIS_URL", "redis://localhost:6379");
        Environment.SetEnvironmentVariable("REDIS_CHANNEL_PREFIX", "myapp:");

        try
        {
            var inMemorySettings = new Dictionary<string, string?>
            {
                { "SyncKit:JwtSecret", "test-secret-that-is-at-least-32-characters-long" }
            };

            var configuration = new ConfigurationBuilder()
                .AddInMemoryCollection(inMemorySettings)
                .Build();

            var services = new ServiceCollection();
            services.AddSingleton<IConfiguration>(configuration);
            services.AddSyncKitConfiguration(configuration);

            var serviceProvider = services.BuildServiceProvider();

            // Act
            var config = serviceProvider.GetRequiredService<IOptions<SyncKitConfig>>().Value;

            // Assert
            Assert.Equal("redis://localhost:6379", config.RedisUrl);
            Assert.Equal("myapp:", config.RedisChannelPrefix);
        }
        finally
        {
            Environment.SetEnvironmentVariable("REDIS_URL", null);
            Environment.SetEnvironmentVariable("REDIS_CHANNEL_PREFIX", null);
        }
    }

    [Fact]
    public void Configuration_WebSocketSettings_LoadCorrectly()
    {
        // Arrange
        Environment.SetEnvironmentVariable("WS_HEARTBEAT_INTERVAL", "15000");
        Environment.SetEnvironmentVariable("WS_HEARTBEAT_TIMEOUT", "45000");
        Environment.SetEnvironmentVariable("WS_MAX_CONNECTIONS", "5000");

        try
        {
            var inMemorySettings = new Dictionary<string, string?>
            {
                { "SyncKit:JwtSecret", "test-secret-that-is-at-least-32-characters-long" }
            };

            var configuration = new ConfigurationBuilder()
                .AddInMemoryCollection(inMemorySettings)
                .Build();

            var services = new ServiceCollection();
            services.AddSingleton<IConfiguration>(configuration);
            services.AddSyncKitConfiguration(configuration);

            var serviceProvider = services.BuildServiceProvider();

            // Act
            var config = serviceProvider.GetRequiredService<IOptions<SyncKitConfig>>().Value;

            // Assert
            Assert.Equal(15000, config.WsHeartbeatInterval);
            Assert.Equal(45000, config.WsHeartbeatTimeout);
            Assert.Equal(5000, config.WsMaxConnections);
        }
        finally
        {
            Environment.SetEnvironmentVariable("WS_HEARTBEAT_INTERVAL", null);
            Environment.SetEnvironmentVariable("WS_HEARTBEAT_TIMEOUT", null);
            Environment.SetEnvironmentVariable("WS_MAX_CONNECTIONS", null);
        }
    }

    [Fact]
    public void Configuration_SyncSettings_LoadCorrectly()
    {
        // Arrange
        Environment.SetEnvironmentVariable("SYNC_BATCH_SIZE", "200");
        Environment.SetEnvironmentVariable("SYNC_BATCH_DELAY", "100");

        try
        {
            var inMemorySettings = new Dictionary<string, string?>
            {
                { "SyncKit:JwtSecret", "test-secret-that-is-at-least-32-characters-long" }
            };

            var configuration = new ConfigurationBuilder()
                .AddInMemoryCollection(inMemorySettings)
                .Build();

            var services = new ServiceCollection();
            services.AddSingleton<IConfiguration>(configuration);
            services.AddSyncKitConfiguration(configuration);

            var serviceProvider = services.BuildServiceProvider();

            // Act
            var config = serviceProvider.GetRequiredService<IOptions<SyncKitConfig>>().Value;

            // Assert
            Assert.Equal(200, config.SyncBatchSize);
            Assert.Equal(100, config.SyncBatchDelay);
        }
        finally
        {
            Environment.SetEnvironmentVariable("SYNC_BATCH_SIZE", null);
            Environment.SetEnvironmentVariable("SYNC_BATCH_DELAY", null);
        }
    }

    [Fact]
    public void Configuration_AuthRequired_ParsesBooleanCorrectly()
    {
        // Test "true" string
        Environment.SetEnvironmentVariable("SYNCKIT_AUTH_REQUIRED", "true");
        try
        {
            var config = BuildConfigWithJwtSecret();
            Assert.True(config.AuthRequired);
        }
        finally
        {
            Environment.SetEnvironmentVariable("SYNCKIT_AUTH_REQUIRED", null);
        }

        // Test "1" string
        Environment.SetEnvironmentVariable("SYNCKIT_AUTH_REQUIRED", "1");
        try
        {
            var config = BuildConfigWithJwtSecret();
            Assert.True(config.AuthRequired);
        }
        finally
        {
            Environment.SetEnvironmentVariable("SYNCKIT_AUTH_REQUIRED", null);
        }

        // Test "false" string
        Environment.SetEnvironmentVariable("SYNCKIT_AUTH_REQUIRED", "false");
        try
        {
            var config = BuildConfigWithJwtSecret();
            Assert.False(config.AuthRequired);
        }
        finally
        {
            Environment.SetEnvironmentVariable("SYNCKIT_AUTH_REQUIRED", null);
        }

        // Test case insensitivity
        Environment.SetEnvironmentVariable("SYNCKIT_AUTH_REQUIRED", "TRUE");
        try
        {
            var config = BuildConfigWithJwtSecret();
            Assert.True(config.AuthRequired);
        }
        finally
        {
            Environment.SetEnvironmentVariable("SYNCKIT_AUTH_REQUIRED", null);
        }
    }

    private static SyncKitConfig BuildConfigWithJwtSecret()
    {
        var inMemorySettings = new Dictionary<string, string?>
        {
            { "SyncKit:JwtSecret", "test-secret-that-is-at-least-32-characters-long" }
        };

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(inMemorySettings)
            .Build();

        var services = new ServiceCollection();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddSyncKitConfiguration(configuration);

        var serviceProvider = services.BuildServiceProvider();
        return serviceProvider.GetRequiredService<IOptions<SyncKitConfig>>().Value;
    }
}
