"""
Telemetry ingestion endpoints for the host agent.

The agent runs on the user's own machine, collects a hardware snapshot every
few seconds and POSTs it here with its device key (X-Device-Key). The server
stores it, runs anomaly detection, and relays it to that device's WebSocket
subscribers. The server never reads its own hardware.

  POST /telemetry/ingest        one reading; checked for alerts before replying
                                (the reply says how many alerts it raised)
  POST /telemetry/ingest/batch  up to INGEST_BATCH_MAX readings, each with an
                                event id; stored in one write, duplicates
                                skipped, alert checks done in the background
"""

import logging
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app.core.cache import cache, device_key_key
from app.core.config import settings
from app.core.security import hash_token
from app.models.telemetry import Device, TelemetrySnapshot, telemetry_retention_seconds
from app.schemas.api import TelemetryIngestResponse
from app.services.ingest_processor import Job, ingest_processor
from app.services.telemetry_store import store_readings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Telemetry Ingest"])

MAX_STORAGE_ENTRIES = 64
MAX_CLOCK_SKEW = timedelta(minutes=5)
EVENT_ID = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


async def get_ingest_device(
    x_device_key: str = Header(..., alias="X-Device-Key", min_length=20, max_length=256),
) -> Device:
    """
    Resolve the calling agent's device from its X-Device-Key header. Agents
    call several times a minute, so the device is cached (CACHE_DEVICE_TTL_SECONDS);
    saving or deleting it drops the cached copy (Device model hooks).
    """
    key_hash = hash_token(x_device_key)
    cached = await cache.get(device_key_key(key_hash))
    device = Device.model_validate_json(cached) if cached is not None else None
    if device is None:
        device = await Device.find_one(Device.ingest_key_hash == key_hash)
        if device is not None and device.is_active:
            await cache.set(device_key_key(key_hash), device.model_dump_json(), settings.CACHE_DEVICE_TTL_SECONDS)
    if device is None or not device.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked device key",
        )
    return device


def _check_storage_entries(snapshot: TelemetrySnapshot) -> None:
    if len(snapshot.storage) > MAX_STORAGE_ENTRIES:
        raise HTTPException(
            status_code=422,
            detail=f"At most {MAX_STORAGE_ENTRIES} storage entries per snapshot",
        )


def _aware(ts: datetime) -> datetime:
    return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)


@router.post(
    "/telemetry/ingest",
    response_model=TelemetryIngestResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Ingest a Hardware Telemetry Snapshot",
)
async def ingest_snapshot(
    snapshot: TelemetrySnapshot,
    device: Device = Depends(get_ingest_device),
):
    _check_storage_entries(snapshot)

    # Trust the agent's clock only within a small window.
    now = datetime.now(timezone.utc)
    ts = _aware(snapshot.timestamp)
    if abs(ts - now) > MAX_CLOCK_SKEW:
        ts = now
    snapshot.timestamp = ts

    stored = await store_readings(device, [(None, snapshot)])
    record, _ = stored.stored[0]

    # This endpoint's reply includes the alert count, so it checks right away.
    alerts = await ingest_processor.process(
        Job(str(device.user_id), str(device.id), device.device_name, [snapshot], 0.0)
    )
    return TelemetryIngestResponse(snapshot_id=str(record["_id"]), alerts_triggered=len(alerts))


# ------------------------------------------------------------------ batches

class IngestReading(TelemetrySnapshot):
    """A reading plus the agent's id for it, so a resent reading is stored once."""

    event_id: str = Field(..., description="Unique id the agent gave this reading (8-64 of A-Z a-z 0-9 _ -)")

    @field_validator("event_id")
    @classmethod
    def _event_id_format(cls, value: str) -> str:
        if not EVENT_ID.match(value):
            raise ValueError("event_id must be 8-64 characters of A-Z, a-z, 0-9, _ or -")
        return value


class IngestBatch(BaseModel):
    readings: list[IngestReading] = Field(..., min_length=1)

    @field_validator("readings")
    @classmethod
    def _not_too_many(cls, value: list) -> list:
        if len(value) > settings.INGEST_BATCH_MAX:
            raise ValueError(f"At most {settings.INGEST_BATCH_MAX} readings per batch")
        return value


class IngestBatchResponse(BaseModel):
    status: str = "accepted"
    received: int
    stored: int
    duplicates: int = Field(..., description="Readings already stored earlier (same event_id); safe to drop")
    too_old: int = Field(..., description="Readings older than the retention period; not stored")


@router.post(
    "/telemetry/ingest/batch",
    response_model=IngestBatchResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Ingest Several Readings at Once",
    description=(
        "For agents that buffer readings (e.g. while offline). Every reading is "
        "stored in one write; a reading whose event_id was already stored for this "
        "device is skipped, so resending a batch after a timeout is safe. Alert "
        "checks and the live dashboard update happen after the reply."
    ),
)
async def ingest_batch(
    batch: IngestBatch,
    device: Device = Depends(get_ingest_device),
):
    now = datetime.now(timezone.utc)
    oldest_allowed = now - timedelta(seconds=telemetry_retention_seconds())
    readings: list[tuple[str, TelemetrySnapshot]] = []
    too_old = 0
    for reading in batch.readings:
        _check_storage_entries(reading)
        ts = _aware(reading.timestamp)
        if ts > now + MAX_CLOCK_SKEW:
            ts = now  # a clock running ahead
        if ts < oldest_allowed:
            too_old += 1  # MongoDB would delete it straight away
            continue
        snapshot = TelemetrySnapshot.model_validate(reading.model_dump(exclude={"event_id"}))
        snapshot.timestamp = ts
        readings.append((reading.event_id, snapshot))

    stored = await store_readings(device, readings)
    await ingest_processor.submit(device, [snapshot for _, snapshot in stored.stored])

    return IngestBatchResponse(
        received=len(batch.readings),
        stored=len(stored.stored),
        duplicates=stored.duplicates,
        too_old=too_old,
    )
