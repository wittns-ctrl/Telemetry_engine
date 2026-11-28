"""End-of-day health check: built from the day's data, once per day, owner-only."""

from datetime import datetime, timedelta, timezone

import pytest

from app.core.security import hash_token
from app.models.alert import AlertSeverity, AnomalyAlertDocument
from app.models.daily_report import DailyReport
from app.models.rollup import TelemetryRollupDocument
from app.models.telemetry import SecurityMetrics, ThreatInfo
from app.services import daily_report

KEY = "daily-device-key-0123456789abcdefgh"
AGENT = {"X-Device-Key": KEY}
URL = "/api/v1/agent/daily-check"


@pytest.fixture
async def keyed_device(test_device):
    test_device.ingest_key_hash = hash_token(KEY)
    await test_device.save()
    return test_device


def today():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def hour(device, h, **stats):
    start = datetime.strptime(today(), "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(hours=h)
    sums, n, lo, hi = {}, {}, {}, {}
    for key, (avg, low, high) in stats.items():
        sums[key], n[key], lo[key], hi[key] = avg * 720, 720, low, high
    await TelemetryRollupDocument(user_id=device.user_id, device_id=device.id, granularity="hour", start=start,
                                  readings=720, sums=sums, n=n, lo=lo, hi=hi,
                                  expires_at=start + timedelta(days=90)).insert()


async def test_a_calm_day_scores_well(async_client, keyed_device):
    await hour(keyed_device, 9, cpu__core_temperature_c=(55, 40, 70), cpu__utilization_percent=(20, 2, 60),
               ram__usage_percent=(50, 40, 65))
    r = (await async_client.post(URL, headers=AGENT, json={"day": today(), "utc_offset_minutes": 0})).json()
    assert r["status"] == "ready" and r["score"] == 100
    assert r["title"].startswith("Daily check: 100/100")


async def test_a_hot_day_with_alerts_and_malware(async_client, keyed_device):
    await hour(keyed_device, 14, cpu__core_temperature_c=(80, 60, 96), ram__usage_percent=(70, 50, 97))
    await AnomalyAlertDocument(user_id=keyed_device.user_id, device_id=keyed_device.id, rule_name="CPU_OVERHEATING_CRITICAL",
                               severity=AlertSeverity.CRITICAL, metric_name="cpu_core_temperature_c", trigger_value=96,
                               threshold_limit=95, message="CPU core temperature critical: 96.0°C").insert()
    keyed_device.security = SecurityMetrics(checked_at=datetime.now(timezone.utc), antivirus="Microsoft Defender",
                                            defender_active=True, realtime_protection=True, threats=[ThreatInfo(
                                                name="Trojan:Win32/Agent", status="detected", active=True,
                                                detected_at=datetime.now(timezone.utc))])
    await keyed_device.save()
    r = (await async_client.post(URL, headers=AGENT, json={"day": today(), "utc_offset_minutes": 0})).json()
    report = await DailyReport.get(r["report_id"])
    assert report.score <= 40
    assert report.todo[0].startswith("Remove the threat")
    areas = {f.area: f.tone for f in report.findings}
    assert areas["heat"] == "bad" and areas["security"] == "bad" and areas["memory"] == "warn"


async def test_no_readings_no_report(async_client, keyed_device):
    r = (await async_client.post(URL, headers=AGENT, json={"day": today(), "utc_offset_minutes": 0})).json()
    assert r == {"status": "no_data", "report_id": None, "score": None, "title": None, "body": None}


async def test_one_report_per_day(async_client, keyed_device):
    await hour(keyed_device, 10, cpu__core_temperature_c=(50, 40, 60))
    a = (await async_client.post(URL, headers=AGENT, json={"day": today()})).json()
    b = (await async_client.post(URL, headers=AGENT, json={"day": today()})).json()
    assert a["report_id"] == b["report_id"]
    assert await DailyReport.find(DailyReport.device_id == keyed_device.id).count() == 1


async def test_the_owner_sees_reports_and_others_dont(authenticated_client, other_auth_headers, keyed_device):
    await hour(keyed_device, 10, cpu__core_temperature_c=(50, 40, 60))
    await authenticated_client.post(URL, headers=AGENT, json={"day": today()})
    mine = (await authenticated_client.get(f"/api/v1/devices/{keyed_device.id}/reports")).json()
    assert len(mine) == 1 and mine[0]["findings"]
    theirs = await authenticated_client.get(f"/api/v1/devices/{keyed_device.id}/reports", headers=other_auth_headers)
    assert theirs.status_code == 404


@pytest.mark.parametrize("day", ["2020-01-01", "tomorrow", "2026-13-40"])
async def test_odd_days_are_refused(async_client, keyed_device, day):
    assert (await async_client.post(URL, headers=AGENT, json={"day": day})).status_code == 422


def test_the_pc_s_local_day():
    start, end = daily_report.day_window("2026-11-28", 120)  # UTC+2
    assert start == datetime(2026, 11, 27, 22, tzinfo=timezone.utc) and end - start == timedelta(days=1)
