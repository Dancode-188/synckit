using System.Text.Json;
using System.Text.Json.Serialization;

namespace SyncKit.Server.WebSockets.Protocol.Messages;

/// <summary>
/// Payload for delta updates in sync responses.
/// Contains the delta data and its associated vector clock.
/// </summary>
public class DeltaPayload
{
    /// <summary>
    /// The delta data (JSON payload).
    /// </summary>
    [JsonPropertyName("delta")]
    public required JsonElement Delta { get; init; }

    /// <summary>
    /// Vector clock representing the state after this delta.
    /// </summary>
    [JsonPropertyName("vectorClock")]
    public required Dictionary<string, long> VectorClock { get; init; }
}
