"""
Pydantic Schemas for API Request/Response Models

This module defines the request and response schemas for all REST API endpoints,
ensuring type safety and validation for incoming and outgoing data.

Author: Lectio Backend Team
Version: 6.0.0
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict
from beanie import PydanticObjectId


# --- Device Schemas ---

class DeviceResponse(BaseModel):
    """Response model for device information."""
    
    id: str = Field(..., description="Device ID")
    device_name: str = Field(..., description="Human-readable device name")
    system_uuid: str = Field(..., description="Unique system identifier (UUID)")
    os_info: Optional[str] = Field(None, description="Operating system information")
    last_seen: Optional[datetime] = Field(None, description="Last telemetry timestamp")
    is_active: bool = Field(True, description="Whether device is actively reporting")
    created_at: datetime = Field(..., description="Device registration timestamp")
    
    model_config = ConfigDict(from_attributes=True)


class DeviceListResponse(BaseModel):
    """Response model for list of devices."""
    
    devices: List[DeviceResponse]
    total_count: int


# --- Telemetry Schemas ---

class CPUMetricsResponse(BaseModel):
    """Response model for CPU metrics."""
    
    utilization_percent: Optional[float] = None
    core_temperature_c: Optional[float] = None
    package_temperature_c: Optional[float] = None
    clock_speed_mhz: Optional[float] = None
    core_count: Optional[int] = None


class GPUMetricsResponse(BaseModel):
    """Response model for GPU metrics."""
    
    utilization_percent: Optional[float] = None
    core_temperature_c: Optional[float] = None
    hotspot_temperature_c: Optional[float] = None
    memory_clock_mhz: Optional[float] = None
    core_clock_mhz: Optional[float] = None
    fan_speed_percent: Optional[float] = None
    power_draw_watts: Optional[float] = None


class StorageMetricsResponse(BaseModel):
    """Response model for storage metrics."""
    
    device_id: str
    model: Optional[str] = None
    serial_number: Optional[str] = None
    health_percent: Optional[float] = None
    temperature_c: Optional[float] = None
    used_gb: Optional[float] = None
    total_gb: Optional[float] = None
    read_speed_mb_s: Optional[float] = None
    write_speed_mb_s: Optional[float] = None


class RAMMetricsResponse(BaseModel):
    """Response model for RAM metrics."""
    
    usage_percent: Optional[float] = None
    used_gb: Optional[float] = None
    total_gb: Optional[float] = None
    clock_speed_mhz: Optional[float] = None


class PowerAndVRMMetricsResponse(BaseModel):
    """Response model for Power and VRM metrics."""
    
    vrm_temperature_c: Optional[float] = None
    psu_12v_voltage: Optional[float] = None
    psu_5v_voltage: Optional[float] = None
    psu_3v3_voltage: Optional[float] = None
    cpu_package_power_w: Optional[float] = None
    gpu_package_power_w: Optional[float] = None


class TelemetrySnapshotResponse(BaseModel):
    """Response model for telemetry snapshot."""
    
    id: str = Field(..., description="Snapshot ID")
    device_id: str = Field(..., description="Device ID")
    timestamp: datetime = Field(..., description="Snapshot timestamp")
    sensor_id: str = Field(..., description="Sensor identifier")
    cpu: Optional[CPUMetricsResponse] = None
    gpu: Optional[GPUMetricsResponse] = None
    storage: Optional[List[StorageMetricsResponse]] = None
    ram: Optional[RAMMetricsResponse] = None
    power_vrm: Optional[PowerAndVRMMetricsResponse] = None
    collection_duration_ms: Optional[float] = None
    
    model_config = ConfigDict(from_attributes=True)


class TelemetryHistoryRequest(BaseModel):
    """Request model for historical telemetry query."""
    
    device_id: str = Field(..., description="Device ID to query")
    start_time: Optional[datetime] = Field(None, description="Start of time range")
    end_time: Optional[datetime] = Field(None, description="End of time range")
    limit: int = Field(100, ge=1, le=1000, description="Maximum number of records")


class TelemetryHistoryResponse(BaseModel):
    """Response model for historical telemetry data."""
    
    snapshots: List[TelemetrySnapshotResponse]
    total_count: int
    device_id: str
    time_range: Optional[Dict[str, datetime]] = None


# --- Alert Schemas ---

class AlertResponse(BaseModel):
    """Response model for anomaly alert."""
    
    id: str = Field(..., description="Alert ID")
    user_id: str = Field(..., description="User ID")
    device_id: str = Field(..., description="Device ID")
    rule_name: str = Field(..., description="Rule that triggered the alert")
    severity: str = Field(..., description="Alert severity (INFO, WARNING, CRITICAL)")
    metric_name: str = Field(..., description="Metric that triggered the alert")
    trigger_value: float = Field(..., description="Value that triggered the alert")
    threshold_limit: float = Field(..., description="Threshold that was exceeded")
    message: str = Field(..., description="Human-readable alert message")
    is_active: bool = Field(..., description="Whether alert is still active")
    created_at: datetime = Field(..., description="Alert creation timestamp")
    resolved_at: Optional[datetime] = Field(None, description="Alert resolution timestamp")
    
    model_config = ConfigDict(from_attributes=True)


class AlertListRequest(BaseModel):
    """Request model for alert list query."""
    
    device_id: Optional[str] = Field(None, description="Filter by device ID")
    severity: Optional[str] = Field(None, description="Filter by severity")
    is_active: Optional[bool] = Field(None, description="Filter by active status")
    start_time: Optional[datetime] = Field(None, description="Start of time range")
    end_time: Optional[datetime] = Field(None, description="End of time range")
    limit: int = Field(100, ge=1, le=500, description="Maximum number of records")


class AlertListResponse(BaseModel):
    """Response model for alert list."""
    
    alerts: List[AlertResponse]
    total_count: int


class AlertAcknowledgeRequest(BaseModel):
    """Request model for acknowledging an alert."""
    
    acknowledged: bool = Field(True, description="Whether to acknowledge the alert")
    notes: Optional[str] = Field(None, description="Optional notes about the acknowledgment")


class AlertAcknowledgeResponse(BaseModel):
    """Response model for alert acknowledgment."""
    
    id: str
    acknowledged: bool
    acknowledged_at: datetime
    notes: Optional[str] = None


# --- Diagnostic Schemas ---

class UrgencyLevel(str):
    """Urgency levels for diagnostic reports."""
    
    IMMEDIATE_ACTION_REQUIRED = "IMMEDIATE_ACTION_REQUIRED"
    ATTENTION_NEEDED = "ATTENTION_NEEDED"
    MONITOR = "MONITOR"


class ActionableStep(BaseModel):
    """Single actionable troubleshooting step."""
    
    step_number: int = Field(..., description="Step number in sequence")
    instruction: str = Field(..., description="Detailed instruction")
    category: str = Field(..., description="Category (e.g., 'hardware', 'software', 'monitoring')")
    estimated_time_minutes: Optional[int] = Field(None, description="Estimated time to complete")


class DiagnosticReport(BaseModel):
    """AI-generated diagnostic report."""
    
    alert_id: str = Field(..., description="ID of the alert being diagnosed")
    device_id: str = Field(..., description="Device ID")
    generated_at: datetime = Field(default_factory=datetime.utcnow, description="Report generation timestamp")
    analysis_method: str = Field(..., description="Method used (LLM or rule-based)")
    
    root_cause_analysis: str = Field(
        ...,
        description="Concise explanation of what failed"
    )
    
    urgency_level: str = Field(
        ...,
        description="Urgency level (IMMEDIATE_ACTION_REQUIRED, ATTENTION_NEEDED, MONITOR)"
    )
    
    actionable_steps: List[ActionableStep] = Field(
        ...,
        description="Ordered list of troubleshooting steps"
    )
    
    additional_context: Optional[Dict[str, Any]] = Field(
        None,
        description="Additional context or recommendations"
    )


class DiagnosticRequest(BaseModel):
    """Request model for diagnostic analysis."""
    
    alert_id: str = Field(..., description="Alert ID to analyze")
    device_id: str = Field(..., description="Device ID")


class DiagnosticResponse(BaseModel):
    """Response model for diagnostic analysis."""
    
    report: DiagnosticReport
    success: bool
    message: Optional[str] = None


# --- Statistics Schemas ---

class AlertStatisticsResponse(BaseModel):
    """Response model for alert statistics."""
    
    total_alerts: int
    active_alerts: int
    resolved_alerts: int
    critical_count: int
    warning_count: int
    info_count: int
    rule_counts: Dict[str, int]
    period_days: int


class DeviceStatisticsResponse(BaseModel):
    """Response model for device statistics."""
    
    total_devices: int
    active_devices: int
    inactive_devices: int
    device_types: Dict[str, int]
