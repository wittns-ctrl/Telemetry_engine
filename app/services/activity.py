"""
The account's activity log: sign-ins, alerts, fixes, PCs and security events
in plain words, for the Activity log page (approved design A).

Entries live in the audit log (app/models/audit_log.py), which MongoDB deletes
7 days after each entry (TTL index). Recording never fails the action it
records: a broken log write is logged and ignored.
"""

import logging
from datetime import datetime
from typing import Optional

from app.models.audit_log import AuditEventType as E, AuditLog

logger = logging.getLogger(__name__)

RETENTION_DAYS = 7


async def record(user_id, event: E, *, success: bool = True, ip: Optional[str] = None,
                 user_agent: Optional[str] = None, **details) -> None:
    try:
        await AuditLog(
            user_id=str(user_id), event_type=event, success=success, ip_address=ip,
            user_agent=(user_agent or "")[:300] or None, details=details or None,
        ).insert()
    except Exception:
        logger.exception("Couldn't record %s in the activity log", event.value)


async def alert_opened(alert) -> None:
    await record(alert.user_id, E.ALERT_OPENED, device_id=str(alert.device_id), alert_id=str(alert.id),
                 rule=alert.rule_name, severity=alert.severity.value, message=alert.message)


async def alert_closed(alert, why: str) -> None:
    await record(alert.user_id, E.ALERT_CLOSED, device_id=str(alert.device_id), alert_id=str(alert.id),
                 rule=alert.rule_name, severity=alert.severity.value, message=alert.message, reason=why)


# ------------------------------------------------------------------ reading it back

KINDS = {
    "signin": {E.REGISTRATION, E.LOGIN_SUCCESS, E.LOGIN_FAILURE, E.LOGOUT, E.PASSWORD_CHANGE, E.PASSWORD_RESET,
               E.EMAIL_VERIFICATION, E.OAUTH_LOGIN, E.ACCOUNT_DEACTIVATION},
    "alerts": {E.ALERT_OPENED, E.ALERT_CLOSED},
    "fixes": {E.FIX_REQUESTED, E.FIX_UNDO_REQUESTED, E.FIX_CANCELLED, E.FIX_RESULT, E.FIX_REVERTED},
    "pcs": {E.DEVICE_LINKED, E.DEVICE_REMOVED, E.AGENT_UPDATED, E.DAILY_REPORT},
    "security": {E.TOKEN_REUSE, E.SUSPICIOUS_ACTIVITY},
}


def kind_of(entry: AuditLog) -> str:
    if entry.event_type in KINDS["alerts"] and str((entry.details or {}).get("rule", "")).startswith("SECURITY_"):
        return "security"
    for kind, events in KINDS.items():
        if entry.event_type in events:
            return kind
    return "signin"


def _browser(agent: Optional[str]) -> str:
    a = agent or ""
    browser = next((b for b in ("Edg", "OPR", "Firefox", "Chrome", "Safari") if b in a), None)
    browser = {"Edg": "Edge", "OPR": "Opera"}.get(browser, browser)
    system = next((s for s in ("Windows", "Android", "iPhone", "Mac OS", "Linux") if s in a), None)
    system = {"Mac OS": "Mac"}.get(system, system)
    return " on ".join(p for p in (browser, system) if p) or "a browser"


def _masked(ip: Optional[str]) -> Optional[str]:
    """Enough of the address to recognise it, not all of it."""
    if not ip:
        return None
    if "." in ip:
        parts = ip.split(".")
        return ".".join(parts[:2] + ["x", "x"]) if len(parts) == 4 else ip
    return ip.split(":")[0] + ":…"


FIX_STATUS = {"succeeded": "done", "failed": "failed", "declined": "declined at the PC"}


def describe(entry: AuditLog, pc_names: dict[str, str]) -> dict:
    """One entry in plain words: title, detail, kind and tone (ok, warn, bad)."""
    d = entry.details or {}
    pc = pc_names.get(str(d.get("device_id", "")), d.get("device_name") or "")
    where = " · ".join(p for p in (_browser(entry.user_agent), _masked(entry.ip_address)) if p)
    e = entry.event_type
    title, detail, tone = e.value.replace("_", " ").capitalize(), "", "ok"

    if e == E.LOGIN_SUCCESS:
        title, detail = "Signed in", where
    elif e == E.OAUTH_LOGIN:
        title, detail = "Signed in with Google", where
    elif e == E.LOGIN_FAILURE:
        title, detail, tone = "Failed sign-in attempt", where, "warn"
    elif e == E.LOGOUT:
        title, detail = "Signed out", where
    elif e == E.REGISTRATION:
        title, detail = "Account created", where
    elif e in (E.PASSWORD_CHANGE, E.PASSWORD_RESET):
        title, detail = ("Password changed" if e == E.PASSWORD_CHANGE else "Password reset"), where
    elif e == E.EMAIL_VERIFICATION:
        title = "Email address confirmed"
    elif e in (E.TOKEN_REUSE, E.SUSPICIOUS_ACTIVITY):
        title, detail, tone = "Suspicious sign-in activity blocked", where, "bad"
    elif e == E.ALERT_OPENED:
        msg = d.get("message", "")
        title = "Alert: " + (msg.split(":")[0] if msg else d.get("rule", "problem")).lower().capitalize()
        detail = " · ".join(p for p in (pc, msg.partition(":")[2].strip()) if p)
        tone = "bad" if d.get("severity") == "CRITICAL" else "warn"
    elif e == E.ALERT_CLOSED:
        msg = d.get("message", "")
        title = "Resolved: " + (msg.split(":")[0] if msg else d.get("rule", "problem")).lower()
        detail = " · ".join(p for p in (pc, {"recovered": "back to normal", "no_reading": "no longer reported",
                                              "closed_by_user": "closed by you"}.get(d.get("reason"), "")) if p)
    elif e in (E.FIX_REQUESTED, E.FIX_UNDO_REQUESTED):
        title = ("Undo asked: " if e == E.FIX_UNDO_REQUESTED else "Fix asked: ") + str(d.get("fix_title") or d.get("fix_id", ""))
        detail = pc
    elif e == E.FIX_RESULT:
        status = d.get("status") or ("succeeded" if entry.success else "failed")
        title = f"Fix {FIX_STATUS.get(status, status)}: {d.get('fix_title') or d.get('fix_id', '')}"
        detail = " · ".join(p for p in (pc, d.get("message") or "") if p)
        tone = "ok" if status == "succeeded" else "warn"
    elif e == E.FIX_CANCELLED:
        title, detail = f"Fix cancelled: {d.get('fix_title') or d.get('fix_id', '')}", pc
    elif e == E.FIX_REVERTED:
        title, detail = f"Fix ended and undone: {d.get('fix_title') or d.get('fix_id', '')}", pc
    elif e == E.DEVICE_LINKED:
        title, detail = "PC connected", pc
    elif e == E.DEVICE_REMOVED:
        title, detail = "PC removed", pc
    elif e == E.AGENT_UPDATED:
        title, detail = f"Lectio agent updated to {d.get('version', '')}", pc
    elif e == E.DAILY_REPORT:
        title, detail = f"Daily health check: {d.get('score', '')}/100", pc
        tone = "ok" if (d.get("score") or 0) >= 70 else "warn"
    if not entry.success and tone == "ok":
        tone = "warn"
    return {
        "id": str(entry.id), "at": entry.created_at, "kind": kind_of(entry), "title": title[:160],
        "detail": detail[:240], "tone": tone, "device_id": d.get("device_id"),
        "alert_id": d.get("alert_id") if e == E.ALERT_OPENED else None,
    }


def oldest_kept(now: datetime) -> datetime:
    from datetime import timedelta
    return now - timedelta(days=RETENTION_DAYS)
