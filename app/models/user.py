from beanie import Document,Indexed
from pydantic import Field,BaseModel,EmailStr, field_validator
from datetime import datetime,timezone
from typing import Literal, Optional
from enum import Enum


class UserRole(str, Enum):
    USER = "user"
    ADMIN = "admin"


class AuthProvider(str, Enum):
    PASSWORD = "password"
    GOOGLE = "google"


class User(Document):
    email: Indexed(EmailStr, unique=True)
    normalized_email: Indexed(str, unique=True, sparse=True)
    full_name: Optional[str] = None
    hashed_password: Optional[str] = None  # Optional for OAuth users
    email_verified: bool = False
    role: UserRole = UserRole.USER
    is_active: bool = True
    auth_providers: list[AuthProvider] = []
    google_id: Optional[str] = None
    created_at: datetime = Field(
        default_factory =lambda: datetime.now(timezone.utc)
    )
    updated_at: datetime = Field(
        default_factory =lambda: datetime.now(timezone.utc)
    )
    last_login_at: Optional[datetime] = None
    
    class settings:
        name = "users"
        indexes = [
            [
                ("normalized_email", 1),
                {"unique": True, "sparse": True}
            ],
            [
                ("google_id", 1),
                {"sparse": True}
            ],
        ]
    
    @field_validator('normalized_email', mode='before')
    @classmethod
    def normalize_email(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return v.lower().strip()


class UserCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    confirm_password: str
    
    @field_validator('password')
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        return v
    
    @field_validator('confirm_password')
    @classmethod
    def passwords_match(cls, v: str, info) -> str:
        if 'password' in info.data and v != info.data['password']:
            raise ValueError('Passwords do not match')
        return v


class UserResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: Optional[str] = None
    email_verified: bool
    role: UserRole
    is_active: bool
    created_at: datetime
    last_login_at: Optional[datetime] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = 'bearer'


class TokenData(BaseModel):
    user_id: str | None = None
    token_type: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str
    
    @field_validator('new_password')
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        return v
    
    @field_validator('confirm_password')
    @classmethod
    def passwords_match(cls, v: str, info) -> str:
        if 'new_password' in info.data and v != info.data['new_password']:
            raise ValueError('Passwords do not match')
        return v                

