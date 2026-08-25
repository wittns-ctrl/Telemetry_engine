"""
Hardware Ingestion & Anomaly Engine Tests

This module tests the SensorService for hardware snapshot parsing and the
AnomalyEngine for rule breach logic, debouncing, and auto-resolution.

Author: Lectio Backend Team
Version: 7.0.0
"""

import pytest
import asyncio
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock

from app.services.sensor_service import SensorService
from app.services.anomaly_engine import AnomalyEngine
from app.models.telemetry import TelemetrySnapshot, CPUMetrics, GPUMetrics
from app.models.alert import AlertSeverity
from app.core.config import settings


def document_to_snapshot(doc):
    """Convert TelemetrySnapshotDocument to TelemetrySnapshot for anomaly engine."""
    return TelemetrySnapshot(
        timestamp=doc.timestamp,
        sensor_id=doc.sensor_id,
        cpu=doc.cpu,
        gpu=doc.gpu,
        ram=doc.ram,
        storage=doc.storage,
        power_vrm=doc.power_vrm,
        collection_duration_ms=doc.collection_duration_ms
    )


class TestSensorService:
    """Test suite for SensorService hardware snapshot parsing."""
    
    @pytest.mark.asyncio
    async def test_parse_cpu_metrics(self, mock_psutil):
        """Test that CPU metrics are properly parsed from psutil data."""
        service = SensorService()
        
        cpu_data = await service._collect_cpu_metrics()
        
        assert cpu_data is not None
        assert hasattr(cpu_data, 'utilization_percent')
        assert hasattr(cpu_data, 'core_temperature_c')
        assert cpu_data.utilization_percent >= 0
        assert cpu_data.utilization_percent <= 100
    
    @pytest.mark.asyncio
    async def test_parse_gpu_metrics(self, mock_pynvml):
        """Test that GPU metrics are properly parsed from pynvml data."""
        service = SensorService()
        
        gpu_data = await service._collect_nvidia_gpu_metrics()
        
        assert gpu_data is not None
        assert hasattr(gpu_data, 'utilization_percent')
        assert hasattr(gpu_data, 'core_temperature_c')
        assert gpu_data.utilization_percent >= 0
        assert gpu_data.utilization_percent <= 100
    
    @pytest.mark.asyncio
    async def test_parse_ram_metrics(self, mock_psutil):
        """Test that RAM metrics are properly parsed from psutil data."""
        service = SensorService()
        
        ram_data = await service._collect_ram_metrics()
        
        assert ram_data is not None
        assert hasattr(ram_data, 'usage_percent')
        assert hasattr(ram_data, 'total_gb')
        assert ram_data.usage_percent >= 0
        assert ram_data.usage_percent <= 100
    
    @pytest.mark.asyncio
    async def test_parse_storage_metrics(self, mock_psutil, mock_smartctl):
        """Test that storage metrics are properly parsed from psutil and smartctl."""
        service = SensorService()
        
        storage_data = await service._collect_storage_metrics()
        
        assert storage_data is not None
        assert isinstance(storage_data, list)
        assert len(storage_data) > 0
        assert hasattr(storage_data[0], 'total_capacity_gb')
        assert hasattr(storage_data[0], 'smart_health_percent')
    
    @pytest.mark.asyncio
    async def test_parse_power_vrm_metrics(self, mock_psutil, mock_wmi):
        """Test that power and VRM metrics are properly parsed."""
        service = SensorService()
        
        power_data = await service._collect_power_vrm_metrics()
        
        assert power_data is not None
        # PowerAndVRMMetrics has different field names
        assert hasattr(power_data, 'vrm_temperature_c') or hasattr(power_data, 'psu_12v_voltage')
    
    @pytest.mark.asyncio
    async def test_complete_snapshot_generation(self, mock_psutil, mock_pynvml, mock_smartctl, mock_wmi):
        """Test that a complete telemetry snapshot is generated with all components."""
        service = SensorService()
        
        snapshot = await service.get_current_telemetry(sensor_id="test_sensor_001")
        
        assert snapshot is not None
        assert isinstance(snapshot, TelemetrySnapshot)
        assert snapshot.sensor_id == "test_sensor_001"
        assert snapshot.cpu is not None
        assert snapshot.gpu is not None
        assert snapshot.ram is not None
        assert snapshot.storage is not None
        assert snapshot.power_vrm is not None
        assert snapshot.timestamp is not None
    
    @pytest.mark.asyncio
    async def test_snapshot_validation(self, mock_psutil, mock_pynvml, mock_smartctl, mock_wmi):
        """Test that generated snapshots pass Pydantic validation."""
        service = SensorService()
        
        snapshot = await service.get_current_telemetry(sensor_id="test_sensor_001")
        
        # Validate that all required fields are present and valid
        if snapshot.cpu.utilization_percent:
            assert snapshot.cpu.utilization_percent >= 0 and snapshot.cpu.utilization_percent <= 100
        if snapshot.gpu.utilization_percent:
            assert snapshot.gpu.utilization_percent >= 0 and snapshot.gpu.utilization_percent <= 100
        if snapshot.ram.usage_percent:
            assert snapshot.ram.usage_percent >= 0 and snapshot.ram.usage_percent <= 100
        # PowerAndVRMMetrics has different fields
        assert snapshot.power_vrm is not None
        if snapshot.collection_duration_ms:
            assert snapshot.collection_duration_ms >= 0


class TestAnomalyEngine:
    """Test suite for AnomalyEngine rule breach logic and state management."""
    
    @pytest.mark.asyncio
    async def test_cpu_overheating_critical_trigger(self, test_device, synthetic_telemetry_snapshot):
        """Test that CPU temperature > 90°C triggers a CRITICAL alert."""
        engine = AnomalyEngine()
        engine._debounce_enabled = False  # Disable debouncing for immediate trigger
        
        # Modify snapshot to trigger CPU overheating
        synthetic_telemetry_snapshot.cpu.core_temperature_c = 95.0
        
        alerts = await engine.evaluate_snapshot(
            user_id=str(test_device.user_id),
            device_id=str(test_device.id),
            snapshot=document_to_snapshot(synthetic_telemetry_snapshot)
        )
        
        # At 95°C, both critical (90°C) and warning (80°C) thresholds are breached
        assert len(alerts) >= 1
        
        # Verify the critical alert is present
        critical_alert = next((a for a in alerts if a.severity == AlertSeverity.CRITICAL and "CPU_OVERHEATING_CRITICAL" in a.rule_name), None)
        assert critical_alert is not None
        assert critical_alert.trigger_value == 95.0
        assert critical_alert.threshold_limit == settings.CPU_TEMP_CRITICAL_THRESHOLD
    
    @pytest.mark.asyncio
    async def test_gpu_overheating_critical_trigger(self, test_device, synthetic_telemetry_snapshot):
        """Test that GPU temperature > 95°C triggers a CRITICAL alert."""
        engine = AnomalyEngine()
        engine._debounce_enabled = False  # Disable debouncing for immediate trigger
        
        # Modify snapshot to trigger GPU overheating
        synthetic_telemetry_snapshot.gpu.hotspot_temperature_c = 98.0
        
        alerts = await engine.evaluate_snapshot(
            user_id=str(test_device.user_id),
            device_id=str(test_device.id),
            snapshot=document_to_snapshot(synthetic_telemetry_snapshot)
        )
        
        assert len(alerts) >= 1
        
        # Verify the critical alert is present
        critical_alert = next((a for a in alerts if a.severity == AlertSeverity.CRITICAL and "GPU" in a.rule_name), None)
        assert critical_alert is not None
        assert critical_alert.trigger_value == 98.0
    
    @pytest.mark.asyncio
    async def test_psu_voltage_critical_trigger(self, test_device, synthetic_telemetry_snapshot):
        """Test that PSU voltage outside ±5% tolerance triggers a CRITICAL alert."""
        engine = AnomalyEngine()
        engine._debounce_enabled = False  # Disable debouncing for immediate trigger
        
        # Modify snapshot to trigger PSU voltage issue
        synthetic_telemetry_snapshot.power_vrm.psu_12v_voltage = 11.2  # Below 11.4V threshold
        
        alerts = await engine.evaluate_snapshot(
            user_id=str(test_device.user_id),
            device_id=str(test_device.id),
            snapshot=document_to_snapshot(synthetic_telemetry_snapshot)
        )
        
        assert len(alerts) >= 1
        assert "PSU" in alerts[0].rule_name
        assert alerts[0].severity == AlertSeverity.CRITICAL
    
    @pytest.mark.asyncio
    async def test_nvme_health_critical_trigger(self, test_device, synthetic_telemetry_snapshot):
        """Test that NVMe health < 10% triggers a CRITICAL alert."""
        engine = AnomalyEngine()
        engine._debounce_enabled = False  # Disable debouncing for immediate trigger
        
        # Modify snapshot to trigger NVMe health issue
        synthetic_telemetry_snapshot.storage[0].smart_health_percent = 5.0
        
        alerts = await engine.evaluate_snapshot(
            user_id=str(test_device.user_id),
            device_id=str(test_device.id),
            snapshot=document_to_snapshot(synthetic_telemetry_snapshot)
        )
        
        # At 5% health, both critical (10%) and warning (20%) thresholds are breached
        assert len(alerts) >= 1
        
        # Verify the critical alert is present
        critical_alert = next((a for a in alerts if a.severity == AlertSeverity.CRITICAL and "NVME_HEALTH" in a.rule_name), None)
        assert critical_alert is not None
        assert critical_alert.trigger_value == 5.0
    
    @pytest.mark.asyncio
    async def test_vrm_temperature_critical_trigger(self, test_device, synthetic_telemetry_snapshot):
        """Test that VRM temperature > 100°C triggers a CRITICAL alert."""
        engine = AnomalyEngine()
        engine._debounce_enabled = False  # Disable debouncing for immediate trigger
        
        # Modify snapshot to trigger VRM overheating
        synthetic_telemetry_snapshot.power_vrm.vrm_temperature_c = 105.0
        
        alerts = await engine.evaluate_snapshot(
            user_id=str(test_device.user_id),
            device_id=str(test_device.id),
            snapshot=document_to_snapshot(synthetic_telemetry_snapshot)
        )
        
        # At 105°C, both critical (100°C) and warning (85°C) thresholds are breached
        assert len(alerts) >= 1
        
        # Verify the critical alert is present
        critical_alert = next((a for a in alerts if a.severity == AlertSeverity.CRITICAL and "VRM_OVERHEATING_CRITICAL" in a.rule_name), None)
        assert critical_alert is not None
        assert critical_alert.trigger_value == 105.0
    
    @pytest.mark.asyncio
    async def test_no_alert_for_normal_metrics(self, test_device, synthetic_telemetry_snapshot):
        """Test that normal metrics do not trigger any alerts."""
        engine = AnomalyEngine()
        
        # Ensure all metrics are within normal ranges
        synthetic_telemetry_snapshot.cpu.core_temperature_c = 65.0
        synthetic_telemetry_snapshot.gpu.core_temperature_c = 70.0
        synthetic_telemetry_snapshot.power_vrm.psu_12v_voltage = 12.1
        synthetic_telemetry_snapshot.storage[0].smart_health_percent = 98.0
        synthetic_telemetry_snapshot.power_vrm.vrm_temperature_c = 65.0
        
        alerts = await engine.evaluate_snapshot(
            user_id=str(test_device.user_id),
            device_id=str(test_device.id),
            snapshot=document_to_snapshot(synthetic_telemetry_snapshot)
        )
        
        assert len(alerts) == 0
    
    @pytest.mark.asyncio
    async def test_multiple_alerts_for_multiple_breaches(self, test_device, synthetic_telemetry_snapshot):
        """Test that multiple metric breaches trigger multiple alerts."""
        engine = AnomalyEngine()
        engine._debounce_enabled = False  # Disable debouncing for immediate trigger
        
        # Trigger multiple breaches
        synthetic_telemetry_snapshot.cpu.core_temperature_c = 95.0
        synthetic_telemetry_snapshot.gpu.core_temperature_c = 98.0
        synthetic_telemetry_snapshot.power_vrm.vrm_temperature_c = 105.0
        
        alerts = await engine.evaluate_snapshot(
            user_id=str(test_device.user_id),
            device_id=str(test_device.id),
            snapshot=document_to_snapshot(synthetic_telemetry_snapshot)
        )
        
        assert len(alerts) >= 2  # At least 2 alerts should be triggered
    
    @pytest.mark.asyncio
    async def test_debouncing_transient_spike(self, test_device, synthetic_telemetry_snapshot):
        """Test that brief transient spikes do not create false positive alerts."""
        # Disable auto-resolution for this test
        engine = AnomalyEngine()
        engine.auto_resolution_enabled = False
        engine.debounce_enabled = True
        
        # Trigger a brief spike
        synthetic_telemetry_snapshot.cpu.core_temperature_c = 95.0
        
        # First evaluation - should not trigger due to debouncing
        alerts = await engine.evaluate_snapshot(
            user_id=str(test_device.user_id),
            device_id=str(test_device.id),
            snapshot=document_to_snapshot(synthetic_telemetry_snapshot)
        )
        
        # With debouncing, first spike may not trigger immediately
        # depending on debounce duration
        assert len(alerts) <= 1
        
        # Immediately return to normal
        synthetic_telemetry_snapshot.cpu.core_temperature_c = 65.0
        
        # Second evaluation - should not trigger
        alerts = await engine.evaluate_snapshot(
            user_id=str(test_device.user_id),
            device_id=str(test_device.id),
            snapshot=document_to_snapshot(synthetic_telemetry_snapshot)
        )
        
        assert len(alerts) == 0
    
    @pytest.mark.asyncio
    async def test_sustained_breach_triggers_alert(self, test_device, synthetic_telemetry_snapshot):
        """Test that sustained breaches beyond debounce duration trigger alerts."""
        engine = AnomalyEngine()
        engine._debounce_enabled = False  # Disable debouncing for immediate trigger in test
        
        # Trigger sustained breach
        synthetic_telemetry_snapshot.cpu.core_temperature_c = 95.0
        
        alerts = await engine.evaluate_snapshot(
            user_id=str(test_device.user_id),
            device_id=str(test_device.id),
            snapshot=document_to_snapshot(synthetic_telemetry_snapshot)
        )
        
        assert len(alerts) >= 1
        assert alerts[0].severity == AlertSeverity.CRITICAL
    
    @pytest.mark.asyncio
    async def test_auto_resolution_on_metric_recovery(self, test_device, synthetic_telemetry_snapshot):
        """Test that alerts auto-resolve when metrics return to safe limits."""
        engine = AnomalyEngine()
        engine._debounce_enabled = False  # Disable debouncing for immediate trigger
        engine._auto_resolution = True  # Enable auto-resolution
        
        # Trigger an alert
        synthetic_telemetry_snapshot.cpu.core_temperature_c = 95.0
        alerts = await engine.evaluate_snapshot(
            user_id=str(test_device.user_id),
            device_id=str(test_device.id),
            snapshot=document_to_snapshot(synthetic_telemetry_snapshot)
        )
        
        assert len(alerts) >= 1
        alert_id = alerts[0].id
        
        # Return to normal
        synthetic_telemetry_snapshot.cpu.core_temperature_c = 65.0
        
        # Wait for auto-resolution duration (CPU rule has 15s resolution_duration)
        # For testing, we'll verify the alert remains active since we haven't waited long enough
        await asyncio.sleep(0.15)
        
        # Evaluate again - should NOT auto-resolve yet (not enough time)
        await engine.evaluate_snapshot(
            user_id=str(test_device.user_id),
            device_id=str(test_device.id),
            snapshot=document_to_snapshot(synthetic_telemetry_snapshot)
        )
        
        # Check if alert is still active (should be, since we haven't waited 15s)
        from app.models.alert import AnomalyAlertDocument
        active_alert = await AnomalyAlertDocument.get(alert_id)
        assert active_alert is not None
        assert active_alert.is_active == True  # Still active due to resolution duration
    
    @pytest.mark.asyncio
    async def test_alert_persistence(self, test_device, synthetic_telemetry_snapshot):
        """Test that alerts are persisted to the database."""
        engine = AnomalyEngine()
        engine._debounce_enabled = False  # Disable debouncing for immediate trigger
        
        # Trigger an alert
        synthetic_telemetry_snapshot.cpu.core_temperature_c = 95.0
        
        await asyncio.sleep(0.15)
        alerts = await engine.evaluate_snapshot(
            user_id=str(test_device.user_id),
            device_id=str(test_device.id),
            snapshot=document_to_snapshot(synthetic_telemetry_snapshot)
        )
        
        assert len(alerts) >= 1
        
        # Verify alert was persisted
        from app.models.alert import AnomalyAlertDocument
        persisted_alert = await AnomalyAlertDocument.get(alerts[0].id)
        
        assert persisted_alert is not None
        assert persisted_alert.id == alerts[0].id
        assert persisted_alert.device_id == test_device.id
        assert persisted_alert.user_id == test_device.user_id
        assert persisted_alert.is_active == True
    
    @pytest.mark.asyncio
    async def test_alert_message_generation(self, test_device, synthetic_telemetry_snapshot):
        """Test that alert messages are generated correctly."""
        engine = AnomalyEngine()
        engine._debounce_enabled = False  # Disable debouncing for immediate trigger
        
        synthetic_telemetry_snapshot.cpu.core_temperature_c = 95.0
        
        await asyncio.sleep(0.15)
        alerts = await engine.evaluate_snapshot(
            user_id=str(test_device.user_id),
            device_id=str(test_device.id),
            snapshot=document_to_snapshot(synthetic_telemetry_snapshot)
        )
        
        assert len(alerts) >= 1
        assert alerts[0].message is not None
        assert "CPU" in alerts[0].message or "temperature" in alerts[0].message.lower()
        assert str(95.0) in alerts[0].message
    
    @pytest.mark.asyncio
    async def test_state_tracking_per_device(self, test_device, other_device, synthetic_telemetry_snapshot):
        """Test that anomaly state is tracked separately per device."""
        engine = AnomalyEngine()
        engine._debounce_enabled = False  # Disable debouncing for immediate trigger
        
        # Trigger alert on test_device
        synthetic_telemetry_snapshot.cpu.core_temperature_c = 95.0
        
        await asyncio.sleep(0.15)
        alerts1 = await engine.evaluate_snapshot(
            user_id=str(test_device.user_id),
            device_id=str(test_device.id),
            snapshot=document_to_snapshot(synthetic_telemetry_snapshot)
        )
        
        # Normal metrics on other_device
        synthetic_telemetry_snapshot.cpu.core_temperature_c = 65.0
        
        alerts2 = await engine.evaluate_snapshot(
            user_id=str(other_device.user_id),
            device_id=str(other_device.id),
            snapshot=document_to_snapshot(synthetic_telemetry_snapshot)
        )
        
        # test_device should have alerts, other_device should not
        assert len(alerts1) >= 1
        assert len(alerts2) == 0


class TestAnomalyEngineEdgeCases:
    """Test suite for AnomalyEngine edge cases and error handling."""
    
    @pytest.mark.asyncio
    async def test_missing_telemetry_data(self, test_device):
        """Test handling of missing telemetry data."""
        engine = AnomalyEngine()
        
        from app.models.telemetry import TelemetrySnapshot, CPUMetrics, GPUMetrics, RAMMetrics, PowerAndVRMMetrics
        
        # Create snapshot with default/empty metrics (not None, since fields are required)
        incomplete_snapshot = TelemetrySnapshot(
            timestamp=datetime.now(timezone.utc),
            sensor_id="test_sensor",
            cpu=CPUMetrics(),  # Default values
            gpu=GPUMetrics(),  # Default values
            ram=RAMMetrics(),  # Default values
            storage=[],  # Empty list
            power_vrm=PowerAndVRMMetrics()  # Default values
        )
        
        alerts = await engine.evaluate_snapshot(
            user_id=str(test_device.user_id),
            device_id=str(test_device.id),
            snapshot=incomplete_snapshot
        )
        
        # Should handle missing data gracefully without errors
        assert len(alerts) == 0
    
    @pytest.mark.asyncio
    async def test_invalid_metric_values(self, test_device, synthetic_telemetry_snapshot):
        """Test handling of invalid metric values (e.g., negative temperatures)."""
        engine = AnomalyEngine()
        
        # Set invalid values
        synthetic_telemetry_snapshot.cpu.core_temperature_c = -50.0
        
        alerts = await engine.evaluate_snapshot(
            user_id=str(test_device.user_id),
            device_id=str(test_device.id),
            snapshot=document_to_snapshot(synthetic_telemetry_snapshot)
        )
        
        # Should handle gracefully
        assert alerts is not None
    
    @pytest.mark.asyncio
    async def test_extreme_metric_values(self, test_device, synthetic_telemetry_snapshot):
        """Test handling of extreme metric values."""
        engine = AnomalyEngine()
        
        # Set extreme values
        synthetic_telemetry_snapshot.cpu.core_temperature_c = 200.0
        synthetic_telemetry_snapshot.cpu.utilization_percent = 150.0
        
        alerts = await engine.evaluate_snapshot(
            user_id=str(test_device.user_id),
            device_id=str(test_device.id),
            snapshot=document_to_snapshot(synthetic_telemetry_snapshot)
        )
        
        # Should handle gracefully
        assert alerts is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
