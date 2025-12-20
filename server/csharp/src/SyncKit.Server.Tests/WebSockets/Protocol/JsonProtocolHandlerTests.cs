using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Moq;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.Tests.WebSockets.Protocol;

public class JsonProtocolHandlerTests
{
    private readonly JsonProtocolHandler _handler;
    private readonly Mock<ILogger<JsonProtocolHandler>> _mockLogger;

    public JsonProtocolHandlerTests()
    {
        _mockLogger = new Mock<ILogger<JsonProtocolHandler>>();
        _handler = new JsonProtocolHandler(_mockLogger.Object);
    }

    #region Parse Tests

    [Fact]
    public void Parse_ValidAuthMessage_ReturnsAuthMessage()
    {
        // Arrange
        var json = @"{
            ""type"": ""auth"",
            ""id"": ""msg-123"",
            ""timestamp"": 1702900000000,
            ""token"": ""jwt.token.here""
        }";
        var data = Encoding.UTF8.GetBytes(json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.NotNull(result);
        Assert.IsType<AuthMessage>(result);
        var authMsg = (AuthMessage)result;
        Assert.Equal(MessageType.Auth, authMsg.Type);
        Assert.Equal("msg-123", authMsg.Id);
        Assert.Equal(1702900000000, authMsg.Timestamp);
        Assert.Equal("jwt.token.here", authMsg.Token);
    }

    [Fact]
    public void Parse_AuthMessageWithApiKey_ParsesCorrectly()
    {
        // Arrange
        var json = @"{
            ""type"": ""auth"",
            ""id"": ""msg-456"",
            ""timestamp"": 1702900001000,
            ""apiKey"": ""test-api-key""
        }";
        var data = Encoding.UTF8.GetBytes(json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.NotNull(result);
        var authMsg = Assert.IsType<AuthMessage>(result);
        Assert.Equal("test-api-key", authMsg.ApiKey);
    }

    [Fact]
    public void Parse_ValidPingMessage_ReturnsPingMessage()
    {
        // Arrange
        var json = @"{
            ""type"": ""ping"",
            ""id"": ""ping-1"",
            ""timestamp"": 1702900002000
        }";
        var data = Encoding.UTF8.GetBytes(json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.NotNull(result);
        Assert.IsType<PingMessage>(result);
        Assert.Equal(MessageType.Ping, result.Type);
    }

    [Fact]
    public void Parse_ValidDeltaMessage_ReturnsDeltaMessage()
    {
        // Arrange
        var json = @"{
            ""type"": ""delta"",
            ""id"": ""delta-1"",
            ""timestamp"": 1702900003000,
            ""documentId"": ""doc-1"",
            ""delta"": { ""field"": ""value"" },
            ""vectorClock"": { ""client-1"": 5 }
        }";
        var data = Encoding.UTF8.GetBytes(json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.NotNull(result);
        var deltaMsg = Assert.IsType<DeltaMessage>(result);
        Assert.Equal(MessageType.Delta, deltaMsg.Type);
        Assert.Equal("doc-1", deltaMsg.DocumentId);
        Assert.NotNull(deltaMsg.VectorClock);
        Assert.Single(deltaMsg.VectorClock);
        Assert.Equal(5, deltaMsg.VectorClock["client-1"]);
    }

    [Fact]
    public void Parse_SyncRequestWithVectorClock_ParsesCorrectly()
    {
        // Arrange
        var json = @"{
            ""type"": ""sync_request"",
            ""id"": ""sync-1"",
            ""timestamp"": 1702900004000,
            ""documentId"": ""doc-2"",
            ""vectorClock"": { ""client-1"": 3, ""client-2"": 7 }
        }";
        var data = Encoding.UTF8.GetBytes(json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.NotNull(result);
        var syncMsg = Assert.IsType<SyncRequestMessage>(result);
        Assert.Equal(MessageType.SyncRequest, syncMsg.Type);
        Assert.Equal("doc-2", syncMsg.DocumentId);
        Assert.NotNull(syncMsg.VectorClock);
        Assert.Equal(2, syncMsg.VectorClock.Count);
    }

    [Fact]
    public void Parse_AwarenessUpdateMessage_ParsesCorrectly()
    {
        // Arrange
        var json = @"{
            ""type"": ""awareness_update"",
            ""id"": ""awareness-1"",
            ""timestamp"": 1702900005000,
            ""documentId"": ""doc-3"",
            ""clientId"": ""client-1"",
            ""state"": { ""cursor"": { ""x"": 10, ""y"": 20 } },
            ""clock"": 42
        }";
        var data = Encoding.UTF8.GetBytes(json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.NotNull(result);
        var awarenessMsg = Assert.IsType<AwarenessUpdateMessage>(result);
        Assert.Equal(MessageType.AwarenessUpdate, awarenessMsg.Type);
        Assert.Equal("doc-3", awarenessMsg.DocumentId);
        Assert.Equal("client-1", awarenessMsg.ClientId);
        Assert.Equal(42, awarenessMsg.Clock);
        Assert.NotNull(awarenessMsg.State);
    }

    [Fact]
    public void Parse_ErrorMessage_ParsesCorrectly()
    {
        // Arrange
        var json = @"{
            ""type"": ""error"",
            ""id"": ""error-1"",
            ""timestamp"": 1702900006000,
            ""error"": ""Something went wrong"",
            ""details"": { ""code"": 500 }
        }";
        var data = Encoding.UTF8.GetBytes(json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.NotNull(result);
        var errorMsg = Assert.IsType<ErrorMessage>(result);
        Assert.Equal(MessageType.Error, errorMsg.Type);
        Assert.Equal("Something went wrong", errorMsg.Error);
        Assert.NotNull(errorMsg.Details);
    }

    [Fact]
    public void Parse_MalformedJson_ReturnsNull()
    {
        // Arrange
        var json = @"{ invalid json }";
        var data = Encoding.UTF8.GetBytes(json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Parse_MissingTypeProperty_ReturnsNull()
    {
        // Arrange
        var json = @"{
            ""id"": ""msg-1"",
            ""timestamp"": 1702900000000
        }";
        var data = Encoding.UTF8.GetBytes(json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Parse_UnknownMessageType_ReturnsNull()
    {
        // Arrange
        var json = @"{
            ""type"": ""unknown_type"",
            ""id"": ""msg-1"",
            ""timestamp"": 1702900000000
        }";
        var data = Encoding.UTF8.GetBytes(json);

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public void Parse_EmptyData_ReturnsNull()
    {
        // Arrange
        var data = Array.Empty<byte>();

        // Act
        var result = _handler.Parse(data);

        // Assert
        Assert.Null(result);
    }

    #endregion

    #region Serialize Tests

    [Fact]
    public void Serialize_PingMessage_ReturnsValidJson()
    {
        // Arrange
        var message = new PingMessage
        {
            Id = "ping-1",
            Timestamp = 1702900000000
        };

        // Act
        var result = _handler.Serialize(message);
        var json = Encoding.UTF8.GetString(result.Span);
        var parsed = JsonDocument.Parse(json);

        // Assert
        Assert.NotEqual(0, result.Length);
        Assert.Equal("ping", parsed.RootElement.GetProperty("type").GetString());
        Assert.Equal("ping-1", parsed.RootElement.GetProperty("id").GetString());
        Assert.Equal(1702900000000, parsed.RootElement.GetProperty("timestamp").GetInt64());
    }

    [Fact]
    public void Serialize_AuthMessage_UsesSnakeCaseForType()
    {
        // Arrange
        var message = new AuthMessage
        {
            Id = "auth-1",
            Timestamp = 1702900001000,
            Token = "test-token"
        };

        // Act
        var result = _handler.Serialize(message);
        var json = Encoding.UTF8.GetString(result.Span);
        var parsed = JsonDocument.Parse(json);

        // Assert
        Assert.Equal("auth", parsed.RootElement.GetProperty("type").GetString());
        Assert.Equal("test-token", parsed.RootElement.GetProperty("token").GetString());
    }

    [Fact]
    public void Serialize_AuthSuccessMessage_UsesSnakeCaseForType()
    {
        // Arrange
        var message = new AuthSuccessMessage
        {
            Id = "auth-success-1",
            Timestamp = 1702900002000,
            UserId = "user-123",
            Permissions = new Dictionary<string, object> { { "read", true } }
        };

        // Act
        var result = _handler.Serialize(message);
        var json = Encoding.UTF8.GetString(result.Span);
        var parsed = JsonDocument.Parse(json);

        // Assert
        Assert.Equal("auth_success", parsed.RootElement.GetProperty("type").GetString());
        Assert.Equal("user-123", parsed.RootElement.GetProperty("userId").GetString());
    }

    [Fact]
    public void Serialize_DeltaMessage_IncludesAllProperties()
    {
        // Arrange
        var message = new DeltaMessage
        {
            Id = "delta-1",
            Timestamp = 1702900003000,
            DocumentId = "doc-1",
            Delta = new { field = "value" },
            VectorClock = new Dictionary<string, long> { { "client-1", 5 } }
        };

        // Act
        var result = _handler.Serialize(message);
        var json = Encoding.UTF8.GetString(result.Span);
        var parsed = JsonDocument.Parse(json);

        // Assert
        Assert.Equal("delta", parsed.RootElement.GetProperty("type").GetString());
        Assert.Equal("doc-1", parsed.RootElement.GetProperty("documentId").GetString());
        Assert.True(parsed.RootElement.TryGetProperty("delta", out _));
        Assert.True(parsed.RootElement.TryGetProperty("vectorClock", out _));
    }

    [Fact]
    public void Serialize_SyncRequestMessage_UsesCamelCaseProperties()
    {
        // Arrange
        var message = new SyncRequestMessage
        {
            Id = "sync-1",
            Timestamp = 1702900004000,
            DocumentId = "doc-2",
            VectorClock = new Dictionary<string, long> { { "client-1", 3 } }
        };

        // Act
        var result = _handler.Serialize(message);
        var json = Encoding.UTF8.GetString(result.Span);

        // Assert
        Assert.Contains("\"documentId\":", json);
        Assert.Contains("\"vectorClock\":", json);
        Assert.DoesNotContain("\"DocumentId\":", json);
        Assert.DoesNotContain("\"VectorClock\":", json);
    }

    [Fact]
    public void Serialize_AwarenessUpdateMessage_UsesSnakeCaseForType()
    {
        // Arrange
        var message = new AwarenessUpdateMessage
        {
            Id = "awareness-1",
            Timestamp = 1702900005000,
            DocumentId = "doc-3",
            ClientId = "client-1",
            State = new Dictionary<string, object> { { "cursor", new { x = 10, y = 20 } } },
            Clock = 42
        };

        // Act
        var result = _handler.Serialize(message);
        var json = Encoding.UTF8.GetString(result.Span);
        var parsed = JsonDocument.Parse(json);

        // Assert
        Assert.Equal("awareness_update", parsed.RootElement.GetProperty("type").GetString());
        Assert.Equal("doc-3", parsed.RootElement.GetProperty("documentId").GetString());
        Assert.Equal("client-1", parsed.RootElement.GetProperty("clientId").GetString());
        Assert.Equal(42, parsed.RootElement.GetProperty("clock").GetInt64());
    }

    [Fact]
    public void Serialize_MessageWithNullOptionalProperty_OmitsProperty()
    {
        // Arrange
        var message = new AuthMessage
        {
            Id = "auth-1",
            Timestamp = 1702900000000,
            Token = "test-token",
            ApiKey = null
        };

        // Act
        var result = _handler.Serialize(message);
        var json = Encoding.UTF8.GetString(result.Span);

        // Assert
        Assert.DoesNotContain("\"apiKey\":", json);
        Assert.Contains("\"token\":", json);
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
            Timestamp = 1702900000000,
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
            Timestamp = 1702900001000,
            DocumentId = "doc-1",
            Delta = new { field = "value" },
            VectorClock = new Dictionary<string, long> { { "client-1", 5 } }
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
        Assert.Equal(5, result.VectorClock["client-1"]);
    }

    #endregion
}
