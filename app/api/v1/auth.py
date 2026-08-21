from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from fastapi.security import OAuth2PasswordRequestForm
from datetime import datetime, timezone, timedelta
from typing import Optional
import secrets

from app.models.user import (
    User, UserCreate, UserResponse, UserUpdate, 
    LoginRequest, RefreshTokenRequest, ChangePasswordRequest,
    Token, UserRole, AuthProvider
)
from app.models.auth import (
    ForgotPasswordRequest, ResetPasswordRequest, 
    VerifyEmailRequest, ResendVerificationRequest,
    MessageResponse
)
from app.models.refresh_token import RefreshToken
from app.models.email_verification import EmailVerification
from app.models.password_reset import PasswordReset
from app.models.audit_log import AuditLog, AuditEventType
from app.core.security import (
    verify_password, get_password_hash, create_access_token,
    create_refresh_token, hash_token, verify_token_hash, generate_family_id,
    email_verification_token, verify_email_token,
    password_reset_token, verify_reset_token
)
from app.core.config import settings
from app.api.deps import get_current_user
from app.services.email import email_service
from beanie import PydanticObjectId

router = APIRouter(prefix="/auth", tags=["Authentication"])


async def log_audit_event(
    user_id: str,
    event_type: AuditEventType,
    success: bool = True,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    details: Optional[dict] = None
):
    """Log an authentication audit event."""
    try:
        audit_log = AuditLog(
            user_id=user_id,
            event_type=event_type,
            ip_address=ip_address,
            user_agent=user_agent,
            success=success,
            details=details
        )
        await audit_log.insert()
    except Exception as e:
        print(f"Failed to log audit event: {e}")


async def get_client_info(request: Request) -> tuple[Optional[str], Optional[str]]:
    """Extract client IP and user agent from request."""
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    return ip_address, user_agent


def normalize_email(email: str) -> str:
    """Normalize email address."""
    return email.lower().strip()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_in: UserCreate,
    request: Request
):
    """Register a new user account."""
    normalized_email = normalize_email(user_in.email)
    
    # Check for existing user
    existing_user = await User.find_one(User.normalized_email == normalized_email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists."
        )
    
    # Create user
    user = User(
        email=user_in.email,
        normalized_email=normalized_email,
        full_name=user_in.full_name,
        hashed_password=get_password_hash(user_in.password),
        auth_providers=[AuthProvider.PASSWORD]
    )
    await user.insert()
    
    # Log registration
    ip_address, user_agent = await get_client_info(request)
    await log_audit_event(
        user_id=str(user.id),
        event_type=AuditEventType.REGISTRATION,
        success=True,
        ip_address=ip_address,
        user_agent=user_agent
    )
    
    # Generate and store email verification token
    verification_token = email_verification_token(str(user.id))
    verification_hash = hash_token(verification_token)
    
    email_verification = EmailVerification(
        user_id=str(user.id),
        token_hash=verification_hash,
        email=user.email,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24)
    )
    await email_verification.insert()
    
    # Send verification email
    verification_url = f"{settings.FRONTEND_URL}/verify-email?token={verification_token}"
    await email_service.send_verification_email(user.email, verification_url, user.full_name)
    
    return UserResponse(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        email_verified=user.email_verified,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login_at=user.last_login_at
    )


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    request: Request = None
):
    """Authenticate user with email and password."""
    normalized_email = normalize_email(form_data.username)
    
    user = await User.find_one(User.normalized_email == normalized_email)
    ip_address, user_agent = await get_client_info(request) if request else (None, None)
    
    if not user or not verify_password(form_data.password, user.hashed_password or ""):
        await log_audit_event(
            user_id="unknown",
            event_type=AuditEventType.LOGIN_FAILURE,
            success=False,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"email": normalized_email}
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        await log_audit_event(
            user_id=str(user.id),
            event_type=AuditEventType.LOGIN_FAILURE,
            success=False,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"reason": "inactive_account"}
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive"
        )
    
    # Generate tokens
    access_token = create_access_token(data={"sub": str(user.id)})
    refresh_token = create_refresh_token()
    refresh_token_hash = hash_token(refresh_token)
    family_id = generate_family_id()
    
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    
    # Store refresh token
    stored_refresh_token = RefreshToken(
        user_id=str(user.id),
        token_hash=refresh_token_hash,
        expires_at=expires_at,
        family_id=family_id
    )
    await stored_refresh_token.insert()
    
    # Update last login
    user.last_login_at = datetime.now(timezone.utc)
    await user.save()
    
    # Log successful login
    await log_audit_event(
        user_id=str(user.id),
        event_type=AuditEventType.LOGIN_SUCCESS,
        success=True,
        ip_address=ip_address,
        user_agent=user_agent
    )
    
    # Set refresh token in HttpOnly cookie
    response = Response()
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.APP_ENV == "production",
        samesite="lax",
        expires=expires_at,
        path="/"
    )
    
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer"
    )


@router.post("/refresh", response_model=Token)
async def refresh_token(request: Request):
    """Refresh access token using refresh token."""
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token not found"
        )
    
    refresh_token_hash = hash_token(refresh_token)
    stored_token = await RefreshToken.find_one(RefreshToken.token_hash == refresh_token_hash)
    
    if not stored_token or not stored_token.is_valid():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )
    
    # Check for token reuse (potential compromise)
    if stored_token.is_revoked:
        # Revoke all tokens in this family
        await RefreshToken.find_many(
            RefreshToken.family_id == stored_token.family_id
        ).update({"$set": {"is_revoked": True, "revoked_at": datetime.now(timezone.utc)}})
        
        # Log suspicious activity
        await log_audit_event(
            user_id=stored_token.user_id,
            event_type=AuditEventType.TOKEN_REUSE,
            success=False,
            details={"family_id": stored_token.family_id}
        )
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token reuse detected. Please login again."
        )
    
    user = await User.get(PydanticObjectId(stored_token.user_id))
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )
    
    # Rotate refresh token
    await stored_token.update({"$set": {"is_revoked": True, "revoked_at": datetime.now(timezone.utc)}})
    
    new_refresh_token = create_refresh_token()
    new_refresh_token_hash = hash_token(new_refresh_token)
    new_expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    
    new_stored_token = RefreshToken(
        user_id=str(user.id),
        token_hash=new_refresh_token_hash,
        expires_at=new_expires_at,
        family_id=stored_token.family_id
    )
    await new_stored_token.insert()
    
    # Generate new access token
    access_token = create_access_token(data={"sub": str(user.id)})
    
    # Set new refresh token in cookie
    response = Response()
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=settings.APP_ENV == "production",
        samesite="lax",
        expires=new_expires_at,
        path="/"
    )
    
    return Token(
        access_token=access_token,
        refresh_token=new_refresh_token,
        token_type="bearer"
    )


@router.post("/logout")
async def logout(
    current_user: User = Depends(get_current_user),
    request: Request = None
):
    """Logout user and revoke refresh token."""
    refresh_token = request.cookies.get("refresh_token") if request else None
    ip_address, user_agent = await get_client_info(request) if request else (None, None)
    
    if refresh_token:
        refresh_token_hash = hash_token(refresh_token)
        await RefreshToken.find_one(RefreshToken.token_hash == refresh_token_hash).update({
            "$set": {"is_revoked": True, "revoked_at": datetime.now(timezone.utc)}
        })
    
    # Log logout
    await log_audit_event(
        user_id=str(current_user.id),
        event_type=AuditEventType.LOGOUT,
        success=True,
        ip_address=ip_address,
        user_agent=user_agent
    )
    
    # Clear refresh token cookie
    response = Response()
    response.delete_cookie(key="refresh_token", path="/")
    
    return {"message": "Successfully logged out"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_endpoint(
    current_user: User = Depends(get_current_user)
):
    """Get current authenticated user."""
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        email_verified=current_user.email_verified,
        role=current_user.role,
        is_active=current_user.is_active,
        created_at=current_user.created_at,
        last_login_at=current_user.last_login_at
    )


@router.patch("/profile", response_model=UserResponse)
async def update_profile(
    profile_update: UserUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update user profile."""
    if profile_update.full_name is not None:
        current_user.full_name = profile_update.full_name
        current_user.updated_at = datetime.now(timezone.utc)
    
    await current_user.save()
    
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        email_verified=current_user.email_verified,
        role=current_user.role,
        is_active=current_user.is_active,
        created_at=current_user.created_at,
        last_login_at=current_user.last_login_at
    )


@router.post("/change-password")
async def change_password(
    password_change: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    request: Request = None
):
    """Change user password."""
    if not verify_password(password_change.current_password, current_user.hashed_password or ""):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    
    # Update password
    current_user.hashed_password = get_password_hash(password_change.new_password)
    current_user.updated_at = datetime.now(timezone.utc)
    await current_user.save()
    
    # Revoke all refresh tokens for security
    await RefreshToken.find_many(
        RefreshToken.user_id == str(current_user.id)
    ).update({"$set": {"is_revoked": True, "revoked_at": datetime.now(timezone.utc)}})
    
    # Log password change
    ip_address, user_agent = await get_client_info(request) if request else (None, None)
    await log_audit_event(
        user_id=str(current_user.id),
        event_type=AuditEventType.PASSWORD_CHANGE,
        success=True,
        ip_address=ip_address,
        user_agent=user_agent
    )
    
    return {"message": "Password changed successfully. Please login again."}


@router.delete("/account")
async def delete_account(
    current_user: User = Depends(get_current_user),
    request: Request = None
):
    """Deactivate/delete user account."""
    # Soft delete - mark as inactive
    current_user.is_active = False
    current_user.updated_at = datetime.now(timezone.utc)
    await current_user.save()
    
    # Revoke all refresh tokens
    await RefreshToken.find_many(
        RefreshToken.user_id == str(current_user.id)
    ).update({"$set": {"is_revoked": True, "revoked_at": datetime.now(timezone.utc)}})
    
    # Log account deactivation
    ip_address, user_agent = await get_client_info(request) if request else (None, None)
    await log_audit_event(
        user_id=str(current_user.id),
        event_type=AuditEventType.ACCOUNT_DEACTIVATION,
        success=True,
        ip_address=ip_address,
        user_agent=user_agent
    )
    
    return {"message": "Account deactivated successfully"}


@router.post("/verify-email")
async def verify_email(
    verification: VerifyEmailRequest,
    request: Request = None
):
    """Verify user email address."""
    user_id = verify_email_token(verification.token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token"
        )
    
    user = await User.get(PydanticObjectId(user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check if token is already used
    token_hash = hash_token(verification.token)
    stored_verification = await EmailVerification.find_one(
        EmailVerification.token_hash == token_hash
    )
    
    if not stored_verification or not stored_verification.is_valid():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token"
    )
    
    if stored_verification.is_used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification token already used"
        )
    
    # Mark email as verified
    user.email_verified = True
    user.updated_at = datetime.now(timezone.utc)
    await user.save()
    
    # Mark token as used
    stored_verification.is_used = True
    stored_verification.used_at = datetime.now(timezone.utc)
    await stored_verification.save()
    
    # Log verification
    ip_address, user_agent = await get_client_info(request) if request else (None, None)
    await log_audit_event(
        user_id=str(user.id),
        event_type=AuditEventType.EMAIL_VERIFICATION,
        success=True,
        ip_address=ip_address,
        user_agent=user_agent
    )
    
    return {"message": "Email verified successfully"}


@router.post("/resend-verification")
async def resend_verification(
    request_data: ResendVerificationRequest,
    request: Request = None
):
    """Resend email verification token."""
    normalized_email = normalize_email(request_data.email)
    user = await User.find_one(User.normalized_email == normalized_email)
    
    if not user:
        # Generic response to prevent email enumeration
        return {"message": "If an account exists with this email, a verification link has been sent."}
    
    if user.email_verified:
        return {"message": "Email is already verified"}
    
    # Generate new verification token
    verification_token = email_verification_token(str(user.id))
    verification_hash = hash_token(verification_token)
    
    email_verification = EmailVerification(
        user_id=str(user.id),
        token_hash=verification_hash,
        email=user.email,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24)
    )
    await email_verification.insert()
    
    # Send verification email
    verification_url = f"{settings.FRONTEND_URL}/verify-email?token={verification_token}"
    await email_service.send_verification_email(user.email, verification_url, user.full_name)
    
    return {"message": "If an account exists with this email, a verification link has been sent."}


@router.post("/forgot-password")
async def forgot_password(
    request_data: ForgotPasswordRequest,
    request: Request = None
):
    """Initiate password reset process."""
    normalized_email = normalize_email(request_data.email)
    user = await User.find_one(User.normalized_email == normalized_email)
    
    if not user:
        # Generic response to prevent email enumeration
        return {"message": "If an account exists with this email, a password reset link has been sent."}
    
    # Generate password reset token
    reset_token = password_reset_token(normalized_email)
    reset_token_hash = hash_token(reset_token)
    
    password_reset = PasswordReset(
        user_id=str(user.id),
        token_hash=reset_token_hash,
        email=user.email,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=15)
    )
    await password_reset.insert()
    
    # Send password reset email
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"
    await email_service.send_password_reset_email(user.email, reset_url, user.full_name)
    
    return {"message": "If an account exists with this email, a password reset link has been sent."}


@router.post("/reset-password")
async def reset_password(
    reset_data: ResetPasswordRequest,
    request: Request = None
):
    """Reset user password using reset token."""
    email = verify_reset_token(reset_data.token)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )
    
    normalized_email = normalize_email(email)
    user = await User.find_one(User.normalized_email == normalized_email)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check if token is already used
    token_hash = hash_token(reset_data.token)
    stored_reset = await PasswordReset.find_one(
        PasswordReset.token_hash == token_hash
    )
    
    if not stored_reset or not stored_reset.is_valid():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
    )
    
    if stored_reset.is_used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token already used"
        )
    
    # Update password
    user.hashed_password = get_password_hash(reset_data.new_password)
    user.updated_at = datetime.now(timezone.utc)
    await user.save()
    
    # Mark token as used
    stored_reset.is_used = True
    stored_reset.used_at = datetime.now(timezone.utc)
    await stored_reset.save()
    
    # Revoke all refresh tokens
    await RefreshToken.find_many(
        RefreshToken.user_id == str(user.id)
    ).update({"$set": {"is_revoked": True, "revoked_at": datetime.now(timezone.utc)}})
    
    # Log password reset
    ip_address, user_agent = await get_client_info(request) if request else (None, None)
    await log_audit_event(
        user_id=str(user.id),
        event_type=AuditEventType.PASSWORD_RESET,
        success=True,
        ip_address=ip_address,
        user_agent=user_agent
    )
    
    return {"message": "Password reset successfully. Please login with your new password."}
