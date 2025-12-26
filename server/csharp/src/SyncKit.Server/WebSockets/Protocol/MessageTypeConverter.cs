using System.Text.Json;
using System.Text.Json.Serialization;

namespace SyncKit.Server.WebSockets.Protocol;

/// <summary>
/// Custom JSON converter for MessageType enum that serializes to/from snake_case.
/// Ensures protocol compatibility with TypeScript server.
/// </summary>
public class MessageTypeConverter : JsonConverter<MessageType>
{
    private static readonly SnakeCaseNamingPolicy _namingPolicy = new();

    // Mapping from snake_case string to enum value
    private static readonly Dictionary<string, MessageType> _stringToEnum = new()
    {
        ["connect"] = MessageType.Connect,
        ["disconnect"] = MessageType.Disconnect,
        ["ping"] = MessageType.Ping,
        ["pong"] = MessageType.Pong,
        ["auth"] = MessageType.Auth,
        ["auth_success"] = MessageType.AuthSuccess,
        ["auth_error"] = MessageType.AuthError,
        ["subscribe"] = MessageType.Subscribe,
        ["unsubscribe"] = MessageType.Unsubscribe,
        ["sync_request"] = MessageType.SyncRequest,
        ["sync_response"] = MessageType.SyncResponse,
        ["delta"] = MessageType.Delta,
        ["ack"] = MessageType.Ack,
        ["awareness_update"] = MessageType.AwarenessUpdate,
        ["awareness_subscribe"] = MessageType.AwarenessSubscribe,
        ["awareness_state"] = MessageType.AwarenessState,
        ["error"] = MessageType.Error
    };

    // Mapping from enum value to snake_case string
    private static readonly Dictionary<MessageType, string> _enumToString = new()
    {
        [MessageType.Connect] = "connect",
        [MessageType.Disconnect] = "disconnect",
        [MessageType.Ping] = "ping",
        [MessageType.Pong] = "pong",
        [MessageType.Auth] = "auth",
        [MessageType.AuthSuccess] = "auth_success",
        [MessageType.AuthError] = "auth_error",
        [MessageType.Subscribe] = "subscribe",
        [MessageType.Unsubscribe] = "unsubscribe",
        [MessageType.SyncRequest] = "sync_request",
        [MessageType.SyncResponse] = "sync_response",
        [MessageType.Delta] = "delta",
        [MessageType.Ack] = "ack",
        [MessageType.AwarenessUpdate] = "awareness_update",
        [MessageType.AwarenessSubscribe] = "awareness_subscribe",
        [MessageType.AwarenessState] = "awareness_state",
        [MessageType.Error] = "error"
    };

    public override MessageType Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var value = reader.GetString();

        if (value == null)
        {
            throw new JsonException("MessageType cannot be null");
        }

        if (_stringToEnum.TryGetValue(value, out var messageType))
        {
            return messageType;
        }

        throw new JsonException($"Unknown message type: '{value}'. Expected snake_case values like 'auth_success', 'sync_request', etc.");
    }

    public override void Write(Utf8JsonWriter writer, MessageType value, JsonSerializerOptions options)
    {
        if (_enumToString.TryGetValue(value, out var stringValue))
        {
            writer.WriteStringValue(stringValue);
        }
        else
        {
            // Fallback: convert using naming policy
            var fallbackValue = _namingPolicy.ConvertName(value.ToString());
            writer.WriteStringValue(fallbackValue);
        }
    }
}
