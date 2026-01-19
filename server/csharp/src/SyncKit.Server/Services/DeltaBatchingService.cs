using System.Collections.Concurrent;
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
        /// Lock object for thread-safe batch operations.
        /// </summary>
        public readonly object Lock = new();
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

        var batch = _pendingBatches.GetOrAdd(documentId, docId =>
        {
            var newBatch = new DeltaBatch { DocumentId = docId };

            // Schedule the flush after the batch interval
            newBatch.Timer = new Timer(
                _ => FlushBatch(docId),
                null,
                _batchInterval,
                Timeout.InfiniteTimeSpan);

            _logger.LogDebug("Created new batch for document {DocumentId}", docId);
            return newBatch;
        });

        lock (batch.Lock)
        {
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
        }

        _logger.LogTrace(
            "Added to batch for document {DocumentId}: {FieldCount} fields",
            documentId, authoritativeDelta.Count);
    }

    /// <summary>
    /// Flushes a pending batch and broadcasts the coalesced delta to all subscribers.
    /// </summary>
    private void FlushBatch(string documentId)
    {
        if (!_pendingBatches.TryRemove(documentId, out var batch))
        {
            return;
        }

        Dictionary<string, object?> deltaToSend;
        Dictionary<string, long> vectorClockToSend;

        lock (batch.Lock)
        {
            // Dispose the timer
            batch.Timer?.Dispose();
            batch.Timer = null;

            // Copy the data for sending
            deltaToSend = new Dictionary<string, object?>(batch.Delta);
            vectorClockToSend = new Dictionary<string, long>(batch.MergedVectorClock);
        }

        if (deltaToSend.Count == 0)
        {
            _logger.LogDebug("Empty batch for document {DocumentId}, skipping broadcast", documentId);
            return;
        }

        // Convert dictionary to JsonElement for source-generated serialization
        var deltaJson = JsonSerializer.SerializeToElement(deltaToSend);

        // Build the broadcast message
        var broadcastMessage = new DeltaMessage
        {
            Id = Guid.NewGuid().ToString(),
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId,
            Delta = deltaJson,
            VectorClock = vectorClockToSend
        };

        _logger.LogDebug(
            "Flushing batch for document {DocumentId}: {FieldCount} fields coalesced",
            documentId, deltaToSend.Count);

        // Broadcast to all subscribers (including sender for convergence)
        // Fire-and-forget since we're in a timer callback
        _ = BroadcastAsync(documentId, broadcastMessage);
    }

    /// <summary>
    /// Broadcasts the batched delta message to all document subscribers.
    /// </summary>
    private async Task BroadcastAsync(string documentId, DeltaMessage message)
    {
        try
        {
            // Broadcast to all subscribers (don't exclude anyone - sender needs convergence)
            await _connectionManager.BroadcastToDocumentAsync(
                documentId,
                message,
                excludeConnectionId: null);

            // Publish to Redis for other server instances
            if (_redis != null)
            {
                try
                {
                    await _redis.PublishDeltaAsync(documentId, message);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex,
                        "Failed to publish batched delta to Redis for document {DocumentId}",
                        documentId);
                }
            }

            _logger.LogTrace(
                "Broadcast batched delta for document {DocumentId}",
                documentId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Failed to broadcast batched delta for document {DocumentId}",
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
