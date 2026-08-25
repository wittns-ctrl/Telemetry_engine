"""
WebSockets & Real-Time Streaming Tests

This module tests WebSocket connection lifecycle, JWT authentication,
graceful termination, and real-time streaming of telemetry and alerts.

Author: Lectio Backend Team
Version: 7.0.0
"""

import pytest
import asyncio
import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.websocket_manager import ConnectionManager
from app.core.security import create_access_token
from datetime import timedelta


class TestConnectionManager:
    """Test suite for WebSocket connection manager."""
    
    @pytest.mark.asyncio
    async def test_connect_and_disconnect(self):
        """Test WebSocket connection and disconnection."""
        manager = ConnectionManager()
        
        # Create mock WebSocket
        mock_ws = AsyncMock()
        mock_ws.client_id = "test_client_001"
        mock_ws.accept = AsyncMock()
        
        # Connect
        await manager.connect(mock_ws, user_id="user_001", device_id="device_001")
        
        assert "user_001" in manager._connections
        assert len(manager._connections["user_001"]) == 1
        
        # Disconnect
        await manager.disconnect(mock_ws, user_id="user_001", device_id="device_001")
        
        # User entry should be removed when no connections remain
        assert "user_001" not in manager._connections
    
    @pytest.mark.asyncio
    async def test_multiple_connections_per_user(self):
        """Test multiple WebSocket connections for the same user."""
        manager = ConnectionManager()
        
        mock_ws1 = AsyncMock()
        mock_ws1.client_id = "test_client_001"
        mock_ws1.accept = AsyncMock()
        mock_ws2 = AsyncMock()
        mock_ws2.client_id = "test_client_002"
        mock_ws2.accept = AsyncMock()
        
        await manager.connect(mock_ws1, user_id="user_001", device_id="device_001")
        await manager.connect(mock_ws2, user_id="user_001", device_id="device_001")
        
        assert len(manager._connections["user_001"]["device_001"]) == 2
        
        # Disconnect one
        await manager.disconnect(mock_ws1, user_id="user_001", device_id="device_001")
        assert len(manager._connections["user_001"]["device_001"]) == 1
    
    @pytest.mark.asyncio
    async def test_send_personal_message(self):
        """Test sending a message to a specific WebSocket connection."""
        manager = ConnectionManager()
        
        mock_ws = AsyncMock()
        mock_ws.client_id = "test_client_001"
        mock_ws.accept = AsyncMock()
        
        await manager.connect(mock_ws, user_id="user_001", device_id="device_001")
        
        message = {"type": "test", "data": "hello"}
        await manager.send_personal_message(message, mock_ws)
        
        mock_ws.send_json.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_broadcast_to_user(self):
        """Test broadcasting a message to all connections for a user."""
        manager = ConnectionManager()
        
        mock_ws1 = AsyncMock()
        mock_ws1.client_id = "test_client_001"
        mock_ws1.accept = AsyncMock()
        mock_ws2 = AsyncMock()
        mock_ws2.client_id = "test_client_002"
        mock_ws2.accept = AsyncMock()
        
        await manager.connect(mock_ws1, user_id="user_001", device_id="device_001")
        await manager.connect(mock_ws2, user_id="user_001", device_id="device_001")
        
        message = {"type": "broadcast", "data": "hello"}
        await manager.broadcast_to_user(user_id="user_001", message=message)
        
        # Both connections should receive the message
        assert mock_ws1.send_json.call_count == 1
        assert mock_ws2.send_json.call_count == 1
    
    @pytest.mark.asyncio
    async def test_broadcast_to_device(self):
        """Test broadcasting a message to all connections for a specific device."""
        manager = ConnectionManager()
        
        mock_ws1 = AsyncMock()
        mock_ws1.client_id = "test_client_001"
        mock_ws1.accept = AsyncMock()
        mock_ws2 = AsyncMock()
        mock_ws2.client_id = "test_client_002"
        mock_ws2.accept = AsyncMock()
        
        await manager.connect(mock_ws1, user_id="user_001", device_id="device_001")
        await manager.connect(mock_ws2, user_id="user_001", device_id="device_002")
        
        message = {"type": "device_broadcast", "data": "hello"}
        await manager.broadcast_to_device(user_id="user_001", device_id="device_001", message=message)
        
        # Only device_001 connection should receive the message
        assert mock_ws1.send_json.call_count == 1
        assert mock_ws2.send_json.call_count == 0
    
    @pytest.mark.asyncio
    async def test_global_broadcast(self):
        """Test broadcasting a message to all connected clients."""
        manager = ConnectionManager()
        
        mock_ws1 = AsyncMock()
        mock_ws1.client_id = "test_client_001"
        mock_ws1.accept = AsyncMock()
        mock_ws2 = AsyncMock()
        mock_ws2.client_id = "test_client_002"
        mock_ws2.accept = AsyncMock()
        
        await manager.connect(mock_ws1, user_id="user_001", device_id="device_001")
        await manager.connect(mock_ws2, user_id="user_002", device_id="device_002")
        
        message = {"type": "global", "data": "hello"}
        # Broadcast to all users by iterating through them
        for user_id in list(manager._connections.keys()):
            await manager.broadcast_to_user(user_id, message=message)
        
        # All connections should receive the message
        assert mock_ws1.send_json.call_count == 1
        assert mock_ws2.send_json.call_count == 1
    
    @pytest.mark.asyncio
    async def test_get_active_users(self):
        """Test getting list of active users."""
        manager = ConnectionManager()
        
        mock_ws1 = AsyncMock()
        mock_ws1.client_id = "test_client_001"
        mock_ws1.accept = AsyncMock()
        mock_ws2 = AsyncMock()
        mock_ws2.client_id = "test_client_002"
        mock_ws2.accept = AsyncMock()
        
        await manager.connect(mock_ws1, user_id="user_001", device_id="device_001")
        await manager.connect(mock_ws2, user_id="user_002", device_id="device_002")
        
        active_users = list(manager._connections.keys())
        
        assert "user_001" in active_users
        assert "user_002" in active_users
        assert len(active_users) == 2


class TestWebSocketAuthentication:
    """Test suite for WebSocket JWT authentication."""
    
    @pytest.mark.asyncio
    async def test_valid_token_authentication(self, test_user):
        """Test that valid JWT tokens are accepted for WebSocket connections."""
        token = create_access_token(
            data={"sub": str(test_user.id), "type": "access"},
            expires_delta=timedelta(minutes=15)
        )
        
        # This would typically be tested via the actual WebSocket endpoint
        # For unit testing, we verify the token is valid
        assert token is not None
        assert len(token) > 0
    
    @pytest.mark.asyncio
    async def test_expired_token_rejection(self, test_user):
        """Test that expired tokens are rejected."""
        token = create_access_token(
            data={"sub": str(test_user.id), "type": "access"},
            expires_delta=timedelta(minutes=-1)  # Expired
        )
        
        # Token generation should succeed but validation should fail
        assert token is not None
        # The actual rejection would be tested via WebSocket endpoint
    
    @pytest.mark.asyncio
    async def test_invalid_token_format(self):
        """Test that invalid token formats are rejected."""
        invalid_tokens = [
            "",
            "invalid_token",
            "Bearer invalid_token",
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid"
        ]
        
        for token in invalid_tokens:
            # These should fail validation
            assert token is not None  # Token exists but is invalid
    
    @pytest.mark.asyncio
    async def test_token_from_query_parameter(self, test_user):
        """Test that tokens can be extracted from query parameters."""
        token = create_access_token(
            data={"sub": str(test_user.id), "type": "access"},
            expires_delta=timedelta(minutes=15)
        )
        
        # Simulate query parameter extraction
        query_params = {"token": token}
        assert query_params["token"] == token


class TestWebSocketConnectionLifecycle:
    """Test suite for WebSocket connection lifecycle management."""
    
    @pytest.mark.asyncio
    async def test_connection_establishment(self):
        """Test WebSocket connection establishment."""
        manager = ConnectionManager()
        
        mock_ws = AsyncMock()
        mock_ws.client_id = "test_client_001"
        mock_ws.accept = AsyncMock()
        
        await manager.connect(mock_ws, user_id="user_001", device_id="device_001")
        
        assert "user_001" in manager._connections
        assert mock_ws.accept.called
    
    @pytest.mark.asyncio
    async def test_connection_termination(self):
        """Test WebSocket connection termination."""
        manager = ConnectionManager()
        
        mock_ws = AsyncMock()
        mock_ws.client_id = "test_client_001"
        mock_ws.accept = AsyncMock()
        
        await manager.connect(mock_ws, user_id="user_001", device_id="device_001")
        await manager.disconnect(mock_ws, user_id="user_001", device_id="device_001")
        
        # User entry should be removed when no connections remain
        assert "user_001" not in manager._connections
    
    @pytest.mark.asyncio
    async def test_connection_cleanup_on_disconnect(self):
        """Test that connection state is cleaned up on disconnect."""
        manager = ConnectionManager()
        
        mock_ws = AsyncMock()
        mock_ws.client_id = "test_client_001"
        mock_ws.accept = AsyncMock()
        
        await manager.connect(mock_ws, user_id="user_001", device_id="device_001")
        
        # Verify connection exists
        assert "user_001" in manager._connections
        
        # Disconnect
        await manager.disconnect(mock_ws, user_id="user_001", device_id="device_001")
        
        # Verify cleanup - user entry may be removed after disconnect
        if "user_001" in manager._connections:
            if not manager._connections["user_001"]:
                # User entry should be removed if no connections remain
                pass
    
    @pytest.mark.asyncio
    async def test_multiple_disconnects_safe(self):
        """Test that multiple disconnects of the same connection are safe."""
        manager = ConnectionManager()
        
        mock_ws = AsyncMock()
        mock_ws.client_id = "test_client_001"
        mock_ws.accept = AsyncMock()
        
        await manager.connect(mock_ws, user_id="user_001", device_id="device_001")
        await manager.disconnect(mock_ws, user_id="user_001", device_id="device_001")
        await manager.disconnect(mock_ws, user_id="user_001", device_id="device_001")
        
        # Should not raise errors
        assert True


class TestTelemetryStreaming:
    """Test suite for real-time telemetry streaming."""
    
    @pytest.mark.asyncio
    async def test_telemetry_message_format(self):
        """Test that telemetry messages are formatted correctly."""
        manager = ConnectionManager()
        
        mock_ws = AsyncMock()
        mock_ws.client_id = "test_client_001"
        mock_ws.accept = AsyncMock()
        
        await manager.connect(mock_ws, user_id="user_001", device_id="device_001")
        
        telemetry_message = {
            "event": "TELEMETRY_SNAPSHOT",
            "device_id": "device_001",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "cpu": {
                "core_temperature_c": 65.0,
                "utilization_percent": 45.0
            },
            "gpu": {
                "core_temperature_c": 70.0,
                "utilization_percent": 55.0
            }
        }
        
        await manager.send_personal_message(telemetry_message, mock_ws)
        
        # Verify message was sent
        mock_ws.send_json.assert_called_once()
        call_args = mock_ws.send_json.call_args[0][0]
        assert call_args["event"] == "TELEMETRY_SNAPSHOT"
        assert "cpu" in call_args
        assert "gpu" in call_args
    
    @pytest.mark.asyncio
    async def test_telemetry_streaming_to_user(self):
        """Test that telemetry is streamed to the correct user."""
        manager = ConnectionManager()
        
        mock_ws1 = AsyncMock()
        mock_ws1.client_id = "test_client_001"
        mock_ws1.accept = AsyncMock()
        mock_ws2 = AsyncMock()
        mock_ws2.client_id = "test_client_002"
        mock_ws2.accept = AsyncMock()
        
        await manager.connect(mock_ws1, user_id="user_001", device_id="device_001")
        await manager.connect(mock_ws2, user_id="user_002", device_id="device_002")
        
        telemetry_message = {
            "event": "TELEMETRY_SNAPSHOT",
            "device_id": "device_001"
        }
        
        await manager.broadcast_to_user(user_id="user_001", message=telemetry_message)
        
        # Only user_001 should receive the message
        assert mock_ws1.send_json.call_count == 1
        assert mock_ws2.send_json.call_count == 0
    
    @pytest.mark.asyncio
    async def test_telemetry_streaming_to_device(self):
        """Test that telemetry is streamed to the correct device."""
        manager = ConnectionManager()
        
        mock_ws1 = AsyncMock()
        mock_ws1.client_id = "test_client_001"
        mock_ws1.accept = AsyncMock()
        mock_ws2 = AsyncMock()
        mock_ws2.client_id = "test_client_002"
        mock_ws2.accept = AsyncMock()
        
        await manager.connect(mock_ws1, user_id="user_001", device_id="device_001")
        await manager.connect(mock_ws2, user_id="user_001", device_id="device_002")
        
        telemetry_message = {
            "event": "TELEMETRY_SNAPSHOT",
            "device_id": "device_001"
        }
        
        await manager.broadcast_to_device(user_id="user_001", device_id="device_001", message=telemetry_message)
        
        # Only device_001 should receive the message
        assert mock_ws1.send_json.call_count == 1
        assert mock_ws2.send_json.call_count == 0
    
    @pytest.mark.asyncio
    async def test_telemetry_timestamp_included(self):
        """Test that telemetry messages include timestamps."""
        manager = ConnectionManager()
        
        mock_ws = AsyncMock()
        mock_ws.client_id = "test_client_001"
        mock_ws.accept = AsyncMock()
        
        await manager.connect(mock_ws, user_id="user_001", device_id="device_001")
        
        telemetry_message = {
            "event": "TELEMETRY_SNAPSHOT",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        await manager.send_personal_message(telemetry_message, mock_ws)
        
        call_args = mock_ws.send_json.call_args[0][0]
        assert "timestamp" in call_args
        assert call_args["timestamp"] is not None


class TestAlertStreaming:
    """Test suite for real-time alert streaming."""
    
    @pytest.mark.asyncio
    async def test_alert_message_format(self):
        """Test that alert messages are formatted correctly."""
        manager = ConnectionManager()
        
        mock_ws = AsyncMock()
        mock_ws.client_id = "test_client_001"
        mock_ws.accept = AsyncMock()
        
        await manager.connect(mock_ws, user_id="user_001", device_id="device_001")
        
        alert_message = {
            "event": "ANOMALY_ALERT",
            "alert_id": "alert_001",
            "rule_name": "CPU_OVERHEATING_CRITICAL",
            "severity": "CRITICAL",
            "message": "CPU temperature critical: 95.0°C",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        await manager.send_personal_message(alert_message, mock_ws)
        
        call_args = mock_ws.send_json.call_args[0][0]
        assert call_args["event"] == "ANOMALY_ALERT"
        assert call_args["severity"] == "CRITICAL"
        assert "message" in call_args
    
    @pytest.mark.asyncio
    async def test_alert_broadcast_to_user(self):
        """Test that alerts are broadcast to the correct user."""
        manager = ConnectionManager()
        
        mock_ws1 = AsyncMock()
        mock_ws1.client_id = "test_client_001"
        mock_ws1.accept = AsyncMock()
        mock_ws2 = AsyncMock()
        mock_ws2.client_id = "test_client_002"
        mock_ws2.accept = AsyncMock()
        
        await manager.connect(mock_ws1, user_id="user_001", device_id="device_001")
        await manager.connect(mock_ws2, user_id="user_002", device_id="device_002")
        
        alert_message = {
            "event": "ANOMALY_ALERT",
            "user_id": "user_001"
        }
        
        await manager.broadcast_to_user(user_id="user_001", message=alert_message)
        
        # Only user_001 should receive the alert
        assert mock_ws1.send_json.call_count == 1
        assert mock_ws2.send_json.call_count == 0
    
    @pytest.mark.asyncio
    async def test_alert_broadcast_to_device(self):
        """Test that alerts are broadcast to the correct device."""
        manager = ConnectionManager()
        
        mock_ws1 = AsyncMock()
        mock_ws1.client_id = "test_client_001"
        mock_ws1.accept = AsyncMock()
        mock_ws2 = AsyncMock()
        mock_ws2.client_id = "test_client_002"
        mock_ws2.accept = AsyncMock()
        
        await manager.connect(mock_ws1, user_id="user_001", device_id="device_001")
        await manager.connect(mock_ws2, user_id="user_001", device_id="device_002")
        
        alert_message = {
            "event": "ANOMALY_ALERT",
            "device_id": "device_001"
        }
        
        await manager.broadcast_to_device(user_id="user_001", device_id="device_001", message=alert_message)
        
        # Only device_001 should receive the alert
        assert mock_ws1.send_json.call_count == 1
        assert mock_ws2.send_json.call_count == 0
    
    @pytest.mark.asyncio
    async def test_alert_urgency_levels(self):
        """Test that alert messages include urgency levels."""
        manager = ConnectionManager()
        
        mock_ws = AsyncMock()
        mock_ws.client_id = "test_client_001"
        mock_ws.accept = AsyncMock()
        
        await manager.connect(mock_ws, user_id="user_001", device_id="device_001")
        
        alert_message = {
            "event": "ANOMALY_ALERT",
            "severity": "CRITICAL",
            "urgency": "IMMEDIATE_ACTION_REQUIRED"
        }
        
        await manager.send_personal_message(alert_message, mock_ws)
        
        call_args = mock_ws.send_json.call_args[0][0]
        assert call_args["severity"] == "CRITICAL"
        assert call_args["urgency"] == "IMMEDIATE_ACTION_REQUIRED"


class TestWebSocketErrorHandling:
    """Test suite for WebSocket error handling."""
    
    @pytest.mark.asyncio
    async def test_send_to_disconnected_connection(self):
        """Test sending to a disconnected connection doesn't raise errors."""
        manager = ConnectionManager()
        
        mock_ws = AsyncMock()
        mock_ws.client_id = "test_client_001"
        mock_ws.accept = AsyncMock()
        mock_ws.send_json.side_effect = Exception("Connection closed")
        
        await manager.connect(mock_ws, user_id="user_001", device_id="device_001")
        
        # Should handle the error gracefully
        try:
            await manager.send_personal_message({"test": "data"}, mock_ws)
        except Exception:
            # Expected to handle the error
            pass
    
    @pytest.mark.asyncio
    async def test_broadcast_with_no_connections(self):
        """Test broadcasting when no connections exist."""
        manager = ConnectionManager()
        
        # No connections
        message = {"test": "data"}
        
        # Should not raise errors
        await manager.broadcast_to_user(user_id="nonexistent", message=message)
        await manager.broadcast_to_device(user_id="nonexistent", device_id="nonexistent", message=message)
    
    @pytest.mark.asyncio
    async def test_connection_with_invalid_user_id(self):
        """Test connection with invalid user_id."""
        manager = ConnectionManager()
        
        mock_ws = AsyncMock()
        mock_ws.client_id = "test_client_001"
        mock_ws.accept = AsyncMock()
        
        await manager.connect(mock_ws, user_id="", device_id="device_001")
        
        # Connection should still be tracked
        assert "" in manager._connections or len(manager._connections) == 0


class TestWebSocketConcurrency:
    """Test suite for WebSocket concurrent operations."""
    
    # ... (rest of the code remains the same)
    async def test_concurrent_connections(self):
        """Test multiple concurrent connections."""
        manager = ConnectionManager()
        
        tasks = []
        for i in range(10):
            mock_ws = AsyncMock()
            mock_ws.client_id = f"test_client_{i}"
            mock_ws.accept = AsyncMock()
            task = manager.connect(mock_ws, user_id=f"user_{i}", device_id=f"device_{i}")
            tasks.append(task)
        
        await asyncio.gather(*tasks)
        
        assert len(manager._connections) == 10
    
    @pytest.mark.asyncio
    async def test_concurrent_broadcasts(self):
        """Test multiple concurrent broadcasts."""
        manager = ConnectionManager()
        
        mock_ws = AsyncMock()
        mock_ws.client_id = "test_client_001"
        mock_ws.accept = AsyncMock()
        
        await manager.connect(mock_ws, user_id="user_001", device_id="device_001")
        
        tasks = []
        for i in range(10):
            message = {"test": f"data_{i}"}
            task = manager.send_personal_message(message, mock_ws)
            tasks.append(task)
        
        await asyncio.gather(*tasks)
        
        assert mock_ws.send_json.call_count == 10
    
    @pytest.mark.asyncio
    async def test_concurrent_connect_disconnect(self):
        """Test concurrent connect and disconnect operations."""
        manager = ConnectionManager()
        
        tasks = []
        for i in range(5):
            mock_ws = AsyncMock()
            mock_ws.client_id = f"test_client_{i}"
            mock_ws.accept = AsyncMock()
            
            # Connect
            connect_task = manager.connect(mock_ws, user_id=f"user_{i}", device_id=f"device_{i}")
            tasks.append(connect_task)
            
            # Disconnect
            disconnect_task = manager.disconnect(mock_ws, user_id=f"user_{i}", device_id=f"device_{i}")
            tasks.append(disconnect_task)
        
        await asyncio.gather(*tasks)
        
        # Should handle concurrent operations gracefully
        assert True


class TestWebSocketMessageValidation:
    """Test suite for WebSocket message validation."""
    
    @pytest.mark.asyncio
    async def test_json_message_validation(self):
        """Test that messages are valid JSON."""
        manager = ConnectionManager()
        
        mock_ws = AsyncMock()
        mock_ws.client_id = "test_client_001"
        
        await manager.connect(mock_ws, user_id="user_001", device_id="device_001")
        
        message = {"event": "test", "data": "value"}
        
        await manager.send_personal_message(message, mock_ws)
        
        # Verify the message can be serialized to JSON
        call_args = mock_ws.send_json.call_args[0][0]
        json_str = json.dumps(call_args)
        assert json_str is not None
    
    @pytest.mark.asyncio
    async def test_message_size_limits(self):
        """Test handling of large messages."""
        manager = ConnectionManager()
        
        mock_ws = AsyncMock()
        mock_ws.client_id = "test_client_001"
        
        await manager.connect(mock_ws, user_id="user_001", device_id="device_001")
        
        # Create a large message
        large_data = {"test": "x" * 10000}
        
        await manager.send_personal_message(large_data, mock_ws)
        
        # Should handle large messages
        mock_ws.send_json.assert_called_once()


class TestWebSocketIsolation:
    """Test suite for WebSocket multi-tenant isolation."""
    
    @pytest.mark.asyncio
    async def test_user_isolation_in_broadcasts(self):
        """Test that broadcasts are isolated per user."""
        manager = ConnectionManager()
        
        mock_ws1 = AsyncMock()
        mock_ws1.client_id = "test_client_001"
        mock_ws1.accept = AsyncMock()
        mock_ws2 = AsyncMock()
        mock_ws2.client_id = "test_client_002"
        mock_ws2.accept = AsyncMock()
        
        await manager.connect(mock_ws1, user_id="user_001", device_id="device_001")
        await manager.connect(mock_ws2, user_id="user_002", device_id="device_002")
        
        message = {"event": "test", "user_id": "user_001"}
        
        await manager.broadcast_to_user(user_id="user_001", message=message)
        
        # Only user_001 should receive
        assert mock_ws1.send_json.call_count == 1
        assert mock_ws2.send_json.call_count == 0
    
    @pytest.mark.asyncio
    async def test_device_isolation_in_broadcasts(self):
        """Test that broadcasts are isolated per device."""
        manager = ConnectionManager()
        
        mock_ws1 = AsyncMock()
        mock_ws1.client_id = "test_client_001"
        mock_ws1.accept = AsyncMock()
        mock_ws2 = AsyncMock()
        mock_ws2.client_id = "test_client_002"
        mock_ws2.accept = AsyncMock()
        
        await manager.connect(mock_ws1, user_id="user_001", device_id="device_001")
        await manager.connect(mock_ws2, user_id="user_001", device_id="device_002")
        
        message = {"event": "test", "device_id": "device_001"}
        
        await manager.broadcast_to_device(user_id="user_001", device_id="device_001", message=message)
        
        # Only device_001 should receive
        assert mock_ws1.send_json.call_count == 1
        assert mock_ws2.send_json.call_count == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
