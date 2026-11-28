import asyncio
import logging

from pymongo import AsyncMongoClient
from pymongo.errors import PyMongoError
from beanie import init_beanie
from app.core.config import settings
from app.db.monitoring import CommandStats, PoolStats
from app.models.metric import Metrics
from app.models.user import User
from app.models.refresh_token import RefreshToken
from app.models.email_verification import EmailVerification
from app.models.password_reset import PasswordReset
from app.models.audit_log import AuditLog
from app.models.telemetry import (
    Device,
    TelemetrySnapshotDocument,
    TELEMETRY_DROPPED_INDEXES,
    TELEMETRY_TIMESTAMP_INDEX,
    telemetry_retention_seconds,
)
from app.models.alert import AnomalyAlertDocument
from app.models.fix import FixRequest
from app.models.rollup import TelemetryRollupDocument
from app.models.location import LocationHistory
from app.models.daily_report import DailyReport
from app.models.incident import Incident
from app.models.ai_script import AiScript


# Every Beanie document the app uses. The test suite's in-memory database
# registers this same list (tests/conftest.py).
DOCUMENT_MODELS = [
    Metrics,
    User,
    RefreshToken,
    EmailVerification,
    PasswordReset,
    AuditLog,
    Device,
    TelemetrySnapshotDocument,
    TelemetryRollupDocument,
    AnomalyAlertDocument,
    FixRequest,
    LocationHistory,
    DailyReport,
    Incident,
    AiScript,
]


async def _migrate_device_indexes(db, collections=None):
    """Replace the old unique+sparse ingest_key_hash index with the partial one.

    Beanie won't change options on an existing index of the same name, so drop
    the old form and let init_beanie recreate it from the Device model.
    """
    if "devices" not in (collections if collections is not None else await db.list_collection_names()):
        return
    old = (await db["devices"].index_information()).get("ingest_key_hash_1")
    if old and "partialFilterExpression" not in old:
        await db["devices"].drop_index("ingest_key_hash_1")


async def _migrate_telemetry_ttl_index(db, collections=None):
    """Make telemetry_snapshots.timestamp_1 a TTL index with the configured retention.

    Older databases have a plain timestamp index, which never deleted anything,
    and TELEMETRY_RETENTION_DAYS may have changed since the index was built.
    Beanie won't change an existing index's options, so drop one that doesn't
    match and let init_beanie recreate it from TelemetrySnapshotDocument.
    MongoDB then removes readings past the retention period on its own.
    """
    coll = TelemetrySnapshotDocument.Settings.name
    if coll not in (collections if collections is not None else await db.list_collection_names()):
        return
    current = (await db[coll].index_information()).get(TELEMETRY_TIMESTAMP_INDEX)
    if current and current.get("expireAfterSeconds") != telemetry_retention_seconds():
        await db[coll].drop_index(TELEMETRY_TIMESTAMP_INDEX)


async def _drop_redundant_telemetry_indexes(db, collections=None):
    """Drop single-field user_id/device_id indexes on readings: user_device_time
    covers every query on them, and each extra index slows every upload."""
    coll = TelemetrySnapshotDocument.Settings.name
    if coll not in (collections if collections is not None else await db.list_collection_names()):
        return
    existing = await db[coll].index_information()
    for name in TELEMETRY_DROPPED_INDEXES:
        if name in existing:
            await db[coll].drop_index(name)
            logger.info("Dropped the redundant index %s on %s", name, coll)


LEGACY_READINGS = "telemetry_snapshots_legacy"
COPY_BATCH = 1000
_background: set[asyncio.Task] = set()


async def _server_major(db) -> int:
    try:
        info = await db.command("buildInfo")
        return int(info.get("versionArray", [0])[0])
    except PyMongoError:
        return 0


async def migrate_to_timeseries(db) -> None:
    """Keep raw readings in a time-series collection (much smaller on disk).

    First start after the switch: the classic collection is renamed to
    telemetry_snapshots_legacy, the time-series one is created (it expires
    readings itself after the retention period), and the last retention
    period's readings are copied across in the background, so startup isn't
    held up; the legacy collection is dropped once copied. Interrupted copies
    resume on the next start.
    """
    if not settings.TELEMETRY_TIMESERIES:
        return
    if await _server_major(db) < 7:
        logger.error("TELEMETRY_TIMESERIES needs MongoDB 7.0 or later; set TELEMETRY_TIMESERIES=false for this server")
        return
    name = TelemetrySnapshotDocument.Settings.name
    infos = {c["name"]: c async for c in await db.list_collections()}
    current = infos.get(name)
    if current and current.get("type") != "timeseries":
        if LEGACY_READINGS in infos:
            logger.error("Both %s and %s exist and %s isn't time-series; leaving them for a person to sort out",
                         name, LEGACY_READINGS, name)
            return
        await db[name].rename(LEGACY_READINGS)
        logger.info("Moved the classic readings collection aside to %s", LEGACY_READINGS)
        current, infos[LEGACY_READINGS] = None, {"name": LEGACY_READINGS}
    retention = telemetry_retention_seconds()
    if current is None:
        await db.create_collection(
            name,
            timeseries={"timeField": "timestamp", "metaField": "device_id", "granularity": "seconds"},
            expireAfterSeconds=retention,
        )
        logger.info("Created the time-series readings collection (kept %d days)", retention // 86400)
    elif current.get("options", {}).get("expireAfterSeconds") != retention:
        await db.command({"collMod": name, "expireAfterSeconds": retention})
    if LEGACY_READINGS in infos:
        task = asyncio.create_task(_copy_legacy_readings(db, name, retention))
        _background.add(task)
        task.add_done_callback(_background.discard)


async def _copy_legacy_readings(db, name: str, retention: int) -> None:
    from datetime import datetime, timedelta, timezone
    legacy, target = db[LEGACY_READINGS], db[name]
    since = datetime.now(timezone.utc) - timedelta(seconds=retention)
    copied, last_id = 0, None
    try:
        while True:
            query = {"timestamp": {"$gte": since}}
            if last_id is not None:
                query["_id"] = {"$gt": last_id}
            batch = await legacy.find(query).sort("_id", 1).limit(COPY_BATCH).to_list(COPY_BATCH)
            if not batch:
                break
            last_id = batch[-1]["_id"]
            for doc in batch:  # the new layout leaves empty readings out
                for key in [k for k, v in doc.items() if v is None or v == []]:
                    doc.pop(key)
            # Already-copied ones (from an interrupted run) are skipped.
            ids = [d["_id"] for d in batch]
            done = {d["_id"] async for d in target.find({"_id": {"$in": ids}}, projection={"_id": 1})}
            fresh = [d for d in batch if d["_id"] not in done]
            if fresh:
                await target.insert_many(fresh, ordered=False)
            copied += len(fresh)
        await legacy.drop()
        logger.info("Copied %d readings into the time-series collection and dropped %s", copied, LEGACY_READINGS)
    except Exception:
        logger.exception("Copying readings into the time-series collection stopped after %d; it resumes on the next start", copied)


async def migrate_indexes(db):
    await migrate_to_timeseries(db)
    # One collection listing for all the checks: each round trip to the
    # database can take seconds on a slow connection, and startup waits on them.
    collections = set(await db.list_collection_names())
    await _migrate_device_indexes(db, collections)
    await _drop_redundant_telemetry_indexes(db, collections)
    # Summaries first: a shorter raw retention (the TTL change below) lets
    # MongoDB delete older readings soon after, so build them while they exist.
    from app.services.rollups import backfill_from_raw
    try:
        await backfill_from_raw(db)
    except PyMongoError as e:
        logger.error("Couldn't build the telemetry summaries from stored readings; keeping raw retention as is: %s", e)
        return
    await _migrate_telemetry_ttl_index(db, collections)


logger = logging.getLogger(__name__)

# One client for the whole process: it owns the connection pool, and every
# request borrows a connection from it. Never create a client per request.
_client: AsyncMongoClient | None = None
command_stats = CommandStats(slow_ms=settings.SLOW_QUERY_MS)
pool_stats = PoolStats()


def create_client() -> AsyncMongoClient:
    return AsyncMongoClient(
        settings.MONGODB_URI,
        # Datetimes read back carry UTC, so they compare with datetime.now(timezone.utc).
        tz_aware=True,
        appname="lectio-api",
        # Pool: open connections are reused; a few stay open while idle because
        # opening one to a hosted cluster (DNS, TLS, sign-in) is slow.
        maxPoolSize=settings.MONGO_MAX_POOL_SIZE,
        minPoolSize=settings.MONGO_MIN_POOL_SIZE,
        maxIdleTimeMS=settings.MONGO_MAX_IDLE_TIME_MS,
        waitQueueTimeoutMS=settings.MONGO_WAIT_QUEUE_TIMEOUT_MS,
        # Timeouts, so a lost database fails requests instead of hanging them.
        connectTimeoutMS=settings.MONGO_CONNECT_TIMEOUT_MS,
        serverSelectionTimeoutMS=settings.MONGO_SERVER_SELECTION_TIMEOUT_MS,
        socketTimeoutMS=settings.MONGO_SOCKET_TIMEOUT_MS,
        # A read or write interrupted by a dropped connection or failover is
        # retried once on a fresh connection.
        retryReads=True,
        retryWrites=True,
        # Readings compress several times over; zlib ships with Python.
        compressors="zlib",
        event_listeners=[command_stats, pool_stats],
    )


def get_client() -> AsyncMongoClient | None:
    return _client


async def _wait_for_database(client: AsyncMongoClient) -> None:
    """Ping until the database answers, waiting 1, 2, 4, 8... seconds between tries."""
    for attempt in range(1, settings.MONGO_STARTUP_RETRIES + 1):
        try:
            await client.admin.command("ping")
            return
        except PyMongoError as e:
            if attempt == settings.MONGO_STARTUP_RETRIES:
                logger.error(
                    "Can't reach the database after %d attempts. Usually this machine has no internet "
                    "or its DNS can't look up the cluster; check the connection and start the API again.",
                    attempt,
                )
                raise
            delay = min(30, 2 ** (attempt - 1))
            logger.warning("Database not reachable (attempt %d/%d): %s. Retrying in %ds.",
                           attempt, settings.MONGO_STARTUP_RETRIES, e, delay)
            await asyncio.sleep(delay)


async def init_db():
    global _client
    client = create_client()
    await _wait_for_database(client)
    db = client[settings.MONGO_DB]
    await migrate_indexes(db)

    await init_beanie(
        database=db,
        document_models=DOCUMENT_MODELS,
    )
    _client = client


async def close_db():
    """Close every pooled connection cleanly when the API shuts down."""
    global _client
    if _client is not None:
        await _client.close()
        _client = None