using System.Diagnostics;

namespace SyncKit.Server.Health;

/// <summary>
/// Service for collecting and providing server statistics.
/// </summary>
public interface IServerStatsService
{
    /// <summary>
    /// Gets the current uptime in seconds.
    /// </summary>
    long GetUptimeSeconds();

    /// <summary>
    /// Gets current server statistics.
    /// </summary>
    HealthStats GetStats();

    /// <summary>
    /// Increments the connection count.
    /// </summary>
    void IncrementConnections();

    /// <summary>
    /// Decrements the connection count.
    /// </summary>
    void DecrementConnections();

    /// <summary>
    /// Increments the document count.
    /// </summary>
    void IncrementDocuments();

    /// <summary>
    /// Decrements the document count.
    /// </summary>
    void DecrementDocuments();

    /// <summary>
    /// Sets the document count.
    /// </summary>
    void SetDocumentCount(int count);

    /// <summary>
    /// Sets the connection count.
    /// </summary>
    void SetConnectionCount(int count);
}

/// <summary>
/// Default implementation of server statistics service.
/// Thread-safe for concurrent access from WebSocket handlers.
/// </summary>
public class ServerStatsService : IServerStatsService
{
    private readonly Stopwatch _uptimeStopwatch;
    private int _connectionCount;
    private int _documentCount;

    public ServerStatsService()
    {
        _uptimeStopwatch = Stopwatch.StartNew();
    }

    /// <inheritdoc />
    public long GetUptimeSeconds()
    {
        return (long)_uptimeStopwatch.Elapsed.TotalSeconds;
    }

    /// <inheritdoc />
    public HealthStats GetStats()
    {
        return new HealthStats
        {
            Connections = _connectionCount,
            Documents = _documentCount,
            MemoryUsage = GetMemoryUsage()
        };
    }

    /// <inheritdoc />
    public void IncrementConnections()
    {
        Interlocked.Increment(ref _connectionCount);
    }

    /// <inheritdoc />
    public void DecrementConnections()
    {
        Interlocked.Decrement(ref _connectionCount);
    }

    /// <inheritdoc />
    public void IncrementDocuments()
    {
        Interlocked.Increment(ref _documentCount);
    }

    /// <inheritdoc />
    public void DecrementDocuments()
    {
        Interlocked.Decrement(ref _documentCount);
    }

    /// <inheritdoc />
    public void SetDocumentCount(int count)
    {
        Interlocked.Exchange(ref _documentCount, count);
    }

    /// <inheritdoc />
    public void SetConnectionCount(int count)
    {
        Interlocked.Exchange(ref _connectionCount, count);
    }

    private static long GetMemoryUsage()
    {
        // Get total memory allocated to the managed heap
        // This includes Gen0, Gen1, Gen2, and LOH
        return GC.GetTotalMemory(forceFullCollection: false);
    }
}
