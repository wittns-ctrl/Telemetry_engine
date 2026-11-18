"""
Request rate limiting.

Every HTTP request under /api/ is counted against one of three budgets:

- auth:    sign-in, sign-up and account-recovery endpoints, per client IP
           (RATE_LIMIT_AUTH_PER_MINUTE). Slows down password guessing and
           email flooding.
- ingest:  the agent's telemetry upload, per device key
           (RATE_LIMIT_INGEST_PER_MINUTE). An agent sends at most one
           snapshot a second, so the default leaves room for retries.
- general: everything else, per signed-in user, or per client IP when the
           request has no valid access token (RATE_LIMIT_PER_MINUTE).

Each budget is a token bucket: it holds up to one minute's allowance and
refills steadily, so short bursts are fine but a sustained flood is not.
Over the limit the API answers 429 with a Retry-After header.

Counters live in this process's memory. With several worker processes each
keeps its own count, so the effective limit is multiplied by the number of
workers; move the buckets to a shared store such as Redis before scaling out.
Behind a reverse proxy, run uvicorn with --proxy-headers and
--forwarded-allow-ips so the client IP is the visitor's, not the proxy's.
"""

import hashlib
import json
import math
import threading
import time
from dataclasses import dataclass
from typing import Callable

import jwt

from app.core.config import settings

API_PREFIX = "/api/"

# Paths that are never limited (load balancer health checks).
EXEMPT_PATHS = frozenset({"/api/v1/health"})

# Unauthenticated endpoints that check a password, token or email address.
AUTH_PATHS = frozenset({
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/forgot-password",
    "/api/v1/auth/reset-password",
    "/api/v1/auth/verify-email",
    "/api/v1/auth/resend-verification",
})

INGEST_PATH = "/api/v1/telemetry/ingest"
AGENT_PREFIX = "/api/v1/agent/"

# Idle buckets are dropped once refilled; sweep at most this often.
SWEEP_INTERVAL_SECONDS = 60.0


@dataclass
class _Bucket:
    tokens: float
    updated: float


@dataclass(frozen=True)
class Decision:
    allowed: bool
    limit: int
    remaining: int
    retry_after: int  # whole seconds until one request is allowed again; 0 when allowed


class RateLimiter:
    """In-memory token buckets keyed by an arbitrary string."""

    def __init__(self, clock: Callable[[], float] = time.monotonic):
        self._clock = clock
        self._buckets: dict[str, _Bucket] = {}
        self._lock = threading.Lock()
        self._last_sweep = clock()

    def hit(self, key: str, per_minute: int) -> Decision:
        """Spend one request from `key`'s bucket, which allows `per_minute` a minute."""
        per_minute = max(1, per_minute)
        rate = per_minute / 60.0  # tokens per second
        now = self._clock()
        with self._lock:
            self._sweep(now)
            bucket = self._buckets.get(key)
            if bucket is None:
                bucket = _Bucket(tokens=float(per_minute), updated=now)
                self._buckets[key] = bucket
            else:
                elapsed = max(0.0, now - bucket.updated)
                bucket.tokens = min(float(per_minute), bucket.tokens + elapsed * rate)
                bucket.updated = now

            if bucket.tokens >= 1.0:
                bucket.tokens -= 1.0
                return Decision(True, per_minute, int(bucket.tokens), 0)

            retry_after = max(1, math.ceil((1.0 - bucket.tokens) / rate))
            return Decision(False, per_minute, 0, retry_after)

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()
            self._last_sweep = self._clock()

    def _sweep(self, now: float) -> None:
        # A bucket idle for a full minute has refilled completely, so forgetting
        # it changes nothing. Caller holds the lock.
        if now - self._last_sweep < SWEEP_INTERVAL_SECONDS:
            return
        self._last_sweep = now
        stale = [k for k, b in self._buckets.items() if now - b.updated >= 60.0]
        for k in stale:
            del self._buckets[k]


limiter = RateLimiter()


def _header(scope, name: bytes) -> str | None:
    for key, value in scope.get("headers") or ():
        if key == name:
            return value.decode("latin-1")
    return None


def _client_ip(scope) -> str:
    client = scope.get("client")
    return client[0] if client else "unknown"


def _user_id(scope) -> str | None:
    """The `sub` of a valid access token, without touching the database."""
    auth = _header(scope, b"authorization")
    if not auth or not auth.lower().startswith("bearer "):
        return None
    try:
        payload = jwt.decode(auth[7:].strip(), settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except jwt.InvalidTokenError:
        return None
    if payload.get("type") != "access":
        return None
    sub = payload.get("sub")
    return str(sub) if sub else None


def classify(scope) -> tuple[str, int] | None:
    """The bucket key and per-minute limit for a request, or None if it is not limited."""
    path = scope.get("path", "")
    if scope.get("method") == "OPTIONS" or not path.startswith(API_PREFIX) or path in EXEMPT_PATHS:
        return None

    if path in AUTH_PATHS:
        return f"auth:{_client_ip(scope)}", settings.RATE_LIMIT_AUTH_PER_MINUTE

    if path == INGEST_PATH or path.startswith(AGENT_PREFIX):
        # Agent traffic: telemetry uploads and fix check-ins, each budget per device key.
        kind = "ingest" if path == INGEST_PATH else "agent"
        device_key = _header(scope, b"x-device-key")
        if device_key:
            digest = hashlib.sha256(device_key.encode()).hexdigest()
            return f"{kind}:{digest}", settings.RATE_LIMIT_INGEST_PER_MINUTE
        return f"{kind}-ip:{_client_ip(scope)}", settings.RATE_LIMIT_INGEST_PER_MINUTE

    user_id = _user_id(scope)
    if user_id:
        return f"user:{user_id}", settings.RATE_LIMIT_PER_MINUTE
    return f"ip:{_client_ip(scope)}", settings.RATE_LIMIT_PER_MINUTE


class RateLimitMiddleware:
    """Pure ASGI middleware; WebSocket and lifespan traffic passes straight through."""

    def __init__(self, app, rate_limiter: RateLimiter = limiter):
        self.app = app
        self.limiter = rate_limiter

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not settings.RATE_LIMIT_ENABLED:
            await self.app(scope, receive, send)
            return

        bucket = classify(scope)
        if bucket is None:
            await self.app(scope, receive, send)
            return

        key, per_minute = bucket
        decision = self.limiter.hit(key, per_minute)
        limit_headers = [
            (b"x-ratelimit-limit", str(decision.limit).encode()),
            (b"x-ratelimit-remaining", str(decision.remaining).encode()),
        ]

        if not decision.allowed:
            seconds = decision.retry_after
            body = json.dumps({
                "detail": f"Too many requests. Try again in {seconds} second{'s' if seconds != 1 else ''}."
            }).encode()
            await send({
                "type": "http.response.start",
                "status": 429,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                    (b"retry-after", str(seconds).encode()),
                    *limit_headers,
                ],
            })
            await send({"type": "http.response.body", "body": body})
            return

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                message = {**message, "headers": [*message.get("headers", []), *limit_headers]}
            await send(message)

        await self.app(scope, receive, send_with_headers)
