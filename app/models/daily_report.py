"""A PC's end-of-day health check (approved design A): kept 30 days."""

from datetime import datetime, timezone
from typing import Optional

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel

REPORT_DAYS = 30


class Finding(BaseModel):
    area: str = Field(..., max_length=16)  # heat, load, memory, storage, security, stability, alerts
    text: str = Field(..., max_length=240)
    tone: str = Field("ok", max_length=8)  # ok, warn, bad


class DailyReport(Document):
    user_id: PydanticObjectId
    device_id: PydanticObjectId
    day: str = Field(..., description="The PC's local date, YYYY-MM-DD")
    score: Optional[int] = Field(None, ge=0, le=100)
    verdict: str = Field("", max_length=40)  # "good overall", "needs attention"...
    summary: str = Field("", max_length=600)
    findings: list[Finding] = Field(default_factory=list, max_length=12)
    todo: list[str] = Field(default_factory=list, max_length=6)
    source: str = Field("rules", max_length=8)  # ai or rules
    readings: int = 0
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "daily_reports"
        indexes = [
            IndexModel([("device_id", ASCENDING), ("day", ASCENDING)], name="device_day", unique=True),
            IndexModel([("user_id", ASCENDING), ("device_id", ASCENDING), ("day", DESCENDING)], name="user_device_day"),
            IndexModel([("generated_at", ASCENDING)], name="generated_ttl", expireAfterSeconds=REPORT_DAYS * 24 * 3600),
        ]
