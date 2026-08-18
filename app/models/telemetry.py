from typing import Annotated, Literal
from pydantic import BaseModel,Field,PositiveFloat


#Base schema with shared telemetry fiels

class BaseTelemetryPayload(BaseModel):
    sensor_id: str = Field(...,min_length=3,max_length=64,examples=["sensor_room_101"])



# 1. Temperature sensor schema

class TemperatureTelemetryPayload(BaseTelemetryPayload):
    metric_type: Literal["temperature"]# the discriminator tag
    value: float = Field(..., ge=-50.0, le=150.0, description="Temperature in Celcius")
    unit: Literal["C","F","K"] = "C"

class CPUTelemetryPayload(BaseTelemetryPayload):
    metric_type: Literal["cpu"]
    value: float = Field(..., ge=0.0, le=100.0, description="CPU usage percentage")
    core_count: int = Field(..., gt=0)
    process_count: int =Field(..., ge=0)


class NetworkTelemetryPayload(BaseTelemetryPayload):
    metric_type: Literal["network"]
    value: PositiveFloat = Field(..., description="Throughput in MB/s")
    bytes_sent: int = Field(..., ge=0)
    bytes_recv: int = Field(..., ge=0)


# Discriminated Union

TelemetryPayload = Annotated[
    TemperatureTelemetryPayload | CPUTelemetryPayload | NetworkTelemetryPayload,
    Field(discriminator="metric_type")
]