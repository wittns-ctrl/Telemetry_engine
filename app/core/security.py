from datetime import datetime, timedelta , timezone
import jwt
from pwdlib import PasswordHash
from app.core.config import settings

# Modern password hasher using Argon2id]

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
        expire = datetime.now(timezone.utc) + timedelta(minutes = settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm = settings.ALGORITHM)
    return encoded_jwt  

def password_reset_token(email: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode = {
        "scope":"password_reset",
        "sub":{email},
        "expires":{expires}
    } 
    return jwt.encode(to_encode,settings.SECRET_KEY,algorithm=settings.ALGORITHM)

def verify_reset_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY,algorithm=settings.ALGORITHM)

        if payload.get("scope") != "password_reset":
            return None

        return payload.get("sub")
    except jwt.InvalidTokenError:
        return None


    
