using System.Net.WebSockets;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using SyncKit.Server.Auth;
using SyncKit.Server.Configuration;
using SyncKit.Server.Tests;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Handlers;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;
using Xunit;

namespace SyncKit.Server.Tests.WebSockets.Handlers;

/// <summary>
/// Comprehensive tests for AuthMessageHandler.
/// Tests JWT and API key authentication flow through WebSocket connections.
///
/// Test categories:
/// 1. Handler Configuration - HandledTypes and constructor
/// 2. JWT Authentication - Token-based auth flow
/// 3. API Key Authentication - API key auth flow
/// 4. Auth Fallback - JWT fails, API key succeeds
/// 5. Auth Failure Scenarios - Invalid credentials
/// 6. Connection State Management - State transitions
/// 7. Already Authenticated - Re-auth handling (now sends auth_success)
/// 8. Message Response Validation - AUTH_SUCCESS and AUTH_ERROR messages
/// 9. Edge Cases - Empty, null, malformed inputs
/// 10. Anonymous Auth - When AuthRequired=false
/// </summary>
public class AuthMessageHandlerTests
{
    private readonly Mock<IJwtValidator> _jwtValidator;
    private readonly Mock<IApiKeyValidator> _apiKeyValidator;
    private readonly IOptions<SyncKitConfig> _configAuthRequired;
    private readonly IOptions<SyncKitConfig> _configAuthDisabled;
    private readonly Mock<ILogger<AuthMessageHandler>> _logger;
    private readonly AuthMessageHandler _handler;
    private readonly AuthMessageHandler _handlerAuthDisabled;

    public AuthMessageHandlerTests()
    {
        _jwtValidator = new Mock<IJwtValidator>();
        _apiKeyValidator = new Mock<IApiKeyValidator>();
        _logger = new Mock<ILogger<AuthMessageHandler>>();

        // Config with auth required (default behavior)
        _configAuthRequired = Options.Create(new SyncKitConfig
        {
            AuthRequired = true,
            JwtSecret = "test-secret-key-at-least-32-characters-long"
        });

        // Config with auth disabled (anonymous access allowed)
        _configAuthDisabled = Options.Create(new SyncKitConfig
        {
            AuthRequired = false,
            JwtSecret = "test-secret-key-at-least-32-characters-long"
        });

        _handler = new AuthMessageHandler(_jwtValidator.Object, _apiKeyValidator.Object, _configAuthRequired, _logger.Object);
        _handlerAuthDisabled = new AuthMessageHandler(_jwtValidator.Object, _apiKeyValidator.Object, _configAuthDisabled, _logger.Object);
    }

    private Mock<IConnection> CreateMockConnection(ConnectionState state = ConnectionState.Authenticating)
    {
        var connection = new Mock<IConnection>();
        connection.Setup(c => c.Id).Returns("test-conn-123");
        // Use SetupProperty to track property values that are set and then read
        connection.SetupProperty(c => c.State, state);
        connection.SetupProperty(c => c.UserId);
        connection.SetupProperty(c => c.ClientId);
        connection.SetupProperty(c => c.TokenPayload);
        connection.Setup(c => c.Send(It.IsAny<IMessage>())).Returns(true);
        return connection;
    }

    #region Handler Configuration

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
    public void Constructor_ThrowsArgumentNullException_WhenJwtValidatorIsNull()
    {
        // Act & Assert
        Assert.Throws<ArgumentNullException>(() =>
            new AuthMessageHandler(null!, _apiKeyValidator.Object, _configAuthRequired, _logger.Object));
    }

    [Fact]
    public void Constructor_ThrowsArgumentNullException_WhenApiKeyValidatorIsNull()
    {
        // Act & Assert
        Assert.Throws<ArgumentNullException>(() =>
            new AuthMessageHandler(_jwtValidator.Object, null!, _configAuthRequired, _logger.Object));
    }

    [Fact]
    public void Constructor_ThrowsArgumentNullException_WhenOptionsIsNull()
    {
        // Act & Assert
        Assert.Throws<ArgumentNullException>(() =>
            new AuthMessageHandler(_jwtValidator.Object, _apiKeyValidator.Object, null!, _logger.Object));
    }

    [Fact]
    public void Constructor_ThrowsArgumentNullException_WhenLoggerIsNull()
    {
        // Act & Assert
        Assert.Throws<ArgumentNullException>(() =>
            new AuthMessageHandler(_jwtValidator.Object, _apiKeyValidator.Object, _configAuthRequired, null!));
    }

    #endregion

    #region JWT Authentication

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
            TestHelpers.AsDictionary(m.Permissions)!.ContainsKey("isAdmin") &&
            (bool)TestHelpers.AsDictionary(m.Permissions)!["isAdmin"] == true)), Times.Once);
        connection.VerifySet(c => c.UserId = "user-123");
        connection.VerifySet(c => c.TokenPayload = validPayload);
        connection.VerifySet(c => c.State = ConnectionState.Authenticated);
    }

    [Fact]
    public async Task HandleAsync_ValidJwtToken_WithReadWritePermissions()
    {
        // Arrange
        var connection = CreateMockConnection();
        var validPayload = new TokenPayload
        {
            UserId = "user-456",
            Permissions = new DocumentPermissions
            {
                CanRead = new[] { "doc-1", "doc-2" },
                CanWrite = new[] { "doc-1" },
                IsAdmin = false
            }
        };
        _jwtValidator.Setup(v => v.Validate("token-with-perms")).Returns(validPayload);

        var authMessage = new AuthMessage
        {
            Id = "msg-1",
            Timestamp = 1234567890,
            Token = "token-with-perms"
        };

        // Act
        await _handler.HandleAsync(connection.Object, authMessage);

        // Assert
        connection.Verify(c => c.Send(It.Is<AuthSuccessMessage>(m =>
            m.UserId == "user-456" &&
            TestHelpers.AsDictionary(m.Permissions)!.ContainsKey("canRead") &&
            ((string[])TestHelpers.AsDictionary(m.Permissions)!["canRead"]).Length == 2 &&
            ((string[])TestHelpers.AsDictionary(m.Permissions)!["canWrite"]).Length == 1 &&
            (bool)TestHelpers.AsDictionary(m.Permissions)!["isAdmin"] == false)), Times.Once);
    }

    [Fact]
    public async Task HandleAsync_JwtToken_SetsAllConnectionProperties()
    {
        // Arrange
        var connection = CreateMockConnection();
        var validPayload = new TokenPayload
        {
            UserId = "user-789",
            Email = "user@test.com",
            Permissions = new DocumentPermissions { IsAdmin = false }
        };
        _jwtValidator.Setup(v => v.Validate("full-token")).Returns(validPayload);

        var authMessage = new AuthMessage
        {
            Id = "msg-1",
            Timestamp = 1234567890,
            Token = "full-token"
        };

        // Act
        await _handler.HandleAsync(connection.Object, authMessage);

        // Assert
        connection.VerifySet(c => c.UserId = "user-789", Times.Once);
        connection.VerifySet(c => c.ClientId = "user-789", Times.Once); // ClientId defaults to UserId
        connection.VerifySet(c => c.TokenPayload = validPayload, Times.Once);
        connection.VerifySet(c => c.State = ConnectionState.Authenticated, Times.Once);
    }

    #endregion

    #region API Key Authentication

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
    public async Task HandleAsync_ApiKey_GrantsAdminPermissions()
    {
        // Arrange
        var connection = CreateMockConnection();
        var validPayload = new TokenPayload
        {
            UserId = "api-key-user",
            Permissions = new DocumentPermissions
            {
                CanRead = Array.Empty<string>(),
                CanWrite = Array.Empty<string>(),
                IsAdmin = true
            }
        };
        _apiKeyValidator.Setup(v => v.Validate("admin-key")).Returns(validPayload);

        var authMessage = new AuthMessage
        {
            Id = "msg-1",
            Timestamp = 1234567890,
            ApiKey = "admin-key"
        };

        // Act
        await _handler.HandleAsync(connection.Object, authMessage);

        // Assert
        connection.Verify(c => c.Send(It.Is<AuthSuccessMessage>(m =>
            (bool)TestHelpers.AsDictionary(m.Permissions)!["isAdmin"] == true)), Times.Once);
    }

    #endregion

    #region Auth Fallback

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
    public async Task HandleAsync_JwtSucceeds_DoesNotTryApiKey()
    {
        // Arrange
        var connection = CreateMockConnection();
        _jwtValidator.Setup(v => v.Validate("good-jwt")).Returns(new TokenPayload
        {
            UserId = "jwt-user",
            Permissions = new DocumentPermissions()
        });

        var authMessage = new AuthMessage
        {
            Id = "msg-1",
            Timestamp = 1234567890,
            Token = "good-jwt",
            ApiKey = "some-key" // This should be ignored
        };

        // Act
        await _handler.HandleAsync(connection.Object, authMessage);

        // Assert
        _apiKeyValidator.Verify(v => v.Validate(It.IsAny<string>()), Times.Never);
        connection.Verify(c => c.Send(It.Is<AuthSuccessMessage>(m =>
            m.UserId == "jwt-user")), Times.Once);
    }

    [Fact]
    public async Task HandleAsync_BothFail_SendsAuthError()
    {
        // Arrange
        var connection = CreateMockConnection();
        _jwtValidator.Setup(v => v.Validate("bad-jwt")).Returns((TokenPayload?)null);
        _apiKeyValidator.Setup(v => v.Validate("bad-key")).Returns((TokenPayload?)null);

        var authMessage = new AuthMessage
        {
            Id = "msg-1",
            Timestamp = 1234567890,
            Token = "bad-jwt",
            ApiKey = "bad-key"
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

    #endregion

    #region Auth Failure Scenarios

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
    public async Task HandleAsync_EmptyToken_TriesApiKey()
    {
        // Arrange
        var connection = CreateMockConnection();
        _apiKeyValidator.Setup(v => v.Validate("fallback-key")).Returns(new TokenPayload
        {
            UserId = "fallback-user",
            Permissions = new DocumentPermissions()
        });

        var authMessage = new AuthMessage
        {
            Id = "msg-1",
            Timestamp = 1234567890,
            Token = "", // Empty token
            ApiKey = "fallback-key"
        };

        // Act
        await _handler.HandleAsync(connection.Object, authMessage);

        // Assert
        connection.Verify(c => c.Send(It.Is<AuthSuccessMessage>(m =>
            m.UserId == "fallback-user")), Times.Once);
    }

    [Fact]
    public async Task HandleAsync_ConnectionCloses_WithPolicyViolationCode()
    {
        // Arrange
        var connection = CreateMockConnection();
        _jwtValidator.Setup(v => v.Validate(It.IsAny<string>())).Returns((TokenPayload?)null);

        var authMessage = new AuthMessage
        {
            Id = "msg-1",
            Timestamp = 1234567890,
            Token = "invalid"
        };

        // Act
        await _handler.HandleAsync(connection.Object, authMessage);

        // Assert - Verify close code matches TypeScript server (1008 - Policy Violation)
        connection.Verify(c => c.CloseAsync(
            WebSocketCloseStatus.PolicyViolation,
            It.Is<string>(s => s.Contains("Authentication failed")),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    #endregion

    #region Already Authenticated

    [Fact]
    public async Task HandleAsync_AlreadyAuthenticated_SendsAuthSuccess()
    {
        // Arrange
        var connection = CreateMockConnection(ConnectionState.Authenticated);
        connection.Setup(c => c.UserId).Returns("existing-user");
        connection.Setup(c => c.TokenPayload).Returns(new TokenPayload
        {
            UserId = "existing-user",
            Permissions = new DocumentPermissions { IsAdmin = true }
        });

        var authMessage = new AuthMessage
        {
            Id = "msg-1",
            Timestamp = 1234567890,
            Token = "some-token"
        };

        // Act
        await _handler.HandleAsync(connection.Object, authMessage);

        // Assert - Now sends auth_success for already authenticated connections
        connection.Verify(c => c.Send(It.Is<AuthSuccessMessage>(m =>
            m.UserId == "existing-user")), Times.Once);
        connection.Verify(c => c.CloseAsync(
            It.IsAny<WebSocketCloseStatus>(),
            It.IsAny<string>(),
            It.IsAny<CancellationToken>()), Times.Never);
        _jwtValidator.Verify(v => v.Validate(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task HandleAsync_AlreadyAuthenticated_DoesNotChangeState()
    {
        // Arrange
        var connection = CreateMockConnection(ConnectionState.Authenticated);
        connection.Setup(c => c.UserId).Returns("existing-user");
        connection.Setup(c => c.TokenPayload).Returns(new TokenPayload
        {
            UserId = "existing-user",
            Permissions = new DocumentPermissions()
        });

        var authMessage = new AuthMessage
        {
            Id = "msg-1",
            Timestamp = 1234567890,
            Token = "new-token"
        };

        // Act
        await _handler.HandleAsync(connection.Object, authMessage);

        // Assert - State should not change, but auth_success is sent
        connection.VerifySet(c => c.State = It.IsAny<ConnectionState>(), Times.Never);
        connection.VerifySet(c => c.UserId = It.IsAny<string>(), Times.Never);
        connection.VerifySet(c => c.TokenPayload = It.IsAny<TokenPayload>(), Times.Never);
    }

    #endregion

    #region Anonymous Auth (AuthRequired=false)

    [Fact]
    public async Task HandleAsync_NoCredentials_AuthDisabled_AllowsAnonymous()
    {
        // Arrange
        var connection = CreateMockConnection();

        var authMessage = new AuthMessage
        {
            Id = "msg-1",
            Timestamp = 1234567890,
            Token = null,
            ApiKey = null
        };

        // Act
        await _handlerAuthDisabled.HandleAsync(connection.Object, authMessage);

        // Assert - Should authenticate as anonymous
        connection.Verify(c => c.Send(It.Is<AuthSuccessMessage>(m =>
            m.UserId == "anonymous")), Times.Once);
        connection.VerifySet(c => c.State = ConnectionState.Authenticated);
        connection.VerifySet(c => c.UserId = "anonymous");
    }

    [Fact]
    public async Task HandleAsync_InvalidCredentials_AuthDisabled_AllowsAnonymous()
    {
        // Arrange
        var connection = CreateMockConnection();
        _jwtValidator.Setup(v => v.Validate(It.IsAny<string>())).Returns((TokenPayload?)null);
        _apiKeyValidator.Setup(v => v.Validate(It.IsAny<string>())).Returns((TokenPayload?)null);

        var authMessage = new AuthMessage
        {
            Id = "msg-1",
            Timestamp = 1234567890,
            Token = "invalid-token",
            ApiKey = "invalid-key"
        };

        // Act
        await _handlerAuthDisabled.HandleAsync(connection.Object, authMessage);

        // Assert - Should fall back to anonymous when auth disabled
        connection.Verify(c => c.Send(It.Is<AuthSuccessMessage>(m =>
            m.UserId == "anonymous")), Times.Once);
        connection.VerifySet(c => c.State = ConnectionState.Authenticated);
    }

    [Fact]
    public async Task HandleAsync_AnonymousAuth_HasAdminPermissions()
    {
        // Arrange
        var connection = CreateMockConnection();

        var authMessage = new AuthMessage
        {
            Id = "msg-1",
            Timestamp = 1234567890
        };

        // Act
        await _handlerAuthDisabled.HandleAsync(connection.Object, authMessage);

        // Assert - Anonymous should have admin permissions for dev/test mode
        connection.Verify(c => c.Send(It.Is<AuthSuccessMessage>(m =>
            TestHelpers.AsDictionary(m.Permissions) != null &&
            (bool)TestHelpers.AsDictionary(m.Permissions)!["isAdmin"] == true)), Times.Once);
    }

    #endregion

    #region Message Response Validation

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
            TestHelpers.AsDictionary(m.Permissions)!.ContainsKey("canRead") &&
            TestHelpers.AsDictionary(m.Permissions)!.ContainsKey("canWrite") &&
            TestHelpers.AsDictionary(m.Permissions)!.ContainsKey("isAdmin") &&
            ((string[])TestHelpers.AsDictionary(m.Permissions)!["canRead"]).Length == 2 &&
            ((string[])TestHelpers.AsDictionary(m.Permissions)!["canWrite"]).Length == 1 &&
            (bool)TestHelpers.AsDictionary(m.Permissions)!["isAdmin"] == false)), Times.Once);
    }

    [Fact]
    public async Task HandleAsync_AuthSuccessMessage_HasValidIdAndTimestamp()
    {
        // Arrange
        var connection = CreateMockConnection();
        var validPayload = new TokenPayload
        {
            UserId = "user-123",
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
        connection.Verify(c => c.Send(It.Is<AuthSuccessMessage>(m =>
            !string.IsNullOrEmpty(m.Id) &&
            m.Timestamp > 0)), Times.Once);
    }

    [Fact]
    public async Task HandleAsync_AuthErrorMessage_HasValidIdAndTimestamp()
    {
        // Arrange
        var connection = CreateMockConnection();
        _jwtValidator.Setup(v => v.Validate(It.IsAny<string>())).Returns((TokenPayload?)null);

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
            !string.IsNullOrEmpty(m.Id) &&
            m.Timestamp > 0 &&
            !string.IsNullOrEmpty(m.Error))), Times.Once);
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

    #endregion

    #region Edge Cases

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
    public async Task HandleAsync_WhitespaceToken_TreatedAsEmpty()
    {
        // Arrange
        var connection = CreateMockConnection();
        _apiKeyValidator.Setup(v => v.Validate("valid-key")).Returns(new TokenPayload
        {
            UserId = "user",
            Permissions = new DocumentPermissions()
        });

        var authMessage = new AuthMessage
        {
            Id = "msg-1",
            Timestamp = 1234567890,
            Token = "   ", // Whitespace only
            ApiKey = "valid-key"
        };

        // Act
        await _handler.HandleAsync(connection.Object, authMessage);

        // Assert - Should fall through to API key
        connection.Verify(c => c.Send(It.Is<AuthSuccessMessage>(m =>
            m.UserId == "user")), Times.Once);
    }

    [Fact]
    public async Task HandleAsync_VeryLongToken_HandleGracefully()
    {
        // Arrange
        var connection = CreateMockConnection();
        var longToken = new string('x', 10000);
        _jwtValidator.Setup(v => v.Validate(longToken)).Returns((TokenPayload?)null);

        var authMessage = new AuthMessage
        {
            Id = "msg-1",
            Timestamp = 1234567890,
            Token = longToken
        };

        // Act
        await _handler.HandleAsync(connection.Object, authMessage);

        // Assert - Should fail gracefully
        connection.Verify(c => c.Send(It.Is<AuthErrorMessage>(m =>
            m.Error.Contains("Authentication failed"))), Times.Once);
    }

    [Fact]
    public async Task HandleAsync_ConnectionInConnectingState_ProcessesAuth()
    {
        // Arrange - Connection just established, not yet in Authenticating state
        var connection = CreateMockConnection(ConnectionState.Connecting);
        var validPayload = new TokenPayload
        {
            UserId = "user-123",
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

        // Assert - Should still process auth
        connection.Verify(c => c.Send(It.Is<AuthSuccessMessage>(m =>
            m.UserId == "user-123")), Times.Once);
    }

    [Fact]
    public async Task HandleAsync_EmptyPermissions_StillSucceeds()
    {
        // Arrange
        var connection = CreateMockConnection();
        var validPayload = new TokenPayload
        {
            UserId = "user-minimal",
            Permissions = new DocumentPermissions
            {
                CanRead = Array.Empty<string>(),
                CanWrite = Array.Empty<string>(),
                IsAdmin = false
            }
        };
        _jwtValidator.Setup(v => v.Validate("minimal-token")).Returns(validPayload);

        var authMessage = new AuthMessage
        {
            Id = "msg-1",
            Timestamp = 1234567890,
            Token = "minimal-token"
        };

        // Act
        await _handler.HandleAsync(connection.Object, authMessage);

        // Assert
        connection.Verify(c => c.Send(It.Is<AuthSuccessMessage>(m =>
            m.UserId == "user-minimal")), Times.Once);
        connection.VerifySet(c => c.State = ConnectionState.Authenticated);
    }

    #endregion
}
