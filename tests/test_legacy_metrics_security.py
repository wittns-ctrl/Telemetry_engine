"""
Auth and per-user isolation for the legacy /api/v1/metrics endpoints and the
/ws/alerts broadcast socket defined in app/main.py.
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.sockets import ConnectionManager
from app.main import app
from app.models.metric import Metrics


CPU_PAYLOAD = {"sensor_id": "sensor_a", "metric_type": "cpu", "value": 42.0,
               "core_count": 8, "process_count": 100}
CPU_BREACH = {**CPU_PAYLOAD, "value": 99.5}


class TestLegacyMetricsRequireAuth:

    @pytest.mark.parametrize("method,path", [
        ("get", "/api/v1/metrics"),
        ("get", "/api/v1/metrics/stats"),
    ])
    async def test_reads_reject_anonymous(self, async_client, mock_mongo_client, method, path):
        response = await getattr(async_client, method)(path)
        assert response.status_code == 401

    async def test_ingest_rejects_anonymous(self, async_client, mock_mongo_client):
        response = await async_client.post("/api/v1/metrics", json=CPU_PAYLOAD)
        assert response.status_code == 401
        assert await Metrics.count() == 0

    async def test_v2_raw_insert_endpoint_removed(self, async_client, auth_headers):
        response = await async_client.post("/api/v2/metrics", json={"anything": 1}, headers=auth_headers)
        assert response.status_code == 404


class TestLegacyMetricsIsolation:

    async def test_ingest_records_owner(self, async_client, auth_headers, test_user):
        response = await async_client.post("/api/v1/metrics", json=CPU_PAYLOAD, headers=auth_headers)
        assert response.status_code == 201
        metric = await Metrics.find_one()
        assert metric.user_id == str(test_user.id)

    async def test_users_only_see_their_own_metrics(
        self, async_client, auth_headers, other_auth_headers
    ):
        await async_client.post("/api/v1/metrics", json=CPU_PAYLOAD, headers=auth_headers)
        await async_client.post(
            "/api/v1/metrics", json={**CPU_PAYLOAD, "sensor_id": "other_sensor"},
            headers=other_auth_headers,
        )
        # Rows written before metrics had owners must not leak to anyone.
        await Metrics(sensor_id="legacy", metric_type="cpu", value=1.0).insert()

        mine = (await async_client.get("/api/v1/metrics", headers=auth_headers)).json()
        assert [m["sensor_id"] for m in mine] == ["sensor_a"]

        stats = (await async_client.get("/api/v1/metrics/stats", headers=auth_headers)).json()
        assert stats["total_metrics"] == 1
        assert stats["by_type"]["cpu"] == 1
        assert stats["recent_sensors"] == ["sensor_a"]

        theirs = (await async_client.get("/api/v1/metrics", headers=other_auth_headers)).json()
        assert [m["sensor_id"] for m in theirs] == ["other_sensor"]

    async def test_events_go_only_to_the_owner(self, async_client, auth_headers, test_user):
        with patch("app.main.manager.send_to_user") as send:
            await async_client.post("/api/v1/metrics", json=CPU_BREACH, headers=auth_headers)
        assert send.await_count == 2  # metric event + alert event
        assert {call.args[0] for call in send.await_args_list} == {str(test_user.id)}


class TestAlertWebhook:

    async def test_no_webhook_unless_configured(self, async_client, auth_headers):
        with patch("app.main.send_webhook_alert") as webhook, \
             patch("app.main.settings.ALERT_WEBHOOK_URL", None):
            response = await async_client.post("/api/v1/metrics", json=CPU_BREACH, headers=auth_headers)
        assert response.json()["alert_triggered"] is True
        webhook.assert_not_called()

    async def test_webhook_uses_configured_url(self, async_client, auth_headers):
        with patch("app.main.send_webhook_alert") as webhook, \
             patch("app.main.settings.ALERT_WEBHOOK_URL", "https://hooks.example.com/alerts"):
            await async_client.post("/api/v1/metrics", json=CPU_BREACH, headers=auth_headers)
        webhook.assert_called_once()
        assert webhook.call_args.kwargs["webhook_url"] == "https://hooks.example.com/alerts"


class TestAlertsSocket:

    def test_rejects_connection_without_token(self):
        client = TestClient(app)
        with pytest.raises(Exception):
            with client.websocket_connect("/ws/alerts"):
                pass

    def test_rejects_invalid_token(self):
        client = TestClient(app)
        with pytest.raises(Exception):
            with client.websocket_connect("/ws/alerts?token=not-a-jwt"):
                pass

    def test_signed_in_user_receives_own_events(self, auth_headers, test_user):
        client = TestClient(app)
        token = auth_headers["Authorization"].split()[1]
        with client.websocket_connect(f"/ws/alerts?token={token}") as ws:
            response = client.post("/api/v1/metrics", json=CPU_PAYLOAD, headers=auth_headers)
            assert response.status_code == 201
            event = ws.receive_json()
        assert event["event"] == "METRIC_RECORDED"
        assert event["sensor_id"] == "sensor_a"

    async def test_manager_sends_only_to_owner(self):
        class FakeSocket:
            def __init__(self):
                self.sent = []

            async def accept(self):
                pass

            async def send_json(self, message):
                self.sent.append(message)

        mgr = ConnectionManager()
        alice, bob = FakeSocket(), FakeSocket()
        await mgr.connect(alice, "alice")
        await mgr.connect(bob, "bob")

        await mgr.send_to_user("alice", {"event": "METRIC_RECORDED"})

        assert alice.sent == [{"event": "METRIC_RECORDED"}]
        assert bob.sent == []
        assert len(mgr.active_connections) == 2

        mgr.disconnect(alice, "alice")
        assert mgr.active_connections == [bob]
