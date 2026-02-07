using System.Net.WebSockets;
using System.Text;
using Microsoft.Extensions.Logging;
using Moq;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Protocol;

namespace SyncKit.Server.Tests.WebSockets;

/// <summary>
/// Tests for protocol auto-detection (P2-06).
/// Tests the algorithm that detects JSON vs Binary protocol based on first message.
/// </summary>
public class ProtocolDetectionTests : IDisposable
{
    private readonly Mock<ILogger<Connection>> _mockLogger;
    private readonly Mock<IProtocolHandler> _mockJsonHandler;
    private readonly Mock<IProtocolHandler> _mockBinaryHandler;
    private readonly Mock<WebSocket> _mockWebSocket;

    public ProtocolDetectionTests()
    {
        _mockLogger = new Mock<ILogger<Connection>>();
        _mockJsonHandler = new Mock<IProtocolHandler>();
        _mockBinaryHandler = new Mock<IProtocolHandler>();
        _mockWebSocket = new Mock<WebSocket>();

        // Setup WebSocket mock to be in Open state
        _mockWebSocket.Setup(ws => ws.State).Returns(WebSocketState.Open);
    }

    private Connection CreateConnection()
    {
        return new Connection(
            _mockWebSocket.Object,
            "test-conn-id",
            _mockJsonHandler.Object,
            _mockBinaryHandler.Object,
            _mockLogger.Object
        );
    }

    #region JSON Detection Tests

    [Fact]
    public void DetectProtocol_JsonObjectStart_DetectsJson()
    {
        // Arrange
        var connection = CreateConnection();
        var data = Encoding.UTF8.GetBytes(@"{""type"":""auth""}");

        // Act - trigger protocol detection through message processing
        _mockWebSocket
            .Setup(ws => ws.ReceiveAsync(It.IsAny<ArraySegment<byte>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ArraySegment<byte> buffer, CancellationToken ct) =>
            {
                data.CopyTo(buffer.Array!, 0);
                return new WebSocketReceiveResult(data.Length, WebSocketMessageType.Binary, true);
            });

        _mockJsonHandler
            .Setup(h => h.Parse(It.IsAny<ReadOnlyMemory<byte>>()))
            .Returns((IMessage?)null);

        var cts = new CancellationTokenSource();
        cts.CancelAfter(100); // Cancel after 100ms to exit the loop

        // Act
        _ = connection.ProcessMessagesAsync(cts.Token);
        Thread.Sleep(50); // Give it time to process first message

        // Assert
        Assert.Equal(ProtocolType.Json, connection.Protocol);
    }

    [Fact]
    public void DetectProtocol_JsonArrayStart_DetectsJson()
    {
        // Arrange
        var connection = CreateConnection();
        var data = Encoding.UTF8.GetBytes(@"[{""type"":""auth""}]");

        // Act
        _mockWebSocket
            .Setup(ws => ws.ReceiveAsync(It.IsAny<ArraySegment<byte>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ArraySegment<byte> buffer, CancellationToken ct) =>
            {
                data.CopyTo(buffer.Array!, 0);
                return new WebSocketReceiveResult(data.Length, WebSocketMessageType.Binary, true);
            });

        _mockJsonHandler
            .Setup(h => h.Parse(It.IsAny<ReadOnlyMemory<byte>>()))
            .Returns((IMessage?)null);

        var cts = new CancellationTokenSource();
        cts.CancelAfter(100);

        _ = connection.ProcessMessagesAsync(cts.Token);
        Thread.Sleep(50);

        // Assert
        Assert.Equal(ProtocolType.Json, connection.Protocol);
    }

    [Theory]
    [InlineData(0x20)] // space
    [InlineData(0x09)] // tab
    [InlineData(0x0A)] // newline
    [InlineData(0x0D)] // carriage return
    public void DetectProtocol_WhitespaceBeforeJson_DetectsJson(byte whitespaceByte)
    {
        // Arrange
        var connection = CreateConnection();
        var data = new byte[] { whitespaceByte, 0x7B, 0x7D }; // whitespace + {}

        // Act
        _mockWebSocket
            .Setup(ws => ws.ReceiveAsync(It.IsAny<ArraySegment<byte>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ArraySegment<byte> buffer, CancellationToken ct) =>
            {
                data.CopyTo(buffer.Array!, 0);
                return new WebSocketReceiveResult(data.Length, WebSocketMessageType.Binary, true);
            });

        _mockJsonHandler
            .Setup(h => h.Parse(It.IsAny<ReadOnlyMemory<byte>>()))
            .Returns((IMessage?)null);

        var cts = new CancellationTokenSource();
        cts.CancelAfter(100);

        _ = connection.ProcessMessagesAsync(cts.Token);
        Thread.Sleep(50);

        // Assert
        Assert.Equal(ProtocolType.Json, connection.Protocol);
    }

    #endregion

    #region Binary Detection Tests

    [Theory]
    [InlineData(0x01)] // AUTH
    [InlineData(0x02)] // AUTH_SUCCESS
    [InlineData(0x03)] // AUTH_ERROR
    [InlineData(0x10)] // SUBSCRIBE
    [InlineData(0x11)] // UNSUBSCRIBE
    [InlineData(0x12)] // SYNC_REQUEST
    [InlineData(0x13)] // SYNC_RESPONSE
    // Note: 0x20 (DELTA type code) is excluded because 0x20 = space character,
    // which is a JSON whitespace indicator and takes precedence in detection
    [InlineData(0x21)] // ACK
    [InlineData(0x30)] // PING
    [InlineData(0x31)] // PONG
    [InlineData(0x40)] // AWARENESS_UPDATE
    [InlineData(0x41)] // AWARENESS_SUBSCRIBE
    [InlineData(0x42)] // AWARENESS_STATE
    [InlineData(0xFF)] // ERROR
    public void DetectProtocol_BinaryTypeCode_DetectsBinary(byte typeCode)
    {
        // Note: The protocol detection prioritizes JSON indicators (whitespace, {, [)
        // over binary type codes. This is correct behavior since JSON is text-based
        // and needs these characters to be valid JSON

        // Arrange
        var connection = CreateConnection();
        // Create a minimal binary message: type(1) + timestamp(8) + length(4) + payload
        var data = new byte[13 + 2];
        data[0] = typeCode;
        // timestamp and length bytes = 0
        data[13] = 0x7B; // {
        data[14] = 0x7D; // }

        // Act
        _mockWebSocket
            .Setup(ws => ws.ReceiveAsync(It.IsAny<ArraySegment<byte>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ArraySegment<byte> buffer, CancellationToken ct) =>
            {
                data.CopyTo(buffer.Array!, 0);
                return new WebSocketReceiveResult(data.Length, WebSocketMessageType.Binary, true);
            });

        _mockBinaryHandler
            .Setup(h => h.Parse(It.IsAny<ReadOnlyMemory<byte>>()))
            .Returns((IMessage?)null);

        var cts = new CancellationTokenSource();
        cts.CancelAfter(100);

        _ = connection.ProcessMessagesAsync(cts.Token);
        Thread.Sleep(50);

        // Assert
        Assert.Equal(ProtocolType.Binary, connection.Protocol);
    }

    [Fact]
    public void DetectProtocol_ArbitraryByte_DetectsBinary()
    {
        // Arrange
        var connection = CreateConnection();
        var data = new byte[] { 0xAB, 0xCD, 0xEF }; // Random binary data

        // Act
        _mockWebSocket
            .Setup(ws => ws.ReceiveAsync(It.IsAny<ArraySegment<byte>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ArraySegment<byte> buffer, CancellationToken ct) =>
            {
                data.CopyTo(buffer.Array!, 0);
                return new WebSocketReceiveResult(data.Length, WebSocketMessageType.Binary, true);
            });

        _mockBinaryHandler
            .Setup(h => h.Parse(It.IsAny<ReadOnlyMemory<byte>>()))
            .Returns((IMessage?)null);

        var cts = new CancellationTokenSource();
        cts.CancelAfter(100);

        _ = connection.ProcessMessagesAsync(cts.Token);
        Thread.Sleep(50);

        // Assert
        Assert.Equal(ProtocolType.Binary, connection.Protocol);
    }

    [Fact]
    public void DetectProtocol_DeltaTypeCode0x20_DetectsJson()
    {
        // Special case: 0x20 is DELTA type code in binary protocol,
        // but it's also a space character which is a JSON indicator.
        // JSON detection takes precedence (as per P2-06 specification).
        // This is acceptable because:
        // 1. Binary messages would typically have additional structure that makes them distinguishable
        // 2. The SDK client always sends well-formed binary messages with full header
        // 3. A lone 0x20 byte is more likely to be JSON whitespace than a malformed DELTA

        var connection = CreateConnection();
        var data = new byte[] { 0x20, 0x7B, 0x7D }; // space + {}

        _mockWebSocket
            .Setup(ws => ws.ReceiveAsync(It.IsAny<ArraySegment<byte>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ArraySegment<byte> buffer, CancellationToken ct) =>
            {
                data.CopyTo(buffer.Array!, 0);
                return new WebSocketReceiveResult(data.Length, WebSocketMessageType.Binary, true);
            });

        _mockJsonHandler
            .Setup(h => h.Parse(It.IsAny<ReadOnlyMemory<byte>>()))
            .Returns((IMessage?)null);

        var cts = new CancellationTokenSource();
        cts.CancelAfter(100);

        _ = connection.ProcessMessagesAsync(cts.Token);
        Thread.Sleep(50);

        // Assert - Should detect as JSON (whitespace takes precedence)
        Assert.Equal(ProtocolType.Json, connection.Protocol);
    }

    #endregion

    #region Edge Cases

    [Fact]
    public void DetectProtocol_EmptyMessage_DefaultsToBinary()
    {
        // Arrange
        var connection = CreateConnection();
        var data = Array.Empty<byte>();

        // Act
        _mockWebSocket
            .Setup(ws => ws.ReceiveAsync(It.IsAny<ArraySegment<byte>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ArraySegment<byte> buffer, CancellationToken ct) =>
            {
                return new WebSocketReceiveResult(0, WebSocketMessageType.Binary, true);
            });

        var cts = new CancellationTokenSource();
        cts.CancelAfter(100);

        _ = connection.ProcessMessagesAsync(cts.Token);
        Thread.Sleep(50);

        // Assert
        Assert.Equal(ProtocolType.Binary, connection.Protocol);
    }

    [Fact]
    public void DetectProtocol_OnlyDetectsOnce()
    {
        // Arrange
        var connection = CreateConnection();
        var firstMessage = Encoding.UTF8.GetBytes(@"{""type"":""auth""}");
        var secondMessage = new byte[] { 0x01, 0x02, 0x03 }; // Binary data
        var messageCount = 0;

        _mockWebSocket
            .Setup(ws => ws.ReceiveAsync(It.IsAny<ArraySegment<byte>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ArraySegment<byte> buffer, CancellationToken ct) =>
            {
                messageCount++;
                var data = messageCount == 1 ? firstMessage : secondMessage;
                data.CopyTo(buffer.Array!, 0);
                return new WebSocketReceiveResult(data.Length, WebSocketMessageType.Binary, true);
            });

        _mockJsonHandler
            .Setup(h => h.Parse(It.IsAny<ReadOnlyMemory<byte>>()))
            .Returns((IMessage?)null);

        var cts = new CancellationTokenSource();
        cts.CancelAfter(200); // Long enough for 2 messages

        // Act
        _ = connection.ProcessMessagesAsync(cts.Token);
        Thread.Sleep(150);

        // Assert - Should remain JSON (detected from first message)
        Assert.Equal(ProtocolType.Json, connection.Protocol);
        Assert.True(messageCount >= 2, "Should have processed at least 2 messages");
    }

    #endregion

    #region Detection Logging Tests

    [Fact]
    public void DetectProtocol_LogsDetectionWithFirstByte()
    {
        // Arrange
        var connection = CreateConnection();
        var data = Encoding.UTF8.GetBytes(@"{""type"":""auth""}");

        _mockWebSocket
            .Setup(ws => ws.ReceiveAsync(It.IsAny<ArraySegment<byte>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ArraySegment<byte> buffer, CancellationToken ct) =>
            {
                data.CopyTo(buffer.Array!, 0);
                return new WebSocketReceiveResult(data.Length, WebSocketMessageType.Binary, true);
            });

        _mockJsonHandler
            .Setup(h => h.Parse(It.IsAny<ReadOnlyMemory<byte>>()))
            .Returns((IMessage?)null);

        var cts = new CancellationTokenSource();
        cts.CancelAfter(100);

        // Act
        _ = connection.ProcessMessagesAsync(cts.Token);
        Thread.Sleep(50);

        // Assert - Verify logging occurred
        _mockLogger.Verify(
            x => x.Log(
                LogLevel.Debug,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((v, t) => v.ToString()!.Contains("protocol detected") && v.ToString()!.Contains("0x7B")),
                It.IsAny<Exception>(),
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()
            ),
            Times.Once
        );
    }

    #endregion

    #region TypeScript Compatibility Tests

    [Fact]
    public void DetectProtocol_MatchesTypeScriptBehavior_JsonString()
    {
        // TypeScript: if (typeof data === 'string') -> JSON
        // C#: if first byte is '{', '[', or whitespace -> JSON

        var connection = CreateConnection();
        var data = Encoding.UTF8.GetBytes(@"{""type"":""ping""}");

        _mockWebSocket
            .Setup(ws => ws.ReceiveAsync(It.IsAny<ArraySegment<byte>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ArraySegment<byte> buffer, CancellationToken ct) =>
            {
                data.CopyTo(buffer.Array!, 0);
                return new WebSocketReceiveResult(data.Length, WebSocketMessageType.Binary, true);
            });

        _mockJsonHandler
            .Setup(h => h.Parse(It.IsAny<ReadOnlyMemory<byte>>()))
            .Returns((IMessage?)null);

        var cts = new CancellationTokenSource();
        cts.CancelAfter(100);

        _ = connection.ProcessMessagesAsync(cts.Token);
        Thread.Sleep(50);

        Assert.Equal(ProtocolType.Json, connection.Protocol);
    }

    [Fact]
    public void DetectProtocol_MatchesTypeScriptBehavior_BinaryBuffer()
    {
        // TypeScript: Buffer (not string) -> binary
        // C#: first byte not JSON indicator -> binary

        var connection = CreateConnection();
        var data = new byte[] { 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 }; // PING binary

        _mockWebSocket
            .Setup(ws => ws.ReceiveAsync(It.IsAny<ArraySegment<byte>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ArraySegment<byte> buffer, CancellationToken ct) =>
            {
                data.CopyTo(buffer.Array!, 0);
                return new WebSocketReceiveResult(data.Length, WebSocketMessageType.Binary, true);
            });

        _mockBinaryHandler
            .Setup(h => h.Parse(It.IsAny<ReadOnlyMemory<byte>>()))
            .Returns((IMessage?)null);

        var cts = new CancellationTokenSource();
        cts.CancelAfter(100);

        _ = connection.ProcessMessagesAsync(cts.Token);
        Thread.Sleep(50);

        Assert.Equal(ProtocolType.Binary, connection.Protocol);
    }

    #endregion

    public void Dispose()
    {
        // Cleanup if needed
        GC.SuppressFinalize(this);
    }
}
