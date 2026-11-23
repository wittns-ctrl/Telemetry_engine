"""
Pydantic Schemas for API Request/Response Models

This module defines the request and response schemas for all REST API endpoints,
ensuring type safety and validation for incoming and outgoing data.

Author: Lectio Backend Team
Version: 6.0.0
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict, field_validator
from beanie import PydanticObjectId
from app.core.countries import canonical_country

from app.models.telemetry import (
    CPUMetrics,
    GPUMetrics,
    PowerAndVRMMetrics,
    DiskActivityMetrics,
    NetworkMetrics,
    ProcessMetrics,
    RAMMetrics,
    StorageMetrics,
    TelemetrySnapshotDocument,
)


# --- Device Schemas ---

class DeviceResponse(BaseModel):
    """Response model for device information."""
    
    id: str = Field(..., description="Device ID")
    device_name: str = Field(..., description="Human-readable device name")
    system_uuid: str = Field(..., description="Unique system identifier (UUID)")
    os_info: Optional[str] = Field(None, description="Operating system information")
    country: Optional[str] = Field(None, description="Country the device is in, as the map spells it")
    last_seen: Optional[datetime] = Field(None, description="Last telemetry timestamp")
    agent_version: Optional[str] = Field(None, description="Version of the Lectio agent on this PC")
    agent_last_seen: Optional[datetime] = Field(None, description="When the agent last checked in for fixes")
    is_active: bool = Field(True, description="Whether device is actively reporting")
    created_at: datetime = Field(..., description="Device registration timestamp")
    
    model_config = ConfigDict(from_attributes=True)


class DeviceListResponse(BaseModel):
    """Response model for list of devices."""
    
    devices: List[DeviceResponse]
    total_count: int


class DeviceRegisterRequest(BaseModel):
    """Request body sent by the host agent to register a machine."""

    device_name: str = Field(..., min_length=1, max_length=128, description="Human-readable device name")
    system_uuid: str = Field(..., min_length=8, max_length=128, description="Stable per-machine identifier")
    os_info: Optional[str] = Field(None, max_length=256, description="Operating system description")
    country: Optional[str] = Field(None, max_length=64, description="Country the machine is in (see GET /devices/countries)")

    @field_validator("country")
    @classmethod
    def _country(cls, value: Optional[str]) -> Optional[str]:
        return canonical_country(value)


class DeviceUpdateRequest(BaseModel):
    """Fields a user may change on their device. Send country: null to clear it."""

    device_name: Optional[str] = Field(None, min_length=1, max_length=128)
    country: Optional[str] = Field(None, max_length=64)

    @field_validator("device_name")
    @classmethod
    def _name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Device name cannot be blank")
        return value

    @field_validator("country")
    @classmethod
    def _country(cls, value: Optional[str]) -> Optional[str]:
        return canonical_country(value)


class DeviceRegisterResponse(BaseModel):
    """Registration result. device_key is only ever returned here; store it on the agent."""

    device: DeviceResponse
    device_key: str = Field(..., description="Secret key the agent sends as X-Device-Key")


class TelemetryIngestResponse(BaseModel):
    """Response for an accepted telemetry snapshot."""

    status: str = "accepted"
    snapshot_id: str
    alerts_triggered: int = 0


# --- Telemetry Schemas ---

class TelemetrySnapshotResponse(BaseModel):
    """Response model for telemetry snapshot."""
    
    id: str = Field(..., description="Snapshot ID")
    device_id: str = Field(..., description="Device ID")
    timestamp: datetime = Field(..., description="Snapshot timestamp")
    sensor_id: str = Field(..., description="Sensor identifier")
    # Same shapes the agent sends and the live WebSocket relays, so every
    # reading reaches the client under one set of field names.
    cpu: CPUMetrics = Field(default_factory=CPUMetrics)
    gpu: GPUMetrics = Field(default_factory=GPUMetrics)
    storage: List[StorageMetrics] = Field(default_factory=list)
    ram: RAMMetrics = Field(default_factory=RAMMetrics)
    power_vrm: PowerAndVRMMetrics = Field(default_factory=PowerAndVRMMetrics)
    disk: DiskActivityMetrics = Field(default_factory=DiskActivityMetrics)
    network: NetworkMetrics = Field(default_factory=NetworkMetrics)
    processes: List[ProcessMetrics] = Field(default_factory=list)
    collection_duration_ms: Optional[float] = None
    
    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_document(cls, doc: TelemetrySnapshotDocument) -> "TelemetrySnapshotResponse":
        return cls(
            id=str(doc.id),
            device_id=str(doc.device_id),
            timestamp=doc.timestamp,
            sensor_id=doc.sensor_id,
            cpu=doc.cpu,
            gpu=doc.gpu,
            storage=doc.storage,
            ram=doc.ram,
            power_vrm=doc.power_vrm,
            disk=doc.disk,
            network=doc.network,
            processes=doc.processes,
            collection_duration_ms=doc.collection_duration_ms,
        )


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
    resolved_reason: Optional[str] = Field(None, description="Why it closed: recovered, no_reading or closed_by_user")
    
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
