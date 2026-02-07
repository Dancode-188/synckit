using System.Net.WebSockets;

namespace SyncKit.Server.WebSockets;

/// <summary>
/// Interface for managing WebSocket connections.
/// Provides connection lifecycle management, lookup, and broadcast capabilities.
/// </summary>
/// <remarks>
/// Full implementation in P2-08. This interface is defined here to allow
/// the WebSocket middleware (P2-01) to depend on it.
/// </remarks>
public interface IConnectionManager
{
    /// <summary>
    /// Creates a new connection from a WebSocket and begins tracking it.
    /// </summary>
    /// <param name="webSocket">The WebSocket instance.</param>
    /// <param name="cancellationToken">Cancellation token for the operation.</param>
    /// <returns>The created connection.</returns>
    Task<IConnection> CreateConnectionAsync(WebSocket webSocket, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets a connection by its ID.
    /// </summary>
    /// <param name="connectionId">The connection ID.</param>
    /// <returns>The connection if found, null otherwise.</returns>
    IConnection? GetConnection(string connectionId);

    /// <summary>
    /// Gets all active connections.
    /// </summary>
    /// <returns>Read-only list of all connections.</returns>
    IReadOnlyList<IConnection> GetAllConnections();

    /// <summary>
    /// Gets all connections subscribed to a specific document.
    /// </summary>
    /// <param name="documentId">The document ID.</param>
    /// <returns>Read-only list of connections.</returns>
    IReadOnlyList<IConnection> GetConnectionsByDocument(string documentId);

    /// <summary>
    /// Gets all connections for a specific user.
    /// </summary>
    /// <param name="userId">The user ID.</param>
    /// <returns>Read-only list of connections.</returns>
    IReadOnlyList<IConnection> GetConnectionsByUser(string userId);

    /// <summary>
    /// Removes a connection from tracking and performs cleanup.
    /// </summary>
    /// <param name="connectionId">The connection ID to remove.</param>
    /// <returns>Task representing the async operation.</returns>
    Task RemoveConnectionAsync(string connectionId);

    /// <summary>
    /// Broadcasts a message to all connections subscribed to a specific document.
    /// </summary>
    /// <param name="documentId">The document ID to broadcast to.</param>
    /// <param name="message">The message to broadcast.</param>
    /// <param name="excludeConnectionId">Optional connection ID to exclude from broadcast.</param>
    /// <returns>Task representing the async operation.</returns>
    Task BroadcastToDocumentAsync(string documentId, Protocol.IMessage message, string? excludeConnectionId = null);

    /// <summary>
    /// Closes all active connections.
    /// </summary>
    /// <param name="status">The WebSocket close status code.</param>
    /// <param name="description">The close description.</param>
    /// <returns>Task representing the async operation.</returns>
    Task CloseAllAsync(WebSocketCloseStatus status, string description);

    /// <summary>
    /// Gets the current number of active connections.
    /// </summary>
    int ConnectionCount { get; }
}
