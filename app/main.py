from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.rate_limit import RateLimitMiddleware
from app.db.session import init_db
from app.core.sockets import manager
from app.api.v1 import auth as auth_router
from app.api.v1 import google_auth as google_auth_router
from app.api.v1 import websocket as websocket_router
from app.api.v1 import devices as devices_router
from app.api.v1 import metrics as metrics_router
from app.api.v1 import alerts as alerts_router
from app.api.v1 import diagnostics as diagnostics_router
from app.api.v1 import ingest as ingest_router
from app.api.v1 import sensor_metrics as sensor_metrics_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(
    title="Lectio API",
    description="High-Throughput Real-Time Telemetry Ingestion, Alerting, and Analytics Engine",
    version="1.0.0",
    lifespan=lifespan
)

# Rate limiting. Added before CORS so CORS wraps it and 429 responses still
# carry the CORS headers the browser needs to read them.
app.add_middleware(RateLimitMiddleware)

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
        "service": "Lectio",
        "active_websockets": len(manager.active_connections),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

# --- HAND-SUBMITTED SENSOR METRICS (Metrics Studio, /ws/alerts) ---
app.include_router(sensor_metrics_router.router)

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

