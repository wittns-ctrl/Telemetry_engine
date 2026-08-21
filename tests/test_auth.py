import pytest
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timezone, timedelta
from beanie import PydanticObjectId

from app.main import app
from app.models.user import User, UserRole, AuthProvider
from app.models.refresh_token import RefreshToken
from app.models.email_verification import EmailVerification
from app.models.password_reset import PasswordReset
from app.models.audit_log import AuditLog, AuditEventType
from app.core.security import get_password_hash, verify_password, create_access_token, create_refresh_token, hash_token, verify_token_hash
from app.db.session import init_db
from app.core.config import settings


@pytest.fixture
async def client():
    """Create test client."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def setup_db():
    """Initialize database for tests."""
    await init_db()
    yield


class TestSecurity:
    """Test security features."""
    
    def test_password_hashing(self):
        """Test password hashing and verification."""
        password = "TestPassword123"
        hashed = get_password_hash(password)
        assert verify_password(password, hashed)
        assert not verify_password("WrongPassword123", hashed)
    
    def test_token_creation(self):
        """Test JWT token creation."""
        user_id = str(PydanticObjectId())
        token = create_access_token(data={"sub": user_id})
        assert token
        assert isinstance(token, str)
    
    def test_refresh_token_generation(self):
        """Test refresh token generation."""
        token = create_refresh_token()
        assert token
        assert isinstance(token, str)
        assert len(token) > 32
    
    def test_token_hashing(self):
        """Test token hashing."""
        token = "test_token_123"
        hashed = hash_token(token)
        assert hashed != token
        assert verify_token_hash(token, hashed)
        assert not verify_token_hash("wrong_token", hashed)
