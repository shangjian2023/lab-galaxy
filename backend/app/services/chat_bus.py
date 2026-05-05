"""Redis pub/sub bus for real-time team chat messages."""

import asyncio
import json
import logging
from typing import AsyncIterator

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)


class ChatBus:
    """Thin wrapper around Redis pub/sub for team chat channels."""

    def __init__(self):
        self._redis: aioredis.Redis | None = None

    async def connect(self):
        try:
            self._redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            await self._redis.ping()
            logger.info("ChatBus connected to Redis.")
        except Exception as e:
            logger.warning(f"ChatBus Redis connect failed: {e}")
            self._redis = None

    async def close(self):
        if self._redis:
            await self._redis.aclose()
            self._redis = None

    def _channel(self, team_id: str) -> str:
        return f"team:{team_id}:chat"

    async def publish(self, team_id: str, data: dict):
        if not self._redis:
            return
        await self._redis.publish(self._channel(team_id), json.dumps(data, ensure_ascii=False))

    async def subscribe(self, team_id: str) -> AsyncIterator[str]:
        if not self._redis:
            return
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(self._channel(team_id))
        try:
            async for msg in pubsub.listen():
                if msg["type"] == "message":
                    yield msg["data"]
        finally:
            await pubsub.unsubscribe(self._channel(team_id))
            await pubsub.aclose()


chat_bus = ChatBus()
