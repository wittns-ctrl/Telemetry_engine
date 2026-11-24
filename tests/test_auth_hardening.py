"""
Sign-in hardening: logout without an access token, the refresh grace window
for tabs refreshing together, single-use WebSocket tickets, password-reset
links, first passwords for Google-only accounts, and inactive accounts.
"""

import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import jwt
import pytest
from fastapi import HTTPException

from app.api.deps import get_current_user_ws
from app.core.config import settings
from app.core.security import create_access_token, hash_token, verify_password
from app.models.password_reset import PasswordReset
from app.models.refresh_token import RefreshToken
from app.models.user import User

PASSWORD = "TestPassword123"


async def sign_in(client, email="test@example.com", password=PASSWORD) -> str:
    """Sign in and return the refresh token from the cookie."""
    client.cookies.clear()
    response = await client.post("/api/v1/auth/login", data={"username": email, "password": password})
    assert response.status_code == 200, response.text
    return response.cookies["refresh_token"]


async def refresh_with(client, token: str):
    client.cookies.clear()
    return await client.post("/api/v1/auth/refresh", headers={"Cookie": f"refresh_token={token}"})


# ------------------------------------------------------------------ logout

@pytest.mark.asyncio
async def test_logout_works_from_the_cookie_alone(async_client, test_user):
    token = await sign_in(async_client)
    async_client.cookies.clear()

    # No Authorization header: the access token may well have expired.
    response = await async_client.post("/api/v1/auth/logout", headers={"Cookie": f"refresh_token={token}"})

    assert response.status_code == 200
    stored = await RefreshToken.find_one(RefreshToken.token_hash == hash_token(token))
    assert stored.is_revoked
    assert (await refresh_with(async_client, token)).status_code == 401


@pytest.mark.asyncio
async def test_logout_without_any_session_still_succeeds(async_client, mock_mongo_client):
    async_client.cookies.clear()
    assert (await async_client.post("/api/v1/auth/logout")).status_code == 200


# --------------------------------------------------------- refresh grace

@pytest.mark.asyncio
async def test_two_tabs_refreshing_together_both_stay_signed_in(async_client, test_user):
    token = await sign_in(async_client)

    first = await refresh_with(async_client, token)
    second = await refresh_with(async_client, token)  # same cookie, a moment later

    assert first.status_code == 200
    assert second.status_code == 200, "a parallel refresh was treated as token theft"
    family = (await RefreshToken.find_one(RefreshToken.token_hash == hash_token(token))).family_id
    live = await RefreshToken.find(RefreshToken.family_id == family, RefreshToken.is_revoked == False).count()  # noqa: E712
    assert live == 2


@pytest.mark.asyncio
async def test_reuse_after_the_grace_window_ends_the_sign_in(async_client, test_user):
    token = await sign_in(async_client)
    assert (await refresh_with(async_client, token)).status_code == 200

    stored = await RefreshToken.find_one(RefreshToken.token_hash == hash_token(token))
    stored.replaced_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    await stored.save()

    response = await refresh_with(async_client, token)
    assert response.status_code == 401
    assert "reuse" in response.json()["detail"].lower()
    live = await RefreshToken.find(RefreshToken.family_id == stored.family_id, RefreshToken.is_revoked == False).count()  # noqa: E712
    assert live == 0


@pytest.mark.asyncio
async def test_no_grace_after_logout(async_client, test_user):
    token = await sign_in(async_client)
    newer = (await refresh_with(async_client, token)).cookies["refresh_token"]
    async_client.cookies.clear()
    await async_client.post("/api/v1/auth/logout", headers={"Cookie": f"refresh_token={newer}"})

    # The old token was rotated seconds ago, but the sign-in has been ended.
    assert (await refresh_with(async_client, token)).status_code == 401


# ------------------------------------------------------ WebSocket tickets

def fake_socket():
    socket = AsyncMock()
    socket.close = AsyncMock()
    return socket


@pytest.mark.asyncio
async def test_ws_ticket_opens_one_socket_only(async_client, test_user, auth_headers):
    response = await async_client.post("/api/v1/auth/ws-ticket", headers=auth_headers)
    assert response.status_code == 200
    ticket = response.json()["ticket"]
    claims = jwt.decode(ticket, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    assert claims["type"] == "ws"
    assert claims["exp"] - claims["iat"] <= 30

    assert (await get_current_user_ws(fake_socket(), ticket)).id == test_user.id
    with pytest.raises(HTTPException):
        await get_current_user_ws(fake_socket(), ticket)  # second use


@pytest.mark.asyncio
async def test_ws_rejects_access_tokens_in_the_url(test_user):
    access = create_access_token(data={"sub": str(test_user.id)})
    socket = fake_socket()
    with pytest.raises(HTTPException):
        await get_current_user_ws(socket, access)
    assert socket.close.await_args.kwargs["code"] == 1008


@pytest.mark.asyncio
async def test_ws_ticket_needs_a_signed_in_user(async_client, mock_mongo_client):
    assert (await async_client.post("/api/v1/auth/ws-ticket")).status_code == 401


# ------------------------------------------------------ reset links

async def request_reset(client, monkeypatch, email="test@example.com") -> str:
    """Ask for a reset link and return the token in it."""
    sent = {}

    async def capture(to, url, name=None):
        sent["token"] = url.split("token=", 1)[1]
        return True

    monkeypatch.setattr("app.api.v1.auth.email_service.send_password_reset_email", capture)
    response = await client.post("/api/v1/auth/forgot-password", json={"email": email})
    assert response.status_code == 200
    # The email goes out in the background; let it run.
    for _ in range(20):
        if "token" in sent:
            break
        await asyncio.sleep(0)
    return sent["token"]


async def reset(client, token, password="BrandNew123"):
    return await client.post("/api/v1/auth/reset-password", json={
        "token": token, "new_password": password, "confirm_password": password,
    })


@pytest.mark.asyncio
async def test_new_reset_link_cancels_the_older_one(async_client, test_user, monkeypatch):
    older = await request_reset(async_client, monkeypatch)
    newer = await request_reset(async_client, monkeypatch)  # same second: must still differ
    assert older != newer

    assert (await reset(async_client, older)).status_code == 400
    assert (await reset(async_client, newer)).status_code == 200


@pytest.mark.asyncio
async def test_reset_cancels_every_outstanding_link(async_client, test_user, monkeypatch):
    first = await request_reset(async_client, monkeypatch)
    # Pretend the first link is still live alongside a second one.
    second = await request_reset(async_client, monkeypatch)
    await PasswordReset.find(PasswordReset.token_hash == hash_token(first)).update({"$set": {"is_used": False}})

    assert (await reset(async_client, second)).status_code == 200

    unused = await PasswordReset.find(
        PasswordReset.user_id == str(test_user.id), PasswordReset.is_used == False  # noqa: E712
    ).count()
    assert unused == 0
    assert (await reset(async_client, first, "AnotherOne123")).status_code == 400


# --------------------------------------------- Google-only first password

async def make_google_only(user: User, signed_in_ago: timedelta) -> None:
    user.hashed_password = None
    user.auth_providers = ["google"]
    user.last_login_at = datetime.now(timezone.utc) - signed_in_ago
    await user.save()


def set_password_body(password="FirstPass123"):
    return {"new_password": password, "confirm_password": password}


@pytest.mark.asyncio
async def test_google_only_account_can_set_a_password_soon_after_sign_in(async_client, test_user, auth_headers):
    await make_google_only(test_user, timedelta(minutes=1))

    response = await async_client.post("/api/v1/auth/change-password", headers=auth_headers, json=set_password_body())

    assert response.status_code == 200, response.text
    user = await User.get(test_user.id)
    assert verify_password("FirstPass123", user.hashed_password)
    assert "password" in user.auth_providers


@pytest.mark.asyncio
async def test_google_only_account_must_have_signed_in_recently_to_set_one(async_client, test_user, auth_headers):
    await make_google_only(test_user, timedelta(hours=2))

    response = await async_client.post("/api/v1/auth/change-password", headers=auth_headers, json=set_password_body())

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "reauth_required"
    assert (await User.get(test_user.id)).hashed_password is None


@pytest.mark.asyncio
async def test_password_accounts_still_need_the_current_password(async_client, test_user, auth_headers):
    response = await async_client.post("/api/v1/auth/change-password", headers=auth_headers, json=set_password_body())
    assert response.status_code == 400


# ------------------------------------------------------ inactive accounts

@pytest.mark.asyncio
async def test_inactive_account_gets_403(async_client, test_user, auth_headers):
    test_user.is_active = False
    await test_user.save()
    assert (await async_client.get("/api/v1/auth/me", headers=auth_headers)).status_code == 403
