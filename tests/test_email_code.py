"""
Email addresses are confirmed with a 6-digit code: sent at sign-up, required
before the first sign-in, limited to 10 minutes and 5 tries.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.models.email_verification import EmailVerification
from app.models.user import User

EMAIL = "new.person@example.com"
PASSWORD = "Sunny-Day-2026"


@pytest.fixture
def codes(monkeypatch):
    """Every code handed out, in order; and no real email is sent."""
    issued = []

    def next_code():
        code = f"{len(issued) + 1:06d}"
        issued.append(code)
        return code

    monkeypatch.setattr("app.api.v1.auth.new_email_code", next_code)
    sender = AsyncMock(return_value=True)
    monkeypatch.setattr("app.api.v1.auth.email_service.send_verification_code", sender)
    return issued, sender


async def sign_up(client):
    return await client.post("/api/v1/auth/register", json={
        "full_name": "New Person", "email": EMAIL, "password": PASSWORD, "confirm_password": PASSWORD,
    })


async def sign_in(client):
    return await client.post("/api/v1/auth/login", data={"username": EMAIL, "password": PASSWORD})


@pytest.mark.asyncio
async def test_sign_up_emails_a_code_and_sign_in_waits_for_it(async_client, mock_mongo_client, codes):
    issued, sender = codes
    assert (await sign_up(async_client)).status_code == 201
    assert issued == ["000001"]
    sender.assert_awaited_once()
    assert sender.await_args.args[:2] == (EMAIL, "000001")

    response = await sign_in(async_client)
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "email_not_verified"
    assert issued == ["000001"]  # no second code within a minute


@pytest.mark.asyncio
async def test_right_code_confirms_the_email_and_signs_in(async_client, mock_mongo_client, codes):
    await sign_up(async_client)
    response = await async_client.post("/api/v1/auth/verify-email-code", json={"email": EMAIL, "code": "000001"})
    assert response.status_code == 200
    assert response.json()["access_token"]
    assert "refresh_token" in response.cookies or response.headers.get("set-cookie")
    assert (await User.find_one(User.normalized_email == EMAIL)).email_verified is True
    # From now on the password alone is enough.
    assert (await sign_in(async_client)).status_code == 200


@pytest.mark.asyncio
async def test_wrong_codes_count_down_then_lock_the_code(async_client, mock_mongo_client, codes):
    await sign_up(async_client)
    for left in (4, 3, 2, 1):
        response = await async_client.post("/api/v1/auth/verify-email-code", json={"email": EMAIL, "code": "999999"})
        assert response.status_code == 400
        assert f"{left} {'try' if left == 1 else 'tries'} left" in response.json()["detail"]
    assert (await async_client.post("/api/v1/auth/verify-email-code", json={"email": EMAIL, "code": "999999"})).status_code == 429
    # Even the right code is refused now; a new one is needed.
    assert (await async_client.post("/api/v1/auth/verify-email-code", json={"email": EMAIL, "code": "000001"})).status_code == 429


@pytest.mark.asyncio
async def test_an_expired_code_is_refused(async_client, mock_mongo_client, codes):
    await sign_up(async_client)
    record = await EmailVerification.find_one(EmailVerification.email == EMAIL)
    record.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    await record.save()
    response = await async_client.post("/api/v1/auth/verify-email-code", json={"email": EMAIL, "code": "000001"})
    assert response.status_code == 400
    assert "expired" in response.json()["detail"]


@pytest.mark.asyncio
async def test_resend_waits_a_minute_and_the_newest_code_counts(async_client, mock_mongo_client, codes):
    issued, _ = codes
    await sign_up(async_client)
    await async_client.post("/api/v1/auth/resend-verification", json={"email": EMAIL})
    assert issued == ["000001"]  # too soon

    record = await EmailVerification.find_one(EmailVerification.email == EMAIL)
    record.created_at = datetime.now(timezone.utc) - timedelta(minutes=2)
    await record.save()
    await async_client.post("/api/v1/auth/resend-verification", json={"email": EMAIL})
    assert issued == ["000001", "000002"]

    assert (await async_client.post("/api/v1/auth/verify-email-code", json={"email": EMAIL, "code": "000002"})).status_code == 200


@pytest.mark.asyncio
async def test_resend_gives_the_same_answer_for_unknown_emails(async_client, mock_mongo_client, codes):
    issued, _ = codes
    response = await async_client.post("/api/v1/auth/resend-verification", json={"email": "nobody@example.com"})
    assert response.status_code == 200
    assert issued == []


@pytest.mark.asyncio
async def test_codes_are_stored_hashed(async_client, mock_mongo_client, codes):
    await sign_up(async_client)
    record = await EmailVerification.find_one(EmailVerification.email == EMAIL)
    assert record.code_hash and "000001" not in record.code_hash


@pytest.mark.asyncio
async def test_sign_up_does_not_wait_for_the_mail_server(async_client, mock_mongo_client, monkeypatch):
    import asyncio

    async def slow_mail(*args, **kwargs):
        await asyncio.sleep(30)  # a blocked SMTP server

    monkeypatch.setattr("app.api.v1.auth.email_service.send_verification_code", slow_mail)
    started = asyncio.get_running_loop().time()
    assert (await sign_up(async_client)).status_code == 201
    assert asyncio.get_running_loop().time() - started < 5
