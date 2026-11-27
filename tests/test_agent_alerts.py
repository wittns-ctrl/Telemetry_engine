"""The agent's notification check-in: new critical alerts, each handed out once."""

from datetime import datetime, timedelta, timezone

import pytest

from app.core.security import hash_token
from app.models.alert import AlertSeverity, AnomalyAlertDocument

KEY = "notify-device-key-0123456789abcdef"
OTHER_KEY = "notify-other-key-0123456789abcdef"
URL = "/api/v1/agent/alerts/pending"


@pytest.fixture
async def keyed_device(test_device):
    test_device.ingest_key_hash = hash_token(KEY)
    await test_device.save()
    return test_device


@pytest.fixture
async def keyed_other_device(other_device):
    other_device.ingest_key_hash = hash_token(OTHER_KEY)
    await other_device.save()
    return other_device


async def _alert(device, severity=AlertSeverity.CRITICAL, age=timedelta(0), active=True,
                 message="CPU core temperature critical: 96.0°C at or above 95.0°C"):
    alert = AnomalyAlertDocument(
        user_id=device.user_id, device_id=device.id, rule_name="CPU_OVERHEATING_CRITICAL",
        severity=severity, metric_name="cpu_core_temperature_c", trigger_value=96, threshold_limit=95,
        message=message, is_active=active, created_at=datetime.now(timezone.utc) - age,
    )
    await alert.insert()
    return alert


async def test_a_new_critical_alert_is_handed_out_once(async_client, keyed_device):
    alert = await _alert(keyed_device)

    first = await async_client.get(URL, headers={"X-Device-Key": KEY})
    assert first.status_code == 200
    notes = first.json()["notifications"]
    assert [n["alert_id"] for n in notes] == [str(alert.id)]
    assert notes[0]["title"] == "CPU core temperature critical"
    assert notes[0]["body"].startswith("96.0°C at or above 95.0°C.")
    assert "url" not in notes[0]  # the agent builds the link itself

    again = await async_client.get(URL, headers={"X-Device-Key": KEY})
    assert again.json()["notifications"] == []
    assert (await AnomalyAlertDocument.get(alert.id)).pc_notified_at is not None


async def test_only_fresh_open_critical_alerts(async_client, keyed_device):
    await _alert(keyed_device, severity=AlertSeverity.WARNING)
    await _alert(keyed_device, age=timedelta(hours=2))
    await _alert(keyed_device, active=False)
    r = await async_client.get(URL, headers={"X-Device-Key": KEY})
    assert r.json()["notifications"] == []


async def test_a_pc_only_gets_its_own_alerts(async_client, keyed_device, keyed_other_device):
    await _alert(keyed_other_device)
    r = await async_client.get(URL, headers={"X-Device-Key": KEY})
    assert r.json()["notifications"] == []


async def test_a_burst_shows_a_few_at_a_time(async_client, keyed_device):
    for _ in range(5):
        await _alert(keyed_device)
    first = await async_client.get(URL, headers={"X-Device-Key": KEY})
    second = await async_client.get(URL, headers={"X-Device-Key": KEY})
    assert len(first.json()["notifications"]) == 3
    assert len(second.json()["notifications"]) == 2


async def test_needs_a_valid_device_key(async_client, keyed_device):
    r = await async_client.get(URL, headers={"X-Device-Key": "wrong-key-0123456789abcdefghij"})
    assert r.status_code == 401
