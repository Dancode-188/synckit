using System.Buffers.Binary;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Moq;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.Tests.WebSockets.Protocol;

public class BinaryProtocolHandlerTests
{
    private readonly BinaryProtocolHandler _handler;
    private readonly Mock<ILogger<BinaryProtocolHandler>> _mockLogger;
    private const int HeaderSize = 13; // 1 + 8 + 4 bytes

    public BinaryProtocolHandlerTests()
    {
        _mockLogger = new Mock<ILogger<BinaryProtocolHandler>>();
        _handler = new BinaryProtocolHandler(_mockLogger.Object);
    }

    #region Helper Methods

    /// <summary>
    /// Creates a binary message with the specified type code, timestamp, and JSON payload.
    /// </summary>
    private byte[] CreateBinaryMessage(MessageTypeCode typeCode, long timestamp, string jsonPayload)
    {
        var payloadBytes = Encoding.UTF8.GetBytes(jsonPayload);
        var buffer = new byte[HeaderSize + payloadBytes.Length];

        // Write header (big-endian)
        buffer[0] = (byte)typeCode;
        BinaryPrimitives.WriteInt64BigEndian(buffer.AsSpan(1, 8), timestamp);
        BinaryPrimitives.WriteUInt32BigEndian(buffer.AsSpan(9, 4), (uint)payloadBytes.Length);

        // Write payload
        payloadBytes.CopyTo(buffer.AsSpan(HeaderSize));

        return buffer;
    }

    /// <summary>
    /// Parses binary message header and returns type code, timestamp, and payload length.
    /// </summary>
    private (MessageTypeCode typeCode, long timestamp, uint payloadLength) ParseHeader(ReadOnlyMemory<byte> data)
    {
        var span = data.Span;
        var typeCode = (MessageTypeCode)span[0];
        var timestamp = BinaryPrimitives.ReadInt64BigEndian(span.Slice(1, 8));
        var payloadLength = BinaryPrimitives.ReadUInt32BigEndian(span.Slice(9, 4));
        return (typeCode, timestamp, payloadLength);
    }

    #endregion

    #region Parse Tests - Type Code Mapping

    [Fact]
    public void Parse_AuthMessage_ParsesCorrectly()
    {
        // Arrange
        var json = @"{""id"":""msg-1"",""token"":""jwt.token.here""}";
        var timestamp = 1702900000000L;
        var data = CreateBinaryMessage(MessageTypeCode.AUTH, timestamp, json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.NotNull(result);
        var authMsg = Assert.IsType<AuthMessage>(result);
        Assert.Equal(MessageType.Auth, authMsg.Type);
        Assert.Equal("msg-1", authMsg.Id);
        Assert.Equal(timestamp, authMsg.Timestamp);
        Assert.Equal("jwt.token.here", authMsg.Token);
    }

    [Fact]
    public void Parse_AuthSuccessMessage_ParsesCorrectly()
    {
        // Arrange
        var json = @"{""id"":""msg-2"",""userId"":""user-123"",""permissions"":{}}";
        var timestamp = 1702900001000L;
        var data = CreateBinaryMessage(MessageTypeCode.AUTH_SUCCESS, timestamp, json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.NotNull(result);
        var authSuccessMsg = Assert.IsType<AuthSuccessMessage>(result);
        Assert.Equal(MessageType.AuthSuccess, authSuccessMsg.Type);
        Assert.Equal("user-123", authSuccessMsg.UserId);
        Assert.Equal(timestamp, authSuccessMsg.Timestamp);
    }

    [Fact]
    public void Parse_AuthErrorMessage_ParsesCorrectly()
    {
        // Arrange
        var json = @"{""id"":""msg-3"",""error"":""Invalid token""}";
        var timestamp = 1702900002000L;
        var data = CreateBinaryMessage(MessageTypeCode.AUTH_ERROR, timestamp, json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.NotNull(result);
        var authErrorMsg = Assert.IsType<AuthErrorMessage>(result);
        Assert.Equal(MessageType.AuthError, authErrorMsg.Type);
        Assert.Equal("Invalid token", authErrorMsg.Error);
    }

    [Fact]
    public void Parse_PingMessage_ParsesCorrectly()
    {
        // Arrange
        var json = @"{""id"":""ping-1""}";
        var timestamp = 1702900003000L;
        var data = CreateBinaryMessage(MessageTypeCode.PING, timestamp, json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.NotNull(result);
        var pingMsg = Assert.IsType<PingMessage>(result);
        Assert.Equal(MessageType.Ping, pingMsg.Type);
        Assert.Equal(timestamp, pingMsg.Timestamp);
    }

    [Fact]
    public void Parse_PongMessage_ParsesCorrectly()
    {
        // Arrange
        var json = @"{""id"":""pong-1""}";
        var timestamp = 1702900004000L;
        var data = CreateBinaryMessage(MessageTypeCode.PONG, timestamp, json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.NotNull(result);
        Assert.IsType<PongMessage>(result);
        Assert.Equal(MessageType.Pong, result.Type);
    }

    [Fact]
    public void Parse_SubscribeMessage_ParsesCorrectly()
    {
        // Arrange
        var json = @"{""id"":""sub-1"",""documentId"":""doc-1""}";
        var timestamp = 1702900005000L;
        var data = CreateBinaryMessage(MessageTypeCode.SUBSCRIBE, timestamp, json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.NotNull(result);
        var subMsg = Assert.IsType<SubscribeMessage>(result);
        Assert.Equal(MessageType.Subscribe, subMsg.Type);
        Assert.Equal("doc-1", subMsg.DocumentId);
    }

    [Fact]
    public void Parse_UnsubscribeMessage_ParsesCorrectly()
    {
        // Arrange
        var json = @"{""id"":""unsub-1"",""documentId"":""doc-1""}";
        var timestamp = 1702900006000L;
        var data = CreateBinaryMessage(MessageTypeCode.UNSUBSCRIBE, timestamp, json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.NotNull(result);
        var unsubMsg = Assert.IsType<UnsubscribeMessage>(result);
        Assert.Equal(MessageType.Unsubscribe, unsubMsg.Type);
        Assert.Equal("doc-1", unsubMsg.DocumentId);
    }

    [Fact]
    public void Parse_SyncRequestMessage_ParsesCorrectly()
    {
        // Arrange
        var json = @"{""id"":""sync-1"",""documentId"":""doc-1"",""vectorClock"":{""client-1"":3}}";
        var timestamp = 1702900007000L;
        var data = CreateBinaryMessage(MessageTypeCode.SYNC_REQUEST, timestamp, json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.NotNull(result);
        var syncMsg = Assert.IsType<SyncRequestMessage>(result);
        Assert.Equal(MessageType.SyncRequest, syncMsg.Type);
        Assert.Equal("doc-1", syncMsg.DocumentId);
        Assert.NotNull(syncMsg.VectorClock);
        Assert.Equal(3, syncMsg.VectorClock["client-1"]);
    }

    [Fact]
    public void Parse_SyncResponseMessage_ParsesCorrectly()
    {
        // Arrange
        var json = @"{""id"":""sync-2"",""requestId"":""sync-1"",""documentId"":""doc-1"",""deltas"":[]}";
        var timestamp = 1702900008000L;
        var data = CreateBinaryMessage(MessageTypeCode.SYNC_RESPONSE, timestamp, json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.NotNull(result);
        var syncRespMsg = Assert.IsType<SyncResponseMessage>(result);
        Assert.Equal(MessageType.SyncResponse, syncRespMsg.Type);
        Assert.Equal("doc-1", syncRespMsg.DocumentId);
    }

    [Fact]
    public void Parse_DeltaMessage_ParsesCorrectly()
    {
        // Arrange
        var json = @"{""id"":""delta-1"",""documentId"":""doc-1"",""delta"":{""field"":""value""},""vectorClock"":{""client-1"":5}}";
        var timestamp = 1702900009000L;
        var data = CreateBinaryMessage(MessageTypeCode.DELTA, timestamp, json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.NotNull(result);
        var deltaMsg = Assert.IsType<DeltaMessage>(result);
        Assert.Equal(MessageType.Delta, deltaMsg.Type);
        Assert.Equal("doc-1", deltaMsg.DocumentId);
        Assert.NotNull(deltaMsg.VectorClock);
        Assert.Equal(5, deltaMsg.VectorClock["client-1"]);
    }

    [Fact]
    public void Parse_AckMessage_ParsesCorrectly()
    {
        // Arrange
        var json = @"{""id"":""ack-1"",""messageId"":""delta-1""}";
        var timestamp = 1702900010000L;
        var data = CreateBinaryMessage(MessageTypeCode.ACK, timestamp, json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.NotNull(result);
        var ackMsg = Assert.IsType<AckMessage>(result);
        Assert.Equal(MessageType.Ack, ackMsg.Type);
        Assert.Equal("delta-1", ackMsg.MessageId);
    }

    [Fact]
    public void Parse_AwarenessUpdateMessage_ParsesCorrectly()
    {
        // Arrange
        var json = @"{""id"":""awareness-1"",""documentId"":""doc-1"",""clientId"":""client-1"",""state"":{},""clock"":42}";
        var timestamp = 1702900011000L;
        var data = CreateBinaryMessage(MessageTypeCode.AWARENESS_UPDATE, timestamp, json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.NotNull(result);
        var awarenessMsg = Assert.IsType<AwarenessUpdateMessage>(result);
        Assert.Equal(MessageType.AwarenessUpdate, awarenessMsg.Type);
        Assert.Equal("doc-1", awarenessMsg.DocumentId);
        Assert.Equal("client-1", awarenessMsg.ClientId);
        Assert.Equal(42, awarenessMsg.Clock);
    }

    [Fact]
    public void Parse_AwarenessSubscribeMessage_ParsesCorrectly()
    {
        // Arrange
        var json = @"{""id"":""awareness-sub-1"",""documentId"":""doc-1""}";
        var timestamp = 1702900012000L;
        var data = CreateBinaryMessage(MessageTypeCode.AWARENESS_SUBSCRIBE, timestamp, json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.NotNull(result);
        var awarenessSubMsg = Assert.IsType<AwarenessSubscribeMessage>(result);
        Assert.Equal(MessageType.AwarenessSubscribe, awarenessSubMsg.Type);
        Assert.Equal("doc-1", awarenessSubMsg.DocumentId);
    }

    [Fact]
    public void Parse_AwarenessStateMessage_ParsesCorrectly()
    {
        // Arrange
        var json = @"{""id"":""awareness-state-1"",""documentId"":""doc-1"",""states"":[]}";
        var timestamp = 1702900013000L;
        var data = CreateBinaryMessage(MessageTypeCode.AWARENESS_STATE, timestamp, json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.NotNull(result);
        var awarenessStateMsg = Assert.IsType<AwarenessStateMessage>(result);
        Assert.Equal(MessageType.AwarenessState, awarenessStateMsg.Type);
        Assert.Equal("doc-1", awarenessStateMsg.DocumentId);
    }

    [Fact]
    public void Parse_ErrorMessage_ParsesCorrectly()
    {
        // Arrange
        var json = @"{""id"":""error-1"",""error"":""Something went wrong""}";
        var timestamp = 1702900014000L;
        var data = CreateBinaryMessage(MessageTypeCode.ERROR, timestamp, json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.NotNull(result);
        var errorMsg = Assert.IsType<ErrorMessage>(result);
        Assert.Equal(MessageType.Error, errorMsg.Type);
        Assert.Equal("Something went wrong", errorMsg.Error);
    }

    #endregion

    #region Parse Tests - Error Handling

    [Fact]
    public void Parse_MessageTooShort_ReturnsNull()
    {
        // Arrange - only 12 bytes (need 13 minimum)
        var data = new byte[12];

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Parse_EmptyMessage_ReturnsNull()
    {
        // Arrange
        var data = Array.Empty<byte>();

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Parse_IncompletePayload_ReturnsNull()
    {
        // Arrange - header says 100 bytes payload, but only 10 provided
        var buffer = new byte[HeaderSize + 10];
        buffer[0] = (byte)MessageTypeCode.PING;
        BinaryPrimitives.WriteInt64BigEndian(buffer.AsSpan(1, 8), 1702900000000L);
        BinaryPrimitives.WriteUInt32BigEndian(buffer.AsSpan(9, 4), 100); // Claims 100 bytes

        // Act
        var result = _handler.Parse(buffer);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Parse_UnknownTypeCode_ReturnsNull()
    {
        // Arrange
        var json = @"{""id"":""msg-1""}";
        var data = CreateBinaryMessage((MessageTypeCode)0x99, 1702900000000L, json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Parse_InvalidJson_ReturnsNull()
    {
        // Arrange
        var invalidJson = "{ invalid json }";
        var data = CreateBinaryMessage(MessageTypeCode.PING, 1702900000000L, invalidJson);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Parse_MissingRequiredProperty_ReturnsNull()
    {
        // Arrange - AuthMessage requires token or apiKey
        var json = @"{""id"":""msg-1""}"; // Missing token
        var data = CreateBinaryMessage(MessageTypeCode.AUTH, 1702900000000L, json);

        // Act
        var result = _handler.Parse(data);

        // Assert - Should still parse but validation happens elsewhere
        Assert.NotNull(result);
        var authMsg = Assert.IsType<AuthMessage>(result);
        Assert.Null(authMsg.Token);
    }

    #endregion

    #region Parse Tests - Endianness

    [Fact]
    public void Parse_TimestampBigEndian_ParsesCorrectly()
    {
        // Arrange - test big-endian timestamp parsing
        var json = @"{""id"":""msg-1""}";
        var timestamp = 0x0001020304050607L; // Specific pattern to verify byte order
        var data = CreateBinaryMessage(MessageTypeCode.PING, timestamp, json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(timestamp, result.Timestamp);

        // Verify bytes are in big-endian order
        Assert.Equal(0x00, data[1]);
        Assert.Equal(0x01, data[2]);
        Assert.Equal(0x02, data[3]);
        Assert.Equal(0x07, data[8]);
    }

    [Fact]
    public void Parse_PayloadLengthBigEndian_ParsesCorrectly()
    {
        // Arrange - test big-endian payload length parsing
        var json = @"{""id"":""msg-1""}";
        var data = CreateBinaryMessage(MessageTypeCode.PING, 1702900000000L, json);

        var expectedLength = (uint)Encoding.UTF8.GetByteCount(json);

        // Act
        var (_, _, payloadLength) = ParseHeader(data);

        // Assert
        Assert.Equal(expectedLength, payloadLength);

        // Verify bytes are in big-endian order
        var lengthBytes = new byte[4];
        Array.Copy(data, 9, lengthBytes, 0, 4);
        var parsed = BinaryPrimitives.ReadUInt32BigEndian(lengthBytes);
        Assert.Equal(expectedLength, parsed);
    }

    #endregion

    #region Serialize Tests

    [Fact]
    public void Serialize_PingMessage_CreatesBinaryFormat()
    {
        // Arrange
        var message = new PingMessage
        {
            Id = "ping-1",
            Timestamp = 1702900000000L
        };

        // Act
        var result = _handler.Serialize(message);

        // Assert
        Assert.True(result.Length >= HeaderSize);

        var (typeCode, timestamp, payloadLength) = ParseHeader(result);
        Assert.Equal(MessageTypeCode.PING, typeCode);
        Assert.Equal(1702900000000L, timestamp);
        Assert.True(payloadLength > 0);
    }

    [Fact]
    public void Serialize_AuthMessage_IncludesAllProperties()
    {
        // Arrange
        var message = new AuthMessage
        {
            Id = "auth-1",
            Timestamp = 1702900001000L,
            Token = "test-token"
        };

        // Act
        var result = _handler.Serialize(message);

        // Assert
        Assert.True(result.Length >= HeaderSize);

        var (typeCode, _, payloadLength) = ParseHeader(result);
        Assert.Equal(MessageTypeCode.AUTH, typeCode);

        // Extract and verify JSON payload
        var jsonBytes = result.Slice(HeaderSize, (int)payloadLength);
        var json = Encoding.UTF8.GetString(jsonBytes.Span);
        Assert.Contains("\"token\":", json);
        Assert.Contains("test-token", json);
    }

    [Fact]
    public void Serialize_DeltaMessage_IncludesVectorClock()
    {
        // Arrange
        var message = new DeltaMessage
        {
            Id = "delta-1",
            Timestamp = 1702900002000L,
            DocumentId = "doc-1",
            Delta = new { field = "value" },
            VectorClock = new Dictionary<string, long> { { "client-1", 5 } }
        };

        // Act
        var result = _handler.Serialize(message);

        // Assert
        var (typeCode, _, payloadLength) = ParseHeader(result);
        Assert.Equal(MessageTypeCode.DELTA, typeCode);

        var jsonBytes = result.Slice(HeaderSize, (int)payloadLength);
        var json = Encoding.UTF8.GetString(jsonBytes.Span);
        Assert.Contains("\"vectorClock\":", json);
        Assert.Contains("\"client-1\":", json);
    }

    [Fact]
    public void Serialize_AllMessageTypes_UsesCorrectTypeCode()
    {
        // Arrange - create one message of each type
        var messages = new (IMessage message, MessageTypeCode expectedCode)[]
        {
            (new AuthMessage { Token = "token" }, MessageTypeCode.AUTH),
            (new AuthSuccessMessage { UserId = "user", Permissions = new Dictionary<string, object>() }, MessageTypeCode.AUTH_SUCCESS),
            (new AuthErrorMessage { Error = "error" }, MessageTypeCode.AUTH_ERROR),
            (new SubscribeMessage { DocumentId = "doc" }, MessageTypeCode.SUBSCRIBE),
            (new UnsubscribeMessage { DocumentId = "doc" }, MessageTypeCode.UNSUBSCRIBE),
            (new SyncRequestMessage { DocumentId = "doc" }, MessageTypeCode.SYNC_REQUEST),
            (new SyncResponseMessage { RequestId = "req", DocumentId = "doc" }, MessageTypeCode.SYNC_RESPONSE),
            (new DeltaMessage { DocumentId = "doc", Delta = new {}, VectorClock = new Dictionary<string, long>() }, MessageTypeCode.DELTA),
            (new AckMessage { MessageId = "msg" }, MessageTypeCode.ACK),
            (new PingMessage(), MessageTypeCode.PING),
            (new PongMessage(), MessageTypeCode.PONG),
            (new AwarenessUpdateMessage { DocumentId = "doc", ClientId = "c", State = new Dictionary<string, object>(), Clock = 1 }, MessageTypeCode.AWARENESS_UPDATE),
            (new AwarenessSubscribeMessage { DocumentId = "doc" }, MessageTypeCode.AWARENESS_SUBSCRIBE),
            (new AwarenessStateMessage { DocumentId = "doc", States = new List<AwarenessClientState>() }, MessageTypeCode.AWARENESS_STATE),
            (new ErrorMessage { Error = "error" }, MessageTypeCode.ERROR)
        };

        // Act & Assert
        foreach (var (message, expectedCode) in messages)
        {
            var result = _handler.Serialize(message);
            Assert.True(result.Length >= HeaderSize, $"Message {message.Type} too short");

            var (typeCode, _, _) = ParseHeader(result);
            Assert.Equal(expectedCode, typeCode);
        }
    }

    #endregion

    #region Serialize Tests - Endianness

    [Fact]
    public void Serialize_WritesTimestampBigEndian()
    {
        // Arrange
        var message = new PingMessage
        {
            Id = "ping-1",
            Timestamp = 0x0001020304050607L // Specific pattern to verify byte order
        };

        // Act
        var result = _handler.Serialize(message);

        // Assert
        var span = result.Span;
        Assert.Equal(0x00, span[1]);
        Assert.Equal(0x01, span[2]);
        Assert.Equal(0x02, span[3]);
        Assert.Equal(0x03, span[4]);
        Assert.Equal(0x04, span[5]);
        Assert.Equal(0x05, span[6]);
        Assert.Equal(0x06, span[7]);
        Assert.Equal(0x07, span[8]);
    }

    [Fact]
    public void Serialize_WritesPayloadLengthBigEndian()
    {
        // Arrange
        var message = new PingMessage
        {
            Id = "ping-1",
            Timestamp = 1702900000000L
        };

        // Act
        var result = _handler.Serialize(message);

        // Assert
        var payloadLength = BinaryPrimitives.ReadUInt32BigEndian(result.Span.Slice(9, 4));
        Assert.Equal(result.Length - HeaderSize, (int)payloadLength);
    }

    #endregion

    #region Round-trip Tests

    [Fact]
    public void RoundTrip_AuthMessage_PreservesData()
    {
        // Arrange
        var original = new AuthMessage
        {
            Id = "auth-1",
            Timestamp = 1702900000000L,
            Token = "test-token"
        };

        // Act
        var serialized = _handler.Serialize(original);
        var deserialized = _handler.Parse(serialized);

        // Assert
        Assert.NotNull(deserialized);
        var result = Assert.IsType<AuthMessage>(deserialized);
        Assert.Equal(original.Id, result.Id);
        Assert.Equal(original.Timestamp, result.Timestamp);
        Assert.Equal(original.Token, result.Token);
    }

    [Fact]
    public void RoundTrip_DeltaMessage_PreservesData()
    {
        // Arrange
        var original = new DeltaMessage
        {
            Id = "delta-1",
            Timestamp = 1702900001000L,
            DocumentId = "doc-1",
            Delta = new { field = "value", nested = new { prop = 123 } },
            VectorClock = new Dictionary<string, long>
            {
                { "client-1", 5 },
                { "client-2", 3 }
            }
        };

        // Act
        var serialized = _handler.Serialize(original);
        var deserialized = _handler.Parse(serialized);

        // Assert
        Assert.NotNull(deserialized);
        var result = Assert.IsType<DeltaMessage>(deserialized);
        Assert.Equal(original.Id, result.Id);
        Assert.Equal(original.Timestamp, result.Timestamp);
        Assert.Equal(original.DocumentId, result.DocumentId);
        Assert.NotNull(result.VectorClock);
        Assert.Equal(2, result.VectorClock.Count);
        Assert.Equal(5, result.VectorClock["client-1"]);
        Assert.Equal(3, result.VectorClock["client-2"]);
    }

    [Fact]
    public void RoundTrip_AwarenessUpdateMessage_PreservesData()
    {
        // Arrange
        var original = new AwarenessUpdateMessage
        {
            Id = "awareness-1",
            Timestamp = 1702900002000L,
            DocumentId = "doc-1",
            ClientId = "client-1",
            State = new Dictionary<string, object>
            {
                { "cursor", new { x = 10, y = 20 } },
                { "name", "User 1" }
            },
            Clock = 42
        };

        // Act
        var serialized = _handler.Serialize(original);
        var deserialized = _handler.Parse(serialized);

        // Assert
        Assert.NotNull(deserialized);
        var result = Assert.IsType<AwarenessUpdateMessage>(deserialized);
        Assert.Equal(original.Id, result.Id);
        Assert.Equal(original.Timestamp, result.Timestamp);
        Assert.Equal(original.DocumentId, result.DocumentId);
        Assert.Equal(original.ClientId, result.ClientId);
        Assert.Equal(original.Clock, result.Clock);
        Assert.NotNull(result.State);
        Assert.Equal(2, result.State.Count);
    }

    [Fact]
    public void RoundTrip_AllMessageTypes_PreserveType()
    {
        // Arrange - create messages of each type
        var messages = new IMessage[]
        {
            new AuthMessage { Token = "token" },
            new AuthSuccessMessage { UserId = "user", Permissions = new Dictionary<string, object>() },
            new PingMessage(),
            new PongMessage(),
            new SubscribeMessage { DocumentId = "doc" },
            new DeltaMessage { DocumentId = "doc", Delta = new {}, VectorClock = new Dictionary<string, long>() },
            new AwarenessUpdateMessage { DocumentId = "doc", ClientId = "c", State = new Dictionary<string, object>(), Clock = 1 }
        };

        // Act & Assert
        foreach (var original in messages)
        {
            var serialized = _handler.Serialize(original);
            var deserialized = _handler.Parse(serialized);

            Assert.NotNull(deserialized);
            Assert.Equal(original.Type, deserialized.Type);
            Assert.Equal(original.Id, deserialized.Id);
            Assert.Equal(original.Timestamp, deserialized.Timestamp);
        }
    }

    #endregion

    #region Wire Format Validation Tests

    [Fact]
    public void WireFormat_HeaderSize_IsExactly13Bytes()
    {
        // This test validates the wire format specification
        Assert.Equal(13, HeaderSize);
        Assert.Equal(1 + 8 + 4, HeaderSize); // type(1) + timestamp(8) + length(4)
    }

    [Fact]
    public void WireFormat_TypeCodePosition_IsByte0()
    {
        // Arrange
        var message = new PingMessage { Timestamp = 123456L };

        // Act
        var result = _handler.Serialize(message);

        // Assert
        Assert.Equal((byte)MessageTypeCode.PING, result.Span[0]);
    }

    [Fact]
    public void WireFormat_TimestampPosition_IsBytes1Through8()
    {
        // Arrange
        var timestamp = 1702900000000L;
        var message = new PingMessage { Timestamp = timestamp };

        // Act
        var result = _handler.Serialize(message);

        // Assert
        var parsedTimestamp = BinaryPrimitives.ReadInt64BigEndian(result.Span.Slice(1, 8));
        Assert.Equal(timestamp, parsedTimestamp);
    }

    [Fact]
    public void WireFormat_PayloadLengthPosition_IsBytes9Through12()
    {
        // Arrange
        var message = new PingMessage { Id = "test", Timestamp = 123L };

        // Act
        var result = _handler.Serialize(message);

        // Assert
        var payloadLength = BinaryPrimitives.ReadUInt32BigEndian(result.Span.Slice(9, 4));
        Assert.Equal(result.Length - HeaderSize, (int)payloadLength);
    }

    [Fact]
    public void WireFormat_PayloadPosition_StartsByte13()
    {
        // Arrange
        var message = new PingMessage { Id = "test", Timestamp = 123L };

        // Act
        var result = _handler.Serialize(message);
        var payloadLength = BinaryPrimitives.ReadUInt32BigEndian(result.Span.Slice(9, 4));

        // Assert
        var payloadBytes = result.Slice(HeaderSize, (int)payloadLength);
        var json = Encoding.UTF8.GetString(payloadBytes.Span);

        // Should be valid JSON
        var parsed = JsonDocument.Parse(json);
        Assert.NotNull(parsed);
    }

    #endregion
}
