"""
Test suite for REST API Endpoints

This module tests the REST API endpoints for devices, metrics, alerts,
and diagnostics with proper authentication and tenant isolation.

Author: Lectio Backend Team
Version: 6.0.0
"""

import pytest
from datetime import datetime, timezone, timedelta
from beanie import PydanticObjectId
from httpx import AsyncClient, ASGITransport

from app.models.user import User, UserRole
from app.models.telemetry import Device, TelemetrySnapshot, TelemetrySnapshotDocument
from app.models.alert import AnomalyAlertDocument, AlertSeverity
from app.core.security import get_password_hash, create_access_token
from app.main import app


@pytest.fixture
async def test_user(mock_mongo_client):
    """Create a test user for API tests."""
    # Clean up any existing test user
    existing_user = await User.find_one(User.email == "api_test@example.com")
    if existing_user:
        await existing_user.delete()
    
    user = User(
        email="api_test@example.com",
        normalized_email="api_test@example.com",
        full_name="API Test User",
        hashed_password=get_password_hash("TestPassword123"),
        email_verified=True,
        role=UserRole.USER,
        auth_providers=["password"]
    )
    await user.insert()
    yield user
    await user.delete()


@pytest.fixture
def auth_headers(test_user):
    """Create authentication headers for test requests."""
    token = create_access_token(
        data={"sub": str(test_user.id), "type": "access"},
        expires_delta=timedelta(minutes=15)
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def async_client():
    """Create an async HTTP client for testing."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


class TestDevicesEndpoints:
    """Test suite for devices API endpoints."""
    
    @pytest.mark.asyncio
    async def test_list_devices_empty(self, test_user, auth_headers, async_client):
        """Test listing devices when none exist."""
        response = await async_client.get("/api/v1/devices", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert "devices" in data
        assert data["total_count"] == 0
        assert data["devices"] == []
    
    @pytest.mark.asyncio
    async def test_list_devices_with_data(self, test_user, auth_headers, async_client):
        """Test listing devices with existing devices."""
        import uuid
        
        # Create a test device
        device = Device(
            user_id=test_user.id,
            device_name="Test Device",
            system_uuid=str(uuid.uuid4()),
            device_type="desktop",
            os_info="Windows 11",
            cpu_info="Intel Core i7-12700K",
            gpu_info="NVIDIA RTX 3080",
            ram_info="32GB DDR4",
            storage_info=["Samsung 980 Pro 1TB"],
            is_active=True
        )
        await device.insert()
        
        try:
            response = await async_client.get("/api/v1/devices", headers=auth_headers)
            
            assert response.status_code == 200
            data = response.json()
            assert data["total_count"] == 1
            assert len(data["devices"]) == 1
            assert data["devices"][0]["device_name"] == "Test Device"
        
        finally:
            await device.delete()
    
    @pytest.mark.asyncio
    async def test_get_device_details(self, test_user, auth_headers, async_client):
        """Test getting device details."""
        import uuid
        
        # Create a test device
        device = Device(
            user_id=test_user.id,
            device_name="Test Device",
            system_uuid=str(uuid.uuid4()),
            device_type="desktop",
            is_active=True
        )
        await device.insert()
        
        try:
            response = await async_client.get(f"/api/v1/devices/{device.id}", headers=auth_headers)
            
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == str(device.id)
            assert data["device_name"] == "Test Device"
        
        finally:
            await device.delete()
    
    @pytest.mark.asyncio
    async def test_get_device_unauthorized(self, test_user, auth_headers, async_client):
        """Test getting device without authentication."""
        import uuid
        
        # Create a test device for another user
        other_user = User(
            email="other_user@example.com",
            normalized_email="other_user@example.com",
            full_name="Other User",
            hashed_password=get_password_hash("TestPassword123"),
            email_verified=True,
            role=UserRole.USER,
            auth_providers=["password"]
        )
        await other_user.insert()
        
        device = Device(
            user_id=other_user.id,
            device_name="Other Device",
            system_uuid=str(uuid.uuid4()),
            device_type="desktop",
            is_active=True
        )
        await device.insert()
        
        try:
            response = await async_client.get(f"/api/v1/devices/{device.id}", headers=auth_headers)
            
            assert response.status_code == 403  # Forbidden
        
        finally:
            await device.delete()
            await other_user.delete()


class TestMetricsEndpoints:
    """Test suite for metrics API endpoints."""
    
    @pytest.mark.asyncio
    async def test_get_historical_metrics_empty(self, test_user, auth_headers, async_client):
        """Test getting historical metrics when none exist."""
        import uuid
        
        # Create a test device
        device = Device(
            user_id=test_user.id,
            device_name="Test Device",
            system_uuid=str(uuid.uuid4()),
            device_type="desktop",
            is_active=True
        )
        await device.insert()
        
        try:
            response = await async_client.get(
                f"/api/v1/metrics/history?device_id={device.id}",
                headers=auth_headers
            )
            
            assert response.status_code == 200
            data = response.json()
            assert "snapshots" in data
            assert data["total_count"] == 0
        
        finally:
            await device.delete()
    
    @pytest.mark.asyncio
    async def test_get_metrics_summary(self, test_user, auth_headers, async_client):
        """Test getting metrics summary."""
        import uuid
        
        # Create a test device
        device = Device(
            user_id=test_user.id,
            device_name="Test Device",
            system_uuid=str(uuid.uuid4()),
            device_type="desktop",
            is_active=True
        )
        await device.insert()
        
        try:
            response = await async_client.get(
                f"/api/v1/metrics/summary?device_id={device.id}",
                headers=auth_headers
            )
            
            assert response.status_code == 200
            data = response.json()
            assert "device_id" in data
            assert data["device_id"] == str(device.id)
        
        finally:
            await device.delete()


class TestAlertsEndpoints:
    """Test suite for alerts API endpoints."""
    
    @pytest.mark.asyncio
    async def test_list_alerts_empty(self, test_user, auth_headers, async_client):
        """Test listing alerts when none exist."""
        response = await async_client.get("/api/v1/alerts", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert "alerts" in data
        assert data["total_count"] == 0
    
    @pytest.mark.asyncio
    async def test_list_alerts_with_data(self, test_user, auth_headers, async_client):
        """Test listing alerts with existing alerts."""
        import uuid
        
        # Create a test device
        device = Device(
            user_id=test_user.id,
            device_name="Test Device",
            system_uuid=str(uuid.uuid4()),
            device_type="desktop",
            is_active=True
        )
        await device.insert()
        
        # Create a test alert
        alert = AnomalyAlertDocument(
            user_id=test_user.id,
            device_id=device.id,
            rule_name="TEST_RULE",
            severity=AlertSeverity.WARNING,
            metric_name="test_metric",
            trigger_value=100.0,
            threshold_limit=90.0,
            message="Test alert message",
            is_active=True,
            created_at=datetime.now(timezone.utc)
        )
        await alert.insert()
        
        try:
            response = await async_client.get("/api/v1/alerts", headers=auth_headers)
            
            assert response.status_code == 200
            data = response.json()
            assert data["total_count"] == 1
            assert len(data["alerts"]) == 1
        
        finally:
            await alert.delete()
            await device.delete()
    
    @pytest.mark.asyncio
    async def test_get_alert_statistics(self, test_user, auth_headers, async_client):
        """Test getting alert statistics."""
        response = await async_client.get("/api/v1/alerts/statistics", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert "total_alerts" in data
        assert "active_alerts" in data
        assert "critical_count" in data


class TestDiagnosticsEndpoints:
    """Test suite for diagnostics API endpoints."""
    
    @pytest.mark.asyncio
    async def test_diagnostics_health_check(self, test_user, auth_headers, async_client):
        """Test diagnostic service health check."""
        response = await async_client.get("/api/v1/diagnostics/health")
        
        assert response.status_code == 200
        data = response.json()
        assert "service" in data
        assert data["service"] == "AI Diagnostic Service"
        assert "llm_integration" in data
        assert "rule_based_fallback" in data
    
    @pytest.mark.asyncio
    async def test_analyze_diagnostic_rule_based(self, test_user, auth_headers, async_client):
        """Test rule-based diagnostic analysis."""
        import uuid
        
        # Create a test device
        device = Device(
            user_id=test_user.id,
            device_name="Test Device",
            system_uuid=str(uuid.uuid4()),
            device_type="desktop",
            is_active=True
        )
        await device.insert()
        
        # Create a test alert
        alert = AnomalyAlertDocument(
            user_id=test_user.id,
            device_id=device.id,
            rule_name="CPU_OVERHEATING_CRITICAL",
            severity=AlertSeverity.CRITICAL,
            metric_name="cpu_core_temperature_c",
            trigger_value=95.0,
            threshold_limit=90.0,
            message="CPU core temperature critical: 95.0°C exceeds threshold 90.0°C",
            is_active=True,
            created_at=datetime.now(timezone.utc)
        )
        await alert.insert()
        
        try:
            response = await async_client.post(
                "/api/v1/diagnostics/analyze",
                headers=auth_headers,
                json={
                    "alert_id": str(alert.id),
                    "device_id": str(device.id)
                }
            )
            
            assert response.status_code == 200
            data = response.json()
            assert data["success"] == True
            assert "report" in data
            assert data["report"]["analysis_method"] == "rule_based"
            assert "root_cause_analysis" in data["report"]
            assert "urgency_level" in data["report"]
            assert "actionable_steps" in data["report"]
        
        finally:
            await alert.delete()
            await device.delete()


class TestAuthentication:
    """Test suite for authentication across endpoints."""
    
    @pytest.mark.asyncio
    async def test_unauthorized_access(self, test_user, auth_headers, async_client):
        """Test that unauthorized access is rejected."""
        
        # Test without authentication
        response = await async_client.get("/api/v1/devices")
        assert response.status_code == 401
        
        response = await async_client.get("/api/v1/alerts")
        assert response.status_code == 401
        
        response = await async_client.get("/api/v1/metrics/history?device_id=test")
        assert response.status_code == 401


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
