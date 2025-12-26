using Microsoft.Extensions.Logging;
using Moq;
using SyncKit.Server.Auth;
using SyncKit.Server.Tests;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Handlers;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.Tests.WebSockets.Handlers;

/// <summary>
/// Tests for AwarenessUpdateMessageHandler - updating user presence/awareness state.
/// Note: This is a stub handler for Phase 5 implementation.
/// </summary>
public class AwarenessUpdateMessageHandlerTests
{
    private readonly AuthGuard _authGuard;
    private readonly Mock<IConnection> _mockConnection;
    private readonly Mock<ILogger<AwarenessUpdateMessageHandler>> _mockLogger;
    private readonly Mock<IAwarenessStore> _mockStore;
    private readonly AwarenessUpdateMessageHandler _handler;

    public AwarenessUpdateMessageHandlerTests()
    {
        _authGuard = new AuthGuard(new Mock<ILogger<AuthGuard>>().Object);
        _mockConnection = new Mock<IConnection>();
        _mockLogger = new Mock<ILogger<AwarenessUpdateMessageHandler>>();
        _mockStore = new Mock<IAwarenessStore>();
        _mockStore.Setup(s => s.SetAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<AwarenessState>(), It.IsAny<long>()))
            .ReturnsAsync(true);

        _handler = new AwarenessUpdateMessageHandler(
            _authGuard,
            _mockStore.Object,
            _mockLogger.Object);
    }

    [Fact]
    public void HandledTypes_ShouldReturnAwarenessUpdate()
    {
        // Arrange & Act
        var types = _handler.HandledTypes;

        // Assert
        Assert.Single(types);
        Assert.Equal(MessageType.AwarenessUpdate, types[0]);
    }

    [Fact]
    public async Task HandleAsync_WithAuthenticatedConnection_ShouldAccept()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";

        SetupAuthenticatedConnection(connectionId, "user-1");

        var awarenessState = new Dictionary<string, object>
        {
            ["cursor"] = new Dictionary<string, object> { ["x"] = 100, ["y"] = 200 }
        };

        var message = new AwarenessUpdateMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId,
            ClientId = connectionId,
            State = TestHelpers.ToNullableJsonElement(awarenessState),
            Clock = 1
        };

        // Act & Assert - Should not throw
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Verify the store was called
        _mockStore.Verify(s => s.SetAsync(documentId, connectionId, It.IsAny<AwarenessState>(), 1), Times.Once);
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

        var awarenessState = new Dictionary<string, object>
        {
            ["cursor"] = new Dictionary<string, object> { ["x"] = 100, ["y"] = 200 }
        };

        var message = new AwarenessUpdateMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId,
            ClientId = connectionId,
            State = TestHelpers.ToNullableJsonElement(awarenessState),
            Clock = 1
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
                It.Is<It.IsAnyType>((o, t) => o.ToString()!.Contains("non-awareness-update")),
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

        var awarenessState = new Dictionary<string, object>
        {
            ["cursor"] = new Dictionary<string, object> { ["x"] = 100, ["y"] = 200 }
        };

        var message = new AwarenessUpdateMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId,
            ClientId = connectionId,
            State = TestHelpers.ToNullableJsonElement(awarenessState),
            Clock = 1
        };

        // Act
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert - Should log successful update
        _mockLogger.Verify(
            l => l.Log(
                LogLevel.Information,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((o, t) =>
                    o.ToString()!.Contains("awareness update") &&
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
            new AwarenessUpdateMessageHandler(
                null!,
                _mockLogger.Object));

        Assert.Equal("authGuard", exception.ParamName);
    }

    [Fact]
    public void Constructor_WithNullLogger_ShouldThrowArgumentNullException()
    {
        // Act & Assert
        var exception = Assert.Throws<ArgumentNullException>(() =>
            new AwarenessUpdateMessageHandler(
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

        var awarenessState = new Dictionary<string, object>
        {
            ["cursor"] = new Dictionary<string, object> { ["x"] = 100, ["y"] = 200 }
        };

        var message = new AwarenessUpdateMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId,
            ClientId = connectionId,
            State = TestHelpers.ToNullableJsonElement(awarenessState),
            Clock = 1
        };

        // Act
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert - Should log debug message about update attempt
        _mockLogger.Verify(
            l => l.Log(
                LogLevel.Debug,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((o, t) => o.ToString()!.Contains("sending awareness update")),
                null,
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.Once);
    }

    [Fact]
    public async Task HandleAsync_WithEmptyState_ShouldStillAccept()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";

        SetupAuthenticatedConnection(connectionId, "user-1");

        var message = new AwarenessUpdateMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId,
            ClientId = connectionId,
            State = null,
            Clock = 1
        };

        // Act & Assert - Should not throw
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Note: Empty state might indicate user left/disconnected (Phase 5 will handle)
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
