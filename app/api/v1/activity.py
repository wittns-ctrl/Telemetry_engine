"""
The signed-in person's activity log (approved design A): the last 7 days of
sign-ins, alerts, fixes, PCs and security events, newest first, in plain words.
Only the account's own entries; MongoDB deletes them after 7 days.
"""

from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.models.audit_log import AuditLog
from app.models.telemetry import Device
from app.models.user import User
from app.services import activity

router = APIRouter(tags=["Activity"])

Kind = Literal["all", "signin", "alerts", "fixes", "pcs", "security"]


class ActivityItem(BaseModel):
    id: str
    at: datetime
    kind: str
    title: str
    detail: str
    tone: str
    device_id: Optional[str] = None
    alert_id: Optional[str] = None


class ActivityPage(BaseModel):
    items: list[ActivityItem]
    kept_days: int = activity.RETENTION_DAYS


@router.get("/activity", response_model=ActivityPage, summary="Your Activity Log (Last 7 Days)")
async def list_activity(
    kind: Kind = Query("all"),
    limit: int = Query(200, ge=1, le=500),
    current_user: User = Depends(get_current_user),
):
    since = activity.oldest_kept(datetime.now(timezone.utc))
    entries = await AuditLog.find(
        AuditLog.user_id == str(current_user.id), AuditLog.created_at >= since,
    ).sort("-created_at").limit(limit if kind == "all" else 500).to_list()
    pcs = {str(d.id): d.device_name for d in await Device.find(Device.user_id == current_user.id).to_list()}
    items = [activity.describe(e, pcs) for e in entries]
    if kind != "all":
        items = [i for i in items if i["kind"] == kind][:limit]
    return ActivityPage(items=[ActivityItem(**i) for i in items])
