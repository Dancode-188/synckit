using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace SyncKit.Server.Storage;

/// <summary>
/// Wraps a primary <see cref="IStorageAdapter"/> and falls back to
/// <see cref="InMemoryStorageAdapter"/> when the primary fails to connect.
/// </summary>
public class FallbackStorageAdapter : IStorageAdapter
{
    private IStorageAdapter _inner;
    private readonly ILogger<FallbackStorageAdapter> _logger;
    private readonly ILoggerFactory _loggerFactory;
    private bool _usingFallback;

    public FallbackStorageAdapter(
        IStorageAdapter primary,
        ILoggerFactory loggerFactory)
    {
        _inner = primary ?? throw new ArgumentNullException(nameof(primary));
        _loggerFactory = loggerFactory ?? throw new ArgumentNullException(nameof(loggerFactory));
        _logger = loggerFactory.CreateLogger<FallbackStorageAdapter>();
    }

    /// <summary>Whether the adapter has fallen back to in-memory storage.</summary>
    public bool IsUsingFallback => _usingFallback;

    public bool IsConnected => _inner.IsConnected;

    public async ValueTask ConnectAsync(CancellationToken ct = default)
    {
        try
        {
            await _inner.ConnectAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Primary storage provider failed to connect. Falling back to in-memory storage.");
            _inner = new InMemoryStorageAdapter(_loggerFactory.CreateLogger<InMemoryStorageAdapter>());
            _usingFallback = true;
            await _inner.ConnectAsync(ct);
        }
    }

    public ValueTask DisconnectAsync(CancellationToken ct = default) => _inner.DisconnectAsync(ct);
    public ValueTask<bool> HealthCheckAsync(CancellationToken ct = default) => _inner.HealthCheckAsync(ct);

    public ValueTask<DocumentState?> GetDocumentAsync(string id, CancellationToken ct = default) => _inner.GetDocumentAsync(id, ct);
    public ValueTask<DocumentState> SaveDocumentAsync(string id, JsonElement state, CancellationToken ct = default) => _inner.SaveDocumentAsync(id, state, ct);
    public ValueTask<DocumentState> UpdateDocumentAsync(string id, JsonElement state, CancellationToken ct = default) => _inner.UpdateDocumentAsync(id, state, ct);
    public ValueTask<bool> DeleteDocumentAsync(string id, CancellationToken ct = default) => _inner.DeleteDocumentAsync(id, ct);
    public ValueTask<IReadOnlyList<DocumentState>> ListDocumentsAsync(int limit = 100, int offset = 0, CancellationToken ct = default) => _inner.ListDocumentsAsync(limit, offset, ct);
    public ValueTask<Dictionary<string, object?>> GetDocumentStateAsync(string documentId, CancellationToken ct = default) => _inner.GetDocumentStateAsync(documentId, ct);

    public ValueTask<Dictionary<string, long>> GetVectorClockAsync(string documentId, CancellationToken ct = default) => _inner.GetVectorClockAsync(documentId, ct);
    public ValueTask UpdateVectorClockAsync(string documentId, string clientId, long clockValue, CancellationToken ct = default) => _inner.UpdateVectorClockAsync(documentId, clientId, clockValue, ct);
    public ValueTask MergeVectorClockAsync(string documentId, Dictionary<string, long> clock, CancellationToken ct = default) => _inner.MergeVectorClockAsync(documentId, clock, ct);

    public ValueTask<DeltaEntry> SaveDeltaAsync(DeltaEntry delta, CancellationToken ct = default) => _inner.SaveDeltaAsync(delta, ct);
    public ValueTask<IReadOnlyList<DeltaEntry>> GetDeltasAsync(string documentId, int limit = 100, CancellationToken ct = default) => _inner.GetDeltasAsync(documentId, limit, ct);
    public ValueTask<IReadOnlyList<DeltaEntry>> GetDeltasSinceAsync(string documentId, long? sinceMaxClock, CancellationToken ct = default) => _inner.GetDeltasSinceAsync(documentId, sinceMaxClock, ct);

    public ValueTask<SessionEntry> SaveSessionAsync(SessionEntry session, CancellationToken ct = default) => _inner.SaveSessionAsync(session, ct);
    public ValueTask UpdateSessionAsync(string sessionId, DateTime lastSeen, Dictionary<string, object>? metadata = null, CancellationToken ct = default) => _inner.UpdateSessionAsync(sessionId, lastSeen, metadata, ct);
    public ValueTask<bool> DeleteSessionAsync(string sessionId, CancellationToken ct = default) => _inner.DeleteSessionAsync(sessionId, ct);
    public ValueTask<IReadOnlyList<SessionEntry>> GetSessionsAsync(string userId, CancellationToken ct = default) => _inner.GetSessionsAsync(userId, ct);

    public ValueTask<CleanupResult> CleanupAsync(CleanupOptions? options = null, CancellationToken ct = default) => _inner.CleanupAsync(options, ct);
    public ValueTask ClearAllAsync(CancellationToken ct = default) => _inner.ClearAllAsync(ct);
}
