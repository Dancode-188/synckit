"""
Tests for the binary protocol encoding/decoding

Tests the protocol module that implements the wire format:
- Byte 0: Message type (uint8)
- Bytes 1-8: Timestamp (int64, big-endian)
- Bytes 9-12: Payload length (uint32, big-endian)
- Bytes 13+: JSON payload (UTF-8)
"""

import pytest
import struct
import json
import time

from synckit_server.protocol import (
    encode_message,
    decode_message,
    MessageType,
    MessageTypeCode,
    TYPE_CODE_TO_NAME,
    TYPE_NAME_TO_CODE,
)


class TestMessageTypeMappings:
    """Test message type code mappings"""

    def test_type_codes_defined(self):
        """Verify all expected type codes are defined"""
        assert MessageTypeCode.AUTH == 0x01
        assert MessageTypeCode.AUTH_SUCCESS == 0x02
        assert MessageTypeCode.AUTH_ERROR == 0x03
        assert MessageTypeCode.SUBSCRIBE == 0x10
        assert MessageTypeCode.UNSUBSCRIBE == 0x11
        assert MessageTypeCode.SYNC_REQUEST == 0x12
        assert MessageTypeCode.SYNC_RESPONSE == 0x13
        assert MessageTypeCode.DELTA == 0x20
        assert MessageTypeCode.ACK == 0x21
        assert MessageTypeCode.PING == 0x30
        assert MessageTypeCode.PONG == 0x31
        assert MessageTypeCode.AWARENESS_UPDATE == 0x40
        assert MessageTypeCode.ERROR == 0xFF

    def test_type_names_defined(self):
        """Verify all expected type names are defined"""
        assert MessageType.AUTH == "auth"
        assert MessageType.AUTH_SUCCESS == "auth_success"
        assert MessageType.AUTH_ERROR == "auth_error"
        assert MessageType.SUBSCRIBE == "subscribe"
        assert MessageType.UNSUBSCRIBE == "unsubscribe"
        assert MessageType.DELTA == "delta"
        assert MessageType.PING == "ping"
        assert MessageType.PONG == "pong"

    def test_bidirectional_mapping(self):
        """Verify type code to name mapping is bidirectional"""
        for code, name in TYPE_CODE_TO_NAME.items():
            assert TYPE_NAME_TO_CODE[name] == code


class TestBinaryEncoding:
    """Test binary message encoding"""

    def test_encode_ping_message(self):
        """Test encoding a PING message"""
        payload = {"type": "ping", "id": "test-123"}
        timestamp = 1234567890000

        result = encode_message(MessageType.PING, payload, timestamp)

        # Check header
        assert len(result) >= 13
        type_code, ts, payload_len = struct.unpack(">BqI", result[:13])
        assert type_code == MessageTypeCode.PING
        assert ts == timestamp

        # Check payload
        decoded_payload = json.loads(result[13:].decode("utf-8"))
        assert decoded_payload["type"] == "ping"
        assert decoded_payload["id"] == "test-123"

    def test_encode_delta_message(self):
        """Test encoding a DELTA message"""
        payload = {
            "type": "delta",
            "id": "delta-456",
            "docId": "doc-1",
            "changes": {"key": "value"},
        }
        timestamp = int(time.time() * 1000)

        result = encode_message(MessageType.DELTA, payload, timestamp)

        type_code, ts, payload_len = struct.unpack(">BqI", result[:13])
        assert type_code == MessageTypeCode.DELTA
        assert payload_len == len(result) - 13

    def test_encode_preserves_payload_data(self):
        """Test that encoding preserves all payload data"""
        payload = {
            "type": "delta",
            "id": "test",
            "nested": {"deep": {"value": 123}},
            "array": [1, 2, 3],
        }

        result = encode_message(MessageType.DELTA, payload, 1000)
        decoded = json.loads(result[13:].decode("utf-8"))

        assert decoded["nested"]["deep"]["value"] == 123
        assert decoded["array"] == [1, 2, 3]


class TestBinaryDecoding:
    """Test binary message decoding"""

    def test_decode_binary_message(self):
        """Test decoding a binary message"""
        payload = {"id": "test-123", "data": "hello"}
        payload_bytes = json.dumps(payload).encode("utf-8")
        timestamp = 1234567890000

        # Build binary message
        header = struct.pack(">BqI", MessageTypeCode.PING, timestamp, len(payload_bytes))
        message = header + payload_bytes

        result = decode_message(message)

        assert result["type"] == MessageType.PING
        assert result["timestamp"] == timestamp
        assert result["id"] == "test-123"
        assert result["data"] == "hello"

    def test_decode_json_message(self):
        """Test decoding a JSON text message"""
        message = json.dumps({
            "type": "ping",
            "id": "test-123",
            "timestamp": 1234567890000,
        }).encode("utf-8")

        result = decode_message(message)

        assert result["type"] == "ping"
        assert result["id"] == "test-123"

    def test_decode_rejects_short_message(self):
        """Test that decoding rejects messages shorter than header"""
        short_message = b"\x30\x00\x00"  # Only 3 bytes

        with pytest.raises(ValueError) as exc:
            decode_message(short_message)
        assert "too short" in str(exc.value).lower()

    def test_decode_rejects_truncated_payload(self):
        """Test that decoding rejects truncated payloads"""
        # Header says payload is 100 bytes but we only provide 10
        header = struct.pack(">BqI", MessageTypeCode.PING, 1000, 100)
        message = header + b"short"  # Only 5 bytes

        with pytest.raises(ValueError) as exc:
            decode_message(message)
        assert "incomplete" in str(exc.value).lower()


class TestRoundTrip:
    """Test encode/decode round trip"""

    def test_roundtrip_ping(self):
        """Test PING message round trip"""
        original = {"type": "ping", "id": "roundtrip-1"}
        timestamp = int(time.time() * 1000)

        encoded = encode_message(MessageType.PING, original, timestamp)
        decoded = decode_message(encoded)

        assert decoded["type"] == original["type"]
        assert decoded["id"] == original["id"]
        assert decoded["timestamp"] == timestamp

    def test_roundtrip_delta_with_complex_payload(self):
        """Test DELTA message round trip with complex data"""
        original = {
            "type": "delta",
            "id": "complex-1",
            "docId": "doc-123",
            "changes": {
                "string": "hello",
                "number": 42,
                "float": 3.14,
                "boolean": True,
                "null": None,
                "nested": {"key": "value"},
                "array": [1, "two", 3.0],
            },
        }
        timestamp = int(time.time() * 1000)

        encoded = encode_message(MessageType.DELTA, original, timestamp)
        decoded = decode_message(encoded)

        assert decoded["type"] == original["type"]
        assert decoded["docId"] == original["docId"]
        assert decoded["changes"]["string"] == "hello"
        assert decoded["changes"]["number"] == 42
        assert decoded["changes"]["nested"]["key"] == "value"

    def test_roundtrip_all_message_types(self):
        """Test round trip for all message types"""
        types_to_test = [
            (MessageType.AUTH, MessageTypeCode.AUTH),
            (MessageType.AUTH_SUCCESS, MessageTypeCode.AUTH_SUCCESS),
            (MessageType.SUBSCRIBE, MessageTypeCode.SUBSCRIBE),
            (MessageType.DELTA, MessageTypeCode.DELTA),
            (MessageType.ACK, MessageTypeCode.ACK),
            (MessageType.PING, MessageTypeCode.PING),
            (MessageType.PONG, MessageTypeCode.PONG),
            (MessageType.AWARENESS_UPDATE, MessageTypeCode.AWARENESS_UPDATE),
            (MessageType.ERROR, MessageTypeCode.ERROR),
        ]

        for type_name, type_code in types_to_test:
            payload = {"type": type_name, "id": f"test-{type_code}"}
            encoded = encode_message(type_name, payload, 1000)
            decoded = decode_message(encoded)
            assert decoded["type"] == type_name, f"Failed for {type_name}"
