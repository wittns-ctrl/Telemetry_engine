"""The top-programs list goes out live with each snapshot but isn't stored."""

import secrets
from unittest.mock import AsyncMock, patch

import pytest

from app.core.security import hash_token
from app.models.telemetry import TelemetrySnapshotDocument

SNAPSHOT = {
    "sensor_id": "agent-test",
    "cpu": {"utilization_percent": 40.0, "process_count": 300},
    "disk": {"active_percent": 3.0, "read_bytes_per_s": 1000.0, "write_bytes_per_s": 500.0},
    "network": {"adapter_name": "Wi-Fi", "receive_bytes_per_s": 2000.0, "send_bytes_per_s": 100.0, "link_speed_mbps": 144.4},
    "processes": [{"name": "game.exe", "pid": 10, "cpu_percent": 25.0, "memory_mb": 3000.0, "disk_bytes_per_s": 1000.0}],
}


@pytest.mark.asyncio
async def test_processes_are_sent_live_but_not_stored(async_client, test_device):
    key = secrets.token_urlsafe(32)
    test_device.ingest_key_hash = hash_token(key)
    await test_device.save()

    with patch("app.services.ingest_processor.manager.broadcast_to_device", AsyncMock()) as broadcast:
        response = await async_client.post("/api/v1/telemetry/ingest", headers={"X-Device-Key": key}, json=SNAPSHOT)
    assert response.status_code == 202

    live = broadcast.await_args_list[0].args[2]["telemetry"]
    assert live["processes"][0]["name"] == "game.exe"
    assert live["network"]["adapter_name"] == "Wi-Fi"

    stored = await TelemetrySnapshotDocument.find_one(TelemetrySnapshotDocument.device_id == test_device.id)
    assert stored.processes == []
    # Everything else from Task Manager is kept for the graphs.
    assert stored.cpu.process_count == 300
    assert stored.disk.active_percent == 3.0
    assert stored.network.receive_bytes_per_s == 2000.0
