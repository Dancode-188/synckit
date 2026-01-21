using System.Threading;

namespace SyncKit.Server.Services;

/// <summary>
/// Centralized performance metrics for delta tracking and convergence analysis.
/// These metrics help diagnose the 40% convergence gap between C# and TypeScript servers.
/// 
/// Key metrics:
/// - DeltasReceived: Deltas received from clients
/// - DeltasBroadcast: Deltas sent to subscribers (fan-out count)
/// - DeltasDropped: Deltas that failed to send (queue full, etc.)
/// - AcksSent: ACK messages sent to clients confirming delta receipt
/// - AcksReceived: ACK messages received from clients
/// </summary>
public static class PerformanceMetrics
{
    // Delta counters
    private static long _deltasReceived = 0;
    private static long _deltasBroadcast = 0;
    private static long _deltasDropped = 0;

    // ACK counters
    private static long _acksSent = 0;
    private static long _acksReceived = 0;

    // Timing counters
    private static long _totalBroadcastLatencyMs = 0;
    private static long _maxBroadcastLatencyMs = 0;
    private static long _totalProcessingLatencyMs = 0;
    private static long _maxProcessingLatencyMs = 0;

    // Queue depth counters
    private static long _totalQueueDepthSamples = 0;
    private static long _totalQueueDepth = 0;
    private static long _maxQueueDepth = 0;

    #region Delta Counters

    /// <summary>
    /// Records a delta received from a client.
    /// </summary>
    public static void RecordDeltaReceived()
    {
        Interlocked.Increment(ref _deltasReceived);
    }

    /// <summary>
    /// Records deltas broadcast to subscribers.
    /// </summary>
    /// <param name="count">Number of subscribers the delta was sent to.</param>
    public static void RecordDeltasBroadcast(int count)
    {
        Interlocked.Add(ref _deltasBroadcast, count);
    }

    /// <summary>
    /// Records deltas that failed to send.
    /// </summary>
    /// <param name="count">Number of failed sends.</param>
    public static void RecordDeltasDropped(int count)
    {
        if (count > 0)
        {
            Interlocked.Add(ref _deltasDropped, count);
        }
    }

    #endregion

    #region ACK Counters

    /// <summary>
    /// Records an ACK sent to a client.
    /// </summary>
    public static void RecordAckSent()
    {
        Interlocked.Increment(ref _acksSent);
    }

    /// <summary>
    /// Records an ACK received from a client.
    /// </summary>
    public static void RecordAckReceived()
    {
        Interlocked.Increment(ref _acksReceived);
    }

    #endregion

    #region Timing Counters

    /// <summary>
    /// Records broadcast latency (time to fan-out to all subscribers).
    /// </summary>
    public static void RecordBroadcastLatency(long milliseconds)
    {
        Interlocked.Add(ref _totalBroadcastLatencyMs, milliseconds);

        // Track max (compare-and-swap loop)
        long currentMax;
        do
        {
            currentMax = Interlocked.Read(ref _maxBroadcastLatencyMs);
            if (milliseconds <= currentMax) break;
        } while (Interlocked.CompareExchange(ref _maxBroadcastLatencyMs, milliseconds, currentMax) != currentMax);
    }

    /// <summary>
    /// Records end-to-end delta processing latency (receive to ACK sent).
    /// </summary>
    public static void RecordProcessingLatency(long milliseconds)
    {
        Interlocked.Add(ref _totalProcessingLatencyMs, milliseconds);

        // Track max
        long currentMax;
        do
        {
            currentMax = Interlocked.Read(ref _maxProcessingLatencyMs);
            if (milliseconds <= currentMax) break;
        } while (Interlocked.CompareExchange(ref _maxProcessingLatencyMs, milliseconds, currentMax) != currentMax);
    }

    #endregion

    #region Queue Depth

    /// <summary>
    /// Records a queue depth sample.
    /// </summary>
    public static void RecordQueueDepth(long depth)
    {
        Interlocked.Increment(ref _totalQueueDepthSamples);
        Interlocked.Add(ref _totalQueueDepth, depth);

        // Track max
        long currentMax;
        do
        {
            currentMax = Interlocked.Read(ref _maxQueueDepth);
            if (depth <= currentMax) break;
        } while (Interlocked.CompareExchange(ref _maxQueueDepth, depth, currentMax) != currentMax);
    }

    #endregion

    #region Metrics Retrieval

    /// <summary>
    /// Gets the current metrics snapshot.
    /// </summary>
    public static MetricsSnapshot GetMetrics()
    {
        var deltasReceived = Interlocked.Read(ref _deltasReceived);
        var deltasBroadcast = Interlocked.Read(ref _deltasBroadcast);
        var deltasDropped = Interlocked.Read(ref _deltasDropped);
        var acksSent = Interlocked.Read(ref _acksSent);
        var acksReceived = Interlocked.Read(ref _acksReceived);
        var totalBroadcastLatency = Interlocked.Read(ref _totalBroadcastLatencyMs);
        var maxBroadcastLatency = Interlocked.Read(ref _maxBroadcastLatencyMs);
        var totalProcessingLatency = Interlocked.Read(ref _totalProcessingLatencyMs);
        var maxProcessingLatency = Interlocked.Read(ref _maxProcessingLatencyMs);
        var queueDepthSamples = Interlocked.Read(ref _totalQueueDepthSamples);
        var totalQueueDepth = Interlocked.Read(ref _totalQueueDepth);
        var maxQueueDepth = Interlocked.Read(ref _maxQueueDepth);

        return new MetricsSnapshot
        {
            DeltasReceived = deltasReceived,
            DeltasBroadcast = deltasBroadcast,
            DeltasDropped = deltasDropped,
            AcksSent = acksSent,
            AcksReceived = acksReceived,
            AvgBroadcastLatencyMs = deltasReceived > 0 ? totalBroadcastLatency / deltasReceived : 0,
            MaxBroadcastLatencyMs = maxBroadcastLatency,
            AvgProcessingLatencyMs = deltasReceived > 0 ? totalProcessingLatency / deltasReceived : 0,
            MaxProcessingLatencyMs = maxProcessingLatency,
            AvgQueueDepth = queueDepthSamples > 0 ? totalQueueDepth / queueDepthSamples : 0,
            MaxQueueDepth = maxQueueDepth,
            Convergence = deltasBroadcast > 0
                ? (double)(deltasBroadcast - deltasDropped) / deltasBroadcast
                : 1.0
        };
    }

    /// <summary>
    /// Resets all metrics to zero.
    /// </summary>
    public static void Reset()
    {
        Interlocked.Exchange(ref _deltasReceived, 0);
        Interlocked.Exchange(ref _deltasBroadcast, 0);
        Interlocked.Exchange(ref _deltasDropped, 0);
        Interlocked.Exchange(ref _acksSent, 0);
        Interlocked.Exchange(ref _acksReceived, 0);
        Interlocked.Exchange(ref _totalBroadcastLatencyMs, 0);
        Interlocked.Exchange(ref _maxBroadcastLatencyMs, 0);
        Interlocked.Exchange(ref _totalProcessingLatencyMs, 0);
        Interlocked.Exchange(ref _maxProcessingLatencyMs, 0);
        Interlocked.Exchange(ref _totalQueueDepthSamples, 0);
        Interlocked.Exchange(ref _totalQueueDepth, 0);
        Interlocked.Exchange(ref _maxQueueDepth, 0);
    }

    #endregion
}

/// <summary>
/// Snapshot of performance metrics at a point in time.
/// </summary>
public record MetricsSnapshot
{
    /// <summary>
    /// Number of deltas received from clients.
    /// </summary>
    public long DeltasReceived { get; init; }

    /// <summary>
    /// Total number of delta messages broadcast to subscribers (fan-out count).
    /// This counts each subscriber as a separate send, so will be higher than DeltasReceived.
    /// </summary>
    public long DeltasBroadcast { get; init; }

    /// <summary>
    /// Number of delta messages that failed to send (queue full, connection closed, etc.).
    /// </summary>
    public long DeltasDropped { get; init; }

    /// <summary>
    /// Number of ACK messages sent to clients confirming delta receipt.
    /// </summary>
    public long AcksSent { get; init; }

    /// <summary>
    /// Number of ACK messages received from clients.
    /// This indicates client-side receipt of server broadcasts.
    /// </summary>
    public long AcksReceived { get; init; }

    /// <summary>
    /// Average time to broadcast a delta to all subscribers (milliseconds).
    /// </summary>
    public long AvgBroadcastLatencyMs { get; init; }

    /// <summary>
    /// Maximum time to broadcast a delta to all subscribers (milliseconds).
    /// </summary>
    public long MaxBroadcastLatencyMs { get; init; }

    /// <summary>
    /// Average end-to-end delta processing time (milliseconds).
    /// </summary>
    public long AvgProcessingLatencyMs { get; init; }

    /// <summary>
    /// Maximum end-to-end delta processing time (milliseconds).
    /// </summary>
    public long MaxProcessingLatencyMs { get; init; }

    /// <summary>
    /// Average send queue depth across all samples.
    /// </summary>
    public long AvgQueueDepth { get; init; }

    /// <summary>
    /// Maximum send queue depth observed.
    /// </summary>
    public long MaxQueueDepth { get; init; }

    /// <summary>
    /// Estimated convergence rate (1 - dropRate).
    /// Should approach 1.0 (100%) for a healthy system.
    /// </summary>
    public double Convergence { get; init; }
}
