from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, Depends, status, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.db.session import init_db
from app.models.metric import Metrics
from app.models.user import User
from app.api.deps import get_current_user, get_current_user_ws
from app.models.telemetry import TelemetryPayload
from app.core.sockets import manager
from app.services.alerting import evaluate_metric_alert, THRESHOLDS
from app.services.notifications import send_email_alert, send_webhook_alert
from app.api.v1 import auth as auth_router
from app.api.v1 import google_auth as google_auth_router
from app.api.v1 import websocket as websocket_router
from app.api.v1 import devices as devices_router
from app.api.v1 import metrics as metrics_router
from app.api.v1 import alerts as alerts_router
from app.api.v1 import diagnostics as diagnostics_router
from app.api.v1 import ingest as ingest_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(
    title="Telemetry Engine API",
    description="High-Throughput Real-Time Telemetry Ingestion, Alerting, and Analytics Engine",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for Frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# --- SYSTEM HEALTH & CONFIG ---

@app.get("/api/v1/health", summary="Health Check")
async def health_check():
    return {
        "status": "healthy",
        "service": "Telemetry Engine",
        "active_websockets": len(manager.active_connections),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@app.get("/api/v1/thresholds", summary="Get Alert Thresholds")
async def get_thresholds():
    return THRESHOLDS

# --- WEBSOCKET ENDPOINT ---

@app.websocket("/ws/alerts")
async def websocket_alerts_endpoint(
    websocket: WebSocket,
    current_user: User = Depends(get_current_user_ws),
):
    """Live metric/alert events for the signed-in user. Requires ?token=<access JWT>."""
    user_id = str(current_user.id)
    await manager.connect(websocket, user_id)
    try:
        # Keep socket connection open & handle incoming client messages if any
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        manager.disconnect(websocket, user_id)


# --- TELEMETRY METRIC ENDPOINTS ---

@app.post(
    "/api/v1/metrics",
    status_code=status.HTTP_201_CREATED,
    summary="Ingest Polymorphic Telemetry Data"
)
async def ingest_metric(
    payload: TelemetryPayload,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    # Dump payload model into a dictionary
    payload_dict = payload.model_dump()

    # Separate common & specific payload fields
    sensor_id = payload_dict.pop("sensor_id")
    metric_type = payload_dict.pop("metric_type")
    value = payload_dict.pop("value")

    # Persist in MongoDB via Beanie
    user_id = str(current_user.id)
    metric = Metrics(
        user_id=user_id,
        sensor_id=sensor_id,
        metric_type=metric_type,
        value=value,
        payload_data=payload_dict
    )
    await metric.insert()

    # Check for alerts
    alert_event = evaluate_metric_alert(payload)

    # 1. Send the metric event to this user's WebSocket clients
    metric_event = {
        "event": "METRIC_RECORDED",
        "metric_id": str(metric.id),
        "sensor_id": sensor_id,
        "metric_type": metric_type,
        "value": value,
        "payload_data": payload_dict,
        "timestamp": metric.timestamp.isoformat() if hasattr(metric.timestamp, "isoformat") else str(metric.timestamp),
        "alert_triggered": alert_event is not None
    }
    await manager.send_to_user(user_id, metric_event)

    # 2. Send the threshold breach alert event if triggered
    if alert_event:
        await manager.send_to_user(user_id, alert_event)
        if settings.ALERT_WEBHOOK_URL:
            background_tasks.add_task(
                send_webhook_alert,
                webhook_url=settings.ALERT_WEBHOOK_URL,
                alert_payload=alert_event
            )
        background_tasks.add_task(
            send_email_alert,
            recipient_email=current_user.email,
            alert_payload=alert_event
        )

    return {
        "status": "success",
        "metric_id": str(metric.id),
        "alert_triggered": alert_event is not None,
        "alert_details": alert_event
    }


@app.get(
    "/api/v1/metrics",
    summary="Fetch Recent Telemetry Metrics"
)
async def get_metrics(
    limit: int = 50,
    metric_type: str | None = None,
    sensor_id: str | None = None,
    current_user: User = Depends(get_current_user)
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
            "timestamp": m.timestamp.isoformat() if hasattr(m.timestamp, "isoformat") else str(m.timestamp)
        }
        for m in metrics
    ]


@app.get(
    "/api/v1/metrics/stats",
    summary="Telemetry Engine Statistics"
)
async def get_metrics_stats(current_user: User = Depends(get_current_user)):
    user_id = str(current_user.id)
    owned = Metrics.user_id == user_id
    total_count = await Metrics.find(owned).count()
    temp_count = await Metrics.find(owned, Metrics.metric_type == "temperature").count()
    cpu_count = await Metrics.find(owned, Metrics.metric_type == "cpu").count()
    net_count = await Metrics.find(owned, Metrics.metric_type == "network").count()

    recent = await Metrics.find(owned).sort("-timestamp").limit(100).to_list()
    sensors = list({m.sensor_id for m in recent})

    return {
        "total_metrics": total_count,
        "by_type": {
            "temperature": temp_count,
            "cpu": cpu_count,
            "network": net_count
        },
        "active_sensors_count": len(sensors),
        "recent_sensors": sensors,
        "thresholds": THRESHOLDS
    }


# --- AUTH ROUTES ---
app.include_router(auth_router.router, prefix="/api/v1")
app.include_router(google_auth_router.router, prefix="/api/v1")

# --- WEBSOCKET ROUTES ---
app.include_router(websocket_router.router, prefix="/api/v1")

# --- DEVICES ROUTES ---
app.include_router(devices_router.router, prefix="/api/v1")

# --- METRICS ROUTES ---
app.include_router(metrics_router.router, prefix="/api/v1")

# --- ALERTS ROUTES ---
app.include_router(alerts_router.router, prefix="/api/v1")

# --- DIAGNOSTICS ROUTES ---
app.include_router(diagnostics_router.router, prefix="/api/v1")

# --- AGENT TELEMETRY INGEST ---
app.include_router(ingest_router.router, prefix="/api/v1")

