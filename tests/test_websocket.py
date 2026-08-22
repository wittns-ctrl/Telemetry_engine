"""
Test suite for WebSocket functionality.

This module tests the WebSocket connection manager, authentication,
and streaming endpoints for real-time telemetry and alerts.
"""

import pytest
import asyncio
from datetime import datetime, timezone
from beanie import PydanticObjectId
from fastapi.testclient import TestClient
from fastapi import WebSocket

from app.core.websocket_manager import ConnectionManager, manager
from app.models.user import User, UserRole
from app.core.security import get_password_hash, create_access_token
from app.db.session import init_db


@pytest.fixture
async def setup_db():
    """Initialize database for tests."""
    await init_db()
    yield


@pytest.fixture
async def test_user(setup_db):
    """Create a test user for WebSocket tests."""
    # Clean up any existing test user
    existing_user = await User.find_one(User.email == "websocket_test@example.com")
    if existing_user:
        await existing_user.delete()
    
    user = User(
        email="websocket_test@example.com",
        normalized_email="websocket_test@example.com",
        full_name="WebSocket Test User",
        hashed_password=get_password_hash("TestPassword123"),
        email_verified=True,
        role=UserRole.USER,
        auth_providers=["password"]
    )
    await user.insert()
    yield user
    await user.delete()


class TestConnectionManager:
    """Test suite for ConnectionManager class."""
    
    @pytest.mark.asyncio
    async def test_manager_initialization(self):
        """Test that the connection manager initializes correctly."""
        test_manager = ConnectionManager()
        assert test_manager._connections == {}
        assert len(test_manager._connections) == 0
    
    @pytest.mark.asyncio
    async def test_connect_and_disconnect(self):
        """Test connecting and disconnecting WebSocket connections."""
        test_manager = ConnectionManager()
        
        # Create a mock WebSocket
        class MockWebSocket:
            def __init__(self):
                self.accepted = False
            
            async def accept(self):
                self.accepted = True
        
        websocket = MockWebSocket()
        user_id = "test_user_123"
        device_id = "test_device_456"
        
        # Test connection
        await test_manager.connect(websocket, user_id, device_id)
        assert websocket.accepted == True
        
        # Verify connection is tracked
        count = await test_manager.get_connection_count(user_id, device_id)
        assert count == 1
        
        # Test disconnection (manager only removes from tracking, doesn't close)
        await test_manager.disconnect(websocket, user_id, device_id)
        
        # Verify connection is removed
        count = await test_manager.get_connection_count(user_id, device_id)
        assert count == 0
    
    @pytest.mark.asyncio
    async def test_multiple_connections_same_device(self):
        """Test multiple connections to the same device."""
        test_manager = ConnectionManager()
        
        class MockWebSocket:
            def __init__(self):
                self.accepted = False
                self.messages = []
            
            async def accept(self):
                self.accepted = True
            
            async def send_json(self, message):
                self.messages.append(message)
            
            async def close(self, code=None, reason=None):
                pass
        
        user_id = "test_user_123"
        device_id = "test_device_456"
        
        # Create multiple connections
        ws1 = MockWebSocket()
        ws2 = MockWebSocket()
        ws3 = MockWebSocket()
        
        await test_manager.connect(ws1, user_id, device_id)
        await test_manager.connect(ws2, user_id, device_id)
        await test_manager.connect(ws3, user_id, device_id)
        
        # Verify all connections are tracked
        count = await test_manager.get_connection_count(user_id, device_id)
        assert count == 3
        
        # Test broadcast to device
        test_message = {"type": "test", "data": "hello"}
        await test_manager.broadcast_to_device(user_id, device_id, test_message)
        
        # Verify all connections received the message
        assert len(ws1.messages) == 1
        assert len(ws2.messages) == 1
        assert len(ws3.messages) == 1
        assert ws1.messages[0] == test_message
        
        # Cleanup
        await test_manager.disconnect(ws1, user_id, device_id)
        await test_manager.disconnect(ws2, user_id, device_id)
        await test_manager.disconnect(ws3, user_id, device_id)
    
    @pytest.mark.asyncio
    async def test_send_personal_message(self):
        """Test sending a message to a specific WebSocket."""
        test_manager = ConnectionManager()
        
        class MockWebSocket:
            def __init__(self):
                self.accepted = False
                self.messages = []
            
            async def accept(self):
                self.accepted = True
            
            async def send_json(self, message):
                self.messages.append(message)
        
        websocket = MockWebSocket()
        user_id = "test_user_123"
        device_id = "test_device_456"
        
        await test_manager.connect(websocket, user_id, device_id)
        
        test_message = {"type": "personal", "data": "test"}
        await test_manager.send_personal_message(test_message, websocket)
        
        assert len(websocket.messages) == 1
        assert websocket.messages[0] == test_message
        
        # Cleanup
        await test_manager.disconnect(websocket, user_id, device_id)
    
    @pytest.mark.asyncio
    async def test_disconnect_all(self):
        """Test disconnecting all connections."""
        test_manager = ConnectionManager()
        
        class MockWebSocket:
            def __init__(self):
                self.accepted = False
                self.closed = False
            
            async def accept(self):
                self.accepted = True
            
            async def close(self, code=None, reason=None):
                self.closed = True
        
        # Create multiple connections
        ws1 = MockWebSocket()
        ws2 = MockWebSocket()
        
        await test_manager.connect(ws1, "user1", "device1")
        await test_manager.connect(ws2, "user2", "device2")
        
        # Disconnect all
        await test_manager.disconnect_all()
        
        # Verify all connections are closed
        assert ws1.closed == True
        assert ws2.closed == True
        
        # Verify connection tracking is cleared
        assert len(test_manager._connections) == 0


class TestWebSocketAuthentication:
    """Test suite for WebSocket authentication."""
    
    def test_create_access_token(self, test_user):
        """Test creating an access token for WebSocket authentication."""
        token = create_access_token(
            data={"sub": str(test_user.id), "type": "access"},
            expires_delta=None
        )
        assert token is not None
        assert isinstance(token, str)
    
    def test_token_creation_with_expiration(self, test_user):
        """Test token creation with expiration."""
        from datetime import timedelta
        
        token = create_access_token(
            data={"sub": str(test_user.id), "type": "access"},
            expires_delta=timedelta(minutes=15)
        )
        assert token is not None


class TestWebSocketEndpoints:
    """Test suite for WebSocket endpoints."""
    
    @pytest.mark.asyncio
    async def test_websocket_telemetry_stream_requires_token(self):
        """Test that WebSocket endpoint requires authentication."""
        from app.main import app
        from fastapi.testclient import TestClient
        
        client = TestClient(app)
        
        # Try to connect without token
        with pytest.raises(Exception):  # WebSocket connection will fail
            with client.websocket_connect(
                "/api/v1/ws/telemetry/test_device_id"
            ) as websocket:
                pass
    
    @pytest.mark.asyncio
    async def test_websocket_alert_stream_requires_token(self):
        """Test that alert WebSocket endpoint requires authentication."""
        from app.main import app
        from fastapi.testclient import TestClient
        
        client = TestClient(app)
        
        # Try to connect without token
        with pytest.raises(Exception):  # WebSocket connection will fail
            with client.websocket_connect(
                "/api/v1/ws/alerts/test_device_id"
            ) as websocket:
                pass


class TestWebSocketIntegration:
    """Integration tests for WebSocket functionality."""
    
    @pytest.mark.asyncio
    async def test_connection_lifecycle(self, test_user):
        """Test complete connection lifecycle."""
        test_manager = ConnectionManager()
        
        class MockWebSocket:
            def __init__(self):
                self.accepted = False
                self.messages = []
            
            async def accept(self):
                self.accepted = True
            
            async def send_json(self, message):
                self.messages.append(message)
            
            async def receive_text(self):
                await asyncio.sleep(0.1)
                return "ping"
        
        websocket = MockWebSocket()
        user_id = str(test_user.id)
        device_id = str(PydanticObjectId())
        
        # Connect
        await test_manager.connect(websocket, user_id, device_id)
        assert websocket.accepted == True
        
        # Send message
        await test_manager.send_personal_message(
            {"type": "test", "data": "hello"},
            websocket
        )
        assert len(websocket.messages) == 1
        
        # Broadcast
        await test_manager.broadcast_to_device(
            user_id,
            device_id,
            {"type": "broadcast", "data": "world"}
        )
        assert len(websocket.messages) == 2
        
        # Disconnect (manager only removes from tracking)
        await test_manager.disconnect(websocket, user_id, device_id)
        
        # Verify connection is removed
        count = await test_manager.get_connection_count(user_id, device_id)
        assert count == 0
    
    @pytest.mark.asyncio
    async def test_tenant_isolation(self, test_user):
        """Test that WebSocket connections respect tenant isolation."""
        test_manager = ConnectionManager()
        
        class MockWebSocket:
            def __init__(self):
                self.accepted = False
                self.messages = []
            
            async def accept(self):
                self.accepted = True
            
            async def send_json(self, message):
                self.messages.append(message)
        
        user1_id = "user1"
        user2_id = "user2"
        device_id = "shared_device"
        
        # Connect two different users
        ws1 = MockWebSocket()
        ws2 = MockWebSocket()
        
        await test_manager.connect(ws1, user1_id, device_id)
        await test_manager.connect(ws2, user2_id, device_id)
        
        # Broadcast to user1 only
        await test_manager.broadcast_to_device(
            user1_id,
            device_id,
            {"type": "user1_message"}
        )
        
        # Only user1 should receive the message
        assert len(ws1.messages) == 1
        assert len(ws2.messages) == 0
        
        # Broadcast to user2 only
        await test_manager.broadcast_to_device(
            user2_id,
            device_id,
            {"type": "user2_message"}
        )
        
        # Only user2 should receive the new message
        assert len(ws1.messages) == 1
        assert len(ws2.messages) == 1
        
        # Cleanup
        await test_manager.disconnect(ws1, user1_id, device_id)
        await test_manager.disconnect(ws2, user2_id, device_id)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
