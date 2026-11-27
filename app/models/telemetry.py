from typing import Optional
from pydantic import BaseModel, Field, PrivateAttr
from datetime import datetime, timezone
from beanie import Delete, Document, Indexed, Replace, Save, SaveChanges, Update, after_event
from beanie.odm.fields import PydanticObjectId
from pymongo import IndexModel, ASCENDING, DESCENDING

from app.core.config import settings

# The TTL index on telemetry_snapshots.timestamp (see TelemetrySnapshotDocument).
TELEMETRY_TIMESTAMP_INDEX = "timestamp_1"
# Single-field indexes older databases have on telemetry_snapshots, covered by
# user_device_time and dropped by app.db.session.
TELEMETRY_DROPPED_INDEXES = ("user_id_1", "device_id_1")


def telemetry_retention_seconds() -> int:
    return settings.TELEMETRY_RETENTION_DAYS * 24 * 60 * 60


# ============================================================================
# COMPREHENSIVE HARDWARE TELEMETRY MODELS FOR PHASE 2
# ============================================================================


class CPUMetrics(BaseModel):
    """Comprehensive CPU telemetry metrics."""
    core_temperature_c: Optional[float] = Field(None, description="Core temperature in Celsius")
    package_temperature_c: Optional[float] = Field(None, description="Package temperature in Celsius")
    utilization_percent: Optional[float] = Field(None, ge=0.0, le=100.0, description="CPU utilization percentage")
    clock_speed_ghz: Optional[float] = Field(None, ge=0.0, description="CPU clock speed in GHz")
    package_power_w: Optional[float] = Field(None, ge=0.0, description="Package power draw in watts")
    fan_speed_rpm: Optional[int] = Field(None, ge=0, description="CPU fan speed in RPM")
    # None when the PC can't say (needs a hardware sensor reader); never guessed.
    thermal_throttling: Optional[bool] = Field(default=None, description="Thermal throttling status")
    # Task Manager's Performance > CPU figures.
    process_count: Optional[int] = Field(None, ge=0, description="Running processes")
    thread_count: Optional[int] = Field(None, ge=0, description="Running threads")
    handle_count: Optional[int] = Field(None, ge=0, description="Open handles")
    uptime_seconds: Optional[int] = Field(None, ge=0, description="Time since Windows started, in seconds")


class GPUMetrics(BaseModel):
    """Comprehensive GPU telemetry metrics."""
    core_temperature_c: Optional[float] = Field(None, description="GPU core temperature in Celsius")
    hotspot_temperature_c: Optional[float] = Field(None, description="GPU hotspot temperature in Celsius")
    utilization_percent: Optional[float] = Field(None, ge=0.0, le=100.0, description="GPU utilization percentage")
    fan_speed_percent: Optional[float] = Field(None, ge=0.0, le=100.0, description="GPU fan speed percentage")
    vram_used_gb: Optional[float] = Field(None, ge=0.0, description="VRAM used in GB")
    vram_total_gb: Optional[float] = Field(None, ge=0.0, description="Total VRAM in GB")
    shared_memory_used_gb: Optional[float] = Field(None, ge=0.0, description="Shared GPU memory in use, in GB")
    board_power_w: Optional[float] = Field(None, ge=0.0, description="GPU board power draw in watts")
    gpu_name: Optional[str] = Field(None, description="GPU model name")


class StorageMetrics(BaseModel):
    """Storage and NVMe/SSD health metrics."""
    device_name: Optional[str] = Field(None, description="Storage device name")
    smart_health_percent: Optional[int] = Field(None, ge=0, le=100, description="S.M.A.R.T. health percentage")
    total_bytes_written_tbw: Optional[float] = Field(None, ge=0.0, description="Total bytes written in TBW")
    temperature_c: Optional[float] = Field(None, description="Storage temperature in Celsius")
    reallocated_sector_count: Optional[int] = Field(None, ge=0, description="Reallocated sector count")
    bad_sector_count: Optional[int] = Field(None, ge=0, description="Bad sector count")
    available_capacity_gb: Optional[float] = Field(None, ge=0.0, description="Available capacity in GB")
    total_capacity_gb: Optional[float] = Field(None, ge=0.0, description="Total capacity in GB")


class RAMMetrics(BaseModel):
    """RAM and memory-related metrics."""
    usage_percent: Optional[float] = Field(None, ge=0.0, le=100.0, description="RAM usage percentage")
    used_gb: Optional[float] = Field(None, ge=0.0, description="Used RAM in GB")
    total_gb: Optional[float] = Field(None, ge=0.0, description="Total RAM in GB")
    pagefile_usage_percent: Optional[float] = Field(None, ge=0.0, le=100.0, description="Pagefile usage percentage")
    whea_error_count: int = Field(default=0, description="WHEA hardware error count")
    committed_gb: Optional[float] = Field(None, ge=0.0, description="Committed memory in GB")
    commit_limit_gb: Optional[float] = Field(None, ge=0.0, description="Commit limit in GB")


class PowerAndVRMMetrics(BaseModel):
    """Power delivery and VRM thermal metrics."""
    vrm_temperature_c: Optional[float] = Field(None, description="Motherboard VRM temperature in Celsius")
    psu_12v_voltage: Optional[float] = Field(None, ge=0.0, description="PSU +12V voltage rail in volts")
    chipset_temperature_c: Optional[float] = Field(None, description="Chipset temperature in Celsius")
    chassis_fan_speed_rpm: Optional[int] = Field(None, ge=0, description="Chassis fan speed in RPM")


class DiskActivityMetrics(BaseModel):
    """All physical disks together, as Task Manager's Disk graph shows them."""
    active_percent: Optional[float] = Field(None, ge=0.0, le=100.0, description="Active time, percent")
    read_bytes_per_s: Optional[float] = Field(None, ge=0.0, description="Read speed, bytes per second")
    write_bytes_per_s: Optional[float] = Field(None, ge=0.0, description="Write speed, bytes per second")


class NetworkMetrics(BaseModel):
    """The busiest network adapter, as Task Manager's Ethernet / Wi-Fi graph shows it."""
    adapter_name: Optional[str] = Field(None, max_length=128, description="Network adapter")
    receive_bytes_per_s: Optional[float] = Field(None, ge=0.0, description="Download speed, bytes per second")
    send_bytes_per_s: Optional[float] = Field(None, ge=0.0, description="Upload speed, bytes per second")
    link_speed_mbps: Optional[float] = Field(None, ge=0.0, description="Adapter link speed, Mbps")


class ProcessMetrics(BaseModel):
    """One busy program, as Task Manager's Processes tab shows it."""
    name: str = Field(..., max_length=128)
    pid: int = Field(..., ge=0)
    cpu_percent: float = Field(0.0, ge=0.0, le=100.0, description="Share of the whole CPU")
    memory_mb: Optional[float] = Field(None, ge=0.0, description="Private working set, MB")
    disk_bytes_per_s: Optional[float] = Field(None, ge=0.0, description="Disk read + write, bytes per second")


class ThreatInfo(BaseModel):
    """One detection in Microsoft Defender's history (the last 30 days)."""
    name: str = Field(..., max_length=128)
    severity: str = Field("unknown", max_length=16)
    status: str = Field("unknown", max_length=16)  # quarantined, removed, blocked, allowed, detected, failed...
    active: bool = Field(False, description="Still on the PC and needing action")
    executed: bool = Field(False, description="It ran before Defender stopped it")
    path: str = Field("", max_length=300)
    detected_at: datetime


class SuspiciousProcessInfo(BaseModel):
    """A Windows program name running from outside Windows' own folders."""
    name: str = Field(..., max_length=64)
    path: str = Field(..., max_length=300)
    pid: int = Field(..., ge=0)


class SecurityMetrics(BaseModel):
    """What the PC's antivirus reports; refreshed by the agent every 2 minutes."""
    checked_at: datetime
    antivirus: Optional[str] = Field(None, max_length=128, description="The active antivirus product")
    defender_active: Optional[bool] = None
    realtime_protection: Optional[bool] = None
    tamper_protected: Optional[bool] = None
    definitions_age_days: Optional[int] = Field(None, ge=0)
    definitions_version: Optional[str] = Field(None, max_length=32)
    definitions_updated_at: Optional[datetime] = None
    quick_scan_age_days: Optional[int] = Field(None, ge=0)
    last_quick_scan_at: Optional[datetime] = None
    full_scan_age_days: Optional[int] = Field(None, ge=0)
    last_full_scan_at: Optional[datetime] = None
    threats: list[ThreatInfo] = Field(default_factory=list, max_length=20)
    suspicious_processes: list[SuspiciousProcessInfo] = Field(default_factory=list, max_length=10)

    @property
    def other_antivirus(self) -> bool:
        """Another product than Defender is the active antivirus."""
        return bool(self.antivirus) and "defender" not in (self.antivirus or "").lower()


class TelemetrySnapshot(BaseModel):
    """Complete hardware telemetry snapshot."""
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Snapshot timestamp")
    sensor_id: str = Field(..., min_length=3, max_length=64, description="Sensor identifier")
    cpu: CPUMetrics = Field(default_factory=CPUMetrics, description="CPU metrics")
    gpu: GPUMetrics = Field(default_factory=GPUMetrics, description="GPU metrics")
    storage: list[StorageMetrics] = Field(default_factory=list, description="Storage metrics for all drives")
    ram: RAMMetrics = Field(default_factory=RAMMetrics, description="RAM metrics")
    power_vrm: PowerAndVRMMetrics = Field(default_factory=PowerAndVRMMetrics, description="Power and VRM metrics")
    disk: DiskActivityMetrics = Field(default_factory=DiskActivityMetrics, description="Disk activity")
    network: NetworkMetrics = Field(default_factory=NetworkMetrics, description="Network activity")
    processes: list[ProcessMetrics] = Field(default_factory=list, max_length=20, description="Busiest programs")
    collection_duration_ms: Optional[float] = Field(None, ge=0.0, description="Collection duration in milliseconds")
    # Not stored with every reading (it changes rarely); the latest is kept on the Device.
    security: Optional[SecurityMetrics] = Field(None, description="Antivirus status and threats")


# ============================================================================
# BEANIE ODM DOCUMENT MODELS FOR PHASE 3 - PERSISTENCE & TIME-SERIES LOGGING
# ============================================================================


class Device(Document):
    """
    Device document representing a user's hardware device.
    
    This model stores device information and links it to the authenticated user.
    Each device has a unique system UUID for identification across sessions.
    """
    user_id: Indexed(PydanticObjectId, description="Reference to the User who owns this device")
    device_name: str = Field(..., min_length=1, max_length=128, description="Human-readable device name")
    system_uuid: Indexed(str, unique=True, description="Unique system identifier (UUID)")
    os_info: Optional[str] = Field(None, description="Operating system information")
    # English country name as spelled by the map data (app/core/countries.py); None until set.
    country: Optional[str] = Field(None, description="Country the device is in")
    is_active: bool = Field(default=True, description="Device active status")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Device registration timestamp")
    last_seen: Optional[datetime] = Field(None, description="Last telemetry collection timestamp")
    # Updated each time the agent checks for fixes (GET /agent/fixes/next).
    agent_version: Optional[str] = Field(None, max_length=32, description="Version of the Lectio agent on this PC")
    agent_last_seen: Optional[datetime] = Field(None, description="When the agent last checked in")
    # The latest antivirus report (the agent refreshes it every 2 minutes).
    security: Optional[SecurityMetrics] = Field(None, description="Latest antivirus status and threats")
    # SHA-256 of the agent's device key. The plaintext key is shown once at registration.
    ingest_key_hash: Optional[str] = Field(None, description="Hash of the device ingest key")
    _loaded_key_hash: Optional[str] = PrivateAttr(default=None)
    
    @after_event(Save, Replace, SaveChanges, Update, Delete)
    async def _forget_cached_copies(self):
        """Drop this device's cache entries (app/core/cache.py) when it changes."""
        from app.core.cache import cache, device_key_key, latest_key, ownership_key
        keys = [ownership_key(self.user_id, self.id), latest_key(self.id)]
        # The key it was loaded with too: when the key changes, the old one must stop working now.
        for key_hash in {self.ingest_key_hash, self._loaded_key_hash}:
            if key_hash:
                keys.append(device_key_key(key_hash))
        await cache.delete(*keys)
        self._loaded_key_hash = self.ingest_key_hash

    def model_post_init(self, context) -> None:
        super().model_post_init(context)
        self._loaded_key_hash = self.ingest_key_hash

    class Settings:
        name = "devices"
        indexes = [
            "user_id",
            "system_uuid",
            # Partial, not sparse: a sparse index still indexes explicit nulls, so
            # two devices without a key yet would collide on the unique constraint.
            IndexModel(
                [("ingest_key_hash", ASCENDING)],
                name="ingest_key_hash_1",
                unique=True,
                partialFilterExpression={"ingest_key_hash": {"$type": "string"}},
            ),
        ]


class TelemetrySnapshotDocument(Document):
    """
    Time-series telemetry snapshot document for persistent storage.
    
    This model stores hardware telemetry snapshots. MongoDB deletes each one
    TELEMETRY_RETENTION_DAYS after its timestamp (TTL index below). All queries
    enforce multi-tenant isolation through user_id and device_id filtering.
    """
    # Not indexed on their own: every query filters by user (and device), which
    # the user_device_time index below serves; a separate index on each only
    # slowed every upload down. app.db.session drops them from older databases.
    device_id: PydanticObjectId = Field(..., description="Reference to the Device")
    user_id: PydanticObjectId = Field(..., description="Reference to the User for tenant isolation")
    # Indexed by the TTL index in Settings, not here: MongoDB allows one index
    # per key pattern, and a plain one would block the TTL options.
    timestamp: datetime = Field(..., description="Telemetry collection timestamp (UTC)")
    sensor_id: str = Field(..., min_length=3, max_length=64, description="Sensor identifier")
    
    # Embedded telemetry metrics
    cpu: CPUMetrics = Field(default_factory=CPUMetrics, description="CPU metrics")
    gpu: GPUMetrics = Field(default_factory=GPUMetrics, description="GPU metrics")
    storage: list[StorageMetrics] = Field(default_factory=list, description="Storage metrics for all drives")
    ram: RAMMetrics = Field(default_factory=RAMMetrics, description="RAM metrics")
    power_vrm: PowerAndVRMMetrics = Field(default_factory=PowerAndVRMMetrics, description="Power and VRM metrics")
    disk: DiskActivityMetrics = Field(default_factory=DiskActivityMetrics, description="Disk activity")
    network: NetworkMetrics = Field(default_factory=NetworkMetrics, description="Network activity")
    processes: list[ProcessMetrics] = Field(default_factory=list, description="Busiest programs")
    
    collection_duration_ms: Optional[float] = Field(None, ge=0.0, description="Collection duration in milliseconds")
    # Set by the agent for each reading; a resent reading has the same id and
    # is ignored (unique per device, below). Older readings have none.
    event_id: Optional[str] = Field(None, description="Agent-chosen unique id of this reading")

    class Settings:
        name = "telemetry_snapshots"
        indexes = [
            # Every dashboard read: one device's readings, newest first.
            IndexModel(
                [("user_id", ASCENDING), ("device_id", ASCENDING), ("timestamp", DESCENDING)],
                name="user_device_time",
            ),
            # Duplicate prevention for resent readings. Partial, so the many
            # readings without an event id don't collide with each other.
            IndexModel(
                [("device_id", ASCENDING), ("event_id", ASCENDING)],
                name="device_event_unique",
                unique=True,
                partialFilterExpression={"event_id": {"$type": "string"}},
            ),
            # Serves time-range queries and is a TTL index: MongoDB's background
            # task removes readings older than the retention period (it runs
            # about once a minute). app.db.session migrates older databases.
            IndexModel(
                [("timestamp", ASCENDING)],
                name=TELEMETRY_TIMESTAMP_INDEX,
                expireAfterSeconds=telemetry_retention_seconds(),
            ),
        ]