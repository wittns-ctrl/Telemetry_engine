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


async def init_db():
    # tz_aware=True so datetimes read back from Mongo compare correctly with
    # datetime.now(timezone.utc) (expiry checks on tokens, alert timing, etc.).
    client = AsyncMongoClient(settings.MONGODB_URI, tz_aware=True)

    await init_beanie(
        database=client[settings.MONGO_DB],
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