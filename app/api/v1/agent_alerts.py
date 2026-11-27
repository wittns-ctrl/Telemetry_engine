"""
Agent side of alert notifications: the PC shows a Windows notification for
each new critical alert about itself.

  GET /agent/alerts/pending   (X-Device-Key) new critical alerts to show

Each alert is handed out once (pc_notified_at), and only while it is fresh:
a PC switched on after a weekend shouldn't pop up Friday's alerts. The agent
builds the "Open dashboard" link itself from the address it was built with;
nothing here can make a PC open another site.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.v1.ingest import get_ingest_device
from app.models.alert import AlertSeverity, AnomalyAlertDocument
from app.models.telemetry import Device

router = APIRouter(tags=["Agent"])

# Only alerts this recent are shown on the PC.
FRESH_FOR = timedelta(minutes=30)
# A burst of critical alerts shows a few notifications, not a stack of them.
MOST_AT_ONCE = 3
POLL_SECONDS = 15


class PCNotification(BaseModel):
    alert_id: str
    severity: str
    title: str
    body: str


class PendingNotifications(BaseModel):
    notifications: list[PCNotification]
    poll_seconds: int = POLL_SECONDS


# The notification's words (approved option D): the part and the problem as
# the title; then the value, what it can do to the PC, and where to go.
# {v} is the reading that raised the alert.
ACTION = "See why and how to fix it."
_HEAT_CPU = ("Processor overheating", "{v:.0f}°C can slow or shut down your PC.")
_HEAT_GPU = ("Graphics card overheating", "{v:.0f}°C can make games and apps freeze or crash.")
_POWER = ("Power supply unstable", "{v:.2f} V can cause sudden restarts or damage parts.")
_BOARD = ("Motherboard overheating", "{v:.0f}°C can make your PC unstable or shut it down.")
_MEMORY = ("Memory almost full", "{v:.0f}% in use can freeze apps and lose unsaved work.")
_LEAK = ("A program is misbehaving", "It's using far too much of your PC and can freeze it.")
WORDS: dict[str, tuple[str, str]] = {
    "CPU_OVERHEATING_CRITICAL": _HEAT_CPU,
    "CPU_PACKAGE_OVERHEATING_CRITICAL": _HEAT_CPU,
    "GPU_CORE_OVERHEATING_CRITICAL": _HEAT_GPU,
    "GPU_HOTSPOT_CRITICAL": _HEAT_GPU,
    "GPU_FAN_STOPPED_CRITICAL": ("Graphics card fan stopped", "The card is hot with no cooling and can overheat."),
    "PSU_12V_UNDERVOLTAGE_CRITICAL": _POWER,
    "PSU_12V_OVERVOLTAGE_CRITICAL": _POWER,
    "VRM_OVERHEATING_CRITICAL": _BOARD,
    "CHIPSET_OVERHEATING_CRITICAL": _BOARD,
    "CHASSIS_FAN_STOPPED_CRITICAL": ("Case fan stopped", "Your PC is hot with no airflow and can overheat."),
    "RAM_USAGE_CRITICAL": _MEMORY,
    "COMMIT_CHARGE_CRITICAL": ("Running out of memory", "Apps can crash or fail to open."),
    "PAGEFILE_USAGE_CRITICAL": ("Page file almost full", "{v:.0f}% in use can freeze apps and lose unsaved work."),
    "NVME_HEALTH_CRITICAL": ("Drive wearing out", "{v:.0f}% life left. It can fail and lose your files."),
    "DRIVE_BAD_SECTORS_CRITICAL": ("Drive damaged", "{v:.0f} bad sectors. It can fail and lose your files."),
    "DRIVE_OVERHEATING_CRITICAL": ("Drive overheating", "{v:.0f}°C can damage the drive and your files."),
    "DISK_FULL_CRITICAL": ("Drive almost full", "{v:.0f}% used. Updates and saving files can fail."),
    "SYSTEM_DRIVE_SPACE_CRITICAL": ("Drive C: almost full", "Only {v:.1f} GB free. Windows and apps can stop working."),
    "WHEA_ERRORS_CRITICAL": ("Hardware errors", "{v:.0f} errors today can mean a failing part and crashes."),
    "HANDLE_COUNT_CRITICAL": _LEAK,
    "THREAD_COUNT_CRITICAL": _LEAK,
    "PROCESS_COUNT_CRITICAL": _LEAK,
}


def _words(alert: AnomalyAlertDocument) -> tuple[str, str]:
    known = WORDS.get(alert.rule_name)
    if known:
        title, risk = known
        risk = risk.format(v=alert.trigger_value)
    else:
        # A rule added later without words: "Its title: detail" message.
        head, _, tail = alert.message.partition(":")
        title, risk = head.strip() or "Critical problem detected", tail.strip()
        if risk and not risk.endswith("."):
            risk += "."
    body = f"{risk} {ACTION}" if risk else ACTION
    return title[:120], body[:240]


@router.get("/agent/alerts/pending", response_model=PendingNotifications,
            summary="Agent: New Critical Alerts to Show on the PC")
async def pending(device: Device = Depends(get_ingest_device)):
    now = datetime.now(timezone.utc)
    alerts = await AnomalyAlertDocument.find(
        AnomalyAlertDocument.device_id == device.id,
        AnomalyAlertDocument.is_active == True,  # noqa: E712 (a query, not a comparison)
        AnomalyAlertDocument.severity == AlertSeverity.CRITICAL,
        AnomalyAlertDocument.pc_notified_at == None,  # noqa: E711
        AnomalyAlertDocument.created_at >= now - FRESH_FOR,
    ).sort("+created_at").limit(MOST_AT_ONCE).to_list()
    if not alerts:
        return PendingNotifications(notifications=[])

    await AnomalyAlertDocument.get_pymongo_collection().update_many(
        {"_id": {"$in": [a.id for a in alerts]}, "pc_notified_at": None},
        {"$set": {"pc_notified_at": now}},
    )
    out = []
    for alert in alerts:
        title, body = _words(alert)
        out.append(PCNotification(alert_id=str(alert.id), severity=alert.severity.value, title=title, body=body))
    return PendingNotifications(notifications=out)
