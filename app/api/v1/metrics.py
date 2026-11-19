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
    TelemetryHistoryResponse,
    TelemetrySnapshotResponse,
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
        
        snapshot_responses = [TelemetrySnapshotResponse.from_document(doc) for doc in snapshots]
        
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
        
        # The newest stored snapshot, however old it is.
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
        
        return TelemetrySnapshotResponse.from_document(snapshots[0])
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving latest metrics for device {device_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve latest metrics"
        )


# Readings the trend endpoint summarises, by the ids the frontend uses
# (frontend/src/components/readings.js), and where each is stored.
TREND_FIELDS = {
    "cpu_util": "cpu.utilization_percent",
    "cpu_core_temp": "cpu.core_temperature_c",
    "cpu_package_temp": "cpu.package_temperature_c",
    "cpu_clock": "cpu.clock_speed_ghz",
    "gpu_util": "gpu.utilization_percent",
    "gpu_core_temp": "gpu.core_temperature_c",
    "gpu_hotspot": "gpu.hotspot_temperature_c",
    "ram_usage": "ram.usage_percent",
    "ram_pagefile": "ram.pagefile_usage_percent",
    "vrm_temp": "power_vrm.vrm_temperature_c",
    "psu_12v": "power_vrm.psu_12v_voltage",
}

# period -> (how far back, bucket format for $dateToString, bucket name)
TREND_PERIODS = {
    "24h": (timedelta(hours=24), "%Y-%m-%dT%H:00:00Z", "hour"),
    "7d": (timedelta(days=7), "%Y-%m-%dT00:00:00Z", "day"),
    "30d": (timedelta(days=30), "%Y-%m-%dT00:00:00Z", "day"),
}


@router.get(
    "/metrics/trend",
    summary="Readings Averaged per Hour or Day",
    description=(
        "Average and peak of the main readings for one device, per hour over the last 24 hours "
        "or per day over the last 7 or 30 days, worked out in the database so the whole period "
        "counts (not just the newest snapshots). Buckets with no snapshots are left out."
    ),
)
async def get_metrics_trend(
    device_id: str = Query(..., description="Device ID to query"),
    period: str = Query("24h", pattern="^(24h|7d|30d)$", description="24h (hourly), 7d or 30d (daily)"),
    current_user: User = Depends(get_current_user),
):
    try:
        device_oid = PydanticObjectId(device_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid device ID format")

    user_devices = await StorageService.get_user_devices(str(current_user.id))
    if not any(str(device.id) == device_id for device in user_devices):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Device does not belong to user")

    span, bucket_format, bucket = TREND_PERIODS[period]
    start = datetime.now(timezone.utc) - span

    group: dict = {
        "_id": {"$dateToString": {"format": bucket_format, "date": "$timestamp"}},
        "count": {"$sum": 1},
    }
    for reading_id, path in TREND_FIELDS.items():
        group[f"{reading_id}__avg"] = {"$avg": f"${path}"}
        group[f"{reading_id}__max"] = {"$max": f"${path}"}

    pipeline = [
        {"$match": {"user_id": current_user.id, "device_id": device_oid, "timestamp": {"$gte": start}}},
        {"$group": group},
        {"$sort": {"_id": 1}},
    ]
    try:
        rows = await TelemetrySnapshotDocument.aggregate(aggregation_pipeline=pipeline).to_list()
    except Exception as e:
        logger.error(f"Error building the trend for device {device_id}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to build the trend")

    def rounded(value):
        return None if value is None else round(float(value), 2)

    return {
        "device_id": device_id,
        "period": period,
        "bucket": bucket,
        "start": start.isoformat(),
        "buckets": [
            {
                "start": row["_id"],
                "count": row["count"],
                "readings": {
                    reading_id: {"avg": rounded(row.get(f"{reading_id}__avg")), "max": rounded(row.get(f"{reading_id}__max"))}
                    for reading_id in TREND_FIELDS
                },
            }
            for row in rows
        ],
    }


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
            # Skip readings the PC didn't report so they don't break the maths.
            if snapshot.cpu.core_temperature_c is not None:
                cpu_temps.append(snapshot.cpu.core_temperature_c)
            if snapshot.gpu.core_temperature_c is not None:
                gpu_temps.append(snapshot.gpu.core_temperature_c)
            if snapshot.ram.usage_percent is not None:
                ram_usage.append(snapshot.ram.usage_percent)
        
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
