namespace SyncKit.Server.WebSockets.Protocol;

/// <summary>
/// Message type codes for binary encoding (must match SDK client exactly).
///
/// Binary Message Format:
/// ┌─────────────┬──────────────┬───────────────┬──────────────┐
/// │ Type (1 byte)│ Timestamp    │ Payload Length│ Payload      │
/// │              │ (8 bytes)    │ (4 bytes)     │ (JSON bytes) │
/// └─────────────┴──────────────┴───────────────┴──────────────┘
/// </summary>
public enum MessageTypeCode : byte
{
    AUTH = 0x01,
    AUTH_SUCCESS = 0x02,
    AUTH_ERROR = 0x03,
    SUBSCRIBE = 0x10,
    UNSUBSCRIBE = 0x11,
    SYNC_REQUEST = 0x12,
    SYNC_RESPONSE = 0x13,
    DELTA = 0x20,
    ACK = 0x21,
    PING = 0x30,
    PONG = 0x31,
    AWARENESS_UPDATE = 0x40,
    AWARENESS_SUBSCRIBE = 0x41,
    AWARENESS_STATE = 0x42,
    ERROR = 0xFF
}
