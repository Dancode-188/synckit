"""Tests for Redis pub/sub"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from synckit_server.storage.redis import RedisPubSub, PubSubStats


class TestPubSubStats:
    """Tests for PubSubStats dataclass"""

    def test_creation(self):
        stats = PubSubStats(
            connected=True,
            subscribed_channels=5,
            total_handlers=10,
        )
        assert stats.connected is True
        assert stats.subscribed_channels == 5
        assert stats.total_handlers == 10


class TestRedisPubSubInit:
    """Tests for RedisPubSub initialization"""

    def test_default_values(self):
        pubsub = RedisPubSub("redis://localhost:6379")
        assert pubsub.redis_url == "redis://localhost:6379"
        assert pubsub.channel_prefix == "synckit:"
        assert pubsub.max_retries == 3
        assert pubsub.retry_delay == 0.05
        assert pubsub.max_retry_delay == 2.0
        assert pubsub._connected is False

    def test_custom_values(self):
        pubsub = RedisPubSub(
            "redis://custom:6380",
            channel_prefix="myapp:",
            max_retries=5,
            retry_delay=0.1,
            max_retry_delay=5.0,
        )
        assert pubsub.channel_prefix == "myapp:"
        assert pubsub.max_retries == 5
        assert pubsub.retry_delay == 0.1
        assert pubsub.max_retry_delay == 5.0


class TestChannelNaming:
    """Tests for channel naming conventions"""

    def test_document_channel(self):
        pubsub = RedisPubSub("redis://localhost", channel_prefix="synckit:")
        assert pubsub._get_document_channel("doc-123") == "synckit:doc:doc-123"
        assert pubsub._get_document_channel("test") == "synckit:doc:test"

    def test_broadcast_channel(self):
        pubsub = RedisPubSub("redis://localhost", channel_prefix="synckit:")
        assert pubsub._get_broadcast_channel() == "synckit:broadcast"

    def test_presence_channel(self):
        pubsub = RedisPubSub("redis://localhost", channel_prefix="synckit:")
        assert pubsub._get_presence_channel() == "synckit:presence"

    def test_custom_prefix(self):
        pubsub = RedisPubSub("redis://localhost", channel_prefix="custom:")
        assert pubsub._get_document_channel("doc-1") == "custom:doc:doc-1"
        assert pubsub._get_broadcast_channel() == "custom:broadcast"
        assert pubsub._get_presence_channel() == "custom:presence"


class TestGetStats:
    """Tests for get_stats method"""

    def test_initial_stats(self):
        pubsub = RedisPubSub("redis://localhost")
        stats = pubsub.get_stats()
        assert stats.connected is False
        assert stats.subscribed_channels == 0
        assert stats.total_handlers == 0

    def test_stats_with_handlers(self):
        pubsub = RedisPubSub("redis://localhost")
        # Manually add some handlers for testing
        pubsub._handlers["channel1"] = {lambda x: x, lambda x: x}
        pubsub._handlers["channel2"] = {lambda x: x}
        pubsub._connected = True

        stats = pubsub.get_stats()
        assert stats.connected is True
        assert stats.subscribed_channels == 2
        assert stats.total_handlers == 3


class TestIsConnected:
    """Tests for is_connected method"""

    def test_not_connected(self):
        pubsub = RedisPubSub("redis://localhost")
        assert pubsub.is_connected() is False

    def test_connected(self):
        pubsub = RedisPubSub("redis://localhost")
        pubsub._connected = True
        assert pubsub.is_connected() is True


class TestGetTimestamp:
    """Tests for timestamp generation"""

    def test_timestamp_format(self):
        pubsub = RedisPubSub("redis://localhost")
        ts = pubsub._get_timestamp()
        # Should be a 13-digit millisecond timestamp
        assert isinstance(ts, int)
        assert ts > 1000000000000  # After year 2001
        assert ts < 9999999999999  # Before year 2286
