using System.Text.Json;

namespace SyncKit.Server.Storage;

/// <summary>
/// Storage adapter interface - exact method name alignment with TypeScript.
/// Uses ValueTask for methods that commonly complete synchronously (in-memory storage).
/// </summary>
public interface IStorageAdapter
{
    // === Connection Lifecycle (matches TS) ===
    ValueTask ConnectAsync(CancellationToken ct = default);
    ValueTask DisconnectAsync(CancellationToken ct = default);
    bool IsConnected { get; }
    ValueTask<bool> HealthCheckAsync(CancellationToken ct = default);

    // === Document Operations (matches TS) ===
    ValueTask<DocumentState?> GetDocumentAsync(string id, CancellationToken ct = default);
    ValueTask<DocumentState> SaveDocumentAsync(string id, JsonElement state, CancellationToken ct = default);
    ValueTask<DocumentState> UpdateDocumentAsync(string id, JsonElement state, CancellationToken ct = default);
    ValueTask<bool> DeleteDocumentAsync(string id, CancellationToken ct = default);
    ValueTask<IReadOnlyList<DocumentState>> ListDocumentsAsync(int limit = 100, int offset = 0, CancellationToken ct = default);

    /// <summary>
    /// Get the full document state by applying all deltas.
    /// Returns a dictionary of field name to value mappings.
    /// </summary>
    ValueTask<Dictionary<string, object?>> GetDocumentStateAsync(string documentId, CancellationToken ct = default);

    // === Vector Clock Operations (matches TS) ===
    ValueTask<Dictionary<string, long>> GetVectorClockAsync(string documentId, CancellationToken ct = default);
    ValueTask UpdateVectorClockAsync(string documentId, string clientId, long clockValue, CancellationToken ct = default);
    ValueTask MergeVectorClockAsync(string documentId, Dictionary<string, long> clock, CancellationToken ct = default);

    // === Delta Operations (matches TS) ===
    ValueTask<DeltaEntry> SaveDeltaAsync(DeltaEntry delta, CancellationToken ct = default);
    ValueTask<IReadOnlyList<DeltaEntry>> GetDeltasAsync(string documentId, int limit = 100, CancellationToken ct = default);

    // .NET enhancement: SQL-optimized filtering by max_clock_value
    ValueTask<IReadOnlyList<DeltaEntry>> GetDeltasSinceAsync(string documentId, long? sinceMaxClock, CancellationToken ct = default);

    // === Session Operations (matches TS) ===
    ValueTask<SessionEntry> SaveSessionAsync(SessionEntry session, CancellationToken ct = default);
    ValueTask UpdateSessionAsync(string sessionId, DateTime lastSeen, Dictionary<string, object>? metadata = null, CancellationToken ct = default);
    ValueTask<bool> DeleteSessionAsync(string sessionId, CancellationToken ct = default);
    ValueTask<IReadOnlyList<SessionEntry>> GetSessionsAsync(string userId, CancellationToken ct = default);

    // === Maintenance (matches TS) ===
    ValueTask<CleanupResult> CleanupAsync(CleanupOptions? options = null, CancellationToken ct = default);

    /// <summary>
    /// Clear all storage (test/development mode only).
    /// Used for test isolation between test runs.
    /// </summary>
    ValueTask ClearAllAsync(CancellationToken ct = default);
}
