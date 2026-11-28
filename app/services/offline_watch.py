"""
The offline watch: notice a PC that stops without shutting down normally.

Every minute:
  1. A PC with no sign of life (readings or agent check-ins) for
     OFFLINE_ALERT_MINUTES, that did NOT say goodbye first (shutdown, sleep,
     agent stopped), gets a critical "went offline without warning" alert, an
     incident record, and an email to its owner (design C).
  2. A silent PC that reports again closes its alert, gets a "back online"
     email if the first one went out, and its incident gets its end time.
  3. A few minutes after it's back, an incident the agent didn't explain gets
     Lectio's best guess: readings from the silent stretch arrived later, so it
     lost its internet connection and kept running; otherwise it was off.

The agent reports Windows' own record of a crash or power loss separately
(record_crash), which beats the guess.

Each PC is claimed with a conditional update, so two API processes never
alert twice. PCs silent for more than SILENT_FOR_TOO_LONG are left alone, so
a restart of the API doesn't alert about PCs that went quiet days ago.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.config import settings
from app.models.alert import AlertSeverity, AnomalyAlertDocument
from app.models.audit_log import AuditEventType
from app.models.incident import CAUSES, FROM_WINDOWS, Incident
from app.models.telemetry import Device, TelemetrySnapshotDocument
from app.models.user import User
from app.services import activity
from app.services.alert_notifier import alert_notifier
from app.services.email import email_service

logger = logging.getLogger(__name__)

RULE = "PC_OFFLINE_CRITICAL"
TICK_SECONDS = 60
SILENT_FOR_TOO_LONG = timedelta(hours=2)
GOODBYE_SLACK = timedelta(seconds=90)  # a goodbye this close to the last sign of life counts
SETTLE_AFTER = timedelta(minutes=3)    # wait for buffered readings and the agent's crash report


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def heartbeat(device: Device) -> Optional[datetime]:
    """The PC's last sign of life: its newest reading or agent check-in."""
    times = [t for t in (_aware(device.last_seen), _aware(device.agent_last_seen)) if t]
    return max(times) if times else None


def duration(delta: timedelta) -> str:
    minutes = max(1, round(delta.total_seconds() / 60))
    if minutes < 60:
        return f"{minutes} minute{'s' if minutes != 1 else ''}"
    hours, rest = divmod(minutes, 60)
    return f"{hours} h {rest} min" if rest else f"{hours} hour{'s' if hours != 1 else ''}"


def _when(dt: datetime) -> str:
    return dt.strftime("%H:%M UTC on %d %b")


async def _last_reading(device: Device) -> Optional[str]:
    """'the processor was 98% busy at 91 °C', from the newest stored reading."""
    snap = await TelemetrySnapshotDocument.find(
        TelemetrySnapshotDocument.device_id == device.id,
        TelemetrySnapshotDocument.user_id == device.user_id,
    ).sort("-timestamp").first_or_none()
    if snap is None or snap.cpu.utilization_percent is None:
        return None
    text = f"the processor was {round(snap.cpu.utilization_percent)}% busy"
    temp = snap.cpu.package_temperature_c or snap.cpu.core_temperature_c
    if temp:
        text += f" at {round(temp)} °C"
    return text


async def notice_silent(now: datetime) -> list[Incident]:
    minutes = settings.OFFLINE_ALERT_MINUTES
    if minutes <= 0:
        return []
    cutoff, floor = now - timedelta(minutes=minutes), now - SILENT_FOR_TOO_LONG
    window = {"$gte": floor, "$lt": cutoff}
    candidates = await Device.find({
        "is_active": True, "offline_since": None,
        "$or": [{"last_seen": window}, {"agent_last_seen": window}],
    }).to_list()
    opened = []
    for device in candidates:
        hb = heartbeat(device)
        if hb is None or hb >= cutoff or hb < floor:
            continue  # still alive (one of the two signs is fresh)
        goodbye = _aware(device.goodbye_at)
        expected = bool(goodbye and goodbye >= hb - GOODBYE_SLACK)
        claimed = await Device.get_pymongo_collection().update_one(
            {"_id": device.id, "offline_since": None},
            {"$set": {"offline_since": hb, "offline_expected": expected}},
        )
        if claimed.modified_count != 1 or expected:
            continue
        opened.append(await _open(device, hb, now))
    return opened


async def _open(device: Device, hb: datetime, now: datetime) -> Incident:
    alert = AnomalyAlertDocument(
        user_id=device.user_id, device_id=device.id, rule_name=RULE, severity=AlertSeverity.CRITICAL,
        metric_name="minutes_silent", trigger_value=round((now - hb).total_seconds() / 60),
        threshold_limit=settings.OFFLINE_ALERT_MINUTES,
        message=f"Went offline without warning: no sign of life since {hb:%H:%M} UTC",
        created_at=now, last_breach_at=now,
        pc_notified_at=now,  # never shown on the PC itself: it's the one that's gone
    )
    await alert.insert()
    await activity.alert_opened(alert)
    incident = Incident(user_id=device.user_id, device_id=device.id, went_silent_at=hb, alert_id=alert.id,
                        last_reading=await _last_reading(device))
    user = await User.get(device.user_id)
    if alert_notifier.may_email(user):
        sent = await email_service.send_offline_email(
            to_email=user.email, user_name=user.full_name, device_name=device.device_name,
            silent_at=_when(hb), last_reading=incident.last_reading, dashboard_url=settings.FRONTEND_URL)
        if sent:
            incident.offline_email_sent = True
            await alert.set({AnomalyAlertDocument.email_sent_at: now})
    await incident.insert()
    logger.warning("PC %s went offline without warning (silent since %s)", device.id, hb.isoformat())
    return incident


async def notice_back(now: datetime) -> list[Incident]:
    closed = []
    for device in await Device.find({"offline_since": {"$ne": None}}).to_list():
        since, hb = _aware(device.offline_since), heartbeat(device)
        if hb is None or hb <= since + timedelta(seconds=1):
            continue  # still silent
        claimed = await Device.get_pymongo_collection().update_one(
            {"_id": device.id, "offline_since": device.offline_since},
            {"$set": {"offline_since": None, "offline_expected": False}},
        )
        if claimed.modified_count != 1 or device.offline_expected:
            continue
        incident = await Incident.find(Incident.device_id == device.id, Incident.back_at == None) \
            .sort("-went_silent_at").first_or_none()  # noqa: E711
        if incident is None:
            continue
        incident.back_at = hb
        await incident.save()
        if incident.alert_id:
            alert = await AnomalyAlertDocument.get(incident.alert_id)
            if alert and alert.is_active:
                alert.is_active, alert.resolved_at, alert.resolved_reason = False, now, "recovered"
                await alert.save()
                await activity.alert_closed(alert, "recovered")
        if incident.offline_email_sent:
            user = await User.get(device.user_id)
            if alert_notifier.may_email(user):
                await email_service.send_back_online_email(
                    to_email=user.email, user_name=user.full_name, device_name=device.device_name,
                    back_at=_when(hb), off_for=duration(hb - _aware(incident.went_silent_at)),
                    dashboard_url=settings.FRONTEND_URL)
        closed.append(incident)
    return closed


async def settle_causes(now: datetime) -> list[Incident]:
    """Lectio's guess for incidents Windows didn't explain."""
    settled = []
    found = await Incident.find(
        Incident.cause == None, Incident.back_at != None,  # noqa: E711
        Incident.back_at < now - SETTLE_AFTER, Incident.went_silent_at > now - timedelta(days=1),
    ).to_list()
    for incident in found:
        start, end = _aware(incident.went_silent_at), _aware(incident.back_at)
        kept = await TelemetrySnapshotDocument.find(
            TelemetrySnapshotDocument.device_id == incident.device_id,
            TelemetrySnapshotDocument.user_id == incident.user_id,
            TelemetrySnapshotDocument.timestamp > start + timedelta(seconds=30),
            TelemetrySnapshotDocument.timestamp < end - timedelta(seconds=30),
        ).count()
        incident.cause = "connection" if kept else "off"
        await incident.save()
        settled.append(incident)
    return settled


async def record_crash(device: Device, cause: str, at: datetime, bugcheck: Optional[str],
                       last_alive: Optional[datetime]) -> Incident:
    """
    Windows says the PC's last shutdown wasn't clean (the agent reads this at
    start). Explain the outage the watch noticed, or record a short one it
    didn't (under OFFLINE_ALERT_MINUTES, so there was no alert).
    """
    at = _aware(at)
    incident = await Incident.find(
        Incident.device_id == device.id,
        Incident.went_silent_at <= at, Incident.went_silent_at >= at - timedelta(days=2),
    ).sort("-went_silent_at").first_or_none()
    back = _aware(incident.back_at) if incident else None
    same_outage = incident is not None and (back is None or back >= at - timedelta(minutes=10))
    if same_outage:
        if incident.cause in FROM_WINDOWS:
            return incident  # already explained (the agent sent it again)
        incident.cause, incident.bugcheck_code = cause, bugcheck
        await incident.save()
    else:
        start = _aware(last_alive) if last_alive and _aware(last_alive) < at else at
        incident = Incident(user_id=device.user_id, device_id=device.id, went_silent_at=start,
                            back_at=at, cause=cause, bugcheck_code=bugcheck)
        await incident.insert()
    await activity.record(device.user_id, AuditEventType.PC_INCIDENT, device_id=str(device.id),
                          cause=cause, cause_text=CAUSES[cause], bugcheck=bugcheck)
    return incident


async def tick(now: Optional[datetime] = None) -> None:
    now = now or datetime.now(timezone.utc)
    for step in (notice_silent, notice_back, settle_causes):
        try:
            await step(now)
        except Exception:
            logger.exception("Offline watch: %s failed", step.__name__)


class OfflineWatch:
    def __init__(self) -> None:
        self._task: Optional[asyncio.Task] = None

    def start(self) -> None:
        if settings.OFFLINE_ALERT_MINUTES > 0 and self._task is None:
            self._task = asyncio.create_task(self._run(), name="offline-watch")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def _run(self) -> None:
        while True:
            await asyncio.sleep(TICK_SECONDS)
            await tick()


offline_watch = OfflineWatch()
