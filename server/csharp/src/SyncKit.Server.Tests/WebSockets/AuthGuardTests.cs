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
/// Comprehensive unit tests for the AuthGuard class.
/// Tests authentication and authorization enforcement for various operations.
///
/// Test categories:
/// 1. RequireAuth - Basic authentication checks
/// 2. RequireRead - Document read permission checks
/// 3. RequireWrite - Document write permission checks
/// 4. RequireAwareness - Awareness access checks
/// 5. Connection State Handling - Various connection states
/// 6. Error Message Validation - Error response content
/// 7. Admin User Scenarios - Admin permission bypass
/// 8. Edge Cases - Null payloads, null document IDs, etc.
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

    #region Constructor Tests

    [Fact]
    public void Constructor_ThrowsArgumentNullException_WhenLoggerIsNull()
    {
        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => new AuthGuard(null!));
    }

    #endregion

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

    [Fact]
    public void RequireAuth_DisconnectingWithPayload_ReturnsFalse()
    {
        // Arrange - Even with valid payload, disconnecting state should fail auth
        var payload = CreatePayload(isAdmin: true);
        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Disconnecting);
        _mockConnection.Setup(c => c.TokenPayload).Returns(payload);
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

    [Fact]
    public void RequireRead_HasWriteButNotRead_ReturnsFalse()
    {
        // Arrange - Write permission doesn't grant read permission
        var payload = new TokenPayload
        {
            UserId = "user-1",
            Permissions = new DocumentPermissions
            {
                CanRead = Array.Empty<string>(),
                CanWrite = new[] { "doc-1" },
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
    }

    [Fact]
    public void RequireRead_MultipleDocuments_OnlyAllowsListed()
    {
        // Arrange
        var payload = CreatePayload(canRead: new[] { "doc-1", "doc-2", "doc-3" });
        SetupAuthenticatedConnection(payload);

        // Act & Assert
        Assert.True(_authGuard.RequireRead(_mockConnection.Object, "doc-1"));
        Assert.True(_authGuard.RequireRead(_mockConnection.Object, "doc-2"));
        Assert.True(_authGuard.RequireRead(_mockConnection.Object, "doc-3"));
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

    [Fact]
    public void RequireWrite_HasReadButNotWrite_ReturnsFalse()
    {
        // Arrange - Read permission doesn't grant write permission
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

        // Act
        var result = _authGuard.RequireWrite(_mockConnection.Object, "doc-1");

        // Assert
        Assert.False(result);
    }

    [Fact]
    public void RequireWrite_DifferentDocumentPermissions()
    {
        // Arrange - Different permissions for different documents
        var payload = CreatePayload(
            canRead: new[] { "doc-read-only" },
            canWrite: new[] { "doc-writable" }
        );
        SetupAuthenticatedConnection(payload);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");
        _mockConnection.Setup(c => c.UserId).Returns("user-1");

        // Act & Assert
        Assert.True(_authGuard.RequireWrite(_mockConnection.Object, "doc-writable"));
        Assert.False(_authGuard.RequireWrite(_mockConnection.Object, "doc-read-only"));
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

    [Fact]
    public void RequireAwareness_AdminUser_ReturnsTrue()
    {
        // Arrange
        var payload = CreatePayload(isAdmin: true);
        SetupAuthenticatedConnection(payload);

        // Act
        var result = _authGuard.RequireAwareness(_mockConnection.Object);

        // Assert
        Assert.True(result);
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

    [Fact]
    public void RequireAuth_ErrorMessage_HasCorrectContent()
    {
        // Arrange
        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticating);
        _mockConnection.Setup(c => c.TokenPayload).Returns((TokenPayload?)null);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");

        // Act
        _authGuard.RequireAuth(_mockConnection.Object);

        // Assert
        _mockConnection.Verify(c => c.Send(It.Is<ErrorMessage>(m =>
            m.Error == "Not authenticated" &&
            !string.IsNullOrEmpty(m.Id) &&
            m.Timestamp > 0)), Times.Once);
    }

    #endregion

    #region Admin User Scenarios

    [Fact]
    public void Admin_CanAccessAnyDocument_ForRead()
    {
        // Arrange
        var payload = CreatePayload(isAdmin: true);
        SetupAuthenticatedConnection(payload);

        // Act & Assert - Admin can read any document
        Assert.True(_authGuard.RequireRead(_mockConnection.Object, "random-doc-1"));
        Assert.True(_authGuard.RequireRead(_mockConnection.Object, "random-doc-2"));
        Assert.True(_authGuard.RequireRead(_mockConnection.Object, Guid.NewGuid().ToString()));
    }

    [Fact]
    public void Admin_CanAccessAnyDocument_ForWrite()
    {
        // Arrange
        var payload = CreatePayload(isAdmin: true);
        SetupAuthenticatedConnection(payload);

        // Act & Assert - Admin can write any document
        Assert.True(_authGuard.RequireWrite(_mockConnection.Object, "random-doc-1"));
        Assert.True(_authGuard.RequireWrite(_mockConnection.Object, "random-doc-2"));
        Assert.True(_authGuard.RequireWrite(_mockConnection.Object, Guid.NewGuid().ToString()));
    }

    [Fact]
    public void Admin_WithEmptyPermissionArrays_StillHasFullAccess()
    {
        // Arrange
        var payload = new TokenPayload
        {
            UserId = "admin",
            Permissions = new DocumentPermissions
            {
                CanRead = Array.Empty<string>(),
                CanWrite = Array.Empty<string>(),
                IsAdmin = true
            }
        };
        SetupAuthenticatedConnection(payload);

        // Act & Assert
        Assert.True(_authGuard.RequireRead(_mockConnection.Object, "any-doc"));
        Assert.True(_authGuard.RequireWrite(_mockConnection.Object, "any-doc"));
        Assert.True(_authGuard.RequireAwareness(_mockConnection.Object));
    }

    #endregion

    #region Edge Cases

    [Fact]
    public void RequireRead_EmptyDocumentId_DependsOnRbacBehavior()
    {
        // Arrange
        var payload = CreatePayload(canRead: new[] { "doc-1" });
        SetupAuthenticatedConnection(payload);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");
        _mockConnection.Setup(c => c.UserId).Returns("user-1");

        // Act & Assert - Empty document ID should be rejected by Rbac
        Assert.False(_authGuard.RequireRead(_mockConnection.Object, ""));
        Assert.False(_authGuard.RequireRead(_mockConnection.Object, "   "));
    }

    [Fact]
    public void RequireWrite_EmptyDocumentId_DependsOnRbacBehavior()
    {
        // Arrange
        var payload = CreatePayload(canWrite: new[] { "doc-1" });
        SetupAuthenticatedConnection(payload);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");
        _mockConnection.Setup(c => c.UserId).Returns("user-1");

        // Act & Assert - Empty document ID should be rejected by Rbac
        Assert.False(_authGuard.RequireWrite(_mockConnection.Object, ""));
        Assert.False(_authGuard.RequireWrite(_mockConnection.Object, "   "));
    }

    [Fact]
    public void RequireRead_NullDocumentId_DependsOnRbacBehavior()
    {
        // Arrange
        var payload = CreatePayload(canRead: new[] { "doc-1" });
        SetupAuthenticatedConnection(payload);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");
        _mockConnection.Setup(c => c.UserId).Returns("user-1");

        // Act & Assert - Null document ID should be rejected by Rbac
        Assert.False(_authGuard.RequireRead(_mockConnection.Object, null!));
    }

    [Fact]
    public void RequireWrite_NullDocumentId_DependsOnRbacBehavior()
    {
        // Arrange
        var payload = CreatePayload(canWrite: new[] { "doc-1" });
        SetupAuthenticatedConnection(payload);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");
        _mockConnection.Setup(c => c.UserId).Returns("user-1");

        // Act & Assert - Null document ID should be rejected by Rbac
        Assert.False(_authGuard.RequireWrite(_mockConnection.Object, null!));
    }

    [Fact]
    public void RequireRead_SpecialCharactersInDocumentId()
    {
        // Arrange
        var specialDocId = "doc/with/slashes:and:colons";
        var payload = CreatePayload(canRead: new[] { specialDocId });
        SetupAuthenticatedConnection(payload);

        // Act & Assert
        Assert.True(_authGuard.RequireRead(_mockConnection.Object, specialDocId));
    }

    [Fact]
    public void RequireWrite_UuidDocumentId()
    {
        // Arrange
        var uuidDocId = "550e8400-e29b-41d4-a716-446655440000";
        var payload = CreatePayload(canWrite: new[] { uuidDocId });
        SetupAuthenticatedConnection(payload);

        // Act & Assert
        Assert.True(_authGuard.RequireWrite(_mockConnection.Object, uuidDocId));
    }

    [Fact]
    public void RequireRead_CaseSensitiveDocumentId()
    {
        // Arrange
        var payload = CreatePayload(canRead: new[] { "Document-1" });
        SetupAuthenticatedConnection(payload);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");
        _mockConnection.Setup(c => c.UserId).Returns("user-1");

        // Act & Assert - Document IDs are case-sensitive
        Assert.True(_authGuard.RequireRead(_mockConnection.Object, "Document-1"));
        Assert.False(_authGuard.RequireRead(_mockConnection.Object, "document-1"));
        Assert.False(_authGuard.RequireRead(_mockConnection.Object, "DOCUMENT-1"));
    }

    [Fact]
    public void MultipleConsecutiveAuthChecks_WorkCorrectly()
    {
        // Arrange
        var payload = CreatePayload(
            canRead: new[] { "doc-1", "doc-2" },
            canWrite: new[] { "doc-1" }
        );
        SetupAuthenticatedConnection(payload);
        _mockConnection.Setup(c => c.Id).Returns("conn-1");
        _mockConnection.Setup(c => c.UserId).Returns("user-1");

        // Act & Assert - Multiple consecutive checks should work
        Assert.True(_authGuard.RequireAuth(_mockConnection.Object));
        Assert.True(_authGuard.RequireRead(_mockConnection.Object, "doc-1"));
        Assert.True(_authGuard.RequireWrite(_mockConnection.Object, "doc-1"));
        Assert.True(_authGuard.RequireRead(_mockConnection.Object, "doc-2"));
        Assert.False(_authGuard.RequireWrite(_mockConnection.Object, "doc-2"));
        Assert.True(_authGuard.RequireAwareness(_mockConnection.Object));
    }

    #endregion

    #region Helper Methods

    private static TokenPayload CreatePayload(
        bool isAdmin = false,
        string[]? canRead = null,
        string[]? canWrite = null)
    {
        return new TokenPayload
        {
            UserId = "user-1",
            Permissions = new DocumentPermissions
            {
                IsAdmin = isAdmin,
                CanRead = canRead ?? Array.Empty<string>(),
                CanWrite = canWrite ?? Array.Empty<string>()
            }
        };
    }

    private void SetupAuthenticatedConnection(TokenPayload payload)
    {
        _mockConnection.Setup(c => c.State).Returns(ConnectionState.Authenticated);
        _mockConnection.Setup(c => c.TokenPayload).Returns(payload);
    }

    #endregion
}
