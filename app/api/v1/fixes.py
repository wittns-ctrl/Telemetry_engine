"""
Fixes: the website asks for one, the PC's agent carries it out.

User side (signed in):
  GET  /fixes/catalogue                    every fix Lectio knows
  GET  /devices/{id}/fixes/suggestions     fixes for one of the device's alerts
  POST /devices/{id}/fixes                 ask the PC to run a fix
  GET  /devices/{id}/fixes                 the device's fix history
  POST /fixes/{id}/cancel                  cancel one the PC hasn't picked up
  POST /fixes/{id}/undo                    ask the PC to undo one that worked

Agent side (X-Device-Key, like telemetry uploads):
  GET  /agent/fixes/next                   check in, and take the next fix
  POST /agent/fixes/{id}/result            report what happened
  POST /agent/fixes/{id}/reverted          a timed fix ran out and was undone

Only catalogue fixes (app/core/fix_catalogue.py) can be requested; "big" ones
are marked needs_pc_approval and the agent asks on the PC before running them.

Safety rules kept here:
  - the user's fix level (Settings) is checked when a fix is asked for AND
    again when the agent takes it, so a change in Settings applies to fixes
    already waiting;
  - asking for or undoing a fix has its own per-user budget
    (RATE_LIMIT_FIX_PER_MINUTE) on top of the general one;
  - every request, cancel, result and timed revert is written to AuditLog.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from app.api.deps import get_current_user
from app.api.v1.ingest import get_ingest_device
from app.core.config import settings
from app.core.fix_catalogue import AI_SCRIPT, FIXES, Fix, fixes_for, get_fix
from app.core.rate_limit import _client_ip, limiter
from app.core.websocket_manager import manager as stream_manager
from app.models.alert import AnomalyAlertDocument
from app.models.audit_log import AuditEventType, AuditLog
from app.models.fix import FINAL_STATUSES, FixRequest, FixStatus
from app.models.telemetry import Device
from app.models.user import FixLevel, User
from app.services import activity
from app.services.fix_advisor import fix_advisor

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Fixes"])

# A fix the PC hasn't picked up in this time is dropped: the problem may
# have changed, and nobody expects it to run hours later.
QUEUE_TIMEOUT = timedelta(minutes=30)
# A fix the agent took but never reported on (PC switched off, say).
RUN_TIMEOUT = timedelta(hours=2)


# ------------------------------------------------------------------ schemas

class FixInfo(BaseModel):
    id: str
    title: str
    summary: str
    size: Literal["small", "big"]
    undoable: bool
    needs_pc_approval: bool
    manual: bool
    params: list[str]
    how_to: str = Field("", description="Plain steps to do it by hand")


class FixSuggestion(FixInfo):
    reason: str = Field(..., description="One short, plain sentence on why this helps")
    recommended: bool = False


class FixSuggestions(BaseModel):
    fix_level: FixLevel
    source: Literal["ai", "rules"]
    options: list[FixSuggestion]


class FixCreate(BaseModel):
    fix_id: str = Field(..., max_length=64)
    params: dict[str, Any] = Field(default_factory=dict)
    alert_id: Optional[str] = None


class FixOut(BaseModel):
    id: str
    device_id: str
    fix_id: str
    title: str
    params: dict[str, Any]
    alert_id: Optional[str]
    needs_pc_approval: bool
    is_undo: bool
    undo_of: Optional[str]
    can_undo: bool
    undone: bool = False
    status: FixStatus
    message: Optional[str]
    reverted_at: Optional[datetime]
    created_at: datetime
    started_at: Optional[datetime]
    finished_at: Optional[datetime]


class AgentFix(BaseModel):
    """What the agent needs to run (or undo) a fix and to ask on the PC."""
    id: str
    fix_id: str
    title: str
    summary: str
    params: dict[str, Any]
    needs_pc_approval: bool
    undo: bool
    # The request being undone. The agent undoes from its own local record of
    # that request and ignores anything else, so the server can't forge an undo.
    undo_of: Optional[str] = None


class AgentNext(BaseModel):
    fix: Optional[AgentFix]
    poll_seconds: int = 10


class AgentResult(BaseModel):
    status: Literal["succeeded", "failed", "declined"]
    message: Optional[str] = Field(None, max_length=1000)
    undo_data: Optional[dict[str, Any]] = None


# ------------------------------------------------------------------ helpers

def _needs_approval(big: bool, level: FixLevel) -> bool:
    """Whether a fix must be allowed on the PC, given the user's fix level."""
    return big or level == FixLevel.ALWAYS_ASK


def _info(fix: Fix) -> FixInfo:
    return FixInfo(
        id=fix.id, title=fix.title, summary=fix.summary, size=fix.size, undoable=fix.undoable,
        needs_pc_approval=fix.needs_pc_approval, manual=fix.manual, params=list(fix.params),
        how_to=fix.how_to or fix.summary,
    )


def _out(req: FixRequest) -> FixOut:
    fix = get_fix(req.fix_id)
    return FixOut(
        id=str(req.id),
        device_id=str(req.device_id),
        fix_id=req.fix_id,
        title=("Undo: " if req.undo_of else "") + (fix.title if fix else req.fix_id),
        params=req.params,
        alert_id=str(req.alert_id) if req.alert_id else None,
        needs_pc_approval=req.needs_pc_approval,
        is_undo=req.undo_of is not None,
        undo_of=str(req.undo_of) if req.undo_of else None,
        can_undo=_can_undo(req),
        undone=req.undone_by is not None,
        status=req.status,
        message=req.message,
        reverted_at=req.reverted_at,
        created_at=req.created_at,
        started_at=req.started_at,
        finished_at=req.finished_at,
    )


def _can_undo(req: FixRequest) -> bool:
    fix = get_fix(req.fix_id)
    return bool(
        fix and fix.undoable and req.undo_of is None and req.undone_by is None
        and req.reverted_at is None and req.status == FixStatus.SUCCEEDED and req.undo_data
    )


def _oid(value: str, what: str) -> PydanticObjectId:
    try:
        return PydanticObjectId(value)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {what} ID format")


async def _own_device(device_id: str, user: User) -> Device:
    device = await Device.get(_oid(device_id, "device"))
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    if device.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Device does not belong to user")
    return device


async def _own_request(request_id: str, user: User) -> FixRequest:
    req = await FixRequest.get(_oid(request_id, "fix"))
    if not req or req.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fix not found")
    # The device must still be this user's too, not just the old request.
    device = await Device.get(req.device_id)
    if not device or device.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fix not found")
    return req


async def _fix_budget(current_user: User = Depends(get_current_user)) -> User:
    """A stricter, per-user limit for making a PC do something (run or undo a fix)."""
    if settings.RATE_LIMIT_ENABLED:
        decision = limiter.hit(f"fix:{current_user.id}", settings.RATE_LIMIT_FIX_PER_MINUTE)
        if not decision.allowed:
            seconds = decision.retry_after
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many fixes asked for. Try again in {seconds} second{'s' if seconds != 1 else ''}.",
                headers={"Retry-After": str(seconds)},
            )
    return current_user


async def _audit(
    req: FixRequest,
    event: AuditEventType,
    actor: str,
    request: Optional[Request] = None,
    success: bool = True,
    **details: Any,
) -> None:
    """Record who asked a PC to do what, and what came of it. Never breaks the request."""
    try:
        await AuditLog(
            user_id=str(req.user_id),
            event_type=event,
            ip_address=_client_ip(request.scope) if request else None,
            user_agent=request.headers.get("user-agent") if request else None,
            success=success,
            details={
                "actor": actor,  # "user" (the website), "agent" (the PC) or "server"
                "fix_request_id": str(req.id),
                "device_id": str(req.device_id),
                "fix_id": req.fix_id,
                "fix_title": fix.title if (fix := get_fix(req.fix_id)) else req.fix_id,
                "params": req.params,
                "undo_of": str(req.undo_of) if req.undo_of else None,
                "needs_pc_approval": req.needs_pc_approval,
                "status": req.status.value,
                **details,
            },
        ).insert()
    except Exception as e:
        logger.error(f"Could not write audit log for fix {req.id}: {e}")


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt


async def _expire_stale(device_id: PydanticObjectId) -> None:
    """Close fixes that waited or ran too long, so they don't block new ones."""
    now = datetime.now(timezone.utc)
    stale = await FixRequest.find(
        FixRequest.device_id == device_id,
        {"status": {"$in": [FixStatus.QUEUED.value, FixStatus.RUNNING.value]}},
    ).to_list()
    for req in stale:
        if req.status == FixStatus.QUEUED and now - _aware(req.created_at) > QUEUE_TIMEOUT:
            req.status, req.message = FixStatus.EXPIRED, "Your PC didn't pick this up in time. It may be off or offline."
        elif req.status == FixStatus.RUNNING and now - _aware(req.started_at or req.created_at) > RUN_TIMEOUT:
            req.status, req.message = FixStatus.FAILED, "Your PC stopped answering before this finished."
        else:
            continue
        req.finished_at = now
        await req.save()
        await _audit(req, AuditEventType.FIX_RESULT, "server", success=False, message=req.message)


async def _announce(req: FixRequest) -> None:
    """Tell the device's open dashboards that a fix changed."""
    try:
        await stream_manager.broadcast_to_device(
            str(req.user_id), str(req.device_id), {"type": "fix", "fix": _out(req).model_dump(mode="json")}
        )
    except Exception as e:  # a live update must never break the request
        logger.warning(f"Could not announce fix {req.id}: {e}")


# ------------------------------------------------------------------ user side

@router.get("/fixes/catalogue", response_model=list[FixInfo], summary="List Every Fix")
async def catalogue(current_user: User = Depends(get_current_user)):
    return [_info(f) for f in FIXES.values()]


@router.get("/devices/{device_id}/fixes/suggestions", response_model=FixSuggestions, summary="Fixes for an Alert")
async def suggestions(
    device_id: str,
    alert_id: str = Query(..., description="The alert to fix"),
    current_user: User = Depends(get_current_user),
):
    device = await _own_device(device_id, current_user)
    alert = await AnomalyAlertDocument.get(_oid(alert_id, "alert"))
    if not alert or alert.device_id != device.id or alert.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    # Fixes that need a parameter Lectio can't know yet (which app to close,
    # say) are left out until the agent reports it.
    candidates = [f for f in fixes_for(alert.rule_name) if not any(p.required for p in f.params.values())]
    options, source = await fix_advisor.options_for(alert, candidates)
    level = current_user.fix_level
    return FixSuggestions(
        fix_level=level,
        source=source,
        options=[
            FixSuggestion(
                **_info(o.fix).model_dump(exclude={"needs_pc_approval"}),
                needs_pc_approval=_needs_approval(o.fix.needs_pc_approval, level),
                reason=o.reason,
                recommended=o.recommended,
            )
            for o in options
        ],
    )


@router.post("/devices/{device_id}/fixes", response_model=FixOut, status_code=status.HTTP_201_CREATED, summary="Ask the PC to Run a Fix")
async def request_fix(device_id: str, body: FixCreate, request: Request, current_user: User = Depends(_fix_budget)):
    device = await _own_device(device_id, current_user)
    if current_user.fix_level == FixLevel.SUGGEST:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Lectio only suggests fixes on your account. Change this in Settings to let it fix your PCs.",
        )
    fix = get_fix(body.fix_id)
    if not fix:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Unknown fix")
    if fix.manual:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="This one is a step for you to do; Lectio can't do it on the PC")
    if fix.id == AI_SCRIPT:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Use Solve with AI on the alert to run an AI script")
    try:
        params = fix.clean_params(body.params)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e))

    alert_oid = None
    if body.alert_id:
        alert = await AnomalyAlertDocument.get(_oid(body.alert_id, "alert"))
        if not alert or alert.device_id != device.id or alert.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
        alert_oid = alert.id

    await _expire_stale(device.id)
    pending = await FixRequest.find_one(
        FixRequest.device_id == device.id, FixRequest.fix_id == fix.id,
        {"status": {"$in": [FixStatus.QUEUED.value, FixStatus.RUNNING.value]}},
    )
    if pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This fix is already on its way to the PC")

    req = FixRequest(
        user_id=current_user.id, device_id=device.id, fix_id=fix.id, params=params,
        alert_id=alert_oid, needs_pc_approval=_needs_approval(fix.needs_pc_approval, current_user.fix_level),
    )
    await req.insert()
    logger.info(f"Fix {fix.id} requested for device {device.id} by user {current_user.id}")
    await _audit(req, AuditEventType.FIX_REQUESTED, "user", request, fix_level=current_user.fix_level.value)
    await _announce(req)
    return _out(req)


@router.get("/devices/{device_id}/fixes", response_model=list[FixOut], summary="Fix History")
async def history(
    device_id: str,
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
):
    device = await _own_device(device_id, current_user)
    await _expire_stale(device.id)
    reqs = await FixRequest.find(FixRequest.device_id == device.id).sort("-created_at").limit(limit).to_list()
    return [_out(r) for r in reqs]


@router.post("/fixes/{fix_request_id}/cancel", response_model=FixOut, summary="Cancel a Fix")
async def cancel(fix_request_id: str, request: Request, current_user: User = Depends(get_current_user)):
    req = await _own_request(fix_request_id, current_user)
    if req.status != FixStatus.QUEUED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The PC has already started this fix")
    req.status, req.finished_at, req.message = FixStatus.CANCELLED, datetime.now(timezone.utc), "Cancelled."
    await req.save()
    await _audit(req, AuditEventType.FIX_CANCELLED, "user", request)
    await _announce(req)
    return _out(req)


@router.post("/fixes/{fix_request_id}/undo", response_model=FixOut, status_code=status.HTTP_201_CREATED, summary="Undo a Fix")
async def undo(fix_request_id: str, request: Request, current_user: User = Depends(_fix_budget)):
    # Undo is allowed at every fix level, "Only suggest" included: it puts the
    # PC back the way it was, which is what someone turning fixes off wants.
    original = await _own_request(fix_request_id, current_user)
    if not _can_undo(original):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This fix can't be undone")
    pending = await FixRequest.find_one(
        FixRequest.undo_of == original.id,
        {"status": {"$in": [FixStatus.QUEUED.value, FixStatus.RUNNING.value]}},
    )
    if pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already undoing this fix")
    req = FixRequest(
        user_id=original.user_id, device_id=original.device_id, fix_id=original.fix_id,
        params=original.params, alert_id=original.alert_id,
        needs_pc_approval=_needs_approval(original.needs_pc_approval, current_user.fix_level),
        undo_of=original.id, undo_data=original.undo_data,
    )
    await req.insert()
    await _audit(req, AuditEventType.FIX_UNDO_REQUESTED, "user", request, fix_level=current_user.fix_level.value)
    await _announce(req)
    return _out(req)


# ------------------------------------------------------------------ agent side

@router.get("/agent/fixes/next", response_model=AgentNext, summary="Agent: Check In and Take the Next Fix")
async def agent_next(
    agent_version: Optional[str] = Query(None, max_length=32),
    device: Device = Depends(get_ingest_device),
):
    # A direct update, not device.save(): agents check in every few seconds,
    # and a save would also drop the device from the cache each time.
    device.agent_last_seen = datetime.now(timezone.utc)
    changes = {"agent_last_seen": device.agent_last_seen}
    if agent_version:
        if device.agent_version and device.agent_version != agent_version:
            await activity.record(device.user_id, AuditEventType.AGENT_UPDATED, device_id=str(device.id),
                                  version=agent_version, previous=device.agent_version)
        device.agent_version = agent_version
        changes["agent_version"] = agent_version
    await Device.get_pymongo_collection().update_one({"_id": device.id}, {"$set": changes})

    await _expire_stale(device.id)
    req = await FixRequest.find(
        FixRequest.device_id == device.id, FixRequest.status == FixStatus.QUEUED,
    ).sort("+created_at").first_or_none()
    if req is None:
        return AgentNext(fix=None)

    fix = get_fix(req.fix_id)
    if fix is None or fix.manual:  # catalogue changed since it was queued
        req.status, req.finished_at, req.message = FixStatus.FAILED, datetime.now(timezone.utc), "Lectio no longer offers this fix."
        await req.save()
        await _audit(req, AuditEventType.FIX_RESULT, "server", success=False, message=req.message)
        await _announce(req)
        return AgentNext(fix=None)

    # The fix level may have changed in Settings since this was queued.
    owner = await User.get(req.user_id)
    level = owner.fix_level if owner else FixLevel.SUGGEST
    if level == FixLevel.SUGGEST and req.undo_of is None:
        req.status, req.finished_at = FixStatus.CANCELLED, datetime.now(timezone.utc)
        req.message = "Cancelled: your account is set to only suggest fixes."
        await req.save()
        await _audit(req, AuditEventType.FIX_CANCELLED, "server", fix_level=level.value)
        await _announce(req)
        return AgentNext(fix=None, poll_seconds=5)
    # An AI script needs the PC's switch still on (the owner may have turned it off since).
    if fix.id == AI_SCRIPT:
        fresh = await Device.get(device.id)
        if fresh is None or not fresh.ai_scripts_enabled:
            req.status, req.finished_at = FixStatus.CANCELLED, datetime.now(timezone.utc)
            req.message = "Cancelled: AI scripts are switched off for this PC."
            await req.save()
            await _audit(req, AuditEventType.FIX_CANCELLED, "server")
            await _announce(req)
            return AgentNext(fix=None, poll_seconds=5)
    # Big fixes always ask on the PC, whatever is stored on the request.
    req.needs_pc_approval = req.needs_pc_approval or _needs_approval(fix.needs_pc_approval, level)

    req.status, req.started_at = FixStatus.RUNNING, datetime.now(timezone.utc)
    await req.save()
    await _announce(req)
    return AgentNext(fix=AgentFix(
        id=str(req.id), fix_id=req.fix_id, title=fix.title, summary=fix.summary, params=req.params,
        needs_pc_approval=req.needs_pc_approval, undo=req.undo_of is not None,
        undo_of=str(req.undo_of) if req.undo_of else None,
    ))


@router.post("/agent/fixes/{fix_request_id}/result", response_model=FixOut, summary="Agent: Report a Fix Result")
async def agent_result(fix_request_id: str, body: AgentResult, device: Device = Depends(get_ingest_device)):
    req = await FixRequest.get(_oid(fix_request_id, "fix"))
    if not req or req.device_id != device.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fix not found")
    if req.status in FINAL_STATUSES:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This fix is already closed")
    if req.status != FixStatus.RUNNING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The PC hasn't taken this fix yet")

    now = datetime.now(timezone.utc)
    req.status = FixStatus(body.status)
    req.message = body.message
    req.finished_at = now
    if req.undo_of is None and body.status == "succeeded":
        req.undo_data = body.undo_data
    await req.save()
    await _audit(req, AuditEventType.FIX_RESULT, "agent", success=body.status == "succeeded", message=body.message)

    if req.undo_of is not None and body.status == "succeeded":
        original = await FixRequest.get(req.undo_of)
        if original:
            original.undone_by = req.id
            await original.save()
            await _announce(original)

    await _announce(req)
    return _out(req)


@router.post("/agent/fixes/{fix_request_id}/reverted", response_model=FixOut, summary="Agent: A Timed Fix Ran Out")
async def agent_reverted(fix_request_id: str, device: Device = Depends(get_ingest_device)):
    """The agent undid a timed fix (Cool it down) by itself when its time was up."""
    req = await FixRequest.get(_oid(fix_request_id, "fix"))
    if not req or req.device_id != device.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fix not found")
    if req.status == FixStatus.SUCCEEDED and req.reverted_at is None:
        req.reverted_at = datetime.now(timezone.utc)
        await req.save()
        await _audit(req, AuditEventType.FIX_REVERTED, "agent")
        await _announce(req)
    return _out(req)
