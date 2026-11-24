from datetime import datetime, timedelta, timezone
import jwt
import secrets
import hashlib
from pwdlib import PasswordHash
from app.core.config import settings

# Modern password hasher using Argon2id
password_hash = PasswordHash.recommended()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return password_hash.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return password_hash.hash(password)

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access"
    })
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

WS_TICKET_SECONDS = 30


def create_ws_ticket(user_id: str) -> str:
    """
    A single-use, 30-second credential for opening one WebSocket. Browsers can't
    set headers on WebSockets, so it goes in the URL, where it may be logged;
    keeping it short-lived and single-use means a logged copy is worthless.
    """
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": user_id,
            "type": "ws",
            "jti": secrets.token_urlsafe(16),
            "iat": now,
            "exp": now + timedelta(seconds=WS_TICKET_SECONDS),
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def create_refresh_token() -> str:
    """Generate a cryptographically secure random refresh token."""
    return secrets.token_urlsafe(32)

def hash_token(token: str) -> str:
    """Hash a token for secure storage."""
    return hashlib.sha256(token.encode()).hexdigest()

def new_email_code() -> str:
    """A 6-digit verification code, e.g. "048213"."""
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_email_code(user_id: str, code: str) -> str:
    """
    Keyed hash of a verification code. Codes are short, so a plain hash could be
    reversed by trying all million; with the server's secret key it can't.
    """
    import hmac
    return hmac.new(settings.SECRET_KEY.encode(), f"{user_id}:{code}".encode(), hashlib.sha256).hexdigest()


def verify_token_hash(token: str, token_hash: str) -> bool:
    """Verify a token against its hash."""
    return hashlib.sha256(token.encode()).hexdigest() == token_hash

def generate_family_id() -> str:
    """Generate a unique family ID for token rotation tracking."""
    return secrets.token_urlsafe(16)

def password_reset_token(email: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode = {
        "scope": "password_reset",
        "sub": email,
        "exp": expires,
        # Unique per link: two requests in the same second would otherwise
        # produce the same token and clash on the stored hash.
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def verify_reset_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("scope") != "password_reset":
            return None
        return payload.get("sub")
    except jwt.InvalidTokenError:
        return None

def email_verification_token(user_id: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(hours=24)
    to_encode = {
        "scope": "email_verification",
        "sub": user_id,
        "exp": expires
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def verify_email_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("scope") != "email_verification":
            return None
        return payload.get("sub")
    except jwt.InvalidTokenError:
        return None


    
