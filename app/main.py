from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from app.core.config import settings
from app.core.security import get_password_hash, verify_password, create_access_token
from app.db.session import init_db
from app.models.metric import Metrics
from app.models.user import User, UserCreate, UserResponse, Token
from app.api.deps import get_current_user, get_current_user_optional
from app.models.telemetry import TelemetryPayload
from app.core.sockets import manager
from app.services.alerting import evaluate_metric_alert, THRESHOLDS
from app.services.notifications import send_email_alert, send_webhook_alert
from app.api.v1 import auth as auth_router


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
async def websocket_alerts_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Keep socket connection open & handle incoming client messages if any
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)


# --- TELEMETRY METRIC ENDPOINTS ---

@app.post(
    "/api/v1/metrics",
    status_code=status.HTTP_201_CREATED,
    summary="Ingest Polymorphic Telemetry Data"
)
async def ingest_metric(
    payload: TelemetryPayload,
    background_tasks: BackgroundTasks,
    current_user: User | None = Depends(get_current_user_optional)
):
    # Dump payload model into a dictionary
    payload_dict = payload.model_dump()

    # Separate common & specific payload fields
    sensor_id = payload_dict.pop("sensor_id")
    metric_type = payload_dict.pop("metric_type")
    value = payload_dict.pop("value")

    # Persist in MongoDB via Beanie
    metric = Metrics(
        sensor_id=sensor_id,
        metric_type=metric_type,
        value=value,
        payload_data=payload_dict
    )
    await metric.insert()

    # Check for alerts
    alert_event = evaluate_metric_alert(payload)

    # 1. Broadcast metric event to all connected WebSocket clients
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
    await manager.broadcast(metric_event)

    # 2. Broadcast threshold breach alert event if triggered
    if alert_event:
        await manager.broadcast(alert_event)
        recipient_email = current_user.email if current_user else "alerts@telemetry-engine.io"
        background_tasks.add_task(
            send_webhook_alert,
            webhook_url="https://httpbin.org/post",
            alert_payload=alert_event
        )
        background_tasks.add_task(
            send_email_alert,
            recipient_email=recipient_email,
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
    sensor_id: str | None = None
):
    query = {}
    if metric_type:
        query["metric_type"] = metric_type
    if sensor_id:
        query["sensor_id"] = sensor_id

    clamped_limit = max(1, min(limit, 200))
    if query:
        metrics = await Metrics.find(query).sort("-timestamp").limit(clamped_limit).to_list()
    else:
        metrics = await Metrics.find_all().sort("-timestamp").limit(clamped_limit).to_list()

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
async def get_metrics_stats():
    total_count = await Metrics.count()
    temp_count = await Metrics.find(Metrics.metric_type == "temperature").count()
    cpu_count = await Metrics.find(Metrics.metric_type == "cpu").count()
    net_count = await Metrics.find(Metrics.metric_type == "network").count()

    recent = await Metrics.find_all().sort("-timestamp").limit(100).to_list()
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
        "active_connections": len(manager.active_connections),
        "thresholds": THRESHOLDS
    }


# --- AUTH ROUTES ---
app.include_router(auth_router.router, prefix="/api/v1")


# --- PROTECTED METRICS ROUTE ---

@app.post("/api/v2/metrics", status_code=status.HTTP_201_CREATED)
async def create_metric(
    payload: dict,
    current_user: User = Depends(get_current_user)  # Requires valid JWT
):
    metric = Metrics(**payload)
    await metric.insert()
    return metric