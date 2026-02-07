using System.Text.Json.Serialization;

namespace SyncKit.Server.WebSockets.Protocol.Messages;

/// <summary>
/// Connection lifecycle message.
/// </summary>
public class ConnectMessage : BaseMessage
{
    [JsonPropertyName("type")]
    public override MessageType Type => MessageType.Connect;

    [JsonPropertyName("clientId")]
    public required string ClientId { get; set; }

    [JsonPropertyName("version")]
    public required string Version { get; set; }
}
