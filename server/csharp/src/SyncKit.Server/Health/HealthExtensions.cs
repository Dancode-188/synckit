using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using SyncKit.Server.Services;
using SyncKit.Server.WebSockets;
using System.Text.Json;

namespace SyncKit.Server.Health;

/// <summary>
/// Extension methods for configuring health check services.
/// </summary>
public static class HealthExtensions
{
    private const string LivenessTag = "live";
    private const string ReadinessTag = "ready";

    /// <summary>
    /// Adds SyncKit health check services to the DI container.
    /// </summary>
    public static IServiceCollection AddSyncKitHealthChecks(this IServiceCollection services, IConfiguration? configuration = null)
    {
        // Register the server stats service as a singleton
        services.AddSingleton<IServerStatsService, ServerStatsService>();

        // Add ASP.NET Core health checks
        var health = services.AddHealthChecks()
            .AddCheck<SyncKitLivenessHealthCheck>(
                "liveness",
                failureStatus: HealthStatus.Unhealthy,
                tags: new[] { LivenessTag })
            .AddCheck<SyncKitReadinessHealthCheck>(
                "readiness",
                failureStatus: HealthStatus.Unhealthy,
                tags: new[] { ReadinessTag });

        // Conditionally register readiness checks for PostgreSQL and Redis when configuration is present
        if (configuration != null)
        {
            var config = configuration.GetSection(SyncKit.Server.Configuration.SyncKitConfig.SectionName).Get<SyncKit.Server.Configuration.SyncKitConfig>();
            if (config != null)
            {
                if (!string.IsNullOrEmpty(config.DatabaseUrl))
                {
                    health.AddCheck<PostgreSqlHealthCheck>("postgresql", tags: new[] { "db", ReadinessTag });
                }

                if (!string.IsNullOrEmpty(config.RedisUrl))
                {
                    health.AddCheck<RedisHealthCheck>("redis", tags: new[] { "cache", ReadinessTag });
                }
            }
        }

        return services;
    }

    /// <summary>
    /// Maps the SyncKit health check endpoints.
    /// </summary>
    public static WebApplication MapSyncKitHealthEndpoints(this WebApplication app)
    {
        // Main health endpoint with detailed stats (matches TypeScript server format)
        app.MapGet("/health", (IServerStatsService statsService) =>
        {
            var response = new HealthResponse
            {
                Status = "healthy",
                Timestamp = DateTime.UtcNow.ToString("o"),
                Version = "0.1.0",
                Uptime = statsService.GetUptimeSeconds(),
                Connections = statsService.GetConnectionStats(),
                Documents = statsService.GetDocumentStats()
            };

            return Results.Ok(response);
        })
        .WithName("HealthCheck")
        .WithDescription("Health check endpoint with server statistics")
        .WithTags("Health");

        // Liveness probe - is the process running?
        // Used by Kubernetes/Docker to determine if the container needs to be restarted
        app.MapHealthChecks("/health/live", new HealthCheckOptions
        {
            Predicate = check => check.Tags.Contains(LivenessTag),
            ResultStatusCodes =
            {
                [HealthStatus.Healthy] = StatusCodes.Status200OK,
                [HealthStatus.Degraded] = StatusCodes.Status200OK,
                [HealthStatus.Unhealthy] = StatusCodes.Status503ServiceUnavailable
            },
            ResponseWriter = WriteMinimalResponse
        });

        // Readiness probe - can the server accept traffic?
        // Used by Kubernetes/Docker to determine if the container should receive traffic
        // Will be expanded in Phase 6 to include DB and Redis connectivity checks
        app.MapHealthChecks("/health/ready", new HealthCheckOptions
        {
            Predicate = check => check.Tags.Contains(ReadinessTag),
            ResultStatusCodes =
            {
                [HealthStatus.Healthy] = StatusCodes.Status200OK,
                [HealthStatus.Degraded] = StatusCodes.Status200OK,
                [HealthStatus.Unhealthy] = StatusCodes.Status503ServiceUnavailable
            },
            ResponseWriter = WriteMinimalResponse
        });

        // Performance metrics endpoint for diagnostics
        app.MapGet("/metrics", () =>
        {
            var broadcastMetrics = ConnectionManager.GetBroadcastMetrics();
            var sendMetrics = Connection.GetSendMetrics();
            var perfMetrics = PerformanceMetrics.GetMetrics();

            return Results.Ok(new
            {
                // Delta/ACK counters for convergence tracking
                deltas = new
                {
                    received = perfMetrics.DeltasReceived,
                    broadcast = perfMetrics.DeltasBroadcast,
                    dropped = perfMetrics.DeltasDropped,
                    convergence = perfMetrics.Convergence
                },
                acks = new
                {
                    sent = perfMetrics.AcksSent,
                    received = perfMetrics.AcksReceived
                },
                latency = new
                {
                    avgBroadcastMs = perfMetrics.AvgBroadcastLatencyMs,
                    maxBroadcastMs = perfMetrics.MaxBroadcastLatencyMs,
                    avgProcessingMs = perfMetrics.AvgProcessingLatencyMs,
                    maxProcessingMs = perfMetrics.MaxProcessingLatencyMs
                },
                queue = new
                {
                    avgDepth = perfMetrics.AvgQueueDepth,
                    maxDepth = perfMetrics.MaxQueueDepth
                },
                // Legacy counters (for backwards compatibility)
                broadcast = new
                {
                    count = broadcastMetrics.BroadcastCount,
                    totalTimeMs = broadcastMetrics.TotalTimeMs,
                    avgTimeMs = broadcastMetrics.AvgTimeMs,
                    maxTimeMs = broadcastMetrics.MaxTimeMs,
                    messagesSent = broadcastMetrics.MessagesSent,
                    messagesFailed = broadcastMetrics.MessagesFailed
                },
                send = new
                {
                    attempts = sendMetrics.SendAttempts,
                    successes = sendMetrics.SendSuccesses,
                    dropped = sendMetrics.SendDropped,
                    totalTimeMs = sendMetrics.TotalSendTimeMs,
                    maxTimeMs = sendMetrics.MaxSendTimeMs,
                    avgQueueDepth = sendMetrics.AvgQueueDepth,
                    maxQueueDepth = sendMetrics.MaxQueueDepth,
                    dropRate = sendMetrics.SendAttempts > 0
                        ? (double)sendMetrics.SendDropped / sendMetrics.SendAttempts
                        : 0.0
                }
            });
        })
        .WithName("Metrics")
        .WithDescription("Performance metrics for broadcast and send operations")
        .WithTags("Diagnostics");

        // Reset metrics endpoint (useful for testing individual scenarios)
        app.MapPost("/metrics/reset", () =>
        {
            ConnectionManager.ResetBroadcastMetrics();
            Connection.ResetSendMetrics();
            PerformanceMetrics.Reset();
            return Results.Ok(new { message = "Metrics reset" });
        })
        .WithName("ResetMetrics")
        .WithDescription("Reset all performance metrics")
        .WithTags("Diagnostics");

        return app;
    }

    private static Task WriteMinimalResponse(HttpContext context, HealthReport report)
    {
        context.Response.ContentType = "application/json";

        var response = new
        {
            status = report.Status.ToString().ToLowerInvariant(),
            duration = report.TotalDuration.TotalMilliseconds
        };

        return JsonSerializer.SerializeAsync(
            context.Response.Body,
            response,
            new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
    }
}
