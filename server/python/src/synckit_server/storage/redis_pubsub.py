"""Redis pub/sub for multi-server coordination"""

import json
import redis.asyncio as redis
from typing import Any, Callable


class RedisPubSub:
    """Redis pub/sub adapter for coordinating multiple server instances"""

    def __init__(self, redis_url: str, channel_prefix: str = "synckit"):
        self.redis_url = redis_url
        self.channel_prefix = channel_prefix
        self.client: redis.Redis | None = None
        self.pubsub: redis.client.PubSub | None = None

    async def connect(self):
        """Connect to Redis"""
        self.client = redis.from_url(
            self.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
        self.pubsub = self.client.pubsub()

    async def close(self):
        """Close the connection"""
        if self.pubsub:
            await self.pubsub.close()
        if self.client:
            await self.client.close()

    def _get_channel(self, doc_id: str) -> str:
        """Get channel name for a document"""
        return f"{self.channel_prefix}:doc:{doc_id}"

    async def publish(self, doc_id: str, message: dict[str, Any]):
        """Publish a message to a document channel"""
        if not self.client:
            return

        channel = self._get_channel(doc_id)
        await self.client.publish(channel, json.dumps(message))

    async def subscribe(self, doc_id: str, callback: Callable[[dict[str, Any]], None]):
        """Subscribe to a document channel"""
        if not self.pubsub:
            return

        channel = self._get_channel(doc_id)
        await self.pubsub.subscribe(channel)

        # Listen for messages
        async for message in self.pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    callback(data)
                except Exception as e:
                    print(f"Error processing pub/sub message: {e}")

    async def unsubscribe(self, doc_id: str):
        """Unsubscribe from a document channel"""
        if not self.pubsub:
            return

        channel = self._get_channel(doc_id)
        await self.pubsub.unsubscribe(channel)
