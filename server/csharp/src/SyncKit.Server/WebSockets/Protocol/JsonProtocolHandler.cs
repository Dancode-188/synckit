using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.WebSockets.Protocol;

/// <summary>
/// JSON protocol handler for test suite compatibility.
/// Parses and serializes messages as JSON text with camelCase properties and snake_case enum values.
/// </summary>
public class JsonProtocolHandler : IProtocolHandler
{
    private readonly ILogger<JsonProtocolHandler> _logger;
    private static readonly JsonSerializerOptions Options;

    static JsonProtocolHandler()
    {
        Options = new JsonSerializerOptions
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

    public JsonProtocolHandler(ILogger<JsonProtocolHandler> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <inheritdoc />
    public IMessage? Parse(ReadOnlyMemory<byte> data)
    {
        try
        {
            var json = Encoding.UTF8.GetString(data.Span);
            _logger.LogTrace("[JSON] Parsing message: {Json}", json);

            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            // Extract message type
            if (!root.TryGetProperty("type", out var typeElement))
            {
                _logger.LogWarning("[JSON] Message missing 'type' property");
                return null;
            }

            var typeStr = typeElement.GetString();
            if (string.IsNullOrEmpty(typeStr))
            {
                _logger.LogWarning("[JSON] Message has empty 'type' property");
                return null;
            }

            // Parse MessageType from snake_case
            var messageType = ParseMessageType(typeStr);
            if (messageType == null)
            {
                _logger.LogWarning("[JSON] Unknown message type: {Type}", typeStr);
                return null;
            }

            // Deserialize to specific message type
            IMessage? message = messageType switch
            {
                MessageType.Connect => JsonSerializer.Deserialize<ConnectMessage>(json, Options),
                MessageType.Ping => JsonSerializer.Deserialize<PingMessage>(json, Options),
                MessageType.Pong => JsonSerializer.Deserialize<PongMessage>(json, Options),
                MessageType.Auth => JsonSerializer.Deserialize<AuthMessage>(json, Options),
                MessageType.AuthSuccess => JsonSerializer.Deserialize<AuthSuccessMessage>(json, Options),
                MessageType.AuthError => JsonSerializer.Deserialize<AuthErrorMessage>(json, Options),
                MessageType.Subscribe => JsonSerializer.Deserialize<SubscribeMessage>(json, Options),
                MessageType.Unsubscribe => JsonSerializer.Deserialize<UnsubscribeMessage>(json, Options),
                MessageType.SyncRequest => JsonSerializer.Deserialize<SyncRequestMessage>(json, Options),
                MessageType.SyncResponse => JsonSerializer.Deserialize<SyncResponseMessage>(json, Options),
                MessageType.Delta => JsonSerializer.Deserialize<DeltaMessage>(json, Options),
                MessageType.Ack => JsonSerializer.Deserialize<AckMessage>(json, Options),
                MessageType.AwarenessUpdate => JsonSerializer.Deserialize<AwarenessUpdateMessage>(json, Options),
                MessageType.AwarenessSubscribe => JsonSerializer.Deserialize<AwarenessSubscribeMessage>(json, Options),
                MessageType.AwarenessState => JsonSerializer.Deserialize<AwarenessStateMessage>(json, Options),
                MessageType.Error => JsonSerializer.Deserialize<ErrorMessage>(json, Options),
                _ => null
            };

            if (message == null)
            {
                _logger.LogWarning("[JSON] Failed to deserialize message type: {Type}", messageType);
                return null;
            }

            _logger.LogTrace("[JSON] Parsed {Type} message with ID {Id}", messageType, message.Id);
            return message;
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "[JSON] Failed to parse JSON message");
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[JSON] Unexpected error parsing message");
            return null;
        }
    }

    /// <inheritdoc />
    public ReadOnlyMemory<byte> Serialize(IMessage message)
    {
        try
        {
            _logger.LogTrace("[JSON] Serializing {Type} message with ID {Id}", message.Type, message.Id);

            var json = JsonSerializer.Serialize(message, message.GetType(), Options);
            var bytes = Encoding.UTF8.GetBytes(json);

            _logger.LogTrace("[JSON] Serialized to {ByteCount} bytes: {Json}", bytes.Length, json);
            return bytes;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[JSON] Failed to serialize message {MessageId} of type {Type}",
                message.Id, message.Type);
            return ReadOnlyMemory<byte>.Empty;
        }
    }

    /// <summary>
    /// Parses a snake_case message type string to MessageType enum.
    /// Handles both snake_case (auth_success) and PascalCase (AuthSuccess).
    /// </summary>
    private MessageType? ParseMessageType(string typeStr)
    {
        // Try direct enum parse first (case-insensitive)
        if (Enum.TryParse<MessageType>(typeStr, ignoreCase: true, out var directResult))
        {
            return directResult;
        }

        // Convert snake_case to PascalCase and try again
        var pascalCase = ConvertSnakeCaseToPascalCase(typeStr);
        if (Enum.TryParse<MessageType>(pascalCase, ignoreCase: false, out var convertedResult))
        {
            return convertedResult;
        }

        return null;
    }

    /// <summary>
    /// Converts snake_case to PascalCase.
    /// Example: auth_success -> AuthSuccess
    /// </summary>
    private string ConvertSnakeCaseToPascalCase(string snakeCase)
    {
        if (string.IsNullOrEmpty(snakeCase))
            return snakeCase;

        var parts = snakeCase.Split('_');
        var builder = new StringBuilder();

        foreach (var part in parts)
        {
            if (part.Length > 0)
            {
                builder.Append(char.ToUpperInvariant(part[0]));
                if (part.Length > 1)
                {
                    builder.Append(part.Substring(1).ToLowerInvariant());
                }
            }
        }

        return builder.ToString();
    }
}

