using System.Text.Json.Serialization;

namespace SyncKit.Server.Health;

/// <summary>
/// Health check response model matching the TypeScript server's health endpoint.
/// </summary>
/// <remarks>
/// Response format matches TypeScript server exactly:
/// {
///   "status": "healthy",
///   "timestamp": "2024-01-01T00:00:00.000Z",
///   "version": "0.1.0",
///   "uptime": 123.456,
///   "connections": { "totalConnections": 5, "totalUsers": 3, "totalClients": 5 },
///   "documents": { "totalDocuments": 2, "documents": [] }
/// }
/// </remarks>
public record HealthResponse
{
    /// <summary>
    /// Server status. Always "healthy" when the server is running.
    /// </summary>
    [JsonPropertyName("status")]
    public string Status { get; init; } = "healthy";

    /// <summary>
    /// ISO 8601 timestamp of the health check.
    /// </summary>
    [JsonPropertyName("timestamp")]
    public string Timestamp { get; init; } = DateTime.UtcNow.ToString("o");

    /// <summary>
    /// Server version.
    /// </summary>
    [JsonPropertyName("version")]
    public string Version { get; init; } = "0.1.0";

    /// <summary>
    /// Server uptime in seconds since start.
    /// </summary>
    [JsonPropertyName("uptime")]
    public double Uptime { get; init; }

    /// <summary>
    /// Connection statistics.
    /// </summary>
    [JsonPropertyName("connections")]
    public ConnectionStats Connections { get; init; } = new();

    /// <summary>
    /// Document statistics.
    /// </summary>
    [JsonPropertyName("documents")]
    public DocumentStats Documents { get; init; } = new();
}

/// <summary>
/// Connection statistics matching TypeScript server format.
/// </summary>
public record ConnectionStats
{
    /// <summary>
    /// Total number of active WebSocket connections.
    /// </summary>
    [JsonPropertyName("totalConnections")]
    public int TotalConnections { get; init; }

    /// <summary>
    /// Total number of unique users connected.
    /// </summary>
    [JsonPropertyName("totalUsers")]
    public int TotalUsers { get; init; }

    /// <summary>
    /// Total number of clients (same as connections for now).
    /// </summary>
    [JsonPropertyName("totalClients")]
    public int TotalClients { get; init; }
}

/// <summary>
/// Document statistics matching TypeScript server format.
/// </summary>
public record DocumentStats
{
    /// <summary>
    /// Total number of active documents.
    /// </summary>
    [JsonPropertyName("totalDocuments")]
    public int TotalDocuments { get; init; }

    /// <summary>
    /// List of active document IDs (empty by default for privacy).
    /// </summary>
    [JsonPropertyName("documents")]
    public string[] Documents { get; init; } = [];
}
