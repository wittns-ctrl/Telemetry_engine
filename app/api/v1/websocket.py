"""
WebSocket Streaming Endpoints for Lectio Real-Time Telemetry

This module provides WebSocket endpoints for real-time streaming of
hardware telemetry and anomaly alerts to authenticated clients.

Author: Lectio Backend Team
Version: 5.0.0
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from beanie import PydanticObjectId

from app.api.deps import get_current_user_ws
from app.core.websocket_manager import manager
from app.models.user import User
from app.models.alert import AnomalyAlertDocument
from app.services.storage_service import StorageService
from app.services.alert_service import AlertService

logger = logging.getLogger(__name__)

router = APIRouter()


def serialize_alert(alert: AnomalyAlertDocument) -> dict:
    """Shape an alert document for WebSocket clients."""
    return {
        "id": str(alert.id),
        "rule_name": alert.rule_name,
        "severity": alert.severity.value,
        "metric_name": alert.metric_name,
        "trigger_value": alert.trigger_value,
        "threshold_limit": alert.threshold_limit,
        "message": alert.message,
        "is_active": alert.is_active,
        "created_at": alert.created_at.isoformat(),
    }


async def _authorize_device(websocket: WebSocket, user: User, device_id: str) -> bool:
    """Close the socket and return False unless device_id is one of the user's devices."""
    try:
        PydanticObjectId(device_id)
    except Exception:
        await websocket.close(code=1008, reason="Invalid device ID format")
        return False

    user_devices = await StorageService.get_user_devices(str(user.id))
    if not any(str(device.id) == device_id for device in user_devices):
        logger.warning(
            f"WebSocket connection rejected - Device {device_id} "
            f"does not belong to user {user.id}"
        )
        await websocket.close(code=1008, reason="Device does not belong to user")
        return False
    return True


@router.websocket("/ws/telemetry/{device_id}")
async def websocket_telemetry_stream(
    websocket: WebSocket,
    device_id: str,
    current_user: User = Depends(get_current_user_ws)
):
    """
    Real-time stream of telemetry and alerts for one of the user's devices.

    The server does not collect hardware data itself. The host agent running on
    the user's machine POSTs snapshots to /api/v1/telemetry/ingest; each accepted
    snapshot is relayed to every socket subscribed to that device as:

        {"type": "telemetry", "device_id": ..., "timestamp": ...,
         "telemetry": {...snapshot...}, "alerts": [...]}

    Requires ?token=<access JWT> and ownership of device_id.
    """
    if not await _authorize_device(websocket, current_user, device_id):
        return

    user_id = str(current_user.id)
    await manager.connect(websocket, user_id, device_id)
    logger.info(f"WebSocket telemetry stream started - User: {user_id}, Device: {device_id}")

    try:
        # Nothing is expected from the client; keep reading so disconnects are noticed.
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected by client - Device: {device_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        await manager.disconnect(websocket, user_id, device_id)
        logger.info(f"WebSocket telemetry stream ended - User: {user_id}, Device: {device_id}")


@router.websocket("/ws/alerts/{device_id}")
async def websocket_alert_stream(
    websocket: WebSocket,
    device_id: str,
    current_user: User = Depends(get_current_user_ws)
):
    """
    Real-time WebSocket endpoint for streaming anomaly alerts only.
    
    This endpoint provides a dedicated alert-only stream for clients
    that only need to receive anomaly notifications without the full
    telemetry payload. This is useful for lightweight monitoring dashboards.
    
    Args:
        websocket: The WebSocket connection
        device_id: The device ID to stream alerts for
        current_user: The authenticated user (from JWT token)
    """
    # Validate device ownership
    if not await _authorize_device(websocket, current_user, device_id):
        return
    
    await manager.connect(websocket, str(current_user.id), device_id)
    
    try:
        logger.info(
            f"WebSocket alert stream started - User: {current_user.id}, "
            f"Device: {device_id}"
        )
        
        # Send initial active alerts
        active_alerts = await AlertService.get_active_alerts(
            user_id=str(current_user.id),
            device_id=device_id
        )
        
        initial_alerts = [serialize_alert(alert) for alert in active_alerts]
        
        await manager.send_personal_message(
            {"type": "initial_alerts", "alerts": initial_alerts},
            websocket
        )
        
        # Keep connection alive (alerts are pushed via broadcast from anomaly engine)
        while True:
            try:
                data = await websocket.receive_text()
                logger.debug(f"Received message from alert client: {data}")
            except WebSocketDisconnect:
                logger.info(f"WebSocket alert stream disconnected - Device: {device_id}")
                break
            except Exception as e:
                logger.error(f"Error receiving alert stream message: {e}")
                break
    
    except WebSocketDisconnect:
        logger.info(f"WebSocket alert stream disconnected during setup - Device: {device_id}")
    
    except Exception as e:
        logger.error(f"WebSocket alert stream error: {e}")
    
    finally:
        await manager.disconnect(websocket, str(current_user.id), device_id)
        logger.info(
            f"WebSocket alert stream ended - User: {current_user.id}, "
            f"Device: {device_id}"
        )
