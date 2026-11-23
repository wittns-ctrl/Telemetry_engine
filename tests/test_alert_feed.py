"""New alerts go to the user's alert feed too, so the website can pop them up on any page."""

import secrets
from unittest.mock import AsyncMock, patch

import pytest

from app.api.v1.websocket import ALERT_FEED
from app.core.security import hash_token
from app.models.alert import AlertSeverity, AnomalyAlertDocument


@pytest.mark.asyncio
async def test_alerts_from_a_snapshot_reach_the_users_feed(async_client, test_device):
    key = secrets.token_urlsafe(32)
    test_device.ingest_key_hash = hash_token(key)
    await test_device.save()
    alert = AnomalyAlertDocument(
        user_id=test_device.user_id, device_id=test_device.id, rule_name="CPU_OVERHEATING_CRITICAL",
        severity=AlertSeverity.CRITICAL, metric_name="cpu_core_temperature_c", trigger_value=96.0,
        threshold_limit=90.0, message="CPU core temperature critical",
    )
    await alert.insert()

    with patch("app.api.v1.ingest.anomaly_engine.evaluate_snapshot", AsyncMock(return_value=[alert])), \
         patch("app.api.v1.ingest.manager.broadcast_to_device", AsyncMock()) as broadcast:
        response = await async_client.post(
            "/api/v1/telemetry/ingest", headers={"X-Device-Key": key},
            json={"sensor_id": "agent-test", "cpu": {"core_temperature_c": 96}},
        )

    assert response.status_code == 202
    channels = [call.args[1] for call in broadcast.await_args_list]
    assert channels == [str(test_device.id), ALERT_FEED]
    feed = broadcast.await_args_list[1].args[2]
    assert feed["type"] == "alerts"
    assert feed["device_name"] == test_device.device_name
    assert feed["alerts"][0]["id"] == str(alert.id)
    assert feed["alerts"][0]["device_id"] == str(test_device.id)


@pytest.mark.asyncio
async def test_a_quiet_snapshot_sends_nothing_to_the_feed(async_client, test_device):
    key = secrets.token_urlsafe(32)
    test_device.ingest_key_hash = hash_token(key)
    await test_device.save()

    with patch("app.api.v1.ingest.anomaly_engine.evaluate_snapshot", AsyncMock(return_value=[])), \
         patch("app.api.v1.ingest.manager.broadcast_to_device", AsyncMock()) as broadcast:
        await async_client.post("/api/v1/telemetry/ingest", headers={"X-Device-Key": key},
                                json={"sensor_id": "agent-test", "cpu": {"utilization_percent": 20}})

    assert [call.args[1] for call in broadcast.await_args_list] == [str(test_device.id)]
