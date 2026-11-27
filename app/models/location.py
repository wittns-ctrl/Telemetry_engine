"""Where each PC has been: kept 30 days, then MongoDB deletes it (TTL index)."""

from datetime import datetime, timezone
from typing import Optional

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel

LOCATION_HISTORY_DAYS = 30


class LocationHistory(Document):
    device_id: PydanticObjectId
    user_id: PydanticObjectId
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    accuracy_m: Optional[float] = Field(None, ge=0)
    source: str = Field("windows", max_length=16)
    measured_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "device_locations"
        indexes = [
            IndexModel([("device_id", ASCENDING), ("measured_at", DESCENDING)], name="device_time"),
            IndexModel([("measured_at", ASCENDING)], name="measured_at_ttl",
                       expireAfterSeconds=LOCATION_HISTORY_DAYS * 24 * 60 * 60),
        ]
