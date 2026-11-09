from pymongo import AsyncMongoClient
from beanie import init_beanie
from app.core.config import settings
from app.models.metric import Metrics
from app.models.user import User
from app.models.refresh_token import RefreshToken
from app.models.email_verification import EmailVerification
from app.models.password_reset import PasswordReset
from app.models.audit_log import AuditLog
from app.models.telemetry import Device, TelemetrySnapshotDocument
from app.models.alert import AnomalyAlertDocument


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


async def init_db():
    # tz_aware=True so datetimes read back from Mongo compare correctly with
    # datetime.now(timezone.utc) (expiry checks on tokens, alert timing, etc.).
    client = AsyncMongoClient(settings.MONGODB_URI, tz_aware=True)
    db = client[settings.MONGO_DB]
    await _migrate_device_indexes(db)

    await init_beanie(
        database=db,
        document_models=[
            Metrics,
            User,
            RefreshToken,
            EmailVerification,
            PasswordReset,
            AuditLog,
            Device,
            TelemetrySnapshotDocument,
            AnomalyAlertDocument
        ]
    )