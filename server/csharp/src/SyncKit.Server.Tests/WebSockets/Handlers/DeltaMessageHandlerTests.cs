using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SyncKit.Server.Auth;
using SyncKit.Server.Sync;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Handlers;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;

namespace SyncKit.Server.Tests.WebSockets.Handlers;

public class DeltaMessageHandlerTests
{
    private readonly AuthGuard _authGuard;
    private readonly Mock<IDocumentStore> _mockDocumentStore;
    private readonly Mock<IConnectionManager> _mockConnectionManager;
    private readonly Mock<IConnection> _mockConnection;
    private readonly DeltaMessageHandler _handler;

    public DeltaMessageHandlerTests()
    {
        _authGuard = new AuthGuard(NullLogger<AuthGuard>.Instance);
        _mockDocumentStore = new Mock<IDocumentStore>();
        _mockConnectionManager = new Mock<IConnectionManager>();
        _mockConnection = new Mock<IConnection>();

        _handler = new DeltaMessageHandler(
            _authGuard,
            _mockDocumentStore.Object,
            _mockConnectionManager.Object,
            NullLogger<DeltaMessageHandler>.Instance);
    }

    [Fact]
    public void HandledTypes_ShouldReturnDelta()
    {
        // Arrange & Act
        var types = _handler.HandledTypes;

        // Assert
        Assert.Single(types);
        Assert.Equal(MessageType.Delta, types[0]);
    }

    [Fact]
    public async Task HandleAsync_WithValidDelta_ShouldStoreAndBroadcast()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";
        var clientId = "client-789";
        var messageId = "msg-1";

        var subscriptions = new HashSet<string> { documentId };

        SetupAuthenticatedConnectionWithWriteAccess(connectionId, clientId, subscriptions, documentId);
        _mockDocumentStore.Setup(ds => ds.AddDeltaAsync(documentId, It.IsAny<StoredDelta>()))
            .Returns(Task.CompletedTask);
        _mockConnectionManager.Setup(cm => cm.BroadcastToDocumentAsync(
            documentId, It.IsAny<DeltaMessage>(), connectionId))
            .Returns(Task.CompletedTask);

        var delta = CreateDeltaMessage(messageId, documentId);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, delta);

        // Assert - Delta should be stored
        _mockDocumentStore.Verify(ds => ds.AddDeltaAsync(
            documentId,
            It.Is<StoredDelta>(sd =>
                sd.Id == messageId &&
                sd.ClientId == clientId)),
            Times.Once);

        // Assert - Should broadcast to other subscribers
        _mockConnectionManager.Verify(cm => cm.BroadcastToDocumentAsync(
            documentId,
            It.Is<DeltaMessage>(m =>
                m.DocumentId == documentId &&
                m.Id != messageId), // New ID for broadcast
            connectionId),
            Times.Once);

        // Assert - ACK should be sent to sender
        _mockConnection.Verify(c => c.Send(It.Is<AckMessage>(ack =>
            ack.MessageId == messageId)),
            Times.Once);
    }

    [Fact]
    public async Task HandleAsync_NotSubscribedToDocument_ShouldSendError()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";
        var clientId = "client-789";
        var messageId = "msg-1";

        // Connection is NOT subscribed to the document
        var subscriptions = new HashSet<string>(); // Empty!

        SetupAuthenticatedConnectionWithWriteAccess(connectionId, clientId, subscriptions, documentId);

        var delta = CreateDeltaMessage(messageId, documentId);

        IMessage? sentMessage = null;
        _mockConnection.Setup(c => c.Send(It.IsAny<IMessage>()))
            .Callback<IMessage>(msg => sentMessage = msg)
            .Returns(true);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, delta);

        // Assert - Error should be sent
        Assert.NotNull(sentMessage);
        Assert.IsType<ErrorMessage>(sentMessage);
        var errorMsg = (ErrorMessage)sentMessage;
        Assert.Contains("Not subscribed", errorMsg.Error);

        // Assert - Should NOT store or broadcast
        _mockDocumentStore.Verify(ds => ds.AddDeltaAsync(
            It.IsAny<string>(), It.IsAny<StoredDelta>()), Times.Never);
        _mockConnectionManager.Verify(cm => cm.BroadcastToDocumentAsync(
            It.IsAny<string>(), It.IsAny<IMessage>(), It.IsAny<string?>()), Times.Never);
    }

    [Fact]
    public async Task HandleAsync_WithoutWritePermission_ShouldReject()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";
        var subscriptions = new HashSet<string> { documentId };

        // Setup connection WITHOUT write access (read only)
        SetupAuthenticatedConnectionWithReadAccess(connectionId, "client-1", subscriptions, documentId);

        var delta = CreateDeltaMessage("msg-1", documentId);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, delta);

        // Assert - Should NOT store or broadcast
        _mockDocumentStore.Verify(ds => ds.AddDeltaAsync(
            It.IsAny<string>(), It.IsAny<StoredDelta>()), Times.Never);
        _mockConnectionManager.Verify(cm => cm.BroadcastToDocumentAsync(
            It.IsAny<string>(), It.IsAny<IMessage>(), It.IsAny<string?>()), Times.Never);
        _mockConnection.Verify(c => c.Send(It.IsAny<AckMessage>()), Times.Never);
    }

    [Fact]
    public async Task HandleAsync_NotAuthenticated_ShouldSendError()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";

        _mockConnection.Setup(c => c.Id).Returns(connectionId);
        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticating); // Not authenticated
        _mockConnection.Setup(c => c.TokenPayload).Returns((TokenPayload?)null);
        _mockConnection.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);

        var delta = CreateDeltaMessage("msg-1", documentId);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, delta);

        // Assert - Error should be sent
        _mockConnection.Verify(c => c.Send(It.Is<ErrorMessage>(
            m => m.Error == "Not authenticated")), Times.Once);

        // Assert - Should NOT store or broadcast
        _mockDocumentStore.Verify(ds => ds.AddDeltaAsync(
            It.IsAny<string>(), It.IsAny<StoredDelta>()), Times.Never);
        _mockConnectionManager.Verify(cm => cm.BroadcastToDocumentAsync(
            It.IsAny<string>(), It.IsAny<IMessage>(), It.IsAny<string?>()), Times.Never);
    }

    [Fact]
    public async Task HandleAsync_WithNullDelta_ShouldSendError()
    {
        // Arrange
        var connectionId = "conn-456";
        _mockConnection.Setup(c => c.Id).Returns(connectionId);
        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticated);
        _mockConnection.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);

        var message = new DeltaMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = "doc-123",
            Delta = null!,
            VectorClock = new Dictionary<string, long>()
        };

        IMessage? sentMessage = null;
        _mockConnection.Setup(c => c.Send(It.IsAny<IMessage>()))
            .Callback<IMessage>(msg => sentMessage = msg)
            .Returns(true);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert - Error should be sent
        Assert.NotNull(sentMessage);
        Assert.IsType<ErrorMessage>(sentMessage);
        var errorMsg = (ErrorMessage)sentMessage;
        Assert.Contains("Invalid delta", errorMsg.Error);
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

        // Assert - Should not interact with store or connection manager
        _mockDocumentStore.Verify(ds => ds.AddDeltaAsync(
            It.IsAny<string>(), It.IsAny<StoredDelta>()), Times.Never);
        _mockConnectionManager.Verify(cm => cm.BroadcastToDocumentAsync(
            It.IsAny<string>(), It.IsAny<IMessage>(), It.IsAny<string?>()), Times.Never);
        _mockConnection.Verify(c => c.Send(It.IsAny<AckMessage>()), Times.Never);
    }

    [Fact]
    public async Task HandleAsync_ShouldExcludeSenderFromBroadcast()
    {
        // Arrange
        var documentId = "doc-123";
        var senderConnectionId = "sender-conn";
        var subscriptions = new HashSet<string> { documentId };

        SetupAuthenticatedConnectionWithWriteAccess(senderConnectionId, "client-1", subscriptions, documentId);
        _mockDocumentStore.Setup(ds => ds.AddDeltaAsync(documentId, It.IsAny<StoredDelta>()))
            .Returns(Task.CompletedTask);

        var delta = CreateDeltaMessage("msg-1", documentId);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, delta);

        // Assert - Broadcast should exclude sender
        _mockConnectionManager.Verify(cm => cm.BroadcastToDocumentAsync(
            documentId,
            It.IsAny<DeltaMessage>(),
            senderConnectionId), // Exclude sender connection ID
            Times.Once);
    }

    [Fact]
    public async Task HandleAsync_ShouldStoreVectorClockWithDelta()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";
        var clientId = "client-789";
        var subscriptions = new HashSet<string> { documentId };

        var vectorClock = new Dictionary<string, long>
        {
            { "client-789", 5 },
            { "client-other", 3 }
        };

        SetupAuthenticatedConnectionWithWriteAccess(connectionId, clientId, subscriptions, documentId);

        StoredDelta? storedDelta = null;
        _mockDocumentStore.Setup(ds => ds.AddDeltaAsync(documentId, It.IsAny<StoredDelta>()))
            .Callback<string, StoredDelta>((_, delta) => storedDelta = delta)
            .Returns(Task.CompletedTask);

        var message = new DeltaMessage
        {
            Id = "msg-1",
            Timestamp = 1234567890,
            DocumentId = documentId,
            Delta = JsonSerializer.Deserialize<JsonElement>("{\"field\": \"value\"}"),
            VectorClock = vectorClock
        };

        // Act
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert - Vector clock should be stored correctly
        Assert.NotNull(storedDelta);
        Assert.Equal(5, storedDelta.VectorClock.Get("client-789"));
        Assert.Equal(3, storedDelta.VectorClock.Get("client-other"));
    }

    [Fact]
    public async Task HandleAsync_UsesConnectionIdWhenClientIdIsNull()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";
        var subscriptions = new HashSet<string> { documentId };

        // Client ID is null - should fall back to connection ID
        SetupAuthenticatedConnectionWithWriteAccess(connectionId, clientId: null, subscriptions, documentId);

        StoredDelta? storedDelta = null;
        _mockDocumentStore.Setup(ds => ds.AddDeltaAsync(documentId, It.IsAny<StoredDelta>()))
            .Callback<string, StoredDelta>((_, delta) => storedDelta = delta)
            .Returns(Task.CompletedTask);

        var delta = CreateDeltaMessage("msg-1", documentId);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, delta);

        // Assert - Should use connection ID as client ID
        Assert.NotNull(storedDelta);
        Assert.Equal(connectionId, storedDelta.ClientId);
    }

    [Fact]
    public async Task HandleAsync_ShouldSendAckWithCorrectMessageId()
    {
        // Arrange
        var documentId = "doc-123";
        var originalMessageId = "original-msg-id-12345";
        var subscriptions = new HashSet<string> { documentId };

        SetupAuthenticatedConnectionWithWriteAccess("conn-1", "client-1", subscriptions, documentId);
        _mockDocumentStore.Setup(ds => ds.AddDeltaAsync(documentId, It.IsAny<StoredDelta>()))
            .Returns(Task.CompletedTask);

        AckMessage? ackMessage = null;
        _mockConnection.Setup(c => c.Send(It.IsAny<AckMessage>()))
            .Callback<IMessage>(msg => ackMessage = msg as AckMessage)
            .Returns(true);

        var delta = CreateDeltaMessage(originalMessageId, documentId);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, delta);

        // Assert - ACK should reference the original message ID
        Assert.NotNull(ackMessage);
        Assert.Equal(MessageType.Ack, ackMessage.Type);
        Assert.Equal(originalMessageId, ackMessage.MessageId);
        Assert.NotEmpty(ackMessage.Id);
        Assert.True(ackMessage.Timestamp > 0);
    }

    [Fact]
    public async Task HandleAsync_BroadcastMessageShouldHaveNewId()
    {
        // Arrange
        var documentId = "doc-123";
        var originalMessageId = "original-msg-id";
        var subscriptions = new HashSet<string> { documentId };

        SetupAuthenticatedConnectionWithWriteAccess("conn-1", "client-1", subscriptions, documentId);
        _mockDocumentStore.Setup(ds => ds.AddDeltaAsync(documentId, It.IsAny<StoredDelta>()))
            .Returns(Task.CompletedTask);

        DeltaMessage? broadcastMessage = null;
        _mockConnectionManager.Setup(cm => cm.BroadcastToDocumentAsync(
            documentId, It.IsAny<DeltaMessage>(), It.IsAny<string?>()))
            .Callback<string, IMessage, string?>((_, msg, _) => broadcastMessage = msg as DeltaMessage)
            .Returns(Task.CompletedTask);

        var delta = CreateDeltaMessage(originalMessageId, documentId);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, delta);

        // Assert - Broadcast message should have a new ID
        Assert.NotNull(broadcastMessage);
        Assert.NotEqual(originalMessageId, broadcastMessage.Id);
        Assert.Equal(documentId, broadcastMessage.DocumentId);
    }

    [Fact]
    public async Task HandleAsync_ShouldPreserveDeltaDataInBroadcast()
    {
        // Arrange
        var documentId = "doc-123";
        var subscriptions = new HashSet<string> { documentId };

        SetupAuthenticatedConnectionWithWriteAccess("conn-1", "client-1", subscriptions, documentId);
        _mockDocumentStore.Setup(ds => ds.AddDeltaAsync(documentId, It.IsAny<StoredDelta>()))
            .Returns(Task.CompletedTask);

        DeltaMessage? broadcastMessage = null;
        _mockConnectionManager.Setup(cm => cm.BroadcastToDocumentAsync(
            documentId, It.IsAny<DeltaMessage>(), It.IsAny<string?>()))
            .Callback<string, IMessage, string?>((_, msg, _) => broadcastMessage = msg as DeltaMessage)
            .Returns(Task.CompletedTask);

        var originalDeltaData = JsonSerializer.Deserialize<JsonElement>("{\"operation\":\"set\",\"path\":\"title\",\"value\":\"Hello\"}");
        var vectorClock = new Dictionary<string, long> { { "client-1", 1 } };

        var delta = new DeltaMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId,
            Delta = originalDeltaData,
            VectorClock = vectorClock
        };

        // Act
        await _handler.HandleAsync(_mockConnection.Object, delta);

        // Assert - Delta data should be preserved in broadcast
        Assert.NotNull(broadcastMessage);
        var broadcastDeltaJson = JsonSerializer.Serialize(broadcastMessage.Delta);
        var originalDeltaJson = JsonSerializer.Serialize(originalDeltaData);
        Assert.Equal(originalDeltaJson, broadcastDeltaJson);

        // Vector clock should also be preserved
        Assert.Equal(vectorClock, broadcastMessage.VectorClock);
    }

    [Fact]
    public void Constructor_WithNullAuthGuard_ShouldThrowArgumentNullException()
    {
        // Act & Assert
        var exception = Assert.Throws<ArgumentNullException>(() =>
            new DeltaMessageHandler(
                null!,
                _mockDocumentStore.Object,
                _mockConnectionManager.Object,
                NullLogger<DeltaMessageHandler>.Instance));

        Assert.Equal("authGuard", exception.ParamName);
    }

    [Fact]
    public void Constructor_WithNullDocumentStore_ShouldThrowArgumentNullException()
    {
        // Arrange
        var authGuard = new AuthGuard(NullLogger<AuthGuard>.Instance);

        // Act & Assert
        var exception = Assert.Throws<ArgumentNullException>(() =>
            new DeltaMessageHandler(
                authGuard,
                null!,
                _mockConnectionManager.Object,
                NullLogger<DeltaMessageHandler>.Instance));

        Assert.Equal("documentStore", exception.ParamName);
    }

    [Fact]
    public void Constructor_WithNullConnectionManager_ShouldThrowArgumentNullException()
    {
        // Arrange
        var authGuard = new AuthGuard(NullLogger<AuthGuard>.Instance);

        // Act & Assert
        var exception = Assert.Throws<ArgumentNullException>(() =>
            new DeltaMessageHandler(
                authGuard,
                _mockDocumentStore.Object,
                null!,
                NullLogger<DeltaMessageHandler>.Instance));

        Assert.Equal("connectionManager", exception.ParamName);
    }

    [Fact]
    public void Constructor_WithNullLogger_ShouldThrowArgumentNullException()
    {
        // Arrange
        var authGuard = new AuthGuard(NullLogger<AuthGuard>.Instance);

        // Act & Assert
        var exception = Assert.Throws<ArgumentNullException>(() =>
            new DeltaMessageHandler(
                authGuard,
                _mockDocumentStore.Object,
                _mockConnectionManager.Object,
                null!));

        Assert.Equal("logger", exception.ParamName);
    }

    [Fact]
    public async Task HandleAsync_WithObjectDelta_ShouldSerializeCorrectly()
    {
        // Arrange
        var documentId = "doc-123";
        var subscriptions = new HashSet<string> { documentId };

        SetupAuthenticatedConnectionWithWriteAccess("conn-1", "client-1", subscriptions, documentId);

        StoredDelta? storedDelta = null;
        _mockDocumentStore.Setup(ds => ds.AddDeltaAsync(documentId, It.IsAny<StoredDelta>()))
            .Callback<string, StoredDelta>((_, delta) => storedDelta = delta)
            .Returns(Task.CompletedTask);

        // Using an anonymous object as delta (not JsonElement)
        var delta = new DeltaMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId,
            Delta = new { operation = "set", path = "title", value = "Test" },
            VectorClock = new Dictionary<string, long> { { "client-1", 1 } }
        };

        // Act
        await _handler.HandleAsync(_mockConnection.Object, delta);

        // Assert - Delta should be stored with correct data
        Assert.NotNull(storedDelta);
        var storedJson = storedDelta.Data.GetRawText();
        Assert.Contains("operation", storedJson);
        Assert.Contains("set", storedJson);
    }

    [Fact]
    public async Task HandleAsync_AdminUser_ShouldHaveWriteAccessToAnyDocument()
    {
        // Arrange
        var documentId = "any-document";
        var connectionId = "conn-1";
        var subscriptions = new HashSet<string> { documentId };

        // Setup admin connection
        _mockConnection.Setup(c => c.Id).Returns(connectionId);
        _mockConnection.Setup(c => c.ClientId).Returns("admin-client");
        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticated);
        _mockConnection.Setup(c => c.GetSubscriptions()).Returns(subscriptions);
        _mockConnection.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);
        _mockConnection.Setup(c => c.TokenPayload).Returns(new TokenPayload
        {
            UserId = "admin-1",
            Permissions = new DocumentPermissions
            {
                IsAdmin = true,
                CanRead = Array.Empty<string>(),
                CanWrite = Array.Empty<string>()
            }
        });

        _mockDocumentStore.Setup(ds => ds.AddDeltaAsync(documentId, It.IsAny<StoredDelta>()))
            .Returns(Task.CompletedTask);

        var delta = CreateDeltaMessage("msg-1", documentId);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, delta);

        // Assert - Delta should be stored
        _mockDocumentStore.Verify(ds => ds.AddDeltaAsync(
            documentId, It.IsAny<StoredDelta>()), Times.Once);
    }

    #region Helper Methods

    private void SetupAuthenticatedConnectionWithWriteAccess(
        string connectionId, string? clientId, HashSet<string> subscriptions, string documentId)
    {
        _mockConnection.Setup(c => c.Id).Returns(connectionId);
        _mockConnection.Setup(c => c.ClientId).Returns(clientId);
        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticated);
        _mockConnection.Setup(c => c.GetSubscriptions()).Returns(subscriptions);
        _mockConnection.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);
        _mockConnection.Setup(c => c.TokenPayload).Returns(new TokenPayload
        {
            UserId = "user-1",
            Permissions = new DocumentPermissions
            {
                IsAdmin = false,
                CanRead = new[] { documentId },
                CanWrite = new[] { documentId }
            }
        });
    }

    private void SetupAuthenticatedConnectionWithReadAccess(
        string connectionId, string? clientId, HashSet<string> subscriptions, string documentId)
    {
        _mockConnection.Setup(c => c.Id).Returns(connectionId);
        _mockConnection.Setup(c => c.ClientId).Returns(clientId);
        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticated);
        _mockConnection.Setup(c => c.GetSubscriptions()).Returns(subscriptions);
        _mockConnection.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);
        _mockConnection.Setup(c => c.UserId).Returns("user-1");
        _mockConnection.Setup(c => c.TokenPayload).Returns(new TokenPayload
        {
            UserId = "user-1",
            Permissions = new DocumentPermissions
            {
                IsAdmin = false,
                CanRead = new[] { documentId },
                CanWrite = Array.Empty<string>() // No write access
            }
        });
    }

    private static DeltaMessage CreateDeltaMessage(string messageId, string documentId)
    {
        return new DeltaMessage
        {
            Id = messageId,
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId,
            Delta = JsonSerializer.Deserialize<JsonElement>("{\"field\": \"value\"}"),
            VectorClock = new Dictionary<string, long> { { "client-1", 1 } }
        };
    }

    #endregion
}
