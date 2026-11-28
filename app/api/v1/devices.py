"""
Device Management REST API Endpoints

This module provides REST API endpoints for device management operations,
including listing devices for authenticated users with tenant isolation.

Author: Lectio Backend Team
Version: 6.0.0
"""

import logging
import secrets
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from beanie import PydanticObjectId

from app.api.deps import get_current_user
from app.models.user import User, UserRole
from app.models.rollup import TelemetryRollupDocument
from app.models.location import LocationHistory
from app.models.daily_report import DailyReport
from app.models.audit_log import AuditEventType
from app.services import activity
from app.models.telemetry import Device, TelemetrySnapshotDocument
from app.models.alert import AnomalyAlertDocument
from app.models.fix import FixRequest
from app.services.anomaly_engine import anomaly_engine
from app.core.websocket_manager import manager as stream_manager
from app.services.storage_service import StorageService
from app.schemas.api import (
    DeviceResponse,
    DeviceListResponse,
    DeviceRegisterRequest,
    DeviceRegisterResponse,
    DeviceUpdateRequest,
)
from app.core.countries import COUNTRIES
from app.core.security import hash_token
from app.core.cache import cache, device_key_key

logger = logging.getLogger(__name__)

router = APIRouter()


def _to_response(device: Device) -> DeviceResponse:
    return DeviceResponse(
        id=str(device.id),
        device_name=device.device_name,
        system_uuid=device.system_uuid,
        os_info=device.os_info,
        country=device.country,
        last_seen=device.last_seen,
        agent_version=device.agent_version,
        agent_last_seen=device.agent_last_seen,
        security=device.security,
        location_enabled=device.location_enabled,
        location=device.location,
        is_active=device.is_active,
        created_at=device.created_at,
    )


@router.post(
    "/devices/register",
    response_model=DeviceRegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a Device",
    description=(
        "Called by the host agent after the user signs in. Creates the device (or "
        "re-registers an existing one owned by the same user) and issues a new ingest key. "
        "Re-registering rotates the key, so any previous key stops working."
    ),
)
async def register_device(
    body: DeviceRegisterRequest,
    current_user: User = Depends(get_current_user),
):
    user_id = str(current_user.id)

    existing = await Device.find_one(Device.system_uuid == body.system_uuid)
    if existing and str(existing.user_id) != user_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This machine is already registered to another account",
        )

    device = await StorageService.register_or_get_device(
        user_id=user_id,
        system_uuid=body.system_uuid,
        device_name=body.device_name,
        os_info=body.os_info,
    )

    # The old key stops working now, not when its cached copy expires.
    if device.ingest_key_hash:
        await cache.delete(device_key_key(device.ingest_key_hash))
    device_key = secrets.token_urlsafe(32)
    device.device_name = body.device_name
    if body.os_info:
        device.os_info = body.os_info
    if body.country:
        device.country = body.country
    device.is_active = True
    device.ingest_key_hash = hash_token(device_key)
    await device.save()

    logger.info(f"Device {device.id} registered for user {user_id}")
    await activity.record(user_id, AuditEventType.DEVICE_LINKED, device_id=str(device.id), device_name=device.device_name)
    return DeviceRegisterResponse(device=_to_response(device), device_key=device_key)


@router.get(
    "/devices",
    response_model=DeviceListResponse,
    summary="List User Devices",
    description="Retrieve all registered devices for the authenticated user"
)
async def list_devices(
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    current_user: User = Depends(get_current_user)
):
    """
    List all devices registered for the authenticated user.
    
    Args:
        is_active: Optional filter for active/inactive devices
        current_user: The authenticated user
        
    Returns:
        DeviceListResponse containing list of devices and total count
    """
    try:
        user_id = str(current_user.id)
        
        # Get devices for the user (or all devices if admin)
        if current_user.role == UserRole.ADMIN:
            devices = await Device.find_all().to_list()
        else:
            devices = await StorageService.get_user_devices(user_id)
        
        # Apply active filter if provided
        if is_active is not None:
            devices = [d for d in devices if d.is_active == is_active]
        
        # Convert to response models
        device_responses = [_to_response(device) for device in devices]
        
        return DeviceListResponse(
            devices=device_responses,
            total_count=len(device_responses)
        )
    
    except Exception as e:
        logger.error(f"Error listing devices for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve devices"
        )


@router.get(
    "/devices/countries",
    response_model=list[str],
    summary="List Device Countries",
    description="Country names a device can be placed in: the names the dashboard map can draw.",
)
async def list_countries():
    return list(COUNTRIES)


@router.patch(
    "/devices/{device_id}",
    response_model=DeviceResponse,
    summary="Update a Device",
    description="Rename a device or set the country it is in. Send country: null to clear it.",
)
async def update_device(
    device_id: str,
    body: DeviceUpdateRequest,
    current_user: User = Depends(get_current_user),
):
    try:
        device_oid = PydanticObjectId(device_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid device ID format")

    device = await Device.get(device_oid)
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    if str(device.user_id) != str(current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Device does not belong to user")

    sent = body.model_fields_set
    if "device_name" in sent and body.device_name is not None:
        device.device_name = body.device_name
    if "country" in sent:
        device.country = body.country
    turned_off = False
    if "location_enabled" in sent and body.location_enabled is not None:
        turned_off = device.location_enabled and not body.location_enabled
        device.location_enabled = body.location_enabled
        if not body.location_enabled:
            device.location = None  # switching off forgets where it was
    await device.save()
    if turned_off:
        await LocationHistory.find(LocationHistory.device_id == device.id).delete()
    return _to_response(device)


@router.get(
    "/devices/{device_id}",
    response_model=DeviceResponse,
    summary="Get Device Details",
    description="Retrieve detailed information for a specific device"
)
async def get_device(
    device_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve detailed information for a specific device.
    
    Args:
        device_id: The device ID to retrieve
        current_user: The authenticated user
        
    Returns:
        DeviceResponse with device details
        
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
        
        # Get device
        device = await Device.get(device_oid)
        
        if not device:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Device not found"
            )
        
        # Verify device belongs to user (tenant isolation), unless admin
        if current_user.role != UserRole.ADMIN and str(device.user_id) != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Device does not belong to user"
            )
        
        return _to_response(device)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving device {device_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve device"
        )


@router.delete(
    "/devices/{device_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Device",
    description="Delete a device and all associated data"
)
async def delete_device(
    device_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Delete a device and all associated telemetry data.
    
    Args:
        device_id: The device ID to delete
        current_user: The authenticated user
        
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
        
        # Get device
        device = await Device.get(device_oid)
        
        if not device:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Device not found"
            )
        
        # Verify device belongs to user (tenant isolation)
        if str(device.user_id) != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Device does not belong to user"
            )
        
        # Nothing cascades automatically, so remove the device's readings and
        # alerts explicitly. The device record goes last so a failure part-way
        # leaves it visible and the delete can be retried.
        await anomaly_engine.clear_device_state(user_id, device_id)
        await stream_manager.disconnect_device(user_id, device_id)
        readings = await TelemetrySnapshotDocument.find(
            TelemetrySnapshotDocument.device_id == device_oid,
            TelemetrySnapshotDocument.user_id == current_user.id,
        ).delete()
        await TelemetryRollupDocument.find(
            TelemetryRollupDocument.device_id == device_oid,
            TelemetryRollupDocument.user_id == current_user.id,
        ).delete()
        await LocationHistory.find(
            LocationHistory.device_id == device_oid, LocationHistory.user_id == current_user.id,
        ).delete()
        await DailyReport.find(DailyReport.device_id == device_oid, DailyReport.user_id == current_user.id).delete()
        alerts = await AnomalyAlertDocument.find(
            AnomalyAlertDocument.device_id == device_oid,
            AnomalyAlertDocument.user_id == current_user.id,
        ).delete()
        await FixRequest.find(
            FixRequest.device_id == device_oid,
            FixRequest.user_id == current_user.id,
        ).delete()
        await device.delete()
        await activity.record(user_id, AuditEventType.DEVICE_REMOVED, device_id=str(device.id),
                              device_name=device.device_name)

        logger.info(
            f"Device {device_id} deleted by user {user_id} "
            f"({getattr(readings, 'deleted_count', 0)} readings, {getattr(alerts, 'deleted_count', 0)} alerts)"
        )
        
        return None
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting device {device_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete device"
        )
