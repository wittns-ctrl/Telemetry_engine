from datetime import timezone,datetime
from typing import Any, Optional
from beanie import Document
from pydantic import Field


class Metrics(Document):
    # Owner of the metric. Rows written before auth was required have no owner
    # and are not returned to anyone.
    user_id: Optional[str] = None
    sensor_id: str
    metric_type: str
    value: float

    # Store sensor-specific payload fields flexibly in MongoDB
    payload_data: dict[str,Any] = Field(default_factory=dict)
    timestamp: datetime = Field(
        default_factory = lambda: datetime.now(timezone.utc)
    )

    class Settings:
        # Beanie ignored the old lowercase `settings` class and used the class
        # name, so keep "Metrics" to stay on the existing collection.
        name = "Metrics"
        indexes = [[("user_id", 1), ("timestamp", -1)]]
