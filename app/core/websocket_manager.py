"""
WebSocket Connection Manager for Lectio Real-Time Streaming

This module manages active WebSocket connections for real-time telemetry
and alert streaming to authenticated clients. It maintains thread-safe
mappings of user_id and device_id to active WebSocket instances.

Author: Lectio Backend Team
Version: 5.0.0
"""

import asyncio
import json
import logging
from typing import Dict, List, Optional
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

# Redis channel that carries live updates between API processes (REDIS_URL).
RELAY_CHANNEL = "lectio:live"


class ConnectionManager:
    """
    Manages active WebSocket connections with thread-safe operations.
    
    This class maintains a nested dictionary structure:
    {user_id: {device_id: [WebSocket, ...]}}
    
    This allows efficient broadcasting to specific users and devices
    while maintaining proper isolation between tenants.
    """
    
    def __init__(self):
        """Initialize the connection manager with empty connection tracking."""
        # Structure: {user_id: {device_id: [WebSocket, ...]}}
        self._connections: Dict[str, Dict[str, List[WebSocket]]] = {}
        self._lock = asyncio.Lock()
        
        logger.info("ConnectionManager initialized")
    
    async def connect(self, websocket: WebSocket, user_id: str, device_id: str):
        """
        Accept and track a new WebSocket connection.
        
        Args:
            websocket: The WebSocket connection to accept
            user_id: The user's identifier for tenant isolation
            device_id: The device's identifier for targeted broadcasting
        """
        try:
            await websocket.accept()
            
            async with self._lock:
                # Initialize user entry if not exists
                if user_id not in self._connections:
                    self._connections[user_id] = {}
                
                # Initialize device entry if not exists
                if device_id not in self._connections[user_id]:
                    self._connections[user_id][device_id] = []
                
                # Add WebSocket to the device's connection list
                self._connections[user_id][device_id].append(websocket)
                
                connection_count = len(self._connections[user_id][device_id])
                logger.info(
                    f"WebSocket connected - User: {user_id}, Device: {device_id}, "
                    f"Total connections for device: {connection_count}"
                )
        
        except Exception as e:
            logger.error(f"Error accepting WebSocket connection: {e}")
            raise
    
    async def disconnect(self, websocket: WebSocket, user_id: str, device_id: str):
        """
        Remove a WebSocket connection from tracking.
        
        Args:
            websocket: The WebSocket connection to remove
            user_id: The user's identifier
            device_id: The device's identifier
        """
        try:
            async with self._lock:
                if user_id in self._connections and device_id in self._connections[user_id]:
                    try:
                        self._connections[user_id][device_id].remove(websocket)
                        logger.info(
                            f"WebSocket disconnected - User: {user_id}, Device: {device_id}"
                        )
                        
                        # Clean up empty device entries
                        if not self._connections[user_id][device_id]:
                            del self._connections[user_id][device_id]
                            logger.debug(f"Removed empty device entry: {device_id}")
                        
                        # Clean up empty user entries
                        if not self._connections[user_id]:
                            del self._connections[user_id]
                            logger.debug(f"Removed empty user entry: {user_id}")
                    
                    except ValueError:
                        logger.warning(
                            f"WebSocket not found in connection list - "
                            f"User: {user_id}, Device: {device_id}"
                        )
        
        except Exception as e:
            logger.error(f"Error during WebSocket disconnect: {e}")
    
    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """
        Send a message to a specific WebSocket connection.
        
        Args:
            message: The message dictionary to send
            websocket: The target WebSocket connection
        """
        try:
            await websocket.send_json(message)
        except WebSocketDisconnect:
            logger.debug("WebSocket disconnected during message send")
        except Exception as e:
            logger.error(f"Error sending personal message: {e}")
    
    async def broadcast_to_device(self, user_id: str, device_id: str, message: dict):
        """
        Send a message to every browser watching a device: those connected to
        this process now, and (with REDIS_URL) those on other processes or
        servers through the Redis relay.
        """
        await self._deliver_to_device(user_id, device_id, message)
        await self._publish({"kind": "device", "user_id": user_id, "device_id": device_id, "message": message})

    async def _deliver_to_device(
        self,
        user_id: str,
        device_id: str,
        message: dict
    ):
        """
        Broadcast a message to this process's WebSocket connections for a device.
        
        Args:
            user_id: The user's identifier for tenant isolation
            device_id: The device's identifier for targeted broadcasting
            message: The message dictionary to broadcast
        """
        try:
            async with self._lock:
                if user_id not in self._connections:
                    logger.debug(f"No connections found for user: {user_id}")
                    return
                
                if device_id not in self._connections[user_id]:
                    logger.debug(f"No connections found for device: {device_id}")
                    return
                
                # Get a copy of the connection list to avoid modification during iteration
                connections = self._connections[user_id][device_id].copy()
            
            # Send to all connections outside the lock to prevent blocking
            disconnected_connections = []
            
            for websocket in connections:
                try:
                    await websocket.send_json(message)
                except WebSocketDisconnect:
                    logger.debug(f"WebSocket disconnected during broadcast to device {device_id}")
                    disconnected_connections.append(websocket)
                except Exception as e:
                    logger.error(f"Error broadcasting to WebSocket: {e}")
                    disconnected_connections.append(websocket)
            
            # Clean up disconnected connections
            if disconnected_connections:
                for websocket in disconnected_connections:
                    await self.disconnect(websocket, user_id, device_id)
            
            logger.debug(
                f"Broadcast message to {len(connections)} connections "
                f"for device {device_id} (user: {user_id})"
            )
        
        except Exception as e:
            logger.error(f"Error during broadcast to device: {e}")
    
    async def broadcast_to_user(self, user_id: str, message: dict):
        """
        Broadcast a message to all WebSocket connections for a specific user.
        
        Args:
            user_id: The user's identifier for tenant isolation
            message: The message dictionary to broadcast
        """
        try:
            async with self._lock:
                if user_id not in self._connections:
                    logger.debug(f"No connections found for user: {user_id}")
                    return
                
                # Collect all connections for the user across all devices
                all_connections = []
                for device_id, connections in self._connections[user_id].items():
                    all_connections.extend(connections.copy())
            
            # Send to all connections outside the lock
            disconnected_connections = []
            
            for websocket in all_connections:
                try:
                    await websocket.send_json(message)
                except WebSocketDisconnect:
                    logger.debug(f"WebSocket disconnected during broadcast to user {user_id}")
                    disconnected_connections.append(websocket)
                except Exception as e:
                    logger.error(f"Error broadcasting to WebSocket: {e}")
                    disconnected_connections.append(websocket)
            
            # Clean up disconnected connections
            if disconnected_connections:
                for websocket in disconnected_connections:
                    # We need to determine the device_id for cleanup
                    # This is a simplified approach - in production, track device_id per connection
                    async with self._lock:
                        for device_id, connections in self._connections[user_id].items():
                            if websocket in connections:
                                await self.disconnect(websocket, user_id, device_id)
                                break
            
            logger.debug(
                f"Broadcast message to {len(all_connections)} connections for user {user_id}"
            )
        
        except Exception as e:
            logger.error(f"Error during broadcast to user: {e}")
    
    def total_connections(self) -> int:
        """Open live-stream sockets across every user and device (for the health check)."""
        return sum(len(sockets) for devices in self._connections.values() for sockets in devices.values())

    async def get_connection_count(self, user_id: str, device_id: Optional[str] = None) -> int:
        """
        Get the number of active connections for a user or device.
        
        Args:
            user_id: The user's identifier
            device_id: Optional device identifier for specific device count
            
        Returns:
            Number of active connections
        """
        async with self._lock:
            if user_id not in self._connections:
                return 0
            
            if device_id:
                if device_id not in self._connections[user_id]:
                    return 0
                return len(self._connections[user_id][device_id])
            
            # Count all connections for the user
            total = 0
            for connections in self._connections[user_id].values():
                total += len(connections)
            return total
    
    async def disconnect_device(self, user_id: str, device_id: str, reason: str = "Device deleted"):
        """Close every connection watching one device, on every API process."""
        await self._disconnect_device_here(user_id, device_id, reason)
        await self._publish({"kind": "disconnect_device", "user_id": user_id, "device_id": device_id, "reason": reason})

    async def _disconnect_device_here(self, user_id: str, device_id: str, reason: str):
        async with self._lock:
            devices = self._connections.get(user_id, {})
            connections = devices.pop(device_id, [])
            if not devices:
                self._connections.pop(user_id, None)
        for websocket in connections:
            try:
                await websocket.close(code=1000, reason=reason)
            except Exception as e:
                logger.error(f"Error closing WebSocket: {e}")

    async def disconnect_user(self, user_id: str, reason: str = "Account deleted"):
        """Close every connection belonging to one user, on every API process."""
        await self._disconnect_user_here(user_id, reason)
        await self._publish({"kind": "disconnect_user", "user_id": user_id, "reason": reason})

    async def _disconnect_user_here(self, user_id: str, reason: str):
        async with self._lock:
            devices = self._connections.pop(user_id, {})
        for connections in devices.values():
            for websocket in connections:
                try:
                    await websocket.close(code=1000, reason=reason)
                except Exception as e:
                    logger.error(f"Error closing WebSocket: {e}")

    # ------------------------------------------------------------ Redis relay
    # With REDIS_URL, every process publishes what it sends and subscribes to
    # what the others send, delivering it to its own connections. Without
    # Redis (or while it is down) delivery is local only, as before.

    async def _publish(self, event: dict) -> None:
        from app.core import shared

        client = shared.redis_client()
        if client is None:
            return
        try:
            await client.publish(RELAY_CHANNEL, json.dumps({**event, "origin": shared.INSTANCE_ID}, default=str))
        except Exception as e:
            shared.warn("live-update publish", e)

    async def handle_relayed(self, raw: str) -> None:
        """Deliver one event published by another process."""
        from app.core import shared

        try:
            event = json.loads(raw)
        except (TypeError, ValueError):
            return
        if event.get("origin") == shared.INSTANCE_ID:
            return  # this process sent it and already delivered it
        kind = event.get("kind")
        if kind == "device":
            await self._deliver_to_device(event["user_id"], event["device_id"], event["message"])
        elif kind == "disconnect_device":
            await self._disconnect_device_here(event["user_id"], event["device_id"], event.get("reason", "Device deleted"))
        elif kind == "disconnect_user":
            await self._disconnect_user_here(event["user_id"], event.get("reason", "Account deleted"))

    def start_relay(self) -> None:
        """Start listening for other processes' updates (no-op without Redis)."""
        from app.core import shared

        if shared.redis_client() is None or getattr(self, "_relay_task", None):
            return
        self._relay_task = asyncio.create_task(self._relay_loop(), name="live-update-relay")

    async def stop_relay(self) -> None:
        task = getattr(self, "_relay_task", None)
        self._relay_task = None
        if task:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    async def _relay_loop(self) -> None:
        from app.core import shared

        delay = 1.0
        while True:
            pubsub = None
            try:
                pubsub = shared.redis_client().pubsub(ignore_subscribe_messages=True)
                await pubsub.subscribe(RELAY_CHANNEL)
                logger.info("Live-update relay listening on Redis")
                delay = 1.0
                while True:
                    message = await pubsub.get_message(timeout=5.0)
                    if message and message.get("type") == "message":
                        try:
                            await self.handle_relayed(message["data"])
                        except Exception:
                            logger.exception("Couldn't deliver a relayed live update")
            except asyncio.CancelledError:
                raise
            except Exception as e:
                shared.warn("live-update relay", e)
                await asyncio.sleep(delay)
                delay = min(30.0, delay * 2)
            finally:
                if pubsub is not None:
                    try:
                        await pubsub.aclose()
                    except Exception:
                        pass

    async def disconnect_all(self):
        """
        Disconnect all active WebSocket connections.
        
        This is typically used during application shutdown.
        """
        async with self._lock:
            for user_id, devices in self._connections.items():
                for device_id, connections in devices.items():
                    for websocket in connections:
                        try:
                            await websocket.close(code=1000, reason="Server shutdown")
                        except Exception as e:
                            logger.error(f"Error closing WebSocket: {e}")
            
            self._connections.clear()
            logger.info("All WebSocket connections disconnected")


# Global connection manager instance
manager = ConnectionManager()
