"""
The telemetry read endpoints (/metrics/history, /metrics/latest, /metrics/summary)
must return stored snapshots in the same shape the agent sends and the live
WebSocket relays, and /history must work with only a start time, which is how
the dashboard asks for the last 24 hours.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.models.telemetry import (
    CPUMetrics,
    GPUMetrics,
    PowerAndVRMMetrics,
    RAMMetrics,
    StorageMetrics,
    TelemetrySnapshotDocument,
)


async def _store(device, minutes_ago: float, core_temp: float | None) -> TelemetrySnapshotDocument:
    doc = TelemetrySnapshotDocument(
        user_id=device.user_id,
        device_id=device.id,
        timestamp=datetime.now(timezone.utc) - timedelta(minutes=minutes_ago),
        sensor_id="agent-test",
        cpu=CPUMetrics(
            core_temperature_c=core_temp,
            utilization_percent=40.0,
            clock_speed_ghz=4.2,
            package_power_w=65.0,
            fan_speed_rpm=1200,
        ),
        gpu=GPUMetrics(vram_used_gb=3.5, vram_total_gb=8.0, board_power_w=180.0, gpu_name="Test GPU"),
        storage=[StorageMetrics(device_name="C:", smart_health_percent=97, total_capacity_gb=512.0, available_capacity_gb=200.0)],
        ram=RAMMetrics(usage_percent=55.0, used_gb=17.6, total_gb=32.0, pagefile_usage_percent=10.0, whea_error_count=0),
        power_vrm=PowerAndVRMMetrics(psu_12v_voltage=12.05, chipset_temperature_c=50.0),
    )
    await doc.insert()
    return doc


@pytest.mark.asyncio
async def test_history_with_only_a_start_time_returns_snapshots(authenticated_client, test_device):
    await _store(test_device, minutes_ago=2, core_temp=60.0)
    await _store(test_device, minutes_ago=1, core_temp=62.0)
    await _store(test_device, minutes_ago=60 * 30, core_temp=50.0)  # outside the window

    start = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    response = await authenticated_client.get(
        "/api/v1/metrics/history", params={"device_id": str(test_device.id), "start_time": start}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["total_count"] == 2
    temps = [s["cpu"]["core_temperature_c"] for s in data["snapshots"]]
    assert temps == [62.0, 60.0]  # newest first


@pytest.mark.asyncio
async def test_history_without_a_time_range_returns_everything(authenticated_client, test_device):
    await _store(test_device, minutes_ago=60 * 30, core_temp=50.0)
    response = await authenticated_client.get(
        "/api/v1/metrics/history", params={"device_id": str(test_device.id)}
    )
    assert response.status_code == 200
    assert response.json()["total_count"] == 1


@pytest.mark.asyncio
async def test_latest_returns_every_stored_reading_under_its_model_name(authenticated_client, test_device):
    await _store(test_device, minutes_ago=60 * 30, core_temp=58.0)  # older than a day still counts

    response = await authenticated_client.get(
        "/api/v1/metrics/latest", params={"device_id": str(test_device.id)}
    )

    assert response.status_code == 200
    s = response.json()
    assert s["cpu"]["clock_speed_ghz"] == 4.2
    assert s["cpu"]["package_power_w"] == 65.0
    assert s["cpu"]["fan_speed_rpm"] == 1200
    assert s["cpu"]["thermal_throttling"] is False
    assert s["gpu"]["vram_used_gb"] == 3.5
    assert s["gpu"]["board_power_w"] == 180.0
    assert s["gpu"]["gpu_name"] == "Test GPU"
    assert s["storage"][0]["smart_health_percent"] == 97
    assert s["storage"][0]["available_capacity_gb"] == 200.0
    assert s["ram"]["pagefile_usage_percent"] == 10.0
    assert s["ram"]["whea_error_count"] == 0
    assert s["power_vrm"]["psu_12v_voltage"] == 12.05
    assert s["power_vrm"]["chipset_temperature_c"] == 50.0


@pytest.mark.asyncio
async def test_latest_without_data_is_404(authenticated_client, test_device):
    response = await authenticated_client.get(
        "/api/v1/metrics/latest", params={"device_id": str(test_device.id)}
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_summary_averages_reported_values_and_skips_missing_ones(authenticated_client, test_device):
    await _store(test_device, minutes_ago=3, core_temp=60.0)
    await _store(test_device, minutes_ago=2, core_temp=None)
    await _store(test_device, minutes_ago=1, core_temp=70.0)

    response = await authenticated_client.get(
        "/api/v1/metrics/summary", params={"device_id": str(test_device.id)}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["snapshot_count"] == 3
    assert data["cpu_temperature"] == {"avg_c": 65.0, "max_c": 70.0, "min_c": 60.0}
    assert data["ram_usage"]["avg_percent"] == 55.0
