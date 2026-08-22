from fastapi import Depends, HTTPException, status, WebSocket, Query
from fastapi.security import OAuth2PasswordBearer
from typing import Optional
import jwt
from beanie import PydanticObjectId
from app.core.config import settings
from app.core.security import verify_password
from app.models.user import User, TokenData, UserRole

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


    #Query user from MongoDB by PydanticObjectId
    user = await User.get(PydanticObjectId(token_data.user_id))

    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=400,detail = "Inactive user")

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
        user = await User.get(PydanticObjectId(user_id))
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


async def get_current_user_ws(
    websocket: WebSocket,
    token: Optional[str] = Query(None)
) -> User:
    """
    Authenticate WebSocket connections via JWT query parameter.
    
    This dependency validates the JWT token provided as a query parameter
    (e.g., ws://.../ws/telemetry?token=YOUR_JWT) and returns the
    authenticated user. Invalid or expired tokens result in connection
    closure with code 1008 (Policy Violation).
    
    Args:
        websocket: The WebSocket connection to authenticate
        token: The JWT token from query parameters
        
    Returns:
        The authenticated User object
        
    Raises:
        WebSocketDisconnect: If authentication fails (closes connection)
    """
    if not token:
        await websocket.close(code=1008, reason="Missing authentication token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token"
        )
    
    try:
        # Decode token
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type")
        
        if user_id is None:
            await websocket.close(code=1008, reason="Invalid token: missing user_id")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing user_id"
            )
        
        if token_type != "access":
            await websocket.close(code=1008, reason="Invalid token type")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )
        
        token_data = TokenData(user_id=user_id, token_type=token_type)
    
    except jwt.ExpiredSignatureError:
        await websocket.close(code=1008, reason="Token expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired"
        )
    except jwt.InvalidTokenError as e:
        await websocket.close(code=1008, reason="Invalid token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}"
        )
    
    # Query user from MongoDB by PydanticObjectId
    user = await User.get(PydanticObjectId(token_data.user_id))
    
    if user is None:
        await websocket.close(code=1008, reason="User not found")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    if not user.is_active:
        await websocket.close(code=1008, reason="Inactive user")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Inactive user"
        )
    
    return user