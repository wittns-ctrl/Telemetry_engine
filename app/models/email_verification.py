from beanie import Document, Indexed
from pydantic import Field
from datetime import datetime, timezone, timedelta
from typing import Optional


class EmailVerification(Document):
    user_id: Indexed(str)
    token_hash: Indexed(str, unique=True)
    email: Indexed(str)
    is_used: bool = False
    expires_at: datetime
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    used_at: Optional[datetime] = None
    
    class settings:
        name = "email_verifications"
        indexes = [
            "user_id",
            "token_hash",
            "email",
            "expires_at",
        ]
    
    def is_expired(self) -> bool:
        return datetime.now(timezone.utc) > self.expires_at
    
    def is_valid(self) -> bool:
        return not self.is_used and not self.is_expired()
