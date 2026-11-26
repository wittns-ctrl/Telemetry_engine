"""
Tests for alert notifications (email and webhook) when an alert is raised.

These use the in-memory database fixtures from conftest, never a real MongoDB,
and replace the email service and webhook sender with mocks.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.core.config import settings
from app.models.alert import AlertSeverity, AnomalyAlertDocument
from app.models.telemetry import CPUMetrics, TelemetrySnapshot
from app.services.alert_notifier import AlertNotifier, alert_notifier, webhook_payload
from app.services.anomaly_engine import AnomalyEngine
from app.services.email import email_service


@pytest.fixture
def notifications_on(monkeypatch):
    """Alert emails on, email 'configured', and the email send replaced by a mock."""
    monkeypatch.setattr(settings, "ALERT_EMAILS_ENABLED", True)
    monkeypatch.setattr(settings, "ALERT_EMAIL_MIN_SEVERITY", "WARNING")
    monkeypatch.setattr(settings, "ALERT_EMAIL_COOLDOWN_MINUTES", 30)
    with patch.object(email_service, "is_configured", return_value=True), \
         patch.object(email_service, "send_alert_email", new=AsyncMock(return_value=True)) as send:
        yield send


async def new_alert(device, *, severity=AlertSeverity.CRITICAL, rule="CPU_OVERHEATING_CRITICAL",
                    email_sent_at=None, created_at=None):
    alert = AnomalyAlertDocument(
        user_id=device.user_id,
        device_id=device.id,
        rule_name=rule,
        severity=severity,
        metric_name="cpu_core_temperature_c",
        trigger_value=95.0,
        threshold_limit=90.0,
        message="CPU core temperature reached 95 C",
        is_active=True,
        created_at=created_at or datetime.now(timezone.utc),
        email_sent_at=email_sent_at,
    )
    await alert.insert()
    return alert


# ------------------------------------------------------------------ email

async def test_owner_is_emailed_about_a_critical_alert(notifications_on, test_user, test_device):
    alert = await new_alert(test_device)

    await alert_notifier.notify(alert)

    notifications_on.assert_awaited_once()
    kwargs = notifications_on.await_args.kwargs
    assert kwargs["to_email"] == test_user.email
    assert kwargs["device_name"] == "Test Desktop"
    assert kwargs["severity"] == "CRITICAL"
    assert kwargs["dashboard_url"] == settings.FRONTEND_URL
    stored = await AnomalyAlertDocument.get(alert.id)
    assert stored.email_sent_at is not None


async def test_no_email_when_the_user_turned_alert_emails_off(notifications_on, test_user, test_device):
    test_user.email_alerts = False
    await test_user.save()

    await alert_notifier.notify(await new_alert(test_device))

    notifications_on.assert_not_awaited()


async def test_no_email_to_an_unverified_address(notifications_on, test_user, test_device):
    test_user.email_verified = False
    await test_user.save()

    await alert_notifier.notify(await new_alert(test_device))

    notifications_on.assert_not_awaited()


async def test_no_email_to_a_deactivated_account(notifications_on, test_user, test_device):
    test_user.is_active = False
    await test_user.save()

    await alert_notifier.notify(await new_alert(test_device))

    notifications_on.assert_not_awaited()


async def test_info_alerts_are_not_emailed_by_default(notifications_on, test_device):
    await alert_notifier.notify(await new_alert(test_device, severity=AlertSeverity.INFO, rule="CPU_UTILIZATION_HIGH"))

    notifications_on.assert_not_awaited()


async def test_minimum_severity_can_be_raised_to_critical(notifications_on, monkeypatch, test_device):
    monkeypatch.setattr(settings, "ALERT_EMAIL_MIN_SEVERITY", "CRITICAL")

    await alert_notifier.notify(await new_alert(test_device, severity=AlertSeverity.WARNING, rule="CPU_OVERHEATING_WARNING"))
    notifications_on.assert_not_awaited()

    await alert_notifier.notify(await new_alert(test_device))
    notifications_on.assert_awaited_once()


async def test_an_invalid_minimum_severity_falls_back_to_warning(notifications_on, monkeypatch, test_device):
    monkeypatch.setattr(settings, "ALERT_EMAIL_MIN_SEVERITY", "loud")

    await alert_notifier.notify(await new_alert(test_device, severity=AlertSeverity.WARNING, rule="CPU_OVERHEATING_WARNING"))

    notifications_on.assert_awaited_once()


async def test_no_email_when_email_is_not_configured(notifications_on, test_device):
    with patch.object(email_service, "is_configured", return_value=False):
        await alert_notifier.notify(await new_alert(test_device))

    notifications_on.assert_not_awaited()


async def test_no_email_when_alert_emails_are_switched_off(notifications_on, monkeypatch, test_device):
    monkeypatch.setattr(settings, "ALERT_EMAILS_ENABLED", False)

    await alert_notifier.notify(await new_alert(test_device))

    notifications_on.assert_not_awaited()


# --------------------------------------------------------------- cooldown

async def test_cooldown_blocks_a_second_email_for_the_same_rule(notifications_on, test_device):
    five_minutes_ago = datetime.now(timezone.utc) - timedelta(minutes=5)
    await new_alert(test_device, email_sent_at=five_minutes_ago)

    await alert_notifier.notify(await new_alert(test_device))

    notifications_on.assert_not_awaited()


async def test_email_goes_out_again_once_the_cooldown_has_passed(notifications_on, test_device):
    two_hours_ago = datetime.now(timezone.utc) - timedelta(hours=2)
    await new_alert(test_device, email_sent_at=two_hours_ago)

    await alert_notifier.notify(await new_alert(test_device))

    notifications_on.assert_awaited_once()


async def test_cooldown_is_per_rule(notifications_on, test_device):
    await new_alert(test_device, rule="GPU_HOTSPOT_CRITICAL", email_sent_at=datetime.now(timezone.utc))

    await alert_notifier.notify(await new_alert(test_device, rule="CPU_OVERHEATING_CRITICAL"))

    notifications_on.assert_awaited_once()


async def test_cooldown_is_per_device(notifications_on, test_device, other_device):
    await new_alert(other_device, email_sent_at=datetime.now(timezone.utc))

    await alert_notifier.notify(await new_alert(test_device))

    notifications_on.assert_awaited_once()


# ---------------------------------------------------------------- failures

async def test_a_failed_send_leaves_the_alert_unmarked(notifications_on, test_device):
    notifications_on.return_value = False
    alert = await new_alert(test_device)

    await alert_notifier.notify(alert)

    assert (await AnomalyAlertDocument.get(alert.id)).email_sent_at is None


async def test_an_error_while_sending_is_swallowed(notifications_on, test_device):
    notifications_on.side_effect = RuntimeError("email exploded")

    await alert_notifier.notify(await new_alert(test_device))  # must not raise


async def test_an_alert_for_a_deleted_user_is_ignored(notifications_on, test_user, test_device):
    alert = await new_alert(test_device)
    await test_user.delete()

    await alert_notifier.notify(alert)

    notifications_on.assert_not_awaited()


# ----------------------------------------------------------------- webhook

async def test_webhook_receives_the_alert(monkeypatch, test_device):
    monkeypatch.setattr(settings, "ALERT_WEBHOOK_URL", "https://hooks.example.test/lectio")
    alert = await new_alert(test_device)

    with patch("app.services.alert_notifier.send_webhook_alert", new=AsyncMock()) as hook:
        await alert_notifier.notify(alert)

    hook.assert_awaited_once()
    url, payload = hook.await_args.args
    assert url == "https://hooks.example.test/lectio"
    assert payload == webhook_payload(alert, "Test Desktop")
    assert payload["event"] == "ALERT_CREATED"
    assert payload["severity"] == "CRITICAL"
    assert payload["device_name"] == "Test Desktop"


async def test_webhook_is_sent_even_when_email_is_off(monkeypatch, test_user, test_device):
    monkeypatch.setattr(settings, "ALERT_WEBHOOK_URL", "https://hooks.example.test/lectio")
    test_user.email_alerts = False
    await test_user.save()

    with patch("app.services.alert_notifier.send_webhook_alert", new=AsyncMock()) as hook:
        await alert_notifier.notify(await new_alert(test_device))

    hook.assert_awaited_once()


# ---------------------------------------------------------------- dispatch

async def test_dispatch_does_nothing_when_nothing_is_enabled(test_device):
    notifier = AlertNotifier()

    notifier.dispatch(await new_alert(test_device))

    assert notifier._tasks == set()


async def test_dispatch_runs_in_the_background(notifications_on, test_device):
    notifier = AlertNotifier()
    alert = await new_alert(test_device)

    notifier.dispatch(alert)
    assert len(notifier._tasks) == 1
    await notifier.drain()

    notifications_on.assert_awaited_once()
    assert notifier._tasks == set()


# ------------------------------------------------------------ engine hook

def snapshot_at(temperature: float) -> TelemetrySnapshot:
    return TelemetrySnapshot(sensor_id="sensor_test", cpu=CPUMetrics(core_temperature_c=temperature))


async def test_the_engine_notifies_once_per_new_alert_not_per_update(test_user, test_device):
    engine = AnomalyEngine()
    engine._debounce_enabled = False

    with patch.object(alert_notifier, "dispatch") as dispatch:
        first = await engine.evaluate_snapshot(str(test_user.id), str(test_device.id), snapshot_at(95.0))
        created = dispatch.call_count
        await engine.evaluate_snapshot(str(test_user.id), str(test_device.id), snapshot_at(96.0))

    assert created == len(first) >= 1
    assert dispatch.call_count == created  # the second reading only updated those alerts


# ----------------------------------------------------- the user's setting

async def test_email_alerts_default_to_on_and_can_be_turned_off(authenticated_client):
    me = await authenticated_client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["email_alerts"] is True

    changed = await authenticated_client.patch("/api/v1/auth/profile", json={"email_alerts": False})
    assert changed.status_code == 200
    assert changed.json()["email_alerts"] is False

    again = await authenticated_client.get("/api/v1/auth/me")
    assert again.json()["email_alerts"] is False


async def test_changing_the_name_leaves_the_email_setting_alone(authenticated_client):
    await authenticated_client.patch("/api/v1/auth/profile", json={"email_alerts": False})

    changed = await authenticated_client.patch("/api/v1/auth/profile", json={"full_name": "New Name"})

    assert changed.json()["full_name"] == "New Name"
    assert changed.json()["email_alerts"] is False


# ------------------------------------------------------------ email body

async def test_the_alert_email_escapes_user_controlled_text():
    sent = {}

    async def fake_send(to_email, subject, html_content, text_content=None):
        sent.update(html=html_content, text=text_content, subject=subject)
        return True

    with patch.object(email_service, "send_email", new=fake_send):
        await email_service.send_alert_email(
            to_email="a@example.com",
            user_name="<b>Sam</b>",
            device_name="<script>alert(1)</script>",
            severity="CRITICAL",
            message="CPU at 95 & rising",
            created_at="16 Nov 2026, 10:00 UTC",
            dashboard_url="https://lectio.example/app?x=1&y=2",
        )

    assert "<script>" not in sent["html"]
    assert "&lt;script&gt;" in sent["html"]
    assert "&lt;b&gt;Sam&lt;/b&gt;" in sent["html"]
    assert "CPU at 95 &amp; rising" in sent["html"]
    assert "Critical" in sent["subject"]
    assert "https://lectio.example/app?x=1&y=2" in sent["text"]


def _sendliberty(handler):
    """email_service configured for SendLiberty, with its HTTP calls answered by handler."""
    import httpx

    real_client = httpx.AsyncClient

    def client(**kwargs):
        return real_client(transport=httpx.MockTransport(handler), **kwargs)

    return patch.multiple(email_service, api_key="sl_test_key", from_email="Lectio <lectio.alerts@gmail.com>"),         patch("app.services.email.httpx.AsyncClient", client)


async def test_email_is_sent_through_sendliberty():
    import json
    import httpx

    seen = {}

    def handler(request: httpx.Request):
        seen.update(url=str(request.url), auth=request.headers["Authorization"], body=json.loads(request.content))
        return httpx.Response(200, json={"id": "email-1"})

    settings_patch, client_patch = _sendliberty(handler)
    with settings_patch, client_patch:
        ok = await email_service.send_email("a@example.com", "Subject", "<p>Hi</p>", "Hi")

    assert ok is True
    assert seen["url"] == "https://sendliberty.com/api/send"
    assert seen["auth"] == "Bearer sl_test_key"
    assert seen["body"] == {"from": "Lectio <lectio.alerts@gmail.com>", "to": "a@example.com",
                            "subject": "Subject", "html": "<p>Hi</p>", "text": "Hi"}


async def test_a_refusal_is_logged_not_raised(caplog):
    import httpx

    def handler(request):
        return httpx.Response(403, json={"error": "This API key can't send from that address."})

    settings_patch, client_patch = _sendliberty(handler)
    with settings_patch, client_patch:
        ok = await email_service.send_email("a@example.com", "Subject", "<p>Hi</p>")

    assert ok is False
    assert "can't send from that address" in caplog.text and "EMAIL_FROM" in caplog.text


async def test_rate_limit_is_logged_with_retry_after(caplog):
    import httpx

    def handler(request):
        return httpx.Response(429, json={"message": "Too many requests"}, headers={"Retry-After": "1"})

    settings_patch, client_patch = _sendliberty(handler)
    with settings_patch, client_patch:
        assert await email_service.send_email("a@example.com", "Subject", "<p>Hi</p>") is False
    assert "Too many requests" in caplog.text and "retry after 1 s" in caplog.text


async def test_service_unreachable_returns_false():
    import httpx

    def handler(request):
        raise httpx.ConnectTimeout("timed out")

    settings_patch, client_patch = _sendliberty(handler)
    with settings_patch, client_patch:
        assert await email_service.send_email("a@example.com", "Subject", "<p>Hi</p>") is False


async def test_no_api_key_means_not_configured():
    with patch.multiple(email_service, api_key=None, from_email="alerts@example.test"):
        assert email_service.is_configured() is False
        assert await email_service.send_email("a@example.com", "Subject", "<p>Hi</p>") is False
