"""
Agent side of PC location (exact position, owner-only).

  GET  /agent/location   (X-Device-Key) does the owner want this PC's location?
  POST /agent/location   (X-Device-Key) the position from Windows Location, or why there isn't one

Nothing is kept unless the owner switched location on for the PC on My
Devices; switching it off there deletes the position and its history.
"""

from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, model_validator

from app.api.v1.ingest import get_ingest_device
from app.models.location import LocationHistory
from app.models.telemetry import Device, DeviceLocation

router = APIRouter(tags=["Agent"])

POLL_SECONDS = 120
# A clock this far off on the PC can't be right; use the server's time.
CLOCK_SLACK = timedelta(minutes=10)


class LocationWanted(BaseModel):
    wanted: bool
    poll_seconds: int = POLL_SECONDS


class LocationReport(BaseModel):
    status: Literal["ok", "off", "unavailable", "no_user"]
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    accuracy_m: Optional[float] = Field(None, ge=0, le=1_000_000)
    source: Literal["windows"] = "windows"
    measured_at: datetime

    @model_validator(mode="after")
    def _position_when_ok(self):
        if self.status == "ok" and (self.latitude is None or self.longitude is None):
            raise ValueError("an ok report needs latitude and longitude")
        if self.status != "ok":
            self.latitude = self.longitude = self.accuracy_m = None
        return self


class LocationStored(BaseModel):
    stored: bool


async def _fresh(device: Device) -> Device:
    # The agent's device comes from a cache; the switch must be current.
    return await Device.get(device.id) or device


@router.get("/agent/location", response_model=LocationWanted, summary="Agent: Should This PC Report Its Location?")
async def wanted(device: Device = Depends(get_ingest_device)):
    return LocationWanted(wanted=(await _fresh(device)).location_enabled)


@router.post("/agent/location", response_model=LocationStored, summary="Agent: Report This PC's Location")
async def report(body: LocationReport, device: Device = Depends(get_ingest_device)):
    device = await _fresh(device)
    if not device.location_enabled:
        return LocationStored(stored=False)  # switched off since the agent asked: keep nothing

    now = datetime.now(timezone.utc)
    measured = body.measured_at if body.measured_at.tzinfo else body.measured_at.replace(tzinfo=timezone.utc)
    if abs(now - measured) > CLOCK_SLACK:
        measured = now
    location = DeviceLocation(
        status=body.status, latitude=body.latitude, longitude=body.longitude, accuracy_m=body.accuracy_m,
        source=body.source, measured_at=measured, received_at=now,
    )
    await Device.get_pymongo_collection().update_one(
        {"_id": device.id, "location_enabled": True}, {"$set": {"location": location.model_dump()}})
    if body.status == "ok":
        await LocationHistory(
            device_id=device.id, user_id=device.user_id, latitude=body.latitude, longitude=body.longitude,
            accuracy_m=body.accuracy_m, source=body.source, measured_at=measured,
        ).insert()
    return LocationStored(stored=True)
