using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SyncKit.Server.Auth;
using SyncKit.Server.Sync;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Handlers;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;
using Xunit;

namespace SyncKit.Server.Tests.WebSockets.Handlers;

/// <summary>
/// Integration tests for message handlers with auth enforcement.
/// Tests that handlers properly use AuthGuard to enforce permissions.
/// </summary>
public class MessageHandlerAuthEnforcementTests
{
    private readonly AuthGuard _authGuard;
    private readonly Mock<IConnection> _mockConnection;

    public MessageHandlerAuthEnforcementTests()
    {
        _authGuard = new AuthGuard(NullLogger<AuthGuard>.Instance);
        _mockConnection = new Mock<IConnection>();
    }

    #region SubscribeMessageHandler Tests

    [Fact]
    public async Task SubscribeHandler_NotAuthenticated_SendsError()
    {
        // Arrange
        var mockDocStore = new Mock<IDocumentStore>();
        var handler = new SubscribeMessageHandler(
            _authGuard,
            mockDocStore.Object,
            NullLogger<SubscribeMessageHandler>.Instance);

        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticating);
        _mockConnection.Setup(c => c.TokenPayload).Returns((TokenPayload?)null);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");

        var message = new SubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = "doc-1"
        };

        // Act
        await handler.HandleAsync(_mockConnection.Object, message);

        // Assert
        _mockConnection.Verify(c => c.Send(It.Is<ErrorMessage>(
            m => m.Error == "Not authenticated")), Times.Once);
        _mockConnection.Verify(c => c.AddSubscription(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task SubscribeHandler_NoReadPermission_SendsError()
    {
        // Arrange
        var mockDocStore = new Mock<IDocumentStore>();
        var handler = new SubscribeMessageHandler(
            _authGuard,
            mockDocStore.Object,
            NullLogger<SubscribeMessageHandler>.Instance);

        var payload = new TokenPayload
        {
            UserId = "user-1",
            Permissions = new DocumentPermissions
            {
                CanRead = new[] { "doc-2" }, // Different document
                CanWrite = Array.Empty<string>(),
                IsAdmin = false
            }
        };

        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticated);
        _mockConnection.Setup(c => c.TokenPayload).Returns(payload);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");
        _mockConnection.Setup(c => c.UserId).Returns("user-1");

        var message = new SubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = "doc-1"
        };

        // Act
        await handler.HandleAsync(_mockConnection.Object, message);

    // Assert
        _mockConnection.Verify(c => c.Send(It.Is<ErrorMessage>(
            m => m.Error == "Permission denied")), Times.Once);
        _mockConnection.Verify(c => c.AddSubscription(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task SubscribeHandler_WithReadPermission_AllowsSubscription()
    {
        // Arrange
        var mockDocStore = new Mock<IDocumentStore>();
        var mockDoc = new Document("doc-1");
        mockDocStore.Setup(d => d.GetOrCreateAsync("doc-1")).ReturnsAsync(mockDoc);

        var handler = new SubscribeMessageHandler(
            _authGuard,
            mockDocStore.Object,
            NullLogger<SubscribeMessageHandler>.Instance);

        var payload = new TokenPayload
        {
            UserId = "user-1",
            Permissions = new DocumentPermissions
            {
                CanRead = new[] { "doc-1" },
                CanWrite = Array.Empty<string>(),
                IsAdmin = false
            }
        };

        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticated);
        _mockConnection.Setup(c => c.TokenPayload).Returns(payload);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");
        _mockConnection.Setup(c => c.UserId).Returns("user-1");

        var message = new SubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = "doc-1"
        };

        // Act
        await handler.HandleAsync(_mockConnection.Object, message);

        // Assert
        _mockConnection.Verify(c => c.Send(It.IsAny<ErrorMessage>()), Times.Never);
        _mockConnection.Verify(c => c.AddSubscription("doc-1"), Times.Once);
    }

    [Fact]
    public async Task SubscribeHandler_AdminUser_AllowsSubscriptionToAnyDocument()
    {
        // Arrange
        var mockDocStore = new Mock<IDocumentStore>();
        var mockDoc = new Document("any-doc");
        mockDocStore.Setup(d => d.GetOrCreateAsync("any-doc")).ReturnsAsync(mockDoc);

        var handler = new SubscribeMessageHandler(
            _authGuard,
            mockDocStore.Object,
            NullLogger<SubscribeMessageHandler>.Instance);

        var payload = new TokenPayload
        {
            UserId = "admin-1",
            Permissions = new DocumentPermissions
            {
                CanRead = Array.Empty<string>(),
                CanWrite = Array.Empty<string>(),
                IsAdmin = true
            }
        };

        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticated);
        _mockConnection.Setup(c => c.TokenPayload).Returns(payload);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");
        _mockConnection.Setup(c => c.UserId).Returns("admin-1");

        var message = new SubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = "any-doc"
        };

        // Act
        await handler.HandleAsync(_mockConnection.Object, message);

        // Assert
        _mockConnection.Verify(c => c.Send(It.IsAny<ErrorMessage>()), Times.Never);
        _mockConnection.Verify(c => c.AddSubscription("any-doc"), Times.Once);
    }

    #endregion

    #region DeltaMessageHandler Tests

    [Fact]
    public async Task DeltaHandler_NotAuthenticated_SendsError()
    {
        // Arrange
        var handler = new DeltaMessageHandler(
            _authGuard,
            NullLogger<DeltaMessageHandler>.Instance);

        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticating);
        _mockConnection.Setup(c => c.TokenPayload).Returns((TokenPayload?)null);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");

        var message = new DeltaMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = "doc-1",
            Delta = new { },
            VectorClock = new Dictionary<string, long>()
        };

        // Act
        await handler.HandleAsync(_mockConnection.Object, message);

        // Assert
        _mockConnection.Verify(c => c.Send(It.Is<ErrorMessage>(
            m => m.Error == "Not authenticated")), Times.Once);
    }

    [Fact]
    public async Task DeltaHandler_NoWritePermission_SendsError()
    {
        // Arrange
        var handler = new DeltaMessageHandler(
            _authGuard,
            NullLogger<DeltaMessageHandler>.Instance);

        var payload = new TokenPayload
        {
            UserId = "user-1",
            Permissions = new DocumentPermissions
            {
                CanRead = new[] { "doc-1" }, // Has read but not write
                CanWrite = new[] { "doc-2" }, // Different document
                IsAdmin = false
            }
        };

        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticated);
        _mockConnection.Setup(c => c.TokenPayload).Returns(payload);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");
        _mockConnection.Setup(c => c.UserId).Returns("user-1");

        var message = new DeltaMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = "doc-1",
            Delta = new { },
            VectorClock = new Dictionary<string, long>()
        };

        // Act
        await handler.HandleAsync(_mockConnection.Object, message);

        // Assert
        _mockConnection.Verify(c => c.Send(It.Is<ErrorMessage>(
            m => m.Error == "Permission denied")), Times.Once);
    }

    [Fact]
    public async Task DeltaHandler_HasWritePermission_Succeeds()
    {
        // Arrange
        var handler = new DeltaMessageHandler(
            _authGuard,
            NullLogger<DeltaMessageHandler>.Instance);

        var payload = new TokenPayload
        {
            UserId = "user-1",
            Permissions = new DocumentPermissions
            {
                CanRead = new[] { "doc-1" },
                CanWrite = new[] { "doc-1" },
                IsAdmin = false
            }
        };

        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticated);
        _mockConnection.Setup(c => c.TokenPayload).Returns(payload);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");
        _mockConnection.Setup(c => c.UserId).Returns("user-1");

        var message = new DeltaMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = "doc-1",
            Delta = new { change = "test" },
            VectorClock = new Dictionary<string, long>()
        };

        // Act
        await handler.HandleAsync(_mockConnection.Object, message);

        // Assert
        _mockConnection.Verify(c => c.Send(It.Is<ErrorMessage>(
            m => m.Error == "Permission denied")), Times.Never);
    }

    [Fact]
    public async Task DeltaHandler_NullDelta_SendsError()
    {
        // Arrange
        var handler = new DeltaMessageHandler(
            _authGuard,
            NullLogger<DeltaMessageHandler>.Instance);

        var payload = new TokenPayload
        {
            UserId = "user-1",
            Permissions = new DocumentPermissions
            {
                CanRead = new[] { "doc-1" },
                CanWrite = new[] { "doc-1" },
                IsAdmin = false
            }
        };

        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticated);
        _mockConnection.Setup(c => c.TokenPayload).Returns(payload);

        var message = new DeltaMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = "doc-1",
            Delta = null!,
            VectorClock = new Dictionary<string, long>()
        };

        // Act
        await handler.HandleAsync(_mockConnection.Object, message);

        // Assert
        _mockConnection.Verify(c => c.Send(It.Is<ErrorMessage>(
            m => m.Error == "Invalid delta message: missing or empty delta")), Times.Once);
    }

    #endregion

    #region AwarenessMessageHandler Tests

    [Fact]
    public async Task AwarenessSubscribeHandler_NotAuthenticated_SendsError()
    {
        // Arrange
        var handler = new AwarenessSubscribeMessageHandler(
            _authGuard,
            NullLogger<AwarenessSubscribeMessageHandler>.Instance);

        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticating);
        _mockConnection.Setup(c => c.TokenPayload).Returns((TokenPayload?)null);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");

        var message = new AwarenessSubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = "doc-1"
        };

        // Act
        await handler.HandleAsync(_mockConnection.Object, message);

        // Assert
        _mockConnection.Verify(c => c.Send(It.Is<ErrorMessage>(
            m => m.Error == "Not authenticated")), Times.Once);
    }

    [Fact]
    public async Task AwarenessSubscribeHandler_Authenticated_Succeeds()
    {
        // Arrange
        var handler = new AwarenessSubscribeMessageHandler(
            _authGuard,
            NullLogger<AwarenessSubscribeMessageHandler>.Instance);

        var payload = new TokenPayload
        {
            UserId = "user-1",
            Permissions = new DocumentPermissions
            {
                CanRead = Array.Empty<string>(),
                CanWrite = Array.Empty<string>(),
                IsAdmin = false
            }
        };

        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticated);
        _mockConnection.Setup(c => c.TokenPayload).Returns(payload);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");
        _mockConnection.Setup(c => c.UserId).Returns("user-1");

        var message = new AwarenessSubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = "doc-1"
        };

        // Act
        await handler.HandleAsync(_mockConnection.Object, message);

        // Assert
        _mockConnection.Verify(c => c.Send(It.IsAny<ErrorMessage>()), Times.Never);
    }

    [Fact]
    public async Task AwarenessUpdateHandler_NotAuthenticated_SendsError()
    {
        // Arrange
        var handler = new AwarenessUpdateMessageHandler(
            _authGuard,
            NullLogger<AwarenessUpdateMessageHandler>.Instance);

        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticating);
        _mockConnection.Setup(c => c.TokenPayload).Returns((TokenPayload?)null);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");

        var message = new AwarenessUpdateMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = "doc-1",
            ClientId = "client-1",
            State = new Dictionary<string, object>(),
            Clock = 1
        };

        // Act
        await handler.HandleAsync(_mockConnection.Object, message);

        // Assert
        _mockConnection.Verify(c => c.Send(It.Is<ErrorMessage>(
            m => m.Error == "Not authenticated")), Times.Once);
    }

    [Fact]
    public async Task AwarenessUpdateHandler_Authenticated_Succeeds()
    {
        // Arrange
        var handler = new AwarenessUpdateMessageHandler(
            _authGuard,
            NullLogger<AwarenessUpdateMessageHandler>.Instance);

        var payload = new TokenPayload
        {
            UserId = "user-1",
            Permissions = new DocumentPermissions
            {
                CanRead = Array.Empty<string>(),
                CanWrite = Array.Empty<string>(),
                IsAdmin = false
            }
        };

        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticated);
        _mockConnection.Setup(c => c.TokenPayload).Returns(payload);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");
        _mockConnection.Setup(c => c.UserId).Returns("user-1");

        var message = new AwarenessUpdateMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = "doc-1",
            ClientId = "client-1",
            State = new Dictionary<string, object>(),
            Clock = 1
        };

        // Act
        await handler.HandleAsync(_mockConnection.Object, message);

        // Assert
        _mockConnection.Verify(c => c.Send(It.IsAny<ErrorMessage>()), Times.Never);
    }

    #endregion
}
