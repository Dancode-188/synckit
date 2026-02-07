using System.Text.RegularExpressions;

namespace SyncKit.Server.Security;

/// <summary>
/// Validates user-supplied identifiers and paths to prevent injection and path traversal attacks.
/// Mirrors the TypeScript server's validateDocumentId in server/typescript/src/security/middleware.ts.
/// </summary>
public static partial class InputValidator
{
    private const int MaxDocumentIdLength = 256;

    [GeneratedRegex(@"^[a-zA-Z0-9_:\-]+$")]
    private static partial Regex ValidDocumentIdRegex();

    /// <summary>
    /// Checks whether a document ID contains only safe characters (alphanumeric, dash, underscore, colon)
    /// and does not exceed 256 characters.
    /// </summary>
    public static bool IsValidDocumentId(string? id)
    {
        if (string.IsNullOrEmpty(id))
            return false;

        if (id.Length > MaxDocumentIdLength)
            return false;

        return ValidDocumentIdRegex().IsMatch(id);
    }

    /// <summary>
    /// Checks whether a field path is safe (rejects path traversal sequences and null bytes).
    /// </summary>
    public static bool IsValidFieldPath(string? path)
    {
        if (string.IsNullOrEmpty(path))
            return false;

        if (path.Contains('\0'))
            return false;

        if (path.Contains(".."))
            return false;

        return true;
    }

    /// <summary>
    /// Returns a human-readable validation error for the given document ID, or null if the ID is valid.
    /// </summary>
    public static string? GetValidationError(string? documentId)
    {
        if (string.IsNullOrEmpty(documentId))
            return "Invalid document ID";

        if (documentId.Length > MaxDocumentIdLength)
            return "Document ID too long";

        if (!ValidDocumentIdRegex().IsMatch(documentId))
            return "Document ID contains invalid characters";

        return null;
    }
}
