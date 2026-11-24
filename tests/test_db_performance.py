"""
Database performance features: batch ingest with duplicate prevention, the
cache in front of users/devices/latest readings (and its invalidation), the
background ingest processor, health and admin stats.
"""

import asyncio
import secrets
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.core.cache import MemoryCache, cache, device_key_key, latest_key, user_key
from app.core.security import hash_token
from app.models.telemetry import Device, TelemetrySnapshot, TelemetrySnapshotDocument
from app.models.user import User
from app.services.ingest_processor import IngestProcessor


async def give_key(device: Device) -> dict:
    key = secrets.token_urlsafe(32)
    device.ingest_key_hash = hash_token(key)
    await device.save()
    return {"X-Device-Key": key}


def reading(event_id: str, minutes_ago: float = 0, util: float = 40.0) -> dict:
    ts = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
    return {"event_id": event_id, "timestamp": ts.isoformat(), "sensor_id": "agent-test",
            "cpu": {"utilization_percent": util}}


async def post_batch(client, headers, readings):
    return await client.post("/api/v1/telemetry/ingest/batch", headers=headers, json={"readings": readings})


# ------------------------------------------------------------- batch ingest

@pytest.mark.asyncio
async def test_batch_stores_every_reading_in_one_go(async_client, test_device):
    headers = await give_key(test_device)
    response = await post_batch(async_client, headers, [reading(f"evt-{i:04d}", minutes_ago=10 - i) for i in range(10)])

    assert response.status_code == 202
    assert response.json() == {"status": "accepted", "received": 10, "stored": 10, "duplicates": 0, "too_old": 0}
    assert await TelemetrySnapshotDocument.find(TelemetrySnapshotDocument.device_id == test_device.id).count() == 10
    assert (await Device.get(test_device.id)).last_seen is not None


@pytest.mark.asyncio
async def test_resending_a_batch_stores_nothing_twice(async_client, test_device):
    headers = await give_key(test_device)
    batch = [reading("evt-aaaa1"), reading("evt-aaaa2", minutes_ago=1)]
    await post_batch(async_client, headers, batch)

    again = await post_batch(async_client, headers, batch + [reading("evt-aaaa3", minutes_ago=2)])

    assert again.json()["stored"] == 1
    assert again.json()["duplicates"] == 2
    assert await TelemetrySnapshotDocument.find(TelemetrySnapshotDocument.device_id == test_device.id).count() == 3


@pytest.mark.asyncio
async def test_a_duplicate_inside_one_batch_is_stored_once(async_client, test_device):
    headers = await give_key(test_device)
    response = await post_batch(async_client, headers, [reading("evt-same01"), reading("evt-same01")])
    assert response.json()["stored"] == 1 and response.json()["duplicates"] == 1


@pytest.mark.asyncio
async def test_buffered_readings_keep_their_time_but_too_old_ones_are_dropped(async_client, test_device):
    headers = await give_key(test_device)
    response = await post_batch(async_client, headers, [
        reading("evt-hour-old", minutes_ago=60),           # buffered while offline: kept as is
        reading("evt-ancient", minutes_ago=60 * 24 * 365),  # past retention
    ])
    assert response.json()["stored"] == 1 and response.json()["too_old"] == 1
    doc = await TelemetrySnapshotDocument.find_one(TelemetrySnapshotDocument.event_id == "evt-hour-old")
    stored_at = doc.timestamp if doc.timestamp.tzinfo else doc.timestamp.replace(tzinfo=timezone.utc)
    assert datetime.now(timezone.utc) - stored_at > timedelta(minutes=55)


@pytest.mark.asyncio
async def test_batch_checks_its_input(async_client, test_device):
    headers = await give_key(test_device)
    assert (await post_batch(async_client, headers, [reading("bad id!")])).status_code == 422
    assert (await post_batch(async_client, headers, [])).status_code == 422
    too_many = [reading(f"evt-{i:05d}") for i in range(101)]
    assert (await post_batch(async_client, headers, too_many)).status_code == 422
    assert (await post_batch(async_client, {"X-Device-Key": "x" * 40}, [reading("evt-00001")])).status_code == 401


@pytest.mark.asyncio
async def test_batch_relays_only_the_newest_reading_live(async_client, test_device):
    headers = await give_key(test_device)
    with patch("app.services.ingest_processor.manager.broadcast_to_device", AsyncMock()) as broadcast:
        await post_batch(async_client, headers, [reading("evt-old001", 5, util=10.0), reading("evt-new001", 0, util=90.0)])
    sent = [c.args[2] for c in broadcast.await_args_list if c.args[2]["type"] == "telemetry"]
    assert len(sent) == 1 and sent[0]["telemetry"]["cpu"]["utilization_percent"] == 90.0


# -------------------------------------------------------------------- cache

@pytest.mark.asyncio
async def test_signed_in_user_is_cached_and_dropped_when_saved(async_client, test_user, auth_headers):
    assert (await async_client.get("/api/v1/auth/me", headers=auth_headers)).status_code == 200
    assert await cache.get(user_key(test_user.id)) is not None

    test_user.full_name = "Renamed Person"
    await test_user.save()
    assert await cache.get(user_key(test_user.id)) is None
    me = await async_client.get("/api/v1/auth/me", headers=auth_headers)
    assert me.json()["full_name"] == "Renamed Person"


@pytest.mark.asyncio
async def test_device_key_is_cached_and_a_new_key_cuts_off_the_old(async_client, test_device):
    headers = await give_key(test_device)
    old_hash = test_device.ingest_key_hash
    await post_batch(async_client, headers, [reading("evt-k0001")])
    assert await cache.get(device_key_key(old_hash)) is not None

    await give_key(test_device)  # re-linking the PC rotates its key
    assert await cache.get(device_key_key(old_hash)) is None
    assert (await post_batch(async_client, headers, [reading("evt-k0002")])).status_code == 401


@pytest.mark.asyncio
async def test_latest_reading_comes_from_the_cache_after_an_upload(authenticated_client, test_device):
    headers = await give_key(test_device)
    await post_batch(authenticated_client, headers, [reading("evt-l0001", util=77.0)])
    assert await cache.get(latest_key(test_device.id)) is not None

    with patch("app.api.v1.metrics.StorageService.get_historical_telemetry", AsyncMock(side_effect=AssertionError)):
        response = await authenticated_client.get("/api/v1/metrics/latest", params={"device_id": str(test_device.id)})
    assert response.status_code == 200
    assert response.json()["cpu"]["utilization_percent"] == 77.0


@pytest.mark.asyncio
async def test_cached_latest_reading_still_needs_ownership(authenticated_client, other_device):
    await cache.set(latest_key(other_device.id), '{"id": "x"}', 60)
    response = await authenticated_client.get("/api/v1/metrics/latest", params={"device_id": str(other_device.id)})
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_memory_cache_expires_and_counts_hits():
    c = MemoryCache(max_entries=2)
    await c.set("a", "1", ttl_seconds=60)
    await c.set("b", "2", ttl_seconds=0)
    assert await c.get("a") == "1"
    assert await c.get("b") is None  # expired
    await c.set("c", "3", 60)
    await c.set("d", "4", 60)  # over the cap: the oldest goes
    assert await c.get("a") is None
    info = c.info()
    assert info["hits"] == 1 and info["misses"] == 2


# ------------------------------------------------------- background worker

@pytest.mark.asyncio
async def test_worker_processes_queued_readings_in_order_and_drains_on_stop(test_device):
    seen = []

    async def record(user_id, device_id, snapshot):
        seen.append(snapshot.cpu.utilization_percent)
        return []

    processor = IngestProcessor()
    processor.start(workers=2, queue_size=10)
    with patch("app.services.ingest_processor.anomaly_engine.evaluate_snapshot", side_effect=record), \
         patch("app.services.ingest_processor.manager.broadcast_to_device", AsyncMock()):
        for util in (1.0, 2.0, 3.0):
            await processor.submit(test_device, [TelemetrySnapshot(sensor_id="agent-test", cpu={"utilization_percent": util})])
        await processor.stop()
    assert seen == [1.0, 2.0, 3.0]
    assert processor.info()["readings_processed"] == 3 and processor.info()["workers"] == 0


@pytest.mark.asyncio
async def test_full_queue_processes_in_the_request_instead_of_dropping(test_device):
    processor = IngestProcessor()
    processor.start(workers=1, queue_size=1)
    gate = asyncio.Event()

    async def slow(*args, **kwargs):
        await gate.wait()
        return []

    with patch("app.services.ingest_processor.anomaly_engine.evaluate_snapshot", side_effect=slow), \
         patch("app.services.ingest_processor.manager.broadcast_to_device", AsyncMock()):
        snap = [TelemetrySnapshot(sensor_id="agent-test")]
        await processor.submit(test_device, snap)  # taken by the worker, which waits
        await asyncio.sleep(0)
        await processor.submit(test_device, snap)  # fills the queue
        gate.set()
        await processor.submit(test_device, snap)  # no room: runs right here
        await processor.stop()
    assert processor.info()["ran_in_request_because_queue_full"] == 1
    assert processor.info()["readings_processed"] == 3


# ------------------------------------------------------- health and stats

@pytest.mark.asyncio
async def test_health_reports_the_database(async_client, mock_mongo_client):
    response = await async_client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["database"] == "ok"


@pytest.mark.asyncio
async def test_health_is_503_when_the_database_is_down(async_client, mock_mongo_client):
    with patch("app.api.v1.system.ping_database", AsyncMock(return_value=(False, None))):
        response = await async_client.get("/api/v1/health")
    assert response.status_code == 503 and response.json()["database"] == "unreachable"


@pytest.mark.asyncio
async def test_db_stats_are_for_admins_only(async_client, auth_headers, admin_auth_headers):
    assert (await async_client.get("/api/v1/admin/db-stats", headers=auth_headers)).status_code == 403
    response = await async_client.get("/api/v1/admin/db-stats", headers=admin_auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert {"database", "pool", "queries", "cache", "ingest", "server"} <= body.keys()
    assert body["cache"]["backend"] == "memory"


def test_pool_listener_handles_every_pool_event():
    """pymongo calls each method by name; an attribute shadowing one crashes its monitor thread."""
    from types import SimpleNamespace
    from app.db.monitoring import PoolStats
    stats = PoolStats()
    event = SimpleNamespace(address=("db", 27017), reason="timeout", connection_id=1, duration=0.1)
    for name in ("pool_created", "pool_ready", "pool_cleared", "pool_closed", "connection_created",
                 "connection_ready", "connection_check_out_started", "connection_checked_out",
                 "connection_checked_in", "connection_check_out_failed", "connection_closed"):
        getattr(stats, name)(event)
    snap = stats.snapshot(50)
    assert snap["times_cleared"] == 1 and snap["checkout_failures"] == 1
