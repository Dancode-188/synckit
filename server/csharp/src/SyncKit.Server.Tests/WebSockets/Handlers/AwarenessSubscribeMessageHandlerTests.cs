using Microsoft.Extensions.Logging;
using Moq;
using SyncKit.Server.Auth;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Handlers;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.Tests.WebSockets.Handlers;

/// <summary>
/// Tests for AwarenessSubscribeMessageHandler - subscribing to awareness updates.
/// Note: This is a stub handler for Phase 5 implementation.
/// </summary>
public class AwarenessSubscribeMessageHandlerTests
{
    private readonly AuthGuard _authGuard;
    private readonly Mock<IConnection> _mockConnection;
    private readonly Mock<ILogger<AwarenessSubscribeMessageHandler>> _mockLogger;
    private readonly AwarenessSubscribeMessageHandler _handler;

    public AwarenessSubscribeMessageHandlerTests()
    {
        _authGuard = new AuthGuard(new Mock<ILogger<AuthGuard>>().Object);
        _mockConnection = new Mock<IConnection>();
        _mockLogger = new Mock<ILogger<AwarenessSubscribeMessageHandler>>();
        _handler = new AwarenessSubscribeMessageHandler(
            _authGuard,
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

        var message = new AwarenessSubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        // Act & Assert - Should not throw
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Note: Phase 5 will add awareness state tracking and AWARENESS_STATE response
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

        // Assert - Handler should log rejection (Phase 5 will send error response)
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
    public void Constructor_WithNullAuthGuard_ShouldThrowArgumentNullException()
    {
        // Act & Assert
        var exception = Assert.Throws<ArgumentNullException>(() =>
            new AwarenessSubscribeMessageHandler(
                null!,
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
