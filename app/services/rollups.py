"""
Keeping the hourly and daily summaries (app/models/rollup.py) up to date,
and reading them back for graphs.

Every numeric reading is summarised (sum, count, lowest, highest), under a
flat key such as "cpu__core_temperature_c". Storage is summarised for the
first drive only, as the dashboard shows it, under "storage0__...".
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Optional, get_args

from beanie import PydanticObjectId
from pymongo import UpdateOne
from pymongo.errors import BulkWriteError

from app.core.config import settings
from app.models.rollup import TelemetryRollupDocument
from app.models.telemetry import (
    CPUMetrics,
    DiskActivityMetrics,
    GPUMetrics,
    NetworkMetrics,
    PowerAndVRMMetrics,
    RAMMetrics,
    StorageMetrics,
)

logger = logging.getLogger(__name__)

DUPLICATE_KEY = 11000

# Group in a snapshot -> its model; "storage0" is the first drive in the list.
GROUPS = {
    "cpu": CPUMetrics,
    "gpu": GPUMetrics,
    "ram": RAMMetrics,
    "power_vrm": PowerAndVRMMetrics,
    "disk": DiskActivityMetrics,
    "network": NetworkMetrics,
    "storage0": StorageMetrics,
}


def _types(annotation) -> set:
    types = set(get_args(annotation)) or {annotation}
    types.discard(type(None))
    return types


def _numeric(annotation) -> bool:
    types = _types(annotation)
    return bool(types) and types <= {int, float}


# (group, field, key) for every numeric reading. Flags (bool) and text are left out.
ROLLUP_FIELDS: list[tuple[str, str, str]] = [
    (group, name, f"{group}__{name}")
    for group, model in GROUPS.items()
    for name, info in model.model_fields.items()
    if _numeric(info.annotation)
]
# Whole-number readings (fan RPM, counts): their averages are rounded back.
INT_KEYS = {
    key for group, name, key in ROLLUP_FIELDS
    if _types(GROUPS[group].model_fields[name].annotation) == {int}
}

GRANULARITIES = {
    "hour": timedelta(hours=1),
    "day": timedelta(days=1),
}


def retention(granularity: str) -> timedelta:
    days = settings.ROLLUP_HOURLY_RETENTION_DAYS if granularity == "hour" else settings.ROLLUP_DAILY_RETENTION_DAYS
    return timedelta(days=days)


def bucket_start(ts: datetime, granularity: str) -> datetime:
    ts = ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
    ts = ts.astimezone(timezone.utc)
    if granularity == "hour":
        return ts.replace(minute=0, second=0, microsecond=0)
    return ts.replace(hour=0, minute=0, second=0, microsecond=0)


def _values(snapshot: dict) -> Iterable[tuple[str, float]]:
    """(key, value) for every numeric reading in a snapshot dict."""
    drives = snapshot.get("storage") or []
    for group, name, key in ROLLUP_FIELDS:
        part = (drives[0] if drives else None) if group == "storage0" else snapshot.get(group)
        value = part.get(name) if isinstance(part, dict) else None
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            continue
        yield key, float(value)


@dataclass
class Bucket:
    count: int = 0
    sums: dict = field(default_factory=dict)
    n: dict = field(default_factory=dict)
    min: dict = field(default_factory=dict)
    max: dict = field(default_factory=dict)

    def add(self, snapshot: dict) -> None:
        self.count += 1
        for key, value in _values(snapshot):
            self.sums[key] = self.sums.get(key, 0.0) + value
            self.n[key] = self.n.get(key, 0) + 1
            self.min[key] = value if key not in self.min else min(self.min[key], value)
            self.max[key] = value if key not in self.max else max(self.max[key], value)


def summarise(snapshots: Iterable[dict]) -> dict[tuple[str, datetime], Bucket]:
    """Readings (as stored dicts, with a timestamp) grouped into hour and day buckets."""
    buckets: dict[tuple[str, datetime], Bucket] = {}
    for snap in snapshots:
        for granularity in GRANULARITIES:
            key = (granularity, bucket_start(snap["timestamp"], granularity))
            buckets.setdefault(key, Bucket()).add(snap)
    return buckets


def _update(user_id, device_id, granularity: str, start: datetime, bucket: Bucket) -> UpdateOne:
    inc: dict[str, Any] = {"readings": bucket.count}
    inc.update({f"sums.{k}": v for k, v in bucket.sums.items()})
    inc.update({f"n.{k}": v for k, v in bucket.n.items()})
    update: dict[str, Any] = {
        "$setOnInsert": {
            "user_id": user_id,
            "expires_at": start + GRANULARITIES[granularity] + retention(granularity),
        },
        "$inc": inc,
    }
    if bucket.min:
        update["$min"] = {f"lo.{k}": v for k, v in bucket.min.items()}
    if bucket.max:
        update["$max"] = {f"hi.{k}": v for k, v in bucket.max.items()}
    return UpdateOne({"device_id": device_id, "granularity": granularity, "start": start}, update, upsert=True)


async def add_readings(user_id, device_id, snapshots: list[dict]) -> None:
    """
    Fold newly stored readings into their hour and day summaries (one write).
    Two uploads creating the same summary at once can collide on the unique
    key; the losing update is simply retried, and then finds the document.
    """
    if not snapshots:
        return
    ops = [_update(user_id, device_id, g, start, b) for (g, start), b in summarise(snapshots).items()]
    collection = TelemetryRollupDocument.get_pymongo_collection()
    for attempt in range(2):
        try:
            await collection.bulk_write(ops, ordered=False)
            return
        except BulkWriteError as e:
            errors = e.details.get("writeErrors", [])
            if attempt or any(err.get("code") != DUPLICATE_KEY for err in errors):
                raise
            ops = [ops[err["index"]] for err in errors]


# --------------------------------------------------------------- reading back

def average(doc: dict, key: str) -> Optional[float]:
    n = (doc.get("n") or {}).get(key)
    return (doc["sums"][key] / n) if n else None


async def read(user_id, device_id, granularity: str, start: datetime, end: Optional[datetime] = None) -> list[dict]:
    """Summaries for one device, oldest first."""
    query: dict[str, Any] = {
        "user_id": user_id, "device_id": device_id, "granularity": granularity,
        "start": {"$gte": bucket_start(start, granularity)},
    }
    if end is not None:
        query["start"]["$lte"] = end
    cursor = TelemetryRollupDocument.get_pymongo_collection().find(query, {"_id": 0}).sort("start", 1)
    return await cursor.to_list(length=None)


def merge(docs: list[dict]) -> dict:
    """Several summaries as one (for thinning a range to fewer graph points)."""
    out = {"start": docs[0]["start"], "end": docs[-1]["start"], "readings": 0, "sums": {}, "n": {}, "lo": {}, "hi": {}}
    for d in docs:
        out["readings"] += d.get("readings", 0)
        for k, v in (d.get("sums") or {}).items():
            out["sums"][k] = out["sums"].get(k, 0.0) + v
        for k, v in (d.get("n") or {}).items():
            out["n"][k] = out["n"].get(k, 0) + v
        for k, v in (d.get("lo") or {}).items():
            out["lo"][k] = v if k not in out["lo"] else min(out["lo"][k], v)
        for k, v in (d.get("hi") or {}).items():
            out["hi"][k] = v if k not in out["hi"] else max(out["hi"][k], v)
    return out


def thin(docs: list[dict], points: int) -> list[dict]:
    """At most `points` summaries, merging neighbours into runs of equal size."""
    if len(docs) <= points:
        return [merge([d]) for d in docs]
    size = len(docs) / points
    return [merge(docs[round(i * size):round((i + 1) * size)]) for i in range(points) if docs[round(i * size):round((i + 1) * size)]]


def as_snapshot(summary: dict, granularity: str) -> dict:
    """
    A summary shaped like a stored reading (averages in place of values), so
    the dashboard's graphs can use it as they use readings. Timestamped at
    the middle of the period it covers.
    """
    first = summary["start"]
    last = summary.get("end", first)
    first = first if first.tzinfo else first.replace(tzinfo=timezone.utc)
    last = last if last.tzinfo else last.replace(tzinfo=timezone.utc)
    middle = first + ((last + GRANULARITIES[granularity]) - first) / 2
    snap: dict[str, Any] = {"timestamp": middle, "sensor_id": f"{granularity}-summary"}
    for group, name, key in ROLLUP_FIELDS:
        value = average(summary, key)
        if value is None:
            continue
        value = round(value) if key in INT_KEYS else round(value, 3)
        snap.setdefault(group, {})[name] = value
    drive = snap.pop("storage0", None)
    snap["storage"] = [drive] if drive else []
    return snap


# ------------------------------------------------------------------- backfill

async def backfill_from_raw(db) -> int:
    """
    Build every summary from the raw readings still stored, if there are no
    summaries yet: run once when this feature first starts, before shorter raw
    retention removes the older readings. Returns how many summaries it wrote.
    """
    from app.models.telemetry import TelemetrySnapshotDocument

    raw = db[TelemetrySnapshotDocument.Settings.name]
    rollups = db[TelemetryRollupDocument.Settings.name]
    if await rollups.find_one({}, {"_id": 1}) or not await raw.find_one({}, {"_id": 1}):
        return 0

    written = 0
    for granularity in GRANULARITIES:
        group: dict[str, Any] = {
            "_id": {
                "device_id": "$device_id",
                "user_id": "$user_id",
                "start": {"$dateTrunc": {"date": "$timestamp", "unit": granularity, "timezone": "UTC"}},
            },
            "count": {"$sum": 1},
        }
        for g, name, key in ROLLUP_FIELDS:
            path = {"$arrayElemAt": [f"$storage.{name}", 0]} if g == "storage0" else f"${g}.{name}"
            numeric = {"$and": [{"$isNumber": path}, {"$ne": [{"$type": path}, "bool"]}]}
            group[f"s__{key}"] = {"$sum": {"$cond": [numeric, path, 0]}}
            group[f"n__{key}"] = {"$sum": {"$cond": [numeric, 1, 0]}}
            group[f"lo__{key}"] = {"$min": {"$cond": [numeric, path, None]}}
            group[f"hi__{key}"] = {"$max": {"$cond": [numeric, path, None]}}
        cursor = await raw.aggregate([{"$group": group}], allowDiskUse=True)
        rows = await cursor.to_list(length=None)

        ops = []
        for row in rows:
            start = row["_id"]["start"]
            start = start if start.tzinfo else start.replace(tzinfo=timezone.utc)
            doc = {
                "user_id": row["_id"]["user_id"], "device_id": row["_id"]["device_id"],
                "granularity": granularity, "start": start, "readings": row["count"],
                "sums": {}, "n": {}, "lo": {}, "hi": {},
                "expires_at": start + GRANULARITIES[granularity] + retention(granularity),
            }
            for _, _, key in ROLLUP_FIELDS:
                if row.get(f"n__{key}"):
                    doc["sums"][key] = float(row[f"s__{key}"])
                    doc["n"][key] = int(row[f"n__{key}"])
                    doc["lo"][key] = float(row[f"lo__{key}"])
                    doc["hi"][key] = float(row[f"hi__{key}"])
            if doc["expires_at"] <= datetime.now(timezone.utc):
                continue
            ops.append(UpdateOne(
                {"device_id": doc["device_id"], "granularity": granularity, "start": start},
                {"$set": doc}, upsert=True,
            ))
        for i in range(0, len(ops), 1000):
            await rollups.bulk_write(ops[i:i + 1000], ordered=False)
        written += len(ops)
    logger.info("Built %d telemetry summaries from the stored readings", written)
    return written
