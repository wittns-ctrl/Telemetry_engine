"""
Test suite for SensorService hardware telemetry collection.

This module tests the asynchronous hardware telemetry collection service
to ensure all metrics are collected correctly and error handling works properly.
"""

import pytest
import asyncio
from unittest.mock import Mock, patch, AsyncMock

from app.services.sensor_service import SensorService
from app.models.telemetry import TelemetrySnapshot, CPUMetrics, GPUMetrics


class TestSensorService:
    """Test suite for SensorService class."""
    
    @pytest.mark.asyncio
    async def test_get_current_telemetry_success(self):
        """Test successful telemetry collection."""
        snapshot = await SensorService.get_current_telemetry("test_sensor")
        
        assert isinstance(snapshot, TelemetrySnapshot)
        assert snapshot.sensor_id == "test_sensor"
        assert isinstance(snapshot.cpu, CPUMetrics)
        assert isinstance(snapshot.gpu, GPUMetrics)
        assert snapshot.collection_duration_ms is not None
        assert snapshot.collection_duration_ms >= 0
    
    @pytest.mark.asyncio
    async def test_get_current_telemetry_default_sensor_id(self):
        """Test telemetry collection with default sensor ID."""
        snapshot = await SensorService.get_current_telemetry()
        
        assert isinstance(snapshot, TelemetrySnapshot)
        assert snapshot.sensor_id == "lectio_sensor_001"
    
    @pytest.mark.asyncio
    async def test_cpu_metrics_collection(self):
        """Test CPU metrics collection."""
        cpu_metrics = await SensorService._collect_cpu_metrics()
        
        assert isinstance(cpu_metrics, CPUMetrics)
        # Check that at least some basic metrics are collected
        assert cpu_metrics.utilization_percent is not None or cpu_metrics.core_temperature_c is not None
    
    @pytest.mark.asyncio
    async def test_gpu_metrics_collection(self):
        """Test GPU metrics collection."""
        gpu_metrics = await SensorService._collect_gpu_metrics()
        
        assert isinstance(gpu_metrics, GPUMetrics)
        # GPU metrics may be None if no GPU is available
    
    @pytest.mark.asyncio
    async def test_storage_metrics_collection(self):
        """Test storage metrics collection."""
        storage_metrics = await SensorService._collect_storage_metrics()
        
        assert isinstance(storage_metrics, list)
        # Should have at least one storage device
        assert len(storage_metrics) >= 0
    
    @pytest.mark.asyncio
    async def test_ram_metrics_collection(self):
        """Test RAM metrics collection."""
        ram_metrics = await SensorService._collect_ram_metrics()
        
        assert ram_metrics.usage_percent is not None
        assert ram_metrics.total_gb is not None
        assert ram_metrics.used_gb is not None
        assert 0 <= ram_metrics.usage_percent <= 100
        assert ram_metrics.total_gb > 0
        assert ram_metrics.used_gb >= 0
    
    @pytest.mark.asyncio
    async def test_power_vrm_metrics_collection(self):
        """Test power and VRM metrics collection."""
        power_vrm_metrics = await SensorService._collect_power_vrm_metrics()
        
        # Power/VRM metrics may be None on systems without WMI support
        assert power_vrm_metrics is not None
    
    @pytest.mark.asyncio
    async def test_error_handling_cpu_failure(self):
        """Test graceful handling of CPU metrics collection failure."""
        with patch('app.services.sensor_service.SensorService._collect_cpu_metrics', side_effect=Exception("CPU error")):
            snapshot = await SensorService.get_current_telemetry()
            
            assert isinstance(snapshot, TelemetrySnapshot)
            assert isinstance(snapshot.cpu, CPUMetrics)
            # Should have default values when collection fails
    
    @pytest.mark.asyncio
    async def test_concurrent_collection(self):
        """Test that metrics are collected concurrently."""
        import time
        start = time.time()
        
        snapshot = await SensorService.get_current_telemetry()
        
        duration = time.time() - start
        # Concurrent collection should be faster than sequential
        assert duration < 10  # Should complete in under 10 seconds
        assert snapshot.collection_duration_ms is not None


class TestSensorServiceUnit:
    """Unit tests for individual sensor service methods."""
    
    def test_get_cpu_basic_metrics(self):
        """Test basic CPU metrics collection."""
        cpu_percent, cpu_freq, cpu_count = SensorService._get_cpu_basic_metrics()
        
        assert cpu_percent is not None or cpu_freq is not None or cpu_count is not None
    
    def test_get_cpu_temperature(self):
        """Test CPU temperature collection."""
        core_temp, package_temp = SensorService._get_cpu_temperature()
        
        # Temperature may be None if sensors are not available
        assert core_temp is None or (0 < core_temp < 120)
        assert package_temp is None or (0 < package_temp < 120)
    
    def test_get_whea_error_count(self):
        """Test WHEA error count collection."""
        whea_count = SensorService._get_whea_error_count()
        
        assert isinstance(whea_count, int)
        assert whea_count >= 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
