"""
Benchmark the API's main database reads against the configured MongoDB, and
show which index each one uses. Reads only; nothing is written.

    uv run python scripts/benchmark_db.py            # 20 runs of each query
    uv run python scripts/benchmark_db.py --runs 50

Prints p50/p95/p99 latency per query and the query plan's index (a
"COLLSCAN" means no index was used and the query reads the whole collection).
"""

from __future__ import annotations

import argparse
import asyncio
import statistics
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.monitoring import percentile  # noqa: E402
from app.db.session import close_db, init_db  # noqa: E402
from app.models.alert import AnomalyAlertDocument  # noqa: E402
from app.models.telemetry import Device, TelemetrySnapshotDocument  # noqa: E402
from app.models.user import User  # noqa: E402


def plan_index(explain: dict) -> str:
    """The index names (or COLLSCAN) in a query plan."""
    found: list[str] = []

    def walk(node):
        if isinstance(node, dict):
            if node.get("stage") == "COLLSCAN":
                found.append("COLLSCAN")
            if "indexName" in node:
                found.append(node["indexName"])
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(explain.get("queryPlanner", {}).get("winningPlan", explain))
    return ", ".join(dict.fromkeys(found)) or "?"


async def main(runs: int) -> None:
    started = time.perf_counter()
    await init_db()
    print(f"Connected in {time.perf_counter() - started:.1f} s\n")

    device = await Device.find_one({}, sort=[("last_seen", -1)])
    if device is None:
        print("No devices in this database; nothing to benchmark.")
        return
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    snapshots = TelemetrySnapshotDocument.get_pymongo_collection()
    alerts = AnomalyAlertDocument.get_pymongo_collection()

    latest_q = {"user_id": device.user_id, "device_id": device.id}
    range_q = {**latest_q, "timestamp": {"$gte": since}}
    alerts_q = {"user_id": device.user_id, "device_id": device.id, "is_active": True}

    queries = {
        "user by id": lambda: User.get(device.user_id),
        "user's devices": lambda: Device.find(Device.user_id == device.user_id).to_list(),
        "latest reading": lambda: snapshots.find_one(latest_q, sort=[("timestamp", -1)]),
        "24h of readings (count)": lambda: snapshots.count_documents(range_q),
        "open alerts": lambda: alerts.find(alerts_q).sort("created_at", -1).to_list(50),
    }
    plans = {
        "latest reading": snapshots.find(latest_q).sort("timestamp", -1).limit(1),
        "24h of readings (count)": snapshots.find(range_q),
        "open alerts": alerts.find(alerts_q).sort("created_at", -1),
    }

    print(f"{'query':26s} {'p50':>8s} {'p95':>8s} {'p99':>8s} {'mean':>8s}  index used")
    for name, run in queries.items():
        times = []
        for _ in range(runs):
            t = time.perf_counter()
            await run()
            times.append((time.perf_counter() - t) * 1000)
        ordered = sorted(times)
        index = plan_index(await plans[name].explain()) if name in plans else "_id / user_id"
        print(f"{name:26s} {percentile(ordered, 50):7.0f}ms {percentile(ordered, 95):7.0f}ms "
              f"{percentile(ordered, 99):7.0f}ms {statistics.mean(times):7.0f}ms  {index}")

    await close_db()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--runs", type=int, default=20)
    asyncio.run(main(parser.parse_args().runs))
