from datetime import timezone,datetime
from beanie import Document
from pydantic import Field


class Metrics(Document):
    sensor_id: str
    metric_type: str
    value: float
    timestamp: datetime = Field(
        default_factory = lambda: datetime.now(timezone.utc)
    )

    class settings:
        name = "metrics"