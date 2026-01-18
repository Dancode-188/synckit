using System.Text.Json;
using System.Text.Json.Serialization;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.WebSockets.Protocol;

/// <summary>
/// JSON source generator context for compile-time serialization.
/// Eliminates reflection overhead in hot paths for better performance.
/// </summary>
[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    WriteIndented = false)]
[JsonSerializable(typeof(ConnectMessage))]
[JsonSerializable(typeof(PingMessage))]
[JsonSerializable(typeof(PongMessage))]
[JsonSerializable(typeof(AuthMessage))]
[JsonSerializable(typeof(AuthSuccessMessage))]
[JsonSerializable(typeof(AuthErrorMessage))]
[JsonSerializable(typeof(SubscribeMessage))]
[JsonSerializable(typeof(UnsubscribeMessage))]
[JsonSerializable(typeof(SyncRequestMessage))]
[JsonSerializable(typeof(SyncResponseMessage))]
[JsonSerializable(typeof(DeltaMessage))]
[JsonSerializable(typeof(AckMessage))]
[JsonSerializable(typeof(AwarenessUpdateMessage))]
[JsonSerializable(typeof(AwarenessSubscribeMessage))]
[JsonSerializable(typeof(AwarenessStateMessage))]
[JsonSerializable(typeof(ErrorMessage))]
[JsonSerializable(typeof(DeltaPayload))]
[JsonSerializable(typeof(AwarenessClientState))]
[JsonSerializable(typeof(Dictionary<string, long>))]
[JsonSerializable(typeof(Dictionary<string, object>))]
[JsonSerializable(typeof(List<DeltaPayload>))]
[JsonSerializable(typeof(List<AwarenessClientState>))]
[JsonSerializable(typeof(JsonElement))]
public partial class SyncKitJsonContext : JsonSerializerContext
{
}

/// <summary>
/// Provides pre-configured JsonSerializerOptions using source generators.
/// Use these options in hot paths for maximum serialization performance.
/// </summary>
public static class SyncKitJsonOptions
{
    /// <summary>
    /// Gets the source-generated serializer options.
    /// These options use compile-time generated serializers for all protocol messages.
    /// </summary>
    public static JsonSerializerOptions SourceGenOptions { get; }

    /// <summary>
    /// Gets the runtime options with reflection (fallback for complex scenarios).
    /// </summary>
    public static JsonSerializerOptions RuntimeOptions { get; }

    static SyncKitJsonOptions()
    {
        // Source-generated options (no reflection)
        SourceGenOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
            TypeInfoResolver = SyncKitJsonContext.Default
        };

        // Runtime options with custom converters (fallback)
        RuntimeOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
            Converters =
            {
                new JsonStringEnumConverter(new SnakeCaseNamingPolicy())
            }
        };
    }

    /// <summary>
    /// Gets the type info for a specific message type from source-generated context.
    /// Returns null if the type is not registered.
    /// </summary>
    public static System.Text.Json.Serialization.Metadata.JsonTypeInfo? GetTypeInfo(Type type)
    {
        return SyncKitJsonContext.Default.GetTypeInfo(type);
    }
}
