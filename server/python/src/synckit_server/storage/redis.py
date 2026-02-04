"""Redis Pub/Sub for Multi-Server Coordination

Enables multiple server instances to coordinate document updates
using Redis pub/sub channels. Matches TypeScript reference implementation.
"""

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

import redis.asyncio as redis

logger = logging.getLogger(__name__)


@dataclass
class PubSubStats:
    """Pub/sub statistics"""
    connected: bool
    subscribed_channels: int
    total_handlers: int


class RedisPubSub:
    """Redis Pub/Sub for multi-server coordination

    Enables multiple server instances to coordinate document updates
    using Redis pub/sub channels.
    """

    def __init__(
        self,
        redis_url: str,
        channel_prefix: str = "synckit:",
        max_retries: int = 3,
        retry_delay: float = 0.05,
        max_retry_delay: float = 2.0,
    ):
        self.redis_url = redis_url
        self.channel_prefix = channel_prefix
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.max_retry_delay = max_retry_delay

        self._publisher: Optional[redis.Redis] = None
        self._subscriber: Optional[redis.Redis] = None
        self._pubsub: Optional[redis.client.PubSub] = None
        self._connected = False
        self._handlers: dict[str, set[Callable]] = {}
        self._listener_task: Optional[asyncio.Task] = None

    async def connect(self) -> None:
        """Connect to Redis with retry logic"""
        retries = 0
        last_error = None

        while retries <= self.max_retries:
            try:
                # Create separate connections for pub and sub
                self._publisher = redis.from_url(
                    self.redis_url,
                    decode_responses=True,
                )
                self._subscriber = redis.from_url(
                    self.redis_url,
                    decode_responses=True,
                )

                # Test connections
                await self._publisher.ping()
                await self._subscriber.ping()

                # Create pubsub object
                self._pubsub = self._subscriber.pubsub()

                self._connected = True
                return
            except Exception as e:
                last_error = e
                retries += 1
                if retries <= self.max_retries:
                    delay = min(
                        self.retry_delay * (2 ** (retries - 1)),
                        self.max_retry_delay
                    )
                    await asyncio.sleep(delay)

        self._connected = False
        raise ConnectionError(f"Failed to connect to Redis after {self.max_retries} retries: {last_error}")

    async def disconnect(self) -> None:
        """Disconnect from Redis"""
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
            self._listener_task = None

        if self._pubsub:
            await self._pubsub.close()
            self._pubsub = None

        if self._publisher:
            await self._publisher.close()
            self._publisher = None

        if self._subscriber:
            await self._subscriber.close()
            self._subscriber = None

        self._connected = False
        self._handlers.clear()

    def is_connected(self) -> bool:
        """Check if connected"""
        return self._connected

    async def health_check(self) -> bool:
        """Health check"""
        try:
            if not self._publisher:
                return False
            await self._publisher.ping()
            return True
        except Exception:
            return False

    # ==========================================================================
    # DOCUMENT CHANNELS
    # ==========================================================================

    async def publish_delta(self, document_id: str, delta: dict[str, Any]) -> None:
        """Publish delta to document channel"""
        channel = self._get_document_channel(document_id)
        await self._publish(channel, delta)

    async def subscribe_to_document(
        self,
        document_id: str,
        handler: Callable[[dict[str, Any]], None],
    ) -> None:
        """Subscribe to document deltas"""
        channel = self._get_document_channel(document_id)
        await self._subscribe(channel, handler)

    async def unsubscribe_from_document(self, document_id: str) -> None:
        """Unsubscribe from document"""
        channel = self._get_document_channel(document_id)
        await self._unsubscribe(channel)

    # ==========================================================================
    # BROADCAST CHANNELS
    # ==========================================================================

    async def publish_broadcast(self, event: str, data: Any) -> None:
        """Publish to broadcast channel (all servers)"""
        channel = self._get_broadcast_channel()
        await self._publish(channel, {"event": event, "data": data})

    async def subscribe_to_broadcast(
        self,
        handler: Callable[[str, Any], None],
    ) -> None:
        """Subscribe to broadcast channel"""
        channel = self._get_broadcast_channel()

        def wrapper(message: dict[str, Any]) -> None:
            handler(message.get("event", ""), message.get("data"))

        await self._subscribe(channel, wrapper)

    # ==========================================================================
    # PRESENCE CHANNELS (Server coordination)
    # ==========================================================================

    async def announce_presence(self, server_id: str, metadata: Optional[dict] = None) -> None:
        """Announce server presence"""
        channel = self._get_presence_channel()
        await self._publish(channel, {
            "type": "server_online",
            "serverId": server_id,
            "timestamp": self._get_timestamp(),
            "metadata": metadata or {},
        })

    async def announce_shutdown(self, server_id: str) -> None:
        """Announce server shutdown"""
        channel = self._get_presence_channel()
        await self._publish(channel, {
            "type": "server_offline",
            "serverId": server_id,
            "timestamp": self._get_timestamp(),
        })

    async def subscribe_to_presence(
        self,
        handler: Callable[[str, str, Optional[dict]], None],
    ) -> None:
        """Subscribe to server presence events

        Args:
            handler: Called with (event: 'online'|'offline', server_id, metadata)
        """
        channel = self._get_presence_channel()

        def wrapper(message: dict[str, Any]) -> None:
            if message.get("type") == "server_online":
                handler("online", message.get("serverId", ""), message.get("metadata"))
            elif message.get("type") == "server_offline":
                handler("offline", message.get("serverId", ""), None)

        await self._subscribe(channel, wrapper)

    # ==========================================================================
    # CORE PUB/SUB OPERATIONS
    # ==========================================================================

    async def _publish(self, channel: str, data: Any) -> None:
        """Publish message to channel with retry"""
        if not self._publisher:
            raise ConnectionError("Not connected to Redis")

        retries = 0
        last_error = None

        while retries <= self.max_retries:
            try:
                await self._publisher.publish(channel, json.dumps(data))
                return
            except Exception as e:
                last_error = e
                retries += 1
                if retries <= self.max_retries:
                    delay = min(
                        self.retry_delay * (2 ** (retries - 1)),
                        self.max_retry_delay
                    )
                    await asyncio.sleep(delay)

        logger.error(f"Failed to publish to {channel}: {last_error}")
        raise last_error

    async def _subscribe(self, channel: str, handler: Callable) -> None:
        """Subscribe to channel"""
        if not self._pubsub:
            raise ConnectionError("Not connected to Redis")

        # Add handler
        if channel not in self._handlers:
            self._handlers[channel] = set()
            # Subscribe to channel if first handler
            await self._pubsub.subscribe(channel)

            # Start listener if not running
            if not self._listener_task or self._listener_task.done():
                self._listener_task = asyncio.create_task(self._listen())

        self._handlers[channel].add(handler)

    async def _unsubscribe(self, channel: str) -> None:
        """Unsubscribe from channel"""
        if not self._pubsub:
            return

        self._handlers.pop(channel, None)
        try:
            await self._pubsub.unsubscribe(channel)
        except Exception as e:
            logger.error(f"Failed to unsubscribe from {channel}: {e}")

    async def _listen(self) -> None:
        """Listen for messages on subscribed channels"""
        if not self._pubsub:
            return

        try:
            async for message in self._pubsub.listen():
                if message["type"] == "message":
                    channel = message["channel"]
                    try:
                        data = json.loads(message["data"])
                    except json.JSONDecodeError:
                        logger.error(f"Failed to parse message: {message['data']}")
                        continue

                    handlers = self._handlers.get(channel, set())
                    for handler in handlers:
                        try:
                            handler(data)
                        except Exception as e:
                            logger.error(f"Error in message handler: {e}")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Error in listener: {e}")

    # ==========================================================================
    # CHANNEL NAMING
    # ==========================================================================

    def _get_document_channel(self, document_id: str) -> str:
        return f"{self.channel_prefix}doc:{document_id}"

    def _get_broadcast_channel(self) -> str:
        return f"{self.channel_prefix}broadcast"

    def _get_presence_channel(self) -> str:
        return f"{self.channel_prefix}presence"

    # ==========================================================================
    # UTILITIES
    # ==========================================================================

    def _get_timestamp(self) -> int:
        """Get current timestamp in milliseconds"""
        import time
        return int(time.time() * 1000)

    # ==========================================================================
    # STATISTICS
    # ==========================================================================

    def get_stats(self) -> PubSubStats:
        """Get pub/sub statistics"""
        total_handlers = sum(len(h) for h in self._handlers.values())
        return PubSubStats(
            connected=self._connected,
            subscribed_channels=len(self._handlers),
            total_handlers=total_handlers,
        )
