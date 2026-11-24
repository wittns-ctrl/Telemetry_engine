from pymongo import ASCENDING, DESCENDING, IndexModel
from beanie import Document, Indexed
from pydantic import Field
from datetime import datetime, timezone, timedelta
from typing import Optional


class PasswordReset(Document):
    user_id: Indexed(str)
    token_hash: Indexed(str, unique=True)
    email: Indexed(str)
    is_used: bool = False
    expires_at: datetime
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    used_at: Optional[datetime] = None
    
    # Beanie only reads `Settings` (capital S). These models had a lowercase
    # `settings`, so their indexes were never built and the collections took
    # the class name; `name` keeps them on those existing collections.
    class Settings:
        name = "PasswordReset"
        indexes = [
            # MongoDB deletes rows a day after they expire (data retention); the
            # day lets the API still answer "expired" rather than "not found".
            IndexModel([("expires_at", ASCENDING)], name="expires_at_ttl", expireAfterSeconds=86400),
        ]
    
    def is_expired(self) -> bool:
        expires_at = self.expires_at
        if expires_at.tzinfo is None:  # stored dates read back without a zone are UTC
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) > expires_at
    
    def is_valid(self) -> bool:
        return not self.is_used and not self.is_expired()
