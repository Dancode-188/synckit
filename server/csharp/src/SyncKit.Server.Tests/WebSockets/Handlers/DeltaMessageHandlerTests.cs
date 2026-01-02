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
    private readonly Mock<ServerStorage.IStorageAdapter> _mockStorage;
    private readonly Mock<IConnectionManager> _mockConnectionManager;
    private readonly Mock<IConnection> _mockConnection;
    private readonly DeltaMessageHandler _handler;

    public DeltaMessageHandlerTests()
    {
        _authGuard = new AuthGuard(NullLogger<AuthGuard>.Instance);
        _mockStorage = new Mock<ServerStorage.IStorageAdapter>();
        _mockConnectionManager = new Mock<IConnectionManager>();
        _mockConnection = new Mock<IConnection>();

        _handler = new DeltaMessageHandler(
            _authGuard,
            _mockStorage.Object,
            _mockConnectionManager.Object,
            null,
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
        _mockStorage.Setup(s => s.SaveDeltaAsync(It.IsAny<SyncKit.Server.Storage.DeltaEntry>(), It.IsAny<CancellationToken>()))
            .Returns((SyncKit.Server.Storage.DeltaEntry d, CancellationToken _) => Task.FromResult(d));
        _mockStorage.Setup(s => s.GetDocumentStateAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, object?> { { "field", "value" } });
        _mockConnectionManager.Setup(cm => cm.BroadcastToDocumentAsync(
            documentId, It.IsAny<DeltaMessage>(), It.IsAny<string?>()))
            .Returns(Task.CompletedTask);

        var delta = CreateDeltaMessage(messageId, documentId);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, delta);

        // Assert - Delta should be stored
        _mockStorage.Verify(s => s.SaveDeltaAsync(
            It.Is<SyncKit.Server.Storage.DeltaEntry>(de =>
                de.Id == messageId &&
                de.ClientId == clientId),
            It.IsAny<CancellationToken>()),
            Times.Once);

        // Assert - Should broadcast to ALL subscribers (including sender for LWW convergence)
        // The excludeConnectionId is null to ensure all subscribers receive authoritative state
        _mockConnectionManager.Verify(cm => cm.BroadcastToDocumentAsync(
            documentId,
            It.Is<DeltaMessage>(m =>
                m.DocumentId == documentId &&
                m.Id != messageId), // New ID for broadcast
            null), // null = broadcast to ALL including sender
            Times.Once);

        // Assert - ACK should be sent to sender
        _mockConnection.Verify(c => c.Send(It.Is<AckMessage>(ack =>
            ack.MessageId == messageId)),
            Times.Once);
    }

    [Fact]
    public async Task HandleAsync_NotSubscribedToDocument_ShouldAutoSubscribe()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";
        var clientId = "client-789";
        var messageId = "msg-1";

        // Connection is NOT subscribed to the document initially
        var subscriptions = new HashSet<string>(); // Empty!

        SetupAuthenticatedConnectionWithWriteAccess(connectionId, clientId, subscriptions, documentId);
        _mockStorage.Setup(s => s.SaveDeltaAsync(It.IsAny<SyncKit.Server.Storage.DeltaEntry>(), It.IsAny<CancellationToken>()))
            .Returns((SyncKit.Server.Storage.DeltaEntry d, CancellationToken _) => Task.FromResult(d));
        _mockStorage.Setup(s => s.GetDocumentStateAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, object?> { { "field", "value" } });
        _mockConnectionManager.Setup(cm => cm.BroadcastToDocumentAsync(
            documentId, It.IsAny<DeltaMessage>(), It.IsAny<string?>()))
            .Returns(Task.CompletedTask);

        var delta = CreateDeltaMessage(messageId, documentId);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, delta);

        // Assert - Connection should be auto-subscribed (matches TypeScript server behavior)
        _mockConnection.Verify(c => c.AddSubscription(documentId), Times.Once);

        // Assert - Delta should be stored and broadcast (auto-subscription allows the operation)
        _mockStorage.Verify(s => s.SaveDeltaAsync(It.IsAny<SyncKit.Server.Storage.DeltaEntry>(), It.IsAny<CancellationToken>()), Times.Once);
        _mockConnectionManager.Verify(cm => cm.BroadcastToDocumentAsync(
            documentId, It.IsAny<IMessage>(), null), Times.Once);
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
        _mockStorage.Verify(s => s.SaveDeltaAsync(It.IsAny<SyncKit.Server.Storage.DeltaEntry>(), It.IsAny<CancellationToken>()), Times.Never);
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
        _mockStorage.Verify(s => s.SaveDeltaAsync(It.IsAny<SyncKit.Server.Storage.DeltaEntry>(), It.IsAny<CancellationToken>()), Times.Never);
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
        _mockStorage.Verify(s => s.SaveDeltaAsync(It.IsAny<SyncKit.Server.Storage.DeltaEntry>(), It.IsAny<CancellationToken>()), Times.Never);
        _mockConnectionManager.Verify(cm => cm.BroadcastToDocumentAsync(
            It.IsAny<string>(), It.IsAny<IMessage>(), It.IsAny<string?>()), Times.Never);
        _mockConnection.Verify(c => c.Send(It.IsAny<AckMessage>()), Times.Never);
    }

    [Fact]
    public async Task HandleAsync_ShouldBroadcastToAllIncludingSender()
    {
        // Arrange
        var documentId = "doc-123";
        var senderConnectionId = "sender-conn";
        var subscriptions = new HashSet<string> { documentId };

        SetupAuthenticatedConnectionWithWriteAccess(senderConnectionId, "client-1", subscriptions, documentId);
        _mockStorage.Setup(s => s.SaveDeltaAsync(It.IsAny<SyncKit.Server.Storage.DeltaEntry>(), It.IsAny<CancellationToken>()))
            .Returns((SyncKit.Server.Storage.DeltaEntry d, CancellationToken _) => Task.FromResult(d));
        _mockStorage.Setup(s => s.GetDocumentStateAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, object?> { { "field", "value" } });
        _mockConnectionManager.Setup(cm => cm.BroadcastToDocumentAsync(
            documentId, It.IsAny<DeltaMessage>(), It.IsAny<string?>()))
            .Returns(Task.CompletedTask);

        var delta = CreateDeltaMessage("msg-1", documentId);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, delta);

        // Assert - Broadcast should include ALL subscribers (sender too for LWW convergence)
        // LWW requires that the sender receives the authoritative state back from the server
        _mockConnectionManager.Verify(cm => cm.BroadcastToDocumentAsync(
            documentId,
            It.IsAny<DeltaMessage>(),
            null), // null = broadcast to ALL including sender
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

        SyncKit.Server.Storage.DeltaEntry? storedDelta = null;
        _mockStorage.Setup(s => s.SaveDeltaAsync(It.IsAny<SyncKit.Server.Storage.DeltaEntry>(), It.IsAny<CancellationToken>()))
            .Callback<SyncKit.Server.Storage.DeltaEntry, CancellationToken>((delta, ct) => storedDelta = delta)
            .Returns((SyncKit.Server.Storage.DeltaEntry d, CancellationToken _) => Task.FromResult(d));
        _mockStorage.Setup(s => s.GetDocumentStateAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, object?> { { "field", "value" } });
        _mockConnectionManager.Setup(cm => cm.BroadcastToDocumentAsync(
            documentId, It.IsAny<DeltaMessage>(), It.IsAny<string?>()))
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
        Assert.Equal(5, storedDelta!.VectorClock!["client-789"]);
        Assert.Equal(3, storedDelta!.VectorClock!["client-other"]);
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

        SyncKit.Server.Storage.DeltaEntry? storedDelta = null;
        _mockStorage.Setup(s => s.SaveDeltaAsync(It.IsAny<SyncKit.Server.Storage.DeltaEntry>(), It.IsAny<CancellationToken>()))
            .Callback<SyncKit.Server.Storage.DeltaEntry, CancellationToken>((delta, _) => storedDelta = delta)
            .Returns((SyncKit.Server.Storage.DeltaEntry d, CancellationToken _) => Task.FromResult(d));
        _mockStorage.Setup(s => s.GetDocumentStateAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, object?> { { "field", "value" } });
        _mockConnectionManager.Setup(cm => cm.BroadcastToDocumentAsync(
            documentId, It.IsAny<DeltaMessage>(), It.IsAny<string?>()))
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
        _mockStorage.Setup(s => s.SaveDeltaAsync(It.IsAny<SyncKit.Server.Storage.DeltaEntry>(), It.IsAny<CancellationToken>()))
            .Returns((SyncKit.Server.Storage.DeltaEntry d, CancellationToken _) => Task.FromResult(d));
        _mockStorage.Setup(s => s.GetDocumentStateAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, object?> { { "field", "value" } });
        _mockConnectionManager.Setup(cm => cm.BroadcastToDocumentAsync(
            documentId, It.IsAny<DeltaMessage>(), It.IsAny<string?>()))
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
        _mockStorage.Setup(s => s.SaveDeltaAsync(It.IsAny<SyncKit.Server.Storage.DeltaEntry>(), It.IsAny<CancellationToken>()))
            .Returns((SyncKit.Server.Storage.DeltaEntry d, CancellationToken _) => Task.FromResult(d));
        _mockStorage.Setup(s => s.GetDocumentStateAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, object?> { { "field", "value" } });

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
        _mockStorage.Setup(s => s.SaveDeltaAsync(It.IsAny<SyncKit.Server.Storage.DeltaEntry>(), It.IsAny<CancellationToken>()))
            .Returns((SyncKit.Server.Storage.DeltaEntry d, CancellationToken _) => Task.FromResult(d));
        // LWW uses authoritative state - so we return the expected field values
        _mockStorage.Setup(s => s.GetDocumentStateAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, object?>
            {
                { "operation", "set" },
                { "path", "title" },
                { "value", "Hello" }
            });

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
                _mockStorage.Object,
                _mockConnectionManager.Object,
                null,
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
                (ServerStorage.IStorageAdapter)null!,
                _mockConnectionManager.Object,
                null,
                NullLogger<DeltaMessageHandler>.Instance));

        Assert.Equal("storage", exception.ParamName);
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
                _mockStorage.Object,
                null!,
                null,
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
                _mockStorage.Object,
                _mockConnectionManager.Object,
                null,
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

        SyncKit.Server.Storage.DeltaEntry? storedDelta = null;
        _mockStorage.Setup(s => s.SaveDeltaAsync(It.IsAny<SyncKit.Server.Storage.DeltaEntry>(), It.IsAny<CancellationToken>()))
            .Callback<SyncKit.Server.Storage.DeltaEntry, CancellationToken>((delta, _) => storedDelta = delta)
            .Returns((SyncKit.Server.Storage.DeltaEntry d, CancellationToken _) => Task.FromResult(d));
        _mockStorage.Setup(s => s.GetDocumentStateAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, object?> { { "operation", "set" }, { "path", "title" }, { "value", "Test" } });
        _mockConnectionManager.Setup(cm => cm.BroadcastToDocumentAsync(
            documentId, It.IsAny<DeltaMessage>(), It.IsAny<string?>()))
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
        var storedJson = JsonSerializer.Serialize(storedDelta!.Value);
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

        _mockStorage.Setup(s => s.SaveDeltaAsync(It.IsAny<SyncKit.Server.Storage.DeltaEntry>(), It.IsAny<CancellationToken>()))
            .Returns((SyncKit.Server.Storage.DeltaEntry d, CancellationToken _) => Task.FromResult(d));
        _mockStorage.Setup(s => s.GetDocumentStateAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, object?> { { "field", "value" } });
        _mockConnectionManager.Setup(cm => cm.BroadcastToDocumentAsync(
            documentId, It.IsAny<DeltaMessage>(), It.IsAny<string?>()))
            .Returns(Task.CompletedTask);

        var delta = CreateDeltaMessage("msg-1", documentId);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, delta);

        // Assert - Delta should be stored
        _mockStorage.Verify(s => s.SaveDeltaAsync(
            It.Is<ServerStorage.DeltaEntry>(de => de.DocumentId == documentId && de.ClientId == "admin-client"),
            It.IsAny<CancellationToken>()), Times.Once);
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
