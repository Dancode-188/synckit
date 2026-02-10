using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SyncKit.Server.Configuration;

namespace SyncKit.Server.Awareness;

public class InMemoryAwarenessStore : IAwarenessStore
{
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, AwarenessEntry>> _store = new();
    private readonly int _timeoutMs;
    private readonly ILogger<InMemoryAwarenessStore> _logger;

    public InMemoryAwarenessStore(IOptions<SyncKitConfig> config, ILogger<InMemoryAwarenessStore> logger)
    {
        _timeoutMs = Math.Max(0, config.Value.AwarenessTimeoutMs);
        _logger = logger;
    }

    public Task<AwarenessEntry?> GetAsync(string documentId, string clientId)
    {
        if (_store.TryGetValue(documentId, out var docStore) && docStore.TryGetValue(clientId, out var entry))
        {
            return Task.FromResult<AwarenessEntry?>(entry);
        }
        return Task.FromResult<AwarenessEntry?>(null);
    }

    public Task<IReadOnlyList<AwarenessEntry>> GetAllAsync(string documentId)
    {
        if (_store.TryGetValue(documentId, out var docStore))
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var active = docStore.Values.Where(e => e.ExpiresAt > now).ToList();
            return Task.FromResult<IReadOnlyList<AwarenessEntry>>(active);
        }

        return Task.FromResult<IReadOnlyList<AwarenessEntry>>(Array.Empty<AwarenessEntry>());
    }

    public Task<bool> SetAsync(string documentId, string clientId, AwarenessState state, long clock)
    {
        var docStore = _store.GetOrAdd(documentId, _ => new ConcurrentDictionary<string, AwarenessEntry>());

        if (docStore.TryGetValue(clientId, out var existing))
        {
            // Reject stale updates
            if (clock <= existing.Clock)
            {
                _logger.LogDebug("Ignoring stale awareness update for {ClientId} in {DocumentId}: {Clock} <= {ExistingClock}",
                    clientId, documentId, clock, existing.Clock);
                return Task.FromResult(false);
            }
        }

        var entry = AwarenessEntry.Create(documentId, clientId, state?.State, clock, _timeoutMs);

        docStore[clientId] = entry;

        _logger.LogDebug("Updated awareness for {ClientId} in {DocumentId} at clock {Clock}",
            clientId, documentId, clock);

        return Task.FromResult(true);
    }

    public Task RemoveAsync(string documentId, string clientId)
    {
        if (_store.TryGetValue(documentId, out var docStore))
        {
            docStore.TryRemove(clientId, out _);
        }

        return Task.CompletedTask;
    }

    public Task RemoveAllForConnectionAsync(string connectionId)
    {
        foreach (var (docId, docStore) in _store)
        {
            var toRemove = docStore.Values
                .Where(e => e.ClientId == connectionId)
                .Select(e => e.ClientId)
                .ToList();

            foreach (var clientId in toRemove)
            {
                docStore.TryRemove(clientId, out _);
            }
        }

        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<AwarenessEntry>> GetExpiredAsync()
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var expired = _store.Values
            .SelectMany(d => d.Values)
            .Where(e => e.IsExpired())
            .ToList();
        return Task.FromResult<IReadOnlyList<AwarenessEntry>>(expired);
    }

    public Task PruneExpiredAsync()
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var removed = 0;

        foreach (var (docId, docStore) in _store)
        {
            var expired = docStore.Values
                .Where(e => e.IsExpired())
                .Select(e => e.ClientId)
                .ToList();

            foreach (var clientId in expired)
            {
                if (docStore.TryRemove(clientId, out _))
                {
                    removed++;
                }
            }
        }

        if (removed > 0)
        {
            _logger.LogDebug("Pruned {Count} expired awareness entries", removed);
        }

        return Task.CompletedTask;
    }
}
