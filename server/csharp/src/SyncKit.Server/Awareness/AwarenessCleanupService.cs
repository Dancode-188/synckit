using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.Awareness;

public class AwarenessCleanupService : BackgroundService
{
    private readonly TimeSpan _interval;
    private readonly IAwarenessStore _awarenessStore;
    private readonly IConnectionManager _connectionManager;
    private readonly ILogger<AwarenessCleanupService> _logger;

    public AwarenessCleanupService(
        IAwarenessStore awarenessStore,
        IConnectionManager connectionManager,
        ILogger<AwarenessCleanupService> logger,
        TimeSpan? interval = null)
    {
        _awarenessStore = awarenessStore ?? throw new ArgumentNullException(nameof(awarenessStore));
        _connectionManager = connectionManager ?? throw new ArgumentNullException(nameof(connectionManager));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        // Match TypeScript server defaults: cleanup interval 30s
        _interval = interval ?? TimeSpan.FromSeconds(30);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Awareness cleanup service started with interval {Interval}", _interval);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                await Task.Delay(_interval, stoppingToken);

                try
                {
                    await RunCleanupOnceAsync(stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    // Graceful shutdown
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error running awareness cleanup loop");
                }
            }
        }
        finally
        {
            _logger.LogInformation("Awareness cleanup service stopping");
        }
    }

    /// <summary>
    /// Run a single cleanup iteration. Public for testing.
    /// </summary>
    public async Task RunCleanupOnceAsync(CancellationToken cancellationToken = default)
    {
        var expired = await _awarenessStore.GetExpiredAsync();

        if (expired == null || expired.Count == 0)
        {
            _logger.LogTrace("No expired awareness entries found");
            return;
        }

        _logger.LogInformation("Found {Count} expired awareness entries", expired.Count);

        foreach (var entry in expired)
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                var leaveMsg = new AwarenessUpdateMessage
                {
                    Id = Guid.NewGuid().ToString(),
                    Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    DocumentId = entry.DocumentId,
                    ClientId = entry.ClientId,
                    State = System.Text.Json.JsonDocument.Parse("null").RootElement,
                    Clock = entry.Clock + 1
                };

                await _connectionManager.BroadcastToDocumentAsync(entry.DocumentId, leaveMsg);

                _logger.LogDebug("Broadcasted expired awareness leave for {ClientId} in {DocumentId}", entry.ClientId, entry.DocumentId);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to broadcast expired awareness for {ClientId} in {DocumentId}", entry.ClientId, entry.DocumentId);
            }
        }

        await _awarenessStore.PruneExpiredAsync();
    }
}
