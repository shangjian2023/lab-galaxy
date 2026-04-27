"""In-memory event bus for SSE-based graph change notifications."""

import asyncio
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class EventBus:
    def __init__(self):
        self._subscribers: list[asyncio.Queue] = []

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        if q in self._subscribers:
            self._subscribers.remove(q)

    def publish(self, event_type: str, data: dict):
        msg = json.dumps({
            "type": event_type,
            "data": data,
            "timestamp": datetime.utcnow().isoformat(),
        }, ensure_ascii=False)
        for q in self._subscribers:
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                logger.warning("SSE subscriber queue full, dropping event")


graph_event_bus = EventBus()
