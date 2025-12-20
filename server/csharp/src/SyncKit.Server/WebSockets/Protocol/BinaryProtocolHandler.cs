using System.Buffers.Binary;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.WebSockets.Protocol;

/// <summary>
/// Binary protocol handler for SDK client compatibility.
/// Implements the binary wire format with big-endian byte order.
///
/// Wire Format:
/// ┌─────────────┬──────────────┬───────────────┬──────────────┐
/// │ Type (1B)   │ Timestamp    │ Payload Len   │ Payload      │
/// │ uint8       │ int64 BE     │ uint32 BE     │ JSON UTF-8   │
/// └─────────────┴──────────────┴───────────────┴──────────────┘
///   Byte 0       Bytes 1-8      Bytes 9-12      Bytes 13+
/// </summary>
public class BinaryProtocolHandler : IProtocolHandler
{
    private readonly ILogger<BinaryProtocolHandler> _logger;
    private const int HeaderSize = 13; // 1 + 8 + 4 bytes
    private static readonly JsonSerializerOptions JsonOptions;

    // Type code to MessageType mapping
    private static readonly Dictionary<MessageTypeCode, MessageType> CodeToType = new()
    {
        { MessageTypeCode.AUTH, MessageType.Auth },
        { MessageTypeCode.AUTH_SUCCESS, MessageType.AuthSuccess },
        { MessageTypeCode.AUTH_ERROR, MessageType.AuthError },
        { MessageTypeCode.SUBSCRIBE, MessageType.Subscribe },
        { MessageTypeCode.UNSUBSCRIBE, MessageType.Unsubscribe },
        { MessageTypeCode.SYNC_REQUEST, MessageType.SyncRequest },
        { MessageTypeCode.SYNC_RESPONSE, MessageType.SyncResponse },
        { MessageTypeCode.DELTA, MessageType.Delta },
        { MessageTypeCode.ACK, MessageType.Ack },
        { MessageTypeCode.PING, MessageType.Ping },
        { MessageTypeCode.PONG, MessageType.Pong },
        { MessageTypeCode.AWARENESS_UPDATE, MessageType.AwarenessUpdate },
        { MessageTypeCode.AWARENESS_SUBSCRIBE, MessageType.AwarenessSubscribe },
        { MessageTypeCode.AWARENESS_STATE, MessageType.AwarenessState },
        { MessageTypeCode.ERROR, MessageType.Error }
    };

    // MessageType to Type code mapping
    private static readonly Dictionary<MessageType, MessageTypeCode> TypeToCode = new()
    {
        { MessageType.Auth, MessageTypeCode.AUTH },
        { MessageType.AuthSuccess, MessageTypeCode.AUTH_SUCCESS },
        { MessageType.AuthError, MessageTypeCode.AUTH_ERROR },
        { MessageType.Subscribe, MessageTypeCode.SUBSCRIBE },
        { MessageType.Unsubscribe, MessageTypeCode.UNSUBSCRIBE },
        { MessageType.SyncRequest, MessageTypeCode.SYNC_REQUEST },
        { MessageType.SyncResponse, MessageTypeCode.SYNC_RESPONSE },
        { MessageType.Delta, MessageTypeCode.DELTA },
        { MessageType.Ack, MessageTypeCode.ACK },
        { MessageType.Ping, MessageTypeCode.PING },
        { MessageType.Pong, MessageTypeCode.PONG },
        { MessageType.AwarenessUpdate, MessageTypeCode.AWARENESS_UPDATE },
        { MessageType.AwarenessSubscribe, MessageTypeCode.AWARENESS_SUBSCRIBE },
        { MessageType.AwarenessState, MessageTypeCode.AWARENESS_STATE },
        { MessageType.Error, MessageTypeCode.ERROR }
    };

    static BinaryProtocolHandler()
    {
        JsonOptions = new JsonSerializerOptions
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

    public BinaryProtocolHandler(ILogger<BinaryProtocolHandler> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <inheritdoc />
    public IMessage? Parse(ReadOnlyMemory<byte> data)
    {
        try
        {
            // Validate minimum size
            if (data.Length < HeaderSize)
            {
                _logger.LogWarning("[Binary] Message too short: {ByteCount} bytes (minimum {MinSize})",
                    data.Length, HeaderSize);
                return null;
            }

            var span = data.Span;

            // Read header (big-endian)
            var typeCode = (MessageTypeCode)span[0];
            var timestamp = BinaryPrimitives.ReadInt64BigEndian(span.Slice(1, 8));
            var payloadLength = BinaryPrimitives.ReadUInt32BigEndian(span.Slice(9, 4));

            _logger.LogTrace("[Binary] Header: TypeCode={TypeCode}, Timestamp={Timestamp}, PayloadLength={PayloadLength}",
                typeCode, timestamp, payloadLength);

            // Validate total length
            if (data.Length < HeaderSize + payloadLength)
            {
                _logger.LogWarning("[Binary] Incomplete message: expected {Expected} bytes, got {Actual}",
                    HeaderSize + payloadLength, data.Length);
                return null;
            }

            // Map type code to MessageType
            if (!CodeToType.TryGetValue(typeCode, out var messageType))
            {
                _logger.LogWarning("[Binary] Unknown type code: 0x{TypeCode:X2}", (byte)typeCode);
                return null;
            }

            // Extract and parse JSON payload
            var payloadBytes = data.Slice(HeaderSize, (int)payloadLength);
            var json = Encoding.UTF8.GetString(payloadBytes.Span);

            _logger.LogTrace("[Binary] Parsing {MessageType} payload: {Json}", messageType, json);

            // Deserialize to specific message type
            IMessage? message = messageType switch
            {
                MessageType.Auth => JsonSerializer.Deserialize<AuthMessage>(json, JsonOptions),
                MessageType.AuthSuccess => JsonSerializer.Deserialize<AuthSuccessMessage>(json, JsonOptions),
                MessageType.AuthError => JsonSerializer.Deserialize<AuthErrorMessage>(json, JsonOptions),
                MessageType.Subscribe => JsonSerializer.Deserialize<SubscribeMessage>(json, JsonOptions),
                MessageType.Unsubscribe => JsonSerializer.Deserialize<UnsubscribeMessage>(json, JsonOptions),
                MessageType.SyncRequest => JsonSerializer.Deserialize<SyncRequestMessage>(json, JsonOptions),
                MessageType.SyncResponse => JsonSerializer.Deserialize<SyncResponseMessage>(json, JsonOptions),
                MessageType.Delta => JsonSerializer.Deserialize<DeltaMessage>(json, JsonOptions),
                MessageType.Ack => JsonSerializer.Deserialize<AckMessage>(json, JsonOptions),
                MessageType.Ping => JsonSerializer.Deserialize<PingMessage>(json, JsonOptions),
                MessageType.Pong => JsonSerializer.Deserialize<PongMessage>(json, JsonOptions),
                MessageType.AwarenessUpdate => JsonSerializer.Deserialize<AwarenessUpdateMessage>(json, JsonOptions),
                MessageType.AwarenessSubscribe => JsonSerializer.Deserialize<AwarenessSubscribeMessage>(json, JsonOptions),
                MessageType.AwarenessState => JsonSerializer.Deserialize<AwarenessStateMessage>(json, JsonOptions),
                MessageType.Error => JsonSerializer.Deserialize<ErrorMessage>(json, JsonOptions),
                _ => null
            };

            if (message == null)
            {
                _logger.LogWarning("[Binary] Failed to deserialize {MessageType} message", messageType);
                return null;
            }

            // Override timestamp from header
            message.Timestamp = timestamp;

            _logger.LogTrace("[Binary] Parsed {MessageType} message with ID {MessageId}", messageType, message.Id);
            return message;
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "[Binary] JSON parsing error");
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Binary] Unexpected error parsing binary message");
            return null;
        }
    }

    /// <inheritdoc />
    public ReadOnlyMemory<byte> Serialize(IMessage message)
    {
        try
        {
            // Get type code
            if (!TypeToCode.TryGetValue(message.Type, out var typeCode))
            {
                _logger.LogError("[Binary] No type code mapping for {MessageType}", message.Type);
                return ReadOnlyMemory<byte>.Empty;
            }

            // Serialize payload as JSON
            var json = JsonSerializer.Serialize(message, message.GetType(), JsonOptions);
            var payloadBytes = Encoding.UTF8.GetBytes(json);

            _logger.LogTrace("[Binary] Serializing {MessageType} (code=0x{TypeCode:X2}): {Json}",
                message.Type, (byte)typeCode, json);

            // Build binary message
            var buffer = new byte[HeaderSize + payloadBytes.Length];
            var span = buffer.AsSpan();

            // Write header (big-endian)
            span[0] = (byte)typeCode;
            BinaryPrimitives.WriteInt64BigEndian(span.Slice(1, 8), message.Timestamp);
            BinaryPrimitives.WriteUInt32BigEndian(span.Slice(9, 4), (uint)payloadBytes.Length);

            // Write payload
            payloadBytes.CopyTo(span.Slice(HeaderSize));

            _logger.LogTrace("[Binary] Serialized to {ByteCount} bytes (header={HeaderSize}, payload={PayloadSize})",
                buffer.Length, HeaderSize, payloadBytes.Length);

            return buffer;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Binary] Failed to serialize message {MessageId} of type {MessageType}",
                message.Id, message.Type);
            return ReadOnlyMemory<byte>.Empty;
        }
    }
}
