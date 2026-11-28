"""
"Solve with AI" (design A): Lectio AI writes a short script for one alert.

  POST /devices/{id}/alerts/{alert_id}/ai-script   ask the AI for a script (shown, not run)
  POST /ai-scripts/{id}/run                        send that exact script to the PC

Running needs: the account allows fixes (not "Only suggest"), the owner has
switched AI scripts on for this PC, and the script still passes the checker.
It always asks on the PC, showing the script, and goes through the normal fix
queue, so it appears in the fix history and Activity log like any other fix.
"""

import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.api.v1.fixes import FixOut, _announce, _audit, _expire_stale, _fix_budget, _oid, _out, _own_device
from app.core.config import settings
from app.core.fix_catalogue import AI_SCRIPT, get_fix
from app.core.rate_limit import limiter
from app.core.script_check import check
from app.models.ai_script import AiScript
from app.models.alert import AnomalyAlertDocument
from app.models.audit_log import AuditEventType
from app.models.fix import FixRequest, FixStatus
from app.models.telemetry import Device
from app.models.user import FixLevel, User
from app.services import ai_script
from app.services.ai_diagnostic_service import ai_diagnostic_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Solve with AI"])

AI_SCRIPTS_PER_MINUTE = 4


class AiScriptOut(BaseModel):
    id: str
    alert_id: str
    summary: str
    steps: list[str]
    script: str
    lines: int
    risk: Literal["low", "changes"]
    can_run: bool
    why_not: Optional[str] = None


def _why_not(user: User, device: Device) -> Optional[str]:
    if user.fix_level == FixLevel.SUGGEST:
        return "Your account only suggests fixes. Change this in Settings to run scripts."
    if not device.ai_scripts_enabled:
        return f"AI scripts are off for {device.device_name}. Switch them on in My Devices to run this."
    return None


def _show(s: AiScript, user: User, device: Device) -> AiScriptOut:
    why = _why_not(user, device)
    return AiScriptOut(id=str(s.id), alert_id=str(s.alert_id), summary=s.summary, steps=s.steps, script=s.script,
                       lines=s.script.count("\n") + 1, risk="low" if s.read_only else "changes",
                       can_run=why is None, why_not=why)


@router.post("/devices/{device_id}/alerts/{alert_id}/ai-script", response_model=AiScriptOut,
             summary="Ask Lectio AI for a Script")
async def write_script(device_id: str, alert_id: str, current_user: User = Depends(get_current_user)):
    device = await _own_device(device_id, current_user)
    alert = await AnomalyAlertDocument.get(_oid(alert_id, "alert"))
    if not alert or alert.device_id != device.id or alert.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")
    if ai_diagnostic_service.client is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Lectio AI isn't set up on this server.")
    if settings.RATE_LIMIT_ENABLED:
        decision = limiter.hit(f"ai-script:{current_user.id}", AI_SCRIPTS_PER_MINUTE)
        if not decision.allowed:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                                f"Too many scripts asked for. Try again in {decision.retry_after} seconds.",
                                headers={"Retry-After": str(decision.retry_after)})
    try:
        script = await ai_script.propose(ai_diagnostic_service.client, alert, device)
    except ai_script.NoScript as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e))
    return _show(script, current_user, device)


@router.post("/ai-scripts/{script_id}/run", response_model=FixOut, status_code=status.HTTP_201_CREATED,
             summary="Send Lectio AI's Script to the PC")
async def run_script(script_id: str, request: Request, current_user: User = Depends(_fix_budget)):
    s = await AiScript.get(_oid(script_id, "script"))
    if not s or s.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Script not found")
    device = await _own_device(str(s.device_id), current_user)
    why = _why_not(current_user, device)
    if why:
        raise HTTPException(status.HTTP_403_FORBIDDEN, why)
    if s.fix_request_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "This script was already sent to the PC")
    if not check(s.script).ok:  # the rules may have tightened since it was written
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "This script no longer passes Lectio's safety check")

    await _expire_stale(device.id)
    busy = await FixRequest.find_one(
        FixRequest.device_id == device.id, FixRequest.fix_id == AI_SCRIPT,
        {"status": {"$in": [FixStatus.QUEUED.value, FixStatus.RUNNING.value]}},
    )
    if busy:
        raise HTTPException(status.HTTP_409_CONFLICT, "Another AI script is already on its way to this PC")

    params = get_fix(AI_SCRIPT).clean_params({"script": s.script, "sha256": s.sha256, "summary": s.summary})
    req = FixRequest(user_id=current_user.id, device_id=device.id, fix_id=AI_SCRIPT, params=params,
                     alert_id=s.alert_id, needs_pc_approval=True)
    await req.insert()
    await s.set({AiScript.fix_request_id: req.id})
    await _audit(req, AuditEventType.FIX_REQUESTED, "user", request, fix_level=current_user.fix_level.value,
                 ai_script_id=str(s.id))
    await _announce(req)
    logger.info("AI script %s sent to device %s", s.id, device.id)
    return _out(req)
