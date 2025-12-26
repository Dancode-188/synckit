using System.ComponentModel.DataAnnotations;

namespace SyncKit.Server.Configuration;

/// <summary>
/// Configuration class for SyncKit Server.
/// Mirrors the TypeScript server's configuration pattern with Zod-like validation.
/// </summary>
public class SyncKitConfig
{
    /// <summary>
    /// Configuration section name in appsettings.json
    /// </summary>
    public const string SectionName = "SyncKit";

    // Server
    /// <summary>
    /// Port the server listens on.
    /// Environment variable: PORT
    /// </summary>
    [Range(1, 65535)]
    public int Port { get; set; } = 8080;

    /// <summary>
    /// Host address to bind to.
    /// Environment variable: HOST
    /// </summary>
    public string Host { get; set; } = "0.0.0.0";

    /// <summary>
    /// Environment name (Development, Production, Test).
    /// Environment variable: ASPNETCORE_ENVIRONMENT
    /// </summary>
    public string Environment { get; set; } = "Development";

    // Database
    /// <summary>
    /// PostgreSQL connection string.
    /// Environment variable: DATABASE_URL
    /// </summary>
    public string? DatabaseUrl { get; set; }

    /// <summary>
    /// Minimum database connection pool size.
    /// Environment variable: DB_POOL_MIN
    /// </summary>
    [Range(1, int.MaxValue)]
    public int DatabasePoolMin { get; set; } = 2;

    /// <summary>
    /// Maximum database connection pool size.
    /// Environment variable: DB_POOL_MAX
    /// </summary>
    [Range(1, int.MaxValue)]
    public int DatabasePoolMax { get; set; } = 10;

    // Redis
    /// <summary>
    /// Redis connection string for pub/sub.
    /// Environment variable: REDIS_URL
    /// </summary>
    public string? RedisUrl { get; set; }

    /// <summary>
    /// Prefix for Redis channel names.
    /// Environment variable: REDIS_CHANNEL_PREFIX
    /// </summary>
    public string RedisChannelPrefix { get; set; } = "synckit:";

    // JWT
    /// <summary>
    /// Secret key for JWT signing. Must be at least 32 characters.
    /// Environment variable: JWT_SECRET
    /// </summary>
    [Required(ErrorMessage = "JWT_SECRET is required")]
    [MinLength(32, ErrorMessage = "JWT_SECRET must be at least 32 characters")]
    public string JwtSecret { get; set; } = null!;

    /// <summary>
    /// JWT access token expiration (e.g., "24h", "1d").
    /// Environment variable: JWT_EXPIRES_IN
    /// </summary>
    public string JwtExpiresIn { get; set; } = "24h";

    /// <summary>
    /// JWT refresh token expiration (e.g., "7d").
    /// Environment variable: JWT_REFRESH_EXPIRES_IN
    /// </summary>
    public string JwtRefreshExpiresIn { get; set; } = "7d";

    /// <summary>
    /// Expected JWT issuer (optional).
    /// Environment variable: JWT_ISSUER
    /// </summary>
    public string? JwtIssuer { get; set; }

    /// <summary>
    /// Expected JWT audience (optional).
    /// Environment variable: JWT_AUDIENCE
    /// </summary>
    public string? JwtAudience { get; set; }

    // WebSocket
    /// <summary>
    /// WebSocket heartbeat interval in milliseconds.
    /// Environment variable: WS_HEARTBEAT_INTERVAL
    /// </summary>
    [Range(1, int.MaxValue)]
    public int WsHeartbeatInterval { get; set; } = 30000;

    /// <summary>
    /// WebSocket heartbeat timeout in milliseconds.
    /// Environment variable: WS_HEARTBEAT_TIMEOUT
    /// </summary>
    [Range(1, int.MaxValue)]
    public int WsHeartbeatTimeout { get; set; } = 60000;

    /// <summary>
    /// Maximum number of concurrent WebSocket connections.
    /// Environment variable: WS_MAX_CONNECTIONS
    /// </summary>
    [Range(1, int.MaxValue)]
    public int WsMaxConnections { get; set; } = 10000;

    /// <summary>
    /// Awareness timeout in milliseconds before an awareness entry is considered stale/expired.
    /// Environment variable: AWARENESS_TIMEOUT_MS
    /// </summary>
    [Range(0, int.MaxValue)]
    public int AwarenessTimeoutMs { get; set; } = 30000;

    // Sync
    /// <summary>
    /// Number of operations to batch together for sync.
    /// Environment variable: SYNC_BATCH_SIZE
    /// </summary>
    [Range(1, int.MaxValue)]
    public int SyncBatchSize { get; set; } = 100;

    /// <summary>
    /// Delay in milliseconds between sync batches.
    /// Environment variable: SYNC_BATCH_DELAY
    /// </summary>
    [Range(0, int.MaxValue)]
    public int SyncBatchDelay { get; set; } = 50;

    // Auth
    /// <summary>
    /// Whether authentication is required for connections.
    /// Environment variable: SYNCKIT_AUTH_REQUIRED
    /// </summary>
    public bool AuthRequired { get; set; } = true;

    /// <summary>
    /// Valid API keys for authentication (alternative to JWT).
    /// Environment variable: SYNCKIT_AUTH_APIKEYS (comma-separated)
    /// </summary>
    public string[] ApiKeys { get; set; } = Array.Empty<string>();
}
