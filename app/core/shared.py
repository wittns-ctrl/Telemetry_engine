"""
State shared by every API process, through Redis.

With REDIS_URL set, several API processes or servers can run behind a load
balancer: rate limits, single-use WebSocket tickets, alert-check state and
live-update delivery all go through Redis, so each process sees the same
picture. Without REDIS_URL everything stays in this process's memory, which is
right for one process (development, small installs).

Each user of this module falls back to its in-memory behaviour if Redis
fails, so a Redis outage degrades the service to "one process's view" rather
than taking it down.
"""

from __future__ import annotations

import logging
import time
import uuid
from typing import Any, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# Identifies this process in messages relayed through Redis, so it can skip
# its own (it has already delivered them locally).
INSTANCE_ID = uuid.uuid4().hex

_client: Any = None
_unavailable = False
_last_warning: dict[str, float] = {}


def redis_client():
    """The shared Redis client, or None when REDIS_URL isn't set (or redis isn't installed)."""
    global _client, _unavailable
    if _client is not None or _unavailable or not settings.REDIS_URL:
        return _client
    try:
        import redis.asyncio as redis  # optional dependency: uv sync --extra redis
    except ImportError:
        logger.error("REDIS_URL is set but the redis package isn't installed (uv sync --extra redis); "
                     "running with per-process state")
        _unavailable = True
        return None
    _client = redis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
        socket_timeout=2,
        socket_connect_timeout=2,
        health_check_interval=30,
    )
    return _client


def set_redis_client(client) -> None:
    """Use this client (tests), or None to go back to per-process state."""
    global _client, _unavailable
    _client = client
    _unavailable = client is None


def warn(what: str, error: Exception) -> None:
    """Log a Redis failure at most once a minute per kind, not once per request."""
    now = time.monotonic()
    if now - _last_warning.get(what, 0.0) > 60:
        _last_warning[what] = now
        logger.warning("Redis %s failed, using this process's own state for now: %s", what, error)


async def close() -> None:
    global _client
    if _client is not None and settings.REDIS_URL:
        try:
            await _client.aclose()
        except Exception:
            pass
    _client = None


def mode() -> str:
    """'redis' or 'memory', for health and admin pages."""
    return "redis" if redis_client() is not None else "memory"


async def ping() -> Optional[bool]:
    """True/False for Redis reachability, None when Redis isn't used."""
    client = redis_client()
    if client is None:
        return None
    try:
        return bool(await client.ping())
    except Exception:
        return False
