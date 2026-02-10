using System.Net.WebSockets;

namespace SyncKit.Server.WebSockets;

/// <summary>
/// Minimal no-op connection manager used for backward-compatible tests where
/// a full DI-provided IConnectionManager isn't available.
/// Not intended for production use.
/// </summary>
internal class DefaultConnectionManager : IConnectionManager
{
    public Task<IConnection> CreateConnectionAsync(WebSocket webSocket, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public IConnection? GetConnection(string connectionId) => null;
    public IReadOnlyList<IConnection> GetAllConnections() => Array.Empty<IConnection>();
    public IReadOnlyList<IConnection> GetConnectionsByDocument(string documentId) => Array.Empty<IConnection>();
    public IReadOnlyList<IConnection> GetConnectionsByUser(string userId) => Array.Empty<IConnection>();
    public Task RemoveConnectionAsync(string connectionId) => Task.CompletedTask;
    public Task BroadcastToDocumentAsync(string documentId, Protocol.IMessage message, string? excludeConnectionId = null) => Task.CompletedTask;
    public Task CloseAllAsync(WebSocketCloseStatus status, string description) => Task.CompletedTask;
    public int ConnectionCount => 0;
}
