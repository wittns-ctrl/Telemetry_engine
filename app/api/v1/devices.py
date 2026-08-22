"""
Device Management REST API Endpoints

This module provides REST API endpoints for device management operations,
including listing devices for authenticated users with tenant isolation.

Author: Lectio Backend Team
Version: 6.0.0
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from beanie import PydanticObjectId

from app.api.deps import get_current_user
from app.models.user import User
from app.models.telemetry import Device
from app.services.storage_service import StorageService
from app.schemas.api import DeviceResponse, DeviceListResponse

logger = logging.getLogger(__name__)

router = APIRouter()


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
        
        # Get devices for the user
        devices = await StorageService.get_user_devices(user_id)
        
        # Apply active filter if provided
        if is_active is not None:
            devices = [d for d in devices if d.is_active == is_active]
        
        # Convert to response models
        device_responses = [
            DeviceResponse(
                id=str(device.id),
                device_name=device.device_name,
                device_type=device.device_type,
                os_info=device.os_info,
                cpu_info=device.cpu_info,
                gpu_info=device.gpu_info,
                ram_info=device.ram_info,
                storage_info=device.storage_info,
                last_seen=device.last_seen,
                is_active=device.is_active,
                created_at=device.created_at
            )
            for device in devices
        ]
        
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
        
        # Verify device belongs to user (tenant isolation)
        if str(device.user_id) != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Device does not belong to user"
            )
        
        return DeviceResponse(
            id=str(device.id),
            device_name=device.device_name,
            system_uuid=device.system_uuid,
            os_info=device.os_info,
            last_seen=device.last_seen,
            is_active=device.is_active,
            created_at=device.created_at
        )
    
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
        
        # Delete device (cascade deletes handled by Beanie if configured)
        await device.delete()
        
        logger.info(f"Device {device_id} deleted by user {user_id}")
        
        return None
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting device {device_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete device"
        )
