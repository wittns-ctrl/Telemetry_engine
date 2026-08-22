from typing import Annotated, Literal, Optional
from pydantic import BaseModel, Field, PositiveFloat
from datetime import datetime


# Base schema with shared telemetry fields

class BaseTelemetryPayload(BaseModel):
    sensor_id: str = Field(..., min_length=3, max_length=64, examples=["sensor_room_101"])


# 1. Temperature sensor schema

class TemperatureTelemetryPayload(BaseTelemetryPayload):
    metric_type: Literal["temperature"]  # the discriminator tag
    value: float = Field(..., ge=-50.0, le=150.0, description="Temperature in Celcius")
    unit: Literal["C", "F", "K"] = "C"


class CPUTelemetryPayload(BaseTelemetryPayload):
    metric_type: Literal["cpu"]
    value: float = Field(..., ge=0.0, le=100.0, description="CPU usage percentage")
    core_count: int = Field(..., gt=0)
    process_count: int = Field(..., ge=0)


class NetworkTelemetryPayload(BaseTelemetryPayload):
    metric_type: Literal["network"]
    value: PositiveFloat = Field(..., description="Throughput in MB/s")
    bytes_sent: int = Field(..., ge=0)
    bytes_recv: int = Field(..., ge=0)


# Discriminated Union

TelemetryPayload = Annotated[
    TemperatureTelemetryPayload | CPUTelemetryPayload | NetworkTelemetryPayload,
    Field(discriminator="metric_type")
]


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
    thermal_throttling: bool = Field(default=False, description="Thermal throttling status")


class GPUMetrics(BaseModel):
    """Comprehensive GPU telemetry metrics."""
    core_temperature_c: Optional[float] = Field(None, description="GPU core temperature in Celsius")
    hotspot_temperature_c: Optional[float] = Field(None, description="GPU hotspot temperature in Celsius")
    utilization_percent: Optional[float] = Field(None, ge=0.0, le=100.0, description="GPU utilization percentage")
    fan_speed_percent: Optional[float] = Field(None, ge=0.0, le=100.0, description="GPU fan speed percentage")
    vram_used_gb: Optional[float] = Field(None, ge=0.0, description="VRAM used in GB")
    vram_total_gb: Optional[float] = Field(None, ge=0.0, description="Total VRAM in GB")
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


class PowerAndVRMMetrics(BaseModel):
    """Power delivery and VRM thermal metrics."""
    vrm_temperature_c: Optional[float] = Field(None, description="Motherboard VRM temperature in Celsius")
    psu_12v_voltage: Optional[float] = Field(None, ge=0.0, description="PSU +12V voltage rail in volts")
    chipset_temperature_c: Optional[float] = Field(None, description="Chipset temperature in Celsius")
    chassis_fan_speed_rpm: Optional[int] = Field(None, ge=0, description="Chassis fan speed in RPM")


class TelemetrySnapshot(BaseModel):
    """Complete hardware telemetry snapshot."""
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Snapshot timestamp")
    sensor_id: str = Field(..., min_length=3, max_length=64, description="Sensor identifier")
    cpu: CPUMetrics = Field(default_factory=CPUMetrics, description="CPU metrics")
    gpu: GPUMetrics = Field(default_factory=GPUMetrics, description="GPU metrics")
    storage: list[StorageMetrics] = Field(default_factory=list, description="Storage metrics for all drives")
    ram: RAMMetrics = Field(default_factory=RAMMetrics, description="RAM metrics")
    power_vrm: PowerAndVRMMetrics = Field(default_factory=PowerAndVRMMetrics, description="Power and VRM metrics")
    collection_duration_ms: Optional[float] = Field(None, ge=0.0, description="Collection duration in milliseconds")