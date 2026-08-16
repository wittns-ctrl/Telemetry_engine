from datetime import timezone,datetime
from typing import Any
from beanie import Document
from pydantic import Field


class Metrics(Document):
    sensor_id: str
    metric_type: str
    value: float

    # Store sensor-specific payload fields flexibly in MongoDB
    payload_data: dict[str,Any] = Field(default_factory=dict)
    timestamp: datetime = Field(
        default_factory = lambda: datetime.now(timezone.utc)
    )

    class settings:
        name = "metrics"