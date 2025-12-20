using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace SyncKit.Server.Health;

/// <summary>
/// Custom health check for SyncKit server readiness.
/// This is a basic implementation that can be expanded in Phase 6
/// to include database and Redis connectivity checks.
/// </summary>
public class SyncKitReadinessHealthCheck : IHealthCheck
{
    private readonly IServerStatsService _statsService;
    private static volatile bool _isReady = true;

    public SyncKitReadinessHealthCheck(IServerStatsService statsService)
    {
        _statsService = statsService;
    }

    /// <summary>
    /// Sets the readiness state of the server.
    /// Use this during startup to indicate when the server is ready to accept traffic.
    /// </summary>
    public static void SetReady(bool isReady)
    {
        _isReady = isReady;
    }

    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        if (!_isReady)
        {
            return Task.FromResult(
                HealthCheckResult.Unhealthy("Server is not ready to accept traffic"));
        }

        var stats = _statsService.GetStats();
        var data = new Dictionary<string, object>
        {
            { "connections", stats.Connections },
            { "documents", stats.Documents },
            { "memoryUsage", stats.MemoryUsage }
        };

        return Task.FromResult(
            HealthCheckResult.Healthy("Server is ready", data));
    }
}

/// <summary>
/// Liveness health check - verifies the process is running and responsive.
/// </summary>
public class SyncKitLivenessHealthCheck : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        // Basic liveness check - if we can execute this, the process is alive
        return Task.FromResult(HealthCheckResult.Healthy("Server is alive"));
    }
}
