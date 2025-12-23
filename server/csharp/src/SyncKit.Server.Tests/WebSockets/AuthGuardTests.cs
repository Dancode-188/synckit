using System.Net.WebSockets;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SyncKit.Server.Auth;
using SyncKit.Server.WebSockets;
using SyncKit.Server.WebSockets.Protocol;
using SyncKit.Server.WebSockets.Protocol.Messages;
using Xunit;

namespace SyncKit.Server.Tests.WebSockets;

/// <summary>
/// Unit tests for the AuthGuard class.
/// Tests authentication and authorization enforcement for various operations.
/// </summary>
public class AuthGuardTests
{
    private readonly AuthGuard _authGuard;
    private readonly Mock<IConnection> _mockConnection;

    public AuthGuardTests()
    {
        _authGuard = new AuthGuard(NullLogger<AuthGuard>.Instance);
        _mockConnection = new Mock<IConnection>();
    }

    #region RequireAuth Tests

    [Fact]
    public void RequireAuth_NotAuthenticated_ReturnsFalse()
    {
        // Arrange
        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticating);
        _mockConnection.Setup(c => c.TokenPayload).Returns((TokenPayload?)null);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");

        // Act
        var result = _authGuard.RequireAuth(_mockConnection.Object);

        // Assert
        Assert.False(result);
        _mockConnection.Verify(c => c.Send(It.Is<ErrorMessage>(
            m => m.Error == "Not authenticated")), Times.Once);
    }

    [Fact]
    public void RequireAuth_Authenticated_ReturnsTrue()
    {
        // Arrange
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

        // Act
        var result = _authGuard.RequireAuth(_mockConnection.Object);

        // Assert
        Assert.True(result);
        _mockConnection.Verify(c => c.Send(It.IsAny<ErrorMessage>()), Times.Never);
    }

    [Fact]
    public void RequireAuth_AuthenticatedButNoPayload_ReturnsFalse()
    {
        // Arrange
        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticated);
        _mockConnection.Setup(c => c.TokenPayload).Returns((TokenPayload?)null);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");

        // Act
        var result = _authGuard.RequireAuth(_mockConnection.Object);

        // Assert
        Assert.False(result);
        _mockConnection.Verify(c => c.Send(It.Is<ErrorMessage>(
            m => m.Error == "Not authenticated")), Times.Once);
    }

    [Theory]
    [InlineData(ConnectionState.Connecting)]
    [InlineData(ConnectionState.Authenticating)]
    [InlineData(ConnectionState.Disconnecting)]
    [InlineData(ConnectionState.Disconnected)]
    public void RequireAuth_VariousNonAuthenticatedStates_ReturnsFalse(ConnectionState state)
    {
        // Arrange
        _mockConnection.Setup(c => c.State).Returns(state);
        _mockConnection.Setup(c => c.TokenPayload).Returns((TokenPayload?)null);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");

        // Act
        var result = _authGuard.RequireAuth(_mockConnection.Object);

        // Assert
        Assert.False(result);
    }

    #endregion

    #region RequireRead Tests

    [Fact]
    public void RequireRead_NotAuthenticated_ReturnsFalse()
    {
        // Arrange
        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticating);
        _mockConnection.Setup(c => c.TokenPayload).Returns((TokenPayload?)null);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");

        // Act
        var result = _authGuard.RequireRead(_mockConnection.Object, "doc-1");

        // Assert
        Assert.False(result);
        _mockConnection.Verify(c => c.Send(It.Is<ErrorMessage>(
            m => m.Error == "Not authenticated")), Times.Once);
    }

    [Fact]
    public void RequireRead_HasReadPermission_ReturnsTrue()
    {
        // Arrange
        var payload = new TokenPayload
        {
            UserId = "user-1",
            Permissions = new DocumentPermissions
            {
                CanRead = new[] { "doc-1", "doc-2" },
                CanWrite = Array.Empty<string>(),
                IsAdmin = false
            }
        };

        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticated);
        _mockConnection.Setup(c => c.TokenPayload).Returns(payload);

        // Act
        var result = _authGuard.RequireRead(_mockConnection.Object, "doc-1");

        // Assert
        Assert.True(result);
        _mockConnection.Verify(c => c.Send(It.IsAny<ErrorMessage>()), Times.Never);
    }

    [Fact]
    public void RequireRead_NoReadPermission_ReturnsFalse()
    {
        // Arrange
        var payload = new TokenPayload
        {
            UserId = "user-1",
            Permissions = new DocumentPermissions
            {
                CanRead = new[] { "doc-2" },
                CanWrite = Array.Empty<string>(),
                IsAdmin = false
            }
        };

        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticated);
        _mockConnection.Setup(c => c.TokenPayload).Returns(payload);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");
        _mockConnection.Setup(c => c.UserId).Returns("user-1");

        // Act
        var result = _authGuard.RequireRead(_mockConnection.Object, "doc-1");

        // Assert
        Assert.False(result);
        _mockConnection.Verify(c => c.Send(It.Is<ErrorMessage>(
            m => m.Error == "Permission denied")), Times.Once);
    }

    [Fact]
    public void RequireRead_AdminUser_ReturnsTrue()
    {
        // Arrange
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

        // Act
        var result = _authGuard.RequireRead(_mockConnection.Object, "any-doc");

        // Assert
        Assert.True(result);
        _mockConnection.Verify(c => c.Send(It.IsAny<ErrorMessage>()), Times.Never);
    }

    #endregion

    #region RequireWrite Tests

    [Fact]
    public void RequireWrite_NotAuthenticated_ReturnsFalse()
    {
        // Arrange
        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticating);
        _mockConnection.Setup(c => c.TokenPayload).Returns((TokenPayload?)null);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");

        // Act
        var result = _authGuard.RequireWrite(_mockConnection.Object, "doc-1");

        // Assert
        Assert.False(result);
        _mockConnection.Verify(c => c.Send(It.Is<ErrorMessage>(
            m => m.Error == "Not authenticated")), Times.Once);
    }

    [Fact]
    public void RequireWrite_HasWritePermission_ReturnsTrue()
    {
        // Arrange
        var payload = new TokenPayload
        {
            UserId = "user-1",
            Permissions = new DocumentPermissions
            {
                CanRead = Array.Empty<string>(),
                CanWrite = new[] { "doc-1", "doc-2" },
                IsAdmin = false
            }
        };

        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticated);
        _mockConnection.Setup(c => c.TokenPayload).Returns(payload);

        // Act
        var result = _authGuard.RequireWrite(_mockConnection.Object, "doc-1");

        // Assert
        Assert.True(result);
        _mockConnection.Verify(c => c.Send(It.IsAny<ErrorMessage>()), Times.Never);
    }

    [Fact]
    public void RequireWrite_NoWritePermission_ReturnsFalse()
    {
        // Arrange
        var payload = new TokenPayload
        {
            UserId = "user-1",
            Permissions = new DocumentPermissions
            {
                CanRead = new[] { "doc-1" }, // Has read but not write
                CanWrite = new[] { "doc-2" },
                IsAdmin = false
            }
        };

        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticated);
        _mockConnection.Setup(c => c.TokenPayload).Returns(payload);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");
        _mockConnection.Setup(c => c.UserId).Returns("user-1");

        // Act
        var result = _authGuard.RequireWrite(_mockConnection.Object, "doc-1");

        // Assert
        Assert.False(result);
        _mockConnection.Verify(c => c.Send(It.Is<ErrorMessage>(
            m => m.Error == "Permission denied")), Times.Once);
    }

    [Fact]
    public void RequireWrite_AdminUser_ReturnsTrue()
    {
        // Arrange
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

        // Act
        var result = _authGuard.RequireWrite(_mockConnection.Object, "any-doc");

        // Assert
        Assert.True(result);
        _mockConnection.Verify(c => c.Send(It.IsAny<ErrorMessage>()), Times.Never);
    }

    #endregion

    #region RequireAwareness Tests

    [Fact]
    public void RequireAwareness_NotAuthenticated_ReturnsFalse()
    {
        // Arrange
        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticating);
        _mockConnection.Setup(c => c.TokenPayload).Returns((TokenPayload?)null);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");

        // Act
        var result = _authGuard.RequireAwareness(_mockConnection.Object);

        // Assert
        Assert.False(result);
        _mockConnection.Verify(c => c.Send(It.Is<ErrorMessage>(
            m => m.Error == "Not authenticated")), Times.Once);
    }

    [Fact]
    public void RequireAwareness_Authenticated_ReturnsTrue()
    {
        // Arrange
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

        // Act
        var result = _authGuard.RequireAwareness(_mockConnection.Object);

        // Assert
        Assert.True(result);
        _mockConnection.Verify(c => c.Send(It.IsAny<ErrorMessage>()), Times.Never);
    }

    [Fact]
    public void RequireAwareness_AuthenticatedNoPermissions_ReturnsTrue()
    {
        // Arrange - Any authenticated user can use awareness
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

        // Act
        var result = _authGuard.RequireAwareness(_mockConnection.Object);

        // Assert
        Assert.True(result);
        _mockConnection.Verify(c => c.Send(It.IsAny<ErrorMessage>()), Times.Never);
    }

    #endregion

    #region Error Message Tests

    [Fact]
    public void RequireRead_SendsErrorWithDocumentId()
    {
        // Arrange
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

        // Act
        _authGuard.RequireRead(_mockConnection.Object, "doc-123");

        // Assert
        _mockConnection.Verify(c => c.Send(It.Is<ErrorMessage>(m =>
            m.Error == "Permission denied" &&
            m.Details != null)), Times.Once);
    }

    [Fact]
    public void RequireWrite_SendsErrorWithDocumentId()
    {
        // Arrange
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

        // Act
        _authGuard.RequireWrite(_mockConnection.Object, "doc-456");

        // Assert
        _mockConnection.Verify(c => c.Send(It.Is<ErrorMessage>(m =>
            m.Error == "Permission denied" &&
            m.Details != null)), Times.Once);
    }

    #endregion
}
