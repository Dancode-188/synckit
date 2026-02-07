using System.Text.Json.Serialization;

namespace SyncKit.Server.WebSockets.Protocol.Messages;

/// <summary>
/// Pong message responding to ping.
/// </summary>
public class PongMessage : BaseMessage
{
    [JsonPropertyName("type")]
    public override MessageType Type => MessageType.Pong;
}
