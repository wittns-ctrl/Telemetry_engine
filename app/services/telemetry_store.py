"""
Storing telemetry readings as they arrive from agents.

One write for any number of readings (insert_many, unordered), with readings
the server already has skipped by their event id (unique index per device),
and the device's last_seen moved forward in the same round trip. The device
comes from the agent's key, so its ownership is already settled; nothing is
read back before writing.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from beanie import PydanticObjectId
from beanie.odm.utils.dump import get_dict
from pymongo.errors import BulkWriteError

from app.core.cache import cache, latest_key
from app.core.config import settings
from app.models.telemetry import Device, TelemetrySnapshot, TelemetrySnapshotDocument
from app.schemas.api import TelemetrySnapshotResponse
from app.services import rollups

logger = logging.getLogger(__name__)

# The parts of a stored reading the summaries read.
SUMMARY_FIELDS = {"timestamp", "cpu", "gpu", "ram", "power_vrm", "disk", "network", "storage"}

DUPLICATE_KEY = 11000


@dataclass
class StoredReadings:
    # (document, the snapshot as sent, with its process list) for each new reading, oldest first
    stored: list[tuple[TelemetrySnapshotDocument, TelemetrySnapshot]] = field(default_factory=list)
    duplicates: int = 0


def to_document(device: Device, snapshot: TelemetrySnapshot, event_id: Optional[str]) -> TelemetrySnapshotDocument:
    return TelemetrySnapshotDocument(
        id=PydanticObjectId(),
        device_id=device.id,
        user_id=device.user_id,
        timestamp=snapshot.timestamp,
        sensor_id=snapshot.sensor_id,
        cpu=snapshot.cpu,
        gpu=snapshot.gpu,
        storage=snapshot.storage,
        ram=snapshot.ram,
        power_vrm=snapshot.power_vrm,
        disk=snapshot.disk,
        network=snapshot.network,
        # The top-programs list is only useful live (it goes out over the
        # WebSocket); storing it every 2 s would add about 40 MB per PC per day.
        processes=[],
        collection_duration_ms=snapshot.collection_duration_ms,
        event_id=event_id,
    )


async def store_readings(device: Device, readings: list[tuple[Optional[str], TelemetrySnapshot]]) -> StoredReadings:
    """Insert the readings in one write; skip ones already stored (same event id)."""
    result = StoredReadings()
    seen: set[str] = set()
    pairs = []
    for event_id, snapshot in sorted(readings, key=lambda r: r[1].timestamp):
        if event_id is not None:
            if event_id in seen:  # sent twice in the same batch
                result.duplicates += 1
                continue
            seen.add(event_id)
        pairs.append((to_document(device, snapshot, event_id), snapshot))
    if not pairs:
        return result

    collection = TelemetrySnapshotDocument.get_pymongo_collection()
    rejected: set[int] = set()
    newest = max(snapshot.timestamp for _, snapshot in pairs)

    async def insert():
        try:
            await collection.insert_many(
                [get_dict(doc, to_db=True) for doc, _ in pairs], ordered=False
            )
        except BulkWriteError as e:
            for error in e.details.get("writeErrors", []):
                if error.get("code") != DUPLICATE_KEY:
                    raise
                rejected.add(error["index"])

    async def touch_device():
        # Only forwards: a late batch of buffered readings never moves last_seen back.
        await Device.get_pymongo_collection().update_one(
            {"_id": device.id, "$or": [{"last_seen": None}, {"last_seen": {"$lt": newest}}]},
            {"$set": {"last_seen": newest}},
        )

    await asyncio.gather(insert(), touch_device())

    result.duplicates += len(rejected)
    result.stored = [pair for i, pair in enumerate(pairs) if i not in rejected]
    if result.stored:
        # Only readings actually stored count towards the summaries, so a
        # resent batch is never counted twice.
        await asyncio.gather(remember_latest(device, result.stored[-1][0]), update_summaries(device, result.stored))
    return result


async def update_summaries(device: Device, stored: list[tuple[TelemetrySnapshotDocument, TelemetrySnapshot]]) -> None:
    """Fold the new readings into the hourly and daily summaries. A failure is
    logged, not raised: the readings themselves are already stored."""
    try:
        await rollups.add_readings(
            device.user_id, device.id, [doc.model_dump(include=SUMMARY_FIELDS) for doc, _ in stored]
        )
    except Exception:
        logger.exception("Couldn't update the summaries for device %s", device.id)


async def remember_latest(device: Device, doc: TelemetrySnapshotDocument) -> None:
    """Keep the device's newest reading in the cache for /metrics/latest."""
    key = latest_key(device.id)
    current = await cache.get(key)
    if current is not None:
        try:
            if _aware(TelemetrySnapshotResponse.model_validate_json(current).timestamp) >= _aware(doc.timestamp):
                return
        except ValueError:
            pass
    await cache.set(
        key, TelemetrySnapshotResponse.from_document(doc).model_dump_json(), settings.CACHE_LATEST_READING_TTL_SECONDS
    )


def _aware(ts: datetime) -> datetime:
    return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
