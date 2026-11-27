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


def _words(alert: AnomalyAlertDocument) -> tuple[str, str]:
    """Rule messages read "CPU core temperature critical: 96.0°C at or above
    95.0°C"; the part before the colon is the title, the rest the detail."""
    head, _, tail = alert.message.partition(":")
    title = head.strip() or "Critical problem detected"
    detail = tail.strip()
    body = (detail + ". " if detail else "") + "Open the dashboard to see why and how to fix it."
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
