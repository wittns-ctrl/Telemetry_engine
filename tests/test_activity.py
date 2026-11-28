"""The activity log: the account's own events, in plain words, kept 7 days."""

from datetime import datetime, timedelta, timezone

from app.models.alert import AlertSeverity, AnomalyAlertDocument
from app.models.audit_log import AuditEventType as E, AuditLog
from app.services import activity


async def test_sign_ins_appear_in_plain_words(authenticated_client, test_user):
    await activity.record(test_user.id, E.LOGIN_SUCCESS, ip="197.157.184.161",
                          user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0")
    await activity.record(test_user.id, E.LOGIN_FAILURE, success=False, ip="41.2.3.4")
    items = (await authenticated_client.get("/api/v1/activity")).json()["items"]
    titles = [i["title"] for i in items]
    assert "Signed in" in titles and "Failed sign-in attempt" in titles
    signed_in = next(i for i in items if i["title"] == "Signed in")
    assert signed_in["detail"] == "Chrome on Windows · 197.157.x.x"  # address partly hidden
    assert next(i for i in items if i["title"] == "Failed sign-in attempt")["tone"] == "warn"


async def test_alerts_open_and_close_with_the_pc_name(authenticated_client, test_user, test_device):
    alert = AnomalyAlertDocument(
        user_id=test_user.id, device_id=test_device.id, rule_name="CPU_OVERHEATING_CRITICAL",
        severity=AlertSeverity.CRITICAL, metric_name="cpu_core_temperature_c", trigger_value=96,
        threshold_limit=95, message="CPU core temperature critical: 96.0°C at or above 95.0°C",
    )
    await alert.insert()
    await activity.alert_opened(alert)
    await activity.alert_closed(alert, "recovered")
    items = (await authenticated_client.get("/api/v1/activity?kind=alerts")).json()["items"]
    opened = next(i for i in items if i["title"].startswith("Alert:"))
    assert opened["tone"] == "bad" and opened["alert_id"] == str(alert.id)
    assert test_device.device_name in opened["detail"]
    assert any(i["title"].startswith("Resolved:") and "back to normal" in i["detail"] for i in items)


async def test_security_alerts_file_under_security(authenticated_client, test_user, test_device):
    await activity.record(test_user.id, E.ALERT_OPENED, device_id=str(test_device.id), rule="SECURITY_THREAT_ACTIVE_CRITICAL",
                          severity="CRITICAL", message="Malware found: Trojan:Win32/Agent")
    items = (await authenticated_client.get("/api/v1/activity?kind=security")).json()["items"]
    assert len(items) == 1 and "Malware found" in items[0]["title"]


async def test_only_your_own_entries(authenticated_client, other_user, test_user):
    await activity.record(other_user.id, E.LOGIN_SUCCESS)
    items = (await authenticated_client.get("/api/v1/activity")).json()["items"]
    raw = await AuditLog.find(AuditLog.user_id == str(other_user.id)).to_list()
    assert raw and all(i["id"] != str(raw[0].id) for i in items)


async def test_entries_older_than_7_days_are_not_shown(authenticated_client, test_user):
    old = AuditLog(user_id=str(test_user.id), event_type=E.LOGOUT, created_at=datetime.now(timezone.utc) - timedelta(days=8))
    await old.insert()
    items = (await authenticated_client.get("/api/v1/activity")).json()["items"]
    assert all(i["id"] != str(old.id) for i in items)


def test_the_log_expires_after_7_days():
    ttl = [i for i in AuditLog.Settings.indexes if getattr(i, "document", {}).get("name") == "created_ttl"]
    assert ttl and ttl[0].document["expireAfterSeconds"] == 7 * 24 * 60 * 60


async def test_needs_sign_in(async_client):
    assert (await async_client.get("/api/v1/activity")).status_code == 401
