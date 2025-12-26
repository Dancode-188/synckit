using Microsoft.Extensions.Logging;
using Moq;
using SyncKit.Server.Auth;
using SyncKit.Server.Awareness;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Handlers;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.Tests.WebSockets.Handlers;

/// <summary>
/// Tests for AwarenessSubscribeMessageHandler - subscribing to awareness updates.
/// </summary>
public class AwarenessSubscribeMessageHandlerTests
{
    private readonly AuthGuard _authGuard;
    private readonly Mock<IConnection> _mockConnection;
    private readonly Mock<ILogger<AwarenessSubscribeMessageHandler>> _mockLogger;
    private readonly Mock<IAwarenessStore> _mockAwarenessStore;
    private readonly AwarenessSubscribeMessageHandler _handler;

    public AwarenessSubscribeMessageHandlerTests()
    {
        _authGuard = new AuthGuard(new Mock<ILogger<AuthGuard>>().Object);
        _mockConnection = new Mock<IConnection>();
        _mockLogger = new Mock<ILogger<AwarenessSubscribeMessageHandler>>();
        _mockAwarenessStore = new Mock<IAwarenessStore>();
        _handler = new AwarenessSubscribeMessageHandler(
            _authGuard,
            _mockAwarenessStore.Object,
            _mockLogger.Object);
    }

    [Fact]
    public void HandledTypes_ShouldReturnAwarenessSubscribe()
    {
        // Arrange & Act
        var types = _handler.HandledTypes;

        // Assert
        Assert.Single(types);
        Assert.Equal(MessageType.AwarenessSubscribe, types[0]);
    }

    [Fact]
    public async Task HandleAsync_WithAuthenticatedConnection_ShouldAccept()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";

        SetupAuthenticatedConnection(connectionId, "user-1");

        // Default store returns empty
        _mockAwarenessStore.Setup(s => s.GetAllAsync(documentId)).ReturnsAsync(Array.Empty<AwarenessEntry>());
        _mockConnection.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);

        var message = new AwarenessSubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        // Act & Assert - Should not throw and should send an AwarenessState message
        await _handler.HandleAsync(_mockConnection.Object, message);

        _mockConnection.Verify(c => c.Send(It.Is<AwarenessStateMessage>(m => m.DocumentId == documentId && m.States.Count == 0)), Times.Once);
    }

    [Fact]
    public async Task HandleAsync_WithoutAuthentication_ShouldReject()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";

        _mockConnection.Setup(c => c.Id).Returns(connectionId);
        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticating);
        _mockConnection.Setup(c => c.TokenPayload).Returns((TokenPayload?)null);

        var message = new AwarenessSubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        // Act
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert - Handler should log rejection
        _mockLogger.Verify(
            l => l.Log(
                LogLevel.Debug,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((o, t) => o.ToString()!.Contains("rejected")),
                null,
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.Once);
    }

    [Fact]
    public async Task HandleAsync_WithWrongMessageType_ShouldLogWarningAndReturn()
    {
        // Arrange
        var wrongMessage = new SubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = "doc-123"
        };

        // Act
        await _handler.HandleAsync(_mockConnection.Object, wrongMessage);

        // Assert - Should log warning about wrong message type
        _mockLogger.Verify(
            l => l.Log(
                LogLevel.Warning,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((o, t) => o.ToString()!.Contains("non-awareness-subscribe")),
                null,
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.Once);
    }

    [Fact]
    public async Task HandleAsync_AuthenticatedUser_ShouldLogSuccess()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";
        var userId = "user-789";

        SetupAuthenticatedConnection(connectionId, userId);

        _mockAwarenessStore.Setup(s => s.GetAllAsync(documentId)).ReturnsAsync(Array.Empty<AwarenessEntry>());
        _mockConnection.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);

        var message = new AwarenessSubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        // Act
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert - Should log successful subscription
        _mockLogger.Verify(
            l => l.Log(
                LogLevel.Information,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((o, t) =>
                    o.ToString()!.Contains("subscribed to awareness") &&
                    o.ToString()!.Contains(userId)),
                null,
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.Once);
    }

    [Fact]
    public async Task HandleAsync_ShouldSendAwarenessState_WithEntries()
    {
        // Arrange
        var documentId = "doc-999";
        var connectionId = "conn-999";

        SetupAuthenticatedConnection(connectionId, "user-9");

        var state = AwarenessState.Create("clientA", TestHelpers.ToNullableJsonElement(new { userId = "alice", cursor = new { x = 100, y = 200 } }), 1);
        var entry = AwarenessEntry.FromState(documentId, state);

        _mockAwarenessStore.Setup(s => s.GetAllAsync(documentId)).ReturnsAsync(new List<AwarenessEntry> { entry });
        _mockConnection.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);

        var message = new AwarenessSubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        // Act
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert - Should send AwarenessState with the entry
        _mockConnection.Verify(c => c.Send(It.Is<AwarenessStateMessage>(m => m.DocumentId == documentId && m.States.Count == 1 && m.States[0].ClientId == "clientA" && m.States[0].Clock == entry.Clock)), Times.Once);
    }

    [Fact]
    public void Constructor_WithNullAuthGuard_ShouldThrowArgumentNullException()
    {
        // Act & Assert
        var exception = Assert.Throws<ArgumentNullException>(() =>
            new AwarenessSubscribeMessageHandler(
                null!,
                _mockAwarenessStore.Object,
                _mockLogger.Object));

        Assert.Equal("authGuard", exception.ParamName);
    }

    [Fact]
    public void Constructor_WithNullLogger_ShouldThrowArgumentNullException()
    {
        // Act & Assert
        var exception = Assert.Throws<ArgumentNullException>(() =>
            new AwarenessSubscribeMessageHandler(
                _authGuard,
                _mockAwarenessStore.Object,
                null!));

        Assert.Equal("logger", exception.ParamName);
    }

    [Fact]
    public async Task HandleAsync_ShouldLogDebugMessageAtStart()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";

        SetupAuthenticatedConnection(connectionId, "user-1");

        _mockAwarenessStore.Setup(s => s.GetAllAsync(documentId)).ReturnsAsync(Array.Empty<AwarenessEntry>());

        var message = new AwarenessSubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        // Act
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert - Should log debug message about subscription attempt
        _mockLogger.Verify(
            l => l.Log(
                LogLevel.Debug,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((o, t) => o.ToString()!.Contains("subscribing to awareness")),
                null,
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.Once);
    }

    #region Helper Methods

    private void SetupAuthenticatedConnection(string connectionId, string userId)
    {
        _mockConnection.Setup(c => c.Id).Returns(connectionId);
        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticated);
        _mockConnection.Setup(c => c.UserId).Returns(userId);
        _mockConnection.Setup(c => c.TokenPayload).Returns(new TokenPayload
        {
            UserId = userId,
            Permissions = new DocumentPermissions
            {
                IsAdmin = false,
                CanRead = Array.Empty<string>(),
                CanWrite = Array.Empty<string>()
            }
        });
    }

    #endregion
}
