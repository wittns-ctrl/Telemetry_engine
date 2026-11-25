"""GET /api/v1/metrics/trend: readings averaged per hour or day, from the summaries kept as readings arrive."""

from datetime import datetime, timedelta, timezone

from app.models.telemetry import CPUMetrics, RAMMetrics, TelemetrySnapshotDocument
from app.services import rollups


async def _snapshot(device, *, ago, cpu_util=None, cpu_temp=None, ram=None):
    """Store a reading and fold it into the summaries, as an upload does."""
    doc = TelemetrySnapshotDocument(
        user_id=device.user_id,
        device_id=device.id,
        timestamp=datetime.now(timezone.utc) - ago,
        sensor_id="agent-test",
        cpu=CPUMetrics(utilization_percent=cpu_util, core_temperature_c=cpu_temp),
        ram=RAMMetrics(usage_percent=ram),
    )
    await doc.insert()
    await rollups.add_readings(device.user_id, device.id, [doc.model_dump()])


def _url(device, period="24h"):
    return f"/api/v1/metrics/trend?device_id={device.id}&period={period}"


async def test_hourly_buckets_average_and_peak(async_client, auth_headers, test_device):
    # Two snapshots in the same hour, one five hours earlier.
    now = datetime.now(timezone.utc)
    minute = now.minute
    await _snapshot(test_device, ago=timedelta(minutes=0), cpu_util=20.0, cpu_temp=60.0, ram=50.0)
    await _snapshot(test_device, ago=timedelta(minutes=min(minute, 1)), cpu_util=40.0, cpu_temp=70.0, ram=50.0)
    await _snapshot(test_device, ago=timedelta(hours=5), cpu_util=90.0, cpu_temp=85.0, ram=80.0)

    r = await async_client.get(_url(test_device), headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["bucket"] == "hour"
    buckets = body["buckets"]
    assert [b["count"] for b in buckets] == [1, 2]  # oldest first
    latest = buckets[-1]["readings"]
    assert latest["cpu_util"] == {"avg": 30.0, "max": 40.0}
    assert latest["cpu_core_temp"] == {"avg": 65.0, "max": 70.0}
    assert buckets[0]["readings"]["ram_usage"] == {"avg": 80.0, "max": 80.0}
    assert buckets[-1]["start"].endswith(":00:00Z")


async def test_missing_readings_are_null(async_client, auth_headers, test_device):
    await _snapshot(test_device, ago=timedelta(minutes=1), cpu_util=10.0)
    r = await async_client.get(_url(test_device), headers=auth_headers)
    readings = r.json()["buckets"][0]["readings"]
    assert readings["gpu_core_temp"] == {"avg": None, "max": None}


async def test_period_limits_and_daily_buckets(async_client, auth_headers, test_device):
    await _snapshot(test_device, ago=timedelta(days=3), cpu_util=50.0)
    await _snapshot(test_device, ago=timedelta(days=20), cpu_util=50.0)
    await _snapshot(test_device, ago=timedelta(days=40), cpu_util=50.0)

    day = (await async_client.get(_url(test_device, "24h"), headers=auth_headers)).json()
    week = (await async_client.get(_url(test_device, "7d"), headers=auth_headers)).json()
    month = (await async_client.get(_url(test_device, "30d"), headers=auth_headers)).json()

    assert day["buckets"] == []
    assert week["bucket"] == "day" and sum(b["count"] for b in week["buckets"]) == 1
    assert sum(b["count"] for b in month["buckets"]) == 2
    assert all(b["start"].endswith("T00:00:00Z") for b in month["buckets"])


async def test_rejects_unknown_period(async_client, auth_headers, test_device):
    r = await async_client.get(_url(test_device, "1y"), headers=auth_headers)
    assert r.status_code == 422


async def test_other_users_device_is_forbidden(async_client, auth_headers, other_device):
    await _snapshot(other_device, ago=timedelta(minutes=1), cpu_util=99.0)
    r = await async_client.get(_url(other_device), headers=auth_headers)
    assert r.status_code == 403


async def test_requires_sign_in(async_client, test_device):
    r = await async_client.get(_url(test_device))
    assert r.status_code == 401


async def test_invalid_device_id(async_client, auth_headers, mock_mongo_client):
    r = await async_client.get("/api/v1/metrics/trend?device_id=not-an-id", headers=auth_headers)
    assert r.status_code == 400
