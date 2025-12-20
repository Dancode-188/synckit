using System.Text.Json.Serialization;

namespace SyncKit.Server.Health;

/// <summary>
/// Health check response model matching the TypeScript server's health endpoint.
/// </summary>
public record HealthResponse
{
    /// <summary>
    /// Server status. Always "ok" when the server is healthy.
    /// </summary>
    [JsonPropertyName("status")]
    public string Status { get; init; } = "ok";

    /// <summary>
    /// Server version.
    /// </summary>
    [JsonPropertyName("version")]
    public string Version { get; init; } = "1.0.0";

    /// <summary>
    /// ISO 8601 timestamp of the health check.
    /// </summary>
    [JsonPropertyName("timestamp")]
    public string Timestamp { get; init; } = DateTime.UtcNow.ToString("o");

    /// <summary>
    /// Server uptime in seconds since start.
    /// </summary>
    [JsonPropertyName("uptime")]
    public long Uptime { get; init; }

    /// <summary>
    /// Server statistics.
    /// </summary>
    [JsonPropertyName("stats")]
    public HealthStats Stats { get; init; } = new();
}

/// <summary>
/// Server statistics included in the health response.
/// </summary>
public record HealthStats
{
    /// <summary>
    /// Current number of active WebSocket connections.
    /// </summary>
    [JsonPropertyName("connections")]
    public int Connections { get; init; }

    /// <summary>
    /// Current number of active documents.
    /// </summary>
    [JsonPropertyName("documents")]
    public int Documents { get; init; }

    /// <summary>
    /// Current memory usage in bytes.
    /// </summary>
    [JsonPropertyName("memoryUsage")]
    public long MemoryUsage { get; init; }
}
