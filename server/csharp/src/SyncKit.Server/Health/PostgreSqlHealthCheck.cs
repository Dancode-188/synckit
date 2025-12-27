using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using Npgsql;
using SyncKit.Server.Configuration;

namespace SyncKit.Server.Health;

public class PostgreSqlHealthCheck : IHealthCheck
{
    private readonly string? _connectionString;

    // DI-friendly constructor - read from config
    public PostgreSqlHealthCheck(IOptions<SyncKitConfig> opts)
    {
        _connectionString = opts?.Value?.DatabaseUrl;
    }

    // Test-friendly constructor
    public PostgreSqlHealthCheck(string connectionString)
    {
        _connectionString = connectionString;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(_connectionString))
        {
            return HealthCheckResult.Unhealthy("PostgreSQL not configured");
        }

        try
        {
            await using var conn = new NpgsqlConnection(_connectionString);
            await conn.OpenAsync(cancellationToken);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT 1";
            await cmd.ExecuteScalarAsync(cancellationToken);
            return HealthCheckResult.Healthy("PostgreSQL connection successful");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy($"PostgreSQL health check failed: {ex.Message}");
        }
    }
}