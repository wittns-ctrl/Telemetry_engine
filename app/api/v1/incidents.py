"""
Outages: a PC going away normally, or stopping without warning.

  POST /agent/goodbye             (X-Device-Key) the PC is shutting down, going to sleep or stopping the agent
  POST /agent/incident            (X-Device-Key) Windows says the last shutdown was a crash or power loss
  GET  /devices/{id}/incidents    (signed in)    the PC's outages, newest first, with their story (design D)
"""

import re
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator

from app.api.deps import get_current_user
from app.api.v1.ingest import get_ingest_device
from app.models.alert import AnomalyAlertDocument
from app.models.incident import CAUSES, FROM_WINDOWS, Incident
from app.models.telemetry import Device
from app.models.user import User
from app.services import offline_watch

router = APIRouter(tags=["Outages"])


class Goodbye(BaseModel):
    reason: Literal["shutdown", "sleep", "stop"]


@router.post("/agent/goodbye", status_code=status.HTTP_204_NO_CONTENT, summary="Agent: The PC Is Going Away Normally")
async def goodbye(body: Goodbye, device: Device = Depends(get_ingest_device)):
    await Device.get_pymongo_collection().update_one(
        {"_id": device.id},
        {"$set": {"goodbye_at": datetime.now(timezone.utc), "goodbye_reason": body.reason}},
    )


class CrashReport(BaseModel):
    cause: Literal["bluescreen", "forced_off", "power_lost"]
    at: datetime = Field(..., description="When Windows recorded it (the start after the outage)")
    bugcheck_code: Optional[str] = Field(None, max_length=18)
    last_alive: Optional[datetime] = Field(None, description="The agent's last sign of life before the outage")

    @field_validator("bugcheck_code")
    @classmethod
    def _code(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not re.fullmatch(r"0x[0-9a-fA-F]{1,16}", value):
            raise ValueError("bugcheck_code must look like 0x9f")
        return value.lower() if value else None

    @field_validator("at", "last_alive")
    @classmethod
    def _recent(cls, value: Optional[datetime]) -> Optional[datetime]:
        if value is None:
            return None
        value = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if value > now + timedelta(minutes=10) or value < now - timedelta(days=7):
            raise ValueError("must be within the last week")
        return value


class CrashReply(BaseModel):
    incident_id: str


@router.post("/agent/incident", response_model=CrashReply, summary="Agent: Windows Recorded an Unexpected Shutdown")
async def crash(body: CrashReport, device: Device = Depends(get_ingest_device)):
    incident = await offline_watch.record_crash(device, body.cause, body.at, body.bugcheck_code, body.last_alive)
    return CrashReply(incident_id=str(incident.id))


class Moment(BaseModel):
    at: datetime
    text: str
    tone: Literal["ok", "warn", "bad"]


class IncidentOut(BaseModel):
    id: str
    device_id: str
    went_silent_at: datetime
    back_at: Optional[datetime]
    minutes_off: Optional[int]
    cause: Optional[str]
    cause_text: Optional[str]
    from_windows: bool
    bugcheck_code: Optional[str]
    last_reading: Optional[str]
    timeline: list[Moment]


def _first_part(message: str) -> str:
    return (message.split(":")[0] or message).strip()[:100]


async def _story(i: Incident) -> IncidentOut:
    start = offline_watch._aware(i.went_silent_at)
    end = offline_watch._aware(i.back_at)
    before = await AnomalyAlertDocument.find(
        AnomalyAlertDocument.device_id == i.device_id, AnomalyAlertDocument.user_id == i.user_id,
        AnomalyAlertDocument.created_at >= start - timedelta(minutes=30),
        AnomalyAlertDocument.created_at <= start,
        AnomalyAlertDocument.rule_name != offline_watch.RULE,
    ).sort("-created_at").limit(3).to_list()
    timeline = [Moment(at=offline_watch._aware(a.created_at), text=_first_part(a.message),
                       tone="bad" if a.severity.value == "CRITICAL" else "warn") for a in reversed(before)]
    timeline.append(Moment(at=start, text="Stopped without shutting down", tone="bad"))
    if end:
        cause = CAUSES[i.cause][0].lower() + CAUSES[i.cause][1:] if i.cause else ""
        said = f" · {'Windows' if i.cause in FROM_WINDOWS else 'Lectio'}: {cause}" if cause else ""
        timeline.append(Moment(at=end, text=f"Back on{said}"[:160], tone="ok"))
    return IncidentOut(
        id=str(i.id), device_id=str(i.device_id), went_silent_at=start, back_at=end,
        minutes_off=round((end - start).total_seconds() / 60) if end else None,
        cause=i.cause, cause_text=CAUSES.get(i.cause) if i.cause else None, from_windows=i.cause in FROM_WINDOWS,
        bugcheck_code=i.bugcheck_code, last_reading=i.last_reading, timeline=timeline,
    )


@router.get("/devices/{device_id}/incidents", response_model=list[IncidentOut], summary="The PC's Outages")
async def list_incidents(device_id: str, days: int = Query(7, ge=1, le=30),
                         current_user: User = Depends(get_current_user)):
    try:
        oid = PydanticObjectId(device_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid device ID format")
    device = await Device.get(oid)
    if device is None or device.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Device not found")
    since = datetime.now(timezone.utc) - timedelta(days=days)
    found = await Incident.find(Incident.device_id == oid, Incident.user_id == current_user.id,
                                Incident.went_silent_at >= since).sort("-went_silent_at").limit(10).to_list()
    return [await _story(i) for i in found]
