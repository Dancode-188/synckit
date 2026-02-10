using System.Text.Json;
using SyncKit.Server.WebSockets.Protocol;
using Xunit;

namespace SyncKit.Server.Tests.WebSockets.Protocol;

/// <summary>
/// Tests for MessageType enum serialization to ensure snake_case compatibility with TypeScript server.
/// </summary>
public class MessageTypeConverterTests
{
    private readonly JsonSerializerOptions _options = new();

    [Theory]
    [InlineData(MessageType.Connect, "\"connect\"")]
    [InlineData(MessageType.Disconnect, "\"disconnect\"")]
    [InlineData(MessageType.Ping, "\"ping\"")]
    [InlineData(MessageType.Pong, "\"pong\"")]
    [InlineData(MessageType.Auth, "\"auth\"")]
    [InlineData(MessageType.AuthSuccess, "\"auth_success\"")]
    [InlineData(MessageType.AuthError, "\"auth_error\"")]
    [InlineData(MessageType.Subscribe, "\"subscribe\"")]
    [InlineData(MessageType.Unsubscribe, "\"unsubscribe\"")]
    [InlineData(MessageType.SyncRequest, "\"sync_request\"")]
    [InlineData(MessageType.SyncResponse, "\"sync_response\"")]
    [InlineData(MessageType.Delta, "\"delta\"")]
    [InlineData(MessageType.Ack, "\"ack\"")]
    [InlineData(MessageType.AwarenessUpdate, "\"awareness_update\"")]
    [InlineData(MessageType.AwarenessSubscribe, "\"awareness_subscribe\"")]
    [InlineData(MessageType.AwarenessState, "\"awareness_state\"")]
    [InlineData(MessageType.Error, "\"error\"")]
    public void Serialize_MessageType_ProducesSnakeCase(MessageType messageType, string expectedJson)
    {
        // Act
        var json = JsonSerializer.Serialize(messageType, _options);

        // Assert
        Assert.Equal(expectedJson, json);
    }

    [Theory]
    [InlineData("\"connect\"", MessageType.Connect)]
    [InlineData("\"disconnect\"", MessageType.Disconnect)]
    [InlineData("\"ping\"", MessageType.Ping)]
    [InlineData("\"pong\"", MessageType.Pong)]
    [InlineData("\"auth\"", MessageType.Auth)]
    [InlineData("\"auth_success\"", MessageType.AuthSuccess)]
    [InlineData("\"auth_error\"", MessageType.AuthError)]
    [InlineData("\"subscribe\"", MessageType.Subscribe)]
    [InlineData("\"unsubscribe\"", MessageType.Unsubscribe)]
    [InlineData("\"sync_request\"", MessageType.SyncRequest)]
    [InlineData("\"sync_response\"", MessageType.SyncResponse)]
    [InlineData("\"delta\"", MessageType.Delta)]
    [InlineData("\"ack\"", MessageType.Ack)]
    [InlineData("\"awareness_update\"", MessageType.AwarenessUpdate)]
    [InlineData("\"awareness_subscribe\"", MessageType.AwarenessSubscribe)]
    [InlineData("\"awareness_state\"", MessageType.AwarenessState)]
    [InlineData("\"error\"", MessageType.Error)]
    public void Deserialize_SnakeCaseString_ProducesMessageType(string json, MessageType expectedType)
    {
        // Act
        var messageType = JsonSerializer.Deserialize<MessageType>(json, _options);

        // Assert
        Assert.Equal(expectedType, messageType);
    }

    [Fact]
    public void Deserialize_UnknownValue_ThrowsJsonException()
    {
        // Arrange
        var json = "\"unknown_message_type\"";

        // Act & Assert
        var exception = Assert.Throws<JsonException>(() =>
            JsonSerializer.Deserialize<MessageType>(json, _options));

        Assert.Contains("Unknown message type", exception.Message);
        Assert.Contains("unknown_message_type", exception.Message);
    }

    [Fact]
    public void Deserialize_NullValue_ThrowsJsonException()
    {
        // Arrange
        var json = "null";

        // Act & Assert
        var exception = Assert.Throws<JsonException>(() =>
            JsonSerializer.Deserialize<MessageType>(json, _options));

        Assert.Contains("MessageType cannot be null", exception.Message);
    }

    [Fact]
    public void Serialize_DoesNotProducePascalCase()
    {
        // Arrange - these are the problematic cases from DISPARITY-001
        var testCases = new[]
        {
            (MessageType.AuthSuccess, "AuthSuccess"),
            (MessageType.AuthError, "AuthError"),
            (MessageType.SyncRequest, "SyncRequest"),
            (MessageType.SyncResponse, "SyncResponse"),
            (MessageType.AwarenessUpdate, "AwarenessUpdate"),
            (MessageType.AwarenessSubscribe, "AwarenessSubscribe"),
            (MessageType.AwarenessState, "AwarenessState")
        };

        foreach (var (messageType, wrongValue) in testCases)
        {
            // Act
            var json = JsonSerializer.Serialize(messageType, _options);

            // Assert - should NOT contain PascalCase
            Assert.DoesNotContain(wrongValue, json);
        }
    }

    [Fact]
    public void RoundTrip_AllMessageTypes_PreservesValues()
    {
        // Arrange
        var allTypes = Enum.GetValues<MessageType>();

        foreach (var messageType in allTypes)
        {
            // Act
            var json = JsonSerializer.Serialize(messageType, _options);
            var deserialized = JsonSerializer.Deserialize<MessageType>(json, _options);

            // Assert
            Assert.Equal(messageType, deserialized);
        }
    }
}
