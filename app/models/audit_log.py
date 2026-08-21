from beanie import Document, Indexed
from pydantic import Field
from datetime import datetime, timezone
from typing import Optional
from enum import Enum


class AuditEventType(str, Enum):
    REGISTRATION = "registration"
    LOGIN_SUCCESS = "login_success"
    LOGIN_FAILURE = "login_failure"
    LOGOUT = "logout"
    PASSWORD_CHANGE = "password_change"
    PASSWORD_RESET = "password_reset"
    EMAIL_VERIFICATION = "email_verification"
    OAUTH_LOGIN = "oauth_login"
    ACCOUNT_DEACTIVATION = "account_deactivation"
    TOKEN_REUSE = "token_reuse"
    SUSPICIOUS_ACTIVITY = "suspicious_activity"


class AuditLog(Document):
    user_id: Indexed(str)
    event_type: AuditEventType
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    success: bool = True
    details: Optional[dict] = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    
    class settings:
        name = "audit_logs"
        indexes = [
            "user_id",
            "event_type",
            "created_at",
        ]
