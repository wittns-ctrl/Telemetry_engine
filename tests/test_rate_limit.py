"""Tests for request rate limiting (app/core/rate_limit.py)."""

import jwt
import pytest

from app.core.config import settings
from app.core.rate_limit import RateLimiter, classify
from app.core.security import create_access_token


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def _scope(path, method="GET", headers=None, client=("1.2.3.4", 5000)):
    return {
        "type": "http",
        "path": path,
        "method": method,
        "client": client,
        "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
    }


@pytest.fixture
def limits(monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(settings, "RATE_LIMIT_PER_MINUTE", 5)
    monkeypatch.setattr(settings, "RATE_LIMIT_AUTH_PER_MINUTE", 3)
    monkeypatch.setattr(settings, "RATE_LIMIT_INGEST_PER_MINUTE", 4)


# ---------------------------------------------------------------------------
# Token bucket
# ---------------------------------------------------------------------------

class TestRateLimiter:
    def test_allows_up_to_limit_then_blocks(self):
        clock = FakeClock()
        rl = RateLimiter(clock=clock)
        results = [rl.hit("k", 3) for _ in range(4)]
        assert [r.allowed for r in results] == [True, True, True, False]
        assert [r.remaining for r in results[:3]] == [2, 1, 0]
        assert results[3].retry_after == 20  # 3/min refills one every 20s

    def test_refills_over_time(self):
        clock = FakeClock()
        rl = RateLimiter(clock=clock)
        for _ in range(3):
            rl.hit("k", 3)
        assert not rl.hit("k", 3).allowed
        clock.now += 20
        assert rl.hit("k", 3).allowed
        assert not rl.hit("k", 3).allowed

    def test_never_holds_more_than_one_minute_of_requests(self):
        clock = FakeClock()
        rl = RateLimiter(clock=clock)
        rl.hit("k", 3)
        clock.now += 3600
        assert [rl.hit("k", 3).allowed for _ in range(4)] == [True, True, True, False]

    def test_keys_are_independent(self):
        rl = RateLimiter(clock=FakeClock())
        rl.hit("a", 1)
        assert not rl.hit("a", 1).allowed
        assert rl.hit("b", 1).allowed

    def test_idle_buckets_are_swept(self):
        clock = FakeClock()
        rl = RateLimiter(clock=clock)
        rl.hit("old", 5)
        clock.now += 120
        rl.hit("new", 5)
        assert set(rl._buckets) == {"new"}


# ---------------------------------------------------------------------------
# Which bucket a request uses
# ---------------------------------------------------------------------------

class TestClassify:
    def test_health_options_and_non_api_paths_are_exempt(self, limits):
        assert classify(_scope("/api/v1/health")) is None
        assert classify(_scope("/api/v1/devices", method="OPTIONS")) is None
        assert classify(_scope("/docs")) is None

    def test_auth_endpoints_are_limited_per_ip(self, limits):
        assert classify(_scope("/api/v1/auth/login", "POST")) == ("auth:1.2.3.4", 3)

    def test_batch_uploads_are_limited_per_device_key_not_per_ip(self, limits):
        # The agent uploads to /ingest/batch; PCs sharing one office IP must not share a budget.
        a = classify(_scope("/api/v1/telemetry/ingest/batch", "POST", {"X-Device-Key": "key-a" * 5}))
        b = classify(_scope("/api/v1/telemetry/ingest/batch", "POST", {"X-Device-Key": "key-b" * 5}))
        single = classify(_scope("/api/v1/telemetry/ingest", "POST", {"X-Device-Key": "key-a" * 5}))
        assert a[0].startswith("ingest:") and a[1] == 4
        assert a[0] != b[0]
        assert a[0] == single[0]  # one upload budget per PC, whichever endpoint
        assert not classify(_scope("/api/v1/telemetry/ingestion-report", "GET"))[0].startswith("ingest:")

    def test_ingest_is_limited_per_device_key(self, limits):
        a = classify(_scope("/api/v1/telemetry/ingest", "POST", {"X-Device-Key": "key-a" * 5}))
        b = classify(_scope("/api/v1/telemetry/ingest", "POST", {"X-Device-Key": "key-b" * 5}))
        assert a[0].startswith("ingest:") and a[1] == 4
        assert a[0] != b[0]
        assert "key-a" not in a[0]  # the raw key is not kept in memory

    def test_agent_fix_check_ins_are_limited_per_device_key(self, limits):
        a = classify(_scope("/api/v1/agent/fixes/next", "GET", {"X-Device-Key": "key-a" * 5}))
        ingest = classify(_scope("/api/v1/telemetry/ingest", "POST", {"X-Device-Key": "key-a" * 5}))
        assert a[0].startswith("agent:") and a[1] == 4
        assert a[0] != ingest[0]  # check-ins don't use up the upload budget

    def test_signed_in_requests_are_limited_per_user(self, limits):
        token = create_access_token(data={"sub": "user123", "type": "access"})
        key, limit = classify(_scope("/api/v1/devices", headers={"Authorization": f"Bearer {token}"}))
        assert (key, limit) == ("user:user123", 5)

    def test_invalid_or_refresh_tokens_fall_back_to_ip(self, limits):
        refresh = jwt.encode({"sub": "user123", "type": "refresh"}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        for auth in ("Bearer not-a-jwt", f"Bearer {refresh}"):
            assert classify(_scope("/api/v1/devices", headers={"Authorization": auth}))[0] == "ip:1.2.3.4"


# ---------------------------------------------------------------------------
# Through the real app
# ---------------------------------------------------------------------------

class TestMiddleware:
    async def test_login_returns_429_after_limit(self, limits, mock_mongo_client, async_client):
        body = {"username": "nobody@example.com", "password": "wrong-password"}
        statuses = [
            (await async_client.post("/api/v1/auth/login", data=body)).status_code
            for _ in range(3)
        ]
        assert 429 not in statuses
        response = await async_client.post("/api/v1/auth/login", data=body)
        assert response.status_code == 429
        assert int(response.headers["retry-after"]) > 0
        assert response.headers["x-ratelimit-remaining"] == "0"
        assert "Too many requests" in response.json()["detail"]

    async def test_users_have_separate_budgets(self, limits, async_client, auth_headers, other_auth_headers):
        for _ in range(5):
            r = await async_client.get("/api/v1/auth/me", headers=auth_headers)
            assert r.status_code == 200
        assert (await async_client.get("/api/v1/auth/me", headers=auth_headers)).status_code == 429
        assert (await async_client.get("/api/v1/auth/me", headers=other_auth_headers)).status_code == 200

    async def test_successful_responses_carry_limit_headers(self, limits, async_client, auth_headers):
        r = await async_client.get("/api/v1/auth/me", headers=auth_headers)
        assert r.headers["x-ratelimit-limit"] == "5"
        assert r.headers["x-ratelimit-remaining"] == "4"

    async def test_429_keeps_cors_headers(self, limits, async_client):
        origin = {"Origin": settings.FRONTEND_URL}
        for _ in range(5):
            await async_client.get("/api/v1/devices/countries", headers=origin)
        r = await async_client.get("/api/v1/devices/countries", headers=origin)
        assert r.status_code == 429
        assert r.headers["access-control-allow-origin"] == settings.FRONTEND_URL

    async def test_health_is_never_limited(self, limits, async_client):
        for _ in range(10):
            assert (await async_client.get("/api/v1/health")).status_code == 200

    async def test_disabled_setting_turns_limiting_off(self, limits, monkeypatch, async_client):
        monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", False)
        for _ in range(10):
            r = await async_client.get("/api/v1/devices/countries")
            assert r.status_code == 200
            assert "x-ratelimit-limit" not in r.headers


def test_code_and_google_sign_in_use_the_auth_budget():
    from app.core.rate_limit import AUTH_PATHS
    for path in ("/api/v1/auth/verify-email-code", "/api/v1/auth/google/login", "/api/v1/auth/google/callback"):
        assert path in AUTH_PATHS


# ---------------------------------------------------------------------------
# The visitor's address behind Cloudflare (Render) and Vercel
# ---------------------------------------------------------------------------

class TestAddressBehindProxies:
    """Render hands the app a different internal address on every request, so
    limits must key on the headers Cloudflare and Vercel set."""

    LOGIN = "/api/v1/auth/login"

    def test_without_trusted_proxies_the_connection_is_used(self, limits, monkeypatch):
        monkeypatch.setattr(settings, "TRUST_PROXY_CLIENT_HEADERS", False)
        scope = _scope(self.LOGIN, "POST", {"CF-Connecting-IP": "9.9.9.9", "X-Vercel-Forwarded-For": "5.5.5.5"})
        assert classify(scope) == ("auth:1.2.3.4", 3)  # headers ignored: anyone could send them

    def test_direct_to_render_uses_cloudflares_address(self, limits, monkeypatch):
        monkeypatch.setattr(settings, "TRUST_PROXY_CLIENT_HEADERS", True)
        scope = _scope(self.LOGIN, "POST", {"CF-Connecting-IP": "197.0.0.7"}, client=("10.0.0.1", 1))
        assert classify(scope) == ("auth:197.0.0.7", 3)

    def test_through_the_website_uses_vercels_visitor_address(self, limits, monkeypatch):
        monkeypatch.setattr(settings, "TRUST_PROXY_CLIENT_HEADERS", True)
        scope = _scope(self.LOGIN, "POST", {"CF-Connecting-IP": "13.245.28.86",
                                            "X-Vercel-Forwarded-For": "197.0.0.7"}, client=("10.0.0.2", 1))
        assert classify(scope) == ("auth:197.0.0.7", 3)

    async def test_render_internal_addresses_no_longer_dodge_the_limit(self, limits, monkeypatch, mock_mongo_client):
        from httpx import ASGITransport, AsyncClient
        from app.main import app
        monkeypatch.setattr(settings, "TRUST_PROXY_CLIENT_HEADERS", True)
        body = {"username": "nobody@example.com", "password": "wrong-password"}
        statuses = []
        for i in range(4):
            # A different Render machine each time, the same visitor.
            transport = ASGITransport(app=app, client=(f"10.198.0.{i}", 1))
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                r = await client.post(self.LOGIN, data=body, headers={"CF-Connecting-IP": "197.0.0.7"})
                statuses.append(r.status_code)
        assert statuses[-1] == 429

    async def test_faking_the_vercel_header_still_hits_the_connection_limit(
            self, limits, monkeypatch, mock_mongo_client):
        from httpx import ASGITransport, AsyncClient
        from app.main import app
        monkeypatch.setattr(settings, "TRUST_PROXY_CLIENT_HEADERS", True)
        monkeypatch.setattr(settings, "RATE_LIMIT_CONNECTION_MULTIPLIER", 2)  # 3 x 2 = 6 a minute
        body = {"username": "nobody@example.com", "password": "wrong-password"}
        statuses = []
        transport = ASGITransport(app=app, client=("10.198.0.9", 1))
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            for i in range(7):
                r = await client.post(self.LOGIN, data=body, headers={
                    "CF-Connecting-IP": "197.0.0.66", "X-Vercel-Forwarded-For": f"5.5.5.{i}"})
                statuses.append(r.status_code)
        assert 429 not in statuses[:6]
        assert statuses[6] == 429
