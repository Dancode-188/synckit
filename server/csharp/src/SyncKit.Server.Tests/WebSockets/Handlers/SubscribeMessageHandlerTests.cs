using System.Text.Json;
using Microsoft.Extensions.Logging;
using Moq;
using SyncKit.Server.Auth;
using SyncKit.Server.Sync;
using SyncKit.Server.Tests;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Handlers;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;
namespace SyncKit.Server.Tests.WebSockets.Handlers;

/// <summary>
/// Tests for SubscribeMessageHandler - subscribing clients to document updates.
/// </summary>
public class SubscribeMessageHandlerTests
{
    private readonly AuthGuard _authGuard;
    private readonly Mock<SyncKit.Server.Storage.IStorageAdapter> _mockStorage;
    private readonly Mock<IConnection> _mockConnection;
    private readonly Mock<ILogger<SubscribeMessageHandler>> _mockLogger;
    private readonly SubscribeMessageHandler _handler;

    public SubscribeMessageHandlerTests()
    {
        _authGuard = new AuthGuard(new Mock<ILogger<AuthGuard>>().Object);
        _mockStorage = new Mock<SyncKit.Server.Storage.IStorageAdapter>();
        _mockConnection = new Mock<IConnection>();
        _mockLogger = new Mock<ILogger<SubscribeMessageHandler>>();
        var mockConnManager = new Mock<IConnectionManager>();
        _handler = new SubscribeMessageHandler(
            _authGuard,
            _mockStorage.Object,
            mockConnManager.Object,
            null,
            _mockLogger.Object);
    }

    [Fact]
    public void HandledTypes_ShouldReturnSubscribe()
    {
        // Arrange & Act
        var types = _handler.HandledTypes;

        // Assert
        Assert.Single(types);
        Assert.Equal(MessageType.Subscribe, types[0]);
    }

    [Fact]
    public async Task HandleAsync_WithReadPermission_ShouldSubscribeAndSendState()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";
        var messageId = "msg-1";

        // Prepare storage to return two deltas and a vector clock
        var delta1 = new SyncKit.Server.Storage.DeltaEntry
        {
            Id = "delta-1",
            DocumentId = documentId,
            ClientId = "client-1",
            OperationType = "set",
            FieldPath = string.Empty,
            Value = JsonDocument.Parse("{}").RootElement,
            ClockValue = 1,
            Timestamp = DateTime.UtcNow,
            VectorClock = new Dictionary<string, long> { ["client-1"] = 1 }
        };

        var delta2 = new SyncKit.Server.Storage.DeltaEntry
        {
            Id = "delta-2",
            DocumentId = documentId,
            ClientId = "client-1",
            OperationType = "set",
            FieldPath = string.Empty,
            Value = JsonDocument.Parse("{}").RootElement,
            ClockValue = 2,
            Timestamp = DateTime.UtcNow,
            VectorClock = new Dictionary<string, long> { ["client-1"] = 2 }
        };

        SetupAuthenticatedConnectionWithReadAccess(connectionId, documentId);
        _mockStorage.Setup(s => s.GetDeltasAsync(documentId, It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { delta1, delta2 });
        _mockStorage.Setup(s => s.GetVectorClockAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, long> { ["client-1"] = 2 });
        _mockStorage.Setup(s => s.GetDocumentStateAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, object?> { { "client-1", 2L } });

        // Return an existing document state so GetOrCreateDocumentAsync doesn't try to create one
        _mockStorage.Setup(s => s.GetDocumentAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SyncKit.Server.Storage.DocumentState(documentId, JsonDocument.Parse("{}").RootElement, 1, DateTime.UtcNow, DateTime.UtcNow));

        var message = new SubscribeMessage
        {
            Id = messageId,
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        SyncResponseMessage? sentResponse = null;
        _mockConnection.Setup(c => c.Send(It.IsAny<SyncResponseMessage>()))
            .Callback<IMessage>(msg => sentResponse = msg as SyncResponseMessage)
            .Returns(true);

        // Use the new storage-based handler for this test
        var handler = new SubscribeMessageHandler(_authGuard, _mockStorage.Object, _mockLogger.Object);

        // Act
        await handler.HandleAsync(_mockConnection.Object, message);

        // Assert - Connection subscribed to document
        _mockConnection.Verify(c => c.AddSubscription(documentId), Times.Once);

        // Assert - SYNC_RESPONSE sent
        Assert.NotNull(sentResponse);
        Assert.Equal(MessageType.SyncResponse, sentResponse!.Type);
        Assert.Equal(messageId, sentResponse.RequestId);
        Assert.Equal(documentId, sentResponse.DocumentId);
        Assert.Equal(2, sentResponse!.Deltas!.Count);
        Assert.NotNull(sentResponse!.State);
    }

    [Fact]
    public async Task HandleAsync_CreatesDocumentIfNotExists()
    {
        // Arrange
        var documentId = "new-doc";
        var connectionId = "conn-456";

        SetupAuthenticatedConnectionWithReadAccess(connectionId, documentId);

        // First call returns null (doesn't exist), triggering creation
        _mockStorage.Setup(s => s.GetDocumentAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((SyncKit.Server.Storage.DocumentState?)null);
        _mockStorage.Setup(s => s.SaveDocumentAsync(documentId, It.IsAny<JsonElement>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SyncKit.Server.Storage.DocumentState(documentId, JsonDocument.Parse("{}").RootElement, 1, DateTime.UtcNow, DateTime.UtcNow));
        _mockStorage.Setup(s => s.GetDeltasAsync(documentId, It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<SyncKit.Server.Storage.DeltaEntry>().ToList().AsReadOnly());
        _mockStorage.Setup(s => s.GetDocumentStateAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, object?>());

        var message = new SubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        _mockConnection.Setup(c => c.Send(It.IsAny<SyncResponseMessage>())).Returns(true);

        // Use the new storage-based handler for this test
        var handler = new SubscribeMessageHandler(_authGuard, _mockStorage.Object, _mockLogger.Object);

        // Act
        await handler.HandleAsync(_mockConnection.Object, message);

        // Assert - SaveDocumentAsync called to create the document
        _mockStorage.Verify(s => s.SaveDocumentAsync(documentId, It.IsAny<JsonElement>(), It.IsAny<CancellationToken>()), Times.Once);

        // Assert - Subscription added
        _mockConnection.Verify(c => c.AddSubscription(documentId), Times.Once);
    }

    [Fact]
    public async Task HandleAsync_WithoutReadPermission_ShouldReject()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";

        // Setup connection WITHOUT read access
        SetupAuthenticatedConnectionWithoutReadAccess(connectionId, documentId);

        var message = new SubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        // Act
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert - Should NOT create subscription
        _mockConnection.Verify(c => c.AddSubscription(It.IsAny<string>()), Times.Never);
        _mockStorage.Verify(s => s.GetDocumentAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);

        // Assert - Should NOT send SYNC_RESPONSE
        _mockConnection.Verify(c => c.Send(It.IsAny<SyncResponseMessage>()), Times.Never);
    }

    [Fact]
    public async Task HandleAsync_NotAuthenticated_ShouldReject()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";

        _mockConnection.Setup(c => c.Id).Returns(connectionId);
        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticating);
        _mockConnection.Setup(c => c.TokenPayload).Returns((TokenPayload?)null);

        var message = new SubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        // Act
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert - Should NOT create subscription
        _mockConnection.Verify(c => c.AddSubscription(It.IsAny<string>()), Times.Never);
        _mockStorage.Verify(s => s.GetDocumentAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task HandleAsync_AdminUser_ShouldHaveAccessToAnyDocument()
    {
        // Arrange
        var documentId = "any-doc";
        var connectionId = "conn-admin";

        // Setup admin connection
        _mockConnection.Setup(c => c.Id).Returns(connectionId);
        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticated);
        _mockConnection.Setup(c => c.UserId).Returns("admin-1");
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

        var document = new Document(documentId);
        var entries = document.GetAllDeltas().Select(sd => new SyncKit.Server.Storage.DeltaEntry
        {
            Id = sd.Id,
            DocumentId = documentId,
            ClientId = sd.ClientId,
            OperationType = "set",
            FieldPath = "field",
            Value = sd.Data,
            ClockValue = sd.VectorClock?.ToDict().Values.DefaultIfEmpty().Max() ?? 0,
            Timestamp = DateTime.UtcNow,
            VectorClock = sd.VectorClock?.ToDict()
        }).ToList();

        _mockStorage.Setup(s => s.GetDeltasAsync(documentId, It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(entries);
        var mergedClock = new Dictionary<string, long>();
        foreach (var sd in document.GetAllDeltas())
        {
            var d = sd.VectorClock?.ToDict();
            if (d == null) continue;
            foreach (var kv in d)
            {
                if (!mergedClock.ContainsKey(kv.Key) || mergedClock[kv.Key] < kv.Value)
                    mergedClock[kv.Key] = kv.Value;
            }
        }
        _mockStorage.Setup(s => s.GetVectorClockAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(mergedClock);

        var message = new SubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        // Act
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert - Admin can subscribe
        _mockConnection.Verify(c => c.AddSubscription(documentId), Times.Once);
        _mockConnection.Verify(c => c.Send(It.IsAny<SyncResponseMessage>()), Times.Once);
        // Ensure storage was queried
        _mockStorage.Verify(s => s.GetDeltasAsync(documentId, It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task HandleAsync_MultipleSubscribers_EachGetsFullState()
    {
        // Arrange
        var documentId = "doc-123";
        var document = new Document(documentId);
        document.AddDelta(CreateTestDelta("delta-1", "client-1", 1));

        var entries = document.GetAllDeltas().Select(sd => new SyncKit.Server.Storage.DeltaEntry
        {
            Id = sd.Id,
            DocumentId = documentId,
            ClientId = sd.ClientId,
            OperationType = "set",
            FieldPath = "field",
            Value = sd.Data,
            ClockValue = sd.VectorClock?.ToDict().Values.DefaultIfEmpty().Max() ?? 0,
            Timestamp = DateTime.UtcNow,
            VectorClock = sd.VectorClock?.ToDict()
        }).ToList();

        _mockStorage.Setup(s => s.GetDeltasAsync(documentId, It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(entries);
        _mockStorage.Setup(s => s.GetVectorClockAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(document.GetAllDeltas().LastOrDefault()?.VectorClock?.ToDict() ?? new Dictionary<string, long>());

        var message = new SubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        // Setup first connection
        var mockConn1 = new Mock<IConnection>();
        SetupAuthenticatedConnectionWithReadAccess(mockConn1, "conn-1", documentId);

        SyncResponseMessage? response1 = null;
        mockConn1.Setup(c => c.Send(It.IsAny<SyncResponseMessage>()))
            .Callback<IMessage>(msg => response1 = msg as SyncResponseMessage)
            .Returns(true);

        // Setup second connection
        var mockConn2 = new Mock<IConnection>();
        SetupAuthenticatedConnectionWithReadAccess(mockConn2, "conn-2", documentId);

        SyncResponseMessage? response2 = null;
        mockConn2.Setup(c => c.Send(It.IsAny<SyncResponseMessage>()))
            .Callback<IMessage>(msg => response2 = msg as SyncResponseMessage)
            .Returns(true);

        // Act - Subscribe both connections
        await _handler.HandleAsync(mockConn1.Object, message);
        await _handler.HandleAsync(mockConn2.Object, message);

        // Assert - Both get full state
        Assert.NotNull(response1);
        Assert.Single(response1!.Deltas!);

        Assert.NotNull(response2);
        Assert.Single(response2!.Deltas!);
    }

    [Fact]
    public async Task HandleAsync_ShouldSendVectorClockInState()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";

        var document = new Document(documentId);
        document.AddDelta(CreateTestDelta("delta-1", "client-1", 5));
        document.AddDelta(CreateTestDelta("delta-2", "client-2", 3));

        SetupAuthenticatedConnectionWithReadAccess(connectionId, documentId);
        var entries = document.GetAllDeltas().Select(sd => new SyncKit.Server.Storage.DeltaEntry
        {
            Id = sd.Id,
            DocumentId = documentId,
            ClientId = sd.ClientId,
            OperationType = "set",
            FieldPath = "field",
            Value = sd.Data,
            ClockValue = sd.VectorClock?.ToDict().Values.DefaultIfEmpty().Max() ?? 0,
            Timestamp = DateTime.UtcNow,
            VectorClock = sd.VectorClock?.ToDict()
        }).ToList();

        _mockStorage.Setup(s => s.GetDeltasAsync(documentId, It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(entries);
        var mergedClock = new Dictionary<string, long>();
        foreach (var sd in document.GetAllDeltas())
        {
            var d = sd.VectorClock?.ToDict();
            if (d == null) continue;
            foreach (var kv in d)
            {
                if (!mergedClock.ContainsKey(kv.Key) || mergedClock[kv.Key] < kv.Value)
                    mergedClock[kv.Key] = kv.Value;
            }
        }
        _mockStorage.Setup(s => s.GetVectorClockAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(mergedClock);
        _mockStorage.Setup(s => s.GetDocumentAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SyncKit.Server.Storage.DocumentState(documentId, JsonDocument.Parse("{}").RootElement, 1, DateTime.UtcNow, DateTime.UtcNow));
        _mockStorage.Setup(s => s.GetDocumentStateAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, object?> { { "client-1", 5L }, { "client-2", 3L } });

        var message = new SubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        SyncResponseMessage? sentResponse = null;
        _mockConnection.Setup(c => c.Send(It.IsAny<SyncResponseMessage>()))
            .Callback<IMessage>(msg => sentResponse = msg as SyncResponseMessage)
            .Returns(true);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert - State sent contains expected field values
        Assert.NotNull(sentResponse);
        Assert.NotNull(sentResponse!.State);
        var stateDict = TestHelpers.AsDictionary(sentResponse.State)!;
        Assert.Equal(5L, stateDict["client-1"]);
        Assert.Equal(3L, stateDict["client-2"]);
    }

    [Fact]
    public async Task HandleAsync_EmptyDocument_ShouldSendEmptyDeltas()
    {
        // Arrange
        var documentId = "empty-doc";
        var connectionId = "conn-456";

        var emptyDocument = new Document(documentId);

        SetupAuthenticatedConnectionWithReadAccess(connectionId, documentId);
        var entries = emptyDocument.GetAllDeltas().Select(sd => new SyncKit.Server.Storage.DeltaEntry
        {
            Id = sd.Id,
            DocumentId = documentId,
            ClientId = sd.ClientId,
            OperationType = "set",
            FieldPath = "field",
            Value = sd.Data,
            ClockValue = sd.VectorClock?.ToDict().Values.DefaultIfEmpty().Max() ?? 0,
            Timestamp = DateTime.UtcNow,
            VectorClock = sd.VectorClock?.ToDict()
        }).ToList();

        _mockStorage.Setup(s => s.GetDeltasAsync(documentId, It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(entries);
        _mockStorage.Setup(s => s.GetVectorClockAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, long>());
        _mockStorage.Setup(s => s.GetDocumentAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SyncKit.Server.Storage.DocumentState(documentId, JsonDocument.Parse("{}").RootElement, 1, DateTime.UtcNow, DateTime.UtcNow));
        _mockStorage.Setup(s => s.GetDocumentStateAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, object?>());

        var message = new SubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        SyncResponseMessage? sentResponse = null;
        _mockConnection.Setup(c => c.Send(It.IsAny<SyncResponseMessage>()))
            .Callback<IMessage>(msg => sentResponse = msg as SyncResponseMessage)
            .Returns(true);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert - Empty deltas list
        Assert.NotNull(sentResponse);
        Assert.Empty(sentResponse!.Deltas!);
        Assert.Empty(TestHelpers.AsDictionary(sentResponse!.State)!);
    }

    [Fact]
    public async Task HandleAsync_WithWrongMessageType_ShouldLogWarningAndReturn()
    {
        // Arrange
        var wrongMessage = new UnsubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = "doc-123"
        };

        // Act
        await _handler.HandleAsync(_mockConnection.Object, wrongMessage);

        // Assert - Should not interact with store or connection
        _mockStorage.Verify(s => s.GetDocumentAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        _mockConnection.Verify(c => c.AddSubscription(It.IsAny<string>()), Times.Never);
        _mockConnection.Verify(c => c.Send(It.IsAny<IMessage>()), Times.Never);
    }

    [Fact]
    public async Task HandleAsync_ShouldRegisterConnectionWithDocument()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";

        var document = new Document(documentId);

        SetupAuthenticatedConnectionWithReadAccess(connectionId, documentId);
        var entries = document.GetAllDeltas().Select(sd => new SyncKit.Server.Storage.DeltaEntry
        {
            Id = sd.Id,
            DocumentId = documentId,
            ClientId = sd.ClientId,
            OperationType = "set",
            FieldPath = "field",
            Value = sd.Data,
            ClockValue = sd.VectorClock?.ToDict().Values.DefaultIfEmpty().Max() ?? 0,
            Timestamp = DateTime.UtcNow,
            VectorClock = sd.VectorClock?.ToDict()
        }).ToList();

        _mockStorage.Setup(s => s.GetDeltasAsync(documentId, It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(entries);
        _mockStorage.Setup(s => s.GetVectorClockAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(document.GetAllDeltas().LastOrDefault()?.VectorClock?.ToDict() ?? new Dictionary<string, long>());

        var message = new SubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        // Act
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert - Connection subscribed via connection tracking
        _mockConnection.Verify(c => c.AddSubscription(documentId), Times.Once);
    }

    [Fact]
    public async Task HandleAsync_ShouldPreserveDeltaOrder()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";

        var document = new Document(documentId);
        document.AddDelta(CreateTestDelta("delta-1", "client-1", 1));
        document.AddDelta(CreateTestDelta("delta-2", "client-1", 2));
        document.AddDelta(CreateTestDelta("delta-3", "client-1", 3));

        SetupAuthenticatedConnectionWithReadAccess(connectionId, documentId);
        var entries = document.GetAllDeltas().Select(sd => new SyncKit.Server.Storage.DeltaEntry
        {
            Id = sd.Id,
            DocumentId = documentId,
            ClientId = sd.ClientId,
            OperationType = "set",
            FieldPath = "field",
            Value = sd.Data,
            ClockValue = sd.VectorClock?.ToDict().Values.DefaultIfEmpty().Max() ?? 0,
            Timestamp = DateTime.UtcNow,
            VectorClock = sd.VectorClock?.ToDict()
        }).ToList();

        _mockStorage.Setup(s => s.GetDeltasAsync(documentId, It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(entries);
        _mockStorage.Setup(s => s.GetVectorClockAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(document.GetAllDeltas().LastOrDefault()?.VectorClock?.ToDict() ?? new Dictionary<string, long>());

        var message = new SubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        SyncResponseMessage? sentResponse = null;
        _mockConnection.Setup(c => c.Send(It.IsAny<SyncResponseMessage>()))
            .Callback<IMessage>(msg => sentResponse = msg as SyncResponseMessage)
            .Returns(true);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert - Deltas in correct order
        Assert.NotNull(sentResponse);
        Assert.Equal(3, sentResponse!.Deltas!.Count);
        Assert.Equal(1, sentResponse.Deltas[0].VectorClock["client-1"]);
        Assert.Equal(2, sentResponse.Deltas[1].VectorClock["client-1"]);
        Assert.Equal(3, sentResponse.Deltas[2].VectorClock["client-1"]);
    }

    [Fact]
    public void Constructor_WithNullAuthGuard_ShouldThrowArgumentNullException()
    {
        // Act & Assert
        var exception = Assert.Throws<ArgumentNullException>(() =>
            new SubscribeMessageHandler(
                null!,
                _mockStorage.Object,
                _mockLogger.Object));

        Assert.Equal("authGuard", exception.ParamName);
    }

    [Fact]
    public void Constructor_WithNullDocumentStore_ShouldThrowArgumentNullException()
    {
        // Act & Assert
        var exception = Assert.Throws<ArgumentNullException>(() =>
            new SubscribeMessageHandler(
                _authGuard,
                (SyncKit.Server.Storage.IStorageAdapter)null!,
                _mockLogger.Object));

        Assert.Equal("storage", exception.ParamName);
    }

    [Fact]
    public void Constructor_WithNullLogger_ShouldThrowArgumentNullException()
    {
        // Act & Assert
        var exception = Assert.Throws<ArgumentNullException>(() =>
            new SubscribeMessageHandler(
                _authGuard,
                _mockStorage.Object,
                null!));

        Assert.Equal("logger", exception.ParamName);
    }

    [Fact]
    public async Task HandleAsync_ShouldLogSubscriptionSuccess()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";
        var userId = "user-789";

        SetupAuthenticatedConnectionWithReadAccess(connectionId, documentId, userId);

        _mockStorage.Setup(s => s.GetDeltasAsync(documentId, It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<SyncKit.Server.Storage.DeltaEntry>());
        _mockStorage.Setup(s => s.GetVectorClockAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, long>());
        _mockStorage.Setup(s => s.GetDocumentAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((SyncKit.Server.Storage.DocumentState?)null);

        var message = new SubscribeMessage
        {
            Id = "msg-1",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId
        };

        // Act
        await _handler.HandleAsync(_mockConnection.Object, message);

        // Assert - Verify information logging occurred
        _mockLogger.Verify(
            l => l.Log(
                LogLevel.Information,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((o, t) => o.ToString()!.Contains("subscribed")),
                null,
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.Once);
    }

    #region Helper Methods

    private void SetupAuthenticatedConnectionWithReadAccess(string connectionId, string documentId, string? userId = null)
    {
        SetupAuthenticatedConnectionWithReadAccess(_mockConnection, connectionId, documentId, userId);
    }

    private void SetupAuthenticatedConnectionWithReadAccess(Mock<IConnection> mockConnection, string connectionId, string documentId, string? userId = null)
    {
        mockConnection.Setup(c => c.Id).Returns(connectionId);
        mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticated);
        mockConnection.Setup(c => c.UserId).Returns(userId ?? "user-1");
        mockConnection.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);
        mockConnection.Setup(c => c.TokenPayload).Returns(new TokenPayload
        {
            UserId = userId ?? "user-1",
            Permissions = new DocumentPermissions
            {
                IsAdmin = false,
                CanRead = new[] { documentId },
                CanWrite = Array.Empty<string>()
            }
        });
    }

    private void SetupAuthenticatedConnectionWithoutReadAccess(string connectionId, string documentId)
    {
        _mockConnection.Setup(c => c.Id).Returns(connectionId);
        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticated);
        _mockConnection.Setup(c => c.UserId).Returns("user-1");
        _mockConnection.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);
        _mockConnection.Setup(c => c.TokenPayload).Returns(new TokenPayload
        {
            UserId = "user-1",
            Permissions = new DocumentPermissions
            {
                IsAdmin = false,
                CanRead = Array.Empty<string>(), // No read access
                CanWrite = Array.Empty<string>()
            }
        });
    }

    private static StoredDelta CreateTestDelta(string id, string clientId, long clockValue)
    {
        var vectorClock = new VectorClock(new Dictionary<string, long>
        {
            [clientId] = clockValue
        });

        return new StoredDelta
        {
            Id = id,
            ClientId = clientId,
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Data = JsonDocument.Parse("{}").RootElement,
            VectorClock = vectorClock
        };
    }

    #endregion
}
