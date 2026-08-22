"""
Telemetry Metrics REST API Endpoints

This module provides REST API endpoints for querying historical telemetry
data and retrieving the latest snapshot for a specific device.

Author: Lectio Backend Team
Version: 6.0.0
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from beanie import PydanticObjectId

from app.api.deps import get_current_user
from app.models.user import User
from app.models.telemetry import TelemetrySnapshotDocument
from app.services.storage_service import StorageService
from app.schemas.api import (
    TelemetryHistoryRequest,
    TelemetryHistoryResponse,
    TelemetrySnapshotResponse,
    CPUMetricsResponse,
    GPUMetricsResponse,
    StorageMetricsResponse,
    RAMMetricsResponse,
    PowerAndVRMMetricsResponse
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/metrics/history",
    response_model=TelemetryHistoryResponse,
    summary="Query Historical Telemetry",
    description="Retrieve historical telemetry snapshots for a device with optional time range filtering"
)
async def get_historical_metrics(
    device_id: str = Query(..., description="Device ID to query"),
    start_time: Optional[datetime] = Query(None, description="Start of time range (ISO 8601)"),
    end_time: Optional[datetime] = Query(None, description="End of time range (ISO 8601)"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of records"),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve historical telemetry snapshots for a specific device.
    
    Args:
        device_id: The device ID to query
        start_time: Optional start of time range
        end_time: Optional end of time range
        limit: Maximum number of records to return
        current_user: The authenticated user
        
    Returns:
        TelemetryHistoryResponse containing snapshots and metadata
        
    Raises:
        HTTPException: If device not found or doesn't belong to user
    """
    try:
        user_id = str(current_user.id)
        
        # Validate device ID format
        try:
            device_oid = PydanticObjectId(device_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid device ID format"
            )
        
        # Verify device belongs to user (tenant isolation)
        user_devices = await StorageService.get_user_devices(user_id)
        device_belongs_to_user = any(
            str(device.id) == device_id for device in user_devices
        )
        
        if not device_belongs_to_user:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Device does not belong to user"
            )
        
        # Query historical telemetry
        snapshots = await StorageService.get_historical_telemetry(
            user_id=user_id,
            device_id=device_id,
            start_time=start_time,
            end_time=end_time,
            limit=limit
        )
        
        # Convert to response models
        snapshot_responses = []
        for snapshot in snapshots:
            cpu_response = None
            if snapshot.telemetry and snapshot.telemetry.cpu:
                cpu_response = CPUMetricsResponse(
                    utilization_percent=snapshot.telemetry.cpu.utilization_percent,
                    core_temperature_c=snapshot.telemetry.cpu.core_temperature_c,
                    package_temperature_c=snapshot.telemetry.cpu.package_temperature_c,
                    clock_speed_mhz=snapshot.telemetry.cpu.clock_speed_mhz,
                    core_count=snapshot.telemetry.cpu.core_count
                )
            
            gpu_response = None
            if snapshot.telemetry and snapshot.telemetry.gpu:
                gpu_response = GPUMetricsResponse(
                    utilization_percent=snapshot.telemetry.gpu.utilization_percent,
                    core_temperature_c=snapshot.telemetry.gpu.core_temperature_c,
                    hotspot_temperature_c=snapshot.telemetry.gpu.hotspot_temperature_c,
                    memory_clock_mhz=snapshot.telemetry.gpu.memory_clock_mhz,
                    core_clock_mhz=snapshot.telemetry.gpu.core_clock_mhz,
                    fan_speed_percent=snapshot.telemetry.gpu.fan_speed_percent,
                    power_draw_watts=snapshot.telemetry.gpu.power_draw_watts
                )
            
            storage_responses = []
            if snapshot.telemetry and snapshot.telemetry.storage:
                for storage in snapshot.telemetry.storage:
                    storage_responses.append(StorageMetricsResponse(
                        device_id=storage.device_id,
                        model=storage.model,
                        serial_number=storage.serial_number,
                        health_percent=storage.health_percent,
                        temperature_c=storage.temperature_c,
                        used_gb=storage.used_gb,
                        total_gb=storage.total_gb,
                        read_speed_mb_s=storage.read_speed_mb_s,
                        write_speed_mb_s=storage.write_speed_mb_s
                    ))
            
            ram_response = None
            if snapshot.telemetry and snapshot.telemetry.ram:
                ram_response = RAMMetricsResponse(
                    usage_percent=snapshot.telemetry.ram.usage_percent,
                    used_gb=snapshot.telemetry.ram.used_gb,
                    total_gb=snapshot.telemetry.ram.total_gb,
                    clock_speed_mhz=snapshot.telemetry.ram.clock_speed_mhz
                )
            
            power_response = None
            if snapshot.telemetry and snapshot.telemetry.power_vrm:
                power_response = PowerAndVRMMetricsResponse(
                    vrm_temperature_c=snapshot.telemetry.power_vrm.vrm_temperature_c,
                    psu_12v_voltage=snapshot.telemetry.power_vrm.psu_12v_voltage,
                    psu_5v_voltage=snapshot.telemetry.power_vrm.psu_5v_voltage,
                    psu_3v3_voltage=snapshot.telemetry.power_vrm.psu_3v3_voltage,
                    cpu_package_power_w=snapshot.telemetry.power_vrm.cpu_package_power_w,
                    gpu_package_power_w=snapshot.telemetry.power_vrm.gpu_package_power_w
                )
            
            snapshot_responses.append(TelemetrySnapshotResponse(
                id=str(snapshot.id),
                device_id=str(snapshot.device_id),
                timestamp=snapshot.timestamp,
                sensor_id=snapshot.sensor_id,
                cpu=cpu_response,
                gpu=gpu_response,
                storage=storage_responses if storage_responses else None,
                ram=ram_response,
                power_vrm=power_response,
                collection_duration_ms=snapshot.collection_duration_ms
            ))
        
        # Build time range info
        time_range = None
        if start_time or end_time:
            time_range = {}
            if start_time:
                time_range["start_time"] = start_time
            if end_time:
                time_range["end_time"] = end_time
        
        return TelemetryHistoryResponse(
            snapshots=snapshot_responses,
            total_count=len(snapshot_responses),
            device_id=device_id,
            time_range=time_range
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving historical metrics for device {device_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve historical metrics"
        )


@router.get(
    "/metrics/latest",
    response_model=TelemetrySnapshotResponse,
    summary="Get Latest Telemetry Snapshot",
    description="Retrieve the most recent telemetry snapshot for a specific device"
)
async def get_latest_metrics(
    device_id: str = Query(..., description="Device ID to query"),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve the most recent telemetry snapshot for a specific device.
    
    Args:
        device_id: The device ID to query
        current_user: The authenticated user
        
    Returns:
        TelemetrySnapshotResponse with the latest snapshot
        
    Raises:
        HTTPException: If device not found, doesn't belong to user, or no data available
    """
    try:
        user_id = str(current_user.id)
        
        # Validate device ID format
        try:
            device_oid = PydanticObjectId(device_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid device ID format"
            )
        
        # Verify device belongs to user (tenant isolation)
        user_devices = await StorageService.get_user_devices(user_id)
        device_belongs_to_user = any(
            str(device.id) == device_id for device in user_devices
        )
        
        if not device_belongs_to_user:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Device does not belong to user"
            )
        
        # Query latest telemetry (limit=1, sorted by timestamp descending)
        snapshots = await StorageService.get_historical_telemetry(
            user_id=user_id,
            device_id=device_id,
            limit=1
        )
        
        if not snapshots:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No telemetry data available for this device"
            )
        
        snapshot = snapshots[0]
        
        # Convert to response model
        cpu_response = None
        if snapshot.telemetry and snapshot.telemetry.cpu:
            cpu_response = CPUMetricsResponse(
                utilization_percent=snapshot.telemetry.cpu.utilization_percent,
                core_temperature_c=snapshot.telemetry.cpu.core_temperature_c,
                package_temperature_c=snapshot.telemetry.cpu.package_temperature_c,
                clock_speed_mhz=snapshot.telemetry.cpu.clock_speed_mhz,
                core_count=snapshot.telemetry.cpu.core_count
            )
        
        gpu_response = None
        if snapshot.telemetry and snapshot.telemetry.gpu:
            gpu_response = GPUMetricsResponse(
                utilization_percent=snapshot.telemetry.gpu.utilization_percent,
                core_temperature_c=snapshot.telemetry.gpu.core_temperature_c,
                hotspot_temperature_c=snapshot.telemetry.gpu.hotspot_temperature_c,
                memory_clock_mhz=snapshot.telemetry.gpu.memory_clock_mhz,
                core_clock_mhz=snapshot.telemetry.gpu.core_clock_mhz,
                fan_speed_percent=snapshot.telemetry.gpu.fan_speed_percent,
                power_draw_watts=snapshot.telemetry.gpu.power_draw_watts
            )
        
        storage_responses = []
        if snapshot.telemetry and snapshot.telemetry.storage:
            for storage in snapshot.telemetry.storage:
                storage_responses.append(StorageMetricsResponse(
                    device_id=storage.device_id,
                    model=storage.model,
                    serial_number=storage.serial_number,
                    health_percent=storage.health_percent,
                    temperature_c=storage.temperature_c,
                    used_gb=storage.used_gb,
                    total_gb=storage.total_gb,
                    read_speed_mb_s=storage.read_speed_mb_s,
                    write_speed_mb_s=storage.write_speed_mb_s
                ))
        
        ram_response = None
        if snapshot.telemetry and snapshot.telemetry.ram:
            ram_response = RAMMetricsResponse(
                usage_percent=snapshot.telemetry.ram.usage_percent,
                used_gb=snapshot.telemetry.ram.used_gb,
                total_gb=snapshot.telemetry.ram.total_gb,
                clock_speed_mhz=snapshot.telemetry.ram.clock_speed_mhz
            )
        
        power_response = None
        if snapshot.telemetry and snapshot.telemetry.power_vrm:
            power_response = PowerAndVRMMetricsResponse(
                vrm_temperature_c=snapshot.telemetry.power_vrm.vrm_temperature_c,
                psu_12v_voltage=snapshot.telemetry.power_vrm.psu_12v_voltage,
                psu_5v_voltage=snapshot.telemetry.power_vrm.psu_5v_voltage,
                psu_3v3_voltage=snapshot.telemetry.power_vrm.psu_3v3_voltage,
                cpu_package_power_w=snapshot.telemetry.power_vrm.cpu_package_power_w,
                gpu_package_power_w=snapshot.telemetry.power_vrm.gpu_package_power_w
            )
        
        return TelemetrySnapshotResponse(
            id=str(snapshot.id),
            device_id=str(snapshot.device_id),
            timestamp=snapshot.timestamp,
            sensor_id=snapshot.sensor_id,
            cpu=cpu_response,
            gpu=gpu_response,
            storage=storage_responses if storage_responses else None,
            ram=ram_response,
            power_vrm=power_response,
            collection_duration_ms=snapshot.collection_duration_ms
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving latest metrics for device {device_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve latest metrics"
        )


@router.get(
    "/metrics/summary",
    summary="Get Telemetry Summary",
    description="Retrieve summary statistics for a device's telemetry data"
)
async def get_metrics_summary(
    device_id: str = Query(..., description="Device ID to query"),
    hours: int = Query(24, ge=1, le=168, description="Number of hours to analyze"),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve summary statistics for a device's telemetry data.
    
    Args:
        device_id: The device ID to query
        hours: Number of hours to analyze (default: 24)
        current_user: The authenticated user
        
    Returns:
        Dictionary with summary statistics
    """
    try:
        user_id = str(current_user.id)
        
        # Validate device ID format
        try:
            device_oid = PydanticObjectId(device_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid device ID format"
            )
        
        # Verify device belongs to user (tenant isolation)
        user_devices = await StorageService.get_user_devices(user_id)
        device_belongs_to_user = any(
            str(device.id) == device_id for device in user_devices
        )
        
        if not device_belongs_to_user:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Device does not belong to user"
            )
        
        # Calculate time range
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(hours=hours)
        
        # Query telemetry for the time range
        snapshots = await StorageService.get_historical_telemetry(
            user_id=user_id,
            device_id=device_id,
            start_time=start_time,
            end_time=end_time,
            limit=1000
        )
        
        if not snapshots:
            return {
                "device_id": device_id,
                "time_range_hours": hours,
                "snapshot_count": 0,
                "message": "No telemetry data available for the specified time range"
            }
        
        # Calculate summary statistics
        cpu_temps = []
        gpu_temps = []
        ram_usage = []
        
        for snapshot in snapshots:
            if snapshot.telemetry:
                if snapshot.telemetry.cpu:
                    cpu_temps.append(snapshot.telemetry.cpu.core_temperature_c)
                if snapshot.telemetry.gpu:
                    gpu_temps.append(snapshot.telemetry.gpu.core_temperature_c)
                if snapshot.telemetry.ram:
                    ram_usage.append(snapshot.telemetry.ram.usage_percent)
        
        summary = {
            "device_id": device_id,
            "time_range_hours": hours,
            "snapshot_count": len(snapshots),
            "cpu_temperature": {
                "avg_c": sum(cpu_temps) / len(cpu_temps) if cpu_temps else None,
                "max_c": max(cpu_temps) if cpu_temps else None,
                "min_c": min(cpu_temps) if cpu_temps else None
            },
            "gpu_temperature": {
                "avg_c": sum(gpu_temps) / len(gpu_temps) if gpu_temps else None,
                "max_c": max(gpu_temps) if gpu_temps else None,
                "min_c": min(gpu_temps) if gpu_temps else None
            },
            "ram_usage": {
                "avg_percent": sum(ram_usage) / len(ram_usage) if ram_usage else None,
                "max_percent": max(ram_usage) if ram_usage else None,
                "min_percent": min(ram_usage) if ram_usage else None
            }
        }
        
        return summary
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving metrics summary for device {device_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve metrics summary"
        )
