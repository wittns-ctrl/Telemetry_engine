"""
WebSocket Streaming Endpoints for Lectio Real-Time Telemetry

This module provides WebSocket endpoints for real-time streaming of
hardware telemetry and anomaly alerts to authenticated clients.

Author: Lectio Backend Team
Version: 5.0.0
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from beanie import PydanticObjectId

from app.api.deps import get_current_user_ws
from app.core.websocket_manager import manager
from app.models.user import User
from app.models.telemetry import TelemetrySnapshot
from app.models.alert import AnomalyAlertDocument
from app.services.sensor_service import SensorService
from app.services.storage_service import StorageService
from app.services.anomaly_engine import anomaly_engine
from app.services.alert_service import AlertService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/telemetry/{device_id}")
async def websocket_telemetry_stream(
    websocket: WebSocket,
    device_id: str,
    current_user: User = Depends(get_current_user_ws)
):
    """
    Real-time WebSocket endpoint for streaming telemetry and alerts.
    
    This endpoint establishes a WebSocket connection that periodically
    (every 1000ms) streams live hardware metrics and any triggered anomaly
    alerts to the authenticated client.
    
    The connection requires:
    - Valid JWT access token via query parameter: ?token=YOUR_JWT
    - Device ownership validation (device must belong to authenticated user)
    
    Streaming payload format:
    {
        "timestamp": "2024-01-01T00:00:00Z",
        "telemetry": {...},  # Full telemetry snapshot
        "alerts": [...]       # Any triggered alerts (empty array if none)
    }
    
    Args:
        websocket: The WebSocket connection
        device_id: The device ID to stream telemetry for
        current_user: The authenticated user (from JWT token)
    """
    # Validate device ownership
    try:
        device_oid = PydanticObjectId(device_id)
    except Exception:
        await websocket.close(code=1008, reason="Invalid device ID format")
        return
    
    # Check if device belongs to user
    user_devices = await StorageService.get_user_devices(str(current_user.id))
    device_belongs_to_user = any(
        str(device.id) == device_id for device in user_devices
    )
    
    if not device_belongs_to_user:
        await websocket.close(code=1008, reason="Device does not belong to user")
        logger.warning(
            f"WebSocket connection rejected - Device {device_id} "
            f"does not belong to user {current_user.id}"
        )
        return
    
    # Accept connection and register with manager
    await manager.connect(websocket, str(current_user.id), device_id)
    
    # Background task for streaming
    stream_task = None
    try:
        logger.info(
            f"WebSocket telemetry stream started - User: {current_user.id}, "
            f"Device: {device_id}"
        )
        
        # Start the streaming loop
        stream_task = asyncio.create_task(
            telemetry_streaming_loop(
                websocket=websocket,
                user_id=str(current_user.id),
                device_id=device_id
            )
        )
        
        # Keep the connection alive and wait for disconnect
        while True:
            # Receive any messages from client (heartbeat, etc.)
            try:
                data = await websocket.receive_text()
                # Handle client messages if needed (e.g., ping/pong)
                logger.debug(f"Received message from client: {data}")
            except WebSocketDisconnect:
                logger.info(f"WebSocket disconnected by client - Device: {device_id}")
                break
            except Exception as e:
                logger.error(f"Error receiving WebSocket message: {e}")
                break
    
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected during setup - Device: {device_id}")
    
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    
    finally:
        # Cleanup
        if stream_task and not stream_task.done():
            stream_task.cancel()
            try:
                await stream_task
            except asyncio.CancelledError:
                pass
        
        await manager.disconnect(websocket, str(current_user.id), device_id)
        logger.info(
            f"WebSocket telemetry stream ended - User: {current_user.id}, "
            f"Device: {device_id}"
        )


async def telemetry_streaming_loop(
    websocket: WebSocket,
    user_id: str,
    device_id: str
):
    """
    Background task that continuously streams telemetry and alerts.
    
    This function runs in a loop, collecting telemetry every 1000ms,
    persisting it to the database, running anomaly detection, and
    streaming the results to the WebSocket client.
    
    Args:
        websocket: The WebSocket connection to stream to
        user_id: The user's identifier
        device_id: The device's identifier
    """
    stream_interval = 1.0  # 1000ms
    
    try:
        while True:
            try:
                # Collect current telemetry
                snapshot = await SensorService.get_current_telemetry()
                
                if snapshot is None:
                    logger.warning(f"Failed to collect telemetry for device {device_id}")
                    await asyncio.sleep(stream_interval)
                    continue
                
                # Persist to database
                try:
                    telemetry_doc = await StorageService.save_telemetry_snapshot(
                        user_id=user_id,
                        device_id=device_id,
                        snapshot=snapshot
                    )
                    logger.debug(f"Telemetry persisted for device {device_id}")
                except Exception as e:
                    logger.error(f"Error persisting telemetry: {e}")
                    # Continue streaming even if persistence fails
                
                # Run anomaly detection
                alerts = []
                try:
                    triggered_alerts = await anomaly_engine.evaluate_snapshot(
                        user_id=user_id,
                        device_id=device_id,
                        snapshot=snapshot
                    )
                    
                    # Convert alerts to serializable format
                    alerts = [
                        {
                            "id": str(alert.id),
                            "rule_name": alert.rule_name,
                            "severity": alert.severity.value,
                            "metric_name": alert.metric_name,
                            "trigger_value": alert.trigger_value,
                            "threshold_limit": alert.threshold_limit,
                            "message": alert.message,
                            "is_active": alert.is_active,
                            "created_at": alert.created_at.isoformat()
                        }
                        for alert in triggered_alerts
                    ]
                    
                    if alerts:
                        logger.info(
                            f"Anomaly alerts triggered for device {device_id}: "
                            f"{len(alerts)} alerts"
                        )
                
                except Exception as e:
                    logger.error(f"Error in anomaly detection: {e}")
                
                # Prepare streaming payload
                payload = {
                    "timestamp": snapshot.timestamp.isoformat(),
                    "telemetry": snapshot.model_dump(),
                    "alerts": alerts
                }
                
                # Send to client
                try:
                    await manager.send_personal_message(payload, websocket)
                    logger.debug(f"Telemetry payload sent for device {device_id}")
                except Exception as e:
                    logger.error(f"Error sending telemetry payload: {e}")
                    raise  # Exit loop if send fails
                
                # Wait for next interval
                await asyncio.sleep(stream_interval)
            
            except asyncio.CancelledError:
                logger.info(f"Telemetry streaming loop cancelled for device {device_id}")
                break
            
            except Exception as e:
                logger.error(f"Error in telemetry streaming loop: {e}")
                # Continue loop on non-fatal errors
                await asyncio.sleep(stream_interval)
    
    except asyncio.CancelledError:
        logger.info(f"Telemetry streaming loop cancelled for device {device_id}")
        raise
    
    except Exception as e:
        logger.error(f"Fatal error in telemetry streaming loop: {e}")


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
    try:
        device_oid = PydanticObjectId(device_id)
    except Exception:
        await websocket.close(code=1008, reason="Invalid device ID format")
        return
    
    # Check if device belongs to user
    user_devices = await StorageService.get_user_devices(str(current_user.id))
    device_belongs_to_user = any(
        str(device.id) == device_id for device in user_devices
    )
    
    if not device_belongs_to_user:
        await websocket.close(code=1008, reason="Device does not belong to user")
        logger.warning(
            f"WebSocket alert stream rejected - Device {device_id} "
            f"does not belong to user {current_user.id}"
        )
        return
    
    # Accept connection and register with manager
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
        
        initial_alerts = [
            {
                "id": str(alert.id),
                "rule_name": alert.rule_name,
                "severity": alert.severity.value,
                "metric_name": alert.metric_name,
                "trigger_value": alert.trigger_value,
                "threshold_limit": alert.threshold_limit,
                "message": alert.message,
                "is_active": alert.is_active,
                "created_at": alert.created_at.isoformat()
            }
            for alert in active_alerts
        ]
        
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
