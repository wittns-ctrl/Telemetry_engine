"""
Sign in with Google (OAuth 2.0 authorization-code flow).

The browser is sent to GET /auth/google/login, on to Google, and back to
GET /auth/google/callback. The callback sets the usual HttpOnly refresh-token
cookie and redirects to the frontend sign-in page, which exchanges the cookie
for an access token through POST /auth/refresh. No token ever appears in a URL.
"""

import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from app.api.v1.auth import (
    get_client_info,
    log_audit_event,
    normalize_email,
    set_refresh_cookie,
)
from app.core.config import settings
from app.core.security import create_refresh_token, generate_family_id, hash_token
from app.models.audit_log import AuditEventType
from app.models.refresh_token import RefreshToken
from app.models.user import AuthProvider, User

router = APIRouter(prefix="/auth/google", tags=["Authentication"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

STATE_COOKIE_NAME = "google_oauth_state"
STATE_COOKIE_PATH = "/api/v1/auth/google"
STATE_MAX_AGE_SECONDS = 600


class GoogleAuthError(Exception):
    """Sign-in could not be completed; `code` is shown to the user by the frontend."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def is_configured() -> bool:
    return bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)


def get_redirect_uri(request: Request) -> str:
    """The callback URL registered with Google. Defaults to this server's own route."""
    return settings.GOOGLE_REDIRECT_URI or str(request.url_for("google_callback"))


def frontend_redirect(**params: str) -> RedirectResponse:
    response = RedirectResponse(
        f"{settings.FRONTEND_URL.rstrip('/')}/signin?{urlencode(params)}",
        status_code=303,
    )
    # The state is single-use, whatever the outcome.
    response.delete_cookie(STATE_COOKIE_NAME, path=STATE_COOKIE_PATH)
    return response


async def fetch_google_profile(code: str, redirect_uri: str) -> dict:
    """Exchange the authorization code and return Google's userinfo claims."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            token_response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                },
            )
            token_response.raise_for_status()
            google_access_token = token_response.json()["access_token"]

            profile_response = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {google_access_token}"},
            )
            profile_response.raise_for_status()
            return profile_response.json()
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise GoogleAuthError("google_failed") from exc


async def get_or_create_user(profile: dict) -> User:
    """Find the account for a Google profile, linking or creating it as needed."""
    google_id = profile.get("sub")
    email = profile.get("email")
    if not google_id or not email:
        raise GoogleAuthError("google_failed")
    # Never link or create on an address Google has not verified.
    if profile.get("email_verified") not in (True, "true"):
        raise GoogleAuthError("google_email_unverified")

    now = datetime.now(timezone.utc)
    user = await User.find_one(User.google_id == google_id)

    if not user:
        user = await User.find_one(User.normalized_email == normalize_email(email))
        if user:
            if not user.email_verified and user.hashed_password:
                # Whoever registered this address with a password never proved they
                # own it. Drop that password and its sessions so they cannot keep
                # access to an account the real owner is now signing in to.
                user.hashed_password = None
                user.auth_providers = [
                    p for p in user.auth_providers if p != AuthProvider.PASSWORD
                ]
                await RefreshToken.find_many(
                    RefreshToken.user_id == str(user.id)
                ).update({"$set": {"is_revoked": True, "revoked_at": now}})
            user.google_id = google_id

    if not user:
        user = User(
            email=email,
            normalized_email=normalize_email(email),
            full_name=profile.get("name"),
            email_verified=True,
            auth_providers=[AuthProvider.GOOGLE],
            google_id=google_id,
        )
        await user.insert()
        return user

    if not user.is_active:
        raise GoogleAuthError("account_inactive")

    if AuthProvider.GOOGLE not in user.auth_providers:
        user.auth_providers = [*user.auth_providers, AuthProvider.GOOGLE]
    user.email_verified = True
    if not user.full_name and profile.get("name"):
        user.full_name = profile["name"]
    user.updated_at = now
    await user.save()
    return user


@router.get("/login", name="google_login")
async def google_login(request: Request):
    """Send the browser to Google's consent screen."""
    if not is_configured():
        return frontend_redirect(error="google_not_configured")

    state = secrets.token_urlsafe(32)
    query = urlencode(
        {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "redirect_uri": get_redirect_uri(request),
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "prompt": "select_account",
        }
    )
    response = RedirectResponse(f"{GOOGLE_AUTH_URL}?{query}", status_code=303)
    # Lax so the cookie comes back on Google's top-level redirect to the callback.
    response.set_cookie(
        key=STATE_COOKIE_NAME,
        value=state,
        max_age=STATE_MAX_AGE_SECONDS,
        httponly=True,
        secure=settings.APP_ENV == "production",
        samesite="lax",
        path=STATE_COOKIE_PATH,
    )
    return response


@router.get("/callback", name="google_callback")
async def google_callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
):
    """Finish the Google sign-in and start a session."""
    if not is_configured():
        return frontend_redirect(error="google_not_configured")
    if error:
        # The user pressed Cancel, or Google refused the request.
        return frontend_redirect(error="google_cancelled")

    expected_state = request.cookies.get(STATE_COOKIE_NAME)
    if (
        not code
        or not state
        or not expected_state
        or not secrets.compare_digest(state, expected_state)
    ):
        return frontend_redirect(error="google_state_mismatch")

    ip_address, user_agent = await get_client_info(request)
    try:
        profile = await fetch_google_profile(code, get_redirect_uri(request))
        user = await get_or_create_user(profile)
    except GoogleAuthError as exc:
        await log_audit_event(
            user_id="unknown",
            event_type=AuditEventType.LOGIN_FAILURE,
            success=False,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"provider": "google", "reason": exc.code},
        )
        return frontend_redirect(error=exc.code)

    refresh_token = create_refresh_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await RefreshToken(
        user_id=str(user.id),
        token_hash=hash_token(refresh_token),
        expires_at=expires_at,
        family_id=generate_family_id(),
    ).insert()

    user.last_login_at = datetime.now(timezone.utc)
    await user.save()

    await log_audit_event(
        user_id=str(user.id),
        event_type=AuditEventType.OAUTH_LOGIN,
        success=True,
        ip_address=ip_address,
        user_agent=user_agent,
        details={"provider": "google"},
    )

    response = frontend_redirect(google="success")
    set_refresh_cookie(response, refresh_token, expires_at)
    return response
