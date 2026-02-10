using System.Text.Json;
using System.Text.Json.Serialization;

namespace SyncKit.Server.Awareness;

/// <summary>
/// Represents an awareness entry for a client within a specific document.
///
/// This class tracks the association between a client's awareness state
/// and a document, including expiration for automatic cleanup of stale clients.
///
/// Corresponds to the AwarenessDocumentState.clients entries in the TypeScript
/// server's coordinator (server/typescript/src/sync/coordinator.ts).
///
/// TypeScript reference (coordinator.ts):
/// <code>
/// export interface AwarenessDocumentState {
///   documentId: string;
///   clients: Map&lt;string, AwarenessClient&gt;; // clientId -> awareness state
///   subscribers: Set&lt;string&gt;; // Connection IDs subscribed to awareness updates
/// }
/// </code>
/// </summary>
public class AwarenessEntry
{
    /// <summary>
    /// The document this awareness entry belongs to.
    /// </summary>
    [JsonPropertyName("documentId")]
    public required string DocumentId { get; init; }

    /// <summary>
    /// The client this awareness entry belongs to.
    /// </summary>
    [JsonPropertyName("clientId")]
    public required string ClientId { get; init; }

    /// <summary>
    /// The awareness state for this client.
    /// Contains the full AwarenessState including the raw state object.
    /// </summary>
    [JsonPropertyName("state")]
    public required AwarenessState State { get; set; }

    /// <summary>
    /// Logical clock for ordering updates.
    /// This is a copy of State.Clock for quick access.
    /// </summary>
    [JsonPropertyName("clock")]
    public long Clock { get; set; }

    /// <summary>
    /// When this entry expires (Unix timestamp in milliseconds).
    /// Used for automatic cleanup of disconnected clients.
    /// </summary>
    [JsonPropertyName("expiresAt")]
    public long ExpiresAt { get; set; }

    /// <summary>
    /// Default timeout for awareness entries (30 seconds).
    /// Clients that don't update within this time are considered stale.
    /// </summary>
    public static readonly int DefaultTimeoutMs = 30000;

    /// <summary>
    /// Create a new awareness entry with default expiration.
    /// </summary>
    public AwarenessEntry()
    {
        ExpiresAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + DefaultTimeoutMs;
    }

    /// <summary>
    /// Create a new awareness entry for a client in a document.
    /// </summary>
    /// <param name="documentId">Document identifier</param>
    /// <param name="clientId">Client identifier</param>
    /// <param name="state">Raw state from client (null indicates leaving)</param>
    /// <param name="clock">Logical clock value</param>
    /// <param name="timeoutMs">Optional custom timeout in milliseconds (defaults to 30000)</param>
    public static AwarenessEntry Create(
        string documentId,
        string clientId,
        JsonElement? state,
        long clock,
        int? timeoutMs = null)
    {
        var effectiveTimeout = timeoutMs ?? DefaultTimeoutMs;
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        return new AwarenessEntry
        {
            DocumentId = documentId,
            ClientId = clientId,
            State = AwarenessState.Create(clientId, state, clock),
            Clock = clock,
            ExpiresAt = now + effectiveTimeout
        };
    }

    /// <summary>
    /// Create a new awareness entry from an existing AwarenessState.
    /// </summary>
    /// <param name="documentId">Document identifier</param>
    /// <param name="state">Existing awareness state</param>
    /// <param name="timeoutMs">Optional custom timeout in milliseconds (defaults to 30000)</param>
    public static AwarenessEntry FromState(
        string documentId,
        AwarenessState state,
        int? timeoutMs = null)
    {
        var effectiveTimeout = timeoutMs ?? DefaultTimeoutMs;
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        return new AwarenessEntry
        {
            DocumentId = documentId,
            ClientId = state.ClientId,
            State = state,
            Clock = state.Clock,
            ExpiresAt = now + effectiveTimeout
        };
    }

    /// <summary>
    /// Check if this entry has expired.
    /// </summary>
    /// <returns>True if the entry has expired</returns>
    public bool IsExpired()
    {
        // Treat entries that are at-or-after the expiration timestamp as expired.
        return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() >= ExpiresAt;
    }

    /// <summary>
    /// Check if this entry is stale (hasn't been updated within the timeout).
    /// </summary>
    /// <param name="timeoutMs">Timeout in milliseconds</param>
    /// <returns>True if the entry is stale</returns>
    public bool IsStale(int timeoutMs = 30000)
    {
        return State.IsStale(timeoutMs);
    }

    /// <summary>
    /// Refresh the expiration time.
    /// Called when the client sends an update.
    /// </summary>
    /// <param name="timeoutMs">Optional custom timeout in milliseconds</param>
    public void RefreshExpiration(int? timeoutMs = null)
    {
        var effectiveTimeout = timeoutMs ?? DefaultTimeoutMs;
        ExpiresAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + effectiveTimeout;
    }

    /// <summary>
    /// Update the state and refresh expiration.
    /// </summary>
    /// <param name="newState">New raw state from client</param>
    /// <param name="newClock">New clock value</param>
    /// <param name="timeoutMs">Optional custom timeout in milliseconds</param>
    /// <returns>True if updated, false if rejected due to lower clock</returns>
    public bool TryUpdateState(JsonElement? newState, long newClock, int? timeoutMs = null)
    {
        if (!State.TryUpdate(newState, newClock))
        {
            return false;
        }

        Clock = newClock;
        RefreshExpiration(timeoutMs);
        return true;
    }

    /// <summary>
    /// Get the time remaining until expiration in milliseconds.
    /// </summary>
    /// <returns>Time remaining in ms, or 0 if already expired</returns>
    public long TimeUntilExpirationMs()
    {
        var remaining = ExpiresAt - DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        return remaining > 0 ? remaining : 0;
    }

    /// <summary>
    /// Get the ExpiresAt timestamp as a DateTime (UTC).
    /// </summary>
    public DateTime GetExpiresAtDateTime()
    {
        return DateTimeOffset.FromUnixTimeMilliseconds(ExpiresAt).UtcDateTime;
    }

    public override string ToString()
    {
        return $"AwarenessEntry {{ DocumentId: {DocumentId}, ClientId: {ClientId}, Clock: {Clock}, ExpiresAt: {ExpiresAt} }}";
    }
}
