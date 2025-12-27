using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using StackExchange.Redis;
using SyncKit.Server.Configuration;

namespace SyncKit.Server.Awareness;

/// <summary>
/// Redis-backed implementation of <see cref="IAwarenessStore"/>.
///
/// Key layout:
/// - Hash: synckit:awareness:{documentId} => field: clientId => serialized AwarenessEntry
/// - SortedSet: synckit:awareness:expires:{documentId} => member: clientId => score: expiresAt (ms)
/// - Set: synckit:awareness:docs => members: documentId (track known documents)
///
/// Operations are implemented with optimistic transactions where appropriate to keep updates atomic.
/// </summary>
public class RedisAwarenessStore : IAwarenessStore
{
    private readonly IConnectionMultiplexer _conn;
    private readonly IDatabase _db;
    private readonly ILogger<RedisAwarenessStore> _logger;
    private readonly int _timeoutMs;
    private readonly JsonSerializerOptions _jsonOptions;

    public RedisAwarenessStore(ILogger<RedisAwarenessStore> logger, IOptions<SyncKitConfig> options)
        : this(logger, options, ConnectionMultiplexer.Connect(options?.Value?.RedisUrl ?? throw new ArgumentException("RedisUrl must be configured for RedisAwarenessStore", nameof(options))))
    {
    }

    // Testing constructor allows injecting IConnectionMultiplexer
    public RedisAwarenessStore(ILogger<RedisAwarenessStore> logger, IOptions<SyncKitConfig> options, IConnectionMultiplexer conn)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        var cfg = options?.Value ?? throw new ArgumentNullException(nameof(options));
        _conn = conn ?? throw new ArgumentNullException(nameof(conn));
        _db = _conn.GetDatabase();
        _timeoutMs = Math.Max(0, cfg.AwarenessTimeoutMs);
        _jsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true,
            DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
        };
    }

    private static string HashKey(string documentId) => $"synckit:awareness:{documentId}";
    private static string ExpiresKey(string documentId) => $"synckit:awareness:expires:{documentId}";
    private static string DocsKey() => "synckit:awareness:docs";

    public async Task<AwarenessEntry?> GetAsync(string documentId, string clientId)
    {
        var key = HashKey(documentId);
        var val = await _db.HashGetAsync(key, clientId).ConfigureAwait(false);
        if (val.IsNullOrEmpty) return null;
        try
        {
            var entry = JsonSerializer.Deserialize<AwarenessEntry>(val.ToString()!, _jsonOptions);
            if (entry == null) return null;
            // Treat expired entries as missing
            if (entry.IsExpired()) return null;
            return entry;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to deserialize awareness entry for {DocumentId}/{ClientId}", documentId, clientId);
            return null;
        }
    }

    public async Task<IReadOnlyList<AwarenessEntry>> GetAllAsync(string documentId)
    {
        var key = HashKey(documentId);
        var values = await _db.HashValuesAsync(key).ConfigureAwait(false);
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var list = new List<AwarenessEntry>(values.Length);
        foreach (var v in values)
        {
            if (v.IsNullOrEmpty) continue;
            try
            {
                var e = JsonSerializer.Deserialize<AwarenessEntry>(v.ToString()!, _jsonOptions);
                if (e != null && e.ExpiresAt > now)
                {
                    list.Add(e);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to deserialize awareness entry while listing for {DocumentId}", documentId);
            }
        }
        return list;
    }

    public async Task<bool> SetAsync(string documentId, string clientId, AwarenessState state, long clock)
    {
        var hashKey = HashKey(documentId);
        var zKey = ExpiresKey(documentId);

        // Read existing entry
        var existingRaw = await _db.HashGetAsync(hashKey, clientId).ConfigureAwait(false);
        if (!existingRaw.IsNullOrEmpty)
        {
            try
            {
                var existing = JsonSerializer.Deserialize<AwarenessEntry>(existingRaw.ToString()!, _jsonOptions);
                if (existing != null && clock <= existing.Clock)
                {
                    _logger.LogDebug("Ignoring stale awareness update for {ClientId} in {DocumentId}: {Clock} <= {ExistingClock}", clientId, documentId, clock, existing.Clock);
                    return false;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to deserialize existing awareness entry for {DocumentId}/{ClientId}", documentId, clientId);
            }
        }

        var entry = AwarenessEntry.Create(documentId, clientId, state?.State, clock, _timeoutMs);
        var serialized = JsonSerializer.Serialize(entry, _jsonOptions);
        var expiresAt = (double)entry.ExpiresAt;

        // Use transaction with compare condition to ensure we don't overwrite concurrent change
        var tran = _db.CreateTransaction();

        if (existingRaw.IsNullOrEmpty)
        {
            tran.AddCondition(Condition.HashNotExists(hashKey, clientId));
        }
        else
        {
            tran.AddCondition(Condition.HashEqual(hashKey, clientId, existingRaw));
        }

        _ = tran.HashSetAsync(hashKey, clientId, serialized);
        _ = tran.SortedSetAddAsync(zKey, clientId, expiresAt);
        _ = tran.SetAddAsync(DocsKey(), documentId);

        var committed = await tran.ExecuteAsync().ConfigureAwait(false);
        if (!committed)
        {
            // Concurrent modification - indicate failure; caller may retry if desired
            _logger.LogDebug("Concurrent update detected while writing awareness for {ClientId} in {DocumentId}", clientId, documentId);
            return false;
        }

        _logger.LogDebug("Updated awareness for {ClientId} in {DocumentId} at clock {Clock}", clientId, documentId, clock);
        return true;
    }

    public async Task RemoveAsync(string documentId, string clientId)
    {
        var hashKey = HashKey(documentId);
        var zKey = ExpiresKey(documentId);
        await _db.HashDeleteAsync(hashKey, clientId).ConfigureAwait(false);
        await _db.SortedSetRemoveAsync(zKey, clientId).ConfigureAwait(false);
    }

    public async Task RemoveAllForConnectionAsync(string connectionId)
    {
        // Iterate known docs and remove any entries with matching client id (clientId==connectionId per current in-memory behavior)
        var docs = await _db.SetMembersAsync(DocsKey()).ConfigureAwait(false);
        foreach (var doc in docs)
        {
            var documentId = doc.ToString();
            if (string.IsNullOrEmpty(documentId)) continue;
            var hashKey = HashKey(documentId);
            var entries = await _db.HashGetAllAsync(hashKey).ConfigureAwait(false);
            var toRemove = new List<RedisValue>();
            foreach (var he in entries)
            {
                if (he.Name == connectionId)
                {
                    toRemove.Add(he.Name);
                }
            }

            if (toRemove.Count == 0) continue;

            var tasks = toRemove.Select(c => _db.HashDeleteAsync(hashKey, c));
            await Task.WhenAll(tasks).ConfigureAwait(false);
            var zKey = ExpiresKey(documentId);
            var zRemTasks = toRemove.Select(c => _db.SortedSetRemoveAsync(zKey, c));
            await Task.WhenAll(zRemTasks).ConfigureAwait(false);
        }
    }

    public async Task<IReadOnlyList<AwarenessEntry>> GetExpiredAsync()
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var docs = await _db.SetMembersAsync(DocsKey()).ConfigureAwait(false);
        var expired = new List<AwarenessEntry>();

        foreach (var doc in docs)
        {
            var documentId = doc.ToString();
            if (string.IsNullOrEmpty(documentId)) continue;
            var zKey = ExpiresKey(documentId);
            var members = await _db.SortedSetRangeByScoreAsync(zKey, double.NegativeInfinity, now).ConfigureAwait(false);
            if (members.Length == 0) continue;
            var hashKey = HashKey(documentId);
            foreach (var member in members)
            {
                var raw = await _db.HashGetAsync(hashKey, member).ConfigureAwait(false);
                if (raw.IsNullOrEmpty) continue;
                try
                {
                    var e = JsonSerializer.Deserialize<AwarenessEntry>(raw.ToString()!, _jsonOptions);
                    if (e != null) expired.Add(e);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to deserialize expired entry {Doc}/{Client}", documentId, member);
                }
            }
        }

        return expired;
    }

    public async Task PruneExpiredAsync()
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var docs = await _db.SetMembersAsync(DocsKey()).ConfigureAwait(false);
        var removed = 0;

        foreach (var doc in docs)
        {
            var documentId = doc.ToString();
            if (string.IsNullOrEmpty(documentId)) continue;
            var zKey = ExpiresKey(documentId);
            var members = await _db.SortedSetRangeByScoreAsync(zKey, double.NegativeInfinity, now).ConfigureAwait(false);
            if (members.Length == 0) continue;

            var hashKey = HashKey(documentId);
            foreach (var member in members)
            {
                var did = await _db.HashDeleteAsync(hashKey, member).ConfigureAwait(false);
                if (did) removed++;
            }

            // Remove expired members from zset
            await _db.SortedSetRemoveRangeByScoreAsync(zKey, double.NegativeInfinity, now).ConfigureAwait(false);
        }

        if (removed > 0) _logger.LogDebug("Pruned {Count} expired awareness entries", removed);
    }
}
