using Microsoft.Extensions.Diagnostics.HealthChecks;
using StackExchange.Redis;
using Microsoft.Extensions.Options;
using SyncKit.Server.Configuration;

namespace SyncKit.Server.Health;

public class RedisHealthCheck : IHealthCheck
{
    private readonly IConnectionMultiplexer? _multiplexer;
    private readonly string? _redisUrl;

    // DI-friendly constructor - prefer IConnectionMultiplexer when available
    public RedisHealthCheck(IConnectionMultiplexer multiplexer)
    {
        _multiplexer = multiplexer;
    }

    // Config-based constructor fallback
    public RedisHealthCheck(IOptions<SyncKitConfig> opts)
    {
        _redisUrl = opts?.Value?.RedisUrl;
    }

    // Test-friendly constructor
    public RedisHealthCheck(string endpoint)
    {
        _redisUrl = endpoint;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            IConnectionMultiplexer? conn = _multiplexer;

            if (conn == null)
            {
                if (string.IsNullOrEmpty(_redisUrl))
                    return HealthCheckResult.Unhealthy("Redis not configured");

                // Create a short-lived connection for the check
                conn = await ConnectionMultiplexer.ConnectAsync(new ConfigurationOptions
                {
                    EndPoints = { _redisUrl },
                    AbortOnConnectFail = false,
                    ConnectRetry = 1,
                    ConnectTimeout = 2000
                });
            }

            var db = conn.GetDatabase();
            var latency = await db.PingAsync();
            var msg = $"Redis connected, latency: {latency.TotalMilliseconds}ms";
            return HealthCheckResult.Healthy(msg);
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy($"Redis health check failed: {ex.Message}");
        }
    }
}
