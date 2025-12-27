using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SyncKit.Server.Auth;
using SyncKit.Server.Sync;
using SyncKit.Server.Tests;
using SyncKit.Server.Awareness;
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
        var mockStorage = new Mock<SyncKit.Server.Storage.IStorageAdapter>();
        mockStorage.Setup(s => s.GetDeltasAsync(It.IsAny<string>(), It.IsAny<int>()))
            .ReturnsAsync(new List<SyncKit.Server.Storage.DeltaEntry>());
        var handler = new SubscribeMessageHandler(
            _authGuard,
            mockStorage.Object,
            new Mock<IConnectionManager>().Object,
            null,
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
        var mockStorage = new Mock<SyncKit.Server.Storage.IStorageAdapter>();
        mockStorage.Setup(s => s.GetDeltasAsync(It.IsAny<string>(), It.IsAny<int>()))
            .ReturnsAsync(new List<SyncKit.Server.Storage.DeltaEntry>());
        var mockDoc = new Document("doc-1");
        mockStorage.Setup(s => s.GetDocumentAsync("doc-1", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SyncKit.Server.Storage.DocumentState("doc-1", System.Text.Json.JsonDocument.Parse("{}").RootElement, 0, DateTime.UtcNow, DateTime.UtcNow));

        var handler = new SubscribeMessageHandler(
            _authGuard,
            mockStorage.Object,
            new Mock<IConnectionManager>().Object,
            null,
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
        var mockStorage = new Mock<SyncKit.Server.Storage.IStorageAdapter>();
        mockStorage.Setup(s => s.GetDeltasAsync(It.IsAny<string>(), It.IsAny<int>()))
            .ReturnsAsync(new List<SyncKit.Server.Storage.DeltaEntry>());
        mockStorage.Setup(s => s.GetDocumentAsync("doc-1", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SyncKit.Server.Storage.DocumentState("doc-1", System.Text.Json.JsonDocument.Parse("{}").RootElement, 0, DateTime.UtcNow, DateTime.UtcNow));

        var handler = new SubscribeMessageHandler(
            _authGuard,
            mockStorage.Object,
            new Mock<IConnectionManager>().Object,
            null,
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
        var mockStorage = new Mock<SyncKit.Server.Storage.IStorageAdapter>();
        mockStorage.Setup(s => s.GetDeltasAsync(It.IsAny<string>(), It.IsAny<int>()))
            .ReturnsAsync(new List<SyncKit.Server.Storage.DeltaEntry>());
        mockStorage.Setup(s => s.GetDocumentAsync("any-doc", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SyncKit.Server.Storage.DocumentState("any-doc", System.Text.Json.JsonDocument.Parse("{}").RootElement, 0, DateTime.UtcNow, DateTime.UtcNow));

        var handler = new SubscribeMessageHandler(
            _authGuard,
            mockStorage.Object,
            new Mock<IConnectionManager>().Object,
            null,
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
        var mockStorage = new Mock<SyncKit.Server.Storage.IStorageAdapter>();
        var mockConnManager = new Mock<IConnectionManager>();
        var handler = new DeltaMessageHandler(
            _authGuard,
            mockStorage.Object,
            mockConnManager.Object,
            null,
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
        var mockStorage = new Mock<SyncKit.Server.Storage.IStorageAdapter>();
        var mockConnManager = new Mock<IConnectionManager>();
        var handler = new DeltaMessageHandler(
            _authGuard,
            mockStorage.Object,
            mockConnManager.Object,
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
        var mockStorage = new Mock<SyncKit.Server.Storage.IStorageAdapter>();
        var mockConnManager = new Mock<IConnectionManager>();
        mockStorage.Setup(s => s.SaveDeltaAsync(It.IsAny<SyncKit.Server.Storage.DeltaEntry>(), It.IsAny<CancellationToken>()))
            .Returns<SyncKit.Server.Storage.DeltaEntry, CancellationToken>((de, ct) => Task.FromResult(de));
        var handler = new DeltaMessageHandler(
            _authGuard,
            mockStorage.Object,
            mockConnManager.Object,
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
        _mockConnection.Setup(c => c.GetSubscriptions()).Returns(new HashSet<string> { "doc-1" });

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
        var mockStorage = new Mock<SyncKit.Server.Storage.IStorageAdapter>();
        var mockConnManager = new Mock<IConnectionManager>();
        var handler = new DeltaMessageHandler(
            _authGuard,
            mockStorage.Object,
            mockConnManager.Object,
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
        _mockConnection.Setup(c => c.GetSubscriptions()).Returns(new HashSet<string> { "doc-1" });

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
        var mockAwarenessStore = new Mock<IAwarenessStore>();
        var handler = new AwarenessSubscribeMessageHandler(
            _authGuard,
            mockAwarenessStore.Object,
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
        var mockAwarenessStore = new Mock<IAwarenessStore>();
        mockAwarenessStore.Setup(s => s.GetAllAsync(It.IsAny<string>())).ReturnsAsync(Array.Empty<AwarenessEntry>());
        var handler = new AwarenessSubscribeMessageHandler(
            _authGuard,
            mockAwarenessStore.Object,
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
        var mockAwarenessStore = new Mock<IAwarenessStore>();
        var mockConnMgr = new Mock<IConnectionManager>();
        var handler = new AwarenessUpdateMessageHandler(
            _authGuard,
            mockAwarenessStore.Object,
            mockConnMgr.Object,
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
            State = TestHelpers.ToNullableJsonElement(new Dictionary<string, object>()),
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
        var mockAwarenessStore = new Mock<IAwarenessStore>();
        var mockConnMgr = new Mock<IConnectionManager>();
        var handler = new AwarenessUpdateMessageHandler(
            _authGuard,
            mockAwarenessStore.Object,
            mockConnMgr.Object,
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
        _mockConnection.Setup(c => c.GetSubscriptions()).Returns(new HashSet<string> { "doc-1" });

        var message = new AwarenessUpdateMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = "doc-1",
            ClientId = "client-1",
            State = TestHelpers.ToNullableJsonElement(new Dictionary<string, object>()),
            Clock = 1
        };

        // Act
        await handler.HandleAsync(_mockConnection.Object, message);

        // Assert
        _mockConnection.Verify(c => c.Send(It.IsAny<ErrorMessage>()), Times.Never);
    }

    #endregion
}
