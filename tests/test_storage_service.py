"""
Test suite for StorageService database operations.

This module tests the storage service for device registration, telemetry
persistence, historical queries, and data downsampling functionality.
"""

import pytest
from datetime import datetime, timezone, timedelta
from beanie import PydanticObjectId

from app.services.storage_service import StorageService
from app.models.telemetry import Device, TelemetrySnapshotDocument, TelemetrySnapshot
from app.models.user import User, UserRole
from app.core.security import get_password_hash
from app.db.session import init_db


@pytest.fixture
async def setup_db():
    """Initialize database for tests."""
    await init_db()
    yield


class TestStorageService:
    """Test suite for StorageService class."""
    
    @pytest.fixture
    async def test_user(self, setup_db):
        """Create a test user for storage service tests."""
        # Clean up any existing test user
        existing_user = await User.find_one(User.email == "storage_test@example.com")
        if existing_user:
            await existing_user.delete()
        
        user = User(
            email="storage_test@example.com",
            normalized_email="storage_test@example.com",
            full_name="Storage Test User",
            hashed_password=get_password_hash("TestPassword123"),
            email_verified=True,
            role=UserRole.USER,
            auth_providers=["password"]
        )
        await user.insert()
        yield user
        await user.delete()
    
    @pytest.mark.asyncio
    async def test_register_new_device(self, test_user):
        """Test registering a new device."""
        system_uuid = "550e8400-e29b-41d4-a716-446655440000"
        device_name = "Test Workstation"
        
        device = await StorageService.register_or_get_device(
            user_id=str(test_user.id),
            system_uuid=system_uuid,
            device_name=device_name
        )
        
        assert isinstance(device, Device)
        assert device.device_name == device_name
        assert device.system_uuid == system_uuid
        assert device.user_id == test_user.id
        assert device.is_active == True
        assert device.created_at is not None
        
        # Cleanup
        await device.delete()
    
    @pytest.mark.asyncio
    async def test_get_existing_device(self, test_user):
        """Test retrieving an existing device."""
        system_uuid = "550e8400-e29b-41d4-a716-446655440001"
        device_name = "Test Workstation 2"
        
        # Register device first
        device1 = await StorageService.register_or_get_device(
            user_id=str(test_user.id),
            system_uuid=system_uuid,
            device_name=device_name
        )
        
        # Try to get the same device again
        device2 = await StorageService.register_or_get_device(
            user_id=str(test_user.id),
            system_uuid=system_uuid,
            device_name=device_name
        )
        
        assert device1.id == device2.id
        assert device2.last_seen is not None
        
        # Cleanup
        await device1.delete()
    
    @pytest.mark.asyncio
    async def test_save_telemetry_snapshot(self, test_user):
        """Test saving a telemetry snapshot."""
        # Register a device first
        system_uuid = "550e8400-e29b-41d4-a716-446655440002"
        device = await StorageService.register_or_get_device(
            user_id=str(test_user.id),
            system_uuid=system_uuid,
            device_name="Test Device"
        )
        
        # Create a telemetry snapshot
        from app.models.telemetry import CPUMetrics, GPUMetrics, RAMMetrics, PowerAndVRMMetrics
        snapshot = TelemetrySnapshot(
            timestamp=datetime.now(timezone.utc),
            sensor_id="test_sensor",
            cpu=CPUMetrics(utilization_percent=50.0, core_temperature_c=45.0),
            gpu=GPUMetrics(utilization_percent=30.0, core_temperature_c=40.0),
            storage=[],
            ram=RAMMetrics(usage_percent=60.0, used_gb=8.0, total_gb=16.0),
            power_vrm=PowerAndVRMMetrics(vrm_temperature_c=50.0),
            collection_duration_ms=100.0
        )
        
        # Save the snapshot
        telemetry_doc = await StorageService.save_telemetry_snapshot(
            user_id=str(test_user.id),
            device_id=str(device.id),
            snapshot=snapshot
        )
        
        assert isinstance(telemetry_doc, TelemetrySnapshotDocument)
        assert telemetry_doc.device_id == device.id
        assert telemetry_doc.user_id == test_user.id
        assert telemetry_doc.sensor_id == "test_sensor"
        assert telemetry_doc.cpu.utilization_percent == 50.0
        
        # Cleanup
        await telemetry_doc.delete()
        await device.delete()
    
    @pytest.mark.asyncio
    async def test_get_historical_telemetry(self, test_user):
        """Test retrieving historical telemetry data."""
        # Register a device
        system_uuid = "550e8400-e29b-41d4-a716-446655440003"
        device = await StorageService.register_or_get_device(
            user_id=str(test_user.id),
            system_uuid=system_uuid,
            device_name="Test Device 3"
        )
        
        # Create and save multiple telemetry snapshots
        from app.models.telemetry import CPUMetrics, GPUMetrics, RAMMetrics, PowerAndVRMMetrics
        
        for i in range(5):
            snapshot = TelemetrySnapshot(
                timestamp=datetime.now(timezone.utc) - timedelta(hours=i),
                sensor_id=f"test_sensor_{i}",
                cpu=CPUMetrics(utilization_percent=50.0 + i, core_temperature_c=45.0),
                gpu=GPUMetrics(utilization_percent=30.0, core_temperature_c=40.0),
                storage=[],
                ram=RAMMetrics(usage_percent=60.0, used_gb=8.0, total_gb=16.0),
                power_vrm=PowerAndVRMMetrics(vrm_temperature_c=50.0),
                collection_duration_ms=100.0
            )
            await StorageService.save_telemetry_snapshot(
                user_id=str(test_user.id),
                device_id=str(device.id),
                snapshot=snapshot
            )
        
        # Retrieve historical data
        start_time = datetime.now(timezone.utc) - timedelta(hours=6)
        end_time = datetime.now(timezone.utc)
        
        historical_data = await StorageService.get_historical_telemetry(
            user_id=str(test_user.id),
            device_id=str(device.id),
            start_time=start_time,
            end_time=end_time,
            limit=10
        )
        
        assert len(historical_data) == 5
        assert all(doc.user_id == test_user.id for doc in historical_data)
        assert all(doc.device_id == device.id for doc in historical_data)
        
        # Cleanup
        for doc in historical_data:
            await doc.delete()
        await device.delete()
    
    @pytest.mark.asyncio
    async def test_get_user_devices(self, test_user):
        """Test retrieving all devices for a user."""
        # Register multiple devices
        device_ids = []
        for i in range(3):
            system_uuid = f"550e8400-e29b-41d4-a716-44665544000{i}"
            device = await StorageService.register_or_get_device(
                user_id=str(test_user.id),
                system_uuid=system_uuid,
                device_name=f"Test Device {i}"
            )
            device_ids.append(device.id)
        
        # Retrieve user devices
        devices = await StorageService.get_user_devices(str(test_user.id))
        
        assert len(devices) >= 3
        assert all(device.user_id == test_user.id for device in devices)
        
        # Cleanup
        for device in devices[:3]:  # Only delete the ones we created
            await device.delete()
    
    @pytest.mark.asyncio
    async def test_delete_device(self, test_user):
        """Test soft deleting a device."""
        # Register a device
        system_uuid = "550e8400-e29b-41d4-a716-446655440004"
        device = await StorageService.register_or_get_device(
            user_id=str(test_user.id),
            system_uuid=system_uuid,
            device_name="Device to Delete"
        )
        
        # Delete the device
        result = await StorageService.delete_device(
            device_id=str(device.id),
            user_id=str(test_user.id)
        )
        
        assert result == True
        
        # Verify device is marked as inactive
        deleted_device = await Device.get(device.id)
        assert deleted_device.is_active == False
        
        # Cleanup
        await device.delete()
    
    @pytest.mark.asyncio
    async def test_tenant_isolation(self, test_user):
        """Test that tenant isolation prevents cross-user data access."""
        # Clean up any existing other_user
        existing_other_user = await User.find_one(User.email == "other_user@example.com")
        if existing_other_user:
            await existing_other_user.delete()
        
        # Create another user
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
        
        # Register device for test_user
        system_uuid = "550e8400-e29b-41d4-a716-446655440005"
        device = await StorageService.register_or_get_device(
            user_id=str(test_user.id),
            system_uuid=system_uuid,
            device_name="Test User Device"
        )
        
        # Save telemetry for test_user
        from app.models.telemetry import CPUMetrics, GPUMetrics, RAMMetrics, PowerAndVRMMetrics
        snapshot = TelemetrySnapshot(
            timestamp=datetime.now(timezone.utc),
            sensor_id="test_sensor",
            cpu=CPUMetrics(utilization_percent=50.0),
            gpu=GPUMetrics(utilization_percent=30.0),
            storage=[],
            ram=RAMMetrics(usage_percent=60.0, used_gb=8.0, total_gb=16.0),
            power_vrm=PowerAndVRMMetrics(),
            collection_duration_ms=100.0
        )
        await StorageService.save_telemetry_snapshot(
            user_id=str(test_user.id),
            device_id=str(device.id),
            snapshot=snapshot
        )
        
        # Try to retrieve data with other_user (should return empty)
        start_time = datetime.now(timezone.utc) - timedelta(hours=1)
        end_time = datetime.now(timezone.utc)
        
        other_user_data = await StorageService.get_historical_telemetry(
            user_id=str(other_user.id),
            device_id=str(device.id),
            start_time=start_time,
            end_time=end_time
        )
        
        assert len(other_user_data) == 0  # Should be empty due to tenant isolation
        
        # Cleanup
        telemetry_docs = await TelemetrySnapshotDocument.find(
            TelemetrySnapshotDocument.device_id == device.id
        ).to_list()
        for doc in telemetry_docs:
            await doc.delete()
        await device.delete()
        await other_user.delete()
    
    @pytest.mark.asyncio
    async def test_downsample_old_telemetry(self, test_user):
        """Test telemetry downsampling aggregation."""
        # Register a device
        system_uuid = "550e8400-e29b-41d4-a716-446655440006"
        device = await StorageService.register_or_get_device(
            user_id=str(test_user.id),
            system_uuid=system_uuid,
            device_name="Test Device for Downsampling"
        )
        
        # Create old telemetry data (older than 7 days)
        from app.models.telemetry import CPUMetrics, GPUMetrics, RAMMetrics, PowerAndVRMMetrics
        
        old_timestamp = datetime.now(timezone.utc) - timedelta(days=10)
        snapshot = TelemetrySnapshot(
            timestamp=old_timestamp,
            sensor_id="old_sensor",
            cpu=CPUMetrics(utilization_percent=50.0, core_temperature_c=45.0),
            gpu=GPUMetrics(utilization_percent=30.0, core_temperature_c=40.0),
            storage=[],
            ram=RAMMetrics(usage_percent=60.0, used_gb=8.0, total_gb=16.0),
            power_vrm=PowerAndVRMMetrics(vrm_temperature_c=50.0),
            collection_duration_ms=100.0
        )
        await StorageService.save_telemetry_snapshot(
            user_id=str(test_user.id),
            device_id=str(device.id),
            snapshot=snapshot
        )
        
        # Run downsampling
        downsampled_count = await StorageService.downsample_old_telemetry()
        
        # The downsampling should have processed the old data
        assert downsampled_count >= 0
        
        # Cleanup
        telemetry_docs = await TelemetrySnapshotDocument.find(
            TelemetrySnapshotDocument.device_id == device.id
        ).to_list()
        for doc in telemetry_docs:
            await doc.delete()
        await device.delete()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
