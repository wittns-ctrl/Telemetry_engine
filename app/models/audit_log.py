from pymongo import ASCENDING, DESCENDING, IndexModel
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
    # Remote fixes (app/api/v1/fixes.py): who asked a PC to do what, and what happened.
    FIX_REQUESTED = "fix_requested"
    FIX_UNDO_REQUESTED = "fix_undo_requested"
    FIX_CANCELLED = "fix_cancelled"
    FIX_RESULT = "fix_result"
    FIX_REVERTED = "fix_reverted"
    # The activity log (app/services/activity.py).
    ALERT_OPENED = "alert_opened"
    ALERT_CLOSED = "alert_closed"
    DEVICE_LINKED = "device_linked"
    DEVICE_REMOVED = "device_removed"
    AGENT_UPDATED = "agent_updated"
    DAILY_REPORT = "daily_report"
    PC_INCIDENT = "pc_incident"


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
    
    # Beanie only reads `Settings` (capital S). These models had a lowercase
    # `settings`, so their indexes were never built and the collections took
    # the class name; `name` keeps them on those existing collections.
    class Settings:
        name = "AuditLog"
        indexes = [
            IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)], name="user_created"),
            # The activity log keeps 7 days: MongoDB deletes older entries itself.
            IndexModel([("created_at", ASCENDING)], name="created_ttl", expireAfterSeconds=7 * 24 * 60 * 60),
        ]
