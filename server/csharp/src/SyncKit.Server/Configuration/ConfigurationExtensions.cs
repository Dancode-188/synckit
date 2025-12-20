namespace SyncKit.Server.Configuration;

/// <summary>
/// Extension methods for configuring SyncKit services.
/// </summary>
public static class ConfigurationExtensions
{
    /// <summary>
    /// Adds SyncKit configuration with environment variable support and validation.
    /// Environment variables override appsettings.json values.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <param name="configuration">The configuration root.</param>
    /// <returns>The service collection for chaining.</returns>
    public static IServiceCollection AddSyncKitConfiguration(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // Bind configuration section with environment variable overrides
        services.AddOptions<SyncKitConfig>()
            .Bind(configuration.GetSection(SyncKitConfig.SectionName))
            .Configure(config =>
            {
                // Apply environment variable overrides
                // Server
                if (int.TryParse(Environment.GetEnvironmentVariable("PORT"), out var port))
                    config.Port = port;

                var host = Environment.GetEnvironmentVariable("HOST");
                if (!string.IsNullOrEmpty(host))
                    config.Host = host;

                var environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
                if (!string.IsNullOrEmpty(environment))
                    config.Environment = environment;

                // Database
                var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
                if (!string.IsNullOrEmpty(databaseUrl))
                    config.DatabaseUrl = databaseUrl;

                if (int.TryParse(Environment.GetEnvironmentVariable("DB_POOL_MIN"), out var poolMin))
                    config.DatabasePoolMin = poolMin;

                if (int.TryParse(Environment.GetEnvironmentVariable("DB_POOL_MAX"), out var poolMax))
                    config.DatabasePoolMax = poolMax;

                // Redis
                var redisUrl = Environment.GetEnvironmentVariable("REDIS_URL");
                if (!string.IsNullOrEmpty(redisUrl))
                    config.RedisUrl = redisUrl;

                var redisPrefix = Environment.GetEnvironmentVariable("REDIS_CHANNEL_PREFIX");
                if (!string.IsNullOrEmpty(redisPrefix))
                    config.RedisChannelPrefix = redisPrefix;

                // JWT
                var jwtSecret = Environment.GetEnvironmentVariable("JWT_SECRET");
                if (!string.IsNullOrEmpty(jwtSecret))
                    config.JwtSecret = jwtSecret;

                var jwtExpiresIn = Environment.GetEnvironmentVariable("JWT_EXPIRES_IN");
                if (!string.IsNullOrEmpty(jwtExpiresIn))
                    config.JwtExpiresIn = jwtExpiresIn;

                var jwtRefreshExpiresIn = Environment.GetEnvironmentVariable("JWT_REFRESH_EXPIRES_IN");
                if (!string.IsNullOrEmpty(jwtRefreshExpiresIn))
                    config.JwtRefreshExpiresIn = jwtRefreshExpiresIn;

                // WebSocket
                if (int.TryParse(Environment.GetEnvironmentVariable("WS_HEARTBEAT_INTERVAL"), out var heartbeatInterval))
                    config.WsHeartbeatInterval = heartbeatInterval;

                if (int.TryParse(Environment.GetEnvironmentVariable("WS_HEARTBEAT_TIMEOUT"), out var heartbeatTimeout))
                    config.WsHeartbeatTimeout = heartbeatTimeout;

                if (int.TryParse(Environment.GetEnvironmentVariable("WS_MAX_CONNECTIONS"), out var maxConnections))
                    config.WsMaxConnections = maxConnections;

                // Sync
                if (int.TryParse(Environment.GetEnvironmentVariable("SYNC_BATCH_SIZE"), out var batchSize))
                    config.SyncBatchSize = batchSize;

                if (int.TryParse(Environment.GetEnvironmentVariable("SYNC_BATCH_DELAY"), out var batchDelay))
                    config.SyncBatchDelay = batchDelay;

                // Auth
                var authRequired = Environment.GetEnvironmentVariable("SYNCKIT_AUTH_REQUIRED");
                if (!string.IsNullOrEmpty(authRequired))
                    config.AuthRequired = authRequired.Equals("true", StringComparison.OrdinalIgnoreCase)
                                          || authRequired == "1";
            })
            .ValidateDataAnnotations()
            .ValidateOnStart(); // Fail fast on startup if config invalid

        return services;
    }
}
