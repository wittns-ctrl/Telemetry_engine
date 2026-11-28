"""A script the AI wrote for one alert ("Solve with AI"), kept so Run sends exactly what was shown."""

from datetime import datetime, timezone
from typing import Optional

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import ASCENDING, IndexModel

KEEP_DAYS = 30


class AiScript(Document):
    user_id: PydanticObjectId
    device_id: PydanticObjectId
    alert_id: PydanticObjectId
    summary: str = Field(..., max_length=200)
    steps: list[str] = Field(default_factory=list)
    script: str = Field(..., max_length=3000)
    sha256: str = Field(..., min_length=64, max_length=64)
    read_only: bool = False
    fix_request_id: Optional[PydanticObjectId] = None  # set once Run sends it to the PC
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "ai_scripts"
        indexes = [
            IndexModel([("user_id", ASCENDING), ("alert_id", ASCENDING)], name="user_alert"),
            IndexModel([("created_at", ASCENDING)], name="created_ttl", expireAfterSeconds=KEEP_DAYS * 24 * 60 * 60),
        ]
