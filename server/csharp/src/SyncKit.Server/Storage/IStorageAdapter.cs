using System.Text.Json;

namespace SyncKit.Server.Storage;

/// <summary>
/// Storage adapter interface - exact method name alignment with TypeScript.
/// </summary>
public interface IStorageAdapter
{
    // === Connection Lifecycle (matches TS) ===
    Task ConnectAsync(CancellationToken ct = default);
    Task DisconnectAsync(CancellationToken ct = default);
    bool IsConnected { get; }
    Task<bool> HealthCheckAsync(CancellationToken ct = default);

    // === Document Operations (matches TS) ===
    Task<DocumentState?> GetDocumentAsync(string id, CancellationToken ct = default);
    Task<DocumentState> SaveDocumentAsync(string id, JsonElement state, CancellationToken ct = default);
    Task<DocumentState> UpdateDocumentAsync(string id, JsonElement state, CancellationToken ct = default);
    Task<bool> DeleteDocumentAsync(string id, CancellationToken ct = default);
    Task<IReadOnlyList<DocumentState>> ListDocumentsAsync(int limit = 100, int offset = 0, CancellationToken ct = default);

    // === Vector Clock Operations (matches TS) ===
    Task<Dictionary<string, long>> GetVectorClockAsync(string documentId, CancellationToken ct = default);
    Task UpdateVectorClockAsync(string documentId, string clientId, long clockValue, CancellationToken ct = default);
    Task MergeVectorClockAsync(string documentId, Dictionary<string, long> clock, CancellationToken ct = default);

    // === Delta Operations (matches TS) ===
    Task<DeltaEntry> SaveDeltaAsync(DeltaEntry delta, CancellationToken ct = default);
    Task<IReadOnlyList<DeltaEntry>> GetDeltasAsync(string documentId, int limit = 100, CancellationToken ct = default);

    // .NET enhancement: SQL-optimized filtering by max_clock_value
    Task<IReadOnlyList<DeltaEntry>> GetDeltasSinceAsync(string documentId, long? sinceMaxClock, CancellationToken ct = default);

    // === Session Operations (matches TS) ===
    Task<SessionEntry> SaveSessionAsync(SessionEntry session, CancellationToken ct = default);
    Task UpdateSessionAsync(string sessionId, DateTime lastSeen, Dictionary<string, object>? metadata = null, CancellationToken ct = default);
    Task<bool> DeleteSessionAsync(string sessionId, CancellationToken ct = default);
    Task<IReadOnlyList<SessionEntry>> GetSessionsAsync(string userId, CancellationToken ct = default);

    // === Maintenance (matches TS) ===
    Task<CleanupResult> CleanupAsync(CleanupOptions? options = null, CancellationToken ct = default);
}
