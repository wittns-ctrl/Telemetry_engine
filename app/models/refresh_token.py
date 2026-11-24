from beanie import Document, Indexed
from pydantic import Field
from datetime import datetime, timezone, timedelta
from typing import Optional
from beanie import before_event, Replace


class RefreshToken(Document):
    user_id: Indexed(str)
    token_hash: Indexed(str, unique=True)
    is_revoked: bool = False
    expires_at: datetime
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    revoked_at: Optional[datetime] = None
    family_id: Optional[str] = None  # For token rotation tracking
    # Set when this token was swapped for a newer one by /refresh (as opposed to
    # revoked by logout or a password change). Starts the reuse grace window.
    replaced_at: Optional[datetime] = None
    
    class settings:
        name = "refresh_tokens"
        indexes = [
            "user_id",
            "token_hash",
            "expires_at",
            "family_id",
        ]
    
    @before_event(Replace)
    def update_timestamp(self):
        self.updated_at = datetime.now(timezone.utc)
    
    def is_expired(self) -> bool:
        expires_at = self.expires_at
        if expires_at.tzinfo is None:  # stored dates read back without a zone are UTC
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) > expires_at
    
    def is_valid(self) -> bool:
        return not self.is_revoked and not self.is_expired()
