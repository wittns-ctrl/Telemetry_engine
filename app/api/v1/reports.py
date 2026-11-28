"""
Daily health checks.

  POST /agent/daily-check            (X-Device-Key) the agent asks for its day's report (8 pm PC time)
  GET  /devices/{id}/reports         (signed in)    the PC's reports, newest first (kept 30 days)
"""

import re
from datetime import date, datetime, timedelta, timezone
from typing import Literal, Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator

from app.api.deps import get_current_user
from app.api.v1.ingest import get_ingest_device
from app.models.audit_log import AuditEventType
from app.models.daily_report import DailyReport, Finding
from app.models.telemetry import Device
from app.models.user import User
from app.services import activity, daily_report
from app.services.ai_diagnostic_service import ai_diagnostic_service

router = APIRouter(tags=["Daily reports"])


class DailyCheckRequest(BaseModel):
    day: str = Field(..., description="The PC's local date, YYYY-MM-DD")
    utc_offset_minutes: int = Field(0, ge=-14 * 60, le=14 * 60)

    @field_validator("day")
    @classmethod
    def _day(cls, value: str) -> str:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            raise ValueError("day must be YYYY-MM-DD")
        d = date.fromisoformat(value)
        today = datetime.now(timezone.utc).date()
        if d > today + timedelta(days=1) or d < today - timedelta(days=7):
            raise ValueError("day must be within the last week")
        return value


class DailyCheckReply(BaseModel):
    status: Literal["ready", "no_data"]
    report_id: Optional[str] = None
    score: Optional[int] = None
    title: Optional[str] = None
    body: Optional[str] = None


class ReportOut(BaseModel):
    id: str
    device_id: str
    day: str
    score: Optional[int]
    verdict: str
    summary: str
    findings: list[Finding]
    todo: list[str]
    source: str
    generated_at: datetime


def _out(r: DailyReport) -> ReportOut:
    return ReportOut(id=str(r.id), device_id=str(r.device_id), day=r.day, score=r.score, verdict=r.verdict,
                     summary=r.summary, findings=r.findings, todo=r.todo, source=r.source, generated_at=r.generated_at)


@router.post("/agent/daily-check", response_model=DailyCheckReply, summary="Agent: The PC's End-of-Day Health Check")
async def daily_check(body: DailyCheckRequest, device: Device = Depends(get_ingest_device)):
    device = await Device.get(device.id) or device  # the latest security report
    existed = await DailyReport.find_one(DailyReport.device_id == device.id, DailyReport.day == body.day)
    report = existed or await daily_report.build(device, body.day, body.utc_offset_minutes, ai_diagnostic_service.client)
    if report is None:
        return DailyCheckReply(status="no_data")
    if existed is None:
        await activity.record(device.user_id, AuditEventType.DAILY_REPORT, device_id=str(device.id),
                              score=report.score, day=report.day)
    first = report.todo[0] if report.todo else ""
    return DailyCheckReply(
        status="ready", report_id=str(report.id), score=report.score,
        title=f"Daily check: {report.score}/100, {report.verdict}"[:120],
        body=(f"{first}. See the full report." if first and not first.startswith("Nothing") else "See the full report.")[:240],
    )


@router.get("/devices/{device_id}/reports", response_model=list[ReportOut], summary="The PC's Daily Health Checks")
async def list_reports(device_id: str, limit: int = Query(30, ge=1, le=30), current_user: User = Depends(get_current_user)):
    try:
        oid = PydanticObjectId(device_id)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid device ID format")
    device = await Device.get(oid)
    if device is None or device.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Device not found")
    reports = await DailyReport.find(DailyReport.device_id == oid, DailyReport.user_id == current_user.id) \
        .sort("-day").limit(limit).to_list()
    return [_out(r) for r in reports]
