using System;
using SyncKit.Server.Auth;

namespace SyncKit.Server.Tests.Auth;

public class RbacTests
{
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
    public void CanReadDocument_HandlesMultipleDocuments()
    {
        var payload = CreatePayload(canRead: new[] { "doc-1", "doc-2", "doc-3" });

        Assert.True(Rbac.CanReadDocument(payload, "doc-1"));
        Assert.True(Rbac.CanReadDocument(payload, "doc-2"));
        Assert.True(Rbac.CanReadDocument(payload, "doc-3"));
        Assert.False(Rbac.CanReadDocument(payload, "doc-4"));
    }

    [Fact]
    public void GetPermissionLevel_ReturnsNone_WhenDocumentIdIsNull()
    {
        var payload = CreatePayload(canRead: new[] { "document-1" });

        Assert.Equal(PermissionLevel.None, Rbac.GetPermissionLevel(payload, null));
    }

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
}
