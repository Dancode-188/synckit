using System.Diagnostics;
using SyncKit.Server.WebSockets;

namespace SyncKit.Server.Health;

/// <summary>
/// Service for collecting and providing server statistics.
/// </summary>
public interface IServerStatsService
{
    /// <summary>
    /// Gets the current uptime in seconds (as a double for fractional seconds).
    /// </summary>
    double GetUptimeSeconds();

    /// <summary>
    /// Gets connection statistics matching TypeScript server format.
    /// </summary>
    ConnectionStats GetConnectionStats();

    /// <summary>
    /// Gets document statistics matching TypeScript server format.
    /// </summary>
    DocumentStats GetDocumentStats();

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

    /// <summary>
    /// Sets the unique user count.
    /// </summary>
    void SetUserCount(int count);

    /// <summary>
    /// Increments the unique user count.
    /// </summary>
    void IncrementUsers();

    /// <summary>
    /// Decrements the unique user count.
    /// </summary>
    void DecrementUsers();
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
    private int _userCount;

    public ServerStatsService()
    {
        _uptimeStopwatch = Stopwatch.StartNew();
    }

    /// <inheritdoc />
    public double GetUptimeSeconds()
    {
        return _uptimeStopwatch.Elapsed.TotalSeconds;
    }

    /// <inheritdoc />
    public ConnectionStats GetConnectionStats()
    {
        var connections = _connectionCount;
        return new ConnectionStats
        {
            TotalConnections = connections,
            TotalUsers = _userCount,
            TotalClients = connections  // Clients == Connections for now
        };
    }

    /// <inheritdoc />
    public DocumentStats GetDocumentStats()
    {
        return new DocumentStats
        {
            TotalDocuments = _documentCount,
            Documents = []  // Empty array for privacy (matches TypeScript)
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

    /// <inheritdoc />
    public void SetUserCount(int count)
    {
        Interlocked.Exchange(ref _userCount, count);
    }

    /// <inheritdoc />
    public void IncrementUsers()
    {
        Interlocked.Increment(ref _userCount);
    }

    /// <inheritdoc />
    public void DecrementUsers()
    {
        Interlocked.Decrement(ref _userCount);
    }
}
