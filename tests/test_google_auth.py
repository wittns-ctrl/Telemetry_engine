"""Tests for the Sign in with Google flow (app/api/v1/google_auth.py)."""

from urllib.parse import parse_qs, urlparse

import mongomock_motor
import pytest
from beanie import init_beanie

from app.api.v1 import google_auth
from app.core.config import settings
from app.core.security import get_password_hash
from app.models.audit_log import AuditLog
from app.models.refresh_token import RefreshToken
from app.models.user import AuthProvider, User

LOGIN_URL = "/api/v1/auth/google/login"
CALLBACK_URL = "/api/v1/auth/google/callback"

GOOGLE_PROFILE = {
    "sub": "google-sub-123",
    "email": "Ada@Example.com",
    "email_verified": True,
    "name": "Ada Lovelace",
}


@pytest.fixture
async def db():
    # tz_aware matches the production client, which token expiry checks rely on.
    client = mongomock_motor.AsyncMongoMockClient(tz_aware=True)
    await init_beanie(
        database=client.google_auth_test,
        document_models=[User, RefreshToken, AuditLog],
    )
    yield client


@pytest.fixture
def google_configured(monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "test-client-secret")
    monkeypatch.setattr(settings, "GOOGLE_REDIRECT_URI", None)
    monkeypatch.setattr(settings, "FRONTEND_URL", "http://localhost:5173")


@pytest.fixture
def google_profile(monkeypatch):
    """Stub the round trip to Google; tests may mutate the returned profile."""
    profile = dict(GOOGLE_PROFILE)

    async def fake_fetch(code, redirect_uri):
        return profile

    monkeypatch.setattr(google_auth, "fetch_google_profile", fake_fetch)
    return profile


def redirect_params(response):
    assert response.status_code == 303
    location = urlparse(response.headers["location"])
    return location, parse_qs(location.query)


async def start_login(client):
    """Call /login and return the state Google would echo back."""
    response = await client.get(LOGIN_URL)
    _, params = redirect_params(response)
    return params["state"][0]


async def test_login_reports_missing_configuration(async_client, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", None)
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", None)

    location, params = redirect_params(await async_client.get(LOGIN_URL))

    assert location.path == "/signin"
    assert params["error"] == ["google_not_configured"]


async def test_login_redirects_to_google_with_state(async_client, google_configured):
    response = await async_client.get(LOGIN_URL)
    location, params = redirect_params(response)

    assert location.netloc == "accounts.google.com"
    assert params["client_id"] == ["test-client-id"]
    assert params["response_type"] == ["code"]
    assert params["redirect_uri"] == ["http://test/api/v1/auth/google/callback"]
    assert params["state"][0] == response.cookies[google_auth.STATE_COOKIE_NAME]
    assert "HttpOnly" in response.headers["set-cookie"]


async def test_callback_rejects_wrong_state(async_client, db, google_configured, google_profile):
    await start_login(async_client)

    response = await async_client.get(CALLBACK_URL, params={"code": "c", "state": "forged"})
    _, params = redirect_params(response)

    assert params["error"] == ["google_state_mismatch"]
    assert await User.find_all().count() == 0


async def test_callback_rejects_missing_state_cookie(async_client, db, google_configured, google_profile):
    response = await async_client.get(CALLBACK_URL, params={"code": "c", "state": "anything"})
    _, params = redirect_params(response)

    assert params["error"] == ["google_state_mismatch"]


async def test_callback_reports_cancellation(async_client, db, google_configured):
    response = await async_client.get(CALLBACK_URL, params={"error": "access_denied"})
    _, params = redirect_params(response)

    assert params["error"] == ["google_cancelled"]


async def test_callback_creates_user_and_session(async_client, db, google_configured, google_profile):
    state = await start_login(async_client)

    response = await async_client.get(CALLBACK_URL, params={"code": "c", "state": state})
    location, params = redirect_params(response)

    assert location.path == "/signin"
    assert params == {"google": ["success"]}
    # No token may leak into the redirect URL.
    assert "token" not in response.headers["location"]

    user = await User.find_one(User.google_id == "google-sub-123")
    assert user.normalized_email == "ada@example.com"
    assert user.full_name == "Ada Lovelace"
    assert user.email_verified is True
    assert user.hashed_password is None
    assert user.auth_providers == [AuthProvider.GOOGLE]

    assert "refresh_token" in response.cookies
    assert await RefreshToken.find(RefreshToken.user_id == str(user.id)).count() == 1

    # The cookie set by the callback is enough to obtain an access token.
    refreshed = await async_client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"]


async def test_callback_links_existing_verified_account(async_client, db, google_configured, google_profile):
    existing = User(
        email="ada@example.com",
        normalized_email="ada@example.com",
        full_name="Ada L.",
        hashed_password=get_password_hash("TestPassword123"),
        email_verified=True,
        auth_providers=[AuthProvider.PASSWORD],
    )
    await existing.insert()
    state = await start_login(async_client)

    response = await async_client.get(CALLBACK_URL, params={"code": "c", "state": state})
    _, params = redirect_params(response)

    assert params == {"google": ["success"]}
    assert await User.find_all().count() == 1
    user = await User.get(existing.id)
    assert user.google_id == "google-sub-123"
    assert user.full_name == "Ada L."
    assert user.hashed_password is not None
    assert set(user.auth_providers) == {AuthProvider.PASSWORD, AuthProvider.GOOGLE}


async def test_callback_drops_password_of_unverified_account(async_client, db, google_configured, google_profile):
    """A password set by someone who never verified the address must not survive linking."""
    squatter = User(
        email="ada@example.com",
        normalized_email="ada@example.com",
        hashed_password=get_password_hash("Squatter123"),
        email_verified=False,
        auth_providers=[AuthProvider.PASSWORD],
    )
    await squatter.insert()
    state = await start_login(async_client)

    await async_client.get(CALLBACK_URL, params={"code": "c", "state": state})

    user = await User.get(squatter.id)
    assert user.hashed_password is None
    assert user.auth_providers == [AuthProvider.GOOGLE]
    assert user.email_verified is True


async def test_callback_rejects_unverified_google_email(async_client, db, google_configured, google_profile):
    google_profile["email_verified"] = False
    state = await start_login(async_client)

    response = await async_client.get(CALLBACK_URL, params={"code": "c", "state": state})
    _, params = redirect_params(response)

    assert params["error"] == ["google_email_unverified"]
    assert await User.find_all().count() == 0
    assert "refresh_token" not in response.cookies


async def test_callback_rejects_inactive_account(async_client, db, google_configured, google_profile):
    await User(
        email="ada@example.com",
        normalized_email="ada@example.com",
        email_verified=True,
        is_active=False,
        auth_providers=[AuthProvider.GOOGLE],
        google_id="google-sub-123",
    ).insert()
    state = await start_login(async_client)

    response = await async_client.get(CALLBACK_URL, params={"code": "c", "state": state})
    _, params = redirect_params(response)

    assert params["error"] == ["account_inactive"]
    assert "refresh_token" not in response.cookies
