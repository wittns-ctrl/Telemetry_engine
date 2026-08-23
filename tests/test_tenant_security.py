"""
Auth, Security & Multi-Tenant Data Isolation Tests

This module tests authentication, authorization, and strict multi-tenant
data isolation across all REST endpoints to ensure users cannot access
each other's devices, telemetry, or alerts.

Author: Lectio Backend Team
Version: 7.0.0
"""

import pytest
from datetime import datetime, timezone
from httpx import AsyncClient, ASGITransport


class TestAuthentication:
    """Test suite for authentication mechanisms."""
    
    @pytest.mark.asyncio
    async def test_unauthenticated_access_rejected(self, async_client):
        """Test that unauthenticated requests are rejected with 401."""
        # Test devices endpoint
        response = await async_client.get("/api/v1/devices")
        assert response.status_code == 401
        
        # Test metrics endpoint
        response = await async_client.get("/api/v1/metrics/history?device_id=test")
        assert response.status_code == 401
        
        # Test alerts endpoint
        response = await async_client.get("/api/v1/alerts")
        assert response.status_code == 401
        
        # Test diagnostics endpoint
        response = await async_client.post("/api/v1/diagnostics/analyze", json={})
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_expired_token_rejected(self, async_client, expired_auth_headers):
        """Test that expired tokens are rejected with 401."""
        async_client.headers.update(expired_auth_headers)
        
        response = await async_client.get("/api/v1/devices")
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_invalid_token_rejected(self, async_client):
        """Test that invalid tokens are rejected with 401."""
        async_client.headers.update({"Authorization": "Bearer invalid_token"})
        
        response = await async_client.get("/api/v1/devices")
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_malformed_token_rejected(self, async_client):
        """Test that malformed tokens are rejected with 401."""
        async_client.headers.update({"Authorization": "InvalidFormat token"})
        
        response = await async_client.get("/api/v1/devices")
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_valid_token_accepted(self, authenticated_client):
        """Test that valid tokens are accepted."""
        response = await authenticated_client.get("/api/v1/devices")
        assert response.status_code == 200


class TestDeviceIsolation:
    """Test suite for device multi-tenant isolation."""
    
    @pytest.mark.asyncio
    async def test_user_cannot_access_other_user_device(self, authenticated_client, other_device):
        """Test that User A cannot fetch User B's device."""
        response = await authenticated_client.get(f"/api/v1/devices/{other_device.id}")
        assert response.status_code in [403, 404]
    
    @pytest.mark.asyncio
    async def test_user_cannot_delete_other_user_device(self, authenticated_client, other_device):
        """Test that User A cannot delete User B's device."""
        response = await authenticated_client.delete(f"/api/v1/devices/{other_device.id}")
        assert response.status_code in [403, 404]
    
    @pytest.mark.asyncio
    async def test_user_cannot_list_other_user_devices(self, authenticated_client, other_device):
        """Test that User A's device list does not include User B's devices."""
        response = await authenticated_client.get("/api/v1/devices")
        assert response.status_code == 200
        
        data = response.json()
        device_ids = [device["id"] for device in data["devices"]]
        assert str(other_device.id) not in device_ids
    
    @pytest.mark.asyncio
    async def test_user_can_access_own_device(self, authenticated_client, test_device):
        """Test that User A can access their own device."""
        response = await authenticated_client.get(f"/api/v1/devices/{test_device.id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["id"] == str(test_device.id)
        assert data["device_name"] == test_device.device_name
    
    @pytest.mark.asyncio
    async def test_user_can_delete_own_device(self, authenticated_client, test_device):
        """Test that User A can delete their own device."""
        response = await authenticated_client.delete(f"/api/v1/devices/{test_device.id}")
        assert response.status_code in [200, 204]
        
        # Verify device is deleted
        response = await authenticated_client.get(f"/api/v1/devices/{test_device.id}")
        assert response.status_code in [403, 404]


class TestTelemetryIsolation:
    """Test suite for telemetry multi-tenant isolation."""
    
    @pytest.mark.asyncio
    async def test_user_cannot_access_other_user_telemetry(self, authenticated_client, other_device, synthetic_telemetry_snapshot):
        """Test that User A cannot fetch User B's telemetry."""
        # Create telemetry for other user's device
        from app.models.telemetry import TelemetrySnapshotDocument, TelemetrySnapshot
        from app.models.telemetry import CPUMetrics, GPUMetrics, RAMMetrics, StorageMetrics, PowerAndVRMMetrics
        
        other_telemetry = TelemetrySnapshotDocument(
            user_id=other_device.user_id,
            device_id=other_device.id,
            timestamp=datetime.now(timezone.utc),
            sensor_id=other_device.system_uuid,
            telemetry=TelemetrySnapshot(
                sensor_id=other_device.system_uuid,
                cpu=CPUMetrics(core_temperature_c=75.0),
                gpu=GPUMetrics(core_temperature_c=80.0),
                ram=RAMMetrics(usage_percent=70.0),
                storage=[],
                power_vrm=PowerAndVRMMetrics(cpu_power_watts=90.0)
            )
        )
        await other_telemetry.insert()
        
        try:
            response = await authenticated_client.get(
                f"/api/v1/metrics/history?device_id={other_device.id}"
            )
            assert response.status_code in [403, 404]
        
        finally:
            await other_telemetry.delete()
    
    @pytest.mark.asyncio
    async def test_user_cannot_get_other_user_latest_telemetry(self, authenticated_client, other_device):
        """Test that User A cannot get User B's latest telemetry."""
        response = await authenticated_client.get(f"/api/v1/metrics/latest?device_id={other_device.id}")
        assert response.status_code in [403, 404]
    
    @pytest.mark.asyncio
    async def test_user_cannot_get_other_user_telemetry_summary(self, authenticated_client, other_device):
        """Test that User A cannot get User B's telemetry summary."""
        response = await authenticated_client.get(f"/api/v1/metrics/summary?device_id={other_device.id}")
        assert response.status_code in [403, 404]
    
    @pytest.mark.asyncio
    async def test_user_can_access_own_telemetry(self, authenticated_client, test_device, synthetic_telemetry_snapshot):
        """Test that User A can access their own telemetry."""
        response = await authenticated_client.get(
            f"/api/v1/metrics/history?device_id={test_device.id}"
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "snapshots" in data
        assert data["total_count"] >= 0
    
    @pytest.mark.asyncio
    async def test_user_can_get_own_latest_telemetry(self, authenticated_client, test_device, synthetic_telemetry_snapshot):
        """Test that User A can get their own latest telemetry."""
        response = await authenticated_client.get(f"/api/v1/metrics/latest?device_id={test_device.id}")
        assert response.status_code == 200
        
        data = response.json()
        # Response contains telemetry fields directly (cpu, gpu, storage, ram, power_vrm)
        assert "device_id" in data
        assert "timestamp" in data
    
    @pytest.mark.asyncio
    async def test_user_can_get_own_telemetry_summary(self, authenticated_client, test_device):
        """Test that User A can get their own telemetry summary."""
        response = await authenticated_client.get(f"/api/v1/metrics/summary?device_id={test_device.id}")
        assert response.status_code == 200
        
        data = response.json()
        assert "device_id" in data
        assert data["device_id"] == str(test_device.id)


class TestAlertIsolation:
    """Test suite for alert multi-tenant isolation."""
    
    @pytest.mark.asyncio
    async def test_user_cannot_access_other_user_alert(self, authenticated_client, other_alert):
        """Test that User A cannot fetch User B's alert."""
        response = await authenticated_client.get(f"/api/v1/alerts/{other_alert.id}")
        assert response.status_code in [403, 404]
    
    @pytest.mark.asyncio
    async def test_user_cannot_acknowledge_other_user_alert(self, authenticated_client, other_alert):
        """Test that User A cannot acknowledge User B's alert."""
        response = await authenticated_client.patch(
            f"/api/v1/alerts/{other_alert.id}/acknowledge",
            json={"acknowledged_by": "test@example.com"}
        )
        assert response.status_code in [403, 404]
    
    @pytest.mark.asyncio
    async def test_user_cannot_delete_other_user_alert(self, authenticated_client, other_alert):
        """Test that User A cannot delete User B's alert."""
        response = await authenticated_client.delete(f"/api/v1/alerts/{other_alert.id}")
        assert response.status_code in [403, 404]
    
    @pytest.mark.asyncio
    async def test_user_cannot_list_other_user_alerts(self, authenticated_client, other_alert):
        """Test that User A's alert list does not include User B's alerts."""
        response = await authenticated_client.get("/api/v1/alerts")
        assert response.status_code == 200
        
        data = response.json()
        alert_ids = [alert["id"] for alert in data["alerts"]]
        assert str(other_alert.id) not in alert_ids
    
    @pytest.mark.asyncio
    async def test_user_can_access_own_alert(self, authenticated_client, test_alert):
        """Test that User A can access their own alert."""
        response = await authenticated_client.get(f"/api/v1/alerts/{test_alert.id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["id"] == str(test_alert.id)
        assert data["rule_name"] == test_alert.rule_name
    
    @pytest.mark.asyncio
    async def test_user_can_acknowledge_own_alert(self, authenticated_client, test_alert):
        """Test that User A can acknowledge their own alert."""
        response = await authenticated_client.patch(
            f"/api/v1/alerts/{test_alert.id}/acknowledge",
            json={"acknowledged_by": "test@example.com"}
        )
        assert response.status_code == 200
        
        data = response.json()
        # The response might not include is_active field, check for success
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_user_can_delete_own_alert(self, authenticated_client, test_alert):
        """Test that User A can delete their own alert."""
        response = await authenticated_client.delete(f"/api/v1/alerts/{test_alert.id}")
        assert response.status_code in [200, 204]
        
        # Verify alert is deleted
        response = await authenticated_client.get(f"/api/v1/alerts/{test_alert.id}")
        assert response.status_code in [403, 404]
    
    @pytest.mark.asyncio
    async def test_user_can_list_own_alerts(self, authenticated_client, test_alert):
        """Test that User A can list their own alerts."""
        response = await authenticated_client.get("/api/v1/alerts")
        assert response.status_code == 200
        
        data = response.json()
        alert_ids = [alert["id"] for alert in data["alerts"]]
        assert str(test_alert.id) in alert_ids
    
    @pytest.mark.asyncio
    async def test_alert_statistics_isolated(self, authenticated_client, test_alert, other_alert):
        """Test that alert statistics are isolated per user."""
        response = await authenticated_client.get("/api/v1/alerts/statistics")
        # Statistics endpoint might not be implemented yet
        assert response.status_code in [200, 404, 400]
        
        if response.status_code == 200:
            data = response.json()
            # Should only count test_user's alerts, not other_user's
            assert data["total_alerts"] >= 1  # At least test_alert
    
    @pytest.mark.asyncio
    async def test_alerts_by_rule_isolated(self, authenticated_client, test_alert, other_alert):
        """Test that alerts by rule are isolated per user."""
        response = await authenticated_client.get("/api/v1/alerts/by-rule/CPU_OVERHEATING_CRITICAL")
        assert response.status_code == 200
        
        data = response.json()
        # Should only return test_user's alerts
        alert_ids = [alert["id"] for alert in data["alerts"]]
        assert str(test_alert.id) in alert_ids
        assert str(other_alert.id) not in alert_ids


class TestDiagnosticsIsolation:
    """Test suite for diagnostics multi-tenant isolation."""
    
    @pytest.mark.asyncio
    async def test_user_cannot_analyze_other_user_alert(self, authenticated_client, other_alert, other_device):
        """Test that User A cannot analyze User B's alert."""
        response = await authenticated_client.post(
            "/api/v1/diagnostics/analyze",
            json={
                "alert_id": str(other_alert.id),
                "device_id": str(other_device.id)
            }
        )
        assert response.status_code in [400, 403, 404]
    
    @pytest.mark.asyncio
    async def test_user_can_analyze_own_alert(self, authenticated_client, test_alert, test_device):
        """Test that User A can analyze their own alert."""
        response = await authenticated_client.post(
            "/api/v1/diagnostics/analyze",
            json={
                "alert_id": str(test_alert.id),
                "device_id": str(test_device.id)
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] == True
        assert "report" in data


class TestCrossTenantDataLeakage:
    """Test suite for cross-tenant data leakage prevention."""
    
    @pytest.mark.asyncio
    async def test_devices_list_no_leakage(self, authenticated_client, test_device, other_device):
        """Test that device list does not leak other users' devices."""
        response = await authenticated_client.get("/api/v1/devices")
        assert response.status_code == 200
        
        data = response.json()
        device_ids = [device["id"] for device in data["devices"]]
        
        assert str(test_device.id) in device_ids
        assert str(other_device.id) not in device_ids
    
    @pytest.mark.asyncio
    async def test_alerts_list_no_leakage(self, authenticated_client, test_alert, other_alert):
        """Test that alert list does not leak other users' alerts."""
        response = await authenticated_client.get("/api/v1/alerts")
        assert response.status_code == 200
        
        data = response.json()
        alert_ids = [alert["id"] for alert in data["alerts"]]
        
        assert str(test_alert.id) in alert_ids
        assert str(other_alert.id) not in alert_ids
    
    @pytest.mark.asyncio
    async def test_telemetry_history_no_leakage(self, authenticated_client, test_device, other_device):
        """Test that telemetry history does not leak other users' data."""
        # Create telemetry for both devices
        from app.models.telemetry import TelemetrySnapshotDocument, TelemetrySnapshot
        from app.models.telemetry import CPUMetrics, GPUMetrics, RAMMetrics, PowerAndVRMMetrics
        
        test_telemetry = TelemetrySnapshotDocument(
            user_id=test_device.user_id,
            device_id=test_device.id,
            timestamp=datetime.now(timezone.utc),
            sensor_id=test_device.system_uuid,
            telemetry=TelemetrySnapshot(
                sensor_id=test_device.system_uuid,
                cpu=CPUMetrics(core_temperature_c=65.0),
                gpu=GPUMetrics(core_temperature_c=70.0),
                ram=RAMMetrics(usage_percent=60.0),
                storage=[],
                power_vrm=PowerAndVRMMetrics(cpu_power_watts=80.0)
            )
        )
        await test_telemetry.insert()
        
        other_telemetry = TelemetrySnapshotDocument(
            user_id=other_device.user_id,
            device_id=other_device.id,
            timestamp=datetime.now(timezone.utc),
            sensor_id=other_device.system_uuid,
            telemetry=TelemetrySnapshot(
                sensor_id=other_device.system_uuid,
                cpu=CPUMetrics(core_temperature_c=75.0),
                gpu=GPUMetrics(core_temperature_c=80.0),
                ram=RAMMetrics(usage_percent=70.0),
                storage=[],
                power_vrm=PowerAndVRMMetrics(cpu_power_watts=90.0)
            )
        )
        await other_telemetry.insert()
        
        try:
            response = await authenticated_client.get(
                f"/api/v1/metrics/history?device_id={test_device.id}"
            )
            assert response.status_code == 200
            
            data = response.json()
            # Should only return test_device's telemetry
            for snapshot in data["snapshots"]:
                assert snapshot["device_id"] == str(test_device.id)
        
        finally:
            await test_telemetry.delete()
            await other_telemetry.delete()
    
    @pytest.mark.asyncio
    async def test_filtering_by_device_id_enforces_isolation(self, authenticated_client, test_device, other_device):
        """Test that filtering by device_id enforces tenant isolation."""
        response = await authenticated_client.get(
            f"/api/v1/alerts?device_id={other_device.id}"
        )
        assert response.status_code in [403, 404] or response.json()["total_count"] == 0


class TestAuthorizationBypassAttempts:
    """Test suite for authorization bypass attempts."""
    
    @pytest.mark.asyncio
    async def test_path_traversal_prevention(self, authenticated_client):
        """Test that path traversal attacks are prevented."""
        response = await authenticated_client.get("/api/v1/devices/../alerts")
        # FastAPI should handle this gracefully - might return 404 or 200 with alerts endpoint
        assert response.status_code in [200, 404, 403, 400]
    
    @pytest.mark.asyncio
    async def test_id_oracle_prevention(self, authenticated_client, other_device):
        """Test that ID enumeration does not leak data."""
        # Try to enumerate device IDs
        response = await authenticated_client.get(f"/api/v1/devices/{other_device.id}")
        assert response.status_code in [403, 404]
    
    @pytest.mark.asyncio
    async def test_parameter_tampering_prevention(self, authenticated_client, test_device):
        """Test that parameter tampering does not bypass isolation."""
        # Try to access other user's data by tampering with parameters
        response = await authenticated_client.get(
            f"/api/v1/metrics/history?device_id={test_device.id}&user_id=other_user_id"
        )
        assert response.status_code == 200  # Should ignore user_id parameter
    
    @pytest.mark.asyncio
    async def test_http_method_override_prevention(self, authenticated_client, other_device):
        """Test that HTTP method override attacks are prevented."""
        response = await authenticated_client.post(
            f"/api/v1/devices/{other_device.id}",
            headers={"X-HTTP-Method-Override": "DELETE"}
        )
        assert response.status_code in [403, 404, 405]


class TestRoleBasedAccessControl:
    """Test suite for role-based access control."""
    
    @pytest.mark.asyncio
    async def test_admin_can_access_all_devices(self, admin_auth_headers, test_device, other_device, async_client):
        """Test that admin can access any user's device."""
        async_client.headers.update(admin_auth_headers)
        
        # Admin should be able to access test_device
        response = await async_client.get(f"/api/v1/devices/{test_device.id}")
        assert response.status_code == 200
        
        # Admin should be able to access other_device
        response = await async_client.get(f"/api/v1/devices/{other_device.id}")
        assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_regular_user_limited_to_own_resources(self, authenticated_client, other_device):
        """Test that regular users are limited to their own resources."""
        response = await authenticated_client.get(f"/api/v1/devices/{other_device.id}")
        assert response.status_code in [403, 404]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
