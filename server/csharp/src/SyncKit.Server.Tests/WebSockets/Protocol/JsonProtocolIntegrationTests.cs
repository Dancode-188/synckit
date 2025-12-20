using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Moq;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.Tests.WebSockets.Protocol;

/// <summary>
/// Integration tests verifying JSON protocol compatibility with TypeScript implementation.
/// </summary>
public class JsonProtocolIntegrationTests
{
    private readonly JsonProtocolHandler _handler;

    public JsonProtocolIntegrationTests()
    {
        var mockLogger = new Mock<ILogger<JsonProtocolHandler>>();
        _handler = new JsonProtocolHandler(mockLogger.Object);
    }

    [Fact]
    public void TypeScriptCompatibility_AuthMessage_MatchesExpectedFormat()
    {
        // This is the exact format the TypeScript tests send
        var tsJson = @"{
  ""type"": ""auth"",
  ""id"": ""msg-123"",
  ""timestamp"": 1702900000000,
  ""token"": ""jwt.token.here""
}";
        var data = Encoding.UTF8.GetBytes(tsJson);

        // Parse TypeScript JSON
        var parsed = _handler.Parse(data);
        Assert.NotNull(parsed);
        var authMsg = Assert.IsType<AuthMessage>(parsed);

        // Serialize back and verify format
        var serialized = _handler.Serialize(authMsg);
        var serializedJson = Encoding.UTF8.GetString(serialized.Span);
        var doc = JsonDocument.Parse(serializedJson);

        // Verify exact field names
        Assert.True(doc.RootElement.TryGetProperty("type", out var type));
        Assert.Equal("auth", type.GetString());
        Assert.True(doc.RootElement.TryGetProperty("id", out _));
        Assert.True(doc.RootElement.TryGetProperty("timestamp", out _));
        Assert.True(doc.RootElement.TryGetProperty("token", out _));
    }

    [Fact]
    public void TypeScriptCompatibility_DeltaMessage_MatchesExpectedFormat()
    {
        // This is the exact format the TypeScript tests send
        var tsJson = @"{
  ""type"": ""delta"",
  ""id"": ""msg-456"",
  ""timestamp"": 1702900001000,
  ""documentId"": ""doc-1"",
  ""delta"": { ""field"": ""value"" },
  ""vectorClock"": { ""client-1"": 5 }
}";
        var data = Encoding.UTF8.GetBytes(tsJson);

        // Parse TypeScript JSON
        var parsed = _handler.Parse(data);
        Assert.NotNull(parsed);
        var deltaMsg = Assert.IsType<DeltaMessage>(parsed);
        Assert.Equal("doc-1", deltaMsg.DocumentId);
        Assert.NotNull(deltaMsg.VectorClock);
        Assert.Single(deltaMsg.VectorClock);

        // Serialize back and verify format
        var serialized = _handler.Serialize(deltaMsg);
        var serializedJson = Encoding.UTF8.GetString(serialized.Span);
        var doc = JsonDocument.Parse(serializedJson);

        // Verify exact field names (camelCase)
        Assert.True(doc.RootElement.TryGetProperty("type", out var type));
        Assert.Equal("delta", type.GetString());
        Assert.True(doc.RootElement.TryGetProperty("documentId", out _));
        Assert.True(doc.RootElement.TryGetProperty("vectorClock", out _));
    }

    [Fact]
    public void TypeScriptCompatibility_MessageTypeEnums_UseSnakeCase()
    {
        var testCases = new[]
        {
            (MessageType.Auth, "auth"),
            (MessageType.AuthSuccess, "auth_success"),
            (MessageType.AuthError, "auth_error"),
            (MessageType.SyncRequest, "sync_request"),
            (MessageType.SyncResponse, "sync_response"),
            (MessageType.AwarenessUpdate, "awareness_update"),
            (MessageType.AwarenessSubscribe, "awareness_subscribe"),
            (MessageType.AwarenessState, "awareness_state")
        };

        foreach (var (messageType, expectedString) in testCases)
        {
            // Create a message of the appropriate type
            IMessage message = messageType switch
            {
                MessageType.Auth => new AuthMessage { Id = "test", Timestamp = 0 },
                MessageType.AuthSuccess => new AuthSuccessMessage
                {
                    Id = "test",
                    Timestamp = 0,
                    UserId = "user-1",
                    Permissions = new Dictionary<string, object>()
                },
                MessageType.AuthError => new AuthErrorMessage
                {
                    Id = "test",
                    Timestamp = 0,
                    Error = "error"
                },
                MessageType.SyncRequest => new SyncRequestMessage
                {
                    Id = "test",
                    Timestamp = 0,
                    DocumentId = "doc-1"
                },
                MessageType.SyncResponse => new SyncResponseMessage
                {
                    Id = "test",
                    Timestamp = 0,
                    RequestId = "req-1",
                    DocumentId = "doc-1"
                },
                MessageType.AwarenessUpdate => new AwarenessUpdateMessage
                {
                    Id = "test",
                    Timestamp = 0,
                    DocumentId = "doc-1",
                    ClientId = "client-1",
                    Clock = 0
                },
                MessageType.AwarenessSubscribe => new AwarenessSubscribeMessage
                {
                    Id = "test",
                    Timestamp = 0,
                    DocumentId = "doc-1"
                },
                MessageType.AwarenessState => new AwarenessStateMessage
                {
                    Id = "test",
                    Timestamp = 0,
                    DocumentId = "doc-1",
                    States = new List<AwarenessClientState>()
                },
                _ => throw new NotImplementedException()
            };

            // Serialize and verify type string
            var serialized = _handler.Serialize(message);
            var json = Encoding.UTF8.GetString(serialized.Span);
            var doc = JsonDocument.Parse(json);

            Assert.True(doc.RootElement.TryGetProperty("type", out var type));
            Assert.Equal(expectedString, type.GetString());
        }
    }

    [Fact]
    public void TypeScriptCompatibility_PropertiesUseCamelCase()
    {
        var message = new SyncRequestMessage
        {
            Id = "sync-1",
            Timestamp = 1702900000000,
            DocumentId = "doc-1",
            VectorClock = new Dictionary<string, long> { { "client-1", 5 } }
        };

        var serialized = _handler.Serialize(message);
        var json = Encoding.UTF8.GetString(serialized.Span);

        // Verify camelCase is used (not PascalCase or snake_case)
        Assert.Contains("\"documentId\"", json);
        Assert.Contains("\"vectorClock\"", json);
        Assert.DoesNotContain("\"DocumentId\"", json);
        Assert.DoesNotContain("\"document_id\"", json);
        Assert.DoesNotContain("\"VectorClock\"", json);
        Assert.DoesNotContain("\"vector_clock\"", json);
    }

    [Fact]
    public void TypeScriptCompatibility_ParsesCamelCase()
    {
        // TypeScript sends camelCase properties
        var camelCaseJson = @"{""type"": ""sync_request"", ""id"": ""1"", ""timestamp"": 0, ""documentId"": ""doc-1""}";

        // Should parse successfully
        var parsed = _handler.Parse(Encoding.UTF8.GetBytes(camelCaseJson));
        Assert.NotNull(parsed);
        var syncMsg = Assert.IsType<SyncRequestMessage>(parsed);
        Assert.Equal("doc-1", syncMsg.DocumentId);
    }
}
