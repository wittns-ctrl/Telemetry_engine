from pymongo import AsyncMongoClient
from beanie import init_beanie
from app.core.config import settings
from app.models.metric import Metrics
from app.models.user import User
from app.models.refresh_token import RefreshToken
from app.models.email_verification import EmailVerification
from app.models.password_reset import PasswordReset
from app.models.audit_log import AuditLog
from app.models.telemetry import (
    Device,
    TelemetrySnapshotDocument,
    TELEMETRY_TIMESTAMP_INDEX,
    telemetry_retention_seconds,
)
from app.models.alert import AnomalyAlertDocument
from app.models.fix import FixRequest


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
    AnomalyAlertDocument,
    FixRequest,
]


async def _migrate_device_indexes(db):
    """Replace the old unique+sparse ingest_key_hash index with the partial one.

    Beanie won't change options on an existing index of the same name, so drop
    the old form and let init_beanie recreate it from the Device model.
    """
    if "devices" not in await db.list_collection_names():
        return
    old = (await db["devices"].index_information()).get("ingest_key_hash_1")
    if old and "partialFilterExpression" not in old:
        await db["devices"].drop_index("ingest_key_hash_1")


async def _migrate_telemetry_ttl_index(db):
    """Make telemetry_snapshots.timestamp_1 a TTL index with the configured retention.

    Older databases have a plain timestamp index, which never deleted anything,
    and TELEMETRY_RETENTION_DAYS may have changed since the index was built.
    Beanie won't change an existing index's options, so drop one that doesn't
    match and let init_beanie recreate it from TelemetrySnapshotDocument.
    MongoDB then removes readings past the retention period on its own.
    """
    coll = TelemetrySnapshotDocument.Settings.name
    if coll not in await db.list_collection_names():
        return
    current = (await db[coll].index_information()).get(TELEMETRY_TIMESTAMP_INDEX)
    if current and current.get("expireAfterSeconds") != telemetry_retention_seconds():
        await db[coll].drop_index(TELEMETRY_TIMESTAMP_INDEX)


async def migrate_indexes(db):
    await _migrate_device_indexes(db)
    await _migrate_telemetry_ttl_index(db)


async def init_db():
    # tz_aware=True so datetimes read back from Mongo compare correctly with
    # datetime.now(timezone.utc) (expiry checks on tokens, alert timing, etc.).
    # minPoolSize keeps a couple of connections open even when the site is quiet.
    # Opening one to a hosted cluster (DNS lookup, TLS, sign-in) can take several
    # seconds on a slow connection, and every first click after an idle spell
    # would otherwise pay that.
    # compressors: readings compress several times over, and on a slow link to
    # the cluster the transfer, not the query, is most of the wait. zlib ships
    # with Python, so it needs no extra package; the server agrees to it or not.
    client = AsyncMongoClient(settings.MONGODB_URI, tz_aware=True, minPoolSize=2, compressors="zlib")
    db = client[settings.MONGO_DB]
    await migrate_indexes(db)

    await init_beanie(
        database=db,
        document_models=DOCUMENT_MODELS,
    )