"""
Alert notifications: tell the owner about a new alert when they are not looking.

The anomaly engine calls `alert_notifier.dispatch(alert)` once for every NEW
alert (not for updates to an active one). The notifier then, in the background:

  * posts the alert to ALERT_WEBHOOK_URL, if one is set, and
  * emails the device owner, if all of these hold:
      - ALERT_EMAILS_ENABLED is on and email (Resend) is configured,
      - the account is active, its email is verified and the user has not
        turned alert emails off (User.email_alerts),
      - the alert is at least ALERT_EMAIL_MIN_SEVERITY,
      - no email for the same device and rule went out in the cooldown window
        (stops an alert that keeps flapping from filling the inbox).

Nothing here may break ingestion, so every failure is logged and swallowed.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.config import settings
from app.models.alert import AlertSeverity, AnomalyAlertDocument
from app.models.telemetry import Device
from app.models.user import User
from app.services.email import email_service
from app.services.notifications import send_webhook_alert

logger = logging.getLogger(__name__)

SEVERITY_ORDER = {AlertSeverity.INFO: 0, AlertSeverity.WARNING: 1, AlertSeverity.CRITICAL: 2}


def _min_severity() -> AlertSeverity:
    try:
        return AlertSeverity(settings.ALERT_EMAIL_MIN_SEVERITY.upper())
    except ValueError:
        logger.warning("ALERT_EMAIL_MIN_SEVERITY=%r is not valid; using WARNING", settings.ALERT_EMAIL_MIN_SEVERITY)
        return AlertSeverity.WARNING


def webhook_payload(alert: AnomalyAlertDocument, device_name: Optional[str]) -> dict:
    """What the webhook receives for a new alert."""
    return {
        "event": "ALERT_CREATED",
        "alert_id": str(alert.id),
        "user_id": str(alert.user_id),
        "device_id": str(alert.device_id),
        "device_name": device_name,
        "severity": alert.severity.value,
        "rule_name": alert.rule_name,
        "metric_name": alert.metric_name,
        "trigger_value": alert.trigger_value,
        "threshold_limit": alert.threshold_limit,
        "message": alert.message,
        "created_at": alert.created_at.isoformat(),
    }


class AlertNotifier:
    def __init__(self) -> None:
        self._tasks: set[asyncio.Task] = set()

    @staticmethod
    def _anything_enabled() -> bool:
        return bool(settings.ALERT_EMAILS_ENABLED or settings.ALERT_WEBHOOK_URL)

    def dispatch(self, alert: AnomalyAlertDocument) -> None:
        """Start notifying in the background. Returns at once and never raises."""
        if not self._anything_enabled():
            return
        try:
            task = asyncio.get_running_loop().create_task(self.notify(alert))
        except RuntimeError:  # no running event loop
            return
        # Keep a reference so the task is not garbage-collected half way.
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def drain(self) -> None:
        """Wait for notifications in flight (used by tests and on shutdown)."""
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)

    async def notify(self, alert: AnomalyAlertDocument) -> None:
        """Send everything that applies to one new alert. Never raises."""
        try:
            user = await User.get(alert.user_id)
            device = await Device.get(alert.device_id)
            device_name = device.device_name if device else None

            if settings.ALERT_WEBHOOK_URL:
                await send_webhook_alert(settings.ALERT_WEBHOOK_URL, webhook_payload(alert, device_name))

            await self._email_owner(alert, user, device_name)
        except Exception:
            logger.exception("Could not send notifications for alert %s", getattr(alert, "id", None))

    async def _email_owner(self, alert: AnomalyAlertDocument, user: Optional[User], device_name: Optional[str]) -> bool:
        if not settings.ALERT_EMAILS_ENABLED:
            return False
        if user is None or not user.is_active or not user.email_verified or not user.email_alerts:
            return False
        if SEVERITY_ORDER[alert.severity] < SEVERITY_ORDER[_min_severity()]:
            return False
        if not email_service.is_configured():
            logger.debug("Alert email skipped: email (Resend) is not configured")
            return False

        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(minutes=settings.ALERT_EMAIL_COOLDOWN_MINUTES)
        recent = await AnomalyAlertDocument.find(
            AnomalyAlertDocument.device_id == alert.device_id,
            AnomalyAlertDocument.rule_name == alert.rule_name,
            AnomalyAlertDocument.email_sent_at >= cutoff,
            AnomalyAlertDocument.id != alert.id,
        ).count()
        if recent:
            logger.info("Alert email skipped (cooldown): %s on device %s", alert.rule_name, alert.device_id)
            return False

        sent = await email_service.send_alert_email(
            to_email=user.email,
            user_name=user.full_name,
            device_name=device_name or "Your PC",
            severity=alert.severity.value,
            message=alert.message,
            created_at=alert.created_at.strftime("%d %b %Y, %H:%M UTC"),
            dashboard_url=settings.FRONTEND_URL,
        )
        if sent:
            # Only this field is written, so an engine update to the alert is not overwritten.
            await alert.set({AnomalyAlertDocument.email_sent_at: now})
        return bool(sent)


alert_notifier = AlertNotifier()
