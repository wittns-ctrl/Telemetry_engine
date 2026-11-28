"""PCs that stop without warning: alert + email, back online, cause, crash reports, owner-only story."""

from datetime import datetime, timedelta, timezone

import pytest

from app.core.security import hash_token
from app.models.alert import AnomalyAlertDocument
from app.models.incident import Incident
from app.models.telemetry import CPUMetrics, Device, TelemetrySnapshotDocument
from app.services import offline_watch
from app.services.alert_notifier import alert_notifier
from app.services.email import email_service

KEY = "offline-device-key-0123456789abcdef"
AGENT = {"X-Device-Key": KEY}
NOW = datetime.now(timezone.utc).replace(microsecond=0)


@pytest.fixture
async def pc(test_device):
    test_device.ingest_key_hash = hash_token(KEY)
    test_device.last_seen = NOW - timedelta(minutes=8)
    test_device.agent_last_seen = NOW - timedelta(minutes=7)
    await test_device.save()
    return test_device


@pytest.fixture
def mails(monkeypatch):
    sent = []

    async def offline(**kw):
        sent.append(("offline", kw))
        return True

    async def back(**kw):
        sent.append(("back", kw))
        return True

    monkeypatch.setattr(alert_notifier, "may_email", staticmethod(lambda user: True))
    monkeypatch.setattr(email_service, "send_offline_email", offline)
    monkeypatch.setattr(email_service, "send_back_online_email", back)
    return sent


async def reading(device, at, cpu=50.0, temp=60.0):
    await TelemetrySnapshotDocument(device_id=device.id, user_id=device.user_id, timestamp=at, sensor_id="agent-1",
                                    cpu=CPUMetrics(utilization_percent=cpu, package_temperature_c=temp)).insert()


async def come_back(device, at):
    await Device.get_pymongo_collection().update_one({"_id": device.id}, {"$set": {"agent_last_seen": at}})


async def test_a_silent_pc_gets_one_alert_and_one_email(pc, mails):
    await reading(pc, NOW - timedelta(minutes=8), cpu=98, temp=91)
    await offline_watch.tick(NOW)
    await offline_watch.tick(NOW + timedelta(minutes=1))  # no second alert

    alerts = await AnomalyAlertDocument.find(AnomalyAlertDocument.rule_name == offline_watch.RULE).to_list()
    assert len(alerts) == 1 and alerts[0].is_active and alerts[0].severity.value == "CRITICAL"
    assert alerts[0].pc_notified_at is not None  # never shown on the PC that's gone
    assert [m[0] for m in mails] == ["offline"]
    assert mails[0][1]["last_reading"] == "the processor was 98% busy at 91 °C"
    incident = await Incident.find_one(Incident.device_id == pc.id)
    assert incident.offline_email_sent and incident.alert_id == alerts[0].id


async def test_a_pc_that_said_goodbye_raises_nothing(async_client, pc, mails):
    r = await async_client.post("/api/v1/agent/goodbye", headers=AGENT, json={"reason": "shutdown"})
    assert r.status_code == 204
    # the goodbye was 7 minutes ago, right after the last check-in
    await Device.get_pymongo_collection().update_one({"_id": pc.id}, {"$set": {"goodbye_at": NOW - timedelta(minutes=7)}})
    await offline_watch.tick(NOW)
    assert await AnomalyAlertDocument.find(AnomalyAlertDocument.rule_name == offline_watch.RULE).count() == 0
    assert mails == []
    # and its normal start later says nothing either
    await come_back(pc, NOW + timedelta(minutes=30))
    await offline_watch.tick(NOW + timedelta(minutes=31))
    assert await Incident.find().count() == 0
    assert (await Device.get(pc.id)).offline_since is None


async def test_coming_back_closes_the_alert_and_emails_again(pc, mails):
    await offline_watch.tick(NOW)
    await come_back(pc, NOW + timedelta(minutes=2))
    await offline_watch.tick(NOW + timedelta(minutes=3))

    alert = await AnomalyAlertDocument.find_one(AnomalyAlertDocument.rule_name == offline_watch.RULE)
    assert not alert.is_active and alert.resolved_reason == "recovered"
    assert [m[0] for m in mails] == ["offline", "back"]
    assert mails[1][1]["off_for"] == "9 minutes"
    incident = await Incident.find_one(Incident.device_id == pc.id)
    assert incident.back_at is not None and incident.cause is None


async def test_readings_from_the_gap_mean_the_internet_dropped(pc, mails):
    await offline_watch.tick(NOW)
    await come_back(pc, NOW + timedelta(minutes=2))
    await offline_watch.tick(NOW + timedelta(minutes=3))
    await reading(pc, NOW - timedelta(minutes=3))  # buffered on the PC, uploaded after
    await come_back(pc, NOW + timedelta(minutes=9))
    await offline_watch.tick(NOW + timedelta(minutes=10))
    assert (await Incident.find_one(Incident.device_id == pc.id)).cause == "connection"


async def test_no_readings_from_the_gap_mean_it_was_off(pc, mails):
    await offline_watch.tick(NOW)
    await come_back(pc, NOW + timedelta(minutes=2))
    await offline_watch.tick(NOW + timedelta(minutes=3))
    await come_back(pc, NOW + timedelta(minutes=9))
    await offline_watch.tick(NOW + timedelta(minutes=10))
    assert (await Incident.find_one(Incident.device_id == pc.id)).cause == "off"


async def test_windows_crash_report_explains_the_outage(async_client, pc, mails):
    await offline_watch.tick(NOW)
    await come_back(pc, NOW + timedelta(minutes=2))
    await offline_watch.tick(NOW + timedelta(minutes=3))
    body = {"cause": "bluescreen", "at": (NOW + timedelta(minutes=1)).isoformat(), "bugcheck_code": "0x9F"}
    r = await async_client.post("/api/v1/agent/incident", headers=AGENT, json=body)
    assert r.status_code == 200
    again = await async_client.post("/api/v1/agent/incident", headers=AGENT, json=body)
    assert again.json() == r.json()  # sent twice, recorded once
    await come_back(pc, NOW + timedelta(minutes=9))  # still checking in
    await offline_watch.tick(NOW + timedelta(minutes=10))  # Lectio's guess doesn't overwrite Windows
    incidents = await Incident.find(Incident.device_id == pc.id).to_list()
    assert len(incidents) == 1 and incidents[0].cause == "bluescreen" and incidents[0].bugcheck_code == "0x9f"


async def test_a_short_crash_with_no_alert_is_still_recorded(async_client, test_device, mails):
    test_device.ingest_key_hash = hash_token(KEY)
    test_device.agent_last_seen = NOW
    await test_device.save()
    body = {"cause": "power_lost", "at": (NOW - timedelta(minutes=1)).isoformat(),
            "last_alive": (NOW - timedelta(minutes=3)).isoformat()}
    assert (await async_client.post("/api/v1/agent/incident", headers=AGENT, json=body)).status_code == 200
    incident = await Incident.find_one(Incident.device_id == test_device.id)
    assert incident.cause == "power_lost" and incident.alert_id is None
    assert mails == []


async def test_bad_crash_reports_are_refused(async_client, pc):
    for body in ({"cause": "hacked", "at": NOW.isoformat()},
                 {"cause": "bluescreen", "at": NOW.isoformat(), "bugcheck_code": "<script>"},
                 {"cause": "power_lost", "at": (NOW - timedelta(days=30)).isoformat()}):
        assert (await async_client.post("/api/v1/agent/incident", headers=AGENT, json=body)).status_code == 422
    assert (await async_client.post("/api/v1/agent/incident", json={"cause": "power_lost", "at": NOW.isoformat()})).status_code in (401, 422)


async def test_pcs_silent_for_days_are_left_alone(test_device, mails):
    test_device.last_seen = NOW - timedelta(days=3)
    await test_device.save()
    await offline_watch.tick(NOW)
    assert await Incident.find().count() == 0 and mails == []


async def test_the_story_is_owner_only(authenticated_client, other_auth_headers, pc, mails):
    await AnomalyAlertDocument(user_id=pc.user_id, device_id=pc.id, rule_name="SECURITY_THREAT_ACTIVE_CRITICAL",
                               severity="CRITICAL", metric_name="threats", trigger_value=1, threshold_limit=0,
                               message="Malware found: Trojan:Win32/Agent", created_at=NOW - timedelta(minutes=9)).insert()
    await offline_watch.tick(NOW)
    await come_back(pc, NOW + timedelta(minutes=2))
    await offline_watch.tick(NOW + timedelta(minutes=3))
    url = f"/api/v1/devices/{pc.id}/incidents"
    story = (await authenticated_client.get(url)).json()
    assert len(story) == 1
    texts = [m["text"] for m in story[0]["timeline"]]
    assert texts == ["Malware found", "Stopped without shutting down", "Back on"]
    assert story[0]["minutes_off"] == 9
    assert (await authenticated_client.get(url, headers=other_auth_headers)).status_code == 404
