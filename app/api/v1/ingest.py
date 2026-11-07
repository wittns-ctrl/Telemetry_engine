"""
Telemetry ingestion endpoint for the host agent.

The agent (agent/telemetry_agent.py) runs on the user's own machine, collects a
hardware snapshot every few seconds and POSTs it here with its device key. The
server stores it, runs anomaly detection, and relays it to that device's
WebSocket subscribers. The server never reads its own hardware.
"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.core.security import hash_token
from app.core.websocket_manager import manager
from app.models.telemetry import Device, TelemetrySnapshot
from app.schemas.api import TelemetryIngestResponse
from app.services.anomaly_engine import anomaly_engine
from app.services.storage_service import StorageService
from app.api.v1.websocket import serialize_alert

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Telemetry Ingest"])

MAX_STORAGE_ENTRIES = 64
MAX_CLOCK_SKEW = timedelta(minutes=5)


async def get_ingest_device(
    x_device_key: str = Header(..., alias="X-Device-Key", min_length=20, max_length=256),
) -> Device:
    """Resolve the calling agent's device from its X-Device-Key header."""
    device = await Device.find_one(Device.ingest_key_hash == hash_token(x_device_key))
    if device is None or not device.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked device key",
        )
    return device


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
    if len(snapshot.storage) > MAX_STORAGE_ENTRIES:
        raise HTTPException(
            status_code=422,
            detail=f"At most {MAX_STORAGE_ENTRIES} storage entries per snapshot",
        )

    # Trust the agent's clock only within a small window.
    now = datetime.now(timezone.utc)
    ts = snapshot.timestamp
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    if abs(ts - now) > MAX_CLOCK_SKEW:
        ts = now
    snapshot.timestamp = ts

    user_id = str(device.user_id)
    device_id = str(device.id)

    doc = await StorageService.save_telemetry_snapshot(
        user_id=user_id,
        device_id=device_id,
        snapshot=snapshot,
    )

    alerts: list[dict] = []
    try:
        triggered = await anomaly_engine.evaluate_snapshot(
            user_id=user_id,
            device_id=device_id,
            snapshot=snapshot,
        )
        alerts = [serialize_alert(a) for a in triggered]
    except Exception as e:  # detection failure must not drop the reading
        logger.error(f"Anomaly detection failed for device {device_id}: {e}")

    await manager.broadcast_to_device(
        user_id,
        device_id,
        {
            "type": "telemetry",
            "device_id": device_id,
            "timestamp": snapshot.timestamp.isoformat(),
            "telemetry": snapshot.model_dump(mode="json"),
            "alerts": alerts,
        },
    )

    return TelemetryIngestResponse(snapshot_id=str(doc.id), alerts_triggered=len(alerts))
