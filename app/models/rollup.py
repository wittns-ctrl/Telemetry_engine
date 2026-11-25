"""
Hourly and daily summaries of each device's readings.

Raw readings are kept for TELEMETRY_RETENTION_DAYS (7 by default): every
reading is stored, about 17,000 a day per PC. For anything longer, graphs read
these summaries instead: one document per device per hour (kept
ROLLUP_HOURLY_RETENTION_DAYS) and per day (ROLLUP_DAILY_RETENTION_DAYS), each
holding the sum, count, lowest and highest of every numeric reading. A 30-day
graph then reads 720 small documents instead of half a million readings.

Summaries are updated as readings arrive (app/services/rollups.py) and
removed by MongoDB once expires_at passes (TTL index).
"""

from datetime import datetime
from typing import Dict, Literal

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import ASCENDING, IndexModel

ROLLUP_KEY_INDEX = "device_granularity_start"


class TelemetryRollupDocument(Document):
    user_id: PydanticObjectId
    device_id: PydanticObjectId
    granularity: Literal["hour", "day"]
    start: datetime = Field(..., description="Start of the hour or day (UTC)")
    readings: int = Field(0, description="Readings in this hour or day")
    # Per reading key (app/services/rollups.py ROLLUP_FIELDS): the sum and how
    # many readings reported it (for the average), and the lowest and highest.
    # (Not named count/min/max: those are Beanie Document methods.)
    sums: Dict[str, float] = Field(default_factory=dict)
    n: Dict[str, int] = Field(default_factory=dict)
    lo: Dict[str, float] = Field(default_factory=dict)
    hi: Dict[str, float] = Field(default_factory=dict)
    expires_at: datetime = Field(..., description="When MongoDB deletes this summary")

    class Settings:
        name = "telemetry_rollups"
        indexes = [
            # One summary per device, granularity and hour/day; also the update key.
            IndexModel(
                [("device_id", ASCENDING), ("granularity", ASCENDING), ("start", ASCENDING)],
                name=ROLLUP_KEY_INDEX,
                unique=True,
            ),
            # Graph reads: one user's device, one granularity, a time range.
            IndexModel(
                [("user_id", ASCENDING), ("device_id", ASCENDING), ("granularity", ASCENDING), ("start", ASCENDING)],
                name="user_device_granularity_start",
            ),
            IndexModel([("expires_at", ASCENDING)], name="expires_at_ttl", expireAfterSeconds=0),
        ]
