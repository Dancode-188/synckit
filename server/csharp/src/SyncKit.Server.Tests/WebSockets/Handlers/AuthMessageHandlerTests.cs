using System.Net.WebSockets;
using Microsoft.Extensions.Logging;
using Moq;
using SyncKit.Server.Auth;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Handlers;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;
using Xunit;

namespace SyncKit.Server.Tests.WebSockets.Handlers;

public class AuthMessageHandlerTests
{
    private readonly Mock<IJwtValidator> _jwtValidator;
    private readonly Mock<IApiKeyValidator> _apiKeyValidator;
    private readonly Mock<ILogger<AuthMessageHandler>> _logger;
    private readonly AuthMessageHandler _handler;

    public AuthMessageHandlerTests()
    {
        _jwtValidator = new Mock<IJwtValidator>();
        _apiKeyValidator = new Mock<IApiKeyValidator>();
        _logger = new Mock<ILogger<AuthMessageHandler>>();
        _handler = new AuthMessageHandler(_jwtValidator.Object, _apiKeyValidator.Object, _logger.Object);
    }

    private Mock<IConnection> CreateMockConnection()
    {
        var connection = new Mock<IConnection>();
        connection.Setup(c => c.Id).Returns("test-conn-123");
        connection.Setup(c => c.State).Returns(ConnectionState.Authenticating);
        connection.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);
        return connection;
    }

    [Fact]
    public void HandledTypes_ReturnsAuthMessageType()
    {
        // Act
        var types = _handler.HandledTypes;

        // Assert
        Assert.Single(types);
        Assert.Equal(MessageType.Auth, types[0]);
    }

    [Fact]
    public async Task HandleAsync_ValidJwtToken_SendsAuthSuccess()
    {
        // Arrange
        var connection = CreateMockConnection();
        var validPayload = new TokenPayload
        {
            UserId = "user-123",
            Permissions = new DocumentPermissions { IsAdmin = true }
        };
        _jwtValidator.Setup(v => v.Validate("valid-token")).Returns(validPayload);

        var authMessage = new AuthMessage
        {
            Id = "msg-1",
            Timestamp = 1234567890,
            Token = "valid-token"
        };

        // Act
        await _handler.HandleAsync(connection.Object, authMessage);

        // Assert
        connection.Verify(c => c.Send(It.Is<AuthSuccessMessage>(m =>
            m.UserId == "user-123" &&
            m.Permissions.ContainsKey("isAdmin") &&
            (bool)m.Permissions["isAdmin"] == true)), Times.Once);
        connection.VerifySet(c => c.UserId = "user-123");
        connection.VerifySet(c => c.TokenPayload = validPayload);
        connection.VerifySet(c => c.State = ConnectionState.Authenticated);
    }

    [Fact]
    public async Task HandleAsync_ValidApiKey_SendsAuthSuccess()
    {
        // Arrange
        var connection = CreateMockConnection();
        var validPayload = new TokenPayload
        {
            UserId = "api-user",
            Permissions = new DocumentPermissions { IsAdmin = true }
        };
        _apiKeyValidator.Setup(v => v.Validate("sk_test_123")).Returns(validPayload);

        var authMessage = new AuthMessage
        {
            Id = "msg-1",
            Timestamp = 1234567890,
            ApiKey = "sk_test_123"
        };

        // Act
        await _handler.HandleAsync(connection.Object, authMessage);

        // Assert
        connection.Verify(c => c.Send(It.Is<AuthSuccessMessage>(m =>
            m.UserId == "api-user")), Times.Once);
        connection.VerifySet(c => c.UserId = "api-user");
        connection.VerifySet(c => c.TokenPayload = validPayload);
        connection.VerifySet(c => c.State = ConnectionState.Authenticated);
    }

    [Fact]
    public async Task HandleAsync_InvalidCredentials_SendsAuthErrorAndCloses()
    {
        // Arrange
        var connection = CreateMockConnection();
        _jwtValidator.Setup(v => v.Validate(It.IsAny<string>())).Returns((TokenPayload?)null);
        _apiKeyValidator.Setup(v => v.Validate(It.IsAny<string>())).Returns((TokenPayload?)null);

        var authMessage = new AuthMessage
        {
            Id = "msg-1",
            Timestamp = 1234567890,
            Token = "invalid-token"
        };

        // Act
        await _handler.HandleAsync(connection.Object, authMessage);

        // Assert
        connection.Verify(c => c.Send(It.Is<AuthErrorMessage>(m =>
            m.Error.Contains("Authentication failed"))), Times.Once);
        connection.Verify(c => c.CloseAsync(
            WebSocketCloseStatus.PolicyViolation,
            It.IsAny<string>(),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task HandleAsync_AlreadyAuthenticated_IgnoresMessage()
    {
        // Arrange
        var connection = CreateMockConnection();
        connection.Setup(c => c.State).Returns(ConnectionState.Authenticated);

        var authMessage = new AuthMessage
        {
            Id = "msg-1",
            Timestamp = 1234567890,
            Token = "some-token"
        };

        // Act
        await _handler.HandleAsync(connection.Object, authMessage);

        // Assert
        connection.Verify(c => c.Send(It.IsAny<IMessage>()), Times.Never);
        connection.Verify(c => c.CloseAsync(
            It.IsAny<WebSocketCloseStatus>(),
            It.IsAny<string>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task HandleAsync_JwtFailsApiKeySucceeds_UsesApiKey()
    {
        // Arrange
        var connection = CreateMockConnection();
        _jwtValidator.Setup(v => v.Validate("bad-jwt")).Returns((TokenPayload?)null);
        _apiKeyValidator.Setup(v => v.Validate("good-key")).Returns(new TokenPayload
        {
            UserId = "api-user",
            Permissions = new DocumentPermissions()
        });

        var authMessage = new AuthMessage
        {
            Id = "msg-1",
            Timestamp = 1234567890,
            Token = "bad-jwt",
            ApiKey = "good-key"
        };

        // Act
        await _handler.HandleAsync(connection.Object, authMessage);

        // Assert
        connection.Verify(c => c.Send(It.Is<AuthSuccessMessage>(m =>
            m.UserId == "api-user")), Times.Once);
        connection.VerifySet(c => c.State = ConnectionState.Authenticated);
    }

    [Fact]
    public async Task HandleAsync_NoCredentialsProvided_SendsAuthErrorAndCloses()
    {
        // Arrange
        var connection = CreateMockConnection();
        _jwtValidator.Setup(v => v.Validate(It.IsAny<string>())).Returns((TokenPayload?)null);
        _apiKeyValidator.Setup(v => v.Validate(It.IsAny<string>())).Returns((TokenPayload?)null);

        var authMessage = new AuthMessage
        {
            Id = "msg-1",
            Timestamp = 1234567890,
            Token = null,
            ApiKey = null
        };

        // Act
        await _handler.HandleAsync(connection.Object, authMessage);

        // Assert
        connection.Verify(c => c.Send(It.Is<AuthErrorMessage>(m =>
            m.Error.Contains("Authentication failed"))), Times.Once);
        connection.Verify(c => c.CloseAsync(
            WebSocketCloseStatus.PolicyViolation,
            It.IsAny<string>(),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task HandleAsync_NonAuthMessage_LogsWarningAndReturns()
    {
        // Arrange
        var connection = CreateMockConnection();
        var wrongMessage = new Mock<IMessage>();
        wrongMessage.Setup(m => m.Type).Returns(MessageType.Ping);

        // Act
        await _handler.HandleAsync(connection.Object, wrongMessage.Object);

        // Assert
        connection.Verify(c => c.Send(It.IsAny<IMessage>()), Times.Never);
        // Verify warning was logged
        _logger.Verify(
            x => x.Log(
                LogLevel.Warning,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((v, t) => v.ToString()!.Contains("non-auth message type")),
                It.IsAny<Exception>(),
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.Once);
    }

    [Fact]
    public async Task HandleAsync_PermissionsInSuccessMessage_MatchesPayloadStructure()
    {
        // Arrange
        var connection = CreateMockConnection();
        var validPayload = new TokenPayload
        {
            UserId = "user-123",
            Permissions = new DocumentPermissions
            {
                CanRead = new[] { "doc1", "doc2" },
                CanWrite = new[] { "doc1" },
                IsAdmin = false
            }
        };
        _jwtValidator.Setup(v => v.Validate("valid-token")).Returns(validPayload);

        var authMessage = new AuthMessage
        {
            Id = "msg-1",
            Timestamp = 1234567890,
            Token = "valid-token"
        };

        // Act
        await _handler.HandleAsync(connection.Object, authMessage);

        // Assert
        connection.Verify(c => c.Send(It.Is<AuthSuccessMessage>(m =>
            m.Permissions.ContainsKey("canRead") &&
            m.Permissions.ContainsKey("canWrite") &&
            m.Permissions.ContainsKey("isAdmin") &&
            ((string[])m.Permissions["canRead"]).Length == 2 &&
            ((string[])m.Permissions["canWrite"]).Length == 1 &&
            (bool)m.Permissions["isAdmin"] == false)), Times.Once);
    }

    [Fact]
    public async Task HandleAsync_SetsClientIdToUserId()
    {
        // Arrange
        var connection = CreateMockConnection();
        var validPayload = new TokenPayload
        {
            UserId = "user-456",
            Permissions = new DocumentPermissions()
        };
        _jwtValidator.Setup(v => v.Validate("valid-token")).Returns(validPayload);

        var authMessage = new AuthMessage
        {
            Id = "msg-1",
            Timestamp = 1234567890,
            Token = "valid-token"
        };

        // Act
        await _handler.HandleAsync(connection.Object, authMessage);

        // Assert
        connection.VerifySet(c => c.ClientId = "user-456");
    }
}
