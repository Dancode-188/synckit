using System.Collections.Concurrent;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.Services;

/// <summary>
/// Tracks pending acknowledgments for messages sent to clients.
/// Implements retry logic for unacknowledged messages.
/// Mirrors the TypeScript server's ACK tracking behavior for protocol compatibility.
/// </summary>
public class AckTracker : IHostedService, IDisposable
{
    private readonly ConcurrentDictionary<string, PendingAck> _pendingAcks = new();
    private readonly IConnectionManager _connectionManager;
    private readonly ILogger<AckTracker> _logger;
    private readonly TimeSpan _ackTimeout;
    private readonly int _maxRetries;
    private Timer? _cleanupTimer;
    private bool _disposed;

    /// <summary>
    /// Represents a pending ACK entry.
    /// </summary>
    private class PendingAck
    {
        /// <summary>
        /// The message ID being tracked.
        /// </summary>
        public required string MessageId { get; init; }

        /// <summary>
        /// The document this message relates to.
        /// </summary>
        public required string DocumentId { get; init; }

        /// <summary>
        /// The original message that was sent.
        /// </summary>
        public required IMessage Message { get; init; }

        /// <summary>
        /// The connection ID that should send the ACK.
        /// </summary>
        public required string TargetConnectionId { get; init; }

        /// <summary>
        /// Number of retry attempts made.
        /// </summary>
        public int Attempts { get; set; }

        /// <summary>
        /// When the message was originally sent.
        /// </summary>
        public DateTimeOffset SentAt { get; init; }

        /// <summary>
        /// When the ACK should timeout.
        /// </summary>
        public DateTimeOffset TimeoutAt { get; set; }
    }

    /// <summary>
    /// Configuration options for ACK tracking.
    /// </summary>
    public class AckTrackerOptions
    {
        /// <summary>
        /// How long to wait for an ACK before considering the message unacknowledged.
        /// Default: 5000ms
        /// </summary>
        public TimeSpan AckTimeout { get; set; } = TimeSpan.FromMilliseconds(5000);

        /// <summary>
        /// Maximum number of retry attempts for unacknowledged messages.
        /// Default: 3
        /// </summary>
        public int MaxRetries { get; set; } = 3;

        /// <summary>
        /// How often to check for timed-out ACKs.
        /// Default: 1000ms
        /// </summary>
        public TimeSpan CleanupInterval { get; set; } = TimeSpan.FromMilliseconds(1000);
    }

    public AckTracker(
        IConnectionManager connectionManager,
        ILogger<AckTracker> logger,
        AckTrackerOptions? options = null)
    {
        _connectionManager = connectionManager ?? throw new ArgumentNullException(nameof(connectionManager));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));

        options ??= new AckTrackerOptions();
        _ackTimeout = options.AckTimeout;
        _maxRetries = options.MaxRetries;
    }

    /// <summary>
    /// Creates a tracking key for a pending ACK.
    /// Format matches TypeScript: `${connectionId}-${messageId}`
    /// </summary>
    private static string CreateAckKey(string connectionId, string messageId)
        => $"{connectionId}-{messageId}";

    /// <summary>
    /// Tracks a message that was sent to a connection and expects an ACK.
    /// </summary>
    /// <param name="connectionId">The target connection ID.</param>
    /// <param name="documentId">The document ID.</param>
    /// <param name="message">The message that was sent.</param>
    public void TrackMessage(string connectionId, string documentId, IMessage message)
    {
        if (_disposed)
        {
            _logger.LogWarning("Attempted to track message on disposed AckTracker");
            return;
        }

        var ackKey = CreateAckKey(connectionId, message.Id);
        var now = DateTimeOffset.UtcNow;

        var pendingAck = new PendingAck
        {
            MessageId = message.Id,
            DocumentId = documentId,
            Message = message,
            TargetConnectionId = connectionId,
            Attempts = 1,
            SentAt = now,
            TimeoutAt = now.Add(_ackTimeout)
        };

        if (_pendingAcks.TryAdd(ackKey, pendingAck))
        {
            _logger.LogTrace(
                "Tracking ACK for message {MessageId} to connection {ConnectionId}",
                message.Id, connectionId);
        }
        else
        {
            _logger.LogDebug(
                "Message {MessageId} to connection {ConnectionId} already being tracked",
                message.Id, connectionId);
        }
    }

    /// <summary>
    /// Acknowledges receipt of a message from a connection.
    /// </summary>
    /// <param name="connectionId">The connection that sent the ACK.</param>
    /// <param name="messageId">The message ID being acknowledged.</param>
    /// <returns>True if the ACK was expected and processed, false otherwise.</returns>
    public bool AcknowledgeMessage(string connectionId, string messageId)
    {
        var ackKey = CreateAckKey(connectionId, messageId);

        if (_pendingAcks.TryRemove(ackKey, out var pendingAck))
        {
            // Verify ACK is from the correct client
            if (pendingAck.TargetConnectionId != connectionId)
            {
                _logger.LogWarning(
                    "ACK for message {MessageId} received from wrong client {ConnectionId}, expected {ExpectedConnectionId}",
                    messageId, connectionId, pendingAck.TargetConnectionId);

                // Put it back since it's not for this connection
                _pendingAcks.TryAdd(ackKey, pendingAck);
                return false;
            }

            var latency = DateTimeOffset.UtcNow - pendingAck.SentAt;
            _logger.LogTrace(
                "ACK received for message {MessageId} from connection {ConnectionId} after {Latency}ms",
                messageId, connectionId, latency.TotalMilliseconds);

            return true;
        }

        _logger.LogDebug(
            "ACK received for unknown/already-acknowledged message {MessageId} from connection {ConnectionId}",
            messageId, connectionId);
        return false;
    }

    /// <summary>
    /// Removes all pending ACKs for a specific connection (e.g., when connection closes).
    /// </summary>
    /// <param name="connectionId">The connection ID to clean up.</param>
    /// <returns>Number of pending ACKs that were removed.</returns>
    public int RemovePendingAcksForConnection(string connectionId)
    {
        var keysToRemove = _pendingAcks
            .Where(kvp => kvp.Value.TargetConnectionId == connectionId)
            .Select(kvp => kvp.Key)
            .ToList();

        var removed = 0;
        foreach (var key in keysToRemove)
        {
            if (_pendingAcks.TryRemove(key, out _))
            {
                removed++;
            }
        }

        if (removed > 0)
        {
            _logger.LogDebug(
                "Removed {Count} pending ACKs for disconnected connection {ConnectionId}",
                removed, connectionId);
        }

        return removed;
    }

    /// <summary>
    /// Processes timed-out ACKs, retrying or giving up as appropriate.
    /// </summary>
    private void ProcessTimeouts(object? state)
    {
        if (_disposed)
            return;

        var now = DateTimeOffset.UtcNow;
        var timedOut = _pendingAcks
            .Where(kvp => kvp.Value.TimeoutAt <= now)
            .ToList();

        foreach (var (key, pendingAck) in timedOut)
        {
            if (pendingAck.Attempts >= _maxRetries)
            {
                // Max retries reached, give up
                if (_pendingAcks.TryRemove(key, out _))
                {
                    _logger.LogWarning(
                        "Giving up on message {MessageId} to connection {ConnectionId} after {Attempts} attempts",
                        pendingAck.MessageId, pendingAck.TargetConnectionId, pendingAck.Attempts);
                }
                continue;
            }

            // Try to get the connection for retry
            var connection = _connectionManager.GetConnection(pendingAck.TargetConnectionId);
            if (connection == null)
            {
                // Connection no longer exists, clean up
                if (_pendingAcks.TryRemove(key, out _))
                {
                    _logger.LogDebug(
                        "Connection {ConnectionId} no longer exists, dropping pending message {MessageId}",
                        pendingAck.TargetConnectionId, pendingAck.MessageId);
                }
                continue;
            }

            // Retry the message
            pendingAck.Attempts++;
            pendingAck.TimeoutAt = now.Add(_ackTimeout);

            try
            {
                connection.Send(pendingAck.Message);
                _logger.LogDebug(
                    "Retrying message {MessageId} to connection {ConnectionId} (attempt {Attempt}/{MaxRetries})",
                    pendingAck.MessageId, pendingAck.TargetConnectionId, pendingAck.Attempts, _maxRetries);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Failed to retry message {MessageId} to connection {ConnectionId}",
                    pendingAck.MessageId, pendingAck.TargetConnectionId);
            }
        }
    }

    /// <summary>
    /// Gets statistics about pending ACKs.
    /// </summary>
    public (int PendingCount, int UniqueConnections, int UniqueDocuments) GetStats()
    {
        var pending = _pendingAcks.Values.ToList();
        return (
            pending.Count,
            pending.Select(p => p.TargetConnectionId).Distinct().Count(),
            pending.Select(p => p.DocumentId).Distinct().Count()
        );
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation(
            "ACK tracker started with {Timeout}ms timeout and {MaxRetries} max retries",
            _ackTimeout.TotalMilliseconds, _maxRetries);

        // Start the cleanup timer
        _cleanupTimer = new Timer(
            ProcessTimeouts,
            null,
            TimeSpan.FromSeconds(1),
            TimeSpan.FromSeconds(1));

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("ACK tracker stopping...");

        _cleanupTimer?.Change(Timeout.Infinite, 0);

        var (pending, connections, documents) = GetStats();
        if (pending > 0)
        {
            _logger.LogWarning(
                "ACK tracker stopping with {PendingCount} pending ACKs across {Connections} connections and {Documents} documents",
                pending, connections, documents);
        }

        return Task.CompletedTask;
    }

    public void Dispose()
    {
        if (_disposed)
            return;
        _disposed = true;

        _cleanupTimer?.Dispose();
        _pendingAcks.Clear();
    }
}
