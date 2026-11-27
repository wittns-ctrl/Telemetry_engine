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
from pymongo.errors import BulkWriteError

from app.core.cache import cache, latest_key
from app.core.config import settings
from app.models.telemetry import Device, TelemetrySnapshot, TelemetrySnapshotDocument
from app.schemas.api import TelemetrySnapshotResponse
from app.services import rollups

logger = logging.getLogger(__name__)


DUPLICATE_KEY = 11000


@dataclass
class StoredReadings:
    # (the record as stored, the snapshot as sent with its process list) for
    # each new reading, oldest first
    stored: list[tuple[dict, TelemetrySnapshot]] = field(default_factory=list)
    duplicates: int = 0


def to_record(device: Device, snapshot: TelemetrySnapshot, event_id: Optional[str]) -> dict:
    """
    A reading as stored in MongoDB, built straight from the already-validated
    snapshot. Building a TelemetrySnapshotDocument and serialising it through
    Beanie validated and converted every reading twice; with uploads that was
    about a third of the API's CPU time.
    """
    # Security changes rarely and its threat list is long, so it isn't stored
    # with every reading; the latest goes on the Device (store_readings).
    record = snapshot.model_dump(exclude={"processes", "security"})
    record["_id"] = PydanticObjectId()
    record["device_id"] = device.id
    record["user_id"] = device.user_id
    # The top-programs list is only useful live (it goes out over the
    # WebSocket); storing it every 2 s would add about 40 MB per PC per day.
    record["processes"] = []
    record["event_id"] = event_id
    return record


def record_to_document(record: dict) -> TelemetrySnapshotDocument:
    """The stored record as a document, without validating it again."""
    data = {k: v for k, v in record.items() if k != "_id"}
    return TelemetrySnapshotDocument.model_validate({**data, "_id": record["_id"]})


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
        pairs.append((to_record(device, snapshot, event_id), snapshot))
    if not pairs:
        return result

    collection = TelemetrySnapshotDocument.get_pymongo_collection()
    rejected: set[int] = set()
    newest = max(snapshot.timestamp for _, snapshot in pairs)

    async def insert():
        try:
            # insert_many on copies: the driver would otherwise add to the dicts.
            await collection.insert_many([dict(record) for record, _ in pairs], ordered=False)
        except BulkWriteError as e:
            for error in e.details.get("writeErrors", []):
                if error.get("code") != DUPLICATE_KEY:
                    raise
                rejected.add(error["index"])

    latest_security = next(
        (snapshot.security for _, snapshot in reversed(pairs) if snapshot.security is not None), None)

    async def touch_device():
        # Only forwards: a late batch of buffered readings never moves last_seen
        # (or the security report) back.
        changes = {"last_seen": newest}
        if latest_security is not None:
            changes["security"] = latest_security.model_dump()
        await Device.get_pymongo_collection().update_one(
            {"_id": device.id, "$or": [{"last_seen": None}, {"last_seen": {"$lt": newest}}]},
            {"$set": changes},
        )

    await asyncio.gather(insert(), touch_device())

    result.duplicates += len(rejected)
    result.stored = [pair for i, pair in enumerate(pairs) if i not in rejected]
    if result.stored:
        # Only readings actually stored count towards the summaries, so a
        # resent batch is never counted twice.
        await asyncio.gather(
            remember_latest(device, record_to_document(result.stored[-1][0])),
            update_summaries(device, result.stored),
        )
    return result


async def update_summaries(device: Device, stored: list[tuple[dict, TelemetrySnapshot]]) -> None:
    """Fold the new readings into the hourly and daily summaries. A failure is
    logged, not raised: the readings themselves are already stored."""
    try:
        await rollups.add_readings(device.user_id, device.id, [record for record, _ in stored])
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
