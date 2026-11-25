"""
Startup safety check: refuse to run in production with unsafe settings.

Runs when the API starts (app.main lifespan). In production
(APP_ENV=production) any problem below stops the server with a clear list of
what to fix, so a configuration mistake shows up at once instead of the site
going live with insecure cookies, sign-in codes in the log or a localhost
address. Things that only limit features are logged as warnings.

An unknown APP_ENV is refused in every mode: a typo such as "prod" would
otherwise turn the production checks (and secure cookies) off silently.
"""

from __future__ import annotations

import logging
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

KNOWN_ENVIRONMENTS = {"development", "production", "test", "testing"}
LOCAL_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"}
MIN_SECRET_LENGTH = 32
PLACEHOLDER_SECRETS = {
    "", "secret", "changeme", "change-me", "change_me", "your-secret-key", "your_secret_key",
    "supersecret", "super-secret", "secret-key", "secretkey", "password", "test", "development",
}


class UnsafeConfiguration(RuntimeError):
    """The server refused to start; the message lists every problem."""


def _public_https(url: str | None) -> bool:
    if not url:
        return False
    parsed = urlparse(url.strip())
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and bool(host) and host not in LOCAL_HOSTS and not host.endswith(".localhost")


def review(settings, email_configured: bool) -> tuple[list[str], list[str]]:
    """(errors, warnings) for these settings. Errors only apply in production,
    except an unknown APP_ENV, which is always an error."""
    errors: list[str] = []
    warnings: list[str] = []
    env = (settings.APP_ENV or "").strip().lower()

    if env not in KNOWN_ENVIRONMENTS:
        errors.append(
            f"APP_ENV={settings.APP_ENV!r} isn't one of {', '.join(sorted(KNOWN_ENVIRONMENTS))}. "
            "Use APP_ENV=production on a live server."
        )
        return errors, warnings
    if env != "production":
        return errors, warnings

    if not _public_https(settings.FRONTEND_URL):
        errors.append(
            f"FRONTEND_URL={settings.FRONTEND_URL!r} must be the website's public https:// address "
            "(it sets which site may call the API and where emails link to)."
        )

    secret = settings.SECRET_KEY or ""
    if secret.strip().lower() in PLACEHOLDER_SECRETS or len(secret) < MIN_SECRET_LENGTH or len(set(secret)) < 10:
        errors.append(
            f"SECRET_KEY must be a random value of at least {MIN_SECRET_LENGTH} characters (it signs every sign-in). "
            "Make one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
        )

    if settings.GOOGLE_CLIENT_ID or settings.GOOGLE_CLIENT_SECRET:
        if not (settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET):
            errors.append("Google sign-in is half set up: set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither.")
        if not settings.GOOGLE_REDIRECT_URI:
            # Empty is valid: the API then uses the address the request came in on.
            warnings.append(
                "GOOGLE_REDIRECT_URI is empty, so Google sign-in returns to the address requests arrive on: make sure "
                "the proxy forwards https (X-Forwarded-Proto) and that address is registered in the Google Cloud console."
            )
        elif not _public_https(settings.GOOGLE_REDIRECT_URI):
            errors.append(
                f"GOOGLE_REDIRECT_URI={settings.GOOGLE_REDIRECT_URI!r} must be the API's public https:// callback "
                "address, also added in the Google Cloud console (or leave it empty)."
            )

    if not email_configured:
        errors.append(
            "Email isn't configured (SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM_EMAIL): "
            "new accounts couldn't receive their verification code."
        )

    if not settings.RATE_LIMIT_ENABLED:
        errors.append("RATE_LIMIT_ENABLED is off: sign-in would be open to password guessing.")

    if not settings.GEMINI_API_KEY:
        warnings.append("GEMINI_API_KEY isn't set: diagnoses and fix advice use the built-in rules, not the AI.")
    if not settings.REDIS_URL:
        warnings.append("REDIS_URL isn't set: run exactly one API process (no shared rate limits or live updates).")

    return errors, warnings


def enforce(settings=None, email_configured: bool | None = None) -> None:
    """Log warnings; raise UnsafeConfiguration listing every error, if any."""
    if settings is None:
        from app.core.config import settings as app_settings
        settings = app_settings
    if email_configured is None:
        from app.services.email import email_service
        email_configured = email_service.is_configured()

    errors, warnings = review(settings, email_configured)
    for warning in warnings:
        logger.warning("Startup check: %s", warning)
    if errors:
        message = "Refusing to start: unsafe settings for APP_ENV={}.\n{}".format(
            settings.APP_ENV, "\n".join(f"  - {e}" for e in errors)
        )
        logger.critical(message)
        raise UnsafeConfiguration(message)
