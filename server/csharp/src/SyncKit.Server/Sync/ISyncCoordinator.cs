using System.Text.Json;

namespace SyncKit.Server.Sync;

public interface ISyncCoordinator
{
    /// <summary>
    /// Get the authoritative document state (field->value) from coordinator cache or storage.
    /// Loads from storage on first access and caches in-memory for subsequent reads.
    /// </summary>
    Task<Dictionary<string, object?>> GetDocumentStateAsync(string documentId);

    /// <summary>
    /// Apply an incoming delta to the server. Persists the delta asynchronously and
    /// returns the authoritative current document state after applying the change.
    /// </summary>
    Task<Dictionary<string, object?>> ApplyDeltaAsync(
        string documentId,
        JsonElement deltaData,
        Dictionary<string, long> vectorClock,
        long timestampMs,
        string clientId,
        string deltaId);
}
