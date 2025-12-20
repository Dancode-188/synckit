using System.Text.Json.Serialization;

namespace SyncKit.Server.WebSockets.Protocol;

/// <summary>
/// Message type names (string representation) - matches TypeScript exactly.
/// JSON serialization uses snake_case (e.g., "auth_success").
/// </summary>
public enum MessageType
{
    // Connection lifecycle
    Connect,
    Disconnect,
    Ping,
    Pong,

    // Authentication
    Auth,
    AuthSuccess,
    AuthError,

    // Sync operations
    Subscribe,
    Unsubscribe,
    SyncRequest,
    SyncResponse,
    Delta,
    Ack,

    // Awareness (presence)
    AwarenessUpdate,
    AwarenessSubscribe,
    AwarenessState,

    // Errors
    Error
}
