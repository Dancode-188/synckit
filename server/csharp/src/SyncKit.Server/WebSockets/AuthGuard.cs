using SyncKit.Server.Auth;

namespace SyncKit.Server.WebSockets;

/// <summary>
/// Middleware/guard that ensures authentication and authorization before processing messages.
/// Provides methods to check authentication state and document permissions.
/// </summary>
public class AuthGuard
{
    private readonly ILogger<AuthGuard> _logger;

    public AuthGuard(ILogger<AuthGuard> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Ensure the connection is authenticated.
    /// </summary>
    /// <param name="connection">The connection to check.</param>
    /// <returns>True if authenticated, false otherwise.</returns>
    public bool RequireAuth(IConnection connection)
    {
        if (connection.State != ConnectionState.Authenticated || connection.TokenPayload == null)
        {
            _logger.LogWarning(
                "Unauthorized request from connection {ConnectionId} (State: {State})",
                connection.Id, connection.State);

            connection.SendError("Not authenticated");
            return false;
        }

        return true;
    }

    /// <summary>
    /// Ensure the connection has read permission for a document.
    /// </summary>
    /// <param name="connection">The connection to check.</param>
    /// <param name="documentId">The document ID to check read access for.</param>
    /// <returns>True if authorized, false otherwise.</returns>
    public bool RequireRead(IConnection connection, string documentId)
    {
        if (!RequireAuth(connection))
        {
            return false;
        }

        if (!Rbac.CanReadDocument(connection.TokenPayload, documentId))
        {
            _logger.LogWarning(
                "Connection {ConnectionId} (user {UserId}) denied read access to document {DocumentId}",
                connection.Id, connection.UserId, documentId);

            connection.SendError("Permission denied", new { documentId });
            return false;
        }

        return true;
    }

    /// <summary>
    /// Ensure the connection has write permission for a document.
    /// </summary>
    /// <param name="connection">The connection to check.</param>
    /// <param name="documentId">The document ID to check write access for.</param>
    /// <returns>True if authorized, false otherwise.</returns>
    public bool RequireWrite(IConnection connection, string documentId)
    {
        if (!RequireAuth(connection))
        {
            return false;
        }

        if (!Rbac.CanWriteDocument(connection.TokenPayload, documentId))
        {
            _logger.LogWarning(
                "Connection {ConnectionId} (user {UserId}) denied write access to document {DocumentId}",
                connection.Id, connection.UserId, documentId);

            connection.SendError("Permission denied", new { documentId });
            return false;
        }

        return true;
    }

    /// <summary>
    /// Ensure the connection has awareness access.
    /// </summary>
    /// <param name="connection">The connection to check.</param>
    /// <returns>True if authorized, false otherwise.</returns>
    public bool RequireAwareness(IConnection connection)
    {
        if (!RequireAuth(connection))
        {
            return false;
        }

        // For awareness, we just check authentication
        // In a more complex system, you might have specific awareness permissions
        // For now, any authenticated user can use awareness features
        return true;
    }
}
