from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from fastapi.security import OAuth2PasswordRequestForm
from datetime import datetime, timezone, timedelta
from typing import Optional
import asyncio
import logging
import secrets

from app.models.user import (
    User, UserCreate, UserResponse, UserUpdate, 
    LoginRequest, RefreshTokenRequest, ChangePasswordRequest,
    Token, UserRole, AuthProvider
)
from app.models.auth import (
    ForgotPasswordRequest, ResetPasswordRequest, 
    VerifyEmailRequest, VerifyEmailCodeRequest, ResendVerificationRequest,
    DeleteAccountRequest, MessageResponse
)
from app.models.refresh_token import RefreshToken
from app.models.email_verification import EmailVerification
from app.models.password_reset import PasswordReset
from app.models.audit_log import AuditLog, AuditEventType
from app.models.rollup import TelemetryRollupDocument
from app.models.location import LocationHistory
from app.models.daily_report import DailyReport
from app.models.incident import Incident
from app.models.ai_script import AiScript
from app.models.telemetry import Device, TelemetrySnapshotDocument
from app.models.alert import AnomalyAlertDocument
from app.models.fix import FixRequest
from app.models.metric import Metrics
from app.services.anomaly_engine import anomaly_engine
from app.core.websocket_manager import manager as stream_manager
from app.core.security import (
    verify_password, get_password_hash, create_access_token,
    create_refresh_token, hash_token, verify_token_hash, generate_family_id,
    email_verification_token, verify_email_token,
    password_reset_token, verify_reset_token,
    new_email_code, hash_email_code,
    create_ws_ticket, WS_TICKET_SECONDS,
)
from app.core.config import settings
from app.api.deps import get_current_user
from app.services.email import email_service, send_in_background
from beanie import PydanticObjectId

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger(__name__)


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
    # The visitor's real address behind Vercel and Cloudflare, not Render's own.
    from app.core.rate_limit import _client_ip
    ip_address = _client_ip(request.scope)
    user_agent = request.headers.get("user-agent")
    return ip_address, user_agent


REFRESH_COOKIE_NAME = "refresh_token"

# Compared against on sign-in when the account doesn't exist (see login).
DUMMY_PASSWORD_HASH = get_password_hash(secrets.token_urlsafe(16))


def set_refresh_cookie(response: Response, token: str, expires_at: datetime) -> None:
    """Attach the refresh token as an HttpOnly cookie on the outgoing response."""
    secure = settings.APP_ENV == "production"
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=secure,
        # Cross-site deployments (frontend and API on different sites) need SameSite=None,
        # which browsers only accept together with Secure.
        samesite="none" if secure else "lax",
        expires=expires_at,
        path="/api/v1/auth",
    )


def clear_refresh_cookie(response: Response) -> None:
    secure = settings.APP_ENV == "production"
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path="/api/v1/auth",
        secure=secure,
        httponly=True,
        samesite="none" if secure else "lax",
    )


# ---------------------------------------------------------- email codes

CODE_LIFETIME = timedelta(minutes=10)
CODE_MAX_ATTEMPTS = 5
CODE_RESEND_AFTER = timedelta(seconds=60)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


async def issue_email_code(user: User, force: bool = True) -> bool:
    """
    Create a 6-digit code for the user's email and send it in the background.
    With force=False nothing is sent if a code went out less than a minute ago
    (so repeated sign-in attempts don't flood the inbox). Returns True if sent.
    """
    if not force:
        latest = await EmailVerification.find(
            EmailVerification.user_id == str(user.id),
            EmailVerification.code_hash != None,  # noqa: E711 (query expression)
        ).sort("-created_at").first_or_none()
        if latest and datetime.now(timezone.utc) - _aware(latest.created_at) < CODE_RESEND_AFTER:
            return False
    code = new_email_code()
    await EmailVerification(
        user_id=str(user.id),
        token_hash=secrets.token_hex(32),  # unique placeholder: codes are matched by code_hash
        code_hash=hash_email_code(str(user.id), code),
        email=user.email,
        expires_at=datetime.now(timezone.utc) + CODE_LIFETIME,
    ).insert()
    if settings.APP_ENV == "development":
        # So local testing works even when email can't be sent from this machine.
        logger.warning(f"[development] Email code for {user.email}: {code}")
    send_in_background(email_service.send_verification_code(user.email, code, user.full_name))
    return True


async def sign_in(user: User, request: Request, response: Response, event: AuditEventType) -> "Token":
    """Issue tokens and record the sign-in. The three writes run together."""
    access_token = create_access_token(data={"sub": str(user.id)})
    refresh_token = create_refresh_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    user.last_login_at = datetime.now(timezone.utc)
    ip_address, user_agent = await get_client_info(request)
    await asyncio.gather(
        RefreshToken(
            user_id=str(user.id),
            token_hash=hash_token(refresh_token),
            expires_at=expires_at,
            family_id=generate_family_id(),
        ).insert(),
        user.save(),
        log_audit_event(user_id=str(user.id), event_type=event, success=True, ip_address=ip_address, user_agent=user_agent),
    )
    set_refresh_cookie(response, refresh_token, expires_at)
    return Token(access_token=access_token, token_type="bearer")


def user_response(user: User) -> UserResponse:
    return UserResponse(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        email_verified=user.email_verified,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
        email_alerts=user.email_alerts,
        fix_level=user.fix_level,
        has_password=bool(user.hashed_password),
    )


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
        # Argon2 is deliberately slow; hashing in a thread keeps other requests moving.
        hashed_password=await asyncio.to_thread(get_password_hash, user_in.password),
        auth_providers=[AuthProvider.PASSWORD]
    )
    await user.insert()

    # Log it and email a 6-digit code at the same time; the email itself is
    # sent in the background so the page doesn't wait for the mail server.
    ip_address, user_agent = await get_client_info(request)
    await asyncio.gather(
        log_audit_event(
            user_id=str(user.id),
            event_type=AuditEventType.REGISTRATION,
            success=True,
            ip_address=ip_address,
            user_agent=user_agent
        ),
        issue_email_code(user),
    )
    
    return user_response(user)


@router.post("/login", response_model=Token)
async def login(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
):
    """Authenticate user with email and password."""
    normalized_email = normalize_email(form_data.username)
    
    user = await User.find_one(User.normalized_email == normalized_email)
    ip_address, user_agent = await get_client_info(request)

    # Always run one Argon2 check, against a dummy hash when there is no account
    # or no password, so the response time doesn't reveal which emails exist.
    stored_hash = (user.hashed_password if user else None) or DUMMY_PASSWORD_HASH
    password_ok = await asyncio.to_thread(verify_password, form_data.password, stored_hash)
    password_ok = password_ok and bool(user and user.hashed_password)
    if not password_ok:
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

    # Email is confirmed once, at sign-up; signing in needs only the password.
    return await sign_in(user, request, response, AuditEventType.LOGIN_SUCCESS)


REFRESH_GRACE = timedelta(seconds=30)


async def within_refresh_grace(token: RefreshToken) -> bool:
    """
    True when a revoked refresh token was only just rotated (not logged out or
    revoked by a password change) and its sign-in is still live. Tabs sharing
    one cookie that refresh together then don't trip reuse detection.
    """
    if not token.replaced_at or not token.family_id:
        return False
    if datetime.now(timezone.utc) - _aware(token.replaced_at) > REFRESH_GRACE:
        return False
    # Logout and password changes revoke every token, so a live one in the
    # family means this sign-in hasn't been ended.
    live = await RefreshToken.find_one(
        RefreshToken.family_id == token.family_id,
        RefreshToken.is_revoked == False,  # noqa: E712 (query expression)
    )
    return live is not None


@router.post("/refresh", response_model=Token)
async def refresh_token(request: Request, response: Response):
    """Refresh access token using refresh token."""
    refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token not found"
        )
    
    refresh_token_hash = hash_token(refresh_token)
    stored_token = await RefreshToken.find_one(RefreshToken.token_hash == refresh_token_hash)
    
    if not stored_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )
    
    # Check for token reuse (potential compromise). Must run before the validity
    # check, because is_valid() is False for revoked tokens.
    if stored_token.is_revoked and await within_refresh_grace(stored_token):
        # Two tabs refreshed at the same moment with the same cookie; the other
        # one won. Not an attack: give this tab its own token in the same family.
        pass
    elif stored_token.is_revoked:
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
    
    elif not stored_token.is_valid():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )
    if stored_token.is_expired():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )

    user = await User.get(PydanticObjectId(stored_token.user_id))
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )
    
    # Rotate refresh token (a grace-window reuse is already revoked; keep its times)
    if not stored_token.is_revoked:
        now = datetime.now(timezone.utc)
        await stored_token.update({"$set": {"is_revoked": True, "revoked_at": now, "replaced_at": now}})
    
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
    set_refresh_cookie(response, new_refresh_token, new_expires_at)
    
    return Token(access_token=access_token, token_type="bearer")


@router.post("/logout")
async def logout(request: Request, response: Response):
    """
    End this browser's session. Works from the refresh cookie alone, so signing
    out still revokes the session after the short-lived access token expired.
    Always succeeds; the cookie is cleared either way.
    """
    refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)
    ip_address, user_agent = await get_client_info(request)

    if refresh_token:
        stored = await RefreshToken.find_one(RefreshToken.token_hash == hash_token(refresh_token))
        if stored:
            # Revoke the whole family: this browser's sign-in, every rotation of it.
            # (Older tokens may have no family; then just this one.)
            scope = (
                RefreshToken.find_many(RefreshToken.family_id == stored.family_id)
                if stored.family_id
                else RefreshToken.find_many(RefreshToken.id == stored.id)
            )
            await scope.update({"$set": {"is_revoked": True, "revoked_at": datetime.now(timezone.utc)}})
            await log_audit_event(
                user_id=stored.user_id,
                event_type=AuditEventType.LOGOUT,
                success=True,
                ip_address=ip_address,
                user_agent=user_agent,
            )

    clear_refresh_cookie(response)
    return {"message": "Successfully logged out"}


@router.post("/ws-ticket")
async def ws_ticket(current_user: User = Depends(get_current_user)):
    """A single-use, 30-second ticket for opening one live-data WebSocket."""
    return {"ticket": create_ws_ticket(str(current_user.id)), "expires_in": WS_TICKET_SECONDS}


@router.get("/me", response_model=UserResponse)
async def get_current_user_endpoint(
    current_user: User = Depends(get_current_user)
):
    """Get current authenticated user."""
    return user_response(current_user)


@router.patch("/profile", response_model=UserResponse)
async def update_profile(
    profile_update: UserUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update user profile."""
    if profile_update.full_name is not None:
        current_user.full_name = profile_update.full_name
        current_user.updated_at = datetime.now(timezone.utc)

    if profile_update.email_alerts is not None:
        current_user.email_alerts = profile_update.email_alerts
        current_user.updated_at = datetime.now(timezone.utc)

    if profile_update.fix_level is not None:
        current_user.fix_level = profile_update.fix_level
        current_user.updated_at = datetime.now(timezone.utc)
    
    await current_user.save()
    
    return user_response(current_user)


@router.post("/change-password")
async def change_password(
    password_change: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    request: Request = None
):
    """
    Change the password, or set a first one for a Google-only account (which
    has no current password, so it must have signed in recently instead).
    """
    if current_user.hashed_password:
        ok = await asyncio.to_thread(
            verify_password, password_change.current_password or "", current_user.hashed_password
        )
        if not ok:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect"
            )
    else:
        require_recent_sign_in(current_user, "set a password")

    # Argon2 is deliberately slow; hashing in a thread keeps other requests moving.
    current_user.hashed_password = await asyncio.to_thread(get_password_hash, password_change.new_password)
    if AuthProvider.PASSWORD not in current_user.auth_providers:
        current_user.auth_providers = [*current_user.auth_providers, AuthProvider.PASSWORD]
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


REAUTH_WINDOW = timedelta(minutes=10)


def require_recent_sign_in(user: User, action: str) -> None:
    """For accounts without a password: allow `action` only soon after a real sign-in."""
    signed_in = user.last_login_at and datetime.now(timezone.utc) - _aware(user.last_login_at) < REAUTH_WINDOW
    if not signed_in:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "reauth_required",
                "message": f"For your security, sign out and sign in with Google again, then {action} within 10 minutes.",
            },
        )


async def confirm_identity_for_deletion(user: User, password: Optional[str]) -> None:
    """
    A valid access token alone isn't enough to erase an account. Accounts with a
    password must enter it; Google-only accounts must have signed in recently.
    Failures are 400/403, not 401, so the frontend doesn't try a token refresh.
    """
    if user.hashed_password:
        ok = bool(password) and await asyncio.to_thread(verify_password, password, user.hashed_password)
        if not ok:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "wrong_password", "message": "That password isn't right."},
            )
        return
    require_recent_sign_in(user, "delete your account")


@router.delete("/account")
async def delete_account(
    response: Response,
    body: Optional[DeleteAccountRequest] = None,
    current_user: User = Depends(get_current_user),
):
    """Permanently erase the account and everything stored for it.

    Removes the user's devices, readings, alerts, legacy metrics, sign-in
    sessions, email/password tokens and security logs, then the user record
    itself. The user record goes last so a failure part-way can be retried
    by calling this again. Nothing is kept, including the audit trail, so the
    erasure promised in the privacy policy is complete.
    """
    await confirm_identity_for_deletion(current_user, body.password if body else None)

    user_oid = current_user.id
    user_id = str(user_oid)

    # Stop new sessions first, then cut live connections.
    sessions = await RefreshToken.find(RefreshToken.user_id == user_id).delete()

    devices = await Device.find(Device.user_id == user_oid).to_list()
    for device in devices:
        await anomaly_engine.clear_device_state(user_id, str(device.id))
        await device._forget_cached_copies()  # the bulk delete below skips model hooks
    await stream_manager.disconnect_user(user_id)

    readings = await TelemetrySnapshotDocument.find(TelemetrySnapshotDocument.user_id == user_oid).delete()
    await TelemetryRollupDocument.find(TelemetryRollupDocument.user_id == user_oid).delete()
    await LocationHistory.find(LocationHistory.user_id == user_oid).delete()
    await DailyReport.find(DailyReport.user_id == user_oid).delete()
    await Incident.find(Incident.user_id == user_oid).delete()
    await AiScript.find(AiScript.user_id == user_oid).delete()
    alerts = await AnomalyAlertDocument.find(AnomalyAlertDocument.user_id == user_oid).delete()
    await FixRequest.find(FixRequest.user_id == user_oid).delete()
    metrics = await Metrics.find(Metrics.user_id == user_id).delete()
    await Device.find(Device.user_id == user_oid).delete()
    await EmailVerification.find(EmailVerification.user_id == user_id).delete()
    await PasswordReset.find(PasswordReset.user_id == user_id).delete()
    await AuditLog.find(AuditLog.user_id == user_id).delete()
    await current_user.delete()

    logger.info(
        "Account erased: %d devices, %d readings, %d alerts, %d metrics, %d sessions",
        len(devices), *(getattr(r, "deleted_count", 0) for r in (readings, alerts, metrics, sessions)),
    )

    clear_refresh_cookie(response)
    return {"message": "Account and all its data have been permanently deleted"}


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


@router.post("/verify-email-code", response_model=Token)
async def verify_email_code(body: VerifyEmailCodeRequest, request: Request, response: Response):
    """
    Confirm the email address with the 6-digit code sent to it, and sign in.
    Each code works for 10 minutes and allows 5 tries.
    """
    wrong = HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That code isn't right. Check the email and try again.")
    user = await User.find_one(User.normalized_email == normalize_email(body.email))
    if not user or not user.is_active:
        raise wrong
    record = await EmailVerification.find(
        EmailVerification.user_id == str(user.id),
        EmailVerification.code_hash != None,  # noqa: E711 (query expression)
        EmailVerification.is_used == False,  # noqa: E712
    ).sort("-created_at").first_or_none()
    if not record or datetime.now(timezone.utc) > _aware(record.expires_at):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That code has expired. Ask for a new one.")
    if record.attempts >= CODE_MAX_ATTEMPTS:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many wrong codes. Ask for a new one.")
    if not secrets.compare_digest(record.code_hash, hash_email_code(str(user.id), body.code)):
        record.attempts += 1
        await record.save()
        left = CODE_MAX_ATTEMPTS - record.attempts
        if left <= 0:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many wrong codes. Ask for a new one.")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"That code isn't right. {left} {'try' if left == 1 else 'tries'} left.")

    record.is_used = True
    record.used_at = datetime.now(timezone.utc)
    user.email_verified = True
    user.updated_at = datetime.now(timezone.utc)
    await record.save()
    await log_audit_event(user_id=str(user.id), event_type=AuditEventType.EMAIL_VERIFICATION, success=True)
    return await sign_in(user, request, response, AuditEventType.LOGIN_SUCCESS)


@router.post("/resend-verification")
async def resend_verification(
    request_data: ResendVerificationRequest,
    request: Request = None
):
    """Send a new 6-digit code (at most one a minute)."""
    generic = {"message": "If that account still needs confirming, a new code is on its way."}
    normalized_email = normalize_email(request_data.email)
    user = await User.find_one(User.normalized_email == normalized_email)
    # The same answer either way, so nobody can test which emails have accounts.
    if not user or user.email_verified:
        return generic
    await issue_email_code(user, force=False)
    return generic


async def expire_reset_links(user_id: str) -> None:
    """Mark every unused password-reset link for this user as used."""
    await PasswordReset.find(
        PasswordReset.user_id == user_id,
        PasswordReset.is_used == False,  # noqa: E712 (query expression)
    ).update({"$set": {"is_used": True, "used_at": datetime.now(timezone.utc)}})


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
    
    # Only the newest link works: earlier ones are cancelled.
    await expire_reset_links(str(user.id))

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
    # In the background, so an existing account doesn't answer slower than a missing one.
    send_in_background(email_service.send_password_reset_email(user.email, reset_url, user.full_name))
    
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
    
    # Update password (in a thread: Argon2 is deliberately slow)
    user.hashed_password = await asyncio.to_thread(get_password_hash, reset_data.new_password)
    if AuthProvider.PASSWORD not in user.auth_providers:
        user.auth_providers = [*user.auth_providers, AuthProvider.PASSWORD]
    user.updated_at = datetime.now(timezone.utc)
    await user.save()

    # This link and any other outstanding ones stop working.
    await expire_reset_links(str(user.id))
    
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
