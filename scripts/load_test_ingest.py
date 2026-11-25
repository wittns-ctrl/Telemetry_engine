"""
Load test for telemetry uploads: many simulated PCs sending batches to a
running API, as the Lectio agent does, then a report of throughput, response
times, errors and whether every reading was stored and summarised.

It creates a test user and test PCs straight in the database, so it only runs
against a database whose name contains "load" or "test" (never your real one):

    # 1. Start the API on a throwaway database
    MONGO_DB=lectio_loadtest uv run uvicorn app.main:app --port 8000

    # 2. Run the test against it (same MONGODB_URI, same database name)
    uv run python scripts/load_test_ingest.py --db lectio_loadtest --devices 500 --minutes 2 --speedup 10

A real agent sends 12 readings once a minute. --speedup N sends N times as
often, so --devices 500 --speedup 10 is the upload load of 5,000 PCs.
Everything the test created is deleted at the end (--keep to leave it).
"""

from __future__ import annotations

import argparse
import asyncio
import random
import secrets
import statistics
import sys
import time
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings  # noqa: E402
from app.core.security import hash_token  # noqa: E402

AGENT_INTERVAL = 60.0  # a real agent sends one batch a minute


def reading(ts: datetime, rng: random.Random) -> dict:
    """One realistic reading, shaped like the agent's."""
    load = rng.uniform(5, 95)
    return {
        "event_id": uuid.uuid4().hex,
        "timestamp": ts.isoformat(),
        "sensor_id": "loadtest-agent",
        "cpu": {
            "core_temperature_c": round(40 + load * 0.45 + rng.uniform(-2, 2), 1),
            "package_temperature_c": round(42 + load * 0.45, 1),
            "utilization_percent": round(load, 1),
            "clock_speed_ghz": round(rng.uniform(2.0, 4.8), 2),
            "package_power_w": round(15 + load * 0.8, 1),
            "fan_speed_rpm": int(800 + load * 15),
            "thermal_throttling": False,
            "process_count": rng.randint(180, 320),
            "thread_count": rng.randint(2000, 4000),
            "handle_count": rng.randint(80000, 160000),
            "uptime_seconds": rng.randint(1000, 900000),
        },
        "gpu": {"core_temperature_c": round(rng.uniform(30, 75), 1), "utilization_percent": round(rng.uniform(0, 60), 1),
                "vram_used_gb": round(rng.uniform(0.5, 6), 2), "vram_total_gb": 8.0, "gpu_name": "Test GPU"},
        "ram": {"usage_percent": round(rng.uniform(30, 85), 1), "used_gb": round(rng.uniform(5, 27), 1), "total_gb": 32.0,
                "pagefile_usage_percent": round(rng.uniform(5, 40), 1), "whea_error_count": 0},
        "storage": [{"device_name": "Test SSD", "smart_health_percent": 97, "temperature_c": round(rng.uniform(30, 50), 1),
                     "available_capacity_gb": 300.0, "total_capacity_gb": 1000.0, "reallocated_sector_count": 0, "bad_sector_count": 0}],
        "power_vrm": {"vrm_temperature_c": round(rng.uniform(40, 70), 1), "psu_12v_voltage": round(rng.uniform(11.9, 12.2), 2)},
        "disk": {"active_percent": round(rng.uniform(0, 30), 1)},
        "network": {"receive_bytes_per_s": rng.uniform(1e3, 5e6), "send_bytes_per_s": rng.uniform(1e3, 1e6), "link_speed_mbps": 1000.0},
        "collection_duration_ms": round(rng.uniform(20, 120), 1),
    }


async def seed(db, devices: int):
    """A test user and `devices` PCs, each with a fresh agent key."""
    from bson import ObjectId

    from app.models.user import User

    user_id = ObjectId()
    await db[User.Settings.name].insert_one({
        "_id": user_id, "email": f"loadtest-{user_id}@example.test", "normalized_email": f"loadtest-{user_id}@example.test",
        "full_name": "Load test", "hashed_password": None, "email_verified": True, "is_active": True,
        "role": "user", "auth_providers": [], "created_at": datetime.now(timezone.utc),
    })
    keys, docs = [], []
    for i in range(devices):
        key = "lt_" + secrets.token_urlsafe(32)
        keys.append(key)
        docs.append({
            "_id": ObjectId(), "user_id": user_id, "device_name": f"Load test PC {i + 1}", "system_uuid": str(uuid.uuid4()),
            "os_info": "Windows 11", "is_active": True, "created_at": datetime.now(timezone.utc), "ingest_key_hash": hash_token(key),
        })
    await db["devices"].insert_many(docs)
    return user_id, [d["_id"] for d in docs], keys


async def cleanup(db, user_id):
    from app.models.user import User

    for coll in ("telemetry_snapshots", "telemetry_rollups", "anomaly_alerts", "fix_requests", "devices"):
        await db[coll].delete_many({"user_id": user_id})
    await db[User.Settings.name].delete_one({"_id": user_id})


async def pc(client, key, stats, stop_at, period, batch, rng, start_delay):
    """One simulated PC: a batch of readings every `period` seconds."""
    await asyncio.sleep(start_delay)
    headers = {"X-Device-Key": key}
    while time.monotonic() < stop_at:
        now = datetime.now(timezone.utc)
        step = timedelta(seconds=AGENT_INTERVAL / batch)
        readings = [reading(now - step * (batch - 1 - i), rng) for i in range(batch)]
        started = time.perf_counter()
        try:
            r = await client.post("/api/v1/telemetry/ingest/batch", json={"readings": readings}, headers=headers)
            stats["latency"].append((time.perf_counter() - started) * 1000)
            stats["status"][r.status_code] += 1
            if r.status_code == 202:
                stats["stored"] += r.json().get("stored", 0)
            stats["sent"] += batch
        except httpx.HTTPError as e:
            stats["status"][type(e).__name__] += 1
        await asyncio.sleep(max(0.0, period * rng.uniform(0.9, 1.1)))


def pct(values, p):
    if not values:
        return None
    values = sorted(values)
    return values[min(len(values) - 1, int(round(p / 100 * (len(values) - 1))))]


async def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--api", default="http://127.0.0.1:8000", help="API base URL")
    ap.add_argument("--db", default=settings.MONGO_DB, help="database the API under test uses (name must contain 'load' or 'test')")
    ap.add_argument("--devices", type=int, default=200, help="simulated PCs")
    ap.add_argument("--minutes", type=float, default=2.0, help="how long to send for")
    ap.add_argument("--speedup", type=float, default=1.0, help="send this many times more often than a real agent")
    ap.add_argument("--batch", type=int, default=12, help="readings per upload (the agent sends 12)")
    ap.add_argument("--connections", type=int, default=200, help="most HTTP connections open at once")
    ap.add_argument("--keep", action="store_true", help="leave the test user, PCs and readings in the database")
    args = ap.parse_args()

    if "load" not in args.db.lower() and "test" not in args.db.lower():
        sys.exit(f"Refusing to run against database {args.db!r}: its name must contain 'load' or 'test'.")

    from pymongo import AsyncMongoClient

    mongo = AsyncMongoClient(settings.MONGODB_URI, tz_aware=True)
    db = mongo[args.db]
    async with httpx.AsyncClient(base_url=args.api, timeout=30) as probe:
        health = (await probe.get("/api/v1/health")).json()
    print(f"API {args.api}: {health.get('status')}, shared state: {health.get('shared_state')}")

    user_id, device_ids, keys = await seed(db, args.devices)
    period = AGENT_INTERVAL / args.speedup
    print(f"Seeded {args.devices} test PCs in {args.db!r}; each uploads {args.batch} readings every {period:.1f} s "
          f"(the load of {args.devices * args.speedup:,.0f} real PCs) for {args.minutes:g} min.")

    stats = {"latency": [], "status": Counter(), "sent": 0, "stored": 0}
    limits = httpx.Limits(max_connections=args.connections, max_keepalive_connections=args.connections)
    try:
        async with httpx.AsyncClient(base_url=args.api, timeout=30, limits=limits) as client:
            started = time.monotonic()
            stop_at = started + args.minutes * 60
            rng = random.Random(1)
            await asyncio.gather(*(
                pc(client, key, stats, stop_at, period, args.batch, random.Random(rng.random()), rng.uniform(0, period))
                for key in keys
            ))
            elapsed = time.monotonic() - started

        # Give background alert checks a moment, then compare with the database.
        await asyncio.sleep(3)
        in_db = await db["telemetry_snapshots"].count_documents({"user_id": user_id})
        summarised = 0
        async for doc in db["telemetry_rollups"].find({"user_id": user_id, "granularity": "day"}, {"readings": 1}):
            summarised += doc.get("readings", 0)

        lat = stats["latency"]
        uploads = sum(v for k, v in stats["status"].items())
        print("\nResults")
        print(f"  uploads:        {uploads:,} in {elapsed:.0f} s = {uploads / elapsed:,.1f} per second")
        print(f"  readings sent:  {stats['sent']:,} = {stats['sent'] / elapsed:,.0f} per second")
        print(f"  responses:      {dict(stats['status'])}")
        if lat:
            print(f"  response time:  p50 {pct(lat, 50):.0f} ms, p95 {pct(lat, 95):.0f} ms, p99 {pct(lat, 99):.0f} ms, "
                  f"max {max(lat):.0f} ms (mean {statistics.mean(lat):.0f} ms)")
        print(f"  stored (API):   {stats['stored']:,}   in database: {in_db:,}   in daily summaries: {summarised:,}")
        ok = stats["status"].get(202, 0) == uploads and in_db == stats["stored"] == summarised
        print("  check:          " + ("every reading accepted, stored once and summarised" if ok else "MISMATCH or errors, see above"))
    finally:
        if args.keep:
            print(f"\nKept the test data (user {user_id}).")
        else:
            await cleanup(db, user_id)
            print("\nTest user, PCs, readings and summaries deleted.")
        await mongo.close()


if __name__ == "__main__":
    asyncio.run(main())
