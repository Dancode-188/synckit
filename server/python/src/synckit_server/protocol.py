"""
WebSocket Protocol Types

Implements binary wire protocol compatible with SDK client.
Also maintains backward compatibility with JSON text protocol.

Binary Message Format:
┌─────────────┬──────────────┬───────────────┬──────────────┐
│ Type (1 byte)│ Timestamp    │ Payload Length│ Payload      │
│              │ (8 bytes)    │ (4 bytes)     │ (JSON bytes) │
└─────────────┴──────────────┴───────────────┴──────────────┘
"""

import struct
import json
from enum import IntEnum
from typing import Any
from pydantic import BaseModel, Field


class MessageTypeCode(IntEnum):
    """Message type codes for binary encoding (must match SDK client exactly)"""

    AUTH = 0x01
    AUTH_SUCCESS = 0x02
    AUTH_ERROR = 0x03
    SUBSCRIBE = 0x10
    UNSUBSCRIBE = 0x11
    SYNC_REQUEST = 0x12
    SYNC_RESPONSE = 0x13
    SYNC_STEP1 = 0x14
    SYNC_STEP2 = 0x15
    DELTA = 0x20
    ACK = 0x21
    DELTA_BATCH = 0x22
    PING = 0x30
    PONG = 0x31
    AWARENESS_UPDATE = 0x40
    AWARENESS_SUBSCRIBE = 0x41
    AWARENESS_STATE = 0x42
    ERROR = 0xFF


class MessageType:
    """Message type names (string representation)"""

    # Connection lifecycle
    CONNECT = "connect"
    DISCONNECT = "disconnect"
    PING = "ping"
    PONG = "pong"

    # Authentication
    AUTH = "auth"
    AUTH_SUCCESS = "auth_success"
    AUTH_ERROR = "auth_error"

    # Sync operations
    SUBSCRIBE = "subscribe"
    UNSUBSCRIBE = "unsubscribe"
    SYNC_REQUEST = "sync_request"
    SYNC_RESPONSE = "sync_response"
    SYNC_STEP1 = "sync_step1"
    SYNC_STEP2 = "sync_step2"
    DELTA = "delta"
    DELTA_BATCH = "delta_batch"
    ACK = "ack"

    # Awareness (presence)
    AWARENESS_UPDATE = "awareness_update"
    AWARENESS_SUBSCRIBE = "awareness_subscribe"
    AWARENESS_STATE = "awareness_state"

    # Errors
    ERROR = "error"


# Map type codes to type names
TYPE_CODE_TO_NAME = {
    MessageTypeCode.AUTH: MessageType.AUTH,
    MessageTypeCode.AUTH_SUCCESS: MessageType.AUTH_SUCCESS,
    MessageTypeCode.AUTH_ERROR: MessageType.AUTH_ERROR,
    MessageTypeCode.SUBSCRIBE: MessageType.SUBSCRIBE,
    MessageTypeCode.UNSUBSCRIBE: MessageType.UNSUBSCRIBE,
    MessageTypeCode.SYNC_REQUEST: MessageType.SYNC_REQUEST,
    MessageTypeCode.SYNC_RESPONSE: MessageType.SYNC_RESPONSE,
    MessageTypeCode.SYNC_STEP1: MessageType.SYNC_STEP1,
    MessageTypeCode.SYNC_STEP2: MessageType.SYNC_STEP2,
    MessageTypeCode.DELTA: MessageType.DELTA,
    MessageTypeCode.ACK: MessageType.ACK,
    MessageTypeCode.DELTA_BATCH: MessageType.DELTA_BATCH,
    MessageTypeCode.PING: MessageType.PING,
    MessageTypeCode.PONG: MessageType.PONG,
    MessageTypeCode.AWARENESS_UPDATE: MessageType.AWARENESS_UPDATE,
    MessageTypeCode.AWARENESS_SUBSCRIBE: MessageType.AWARENESS_SUBSCRIBE,
    MessageTypeCode.AWARENESS_STATE: MessageType.AWARENESS_STATE,
    MessageTypeCode.ERROR: MessageType.ERROR,
}

# Map type names to type codes
TYPE_NAME_TO_CODE = {v: k for k, v in TYPE_CODE_TO_NAME.items()}


class BaseMessage(BaseModel):
    """Base message type"""

    type: str
    id: str = Field(description="Message ID for request/response tracking")
    timestamp: int


def encode_message(message_type: str, payload: dict[str, Any], timestamp: int) -> bytes:
    """
    Encode a message to binary format.

    Format: [type:1 byte][timestamp:8 bytes][payload_len:4 bytes][payload:JSON bytes]
    """
    # Get type code
    type_code = TYPE_NAME_TO_CODE.get(message_type, MessageTypeCode.ERROR)

    # Encode payload as JSON
    payload_json = json.dumps(payload).encode("utf-8")
    payload_len = len(payload_json)

    # Pack header: type (1 byte) + timestamp (8 bytes, big-endian) + length (4 bytes, big-endian)
    header = struct.pack(">BqI", type_code, timestamp, payload_len)

    # Combine header and payload
    return header + payload_json


def decode_message(data: bytes) -> dict[str, Any]:
    """
    Decode a binary or JSON message.

    Returns dict with 'type', 'timestamp', and 'payload' keys.
    """
    # Check if it's JSON (starts with '{' or '[')
    if data[0:1] in (b"{", b"["):
        # JSON text protocol
        message = json.loads(data.decode("utf-8"))
        return message

    # Binary protocol
    # Parse header: type (1 byte) + timestamp (8 bytes) + length (4 bytes)
    if len(data) < 13:
        raise ValueError(f"Message too short: {len(data)} bytes")

    type_code, timestamp, payload_len = struct.unpack(">BqI", data[:13])

    # Parse payload
    payload_start = 13
    payload_end = payload_start + payload_len

    if len(data) < payload_end:
        raise ValueError(
            f"Incomplete message: expected {payload_end} bytes, got {len(data)}"
        )

    payload_bytes = data[payload_start:payload_end]
    payload = json.loads(payload_bytes.decode("utf-8"))

    # Get type name
    type_name = TYPE_CODE_TO_NAME.get(type_code, MessageType.ERROR)

    return {
        "type": type_name,
        "timestamp": timestamp,
        "payload": payload,
        **payload,  # Merge payload into top level for compatibility
    }
