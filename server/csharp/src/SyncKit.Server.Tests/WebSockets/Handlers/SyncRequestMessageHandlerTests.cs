using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SyncKit.Server.Auth;
using SyncKit.Server.Sync;
using SyncKit.Server.Tests;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Handlers;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;
namespace SyncKit.Server.Tests.WebSockets.Handlers;

public class SyncRequestMessageHandlerTests
{
    private readonly AuthGuard _authGuard;
    private readonly Mock<SyncKit.Server.Storage.IStorageAdapter> _mockStorage;
    private readonly Mock<IConnection> _mockConnection;
    private readonly SyncRequestMessageHandler _handler;

    // In-memory mapping to simulate document deltas per document id for tests
    private readonly Dictionary<string, IReadOnlyList<SyncKit.Server.Storage.DeltaEntry>> _storageDeltas = new();

    public SyncRequestMessageHandlerTests()
    {
        _authGuard = new AuthGuard(NullLogger<AuthGuard>.Instance);
        _mockStorage = new Mock<SyncKit.Server.Storage.IStorageAdapter>();
        _mockConnection = new Mock<IConnection>();

        // Default storage behavior: consult _storageDeltas map for entries and compute merged vector clock
        _mockStorage.Setup(s => s.GetDeltasAsync(It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string id, int limit, CancellationToken ct) =>
                _storageDeltas.TryGetValue(id, out var list) ? list : Array.Empty<SyncKit.Server.Storage.DeltaEntry>().ToList().AsReadOnly());

        _mockStorage.Setup(s => s.GetVectorClockAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string id, CancellationToken ct) =>
            {
                if (!_storageDeltas.TryGetValue(id, out var list)) return new Dictionary<string, long>();
                var merged = new Dictionary<string, long>();
                foreach (var e in list)
                {
                    if (e.VectorClock == null) continue;
                    foreach (var kv in e.VectorClock)
                    {
                        if (!merged.ContainsKey(kv.Key) || merged[kv.Key] < kv.Value)
                            merged[kv.Key] = kv.Value;
                    }
                }
                return merged;
            });

        // Document existence is determined by presence in _storageDeltas; return a DocumentState with merged vector clock when present
        _mockStorage.Setup(s => s.GetDocumentAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string id, CancellationToken ct) =>
            {
                if (!_storageDeltas.TryGetValue(id, out var list)) return (Storage.DocumentState?)null;
                var merged = new Dictionary<string, long>();
                foreach (var e in list)
                {
                    if (e.VectorClock == null) continue;
                    foreach (var kv in e.VectorClock)
                    {
                        if (!merged.ContainsKey(kv.Key) || merged[kv.Key] < kv.Value)
                            merged[kv.Key] = kv.Value;
                    }
                }
                return new Storage.DocumentState(
                    id,
                    JsonSerializer.Deserialize<JsonElement>("{}"),
                    1,
                    DateTime.UtcNow,
                    DateTime.UtcNow
                );
            });

        _handler = new SyncRequestMessageHandler(
            _authGuard,
            _mockStorage.Object,
            NullLogger<SyncRequestMessageHandler>.Instance);
    }

    [Fact]
    public void Constructor_WithNullStorage_ShouldThrowArgumentNullException()
    {
        var exception = Assert.Throws<ArgumentNullException>(() =>
            new SyncRequestMessageHandler(
                _authGuard,
                (SyncKit.Server.Storage.IStorageAdapter)null!,
                NullLogger<SyncRequestMessageHandler>.Instance));

        Assert.Equal("storage", exception.ParamName);
    }

    [Fact]
    public void HandledTypes_ShouldReturnSyncRequest()
    {
        // Arrange & Act
        var types = _handler.HandledTypes;

        // Assert
        Assert.Single(types);
        Assert.Equal(MessageType.SyncRequest, types[0]);
    }

    [Fact]
    public async Task HandleAsync_WithNonExistentDocument_ShouldReturnEmptyResponse()
    {
        // Arrange
        var documentId = "non-existent-doc";
        var connectionId = "conn-456";
        var messageId = "msg-1";

        SetupAuthenticatedConnectionWithReadAccess(connectionId, documentId);
        _mockStorage.Setup(s => s.GetDeltasAsync(documentId, It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<SyncKit.Server.Storage.DeltaEntry>());
        _mockStorage.Setup(s => s.GetVectorClockAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, long>());

        SyncResponseMessage? response = null;
        _mockConnection.Setup(c => c.Send(It.IsAny<SyncResponseMessage>()))
            .Callback<IMessage>(msg => response = msg as SyncResponseMessage)
            .Returns(true);

        var request = CreateSyncRequestMessage(messageId, documentId);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, request);

        // Assert - Empty response should be sent
        Assert.NotNull(response);
        Assert.Equal(MessageType.SyncResponse, response.Type);
        Assert.Equal(messageId, response.RequestId);
        Assert.Equal(documentId, response.DocumentId);
        Assert.NotNull(response.State);
        Assert.Empty(TestHelpers.AsDictionary(response.State)!);
        Assert.NotNull(response.Deltas);
        Assert.Empty(response.Deltas);
    }

    [Fact]
    public async Task HandleAsync_WithExistingDocument_ShouldReturnCurrentState()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";
        var messageId = "msg-1";

        SetupAuthenticatedConnectionWithReadAccess(connectionId, documentId);

        var entries = new List<SyncKit.Server.Storage.DeltaEntry>
        {
            new SyncKit.Server.Storage.DeltaEntry
            {
                Id = "delta-1",
                DocumentId = documentId,
                ClientId = "client-1",
                OperationType = "set",
                FieldPath = "field",
                Value = JsonSerializer.Deserialize<JsonElement>("{\"id\":\"delta-1\"}"),
                ClockValue = 1,
                Timestamp = DateTime.UtcNow,
                VectorClock = new Dictionary<string, long> { { "client-1", 1 } }
            },
            new SyncKit.Server.Storage.DeltaEntry
            {
                Id = "delta-2",
                DocumentId = documentId,
                ClientId = "client-1",
                OperationType = "set",
                FieldPath = "field",
                Value = JsonSerializer.Deserialize<JsonElement>("{\"id\":\"delta-2\"}"),
                ClockValue = 2,
                Timestamp = DateTime.UtcNow,
                VectorClock = new Dictionary<string, long> { { "client-1", 2 } }
            }
        };

        _storageDeltas[documentId] = entries;

        SyncResponseMessage? response = null;
        _mockConnection.Setup(c => c.Send(It.IsAny<SyncResponseMessage>()))
            .Callback<IMessage>(msg => response = msg as SyncResponseMessage)
            .Returns(true);

        var request = CreateSyncRequestMessage(messageId, documentId);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, request);

        // Assert - Response should contain all deltas
        Assert.NotNull(response);
        Assert.Equal(MessageType.SyncResponse, response.Type);
        Assert.Equal(messageId, response.RequestId);
        Assert.Equal(documentId, response.DocumentId);
        Assert.NotNull(response.Deltas);
        Assert.Equal(2, response.Deltas.Count);

        // State should reflect merged vector clock
        Assert.NotNull(response.State);
        var stateDict = TestHelpers.AsDictionary(response.State)!;
        Assert.Equal(2L, ((JsonElement)stateDict["client-1"]).GetInt64());
    }

    [Fact]
    public async Task HandleAsync_WithVectorClock_ShouldReturnDeltasSinceClientClock()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";
        var messageId = "msg-1";

        SetupAuthenticatedConnectionWithReadAccess(connectionId, documentId);

        var entries = new List<SyncKit.Server.Storage.DeltaEntry>
        {
            new SyncKit.Server.Storage.DeltaEntry
            {
                Id = "delta-1",
                DocumentId = documentId,
                ClientId = "client-1",
                OperationType = "set",
                FieldPath = "field",
                Value = JsonSerializer.Deserialize<JsonElement>("{\"id\":\"delta-1\"}"),
                ClockValue = 1,
                Timestamp = DateTime.UtcNow,
                VectorClock = new Dictionary<string, long> { { "client-1", 1 } }
            },
            new SyncKit.Server.Storage.DeltaEntry
            {
                Id = "delta-2",
                DocumentId = documentId,
                ClientId = "client-1",
                OperationType = "set",
                FieldPath = "field",
                Value = JsonSerializer.Deserialize<JsonElement>("{\"id\":\"delta-2\"}"),
                ClockValue = 2,
                Timestamp = DateTime.UtcNow,
                VectorClock = new Dictionary<string, long> { { "client-1", 2 } }
            },
            new SyncKit.Server.Storage.DeltaEntry
            {
                Id = "delta-3",
                DocumentId = documentId,
                ClientId = "client-1",
                OperationType = "set",
                FieldPath = "field",
                Value = JsonSerializer.Deserialize<JsonElement>("{\"id\":\"delta-3\"}"),
                ClockValue = 3,
                Timestamp = DateTime.UtcNow,
                VectorClock = new Dictionary<string, long> { { "client-1", 3 } }
            }
        };

        _storageDeltas[documentId] = entries;

        SyncResponseMessage? response = null;
        _mockConnection.Setup(c => c.Send(It.IsAny<SyncResponseMessage>()))
            .Callback<IMessage>(msg => response = msg as SyncResponseMessage)
            .Returns(true);

        // Client already has up to clock value 1
        var clientClock = new Dictionary<string, long> { { "client-1", 1 } };
        var request = CreateSyncRequestMessage(messageId, documentId, clientClock);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, request);

        // Assert - Should only return deltas AFTER client's clock
        Assert.NotNull(response);
        Assert.NotNull(response.Deltas);
        Assert.Equal(2, response.Deltas.Count); // delta-2 and delta-3

        // State should be current server state
        Assert.NotNull(response.State);
        var stateDict = TestHelpers.AsDictionary(response.State)!;
        Assert.Equal(3L, ((JsonElement)stateDict["client-1"]).GetInt64());
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

        var request = CreateSyncRequestMessage("msg-1", documentId);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, request);

        // Assert - Error should be sent
        _mockConnection.Verify(c => c.Send(It.Is<ErrorMessage>(
            m => m.Error == "Not authenticated")), Times.Once);

        // Should NOT query document store
        _mockStorage.Verify(s => s.GetDeltasAsync(It.IsAny<string>(), It.IsAny<int>()), Times.Never);
        _mockStorage.Verify(s => s.GetVectorClockAsync(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task HandleAsync_WithoutReadPermission_ShouldSendError()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";

        // Setup connection without read access
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

        var request = CreateSyncRequestMessage("msg-1", documentId);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, request);

        // Assert - Permission denied error should be sent
        _mockConnection.Verify(c => c.Send(It.Is<ErrorMessage>(
            m => m.Error == "Permission denied")), Times.Once);

        // Should NOT query document store
        _mockStorage.Verify(s => s.GetDeltasAsync(It.IsAny<string>(), It.IsAny<int>()), Times.Never);
        _mockStorage.Verify(s => s.GetVectorClockAsync(It.IsAny<string>()), Times.Never);
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

        // Assert - Should not interact with store
        _mockStorage.Verify(s => s.GetDeltasAsync(It.IsAny<string>(), It.IsAny<int>()), Times.Never);
        _mockStorage.Verify(s => s.GetVectorClockAsync(It.IsAny<string>()), Times.Never);
        _mockConnection.Verify(c => c.Send(It.IsAny<SyncResponseMessage>()), Times.Never);
    }

    [Fact]
    public async Task HandleAsync_AdminUser_ShouldHaveReadAccessToAnyDocument()
    {
        // Arrange
        var documentId = "any-document";
        var connectionId = "conn-1";

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

        // Mark document as existing in storage so admin path will query deltas
        _storageDeltas[documentId] = new List<SyncKit.Server.Storage.DeltaEntry>();
        _mockStorage.Setup(s => s.GetDeltasAsync(documentId, It.IsAny<int>()))
            .ReturnsAsync(new List<SyncKit.Server.Storage.DeltaEntry>());
        _mockStorage.Setup(s => s.GetVectorClockAsync(documentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, long>());

        var request = CreateSyncRequestMessage("msg-1", documentId);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, request);

        // Assert - Should query document store (admin has access)
        _mockStorage.Verify(s => s.GetDeltasAsync(documentId, It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Once);
        _mockStorage.Verify(s => s.GetVectorClockAsync(documentId), Times.Once);
        _mockConnection.Verify(c => c.Send(It.IsAny<SyncResponseMessage>()), Times.Once);
    }

    [Fact]
    public async Task HandleAsync_ShouldIncludeRequestIdInResponse()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";
        var originalRequestId = "original-request-id-12345";

        SetupAuthenticatedConnectionWithReadAccess(connectionId, documentId);
        _mockStorage.Setup(s => s.GetDeltasAsync(documentId, It.IsAny<int>()))
            .ReturnsAsync(new List<SyncKit.Server.Storage.DeltaEntry>());
        _mockStorage.Setup(s => s.GetVectorClockAsync(documentId))
            .ReturnsAsync(new Dictionary<string, long>());

        SyncResponseMessage? response = null;
        _mockConnection.Setup(c => c.Send(It.IsAny<SyncResponseMessage>()))
            .Callback<IMessage>(msg => response = msg as SyncResponseMessage)
            .Returns(true);

        var request = CreateSyncRequestMessage(originalRequestId, documentId);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, request);

        // Assert - Response should reference the original request ID
        Assert.NotNull(response);
        Assert.Equal(originalRequestId, response.RequestId);
        Assert.NotEmpty(response.Id); // Should have its own unique ID
    }

    [Fact]
    public async Task HandleAsync_ShouldHaveValidTimestamp()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";

        SetupAuthenticatedConnectionWithReadAccess(connectionId, documentId);
        _mockStorage.Setup(s => s.GetDeltasAsync(documentId, It.IsAny<int>()))
            .ReturnsAsync(new List<SyncKit.Server.Storage.DeltaEntry>());
        _mockStorage.Setup(s => s.GetVectorClockAsync(documentId))
            .ReturnsAsync(new Dictionary<string, long>());

        var beforeTimestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        SyncResponseMessage? response = null;
        _mockConnection.Setup(c => c.Send(It.IsAny<SyncResponseMessage>()))
            .Callback<IMessage>(msg => response = msg as SyncResponseMessage)
            .Returns(true);

        var request = CreateSyncRequestMessage("msg-1", documentId);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, request);

        var afterTimestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        // Assert - Timestamp should be within reasonable range
        Assert.NotNull(response);
        Assert.True(response.Timestamp >= beforeTimestamp);
        Assert.True(response.Timestamp <= afterTimestamp);
    }

    [Fact]
    public async Task HandleAsync_WithNullVectorClock_ShouldReturnAllDeltas()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";

        SetupAuthenticatedConnectionWithReadAccess(connectionId, documentId);

        var entries = new List<SyncKit.Server.Storage.DeltaEntry>
        {
            new SyncKit.Server.Storage.DeltaEntry
            {
                Id = "delta-1",
                DocumentId = documentId,
                ClientId = "client-1",
                OperationType = "set",
                FieldPath = "field",
                Value = JsonSerializer.Deserialize<JsonElement>("{\"id\":\"delta-1\"}"),
                ClockValue = 1,
                Timestamp = DateTime.UtcNow,
                VectorClock = new Dictionary<string, long> { { "client-1", 1 } }
            },
            new SyncKit.Server.Storage.DeltaEntry
            {
                Id = "delta-2",
                DocumentId = documentId,
                ClientId = "client-1",
                OperationType = "set",
                FieldPath = "field",
                Value = JsonSerializer.Deserialize<JsonElement>("{\"id\":\"delta-2\"}"),
                ClockValue = 2,
                Timestamp = DateTime.UtcNow,
                VectorClock = new Dictionary<string, long> { { "client-1", 2 } }
            },
            new SyncKit.Server.Storage.DeltaEntry
            {
                Id = "delta-3",
                DocumentId = documentId,
                ClientId = "client-2",
                OperationType = "set",
                FieldPath = "field",
                Value = JsonSerializer.Deserialize<JsonElement>("{\"id\":\"delta-3\"}"),
                ClockValue = 1,
                Timestamp = DateTime.UtcNow,
                VectorClock = new Dictionary<string, long> { { "client-2", 1 } }
            }
        };

        _storageDeltas[documentId] = entries;

        SyncResponseMessage? response = null;
        _mockConnection.Setup(c => c.Send(It.IsAny<SyncResponseMessage>()))
            .Callback<IMessage>(msg => response = msg as SyncResponseMessage)
            .Returns(true);

        // Request with null vector clock (initial sync)
        var request = CreateSyncRequestMessage("msg-1", documentId, vectorClock: null);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, request);

        // Assert - Should return ALL deltas
        Assert.NotNull(response);
        Assert.NotNull(response.Deltas);
        Assert.Equal(3, response.Deltas.Count);
    }

    [Fact]
    public async Task HandleAsync_WithEmptyVectorClock_ShouldReturnAllDeltas()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";

        SetupAuthenticatedConnectionWithReadAccess(connectionId, documentId);

        var entries = new List<SyncKit.Server.Storage.DeltaEntry>
        {
            new SyncKit.Server.Storage.DeltaEntry
            {
                Id = "delta-1",
                DocumentId = documentId,
                ClientId = "client-1",
                OperationType = "set",
                FieldPath = "field",
                Value = JsonSerializer.Deserialize<JsonElement>("{\"id\":\"delta-1\"}"),
                ClockValue = 1,
                Timestamp = DateTime.UtcNow,
                VectorClock = new Dictionary<string, long> { { "client-1", 1 } }
            },
            new SyncKit.Server.Storage.DeltaEntry
            {
                Id = "delta-2",
                DocumentId = documentId,
                ClientId = "client-1",
                OperationType = "set",
                FieldPath = "field",
                Value = JsonSerializer.Deserialize<JsonElement>("{\"id\":\"delta-2\"}"),
                ClockValue = 2,
                Timestamp = DateTime.UtcNow,
                VectorClock = new Dictionary<string, long> { { "client-1", 2 } }
            }
        };

        _storageDeltas[documentId] = entries;

        SyncResponseMessage? response = null;
        _mockConnection.Setup(c => c.Send(It.IsAny<SyncResponseMessage>()))
            .Callback<IMessage>(msg => response = msg as SyncResponseMessage)
            .Returns(true);

        // Request with empty vector clock
        var request = CreateSyncRequestMessage("msg-1", documentId, new Dictionary<string, long>());

        // Act
        await _handler.HandleAsync(_mockConnection.Object, request);

        // Assert - Should return ALL deltas
        Assert.NotNull(response);
        Assert.NotNull(response.Deltas);
        Assert.Equal(2, response.Deltas.Count);
    }

    [Fact]
    public async Task HandleAsync_WhenClientIsUpToDate_ShouldReturnNoDeltas()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";

        SetupAuthenticatedConnectionWithReadAccess(connectionId, documentId);

        var entries = new List<SyncKit.Server.Storage.DeltaEntry>
        {
            new SyncKit.Server.Storage.DeltaEntry
            {
                Id = "delta-1",
                DocumentId = documentId,
                ClientId = "client-1",
                OperationType = "set",
                FieldPath = "field",
                Value = JsonSerializer.Deserialize<JsonElement>("{\"id\":\"delta-1\"}"),
                ClockValue = 5,
                Timestamp = DateTime.UtcNow,
                VectorClock = new Dictionary<string, long> { { "client-1", 5 } }
            }
        };

        _storageDeltas[documentId] = entries;

        SyncResponseMessage? response = null;
        _mockConnection.Setup(c => c.Send(It.IsAny<SyncResponseMessage>()))
            .Callback<IMessage>(msg => response = msg as SyncResponseMessage)
            .Returns(true);

        // Client already has the latest state
        var clientClock = new Dictionary<string, long> { { "client-1", 5 } };
        var request = CreateSyncRequestMessage("msg-1", documentId, clientClock);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, request);

        // Assert - Should return empty deltas (client is up to date)
        Assert.NotNull(response);
        Assert.NotNull(response.Deltas);
        Assert.Empty(response.Deltas);

        // State should still be returned
        Assert.NotNull(response.State);
        var stateDict = TestHelpers.AsDictionary(response.State)!;
        Assert.Equal(5L, ((JsonElement)stateDict["client-1"]).GetInt64());
    }

    [Fact]
    public async Task HandleAsync_DeltaPayloadsShouldHaveCorrectVectorClocks()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";

        SetupAuthenticatedConnectionWithReadAccess(connectionId, documentId);

        var entries = new List<SyncKit.Server.Storage.DeltaEntry>
        {
            new SyncKit.Server.Storage.DeltaEntry
            {
                Id = "delta-1",
                DocumentId = documentId,
                ClientId = "client-a",
                OperationType = "set",
                FieldPath = "field",
                Value = JsonSerializer.Deserialize<JsonElement>("{\"op\":\"set\",\"field\":\"a\"}"),
                ClockValue = 1,
                Timestamp = DateTime.UtcNow,
                VectorClock = new Dictionary<string, long> { { "client-a", 1 } }
            },
            new SyncKit.Server.Storage.DeltaEntry
            {
                Id = "delta-2",
                DocumentId = documentId,
                ClientId = "client-b",
                OperationType = "set",
                FieldPath = "field",
                Value = JsonSerializer.Deserialize<JsonElement>("{\"op\":\"set\",\"field\":\"b\"}"),
                ClockValue = 1,
                Timestamp = DateTime.UtcNow,
                VectorClock = new Dictionary<string, long> { { "client-a", 1 }, { "client-b", 1 } }
            }
        };

        _storageDeltas[documentId] = entries;

        SyncResponseMessage? response = null;
        _mockConnection.Setup(c => c.Send(It.IsAny<SyncResponseMessage>()))
            .Callback<IMessage>(msg => response = msg as SyncResponseMessage)
            .Returns(true);

        var request = CreateSyncRequestMessage("msg-1", documentId);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, request);

        // Assert - Each delta payload should have its correct vector clock
        Assert.NotNull(response);
        Assert.NotNull(response.Deltas);
        Assert.Equal(2, response.Deltas.Count);

        Assert.Equal(1, response.Deltas[0].VectorClock["client-a"]);
        Assert.Single(response.Deltas[0].VectorClock);

        Assert.Equal(1, response.Deltas[1].VectorClock["client-a"]);
        Assert.Equal(1, response.Deltas[1].VectorClock["client-b"]);
        Assert.Equal(2, response.Deltas[1].VectorClock.Count);
    }

    [Fact]
    public void Constructor_WithNullAuthGuard_ShouldThrowArgumentNullException()
    {
        // Act & Assert
        var exception = Assert.Throws<ArgumentNullException>(() =>
            new SyncRequestMessageHandler(
                null!,
                new Mock<SyncKit.Server.Storage.IStorageAdapter>().Object,
                NullLogger<SyncRequestMessageHandler>.Instance));

        Assert.Equal("authGuard", exception.ParamName);
    }

    [Fact]
    public void Constructor_WithNullDocumentStore_ShouldThrowArgumentNullException()
    {
        // Act & Assert
        var exception = Assert.Throws<ArgumentNullException>(() =>
            new SyncRequestMessageHandler(
                _authGuard,
                (SyncKit.Server.Storage.IStorageAdapter)null!,
                NullLogger<SyncRequestMessageHandler>.Instance));

        Assert.Equal("storage", exception.ParamName);
    }

    [Fact]
    public void Constructor_WithNullLogger_ShouldThrowArgumentNullException()
    {
        // Act & Assert
        var exception = Assert.Throws<ArgumentNullException>(() =>
            new SyncRequestMessageHandler(
                _authGuard,
                new Mock<SyncKit.Server.Storage.IStorageAdapter>().Object,
                null!));

        Assert.Equal("logger", exception.ParamName);
    }

    [Fact]
    public async Task HandleAsync_ShouldPreserveDeltaDataInResponse()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";

        SetupAuthenticatedConnectionWithReadAccess(connectionId, documentId);

        var deltaData = JsonSerializer.Deserialize<JsonElement>("{\"operation\":\"set\",\"path\":\"title\",\"value\":\"Hello World\"}");
        var entries = new List<SyncKit.Server.Storage.DeltaEntry>
        {
            new SyncKit.Server.Storage.DeltaEntry
            {
                Id = "delta-1",
                DocumentId = documentId,
                ClientId = "client-1",
                OperationType = "set",
                FieldPath = "title",
                Value = deltaData,
                ClockValue = 1,
                Timestamp = DateTime.UtcNow,
                VectorClock = new Dictionary<string, long> { { "client-1", 1 } }
            }
        };

        _storageDeltas[documentId] = entries;

        SyncResponseMessage? response = null;
        _mockConnection.Setup(c => c.Send(It.IsAny<SyncResponseMessage>()))
            .Callback<IMessage>(msg => response = msg as SyncResponseMessage)
            .Returns(true);

        var request = CreateSyncRequestMessage("msg-1", documentId);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, request);

        // Assert - Delta data should be preserved
        Assert.NotNull(response);
        Assert.NotNull(response.Deltas);
        Assert.Single(response.Deltas);

        var responseJson = response.Deltas[0].Delta.GetRawText();
        Assert.Contains("operation", responseJson);
        Assert.Contains("set", responseJson);
        Assert.Contains("Hello World", responseJson);
    }

    [Fact]
    public async Task HandleAsync_WithMultipleClients_ShouldFilterCorrectly()
    {
        // Arrange
        var documentId = "doc-123";
        var connectionId = "conn-456";

        SetupAuthenticatedConnectionWithReadAccess(connectionId, documentId);

        var entries = new List<SyncKit.Server.Storage.DeltaEntry>
        {
            new SyncKit.Server.Storage.DeltaEntry
            {
                Id = "delta-a1",
                DocumentId = documentId,
                ClientId = "client-a",
                OperationType = "set",
                FieldPath = "field",
                Value = JsonSerializer.Deserialize<JsonElement>("{\"id\":\"delta-a1\"}"),
                ClockValue = 1,
                Timestamp = DateTime.UtcNow,
                VectorClock = new Dictionary<string, long> { { "client-a", 1 } }
            },
            new SyncKit.Server.Storage.DeltaEntry
            {
                Id = "delta-a2",
                DocumentId = documentId,
                ClientId = "client-a",
                OperationType = "set",
                FieldPath = "field",
                Value = JsonSerializer.Deserialize<JsonElement>("{\"id\":\"delta-a2\"}"),
                ClockValue = 2,
                Timestamp = DateTime.UtcNow,
                VectorClock = new Dictionary<string, long> { { "client-a", 2 } }
            },
            new SyncKit.Server.Storage.DeltaEntry
            {
                Id = "delta-b1",
                DocumentId = documentId,
                ClientId = "client-b",
                OperationType = "set",
                FieldPath = "field",
                Value = JsonSerializer.Deserialize<JsonElement>("{\"id\":\"delta-b1\"}"),
                ClockValue = 1,
                Timestamp = DateTime.UtcNow,
                VectorClock = new Dictionary<string, long> { { "client-a", 2 }, { "client-b", 1 } }
            }
        };

        _storageDeltas[documentId] = entries;

        SyncResponseMessage? response = null;
        _mockConnection.Setup(c => c.Send(It.IsAny<SyncResponseMessage>()))
            .Callback<IMessage>(msg => response = msg as SyncResponseMessage)
            .Returns(true);

        // Client has seen client-a's first delta, but not client-b's
        var clientClock = new Dictionary<string, long> { { "client-a", 1 } };
        var request = CreateSyncRequestMessage("msg-1", documentId, clientClock);

        // Act
        await _handler.HandleAsync(_mockConnection.Object, request);

        // Assert - Should return deltas after client's clock
        Assert.NotNull(response);
        Assert.NotNull(response.Deltas);
        // Should include delta-a2 and delta-b1 (everything after { client-a: 1 })
        Assert.True(response.Deltas.Count >= 2);
    }

    #region Helper Methods

    private void SetupAuthenticatedConnectionWithReadAccess(string connectionId, string documentId)
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
                CanRead = new[] { documentId },
                CanWrite = new[] { documentId }
            }
        });
    }

    private static SyncRequestMessage CreateSyncRequestMessage(
        string messageId,
        string documentId,
        Dictionary<string, long>? vectorClock = null)
    {
        return new SyncRequestMessage
        {
            Id = messageId,
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            DocumentId = documentId,
            VectorClock = vectorClock
        };
    }

    private static StoredDelta CreateStoredDelta(string deltaId, string clientId, long clockValue)
    {
        return new StoredDelta
        {
            Id = deltaId,
            ClientId = clientId,
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Data = JsonSerializer.Deserialize<JsonElement>($"{{\"id\":\"{deltaId}\"}}"),
            VectorClock = new VectorClock(new Dictionary<string, long> { { clientId, clockValue } })
        };
    }

    private static StoredDelta CreateStoredDeltaWithClock(
        string deltaId,
        string clientId,
        Dictionary<string, long> clock)
    {
        return new StoredDelta
        {
            Id = deltaId,
            ClientId = clientId,
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Data = JsonSerializer.Deserialize<JsonElement>($"{{\"id\":\"{deltaId}\"}}"),
            VectorClock = new VectorClock(clock)
        };
    }

    #endregion
}
