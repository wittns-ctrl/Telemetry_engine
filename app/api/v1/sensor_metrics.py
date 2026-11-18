"""
Hand-submitted sensor metrics (the frontend's Metrics Studio and Live Monitor).

A user posts a single reading (temperature, cpu or network) for a named
sensor. It is stored per user, checked against the fixed limits in
app.services.alerting.THRESHOLDS, and pushed to that user's /ws/alerts sockets.

This is separate from device telemetry: real hardware snapshots arrive from
the agent at /api/v1/telemetry/ingest and go through the anomaly engine,
which has its own alerts, emails and AI diagnosis. Hand-submitted readings
are never emailed, since one can breach on every submission; the optional
ALERT_WEBHOOK_URL still receives each breach.
"""

from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, WebSocket, WebSocketDisconnect, status

from app.api.deps import get_current_user, get_current_user_ws
from app.core.config import settings
from app.core.sockets import manager
from app.models.metric import Metrics
from app.models.telemetry import TelemetryPayload
from app.models.user import User
from app.services.alerting import THRESHOLDS, evaluate_metric_alert
from app.services.notifications import send_webhook_alert

router = APIRouter(tags=["Sensor Metrics"])

STATS_TYPES = ("temperature", "cpu", "network")


def _iso(value) -> str:
    return value.isoformat() if isinstance(value, datetime) else str(value)


@router.get("/api/v1/thresholds", summary="Get Alert Thresholds")
async def get_thresholds():
    return THRESHOLDS


@router.websocket("/ws/alerts")
async def websocket_alerts_endpoint(
    websocket: WebSocket,
    current_user: User = Depends(get_current_user_ws),
):
    """Live metric/alert events for the signed-in user. Requires ?token=<access JWT>."""
    user_id = str(current_user.id)
    await manager.connect(websocket, user_id)
    try:
        # Keep the socket open; the client has nothing to send.
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        manager.disconnect(websocket, user_id)


@router.post(
    "/api/v1/metrics",
    status_code=status.HTTP_201_CREATED,
    summary="Ingest Polymorphic Telemetry Data",
)
async def ingest_metric(
    payload: TelemetryPayload,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    payload_dict = payload.model_dump()
    sensor_id = payload_dict.pop("sensor_id")
    metric_type = payload_dict.pop("metric_type")
    value = payload_dict.pop("value")

    user_id = str(current_user.id)
    metric = Metrics(
        user_id=user_id,
        sensor_id=sensor_id,
        metric_type=metric_type,
        value=value,
        payload_data=payload_dict,
    )
    await metric.insert()

    alert_event = evaluate_metric_alert(payload)

    await manager.send_to_user(user_id, {
        "event": "METRIC_RECORDED",
        "metric_id": str(metric.id),
        "sensor_id": sensor_id,
        "metric_type": metric_type,
        "value": value,
        "payload_data": payload_dict,
        "timestamp": _iso(metric.timestamp),
        "alert_triggered": alert_event is not None,
    })

    if alert_event:
        await manager.send_to_user(user_id, alert_event)
        if settings.ALERT_WEBHOOK_URL:
            background_tasks.add_task(
                send_webhook_alert,
                webhook_url=settings.ALERT_WEBHOOK_URL,
                alert_payload=alert_event,
            )

    return {
        "status": "success",
        "metric_id": str(metric.id),
        "alert_triggered": alert_event is not None,
        "alert_details": alert_event,
    }


@router.get("/api/v1/metrics", summary="Fetch Recent Telemetry Metrics")
async def get_metrics(
    limit: int = 50,
    metric_type: str | None = None,
    sensor_id: str | None = None,
    current_user: User = Depends(get_current_user),
):
    query = {"user_id": str(current_user.id)}
    if metric_type:
        query["metric_type"] = metric_type
    if sensor_id:
        query["sensor_id"] = sensor_id

    clamped_limit = max(1, min(limit, 200))
    metrics = await Metrics.find(query).sort("-timestamp").limit(clamped_limit).to_list()

    return [
        {
            "id": str(m.id),
            "sensor_id": m.sensor_id,
            "metric_type": m.metric_type,
            "value": m.value,
            "payload_data": m.payload_data,
            "timestamp": _iso(m.timestamp),
        }
        for m in metrics
    ]


@router.get("/api/v1/metrics/stats", summary="Lectio Statistics")
async def get_metrics_stats(current_user: User = Depends(get_current_user)):
    owned = Metrics.user_id == str(current_user.id)
    total_count = await Metrics.find(owned).count()
    by_type = {
        metric_type: await Metrics.find(owned, Metrics.metric_type == metric_type).count()
        for metric_type in STATS_TYPES
    }

    recent = await Metrics.find(owned).sort("-timestamp").limit(100).to_list()
    sensors = list({m.sensor_id for m in recent})

    return {
        "total_metrics": total_count,
        "by_type": by_type,
        "active_sensors_count": len(sensors),
        "recent_sensors": sensors,
        "thresholds": THRESHOLDS,
    }
