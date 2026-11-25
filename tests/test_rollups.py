"""Hourly and daily summaries of readings (app/services/rollups.py)."""

from datetime import datetime, timedelta, timezone

import pytest

from app.models.rollup import TelemetryRollupDocument
from app.models.telemetry import (
    CPUMetrics,
    RAMMetrics,
    StorageMetrics,
    TelemetrySnapshot,
)
from app.services import rollups
from app.services.telemetry_store import store_readings

HOUR = datetime(2026, 11, 20, 14, 0, tzinfo=timezone.utc)


def _snap(ts, **cpu):
    return {"timestamp": ts, "cpu": cpu, "storage": [], "ram": {}}


# ------------------------------------------------------------- pure functions

def test_fields_cover_numbers_but_not_flags_or_text():
    keys = {key for _, _, key in rollups.ROLLUP_FIELDS}
    assert "cpu__core_temperature_c" in keys
    assert "storage0__smart_health_percent" in keys
    assert "power_vrm__psu_12v_voltage" in keys
    assert "cpu__thermal_throttling" not in keys  # bool
    assert "gpu__gpu_name" not in keys  # text
    assert "cpu__fan_speed_rpm" in rollups.INT_KEYS


def test_bucket_starts_in_utc():
    ts = datetime(2026, 11, 20, 14, 37, 12, tzinfo=timezone.utc)
    assert rollups.bucket_start(ts, "hour") == HOUR
    assert rollups.bucket_start(ts, "day") == datetime(2026, 11, 20, tzinfo=timezone.utc)
    # A timestamp without a zone is taken as UTC.
    assert rollups.bucket_start(ts.replace(tzinfo=None), "hour") == HOUR


def test_summarise_groups_by_hour_and_day():
    snaps = [
        _snap(HOUR + timedelta(minutes=1), core_temperature_c=50.0, thermal_throttling=True),
        _snap(HOUR + timedelta(minutes=2), core_temperature_c=70.0),
        _snap(HOUR + timedelta(hours=1), core_temperature_c=60.0),
        {"timestamp": HOUR, "cpu": {}, "storage": [{"temperature_c": 40.0}, {"temperature_c": 99.0}]},
    ]
    buckets = rollups.summarise(snaps)
    hour = buckets[("hour", HOUR)]
    assert hour.count == 3
    assert hour.sums["cpu__core_temperature_c"] == 120.0 and hour.n["cpu__core_temperature_c"] == 2
    assert hour.min["cpu__core_temperature_c"] == 50.0 and hour.max["cpu__core_temperature_c"] == 70.0
    assert "cpu__thermal_throttling" not in hour.sums
    # First drive only.
    assert hour.sums["storage0__temperature_c"] == 40.0
    day = buckets[("day", datetime(2026, 11, 20, tzinfo=timezone.utc))]
    assert day.count == 4 and day.n["cpu__core_temperature_c"] == 3


def test_thin_merges_neighbours_and_keeps_averages_exact():
    docs = [
        {"start": HOUR + timedelta(hours=i), "readings": 10, "sums": {"k": 10.0 * i}, "n": {"k": 10}, "lo": {"k": i}, "hi": {"k": i}}
        for i in range(10)
    ]
    out = rollups.thin(docs, 3)
    assert len(out) == 3
    assert sum(d["readings"] for d in out) == 100
    assert out[0]["start"] == docs[0]["start"] and out[-1]["end"] == docs[-1]["start"]
    # The average of a merged run is the average of its readings, not of averages.
    first = out[0]
    assert rollups.average(first, "k") == pytest.approx(sum(range(len_ := round(10 / 3))) / len_)
    assert rollups.thin(docs[:2], 60)[0]["start"] == docs[0]["start"]


def test_as_snapshot_rebuilds_a_reading_shape():
    summary = {
        "start": HOUR, "readings": 2,
        "sums": {"cpu__core_temperature_c": 121.0, "cpu__fan_speed_rpm": 2501.0, "storage0__temperature_c": 80.0},
        "n": {"cpu__core_temperature_c": 2, "cpu__fan_speed_rpm": 2, "storage0__temperature_c": 2},
    }
    snap = rollups.as_snapshot(summary, "hour")
    assert snap["timestamp"] == HOUR + timedelta(minutes=30)
    assert snap["cpu"] == {"core_temperature_c": 60.5, "fan_speed_rpm": 1250}
    assert snap["storage"] == [{"temperature_c": 40.0}]
    TelemetrySnapshot(**snap)  # valid as a reading


# ------------------------------------------------------------ with a database

async def _summary(device, granularity="hour", start=None):
    query = {"device_id": device.id, "granularity": granularity}
    if start:
        query["start"] = start
    return await TelemetryRollupDocument.get_pymongo_collection().find_one(query)


async def test_add_readings_accumulates(mock_mongo_client, test_device):
    await rollups.add_readings(test_device.user_id, test_device.id, [_snap(HOUR + timedelta(minutes=1), core_temperature_c=50.0)])
    await rollups.add_readings(test_device.user_id, test_device.id, [_snap(HOUR + timedelta(minutes=9), core_temperature_c=80.0)])
    doc = await _summary(test_device, "hour", HOUR)
    assert doc["readings"] == 2
    assert doc["sums"]["cpu__core_temperature_c"] == 130.0
    assert doc["n"]["cpu__core_temperature_c"] == 2
    assert doc["lo"]["cpu__core_temperature_c"] == 50.0
    assert doc["hi"]["cpu__core_temperature_c"] == 80.0
    assert doc["user_id"] == test_device.user_id
    expires = doc["expires_at"].replace(tzinfo=doc["expires_at"].tzinfo or timezone.utc)
    assert expires == HOUR + timedelta(hours=1) + timedelta(days=90)


async def test_upload_updates_summaries_once_even_when_resent(mock_mongo_client, test_device):
    now = datetime.now(timezone.utc)
    readings = [
        ("ev-1", TelemetrySnapshot(timestamp=now, sensor_id="agent", cpu=CPUMetrics(core_temperature_c=55.0))),
        ("ev-2", TelemetrySnapshot(timestamp=now, sensor_id="agent", cpu=CPUMetrics(core_temperature_c=65.0))),
    ]
    await store_readings(test_device, readings)
    await store_readings(test_device, readings)  # the agent resends after a timeout
    doc = await _summary(test_device, "hour", rollups.bucket_start(now, "hour"))
    assert doc["readings"] == 2
    assert doc["sums"]["cpu__core_temperature_c"] == 120.0


async def test_week_graph_reads_the_summaries(async_client, auth_headers, test_device):
    then = datetime.now(timezone.utc) - timedelta(days=3)
    await store_readings(test_device, [
        (None, TelemetrySnapshot(timestamp=then, sensor_id="agent", cpu=CPUMetrics(core_temperature_c=40.0), ram=RAMMetrics(usage_percent=30.0))),
        (None, TelemetrySnapshot(timestamp=then + timedelta(minutes=1), sensor_id="agent", cpu=CPUMetrics(core_temperature_c=60.0), ram=RAMMetrics(usage_percent=50.0))),
    ])
    start = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat().replace("+00:00", "Z")
    r = await async_client.get(
        f"/api/v1/metrics/history?device_id={test_device.id}&start_time={start}&points=60", headers=auth_headers
    )
    assert r.status_code == 200
    snaps = r.json()["snapshots"]
    assert len(snaps) == 1
    assert snaps[0]["sensor_id"] == "hour-summary"
    assert snaps[0]["cpu"]["core_temperature_c"] == 50.0
    assert snaps[0]["ram"]["usage_percent"] == 40.0


async def test_day_graph_still_reads_raw_readings(async_client, auth_headers, test_device, monkeypatch):
    # The raw thinning runs in MongoDB ($bucketAuto), which the in-memory
    # database lacks: check the 24-hour range is sent there, not to summaries.
    calls = []

    async def fake_sampled(user, device_oid, start, end, points):
        calls.append(points)
        return []

    async def no_summaries(*args, **kwargs):
        raise AssertionError("a 24-hour graph shouldn't read summaries")

    monkeypatch.setattr("app.api.v1.metrics.sampled_history", fake_sampled)
    monkeypatch.setattr("app.api.v1.metrics.summary_history", no_summaries)
    start = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat().replace("+00:00", "Z")
    r = await async_client.get(
        f"/api/v1/metrics/history?device_id={test_device.id}&start_time={start}&points=60", headers=auth_headers
    )
    assert r.status_code == 200 and calls == [60]


async def test_summaries_of_another_users_device_are_not_returned(async_client, auth_headers, other_device):
    await rollups.add_readings(other_device.user_id, other_device.id, [_snap(datetime.now(timezone.utc), core_temperature_c=99.0)])
    start = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat().replace("+00:00", "Z")
    r = await async_client.get(
        f"/api/v1/metrics/history?device_id={other_device.id}&start_time={start}&points=60", headers=auth_headers
    )
    assert r.status_code == 403


async def test_a_failed_summary_update_does_not_fail_the_upload(mock_mongo_client, test_device, monkeypatch):
    async def broken(*args, **kwargs):
        raise RuntimeError("database hiccup")

    monkeypatch.setattr(rollups, "add_readings", broken)
    stored = await store_readings(test_device, [
        (None, TelemetrySnapshot(timestamp=datetime.now(timezone.utc), sensor_id="agent")),
    ])
    assert len(stored.stored) == 1
