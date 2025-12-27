using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Npgsql;
using SyncKit.Server.Configuration;

namespace SyncKit.Server.Storage;

public static class StorageRegistration
{
    public static IServiceCollection AddSyncKitStorage(this IServiceCollection services, SyncKitConfig config)
    {
        // Back-compat overload: use environment and SyncKitConfig fields for simple setups
        var storageMode = Environment.GetEnvironmentVariable("SyncKit__Storage") ?? (string.IsNullOrEmpty(config.DatabaseUrl) ? "inmemory" : "postgres");
        if (storageMode == "postgres" || storageMode == "postgresql")
        {
            if (string.IsNullOrEmpty(config.DatabaseUrl)) throw new InvalidOperationException("DATABASE_URL is required for postgres storage");

            var connectionString = config.DatabaseUrl;

            services.AddSingleton<IStorageAdapter>(sp => new PostgresStorageAdapter(connectionString, sp.GetRequiredService<ILogger<PostgresStorageAdapter>>()));
            services.AddSingleton<SchemaValidator>(sp => new SchemaValidator(async ct =>
            {
                var conn = new NpgsqlConnection(connectionString);
                await conn.OpenAsync(ct);
                return conn;
            }, sp.GetRequiredService<ILogger<SchemaValidator>>()));
        }
        else
        {
            services.AddSingleton<IStorageAdapter>(sp => new InMemoryStorageAdapter(sp.GetRequiredService<ILogger<InMemoryStorageAdapter>>()));
        }

        return services;
    }

    /// <summary>
    /// New configuration-aware overload that reads Storage/Awareness/PubSub sections and registers providers accordingly.
    /// </summary>
    public static IServiceCollection AddSyncKitStorage(this IServiceCollection services, IConfiguration configuration)
    {
        // Storage section
        var storageSection = configuration.GetSection("Storage");
        var storageProvider = storageSection.GetValue<string>("Provider") ?? "inmemory";

        switch (storageProvider.ToLowerInvariant())
        {
            case "postgresql":
            case "postgres":
                AddPostgreSqlStorage(services, storageSection);
                break;
            case "inmemory":
            default:
                services.AddSingleton<IStorageAdapter>(sp => new InMemoryStorageAdapter(sp.GetRequiredService<ILogger<InMemoryStorageAdapter>>()));
                break;
        }

        // Awareness section (default: inmemory)
        var awarenessSection = configuration.GetSection("Awareness");
        var awarenessProvider = awarenessSection.GetValue<string>("Provider") ?? "inmemory";
        switch (awarenessProvider.ToLowerInvariant())
        {
            case "redis":
                AddRedisAwarenessStorage(services, awarenessSection, configuration);
                break;
            case "inmemory":
            default:
                services.AddSingleton<IAwarenessStore, SyncKit.Server.Awareness.InMemoryAwarenessStore>();
                break;
        }

        // PubSub section (optional)
        var pubsubSection = configuration.GetSection("PubSub");
        var pubsubEnabled = pubsubSection.GetValue<bool>("Enabled");
        if (pubsubEnabled)
        {
            var pubsubProvider = pubsubSection.GetValue<string>("Provider") ?? "redis";
            switch (pubsubProvider.ToLowerInvariant())
            {
                case "redis":
                    AddRedisPubSub(services, pubsubSection, configuration);
                    break;
                default:
                    throw new InvalidOperationException($"Unsupported pubsub provider: {pubsubProvider}");
            }
        }
        else
        {
            // No pubsub -> use noop provider
            services.AddSingleton<Redis.IRedisPubSub, Redis.NoopRedisPubSub>();
        }

        return services;
    }

    private static void AddPostgreSqlStorage(IServiceCollection services, IConfigurationSection config)
    {
        var connectionString = config.GetValue<string>("PostgreSql:ConnectionString");
        // Fallback to common connection string keys
        if (string.IsNullOrEmpty(connectionString))
            connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__synckit") ?? Environment.GetEnvironmentVariable("DATABASE_URL");

        if (string.IsNullOrEmpty(connectionString))
            throw new InvalidOperationException("PostgreSQL connection string required for Storage:PostgreSql:ConnectionString");

        services.AddSingleton<IStorageAdapter>(sp => new PostgresStorageAdapter(connectionString, sp.GetRequiredService<ILogger<PostgresStorageAdapter>>()));
        services.AddSingleton<SchemaValidator>(sp => new SchemaValidator(async ct =>
        {
            var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);
            return conn;
        }, sp.GetRequiredService<ILogger<SchemaValidator>>()));
    }

    private static void AddRedisPubSub(IServiceCollection services, IConfigurationSection pubsubSection, IConfiguration rootConfig)
    {
        // Determine redis connection string from PubSub:Redis:ConnectionString or top-level SyncKit config or env vars
        var redisConn = pubsubSection.GetValue<string>("Redis:ConnectionString");
        if (string.IsNullOrEmpty(redisConn))
        {
            // Try common locations
            redisConn = rootConfig.GetValue<string>("SyncKit:RedisUrl")
                        ?? Environment.GetEnvironmentVariable("ConnectionStrings__redis")
                        ?? Environment.GetEnvironmentVariable("REDIS_URL");
        }

        if (string.IsNullOrEmpty(redisConn))
            throw new InvalidOperationException("Redis connection string required for PubSub:Redis:ConnectionString when PubSub:Enabled is true");

        var channelPrefix = pubsubSection.GetValue<string>("Redis:ChannelPrefix") ?? rootConfig.GetValue<string>("SyncKit:RedisChannelPrefix") ?? "synckit:";

        // Ensure SyncKitConfig options have redis values so RedisPubSubProvider (which depends on IOptions<SyncKitConfig>) can read them.
        services.PostConfigure<SyncKitConfig>(cfg =>
        {
            cfg.RedisUrl = redisConn;
            cfg.RedisChannelPrefix = channelPrefix;
        });

        // Register a ConnectionMultiplexer lazily
        services.AddSingleton(sp => StackExchange.Redis.ConnectionMultiplexer.Connect(redisConn));

        // Register the provider using the IConnectionMultiplexer from DI
        services.AddSingleton<Redis.IRedisPubSub>(sp => new Redis.RedisPubSubProvider(sp.GetRequiredService<ILogger<Redis.RedisPubSubProvider>>(), sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<SyncKitConfig>>(), sp.GetRequiredService<StackExchange.Redis.IConnectionMultiplexer>()));
    }

    private static void AddRedisAwarenessStorage(IServiceCollection services, IConfigurationSection awarenessSection, IConfiguration rootConfig)
    {
        // Determine redis connection string from Awareness:Redis:ConnectionString or top-level SyncKit config or env vars
        var redisConn = awarenessSection.GetValue<string>("Redis:ConnectionString");
        if (string.IsNullOrEmpty(redisConn))
        {
            // Try common locations
            redisConn = rootConfig.GetValue<string>("SyncKit:RedisUrl")
                        ?? Environment.GetEnvironmentVariable("ConnectionStrings__redis")
                        ?? Environment.GetEnvironmentVariable("REDIS_URL");
        }

        if (string.IsNullOrEmpty(redisConn))
            throw new InvalidOperationException("Redis connection string required for Awareness:Redis:ConnectionString when Awareness:Provider is redis");

        // Ensure SyncKitConfig options have redis values so RedisAwarenessStore can read them via IOptions
        services.PostConfigure<SyncKitConfig>(cfg =>
        {
            cfg.RedisUrl = redisConn;
        });

        // Register ConnectionMultiplexer
        services.AddSingleton(sp => StackExchange.Redis.ConnectionMultiplexer.Connect(redisConn));

        // Register the Redis awareness store using DI connection
        services.AddSingleton<IAwarenessStore>(sp => new SyncKit.Server.Awareness.RedisAwarenessStore(sp.GetRequiredService<ILogger<SyncKit.Server.Awareness.RedisAwarenessStore>>(), sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<SyncKitConfig>>(), sp.GetRequiredService<StackExchange.Redis.IConnectionMultiplexer>()));
    }
}
