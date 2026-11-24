import threading
import time

from fastapi import Depends, HTTPException, status, WebSocket, Query
from fastapi.security import OAuth2PasswordBearer
from typing import Optional
import jwt
from beanie import PydanticObjectId
from app.core.config import settings
from app.core.security import verify_password
from app.core.cache import cache, user_key
from app.models.user import User, TokenData, UserRole


async def load_user(user_id: str) -> Optional[User]:
    """
    The user for a token, from the cache when it's there (every authenticated
    request needs it, and it rarely changes). Saving or deleting the user
    drops the cached copy (User model hooks); otherwise it expires after
    CACHE_USER_TTL_SECONDS. Each call returns its own copy, so a request
    changing it can't affect another.
    """
    try:
        oid = PydanticObjectId(user_id)
    except Exception:
        return None
    cached = await cache.get(user_key(oid))
    if cached is not None:
        return User.model_validate_json(cached)
    user = await User.get(oid)
    if user is not None:
        await cache.set(user_key(oid), user.model_dump_json(), settings.CACHE_USER_TTL_SECONDS)
    return user

# OAuth2 setup: instructs Swagger UI to get bearer tokens from /api/v1/auth/login

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    credentials_exception = HTTPException(
        status_code = status.HTTP_401_UNAUTHORIZED,
        detail = "could not validate credentials",
        headers={"WWW-Authenticate":"Bearer"},
    )
    try:
        # Decode token
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type")
        
        if user_id is None:
            raise credentials_exception
        if token_type != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )
        token_data = TokenData(user_id = user_id, token_type = token_type)
    except jwt.InvalidTokenError:
        raise credentials_exception


    user = await load_user(token_data.user_id)

    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")

    return user

async def get_current_user_optional(token: str | None = Depends(oauth2_scheme_optional)) -> User | None:
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type")
        
        if user_id is None or token_type != "access":
            return None
        user = await load_user(user_id)
        if user and user.is_active:
            return user
    except Exception:
        return None
    return None


def require_role(required_role: UserRole):
    """Dependency factory for role-based authorization."""
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role != required_role and current_user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions"
            )
        return current_user
    return role_checker


def require_admin():
    """Dependency for admin-only endpoints."""
    return require_role(UserRole.ADMIN)


# Tickets already used to open a socket, with their expiry (per process; a
# ticket lives 30 seconds, so this stays tiny).
_used_ws_tickets: dict[str, float] = {}
_ws_ticket_lock = threading.Lock()


def _claim_ws_ticket(jti: str, exp: float) -> bool:
    """Record a ticket as used. False if it was used before."""
    now = time.time()
    with _ws_ticket_lock:
        for key in [k for k, e in _used_ws_tickets.items() if e < now]:
            del _used_ws_tickets[key]
        if jti in _used_ws_tickets:
            return False
        _used_ws_tickets[jti] = exp
        return True


async def get_current_user_ws(
    websocket: WebSocket,
    token: Optional[str] = Query(None)
) -> User:
    """
    Authenticate a WebSocket by the ticket in ?token=, from POST /auth/ws-ticket.

    Access tokens are not accepted here: anything in a URL can end up in logs,
    so only single-use tickets that expire after 30 seconds go there. Failures
    close the connection with code 1008 (Policy Violation); the frontend then
    refreshes its sign-in and asks for a new ticket.
    """
    async def reject(reason: str):
        await websocket.close(code=1008, reason=reason)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=reason)

    if not token:
        await reject("Missing authentication token")
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except jwt.ExpiredSignatureError:
        await reject("Token expired")
    except jwt.InvalidTokenError:
        await reject("Invalid token")

    user_id = payload.get("sub")
    jti = payload.get("jti")
    if payload.get("type") != "ws" or not user_id or not jti:
        await reject("Invalid token type")
    if not _claim_ws_ticket(jti, float(payload.get("exp", 0))):
        await reject("Ticket already used")

    user = await load_user(user_id)
    if user is None:
        await reject("User not found")
    if not user.is_active:
        await reject("Inactive user")
    return user
