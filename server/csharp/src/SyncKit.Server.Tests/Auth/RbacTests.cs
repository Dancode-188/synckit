using System;
using SyncKit.Server.Auth;

namespace SyncKit.Server.Tests.Auth;

/// <summary>
/// Comprehensive tests for RBAC (Role-Based Access Control) permission checking.
/// Tests the Rbac static helper class that evaluates document-level permissions.
///
/// Test categories:
/// 1. Admin User Scenarios - Full access for admin users
/// 2. Document Read Permissions - CanRead array checks
/// 3. Document Write Permissions - CanWrite array checks
/// 4. Permission Level Calculation - GetPermissionLevel results
/// 5. Null/Empty Handling - Edge cases with null or empty values
/// 6. Case Sensitivity - Document ID matching behavior
/// 7. Complex Permission Scenarios - Real-world permission combinations
/// 8. IsAdmin Helper - Direct admin check functionality
/// </summary>
public class RbacTests
{
    #region Admin User Scenarios

    [Fact]
    public void CanReadDocument_AdminCanReadAnyDocument()
    {
        var payload = CreatePayload(isAdmin: true);

        Assert.True(Rbac.CanReadDocument(payload, "document-123"));
    }

    [Fact]
    public void CanWriteDocument_AdminCanWriteAnyDocument()
    {
        var payload = CreatePayload(isAdmin: true);

        Assert.True(Rbac.CanWriteDocument(payload, "document-123"));
    }

    [Fact]
    public void Admin_CanAccessRandomDocumentIds()
    {
        // Arrange
        var payload = CreatePayload(isAdmin: true);

        // Act & Assert - Admin should access any document ID
        Assert.True(Rbac.CanReadDocument(payload, Guid.NewGuid().ToString()));
        Assert.True(Rbac.CanWriteDocument(payload, Guid.NewGuid().ToString()));
        Assert.True(Rbac.CanReadDocument(payload, "random-doc-id"));
        Assert.True(Rbac.CanWriteDocument(payload, "random-doc-id"));
    }

    [Fact]
    public void Admin_WithEmptyPermissionArrays_StillHasFullAccess()
    {
        // Arrange - Admin with empty CanRead/CanWrite arrays
        var payload = CreatePayload(isAdmin: true, canRead: Array.Empty<string>(), canWrite: Array.Empty<string>());

        // Act & Assert
        Assert.True(Rbac.CanReadDocument(payload, "any-doc"));
        Assert.True(Rbac.CanWriteDocument(payload, "any-doc"));
    }

    [Fact]
    public void Admin_TakesPrecedenceOverSpecificPermissions()
    {
        // Arrange - Admin is true, but specific permissions are empty
        var payload = CreatePayload(
            isAdmin: true,
            canRead: new[] { "only-this-doc" },
            canWrite: new[] { "only-this-doc" }
        );

        // Act & Assert - Admin should grant access to any document, not just listed ones
        Assert.True(Rbac.CanReadDocument(payload, "completely-different-doc"));
        Assert.True(Rbac.CanWriteDocument(payload, "completely-different-doc"));
    }

    #endregion

    #region Document Read Permissions

    [Fact]
    public void CanReadDocument_ReturnsTrue_WhenDocumentListed()
    {
        var payload = CreatePayload(canRead: new[] { "document-1" });

        Assert.True(Rbac.CanReadDocument(payload, "document-1"));
    }

    [Fact]
    public void CanReadDocument_ReturnsFalse_WhenDocumentNotListed()
    {
        var payload = CreatePayload(canRead: new[] { "another-doc" });

        Assert.False(Rbac.CanReadDocument(payload, "document-1"));
    }

    [Fact]
    public void CanReadDocument_ReturnsFalse_WhenNoPermissions()
    {
        var payload = CreatePayload();

        Assert.False(Rbac.CanReadDocument(payload, "any-doc"));
    }

    [Fact]
    public void CanReadDocument_HandlesMultipleDocuments()
    {
        var payload = CreatePayload(canRead: new[] { "doc-1", "doc-2", "doc-3" });

        Assert.True(Rbac.CanReadDocument(payload, "doc-1"));
        Assert.True(Rbac.CanReadDocument(payload, "doc-2"));
        Assert.True(Rbac.CanReadDocument(payload, "doc-3"));
        Assert.False(Rbac.CanReadDocument(payload, "doc-4"));
    }

    [Fact]
    public void CanReadDocument_DoesNotGrantWriteAccess()
    {
        // Arrange - User can only read, not write
        var payload = CreatePayload(canRead: new[] { "doc-1" });

        // Act & Assert
        Assert.True(Rbac.CanReadDocument(payload, "doc-1"));
        Assert.False(Rbac.CanWriteDocument(payload, "doc-1"));
    }

    [Fact]
    public void CanReadDocument_WithLargePermissionSet()
    {
        // Arrange - Many documents in read permissions
        var docs = Enumerable.Range(1, 1000).Select(i => $"doc-{i}").ToArray();
        var payload = CreatePayload(canRead: docs);

        // Act & Assert
        Assert.True(Rbac.CanReadDocument(payload, "doc-1"));
        Assert.True(Rbac.CanReadDocument(payload, "doc-500"));
        Assert.True(Rbac.CanReadDocument(payload, "doc-1000"));
        Assert.False(Rbac.CanReadDocument(payload, "doc-1001"));
    }

    #endregion

    #region Document Write Permissions

    [Fact]
    public void CanWriteDocument_ReturnsTrue_WhenDocumentListed()
    {
        var payload = CreatePayload(canWrite: new[] { "document-1" });

        Assert.True(Rbac.CanWriteDocument(payload, "document-1"));
    }

    [Fact]
    public void CanWriteDocument_ReturnsFalse_WhenDocumentNotListed()
    {
        var payload = CreatePayload(canWrite: new[] { "another-doc" });

        Assert.False(Rbac.CanWriteDocument(payload, "document-1"));
    }

    [Fact]
    public void CanWriteDocument_ReturnsFalse_WhenOnlyReadPermission()
    {
        // Arrange - User can read but not write
        var payload = CreatePayload(canRead: new[] { "doc-1" }, canWrite: Array.Empty<string>());

        // Act & Assert
        Assert.False(Rbac.CanWriteDocument(payload, "doc-1"));
    }

    [Fact]
    public void CanWriteDocument_DoesNotRequireReadPermission()
    {
        // Arrange - Write permission doesn't require read permission
        var payload = CreatePayload(canRead: Array.Empty<string>(), canWrite: new[] { "doc-1" });

        // Act & Assert
        Assert.True(Rbac.CanWriteDocument(payload, "doc-1"));
        // Note: This is a design choice - write doesn't imply read in this system
    }

    [Fact]
    public void CanWriteDocument_HandlesMultipleDocuments()
    {
        var payload = CreatePayload(canWrite: new[] { "doc-1", "doc-2", "doc-3" });

        Assert.True(Rbac.CanWriteDocument(payload, "doc-1"));
        Assert.True(Rbac.CanWriteDocument(payload, "doc-2"));
        Assert.True(Rbac.CanWriteDocument(payload, "doc-3"));
        Assert.False(Rbac.CanWriteDocument(payload, "doc-4"));
    }

    #endregion

    #region Permission Level Calculation

    [Fact]
    public void GetPermissionLevel_ReturnsAdmin_WhenUserIsAdmin()
    {
        var payload = CreatePayload(isAdmin: true);

        Assert.Equal(PermissionLevel.Admin, Rbac.GetPermissionLevel(payload, "document-1"));
    }

    [Fact]
    public void GetPermissionLevel_ReturnsWrite_WhenUserCanWrite()
    {
        var payload = CreatePayload(canWrite: new[] { "document-1" });

        Assert.Equal(PermissionLevel.Write, Rbac.GetPermissionLevel(payload, "document-1"));
    }

    [Fact]
    public void GetPermissionLevel_ReturnsRead_WhenUserCanOnlyRead()
    {
        var payload = CreatePayload(canRead: new[] { "document-1" });

        Assert.Equal(PermissionLevel.Read, Rbac.GetPermissionLevel(payload, "document-1"));
    }

    [Fact]
    public void GetPermissionLevel_ReturnsNone_WhenUserHasNoAccess()
    {
        var payload = CreatePayload();

        Assert.Equal(PermissionLevel.None, Rbac.GetPermissionLevel(payload, "document-1"));
    }

    [Fact]
    public void GetPermissionLevel_ReturnsNone_WhenDocumentIdIsNull()
    {
        var payload = CreatePayload(canRead: new[] { "document-1" });

        Assert.Equal(PermissionLevel.None, Rbac.GetPermissionLevel(payload, null));
    }

    [Fact]
    public void GetPermissionLevel_ReturnsWrite_WhenUserHasBothReadAndWrite()
    {
        // Arrange - User has both read and write
        var payload = CreatePayload(canRead: new[] { "doc-1" }, canWrite: new[] { "doc-1" });

        // Act & Assert - Write takes precedence
        Assert.Equal(PermissionLevel.Write, Rbac.GetPermissionLevel(payload, "doc-1"));
    }

    [Fact]
    public void GetPermissionLevel_ReturnsAdmin_EvenWhenNoOtherPermissions()
    {
        // Arrange - Admin with no specific document permissions
        var payload = CreatePayload(isAdmin: true, canRead: Array.Empty<string>(), canWrite: Array.Empty<string>());

        // Act & Assert
        Assert.Equal(PermissionLevel.Admin, Rbac.GetPermissionLevel(payload, "any-doc"));
    }

    [Fact]
    public void GetPermissionLevel_PermissionHierarchy_Correct()
    {
        // Test that permission levels are ordered correctly: Admin > Write > Read > None
        Assert.True(PermissionLevel.Admin > PermissionLevel.Write);
        Assert.True(PermissionLevel.Write > PermissionLevel.Read);
        Assert.True(PermissionLevel.Read > PermissionLevel.None);
    }

    [Fact]
    public void GetPermissionLevel_ForDifferentDocuments()
    {
        // Arrange - Different permissions for different documents
        var payload = CreatePayload(
            canRead: new[] { "doc-read-only" },
            canWrite: new[] { "doc-write" }
        );

        // Act & Assert
        Assert.Equal(PermissionLevel.Read, Rbac.GetPermissionLevel(payload, "doc-read-only"));
        Assert.Equal(PermissionLevel.Write, Rbac.GetPermissionLevel(payload, "doc-write"));
        Assert.Equal(PermissionLevel.None, Rbac.GetPermissionLevel(payload, "doc-none"));
    }

    #endregion

    #region Null/Empty Handling

    [Fact]
    public void CanReadDocumentAndWriteDocument_ReturnFalse_WhenPayloadIsNull()
    {
        Assert.False(Rbac.CanReadDocument(null, "document-1"));
        Assert.False(Rbac.CanWriteDocument(null, "document-1"));
    }

    [Fact]
    public void CanReadDocumentAndWriteDocument_ReturnFalse_WhenPermissionsAreNull()
    {
        var payload = new TokenPayload
        {
            UserId = "user",
            Permissions = null!
        };

        Assert.False(Rbac.CanReadDocument(payload, "document-1"));
        Assert.False(Rbac.CanWriteDocument(payload, "document-1"));
    }

    [Fact]
    public void CanReadDocument_ReturnsFalse_WhenDocumentIdIsNull()
    {
        var payload = CreatePayload(canRead: new[] { "document-1" });

        Assert.False(Rbac.CanReadDocument(payload, null));
    }

    [Fact]
    public void CanReadDocument_ReturnsFalse_WhenDocumentIdIsEmpty()
    {
        var payload = CreatePayload(canRead: new[] { "document-1" });

        Assert.False(Rbac.CanReadDocument(payload, ""));
        Assert.False(Rbac.CanReadDocument(payload, "   "));
    }

    [Fact]
    public void CanWriteDocument_ReturnsFalse_WhenDocumentIdIsNull()
    {
        var payload = CreatePayload(canWrite: new[] { "document-1" });

        Assert.False(Rbac.CanWriteDocument(payload, null));
    }

    [Fact]
    public void CanWriteDocument_ReturnsFalse_WhenDocumentIdIsEmpty()
    {
        var payload = CreatePayload(canWrite: new[] { "document-1" });

        Assert.False(Rbac.CanWriteDocument(payload, ""));
        Assert.False(Rbac.CanWriteDocument(payload, "   "));
    }

    [Fact]
    public void CanReadDocument_ReturnsFalse_WhenCanReadIsNull()
    {
        var payload = new TokenPayload
        {
            UserId = "user",
            Permissions = new DocumentPermissions
            {
                CanRead = null!,
                CanWrite = new[] { "doc-1" },
                IsAdmin = false
            }
        };

        Assert.False(Rbac.CanReadDocument(payload, "doc-1"));
    }

    [Fact]
    public void CanWriteDocument_ReturnsFalse_WhenCanWriteIsNull()
    {
        var payload = new TokenPayload
        {
            UserId = "user",
            Permissions = new DocumentPermissions
            {
                CanRead = new[] { "doc-1" },
                CanWrite = null!,
                IsAdmin = false
            }
        };

        Assert.False(Rbac.CanWriteDocument(payload, "doc-1"));
    }

    [Fact]
    public void GetPermissionLevel_ReturnsNone_WhenPayloadIsNull()
    {
        Assert.Equal(PermissionLevel.None, Rbac.GetPermissionLevel(null, "doc-1"));
    }

    [Fact]
    public void GetPermissionLevel_ReturnsNone_WhenPermissionsIsNull()
    {
        var payload = new TokenPayload
        {
            UserId = "user",
            Permissions = null!
        };

        Assert.Equal(PermissionLevel.None, Rbac.GetPermissionLevel(payload, "doc-1"));
    }

    #endregion

    #region Case Sensitivity

    [Fact]
    public void CanReadDocument_IsCaseSensitive()
    {
        var payload = CreatePayload(canRead: new[] { "Document-1" });

        Assert.True(Rbac.CanReadDocument(payload, "Document-1"));
        Assert.False(Rbac.CanReadDocument(payload, "document-1"));
        Assert.False(Rbac.CanReadDocument(payload, "DOCUMENT-1"));
    }

    [Fact]
    public void CanWriteDocument_IsCaseSensitive()
    {
        var payload = CreatePayload(canWrite: new[] { "Document-1" });

        Assert.True(Rbac.CanWriteDocument(payload, "Document-1"));
        Assert.False(Rbac.CanWriteDocument(payload, "document-1"));
        Assert.False(Rbac.CanWriteDocument(payload, "DOCUMENT-1"));
    }

    [Fact]
    public void CaseSensitivity_AllLowercase()
    {
        var payload = CreatePayload(canRead: new[] { "document" }, canWrite: new[] { "document" });

        Assert.True(Rbac.CanReadDocument(payload, "document"));
        Assert.True(Rbac.CanWriteDocument(payload, "document"));
        Assert.False(Rbac.CanReadDocument(payload, "DOCUMENT"));
        Assert.False(Rbac.CanWriteDocument(payload, "Document"));
    }

    [Fact]
    public void CaseSensitivity_AllUppercase()
    {
        var payload = CreatePayload(canRead: new[] { "DOCUMENT" }, canWrite: new[] { "DOCUMENT" });

        Assert.True(Rbac.CanReadDocument(payload, "DOCUMENT"));
        Assert.True(Rbac.CanWriteDocument(payload, "DOCUMENT"));
        Assert.False(Rbac.CanReadDocument(payload, "document"));
        Assert.False(Rbac.CanWriteDocument(payload, "Document"));
    }

    #endregion

    #region Complex Permission Scenarios

    [Fact]
    public void ComplexScenario_ReadSomeWriteFewer()
    {
        // Arrange - User can read multiple docs but write to only some
        var payload = CreatePayload(
            canRead: new[] { "doc-1", "doc-2", "doc-3", "doc-4", "doc-5" },
            canWrite: new[] { "doc-1", "doc-2" }
        );

        // Act & Assert
        // Can read all listed docs
        Assert.True(Rbac.CanReadDocument(payload, "doc-1"));
        Assert.True(Rbac.CanReadDocument(payload, "doc-5"));

        // Can only write to some
        Assert.True(Rbac.CanWriteDocument(payload, "doc-1"));
        Assert.True(Rbac.CanWriteDocument(payload, "doc-2"));
        Assert.False(Rbac.CanWriteDocument(payload, "doc-3"));
        Assert.False(Rbac.CanWriteDocument(payload, "doc-5"));

        // Permission levels
        Assert.Equal(PermissionLevel.Write, Rbac.GetPermissionLevel(payload, "doc-1"));
        Assert.Equal(PermissionLevel.Read, Rbac.GetPermissionLevel(payload, "doc-5"));
        Assert.Equal(PermissionLevel.None, Rbac.GetPermissionLevel(payload, "doc-unknown"));
    }

    [Fact]
    public void ComplexScenario_WriteOnlyDocuments()
    {
        // Arrange - User can write but cannot read some documents
        // This is unusual but possible in the permission model
        var payload = CreatePayload(
            canRead: Array.Empty<string>(),
            canWrite: new[] { "write-only-doc" }
        );

        // Act & Assert
        Assert.False(Rbac.CanReadDocument(payload, "write-only-doc"));
        Assert.True(Rbac.CanWriteDocument(payload, "write-only-doc"));
        Assert.Equal(PermissionLevel.Write, Rbac.GetPermissionLevel(payload, "write-only-doc"));
    }

    [Fact]
    public void ComplexScenario_DisjointPermissions()
    {
        // Arrange - Completely different docs for read and write
        var payload = CreatePayload(
            canRead: new[] { "read-doc-1", "read-doc-2" },
            canWrite: new[] { "write-doc-1", "write-doc-2" }
        );

        // Act & Assert
        Assert.True(Rbac.CanReadDocument(payload, "read-doc-1"));
        Assert.False(Rbac.CanWriteDocument(payload, "read-doc-1"));

        Assert.False(Rbac.CanReadDocument(payload, "write-doc-1"));
        Assert.True(Rbac.CanWriteDocument(payload, "write-doc-1"));
    }

    [Fact]
    public void ComplexScenario_SpecialCharactersInDocumentIds()
    {
        // Arrange - Document IDs with special characters
        var payload = CreatePayload(
            canRead: new[] { "doc/path/style", "doc:colon:style", "doc-with-dashes" },
            canWrite: new[] { "doc_underscore_style" }
        );

        // Act & Assert
        Assert.True(Rbac.CanReadDocument(payload, "doc/path/style"));
        Assert.True(Rbac.CanReadDocument(payload, "doc:colon:style"));
        Assert.True(Rbac.CanWriteDocument(payload, "doc_underscore_style"));
    }

    [Fact]
    public void ComplexScenario_UuidDocumentIds()
    {
        // Arrange - UUID-style document IDs
        var docId1 = "550e8400-e29b-41d4-a716-446655440000";
        var docId2 = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
        var payload = CreatePayload(
            canRead: new[] { docId1 },
            canWrite: new[] { docId1, docId2 }
        );

        // Act & Assert
        Assert.True(Rbac.CanReadDocument(payload, docId1));
        Assert.True(Rbac.CanWriteDocument(payload, docId1));
        Assert.False(Rbac.CanReadDocument(payload, docId2));
        Assert.True(Rbac.CanWriteDocument(payload, docId2));
    }

    [Fact]
    public void ComplexScenario_UnicodeDocumentIds()
    {
        // Arrange - Unicode document IDs
        var payload = CreatePayload(
            canRead: new[] { "документ-1", "文档-2" },
            canWrite: new[] { "ドキュメント-3" }
        );

        // Act & Assert
        Assert.True(Rbac.CanReadDocument(payload, "документ-1"));
        Assert.True(Rbac.CanReadDocument(payload, "文档-2"));
        Assert.True(Rbac.CanWriteDocument(payload, "ドキュメント-3"));
        Assert.False(Rbac.CanReadDocument(payload, "ドキュメント-3"));
    }

    #endregion

    #region IsAdmin Helper

    [Fact]
    public void IsAdmin_ReturnsTrue_WhenUserIsAdmin()
    {
        var payload = CreatePayload(isAdmin: true);

        Assert.True(Rbac.IsAdmin(payload));
    }

    [Fact]
    public void IsAdmin_ReturnsFalse_WhenUserIsNotAdmin()
    {
        var payload = CreatePayload(isAdmin: false);

        Assert.False(Rbac.IsAdmin(payload));
    }

    [Fact]
    public void IsAdmin_ReturnsFalse_WhenPayloadIsNull()
    {
        Assert.False(Rbac.IsAdmin(null));
    }

    [Fact]
    public void IsAdmin_ReturnsFalse_WhenPermissionsIsNull()
    {
        var payload = new TokenPayload
        {
            UserId = "user",
            Permissions = null!
        };

        Assert.False(Rbac.IsAdmin(payload));
    }

    [Fact]
    public void IsAdmin_DefaultIsFalse()
    {
        // Arrange - New permissions object without explicitly setting IsAdmin
        var payload = new TokenPayload
        {
            UserId = "user",
            Permissions = new DocumentPermissions()
        };

        // Act & Assert - Default should be false
        Assert.False(Rbac.IsAdmin(payload));
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
            UserId = "user",
            Permissions = new DocumentPermissions
            {
                IsAdmin = isAdmin,
                CanRead = canRead ?? Array.Empty<string>(),
                CanWrite = canWrite ?? Array.Empty<string>()
            }
        };
    }

    #endregion
}
