"""
Incidents: a PC that stopped without shutting down normally (design D).

One incident covers one outage. It starts either
  * on the server, when a PC goes silent without saying goodbye
    (app/services/offline_watch.py), or
  * from the agent, when Windows says the last shutdown was a crash or a
    power loss (POST /agent/incident) and the outage was too short to notice.

The cause is filled in as it becomes known: Windows' own record (power lost,
blue screen, power button held) beats Lectio's guess (lost internet, switched
off). Kept 30 days.
"""

from datetime import datetime, timezone
from typing import Optional

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel

KEEP_DAYS = 30

# What we know about why the PC stopped, most certain first.
CAUSES = {
    "bluescreen": "Windows crashed (blue screen)",
    "forced_off": "Someone held the power button",
    "power_lost": "Power was cut or the PC froze",
    "connection": "It lost its internet connection but kept running",
    "off": "It was switched off or lost power",
}
FROM_WINDOWS = {"bluescreen", "forced_off", "power_lost"}


class Incident(Document):
    user_id: PydanticObjectId
    device_id: PydanticObjectId
    went_silent_at: datetime = Field(..., description="The PC's last sign of life before the outage")
    back_at: Optional[datetime] = Field(None, description="When the PC reported again")
    cause: Optional[str] = Field(None, max_length=16, description="A key of CAUSES, once known")
    bugcheck_code: Optional[str] = Field(None, max_length=18, description="The blue-screen stop code, e.g. 0x0000009f")
    alert_id: Optional[PydanticObjectId] = Field(None, description="The 'went offline' alert, if one was raised")
    last_reading: Optional[str] = Field(None, max_length=120, description="What the PC was doing just before")
    offline_email_sent: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "incidents"
        indexes = [
            IndexModel([("device_id", ASCENDING), ("went_silent_at", DESCENDING)], name="device_silent"),
            IndexModel([("user_id", ASCENDING), ("went_silent_at", DESCENDING)], name="user_silent"),
            IndexModel([("created_at", ASCENDING)], name="created_ttl", expireAfterSeconds=KEEP_DAYS * 24 * 60 * 60),
        ]
