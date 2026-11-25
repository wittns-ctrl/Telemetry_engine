"""
Shared state through a real Redis: rate limits, single-use WebSocket tickets,
alert-check state and the live-update relay, as several API processes see it.

Needs a Redis server; skipped unless LECTIO_TEST_REDIS_URL is set, e.g.

    docker run -d --name lectio-test-redis -p 127.0.0.1:6390:6379 redis:7.4-alpine
    LECTIO_TEST_REDIS_URL=redis://127.0.0.1:6390/15 uv run pytest tests/test_shared_redis.py

The database number in the URL is flushed by these tests: use a spare one.
"""

import asyncio
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

REDIS_URL = os.environ.get("LECTIO_TEST_REDIS_URL")
pytestmark = pytest.mark.skipif(not REDIS_URL, reason="LECTIO_TEST_REDIS_URL not set (needs a Redis server)")

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture
async def redis_shared():
    """Point the app's shared state at the test Redis, emptied before and after."""
    import redis.asyncio as redis
    from app.core import shared

    client = redis.from_url(REDIS_URL, decode_responses=True)
    await client.flushdb()
    shared.set_redis_client(client)
    yield client
    shared.set_redis_client(None)
    await client.flushdb()
    await client.aclose()


class FakeSocket:
    def __init__(self):
        self.sent = []
        self.closed = None

    async def accept(self):
        pass

    async def send_json(self, message):
        self.sent.append(message)

    async def close(self, code=1000, reason=""):
        self.closed = (code, reason)


async def wait_for(check, seconds=5.0):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if check():
            return True
        await asyncio.sleep(0.05)
    return check()


# ----------------------------------------------------------------- rate limits

async def test_rate_limit_is_shared_between_processes(redis_shared):
    from app.core.rate_limit import RateLimiter, SharedRateLimiter

    # Two limiters with separate memory, as in two API processes.
    a, b = SharedRateLimiter(RateLimiter()), SharedRateLimiter(RateLimiter())
    decisions = [await a.check("user:1", 3), await b.check("user:1", 3), await a.check("user:1", 3)]
    assert all(d.allowed for d in decisions)
    blocked = await b.check("user:1", 3)
    assert not blocked.allowed and blocked.retry_after >= 1
    # Other keys have their own bucket.
    assert (await b.check("user:2", 3)).allowed
    assert 0 < await redis_shared.ttl("rl:user:1") <= 120


async def test_rate_limit_falls_back_to_memory_when_redis_is_down():
    import redis.asyncio as redis
    from app.core import shared
    from app.core.rate_limit import RateLimiter, SharedRateLimiter

    dead = redis.from_url("redis://127.0.0.1:1/0", socket_connect_timeout=0.2, socket_timeout=0.2)
    shared.set_redis_client(dead)
    try:
        limiter = SharedRateLimiter(RateLimiter())
        assert (await limiter.check("user:x", 1)).allowed
        assert not (await limiter.check("user:x", 1)).allowed  # counted in memory instead
    finally:
        shared.set_redis_client(None)
        await dead.aclose()


async def test_middleware_uses_the_shared_buckets(redis_shared, async_client, auth_headers, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "RATE_LIMIT_PER_MINUTE", 2)
    codes = [(await async_client.get("/api/v1/devices", headers=auth_headers)).status_code for _ in range(3)]
    assert codes[:2] != [429, 429] and codes[2] == 429
    assert await redis_shared.keys("rl:user:*")


# ------------------------------------------------------------------ WS tickets

async def test_ws_ticket_works_once_across_processes(redis_shared):
    from app.api import deps

    exp = time.time() + 30
    assert await deps._claim_ws_ticket("jti-1", exp) is True
    deps._used_ws_tickets.clear()  # another process has no memory of it
    assert await deps._claim_ws_ticket("jti-1", exp) is False
    assert 0 < await redis_shared.ttl("wsticket:jti-1") <= 31


# ----------------------------------------------------------------- alert state

async def test_alert_state_carries_over_to_another_process(redis_shared, mock_mongo_client, test_device):
    from app.models.telemetry import CPUMetrics, TelemetrySnapshot
    from app.services.anomaly_engine import AnomalyEngine

    user, device = str(test_device.user_id), str(test_device.id)
    start = datetime.now(timezone.utc) - timedelta(seconds=40)
    hot = lambda ts: TelemetrySnapshot(timestamp=ts, sensor_id="agent", cpu=CPUMetrics(core_temperature_c=95.0))

    # Process A sees the start of a breach: too short for an alert yet.
    assert await AnomalyEngine().evaluate_snapshot(user, device, hot(start)) == []
    assert await redis_shared.exists(f"alertstate:{user}:{device}")

    # Process B, with empty memory, sees it continue 35 s later. Only if it
    # knows when the breach started (from Redis) does that raise the alert.
    alerts = await AnomalyEngine().evaluate_snapshot(user, device, hot(start + timedelta(seconds=35)))
    assert {a.rule_name for a in alerts} >= {"CPU_OVERHEATING_CRITICAL", "CPU_OVERHEATING_WARNING"}

    # And a third process doesn't open the same alerts again.
    again = await AnomalyEngine().evaluate_snapshot(user, device, hot(start + timedelta(seconds=40)))
    assert all(a.id in {x.id for x in alerts} for a in again)


async def test_alert_state_round_trips_through_json():
    from app.services.anomaly_engine import BreachState, DeviceState, _state_from_json, _state_to_json

    now = datetime.now(timezone.utc).replace(microsecond=0)
    state = DeviceState(device_id="d", user_id="u", breach_states={
        "R": BreachState(breach_start_time=now, consecutive_breaches=3, last_breach_time=now, is_triggered=True, alert_id="a1"),
    }, last_updated=now)
    back = _state_from_json(_state_to_json(state))
    assert back == state


async def test_forgetting_a_rule_is_shared(redis_shared, mock_mongo_client, test_device):
    from app.models.telemetry import CPUMetrics, TelemetrySnapshot
    from app.services.anomaly_engine import AnomalyEngine

    user, device = str(test_device.user_id), str(test_device.id)
    snap = TelemetrySnapshot(timestamp=datetime.now(timezone.utc), sensor_id="agent", cpu=CPUMetrics(core_temperature_c=95.0))
    await AnomalyEngine().evaluate_snapshot(user, device, snap)
    await AnomalyEngine().forget_rule(user, device, "CPU_OVERHEATING_CRITICAL")
    saved = json.loads(await redis_shared.get(f"alertstate:{user}:{device}"))
    assert "CPU_OVERHEATING_CRITICAL" not in saved["breach_states"]
    assert "CPU_OVERHEATING_WARNING" in saved["breach_states"]


# ------------------------------------------------------------ live-update relay

async def test_relay_delivers_other_processes_updates(redis_shared):
    from app.core import shared
    from app.core.websocket_manager import RELAY_CHANNEL, ConnectionManager

    manager = ConnectionManager()
    sock = FakeSocket()
    await manager.connect(sock, "u1", "d1")
    manager.start_relay()
    try:
        await asyncio.sleep(0.3)  # let it subscribe
        # From another process: delivered here.
        await redis_shared.publish(RELAY_CHANNEL, json.dumps({
            "origin": "another-process", "kind": "device", "user_id": "u1", "device_id": "d1", "message": {"type": "telemetry", "n": 1},
        }))
        # From this process: already delivered locally, so skipped.
        await redis_shared.publish(RELAY_CHANNEL, json.dumps({
            "origin": shared.INSTANCE_ID, "kind": "device", "user_id": "u1", "device_id": "d1", "message": {"n": 2},
        }))
        # Another user's device: not delivered to this socket.
        await redis_shared.publish(RELAY_CHANNEL, json.dumps({
            "origin": "another-process", "kind": "device", "user_id": "u2", "device_id": "d1", "message": {"n": 3},
        }))
        assert await wait_for(lambda: sock.sent)
        await asyncio.sleep(0.3)
        assert sock.sent == [{"type": "telemetry", "n": 1}]

        # A device deleted on another server closes the socket here too.
        await redis_shared.publish(RELAY_CHANNEL, json.dumps({
            "origin": "another-process", "kind": "disconnect_device", "user_id": "u1", "device_id": "d1", "reason": "Device deleted",
        }))
        assert await wait_for(lambda: sock.closed)
        assert manager.total_connections() == 0
    finally:
        await manager.stop_relay()


async def test_broadcast_reaches_local_sockets_once_with_redis(redis_shared):
    from app.core.websocket_manager import ConnectionManager

    manager = ConnectionManager()
    sock = FakeSocket()
    await manager.connect(sock, "u1", "d1")
    manager.start_relay()
    try:
        await asyncio.sleep(0.3)
        await manager.broadcast_to_device("u1", "d1", {"n": 1})
        await asyncio.sleep(0.5)  # time for the relay to (wrongly) deliver it again
        assert sock.sent == [{"n": 1}]
    finally:
        await manager.stop_relay()


# --------------------------------------------------- two real processes

OTHER_PROCESS = r"""
import asyncio, json, os, sys
os.environ["REDIS_URL"] = sys.argv[1]
from app.core import shared
from app.core.rate_limit import shared_limiter
from app.core.websocket_manager import manager

async def main():
    # Spend two requests from a shared bucket, then send a live update.
    decisions = [await shared_limiter.check("user:cross", 3) for _ in range(2)]
    await manager.broadcast_to_device("u-cross", "d-cross", {"from": "other process", "pid": os.getpid()})
    await shared.close()
    print(json.dumps({"allowed": [d.allowed for d in decisions], "instance": shared.INSTANCE_ID}))

asyncio.run(main())
"""


async def test_two_processes_share_limits_and_live_updates(redis_shared):
    from app.core import shared
    from app.core.rate_limit import RateLimiter, SharedRateLimiter
    from app.core.websocket_manager import ConnectionManager

    manager = ConnectionManager()
    sock = FakeSocket()
    await manager.connect(sock, "u-cross", "d-cross")
    manager.start_relay()
    try:
        await asyncio.sleep(0.3)
        proc = await asyncio.to_thread(
            subprocess.run, [sys.executable, "-c", OTHER_PROCESS, REDIS_URL],
            cwd=ROOT, capture_output=True, text=True, timeout=60,
        )
        assert proc.returncode == 0, proc.stderr[-2000:]
        result = json.loads(proc.stdout.strip().splitlines()[-1])
        assert result["allowed"] == [True, True]
        assert result["instance"] != shared.INSTANCE_ID

        # The other process's update reached the socket open in this one.
        assert await wait_for(lambda: sock.sent, 10)
        assert sock.sent[0]["from"] == "other process"

        # It spent 2 of the 3 requests: one left here, then blocked.
        limiter = SharedRateLimiter(RateLimiter())
        assert (await limiter.check("user:cross", 3)).allowed
        assert not (await limiter.check("user:cross", 3)).allowed
    finally:
        await manager.stop_relay()
