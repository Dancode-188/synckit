using System.Net.WebSockets;

namespace SyncKit.Server.WebSockets;

/// <summary>
/// Connection states matching the TypeScript server.
/// </summary>
public enum ConnectionState
{
    /// <summary>Initial state when connection is being established.</summary>
    Connecting,

    /// <summary>Connection established, waiting for authentication.</summary>
    Authenticating,

    /// <summary>Connection authenticated and ready for sync operations.</summary>
    Authenticated,

    /// <summary>Connection is being closed gracefully.</summary>
    Disconnecting,

    /// <summary>Connection has been closed.</summary>
    Disconnected
}

/// <summary>
/// Protocol types for message serialization.
/// </summary>
public enum ProtocolType
{
    /// <summary>Protocol not yet detected.</summary>
    Unknown,

    /// <summary>JSON protocol (used by test suite).</summary>
    Json,

    /// <summary>Binary protocol (used by SDK clients).</summary>
    Binary
}

/// <summary>
/// Interface for a WebSocket connection.
/// Manages connection state, protocol detection, and message handling.
/// </summary>
/// <remarks>
/// Full implementation in P2-02. This interface is defined here to allow
/// the ConnectionManager (P2-08) to work with connections.
/// </remarks>
public interface IConnection : IAsyncDisposable
{
    /// <summary>
    /// Unique identifier for this connection.
    /// </summary>
    string Id { get; }

    /// <summary>
    /// Current connection state.
    /// </summary>
    ConnectionState State { get; set; }

    /// <summary>
    /// Detected protocol type (JSON or Binary).
    /// </summary>
    ProtocolType Protocol { get; }

    /// <summary>
    /// Authenticated user ID (null if not authenticated).
    /// </summary>
    string? UserId { get; set; }

    /// <summary>
    /// Client-provided ID for this connection.
    /// </summary>
    string? ClientId { get; set; }

    /// <summary>
    /// Parsed JWT token payload (null if not authenticated).
    /// </summary>
    Auth.TokenPayload? TokenPayload { get; set; }

    /// <summary>
    /// Timestamp of last activity on this connection.
    /// </summary>
    DateTime LastActivity { get; }

    /// <summary>
    /// Whether the connection is still alive (responding to heartbeats).
    /// </summary>
    bool IsAlive { get; }

    /// <summary>
    /// The underlying WebSocket.
    /// </summary>
    WebSocket WebSocket { get; }

    /// <summary>
    /// Process incoming messages until the connection closes.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Task that completes when the connection closes.</returns>
    Task ProcessMessagesAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Close the connection gracefully.
    /// </summary>
    /// <param name="status">WebSocket close status code.</param>
    /// <param name="description">Close description.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    Task CloseAsync(WebSocketCloseStatus status, string description, CancellationToken cancellationToken = default);

    /// <summary>
    /// Add a document subscription.
    /// </summary>
    /// <param name="documentId">The document ID to subscribe to.</param>
    void AddSubscription(string documentId);

    /// <summary>
    /// Remove a document subscription.
    /// </summary>
    /// <param name="documentId">The document ID to unsubscribe from.</param>
    void RemoveSubscription(string documentId);

    /// <summary>
    /// Get all subscribed document IDs.
    /// </summary>
    /// <returns>Set of document IDs.</returns>
    IReadOnlySet<string> GetSubscriptions();

    /// <summary>
    /// Send a message to the client.
    /// </summary>
    /// <param name="message">The message to send.</param>
    /// <returns>True if the message was sent, false if the connection is closed.</returns>
    bool Send(Protocol.IMessage message);

    /// <summary>
    /// Start the heartbeat timer to monitor connection health.
    /// </summary>
    /// <param name="intervalMs">Time between ping messages in milliseconds.</param>
    /// <param name="timeoutMs">Maximum time to wait for pong response in milliseconds.</param>
    void StartHeartbeat(int intervalMs, int timeoutMs);

    /// <summary>
    /// Stop the heartbeat timer.
    /// </summary>
    void StopHeartbeat();

    /// <summary>
    /// Handle a PONG message received from the client.
    /// </summary>
    void HandlePong();

    /// <summary>
    /// Handle a PING message received from the client.
    /// </summary>
    /// <param name="ping">The ping message received.</param>
    void HandlePing(Protocol.Messages.PingMessage ping);

    /// <summary>
    /// Event raised when a message is received from the client.
    /// </summary>
    event EventHandler<Protocol.IMessage>? MessageReceived;
}
