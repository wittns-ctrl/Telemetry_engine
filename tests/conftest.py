"""
Pytest Configuration and Fixtures for Lectio Test Suite

This module provides comprehensive fixtures for testing the Lectio backend,
including database initialization, authentication, HTTP clients, and hardware mocks.

Author: Lectio Backend Team
Version: 7.0.0
"""

import pytest
import asyncio
from datetime import datetime, timezone, timedelta
from typing import AsyncGenerator, Generator
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient
from httpx import AsyncClient, ASGITransport
import mongomock_motor

from app.main import app
from app.core.config import settings
from app.core.security import get_password_hash, create_access_token
from app.models.user import User, UserRole
from app.models.telemetry import Device, TelemetrySnapshotDocument
from app.models.alert import AnomalyAlertDocument, AlertSeverity
from app.models.metric import Metrics


# ============================================================================
# DATABASE FIXTURES
# ============================================================================

@pytest.fixture(scope="function")
async def mock_mongo_client() -> AsyncGenerator:
    """
    Create an in-memory MongoDB client using mongomock-motor for isolated testing.
    
    This fixture provides a clean MongoDB instance for each test function,
    ensuring no data leakage between tests.
    """
    # Create mongomock client
    client = mongomock_motor.AsyncMongoMockClient()
    
    # Initialize Beanie with the mock client
    await init_beanie(
        database=client.telemetry_test,
        document_models=[
            User,
            Device,
            TelemetrySnapshotDocument,
            AnomalyAlertDocument,
            Metrics
        ]
    )
    
    yield client
    
    # Cleanup: drop all collections
    await client.telemetry_test.drop_collection("user")
    await client.telemetry_test.drop_collection("device")
    await client.telemetry_test.drop_collection("telemetry_snapshot_document")
    await client.telemetry_test.drop_collection("anomaly_alert_document")
    await client.telemetry_test.drop_collection("metrics")


@pytest.fixture(scope="function")
async def db_session(mock_mongo_client):
    """
    Alias for mock_mongo_client for compatibility with existing tests.
    """
    yield mock_mongo_client


# ============================================================================
# USER FIXTURES
# ============================================================================

@pytest.fixture(scope="function")
async def test_user(mock_mongo_client) -> User:
    """
    Create a test user for authentication testing.
    
    Returns:
        User: A test user with basic authentication credentials
    """
    # Clean up any existing test user
    existing_user = await User.find_one(User.email == "test@example.com")
    if existing_user:
        await existing_user.delete()
    
    user = User(
        email="test@example.com",
        normalized_email="test@example.com",
        full_name="Test User",
        hashed_password=get_password_hash("TestPassword123"),
        email_verified=True,
        role=UserRole.USER,
        auth_providers=["password"]
    )
    await user.insert()
    yield user
    await user.delete()


@pytest.fixture(scope="function")
async def test_admin(mock_mongo_client) -> User:
    """
    Create a test admin user for role-based access testing.
    
    Returns:
        User: A test admin user with elevated privileges
    """
    # Clean up any existing admin user
    existing_admin = await User.find_one(User.email == "admin@example.com")
    if existing_admin:
        await existing_admin.delete()
    
    admin = User(
        email="admin@example.com",
        normalized_email="admin@example.com",
        full_name="Admin User",
        hashed_password=get_password_hash("AdminPassword123"),
        email_verified=True,
        role=UserRole.ADMIN,
        auth_providers=["password"]
    )
    await admin.insert()
    yield admin
    await admin.delete()


@pytest.fixture(scope="function")
async def other_user(mock_mongo_client) -> User:
    """
    Create a second test user for multi-tenant isolation testing.
    
    Returns:
        User: A second test user for cross-tenant access testing
    """
    # Clean up any existing other user
    existing_other = await User.find_one(User.email == "other@example.com")
    if existing_other:
        await existing_other.delete()
    
    other = User(
        email="other@example.com",
        normalized_email="other@example.com",
        full_name="Other User",
        hashed_password=get_password_hash("OtherPassword123"),
        email_verified=True,
        role=UserRole.USER,
        auth_providers=["password"]
    )
    await other.insert()
    yield other
    await other.delete()


# ============================================================================
# AUTHENTICATION FIXTURES
# ============================================================================

@pytest.fixture(scope="function")
def auth_headers(test_user) -> dict:
    """
    Create authentication headers for test requests.
    
    Returns:
        dict: HTTP headers with Bearer token for authenticated requests
    """
    token = create_access_token(
        data={"sub": str(test_user.id), "type": "access"},
        expires_delta=timedelta(minutes=15)
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="function")
def admin_auth_headers(test_admin) -> dict:
    """
    Create admin authentication headers for privilege testing.
    
    Returns:
        dict: HTTP headers with admin Bearer token
    """
    token = create_access_token(
        data={"sub": str(test_admin.id), "type": "access"},
        expires_delta=timedelta(minutes=15)
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="function")
def other_auth_headers(other_user) -> dict:
    """
    Create authentication headers for the second test user.
    
    Returns:
        dict: HTTP headers with Bearer token for cross-tenant testing
    """
    token = create_access_token(
        data={"sub": str(other_user.id), "type": "access"},
        expires_delta=timedelta(minutes=15)
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="function")
def expired_auth_headers(test_user) -> dict:
    """
    Create authentication headers with an expired token.
    
    Returns:
        dict: HTTP headers with expired Bearer token
    """
    token = create_access_token(
        data={"sub": str(test_user.id), "type": "access"},
        expires_delta=timedelta(minutes=-1)  # Expired
    )
    return {"Authorization": f"Bearer {token}"}


# ============================================================================
# HTTP CLIENT FIXTURES
# ============================================================================

@pytest.fixture(scope="function")
async def async_client() -> AsyncGenerator:
    """
    Create an async HTTP client for testing REST endpoints.
    
    Returns:
        AsyncClient: HTTP client configured for the FastAPI test app
    """
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as client:
        yield client


@pytest.fixture(scope="function")
async def authenticated_client(test_user, async_client) -> AsyncGenerator:
    """
    Create an authenticated async HTTP client.
    
    Returns:
        AsyncClient: HTTP client with pre-configured authentication headers
    """
    token = create_access_token(
        data={"sub": str(test_user.id), "type": "access"},
        expires_delta=timedelta(minutes=15)
    )
    async_client.headers.update({"Authorization": f"Bearer {token}"})
    yield async_client


# ============================================================================
# DEVICE FIXTURES
# ============================================================================

@pytest.fixture(scope="function")
async def test_device(test_user, mock_mongo_client) -> Device:
    """
    Create a test device for hardware telemetry testing.
    
    Returns:
        Device: A test device associated with the test user
    """
    import uuid
    
    device = Device(
        user_id=test_user.id,
        device_name="Test Desktop",
        system_uuid=str(uuid.uuid4()),
        os_info="Windows 11 Pro",
        is_active=True
    )
    await device.insert()
    yield device
    await device.delete()


@pytest.fixture(scope="function")
async def other_device(other_user, mock_mongo_client) -> Device:
    """
    Create a test device for the second user for isolation testing.
    
    Returns:
        Device: A test device associated with the other user
    """
    import uuid
    
    device = Device(
        user_id=other_user.id,
        device_name="Other Desktop",
        system_uuid=str(uuid.uuid4()),
        os_info="Windows 10 Pro",
        is_active=True
    )
    await device.insert()
    yield device
    await device.delete()


# ============================================================================
# TELEMETRY FIXTURES
# ============================================================================

@pytest.fixture(scope="function")
def synthetic_cpu_metrics():
    """
    Generate synthetic CPU metrics for testing.
    
    Returns:
        dict: Synthetic CPU telemetry data
    """
    from app.models.telemetry import CPUMetrics
    return CPUMetrics(
        core_temperature_c=65.0,
        package_temperature_c=70.0,
        utilization_percent=45.0,
        clock_speed_mhz=3500.0,
        power_watts=85.0,
        core_count=12,
        thread_count=24
    )


@pytest.fixture(scope="function")
def synthetic_gpu_metrics():
    """
    Generate synthetic GPU metrics for testing.
    
    Returns:
        dict: Synthetic GPU telemetry data
    """
    from app.models.telemetry import GPUMetrics
    return GPUMetrics(
        core_temperature_c=70.0,
        hotspot_temperature_c=78.0,
        utilization_percent=55.0,
        memory_utilization_percent=40.0,
        clock_speed_mhz=1750.0,
        memory_clock_mhz=9000.0,
        power_watts=220.0,
        fan_speed_percent=60.0,
        memory_used_mb=4096,
        memory_total_mb=10240
    )


@pytest.fixture(scope="function")
def synthetic_ram_metrics():
    """
    Generate synthetic RAM metrics for testing.
    
    Returns:
        dict: Synthetic RAM telemetry data
    """
    from app.models.telemetry import RAMMetrics
    return RAMMetrics(
        usage_percent=65.0,
        used_gb=20.8,
        total_gb=32.0,
        available_gb=11.2
    )


@pytest.fixture(scope="function")
def synthetic_storage_metrics():
    """
    Generate synthetic storage metrics for testing.
    
    Returns:
        list: Synthetic storage telemetry data for multiple drives
    """
    from app.models.telemetry import StorageMetrics
    return [
        StorageMetrics(
            device_name="C:",
            total_capacity_gb=512.0,
            available_capacity_gb=256.0,
            smart_health_percent=98.0,
            temperature_c=40.0
        ),
        StorageMetrics(
            device_name="D:",
            total_capacity_gb=1024.0,
            available_capacity_gb=512.0,
            smart_health_percent=99.0,
            temperature_c=42.0
        )
    ]


@pytest.fixture(scope="function")
def synthetic_power_vrm_metrics():
    """
    Generate synthetic power and VRM metrics for testing.
    
    Returns:
        dict: Synthetic power and VRM telemetry data
    """
    from app.models.telemetry import PowerAndVRMMetrics
    return PowerAndVRMMetrics(
        cpu_power_watts=85.0,
        gpu_power_watts=220.0,
        total_power_watts=450.0,
        vrm_temperature_c=65.0,
        cpu_vrm_temperature_c=70.0,
        gpu_vrm_temperature_c=75.0,
        voltage_12v=12.1,
        voltage_5v=5.05,
        voltage_3v3=3.35
    )


@pytest.fixture(scope="function")
async def synthetic_telemetry_snapshot(
    test_device,
    synthetic_cpu_metrics,
    synthetic_gpu_metrics,
    synthetic_ram_metrics,
    synthetic_storage_metrics,
    synthetic_power_vrm_metrics
) -> TelemetrySnapshotDocument:
    """
    Create a synthetic telemetry snapshot for testing.
    
    Returns:
        TelemetrySnapshotDocument: A complete synthetic telemetry snapshot
    """
    from app.models.telemetry import TelemetrySnapshot
    
    snapshot_data = TelemetrySnapshot(
        timestamp=datetime.now(timezone.utc),
        sensor_id=test_device.system_uuid,
        cpu=synthetic_cpu_metrics,
        gpu=synthetic_gpu_metrics,
        ram=synthetic_ram_metrics,
        storage=synthetic_storage_metrics,
        power_vrm=synthetic_power_vrm_metrics,
        collection_duration_ms=150.0
    )
    
    snapshot = TelemetrySnapshotDocument(
        user_id=test_device.user_id,
        device_id=test_device.id,
        timestamp=datetime.now(timezone.utc),
        sensor_id=test_device.system_uuid,
        cpu=synthetic_cpu_metrics,
        gpu=synthetic_gpu_metrics,
        ram=synthetic_ram_metrics,
        storage=synthetic_storage_metrics,
        power_vrm=synthetic_power_vrm_metrics,
        collection_duration_ms=150.0
    )
    await snapshot.insert()
    yield snapshot
    await snapshot.delete()


# ============================================================================
# ALERT FIXTURES
# ============================================================================

@pytest.fixture(scope="function")
async def test_alert(test_device, mock_mongo_client) -> AnomalyAlertDocument:
    """
    Create a test anomaly alert for testing.
    
    Returns:
        AnomalyAlertDocument: A test alert associated with the test device
    """
    alert = AnomalyAlertDocument(
        user_id=test_device.user_id,
        device_id=test_device.id,
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
    yield alert
    await alert.delete()


@pytest.fixture(scope="function")
async def other_alert(other_device, mock_mongo_client) -> AnomalyAlertDocument:
    """
    Create a test alert for the second user for isolation testing.
    
    Returns:
        AnomalyAlertDocument: A test alert associated with the other device
    """
    alert = AnomalyAlertDocument(
        user_id=other_device.user_id,
        device_id=other_device.id,
        rule_name="GPU_OVERHEATING_CRITICAL",
        severity=AlertSeverity.CRITICAL,
        metric_name="gpu_core_temperature_c",
        trigger_value=98.0,
        threshold_limit=95.0,
        message="GPU core temperature critical: 98.0°C exceeds threshold 95.0°C",
        is_active=True,
        created_at=datetime.now(timezone.utc)
    )
    await alert.insert()
    yield alert
    await alert.delete()


# ============================================================================
# HARDWARE MOCK FIXTURES
# ============================================================================

@pytest.fixture(scope="function")
def mock_psutil():
    """
    Mock psutil library for CPU, memory, and disk metrics.
    
    Returns:
        MagicMock: Mocked psutil module
    """
    with patch('app.services.sensor_service.psutil.cpu_percent') as mock_cpu_percent, \
         patch('app.services.sensor_service.psutil.cpu_freq') as mock_cpu_freq, \
         patch('app.services.sensor_service.psutil.virtual_memory') as mock_memory, \
         patch('app.services.sensor_service.psutil.disk_usage') as mock_disk, \
         patch('app.services.sensor_service.psutil.disk_partitions') as mock_partitions, \
         patch('app.services.sensor_service.psutil.swap_memory') as mock_swap:
        
        # Configure CPU mocks
        mock_cpu_percent.return_value = 45.0
        mock_freq = MagicMock()
        mock_freq.current = 3500.0
        mock_cpu_freq.return_value = mock_freq
        
        # Configure memory mocks
        mem = MagicMock()
        mem.percent = 65.0
        mem.used = 20.8 * 1024**3
        mem.total = 32.0 * 1024**3
        mem.available = 11.2 * 1024**3
        mock_memory.return_value = mem
        
        # Configure swap mocks
        swap = MagicMock()
        swap.percent = 10.0
        swap.total = 8.0 * 1024**3
        mock_swap.return_value = swap
        
        # Configure disk mocks
        disk = MagicMock()
        disk.percent = 50.0
        disk.used = 256.0 * 1024**3
        disk.total = 512.0 * 1024**3
        disk.free = 256.0 * 1024**3
        mock_disk.return_value = disk
        
        # Configure partition mocks
        partition = MagicMock()
        partition.fstype = 'NTFS'
        partition.device = 'C:'
        partition.mountpoint = 'C:'
        mock_partitions.return_value = [partition]
        
        yield {
            'cpu_percent': mock_cpu_percent,
            'cpu_freq': mock_cpu_freq,
            'memory': mock_memory,
            'disk': mock_disk,
            'partitions': mock_partitions,
            'swap': mock_swap
        }


@pytest.fixture(scope="function")
def mock_pynvml():
    """
    Mock pynvml library for GPU metrics.
    
    Returns:
        MagicMock: Mocked pynvml module
    """
    # Create a mock module since pynvml may not be installed
    import sys
    from unittest.mock import MagicMock
    
    # Create mock pynvml module
    mock_pynvml_module = MagicMock()
    mock_pynvml_module.nvmlInit = MagicMock()
    mock_pynvml_module.nvmlDeviceGetCount = MagicMock(return_value=1)
    mock_pynvml_module.nvmlDeviceGetHandleByIndex = MagicMock(return_value=MagicMock())
    mock_pynvml_module.nvmlDeviceGetName = MagicMock(return_value="NVIDIA RTX 3080")
    mock_pynvml_module.nvmlDeviceGetTemperature = MagicMock(return_value=70)
    mock_pynvml_module.nvmlDeviceGetUtilizationRates = MagicMock(return_value=MagicMock(gpu=55, memory=40))
    mock_pynvml_module.nvmlDeviceGetClockInfo = MagicMock(return_value=1750)
    mock_pynvml_module.nvmlDeviceGetPowerUsage = MagicMock(return_value=220000)
    mock_pynvml_module.nvmlDeviceGetMemoryInfo = MagicMock(return_value=MagicMock(used=4096 * 1024**2, total=10240 * 1024**2))
    mock_pynvml_module.nvmlShutdown = MagicMock()
    mock_pynvml_module.NVML_TEMPERATURE_GPU = 0
    
    # Add to sys.modules if not present
    if 'pynvml' not in sys.modules:
        sys.modules['pynvml'] = mock_pynvml_module
    
    yield mock_pynvml_module
    
    # Clean up
    if 'pynvml' in sys.modules and sys.modules['pynvml'] is mock_pynvml_module:
        del sys.modules['pynvml']


@pytest.fixture(scope="function")
def mock_smartctl():
    """
    Mock smartctl subprocess execution for NVMe health metrics.
    
    Returns:
        MagicMock: Mocked subprocess for smartctl
    """
    with patch('app.services.sensor_service.subprocess.run') as mock_run:
        mock_result = MagicMock()
        mock_result.stdout = """
{
  "model_name": "Samsung 980 Pro 1TB",
  "smart_status": {
    "passed": true
  },
  "nvme_smart_health_information": {
    "percentage_used": 2
  }
}
"""
        mock_result.returncode = 0
        mock_run.return_value = mock_result
        
        yield mock_run


@pytest.fixture(scope="function")
def mock_wmi():
    """
    Mock WMI/LHM wrappers for Windows-specific metrics.
    
    Returns:
        MagicMock: Mocked WMI module
    """
    with patch('wmi.WMI') as mock_wmi_class:
        mock_wmi = MagicMock()
        
        # Mock WMI query for temperature
        temp_sensor = MagicMock()
        temp_sensor.CurrentTemperature = 65 * 10  # DeciKelvin
        mock_wmi.Win32_TemperatureProbe.return_value = [temp_sensor]
        
        # Mock WMI query for power
        power_monitor = MagicMock()
        power_monitor.Power = 85.0
        mock_wmi.Win32_Processor.return_value = [power_monitor]
        
        mock_wmi_class.return_value = mock_wmi
        
        yield mock_wmi_class


# ============================================================================
# WEBSOCKET FIXTURES
# ============================================================================

@pytest.fixture(scope="function")
async def websocket_client(auth_headers):
    """
    Create a WebSocket client for testing WebSocket endpoints.
    
    Returns:
        AsyncClient: HTTP client configured for WebSocket connections
    """
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as client:
        client.headers.update(auth_headers)
        yield client


# ============================================================================
# OPENAI MOCK FIXTURES
# ============================================================================

@pytest.fixture(scope="function")
def mock_openai_client():
    """
    Mock OpenAI AsyncOpenAI client for AI diagnostics testing.
    
    Returns:
        MagicMock: Mocked AsyncOpenAI client
    """
    with patch('openai.AsyncOpenAI') as mock_client_class:
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_choice = MagicMock()
        mock_message = MagicMock()
        
        # Mock successful API response
        mock_message.content = '''{
    "root_cause_analysis": "CPU core temperature exceeds critical threshold due to inadequate cooling.",
    "urgency_level": "IMMEDIATE_ACTION_REQUIRED",
    "actionable_steps": [
        {
            "step_number": 1,
            "instruction": "Check CPU cooler mounting and thermal paste application",
            "category": "hardware",
            "estimated_time_minutes": 30
        },
        {
            "step_number": 2,
            "instruction": "Clean dust from CPU cooler and heatsink",
            "category": "hardware",
            "estimated_time_minutes": 20
        }
    ],
    "additional_context": {
        "hardware_components_affected": ["CPU", "CPU_Cooler"],
        "likely_failure_mode": "thermal_throttling",
        "preventive_measures": ["regular_dust_cleaning", "thermal_paste_reapplication"]
    }
}'''
        mock_choice.message = mock_message
        mock_response.choices = [mock_choice]
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        mock_client_class.return_value = mock_client
        
        yield {
            'client_class': mock_client_class,
            'client': mock_client,
            'response': mock_response
        }


@pytest.fixture(scope="function")
def mock_openai_timeout():
    """
    Mock OpenAI client timeout for fallback testing.
    
    Returns:
        MagicMock: Mocked AsyncOpenAI client that raises timeout
    """
    with patch('openai.AsyncOpenAI') as mock_client_class:
        from openai import APIConnectionError
        
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            side_effect=Exception("Connection timeout")
        )
        
        mock_client_class.return_value = mock_client
        
        yield mock_client_class


# ============================================================================
# TEST HELPERS
# ============================================================================

@pytest.fixture(scope="function")
async def cleanup_devices(mock_mongo_client):
    """
    Helper fixture to clean up all devices after a test.
    """
    yield
    await Device.delete_all()


@pytest.fixture(scope="function")
async def cleanup_alerts(mock_mongo_client):
    """
    Helper fixture to clean up all alerts after a test.
    """
    yield
    await AnomalyAlertDocument.delete_all()


@pytest.fixture(scope="function")
async def cleanup_telemetry(mock_mongo_client):
    """
    Helper fixture to clean up all telemetry snapshots after a test.
    """
    yield
    await TelemetrySnapshotDocument.delete_all()
