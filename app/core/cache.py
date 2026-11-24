"""
A small cache in front of MongoDB for reads that repeat on every request.

With REDIS_URL set, entries live in Redis and are shared by every API process
(needed once the API runs on more than one server). Without it, they live in
this process's memory. Either way the cache is only a shortcut: a miss, an
expired entry or a Redis outage just means reading MongoDB as before.

What is cached (see the key helpers below):
  - the signed-in user, read on every authenticated request;
  - the device behind an agent's key, read on every telemetry upload;
  - whether a device belongs to a user, checked on every metrics read;
  - each device's latest reading, so the dashboard's first paint skips the
    database (real-time data kept apart from the stored history).
Entries expire on their own (TTL) and are deleted when the document changes
(Beanie save/delete hooks on User and Device), so stale data is short-lived.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import OrderedDict
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


def user_key(user_id) -> str:
    return f"user:{user_id}"


def device_key_key(ingest_key_hash: str) -> str:
    return f"devkey:{ingest_key_hash}"


def ownership_key(user_id, device_id) -> str:
    return f"own:{user_id}:{device_id}"


def latest_key(device_id) -> str:
    return f"latest:{device_id}"


class CacheStats:
    def __init__(self):
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0
        self.errors = 0

    def record(self, hit: bool):
        with self._lock:
            if hit:
                self.hits += 1
            else:
                self.misses += 1

    def snapshot(self) -> dict:
        with self._lock:
            total = self.hits + self.misses
            return {
                "hits": self.hits,
                "misses": self.misses,
                "errors": self.errors,
                "hit_ratio": round(self.hits / total, 3) if total else None,
            }


class MemoryCache:
    """Per-process cache with TTLs and a size cap (oldest entries go first)."""

    backend = "memory"

    def __init__(self, max_entries: int = 50_000):
        self._data: OrderedDict[str, tuple[float, str]] = OrderedDict()
        self._lock = threading.Lock()
        self._max = max_entries
        self.stats = CacheStats()

    async def get(self, key: str) -> Optional[str]:
        now = time.monotonic()
        with self._lock:
            item = self._data.get(key)
            if item and item[0] > now:
                self._data.move_to_end(key)
                self.stats.record(True)
                return item[1]
            if item:
                del self._data[key]
        self.stats.record(False)
        return None

    async def set(self, key: str, value: str, ttl_seconds: int) -> None:
        with self._lock:
            self._data[key] = (time.monotonic() + ttl_seconds, value)
            self._data.move_to_end(key)
            while len(self._data) > self._max:
                self._data.popitem(last=False)

    async def delete(self, *keys: str) -> None:
        with self._lock:
            for key in keys:
                self._data.pop(key, None)

    async def clear(self) -> None:
        with self._lock:
            self._data.clear()

    async def close(self) -> None:
        pass

    def info(self) -> dict:
        with self._lock:
            size = len(self._data)
        return {"backend": self.backend, "entries": size, **self.stats.snapshot()}


class RedisCache:
    """Shared cache in Redis. Any Redis error counts as a miss and is logged."""

    backend = "redis"

    def __init__(self, url: str):
        import redis.asyncio as redis  # optional dependency: uv sync --extra redis

        self._redis = redis.from_url(url, decode_responses=True, socket_timeout=2, socket_connect_timeout=2)
        self.stats = CacheStats()

    def _failed(self, action: str, error: Exception):
        self.stats.errors += 1
        logger.warning("Redis %s failed, reading the database instead: %s", action, error)

    async def get(self, key: str) -> Optional[str]:
        try:
            value = await self._redis.get(key)
        except Exception as e:
            self._failed("get", e)
            return None
        self.stats.record(value is not None)
        return value

    async def set(self, key: str, value: str, ttl_seconds: int) -> None:
        try:
            await self._redis.set(key, value, ex=ttl_seconds)
        except Exception as e:
            self._failed("set", e)

    async def delete(self, *keys: str) -> None:
        if not keys:
            return
        try:
            await self._redis.delete(*keys)
        except Exception as e:
            self._failed("delete", e)

    async def clear(self) -> None:
        pass  # never flush a shared Redis

    async def close(self) -> None:
        await self._redis.aclose()

    def info(self) -> dict:
        return {"backend": self.backend, **self.stats.snapshot()}


def _make_cache():
    if settings.REDIS_URL:
        try:
            return RedisCache(settings.REDIS_URL)
        except ImportError:
            logger.warning("REDIS_URL is set but the redis package isn't installed; using the in-memory cache")
    return MemoryCache()


cache = _make_cache()
