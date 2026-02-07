using System.Text.Json.Serialization;

namespace SyncKit.Server.WebSockets.Protocol.Messages;

/// <summary>
/// Ping message for connection keep-alive.
/// </summary>
public class PingMessage : BaseMessage
{
    [JsonPropertyName("type")]
    public override MessageType Type => MessageType.Ping;
}
