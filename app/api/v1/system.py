"""
Health and performance endpoints.

  GET /health              public: is the API up and can it reach the database?
                           503 when the database doesn't answer (load balancers
                           use this to stop sending traffic to this process)
  GET /admin/db-stats      admins only: connection pool use, query latency
                           (p50/p95/p99 per command), read/write throughput,
                           slow commands, cache hit ratio, ingest queue lag,
                           and the database server's own CPU/memory figures
                           when the database user is allowed to read them
"""

import asyncio
import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.api.deps import require_admin
from app.core.cache import cache
from app.core.config import settings
from app.core.websocket_manager import manager
from app.db import session
from app.models.user import User
from app.services.ingest_processor import ingest_processor
from app.core import shared

logger = logging.getLogger(__name__)

router = APIRouter(tags=["System"])

HEALTH_PING_TIMEOUT = 3.0


async def ping_database() -> tuple[bool, float | None]:
    try:
        # The database Beanie was set up with (also the test suite's in-memory one).
        database = User.get_pymongo_collection().database
    except Exception:
        return False, None
    started = time.perf_counter()
    try:
        await asyncio.wait_for(database.command("ping"), HEALTH_PING_TIMEOUT)
    except Exception as e:
        logger.warning("Health check: database ping failed: %s", e)
        return False, None
    return True, round((time.perf_counter() - started) * 1000, 1)


@router.get("/health", summary="Health Check")
async def health_check():
    (ok, ping_ms), redis_ok = await asyncio.gather(ping_database(), shared.ping())
    body = {
        "status": "healthy" if ok else "degraded",
        "service": "Lectio",
        "database": "ok" if ok else "unreachable",
        "database_ping_ms": ping_ms,
        # "memory": this process only; "redis": shared with other API processes.
        # A Redis outage doesn't fail the check: the API keeps working per process.
        "shared_state": shared.mode() if redis_ok is not False else "redis (unreachable, using memory)",
        "active_websockets": manager.total_connections(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    return JSONResponse(body, status_code=200 if ok else 503)


async def _server_status() -> dict | None:
    """The database server's CPU/memory/connection figures, if this user may read them."""
    client = session.get_client()
    if client is None:
        return None
    try:
        s = await asyncio.wait_for(client.admin.command("serverStatus"), 5)
    except Exception as e:
        return {"available": False, "reason": str(e)[:200]}
    mem = s.get("mem", {})
    conns = s.get("connections", {})
    ops = s.get("opcounters", {})
    return {
        "available": True,
        "version": s.get("version"),
        "uptime_seconds": s.get("uptime"),
        "memory_resident_mb": mem.get("resident"),
        "memory_virtual_mb": mem.get("virtual"),
        "connections_current": conns.get("current"),
        "connections_available": conns.get("available"),
        "opcounters": {k: ops.get(k) for k in ("insert", "query", "update", "delete", "getmore", "command")},
        "cpu": s.get("extra_info", {}).get("user_time_us"),
    }


@router.get("/admin/db-stats", summary="Database and Ingest Performance", dependencies=[Depends(require_admin())])
async def db_stats():
    ok, ping_ms = await ping_database()
    return {
        "database": {"reachable": ok, "ping_ms": ping_ms},
        "pool": session.pool_stats.snapshot(settings.MONGO_MAX_POOL_SIZE),
        "queries": session.command_stats.snapshot(),
        "cache": cache.info(),
        "shared_state": {"mode": shared.mode(), "redis_reachable": await shared.ping()},
        "ingest": ingest_processor.info(),
        "server": await _server_status(),
    }
