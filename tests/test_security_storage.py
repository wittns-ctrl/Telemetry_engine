"""Security reports: the latest is kept on the device, not with every reading."""

from datetime import datetime, timedelta, timezone

from app.models.telemetry import Device, SecurityMetrics, TelemetrySnapshot, TelemetrySnapshotDocument, ThreatInfo
from app.services.telemetry_store import store_readings


def _reading(minutes_ago, threats=()):
    now = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
    return TelemetrySnapshot(timestamp=now, sensor_id="agent-test", security=SecurityMetrics(
        checked_at=now, antivirus="Microsoft Defender", defender_active=True, realtime_protection=True,
        threats=[ThreatInfo(name=n, status="quarantined", path=r"D:\x.vbs", detected_at=now) for n in threats]))


async def test_the_newest_security_report_goes_on_the_device(test_device):
    await store_readings(test_device, [("e1", _reading(2, ["Old:Threat"])), ("e2", _reading(1, ["New:Threat"]))])
    device = await Device.get(test_device.id)
    assert device.security is not None
    assert [t.name for t in device.security.threats] == ["New:Threat"]

    stored = await TelemetrySnapshotDocument.get_pymongo_collection().find_one({"event_id": "e2"})
    assert "security" not in stored  # not repeated in every reading


async def test_a_late_batch_doesnt_replace_a_newer_report(test_device):
    await store_readings(test_device, [("n1", _reading(1, ["Newer"]))])
    await store_readings(test_device, [("o1", _reading(30, ["Older"]))])
    device = await Device.get(test_device.id)
    assert [t.name for t in device.security.threats] == ["Newer"]


async def test_the_device_api_returns_the_report(authenticated_client, test_device):
    await store_readings(test_device, [("a1", _reading(1, ["Trojan:VBS/Runner"]))])
    r = await authenticated_client.get(f"/api/v1/devices/{test_device.id}")
    assert r.status_code == 200
    assert r.json()["security"]["threats"][0]["name"] == "Trojan:VBS/Runner"
