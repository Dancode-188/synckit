using System.Text.Json;
using System.Text.Json.Serialization;

namespace SyncKit.Server.Awareness;

/// <summary>
/// Represents the awareness state for a single client.
///
/// Awareness tracks ephemeral information that doesn't persist:
/// - Who's online
/// - Cursor positions
/// - User selections
/// - Custom presence metadata
///
/// This is compatible with the SDK's Awareness class and the TypeScript server's
/// AwarenessClient interface in server/typescript/src/sync/coordinator.ts.
///
/// TypeScript reference (coordinator.ts):
/// <code>
/// export interface AwarenessClient {
///   clientId: string;
///   state: Record&lt;string, unknown&gt; | null;
///   clock: number;
///   lastUpdated: number; // timestamp for stale detection
/// }
/// </code>
/// </summary>
public class AwarenessState
{
    /// <summary>
    /// Unique identifier for the client connection.
    /// </summary>
    [JsonPropertyName("clientId")]
    public required string ClientId { get; init; }

    /// <summary>
    /// The raw state object from the client.
    /// This is kept as a generic JsonElement to match the TypeScript server's
    /// `state: Record&lt;string, unknown&gt; | null` type.
    ///
    /// The state can contain any application-specific data such as:
    /// - user: { name, color, id }
    /// - cursor: { x, y, elementId }
    /// - selection: { start, end }
    /// - Any custom fields the application needs
    ///
    /// Null indicates the client has left/disconnected.
    /// </summary>
    [JsonPropertyName("state")]
    public JsonElement? State { get; set; }

    /// <summary>
    /// Logical clock for this client's awareness state.
    /// Incremented on each state update to track versions.
    /// Used for conflict resolution (higher clock wins).
    /// </summary>
    [JsonPropertyName("clock")]
    public long Clock { get; set; }

    /// <summary>
    /// When this state was last updated (Unix timestamp in milliseconds).
    /// Used for stale client detection and cleanup.
    /// Matches TypeScript server's `lastUpdated: number` type.
    /// </summary>
    [JsonPropertyName("lastUpdated")]
    public long LastUpdated { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    /// <summary>
    /// Create a new awareness state with default values.
    /// </summary>
    public AwarenessState()
    {
    }

    /// <summary>
    /// Create an awareness state from client data.
    /// This is used when receiving updates from clients.
    /// </summary>
    /// <param name="clientId">Client identifier</param>
    /// <param name="state">Raw state from client (null indicates client leaving)</param>
    /// <param name="clock">Logical clock value</param>
    /// <returns>New AwarenessState instance</returns>
    public static AwarenessState Create(string clientId, JsonElement? state, long clock)
    {
        return new AwarenessState
        {
            ClientId = clientId,
            State = state?.Clone(),
            Clock = clock,
            LastUpdated = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };
    }

    /// <summary>
    /// Create a "leave" state indicating the client has disconnected.
    /// State is set to null per the protocol.
    /// </summary>
    /// <param name="clientId">Client identifier</param>
    /// <param name="clock">Logical clock value</param>
    /// <returns>New AwarenessState with null state</returns>
    public static AwarenessState CreateLeaveState(string clientId, long clock)
    {
        return new AwarenessState
        {
            ClientId = clientId,
            State = null,
            Clock = clock,
            LastUpdated = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };
    }

    /// <summary>
    /// Check if this represents a client that has left (state is null).
    /// </summary>
    public bool IsLeaveState => State == null || State.Value.ValueKind == JsonValueKind.Null;

    /// <summary>
    /// Check if this state is stale (hasn't been updated within the timeout).
    /// </summary>
    /// <param name="timeoutMs">Timeout in milliseconds (default: 30000)</param>
    /// <returns>True if the state is stale</returns>
    public bool IsStale(int timeoutMs = 30000)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        return (now - LastUpdated) > timeoutMs;
    }

    /// <summary>
    /// Update this state with new values from a client update.
    /// Only updates if the incoming clock is higher (conflict resolution).
    /// </summary>
    /// <param name="newState">New state from client (null indicates leaving)</param>
    /// <param name="newClock">New clock value</param>
    /// <returns>True if the state was updated, false if rejected due to lower clock</returns>
    public bool TryUpdate(JsonElement? newState, long newClock)
    {
        // Only accept updates with higher clock values
        if (newClock <= Clock)
        {
            return false;
        }

        State = newState?.Clone();
        Clock = newClock;
        LastUpdated = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        return true;
    }

    /// <summary>
    /// Get the LastUpdated timestamp as a DateTime (UTC).
    /// </summary>
    public DateTime GetLastUpdatedDateTime()
    {
        return DateTimeOffset.FromUnixTimeMilliseconds(LastUpdated).UtcDateTime;
    }

    /// <summary>
    /// Helper to extract a string property from the state.
    /// </summary>
    /// <param name="path">Property path (e.g., "user.name")</param>
    /// <returns>String value or null if not found</returns>
    public string? GetStateString(string path)
    {
        if (State == null || State.Value.ValueKind != JsonValueKind.Object)
            return null;

        var parts = path.Split('.');
        var current = State.Value;

        foreach (var part in parts)
        {
            if (current.ValueKind != JsonValueKind.Object)
                return null;
            if (!current.TryGetProperty(part, out current))
                return null;
        }

        return current.ValueKind == JsonValueKind.String ? current.GetString() : null;
    }

    /// <summary>
    /// Helper to get user name from state (common pattern: state.user.name).
    /// </summary>
    public string? UserName => GetStateString("user.name");

    /// <summary>
    /// Helper to get user color from state (common pattern: state.user.color).
    /// </summary>
    public string? UserColor => GetStateString("user.color");

    /// <summary>
    /// Helper to get user ID from state (common pattern: state.user.id).
    /// </summary>
    public string? UserId => GetStateString("user.id");

    public override string ToString()
    {
        var stateDesc = IsLeaveState ? "null (left)" : "present";
        return $"AwarenessState {{ ClientId: {ClientId}, State: {stateDesc}, Clock: {Clock}, LastUpdated: {LastUpdated} }}";
    }
}
