using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.Services;

/// <summary>
/// Service that batches rapid delta updates within a 50ms window before broadcasting.
/// This reduces network overhead by coalescing multiple updates into single broadcasts.
/// Mirrors the TypeScript server's batching behavior for protocol compatibility.
/// </summary>
public class DeltaBatchingService : IHostedService, IDisposable
{
    private readonly ConcurrentDictionary<string, DeltaBatch> _pendingBatches = new();
    private readonly TimeSpan _batchInterval = TimeSpan.FromMilliseconds(50);
    private readonly IConnectionManager _connectionManager;
    private readonly PubSub.IRedisPubSub? _redis;
    private readonly ILogger<DeltaBatchingService> _logger;
    private bool _disposed;

    /// <summary>
    /// Represents a batch of pending deltas for a document.
    /// </summary>
    private class DeltaBatch
    {
        /// <summary>
        /// Coalesced delta fields. Later writes for the same field overwrite earlier ones.
        /// </summary>
        public ConcurrentDictionary<string, object?> Delta { get; } = new();

        /// <summary>
        /// Timer that fires to flush the batch after the interval.
        /// </summary>
        public Timer? Timer { get; set; }

        /// <summary>
        /// The document ID this batch belongs to.
        /// </summary>
        public string DocumentId { get; set; } = string.Empty;

        /// <summary>
        /// The merged vector clock from all deltas in this batch.
        /// </summary>
        public ConcurrentDictionary<string, long> MergedVectorClock { get; } = new();

        /// <summary>
        /// Timestamp when this batch was created (for latency tracking).
        /// </summary>
        public long CreatedAtMs { get; set; }

        /// <summary>
        /// Timestamp of the first delta added to this batch.
        /// </summary>
        public long FirstDeltaAtMs;
    }

    public DeltaBatchingService(
        IConnectionManager connectionManager,
        ILogger<DeltaBatchingService> logger,
        PubSub.IRedisPubSub? redis = null)
    {
        _connectionManager = connectionManager ?? throw new ArgumentNullException(nameof(connectionManager));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _redis = redis;
    }

    /// <summary>
    /// Adds a delta to the batch for a document. The batch will be flushed after 50ms.
    /// </summary>
    /// <param name="documentId">The document ID.</param>
    /// <param name="authoritativeDelta">The authoritative delta fields to broadcast.</param>
    /// <param name="vectorClock">The vector clock from the incoming delta.</param>
    public void AddToBatch(
        string documentId,
        Dictionary<string, object?> authoritativeDelta,
        Dictionary<string, long> vectorClock)
    {
        if (_disposed)
        {
            _logger.LogWarning("Attempted to add delta to disposed batching service");
            return;
        }

        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var batch = _pendingBatches.GetOrAdd(documentId, docId =>
        {
            var newBatch = new DeltaBatch
            {
                DocumentId = docId,
                CreatedAtMs = nowMs,
                FirstDeltaAtMs = nowMs
            };

            // Schedule the flush after the batch interval
            newBatch.Timer = new Timer(
                _ => FlushBatch(docId),
                null,
                _batchInterval,
                Timeout.InfiniteTimeSpan);

            _logger.LogDebug("Created new batch for document {DocumentId} at {Timestamp}ms", docId, nowMs);
            return newBatch;
        });

        // Track first delta time if this is the first one (atomic set when zero)
        if (batch.Delta.IsEmpty)
        {
            System.Threading.Interlocked.CompareExchange(ref batch.FirstDeltaAtMs, nowMs, 0);
        }

        // Coalesce delta fields (later writes win for same field)
        foreach (var (key, value) in authoritativeDelta)
        {
            batch.Delta[key] = value;
        }

        // Merge vector clocks (take max for each client)
        foreach (var (clientId, clock) in vectorClock)
        {
            batch.MergedVectorClock.AddOrUpdate(
                clientId,
                clock,
                (_, existing) => Math.Max(existing, clock));
        }

        _logger.LogTrace(
            "Added to batch for document {DocumentId}: {FieldCount} fields",
            documentId, authoritativeDelta.Count);
    }

    /// <summary>
    /// Flushes a pending batch and broadcasts individual field messages (matching TypeScript behavior).
    /// Each field is sent as a separate delta message for lower per-field latency.
    /// </summary>
    private void FlushBatch(string documentId)
    {
        var flushStartMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var sw = Stopwatch.StartNew();

        if (!_pendingBatches.TryRemove(documentId, out var batch))
        {
            return;
        }

        Dictionary<string, object?> deltaToSend;
        Dictionary<string, long> vectorClockToSend;
        long batchCreatedAtMs;
        long firstDeltaAtMs;

        // Dispose the timer
        batch.Timer?.Dispose();
        batch.Timer = null;

        // Copy the data for sending
        deltaToSend = new Dictionary<string, object?>(batch.Delta);
        vectorClockToSend = new Dictionary<string, long>(batch.MergedVectorClock);
        batchCreatedAtMs = batch.CreatedAtMs;
        firstDeltaAtMs = batch.FirstDeltaAtMs;

        var lockReleasedMs = sw.ElapsedMilliseconds;

        if (deltaToSend.Count == 0)
        {
            _logger.LogDebug("Empty batch for document {DocumentId}, skipping broadcast", documentId);
            return;
        }

        // Log timing breakdown
        var batchWaitTime = flushStartMs - batchCreatedAtMs;
        var firstDeltaWaitTime = flushStartMs - firstDeltaAtMs;

        _logger.LogDebug(
            "Flushing batch for document {DocumentId}: {FieldCount} fields, " +
            "batchWait={BatchWait}ms, firstDeltaWait={FirstDeltaWait}ms, " +
            "lockTime={LockTime}ms",
            documentId, deltaToSend.Count,
            batchWaitTime, firstDeltaWaitTime,
            lockReleasedMs);

        // Send individual field messages (matches TypeScript flushBatch behavior)
        // This provides lower per-field latency compared to batching all fields into one message
        _ = BroadcastFieldsAsync(documentId, deltaToSend, vectorClockToSend, sw);
    }

    /// <summary>
    /// Broadcasts individual field messages to all document subscribers.
    /// Each field is sent as a separate DeltaMessage, matching TypeScript behavior.
    /// </summary>
    private async Task BroadcastFieldsAsync(
        string documentId,
        Dictionary<string, object?> fields,
        Dictionary<string, long> vectorClock,
        Stopwatch? sw = null)
    {
        var broadcastStartMs = sw?.ElapsedMilliseconds ?? 0;
        var fieldCount = 0;

        try
        {
            // Send each field as an individual message (matches TypeScript)
            foreach (var (field, value) in fields)
            {
                // Create single-field delta
                var singleFieldDelta = new Dictionary<string, object?> { { field, value } };
                var deltaJson = JsonSerializer.SerializeToElement(singleFieldDelta);

                var fieldMessage = new DeltaMessage
                {
                    Id = Guid.NewGuid().ToString(),
                    Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    DocumentId = documentId,
                    Delta = deltaJson,
                    VectorClock = vectorClock
                };

                // Broadcast to all subscribers (don't exclude anyone - sender needs convergence)
                _ = _connectionManager.BroadcastToDocumentAsync(
                    documentId,
                    fieldMessage,
                    excludeConnectionId: null);

                fieldCount++;
            }

            var broadcastEndMs = sw?.ElapsedMilliseconds ?? 0;

            // Publish to Redis for other server instances (batch for efficiency)
            if (_redis != null && fields.Count > 0)
            {
                try
                {
                    // Send combined delta to Redis (other instances will broadcast individually)
                    var combinedDelta = JsonSerializer.SerializeToElement(fields);
                    var redisMessage = new DeltaMessage
                    {
                        Id = Guid.NewGuid().ToString(),
                        Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                        DocumentId = documentId,
                        Delta = combinedDelta,
                        VectorClock = vectorClock
                    };
                    await _redis.PublishDeltaAsync(documentId, redisMessage);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex,
                        "Failed to publish batched delta to Redis for document {DocumentId}",
                        documentId);
                }
            }

            var redisEndMs = sw?.ElapsedMilliseconds ?? 0;

            _logger.LogDebug(
                "Broadcast complete for document {DocumentId}: {FieldCount} field messages, " +
                "broadcastTime={BroadcastTime}ms, redisTime={RedisTime}ms, totalFlush={TotalFlush}ms",
                documentId, fieldCount,
                broadcastEndMs - broadcastStartMs,
                redisEndMs - broadcastEndMs,
                redisEndMs);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Failed to broadcast field messages for document {DocumentId}",
                documentId);
        }
    }

    /// <summary>
    /// Forces an immediate flush of all pending batches.
    /// Used during shutdown to ensure no deltas are lost.
    /// </summary>
    public async Task FlushAllAsync()
    {
        var documentIds = _pendingBatches.Keys.ToList();

        foreach (var documentId in documentIds)
        {
            FlushBatch(documentId);
        }

        // Give a moment for broadcasts to complete
        await Task.Delay(10);
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation(
            "Delta batching service started with {Interval}ms batch interval",
            _batchInterval.TotalMilliseconds);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Delta batching service stopping, flushing pending batches...");

        // Flush all pending batches before shutdown
        await FlushAllAsync();

        _logger.LogInformation("Delta batching service stopped");
    }

    public void Dispose()
    {
        if (_disposed)
            return;

        _disposed = true;

        // Dispose all timers
        foreach (var batch in _pendingBatches.Values)
        {
            batch.Timer?.Dispose();
        }

        _pendingBatches.Clear();
    }
}
