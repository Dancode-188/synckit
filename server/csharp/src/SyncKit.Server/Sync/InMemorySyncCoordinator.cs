using System.Collections.Concurrent;
using System.Text.Json;
using SyncKit.Server.Storage;

namespace SyncKit.Server.Sync;

/// <summary>
/// In-memory sync coordinator that mirrors TypeScript coordinator behaviour for low-latency reads.
/// - Keeps an in-memory cache of document states loaded on first access
/// - ApplyDeltaAsync persists deltas and returns state in a single operation
/// - Optimized for high-throughput with minimal lock contention
/// </summary>
public class InMemorySyncCoordinator : ISyncCoordinator
{
    private readonly ConcurrentDictionary<string, Dictionary<string, object?>> _cache = new();
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _loadLocks = new();
    private readonly IStorageAdapter _storage;
    private readonly ILogger<InMemorySyncCoordinator> _logger;

    public InMemorySyncCoordinator(IStorageAdapter storage, ILogger<InMemorySyncCoordinator> logger)
    {
        _storage = storage ?? throw new ArgumentNullException(nameof(storage));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<Dictionary<string, object?>> GetDocumentStateAsync(string documentId)
    {
        // Fast path: check cache first (no lock needed)
        if (_cache.TryGetValue(documentId, out var cached))
            return new Dictionary<string, object?>(cached);

        // Slow path: load from storage with lock to prevent thundering herd
        var sem = _loadLocks.GetOrAdd(documentId, _ => new SemaphoreSlim(1, 1));
        await sem.WaitAsync().ConfigureAwait(false);
        try
        {
            // Double-check after acquiring lock
            if (_cache.TryGetValue(documentId, out cached))
                return new Dictionary<string, object?>(cached);

            try
            {
                var state = await _storage.GetDocumentStateAsync(documentId).ConfigureAwait(false);
                var newState = state ?? new Dictionary<string, object?>();
                _cache[documentId] = newState;
                return new Dictionary<string, object?>(newState);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to load document {DocumentId} from storage; returning empty state", documentId);
                var empty = new Dictionary<string, object?>();
                _cache[documentId] = empty;
                return new Dictionary<string, object?>(empty);
            }
        }
        finally
        {
            sem.Release();
        }
    }

    public async Task<Dictionary<string, object?>> ApplyDeltaAsync(
        string documentId,
        JsonElement deltaData,
        Dictionary<string, long> vectorClock,
        long timestampMs,
        string clientId,
        string deltaId)
    {
        var deltaEntry = new DeltaEntry
        {
            Id = deltaId,
            DocumentId = documentId,
            ClientId = clientId,
            OperationType = "set",
            FieldPath = string.Empty,
            Value = deltaData,
            ClockValue = vectorClock?.Values.DefaultIfEmpty(0).Max() ?? 0,
            Timestamp = DateTimeOffset.FromUnixTimeMilliseconds(timestampMs).UtcDateTime,
            VectorClock = vectorClock
        };

        try
        {
            // Save delta - this internally applies LWW and updates Document state
            await _storage.SaveDeltaAsync(deltaEntry).ConfigureAwait(false);
            _logger.LogDebug("Persisted delta {DeltaId} for document {DocumentId}", deltaId, documentId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to persist delta {DeltaId} for document {DocumentId}; continuing with cache-only update", deltaId, documentId);
        }

        // Get updated state from storage (single call - Document.BuildState is now lock-free and O(fields))
        var currentState = await _storage.GetDocumentStateAsync(documentId).ConfigureAwait(false);
        var newState = currentState ?? new Dictionary<string, object?>();

        // Update cache atomically
        _cache[documentId] = newState;
        return new Dictionary<string, object?>(newState);
    }
}
