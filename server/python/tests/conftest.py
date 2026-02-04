"""
Pytest fixtures for SyncKit server tests
"""

import pytest
import struct
import json
import time


@pytest.fixture
def sample_message():
    """Create a sample message dict"""
    return {
        "type": "ping",
        "id": "test-123",
        "timestamp": int(time.time() * 1000),
    }


@pytest.fixture
def sample_delta_message():
    """Create a sample delta message"""
    return {
        "type": "delta",
        "id": "delta-456",
        "timestamp": int(time.time() * 1000),
        "docId": "test-doc",
        "changes": {"field1": "value1", "field2": 42},
    }


@pytest.fixture
def sample_auth_message():
    """Create a sample auth message"""
    return {
        "type": "auth",
        "id": "auth-789",
        "timestamp": int(time.time() * 1000),
        "token": "test-token",
        "clientId": "client-001",
    }


@pytest.fixture
def binary_message_header():
    """Create a binary message header helper"""

    def create_header(type_code: int, timestamp: int, payload_len: int) -> bytes:
        return struct.pack(">BqI", type_code, timestamp, payload_len)

    return create_header


@pytest.fixture
def encode_binary_message(binary_message_header):
    """Create a full binary message helper"""

    def encode(type_code: int, payload: dict) -> bytes:
        timestamp = int(time.time() * 1000)
        payload_bytes = json.dumps(payload).encode("utf-8")
        header = binary_message_header(type_code, timestamp, len(payload_bytes))
        return header + payload_bytes

    return encode
