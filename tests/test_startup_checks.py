"""The startup check: refuse to run in production with unsafe settings."""

from types import SimpleNamespace

import pytest

from app.core.startup_checks import UnsafeConfiguration, enforce, review

GOOD_SECRET = "Zq8-vN3_kT1pW6yR0bX4cL7mF2hJ9sD5gA_eU8iO3uY"


def prod(**overrides):
    values = dict(
        APP_ENV="production",
        FRONTEND_URL="https://app.lectio.example",
        SECRET_KEY=GOOD_SECRET,
        GOOGLE_CLIENT_ID=None, GOOGLE_CLIENT_SECRET=None, GOOGLE_REDIRECT_URI=None,
        RATE_LIMIT_ENABLED=True, EMAIL_FROM="Lectio <alerts@lectio.example>",
        GEMINI_API_KEY="key", REDIS_URL="redis://redis:6379/0",
    )
    values.update(overrides)
    return SimpleNamespace(**values)


def test_safe_production_settings_start():
    assert review(prod(), email_configured=True) == ([], [])
    enforce(prod(), email_configured=True)  # no exception


def test_development_is_never_blocked():
    dev = prod(APP_ENV="development", FRONTEND_URL="http://localhost:5173", SECRET_KEY="x", RATE_LIMIT_ENABLED=False)
    assert review(dev, email_configured=False) == ([], [])


@pytest.mark.parametrize("env", ["prod", "Production ", "staging", ""])
def test_unknown_app_env_is_refused_everywhere(env):
    errors, _ = review(prod(APP_ENV=env), email_configured=True)
    if env.strip().lower() == "production":
        assert errors == []  # case and spaces don't matter
    else:
        assert errors and "APP_ENV" in errors[0]


@pytest.mark.parametrize("url", [
    "http://localhost:5173", "https://localhost", "http://app.lectio.example", "https://127.0.0.1:5173",
    "https://app.localhost", "", None,
])
def test_frontend_url_must_be_public_https(url):
    errors, _ = review(prod(FRONTEND_URL=url), email_configured=True)
    assert any("FRONTEND_URL" in e for e in errors)


@pytest.mark.parametrize("secret", ["", "changeme", "short", "a" * 64, "your-secret-key"])
def test_weak_secret_key_is_refused(secret):
    errors, _ = review(prod(SECRET_KEY=secret), email_configured=True)
    assert any("SECRET_KEY" in e for e in errors)


def test_google_sign_in_must_be_complete_and_public():
    half, _ = review(prod(GOOGLE_CLIENT_ID="id", GOOGLE_REDIRECT_URI="https://api.lectio.example/cb"), email_configured=True)
    assert any("half set up" in e for e in half)
    local, _ = review(prod(GOOGLE_CLIENT_ID="id", GOOGLE_CLIENT_SECRET="s", GOOGLE_REDIRECT_URI="http://localhost:8000/cb"),
                      email_configured=True)
    assert any("GOOGLE_REDIRECT_URI" in e for e in local)
    ok, _ = review(prod(GOOGLE_CLIENT_ID="id", GOOGLE_CLIENT_SECRET="s", GOOGLE_REDIRECT_URI="https://api.lectio.example/cb"),
                   email_configured=True)
    assert ok == []
    # Empty is allowed (the API uses the incoming address) but worth a warning.
    empty_errors, empty_warnings = review(prod(GOOGLE_CLIENT_ID="id", GOOGLE_CLIENT_SECRET="s", GOOGLE_REDIRECT_URI=""),
                                          email_configured=True)
    assert empty_errors == [] and any("GOOGLE_REDIRECT_URI" in w for w in empty_warnings)


def test_email_and_rate_limits_are_required():
    errors, _ = review(prod(RATE_LIMIT_ENABLED=False), email_configured=False)
    assert any("Email" in e for e in errors) and any("RATE_LIMIT" in e for e in errors)


def test_missing_ai_key_and_redis_only_warn():
    errors, warnings = review(prod(GEMINI_API_KEY=None, REDIS_URL=None), email_configured=True)
    assert errors == []
    assert any("GEMINI" in w for w in warnings) and any("REDIS_URL" in w for w in warnings)


def test_every_problem_is_listed_at_once():
    bad = prod(FRONTEND_URL="http://localhost:5173", SECRET_KEY="x", RATE_LIMIT_ENABLED=False)
    with pytest.raises(UnsafeConfiguration) as caught:
        enforce(bad, email_configured=False)
    message = str(caught.value)
    for name in ("FRONTEND_URL", "SECRET_KEY", "Email", "RATE_LIMIT"):
        assert name in message


async def test_the_api_refuses_to_start_in_unsafe_production(monkeypatch):
    from app.core.config import settings
    from app.main import app, lifespan

    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "FRONTEND_URL", "http://localhost:5173")
    with pytest.raises(UnsafeConfiguration):
        async with lifespan(app):
            pass



def test_a_gmail_sender_is_allowed():
    # SendLiberty sends from a connected Gmail account, so gmail.com is fine.
    errors, _ = review(prod(EMAIL_FROM="Lectio <lectio.alerts@gmail.com>"), email_configured=True)
    assert errors == []
