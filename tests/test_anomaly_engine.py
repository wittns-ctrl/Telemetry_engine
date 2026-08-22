"""
Test suite for Anomaly Engine and Alert Service.

This module tests the anomaly detection engine, debouncing logic,
auto-resolution, and alert query operations with tenant isolation.
"""

import pytest
import asyncio
from datetime import datetime, timezone, timedelta
from beanie import PydanticObjectId

from app.services.anomaly_engine import AnomalyEngine, BreachState, DeviceState
from app.services.alert_service import AlertService
from app.models.alert import AnomalyAlertDocument, AlertSeverity
from app.models.telemetry import TelemetrySnapshot, CPUMetrics, GPUMetrics, RAMMetrics, PowerAndVRMMetrics, StorageMetrics
from app.models.user import User, UserRole
from app.core.security import get_password_hash
from app.db.session import init_db


@pytest.fixture
async def setup_db():
    """Initialize database for tests."""
    await init_db()
    yield


@pytest.fixture
async def test_user(setup_db):
    """Create a test user for anomaly engine tests."""
    # Clean up any existing test user
    existing_user = await User.find_one(User.email == "anomaly_test@example.com")
    if existing_user:
        await existing_user.delete()
    
    user = User(
        email="anomaly_test@example.com",
        normalized_email="anomaly_test@example.com",
        full_name="Anomaly Test User",
        hashed_password=get_password_hash("TestPassword123"),
        email_verified=True,
        role=UserRole.USER,
        auth_providers=["password"]
    )
    await user.insert()
    yield user
    await user.delete()


class TestAnomalyEngine:
    """Test suite for AnomalyEngine class."""
    
    @pytest.mark.asyncio
    async def test_engine_initialization(self):
        """Test that the anomaly engine initializes correctly."""
        engine = AnomalyEngine()
        assert engine._enabled == True
        assert engine._debounce_enabled == True
        assert engine._auto_resolution == True
        assert len(engine._device_states) == 0
    
    @pytest.mark.asyncio
    async def test_evaluate_snapshot_no_breaches(self, test_user):
        """Test evaluation with no metric breaches."""
        engine = AnomalyEngine()
        
        # Create a normal snapshot
        snapshot = TelemetrySnapshot(
            timestamp=datetime.now(timezone.utc),
            sensor_id="test_sensor",
            cpu=CPUMetrics(utilization_percent=50.0, core_temperature_c=45.0),
            gpu=GPUMetrics(utilization_percent=30.0, core_temperature_c=40.0),
            storage=[],
            ram=RAMMetrics(usage_percent=60.0, used_gb=8.0, total_gb=16.0),
            power_vrm=PowerAndVRMMetrics(vrm_temperature_c=50.0, psu_12v_voltage=12.0),
            collection_duration_ms=100.0
        )
        
        user_id = str(test_user.id)
        device_id = str(PydanticObjectId())
        
        alerts = await engine.evaluate_snapshot(user_id, device_id, snapshot)
        
        assert len(alerts) == 0  # No alerts should be triggered
    
    @pytest.mark.asyncio
    async def test_cpu_overheating_critical(self, test_user):
        """Test CPU critical overheating detection."""
        engine = AnomalyEngine()
        
        # Create a snapshot with critical CPU temperature
        snapshot = TelemetrySnapshot(
            timestamp=datetime.now(timezone.utc),
            sensor_id="test_sensor",
            cpu=CPUMetrics(utilization_percent=50.0, core_temperature_c=95.0),
            gpu=GPUMetrics(utilization_percent=30.0, core_temperature_c=40.0),
            storage=[],
            ram=RAMMetrics(usage_percent=60.0, used_gb=8.0, total_gb=16.0),
            power_vrm=PowerAndVRMMetrics(vrm_temperature_c=50.0, psu_12v_voltage=12.0),
            collection_duration_ms=100.0
        )
        
        user_id = str(test_user.id)
        device_id = str(PydanticObjectId())
        
        # First evaluation - should not trigger due to debouncing
        alerts = await engine.evaluate_snapshot(user_id, device_id, snapshot)
        assert len(alerts) == 0
        
        # Simulate time passing by updating timestamp
        snapshot.timestamp = datetime.now(timezone.utc) + timedelta(seconds=35)
        
        # Second evaluation - should trigger after duration threshold
        alerts = await engine.evaluate_snapshot(user_id, device_id, snapshot)
        assert len(alerts) > 0
        
        # Check that the alert is for CPU overheating
        cpu_alerts = [a for a in alerts if "CPU" in a.rule_name]
        assert len(cpu_alerts) > 0
        
        # Cleanup
        for alert in alerts:
            await alert.delete()
    
    @pytest.mark.asyncio
    async def test_psu_voltage_critical(self, test_user):
        """Test PSU voltage critical detection."""
        engine = AnomalyEngine()
        
        # Create a snapshot with low PSU voltage
        snapshot = TelemetrySnapshot(
            timestamp=datetime.now(timezone.utc),
            sensor_id="test_sensor",
            cpu=CPUMetrics(utilization_percent=50.0, core_temperature_c=45.0),
            gpu=GPUMetrics(utilization_percent=30.0, core_temperature_c=40.0),
            storage=[],
            ram=RAMMetrics(usage_percent=60.0, used_gb=8.0, total_gb=16.0),
            power_vrm=PowerAndVRMMetrics(vrm_temperature_c=50.0, psu_12v_voltage=11.2),
            collection_duration_ms=100.0
        )
        
        user_id = str(test_user.id)
        device_id = str(PydanticObjectId())
        
        # Voltage issues have short duration threshold (5 seconds)
        alerts = await engine.evaluate_snapshot(user_id, device_id, snapshot)
        assert len(alerts) == 0  # Debouncing
        
        # Simulate time passing
        snapshot.timestamp = datetime.now(timezone.utc) + timedelta(seconds=6)
        
        alerts = await engine.evaluate_snapshot(user_id, device_id, snapshot)
        assert len(alerts) > 0
        
        # Check for PSU voltage alert
        psu_alerts = [a for a in alerts if "PSU" in a.rule_name]
        assert len(psu_alerts) > 0
        
        # Cleanup
        for alert in alerts:
            await alert.delete()
    
    @pytest.mark.asyncio
    async def test_auto_resolution(self, test_user):
        """Test auto-resolution of alerts when conditions normalize."""
        # Disable debouncing for this test to simplify timing
        engine = AnomalyEngine()
        engine._debounce_enabled = False
        engine._auto_resolution = False  # Disable auto-resolution initially
        
        user_id = str(test_user.id)
        device_id = str(PydanticObjectId())
        
        # Create a snapshot with critical CPU temperature
        snapshot = TelemetrySnapshot(
            timestamp=datetime.now(timezone.utc),
            sensor_id="test_sensor",
            cpu=CPUMetrics(utilization_percent=50.0, core_temperature_c=95.0),
            gpu=GPUMetrics(utilization_percent=30.0, core_temperature_c=40.0),
            storage=[],
            ram=RAMMetrics(usage_percent=60.0, used_gb=8.0, total_gb=16.0),
            power_vrm=PowerAndVRMMetrics(vrm_temperature_c=50.0, psu_12v_voltage=12.0),
            collection_duration_ms=100.0
        )
        
        # Trigger alert (debouncing disabled)
        alerts = await engine.evaluate_snapshot(user_id, device_id, snapshot)
        assert len(alerts) > 0
        
        alert_id = alerts[0].id
        assert alerts[0].is_active == True
        
        # Now enable auto-resolution and normalize conditions
        engine._auto_resolution = True
        snapshot.cpu.core_temperature_c = 45.0
        
        # Wait for resolution threshold
        await asyncio.sleep(17)  # Wait past 15s resolution threshold
        
        # Evaluate with normal conditions
        updated_alerts = await engine.evaluate_snapshot(user_id, device_id, snapshot)
        
        # Check if alert was auto-resolved
        resolved_alert = await AnomalyAlertDocument.get(alert_id)
        if resolved_alert:
            assert resolved_alert.is_active == False
            assert resolved_alert.resolved_at is not None
        
        # Cleanup
        for alert in alerts:
            await alert.delete()
        if resolved_alert:
            await resolved_alert.delete()
    
    @pytest.mark.asyncio
    async def test_device_state_tracking(self, test_user):
        """Test device state tracking across evaluations."""
        engine = AnomalyEngine()
        
        user_id = str(test_user.id)
        device_id = str(PydanticObjectId())
        
        # Evaluate a snapshot
        snapshot = TelemetrySnapshot(
            timestamp=datetime.now(timezone.utc),
            sensor_id="test_sensor",
            cpu=CPUMetrics(utilization_percent=50.0, core_temperature_c=45.0),
            gpu=GPUMetrics(utilization_percent=30.0, core_temperature_c=40.0),
            storage=[],
            ram=RAMMetrics(usage_percent=60.0, used_gb=8.0, total_gb=16.0),
            power_vrm=PowerAndVRMMetrics(vrm_temperature_c=50.0, psu_12v_voltage=12.0),
            collection_duration_ms=100.0
        )
        
        await engine.evaluate_snapshot(user_id, device_id, snapshot)
        
        # Check that device state was created
        device_state = await engine.get_device_state(user_id, device_id)
        assert device_state is not None
        assert device_state.user_id == user_id
        assert device_state.device_id == device_id
        
        # Clear state
        await engine.clear_device_state(user_id, device_id)
        
        # Verify state was cleared
        device_state = await engine.get_device_state(user_id, device_id)
        assert device_state is None


class TestAlertService:
    """Test suite for AlertService class."""
    
    @pytest.mark.asyncio
    async def test_get_active_alerts_empty(self, test_user):
        """Test retrieving active alerts when none exist."""
        alerts = await AlertService.get_active_alerts(str(test_user.id))
        assert len(alerts) == 0
    
    @pytest.mark.asyncio
    async def test_create_and_retrieve_alert(self, test_user):
        """Test creating and retrieving an alert."""
        user_oid = test_user.id
        device_oid = PydanticObjectId()
        
        alert = AnomalyAlertDocument(
            user_id=user_oid,
            device_id=device_oid,
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
        
        # Retrieve active alerts
        alerts = await AlertService.get_active_alerts(str(test_user.id))
        assert len(alerts) == 1
        assert alerts[0].rule_name == "TEST_RULE"
        
        # Cleanup
        await alert.delete()
    
    @pytest.mark.asyncio
    async def test_get_alert_by_id(self, test_user):
        """Test retrieving a specific alert by ID."""
        user_oid = test_user.id
        device_oid = PydanticObjectId()
        
        alert = AnomalyAlertDocument(
            user_id=user_oid,
            device_id=device_oid,
            rule_name="TEST_RULE_ID",
            severity=AlertSeverity.INFO,
            metric_name="test_metric",
            trigger_value=100.0,
            threshold_limit=90.0,
            message="Test alert message",
            is_active=True,
            created_at=datetime.now(timezone.utc)
        )
        
        await alert.insert()
        
        # Retrieve by ID
        retrieved_alert = await AlertService.get_alert_by_id(str(alert.id), str(test_user.id))
        assert retrieved_alert is not None
        assert retrieved_alert.rule_name == "TEST_RULE_ID"
        
        # Cleanup
        await alert.delete()
    
    @pytest.mark.asyncio
    async def test_manually_resolve_alert(self, test_user):
        """Test manually resolving an alert."""
        user_oid = test_user.id
        device_oid = PydanticObjectId()
        
        alert = AnomalyAlertDocument(
            user_id=user_oid,
            device_id=device_oid,
            rule_name="TEST_RESOLVE",
            severity=AlertSeverity.WARNING,
            metric_name="test_metric",
            trigger_value=100.0,
            threshold_limit=90.0,
            message="Test alert message",
            is_active=True,
            created_at=datetime.now(timezone.utc)
        )
        
        await alert.insert()
        
        # Manually resolve
        result = await AlertService.manually_resolve_alert(str(alert.id), str(test_user.id))
        assert result == True
        
        # Verify resolution
        updated_alert = await AnomalyAlertDocument.get(alert.id)
        assert updated_alert.is_active == False
        assert updated_alert.resolved_at is not None
        
        # Cleanup
        await alert.delete()
    
    @pytest.mark.asyncio
    async def test_tenant_isolation(self, test_user):
        """Test that tenant isolation prevents cross-user alert access."""
        # Create another user
        other_user = User(
            email="other_anomaly_test@example.com",
            normalized_email="other_anomaly_test@example.com",
            full_name="Other Anomaly Test User",
            hashed_password=get_password_hash("TestPassword123"),
            email_verified=True,
            role=UserRole.USER,
            auth_providers=["password"]
        )
        await other_user.insert()
        
        # Create alert for test_user
        user_oid = test_user.id
        device_oid = PydanticObjectId()
        
        alert = AnomalyAlertDocument(
            user_id=user_oid,
            device_id=device_oid,
            rule_name="TEST_ISOLATION",
            severity=AlertSeverity.WARNING,
            metric_name="test_metric",
            trigger_value=100.0,
            threshold_limit=90.0,
            message="Test alert message",
            is_active=True,
            created_at=datetime.now(timezone.utc)
        )
        
        await alert.insert()
        
        # Try to retrieve with other_user (should return None)
        retrieved_alert = await AlertService.get_alert_by_id(str(alert.id), str(other_user.id))
        assert retrieved_alert is None
        
        # Cleanup
        await alert.delete()
        await other_user.delete()
    
    @pytest.mark.asyncio
    async def test_alert_statistics(self, test_user):
        """Test calculating alert statistics."""
        user_oid = test_user.id
        device_oid = PydanticObjectId()
        
        # Create multiple alerts
        alerts_to_create = [
            (AlertSeverity.CRITICAL, "RULE_1"),
            (AlertSeverity.WARNING, "RULE_2"),
            (AlertSeverity.INFO, "RULE_3"),
            (AlertSeverity.WARNING, "RULE_2"),  # Duplicate rule
        ]
        
        created_alerts = []
        for severity, rule_name in alerts_to_create:
            alert = AnomalyAlertDocument(
                user_id=user_oid,
                device_id=device_oid,
                rule_name=rule_name,
                severity=severity,
                metric_name="test_metric",
                trigger_value=100.0,
                threshold_limit=90.0,
                message="Test alert message",
                is_active=True,
                created_at=datetime.now(timezone.utc)
            )
            await alert.insert()
            created_alerts.append(alert)
        
        # Get statistics
        stats = await AlertService.get_alert_statistics(str(test_user.id), days=1)
        
        assert stats["total_alerts"] == 4
        assert stats["active_alerts"] == 4
        assert stats["critical_count"] == 1
        assert stats["warning_count"] == 2
        assert stats["info_count"] == 1
        assert stats["rule_counts"]["RULE_2"] == 2
        
        # Cleanup
        for alert in created_alerts:
            await alert.delete()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
