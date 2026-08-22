"""
WebSocket Connection Manager for Lectio Real-Time Streaming

This module manages active WebSocket connections for real-time telemetry
and alert streaming to authenticated clients. It maintains thread-safe
mappings of user_id and device_id to active WebSocket instances.

Author: Lectio Backend Team
Version: 5.0.0
"""

import asyncio
import logging
from typing import Dict, List, Optional
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


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
    
    async def broadcast_to_device(
        self,
        user_id: str,
        device_id: str,
        message: dict
    ):
        """
        Broadcast a message to all WebSocket connections for a specific device.
        
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
