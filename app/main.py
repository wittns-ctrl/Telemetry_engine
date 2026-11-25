import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pymongo.errors import ConnectionFailure
from fastapi.middleware.gzip import GZipMiddleware
from app.core.config import settings
from app.core.rate_limit import RateLimitMiddleware
from app.db.session import init_db, close_db
from app.core.cache import cache
from app.services.ingest_processor import ingest_processor
from app.api.v1 import system as system_router
from app.core.websocket_manager import manager
from app.api.v1 import auth as auth_router
from app.api.v1 import google_auth as google_auth_router
from app.api.v1 import websocket as websocket_router
from app.api.v1 import devices as devices_router
from app.api.v1 import metrics as metrics_router
from app.api.v1 import alerts as alerts_router
from app.api.v1 import diagnostics as diagnostics_router
from app.api.v1 import ingest as ingest_router
from app.api.v1 import agent_download as agent_download_router
from app.api.v1 import fixes as fixes_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    ingest_processor.start(settings.INGEST_WORKERS, settings.INGEST_QUEUE_SIZE)
    yield
    # Graceful shutdown: finish queued alert checks, then close connections.
    await ingest_processor.stop()
    await cache.close()
    await close_db()

app = FastAPI(
    title="Lectio API",
    description="High-Throughput Real-Time Telemetry Ingestion, Alerting, and Analytics Engine",
    version="1.0.0",
    lifespan=lifespan
)

logger = logging.getLogger(__name__)
_last_db_warning = 0.0


@app.exception_handler(ConnectionFailure)
async def database_unreachable(request: Request, exc: ConnectionFailure):
    """
    The database can't be reached (no internet, DNS failing, cluster down).
    Answer 503 so the website and agent retry later, and log one short line
    a minute instead of a full traceback for every request.
    """
    global _last_db_warning
    now = time.monotonic()
    if now - _last_db_warning > 60:
        _last_db_warning = now
        logger.warning("Database unreachable, answering 503 (check this machine's internet/DNS): %s",
                       str(exc).split(",")[0])
    return JSONResponse(
        status_code=503,
        content={"detail": "The service can't reach its database right now. Try again in a moment."},
        headers={"Retry-After": "15"},
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

# Compress JSON responses: snapshot lists shrink to a fraction of their size,
# which matters once the API and the browser are on different networks.
app.add_middleware(GZipMiddleware, minimum_size=1024)

# --- SYSTEM HEALTH & PERFORMANCE ---
app.include_router(system_router.router, prefix="/api/v1")

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

# --- FIXES (website asks, the PC's agent runs them) ---
app.include_router(fixes_router.router, prefix="/api/v1")

# --- WINDOWS AGENT DOWNLOAD ---
app.include_router(agent_download_router.router, prefix="/api/v1")

