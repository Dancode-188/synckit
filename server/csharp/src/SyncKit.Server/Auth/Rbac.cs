using System.Linq;

namespace SyncKit.Server.Auth;

/// <summary>
/// Levels expressing the amount of access a user has for a document.
/// </summary>
public enum PermissionLevel
{
    None,
    Read,
    Write,
    Admin
}

/// <summary>
/// Helper methods for evaluating document-level permissions from a token payload.
/// </summary>
public static class Rbac
{
    /// <summary>
    /// Determines whether the payload grants read access to the specified document.
    /// </summary>
    /// <param name="payload">The validated token payload.</param>
    /// <param name="documentId">Document identifier to check.</param>
    /// <returns>
    /// <c>true</c> when the user is an admin or the document ID is included in <see cref="DocumentPermissions.CanRead"/>.
    /// </returns>
    public static bool CanReadDocument(TokenPayload? payload, string? documentId)
    {
        if (IsAdmin(payload))
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(documentId))
        {
            return false;
        }

        return payload?.Permissions?.CanRead?.Contains(documentId) == true;
    }

    /// <summary>
    /// Determines whether the payload grants write access to the specified document.
    /// </summary>
    /// <param name="payload">The validated token payload.</param>
    /// <param name="documentId">Document identifier to check.</param>
    /// <returns>
    /// <c>true</c> when the user is an admin or the document ID is included in <see cref="DocumentPermissions.CanWrite"/>.
    /// </returns>
    public static bool CanWriteDocument(TokenPayload? payload, string? documentId)
    {
        if (IsAdmin(payload))
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(documentId))
        {
            return false;
        }

        return payload?.Permissions?.CanWrite?.Contains(documentId) == true;
    }

    /// <summary>
    /// Determines whether the payload grants admin access.
    /// </summary>
    /// <param name="payload">The validated token payload.</param>
    /// <returns><c>true</c> when the permissions claim contains <see cref="DocumentPermissions.IsAdmin"/>.</returns>
    public static bool IsAdmin(TokenPayload? payload)
    {
        return payload?.Permissions?.IsAdmin == true;
    }

    /// <summary>
    /// Computes the effective permission level for the specified document.
    /// </summary>
    /// <param name="payload">The validated token payload.</param>
    /// <param name="documentId">Document identifier to evaluate.</param>
    /// <returns>
    /// The highest matching <see cref="PermissionLevel"/> for the payload relative to the document.
    /// </returns>
    public static PermissionLevel GetPermissionLevel(TokenPayload? payload, string? documentId)
    {
        if (IsAdmin(payload))
        {
            return PermissionLevel.Admin;
        }

        if (CanWriteDocument(payload, documentId))
        {
            return PermissionLevel.Write;
        }

        if (CanReadDocument(payload, documentId))
        {
            return PermissionLevel.Read;
        }

        return PermissionLevel.None;
    }
}
