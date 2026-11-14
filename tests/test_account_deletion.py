"""DELETE /api/v1/auth/account must erase everything the user owns, and nothing else."""

import uuid
from datetime import datetime, timedelta, timezone

import mongomock_motor
import pytest
from beanie import init_beanie

from app.core.security import create_access_token, get_password_hash
from app.models.alert import AlertSeverity, AnomalyAlertDocument
from app.models.audit_log import AuditEventType, AuditLog
from app.models.email_verification import EmailVerification
from app.models.metric import Metrics
from app.models.password_reset import PasswordReset
from app.models.refresh_token import RefreshToken
from app.models.telemetry import Device, TelemetrySnapshotDocument
from app.models.user import User, UserRole

ALL_MODELS = [
    User, Device, TelemetrySnapshotDocument, AnomalyAlertDocument, Metrics,
    RefreshToken, EmailVerification, PasswordReset, AuditLog,
]


@pytest.fixture
async def full_db():
    """In-memory database with every collection that can hold user data."""
    client = mongomock_motor.AsyncMongoMockClient()
    await init_beanie(database=client.account_deletion_test, document_models=ALL_MODELS)
    yield
    await client.drop_database("account_deletion_test")


async def make_user_with_data(email: str) -> User:
    """A user with one record in every collection that references them."""
    now = datetime.now(timezone.utc)
    user = User(
        email=email, normalized_email=email, full_name="Someone",
        hashed_password=get_password_hash("TestPassword123"),
        email_verified=True, role=UserRole.USER, auth_providers=["password"],
    )
    await user.insert()
    uid = str(user.id)

    device = Device(user_id=user.id, device_name="Desk", system_uuid=str(uuid.uuid4()), os_info="Windows 11")
    await device.insert()
    await TelemetrySnapshotDocument(
        user_id=user.id, device_id=device.id, timestamp=now,
        sensor_id=device.system_uuid, collection_duration_ms=10.0,
    ).insert()
    await AnomalyAlertDocument(
        user_id=user.id, device_id=device.id, rule_name="CPU_OVERHEATING_CRITICAL",
        severity=AlertSeverity.CRITICAL, metric_name="cpu_core_temperature_c",
        trigger_value=95.0, threshold_limit=90.0, message="hot", is_active=True, created_at=now,
    ).insert()
    await Metrics(user_id=uid, sensor_id="s1", metric_type="temperature", value=70.0).insert()
    await RefreshToken(user_id=uid, token_hash=uuid.uuid4().hex, expires_at=now + timedelta(days=7)).insert()
    await EmailVerification(user_id=uid, token_hash=uuid.uuid4().hex, email=email, expires_at=now + timedelta(days=1)).insert()
    await PasswordReset(user_id=uid, token_hash=uuid.uuid4().hex, email=email, expires_at=now + timedelta(hours=1)).insert()
    await AuditLog(user_id=uid, event_type=AuditEventType.LOGIN_SUCCESS, ip_address="203.0.113.7").insert()
    return user


async def counts_for(user: User) -> dict:
    uid, oid = str(user.id), user.id
    return {
        "user": await User.find(User.id == oid).count(),
        "devices": await Device.find(Device.user_id == oid).count(),
        "readings": await TelemetrySnapshotDocument.find(TelemetrySnapshotDocument.user_id == oid).count(),
        "alerts": await AnomalyAlertDocument.find(AnomalyAlertDocument.user_id == oid).count(),
        "metrics": await Metrics.find(Metrics.user_id == uid).count(),
        "sessions": await RefreshToken.find(RefreshToken.user_id == uid).count(),
        "email_tokens": await EmailVerification.find(EmailVerification.user_id == uid).count(),
        "reset_tokens": await PasswordReset.find(PasswordReset.user_id == uid).count(),
        "audit_logs": await AuditLog.find(AuditLog.user_id == uid).count(),
    }


def bearer(user: User) -> dict:
    token = create_access_token(data={"sub": str(user.id), "type": "access"}, expires_delta=timedelta(minutes=15))
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_delete_account_erases_everything_for_that_user_only(full_db, async_client):
    leaving = await make_user_with_data("leaving@example.com")
    staying = await make_user_with_data("staying@example.com")
    assert all(n == 1 for n in (await counts_for(leaving)).values())

    response = await async_client.delete("/api/v1/auth/account", headers=bearer(leaving))

    assert response.status_code == 200
    assert "refresh_token" in response.headers.get("set-cookie", "")  # sign-in cookie cleared
    assert await counts_for(leaving) == {k: 0 for k in await counts_for(leaving)}
    assert all(n == 1 for n in (await counts_for(staying)).values()), "another account's data was touched"


@pytest.mark.asyncio
async def test_delete_device_removes_its_readings_and_alerts_only(full_db, async_client):
    user = await make_user_with_data("owner@example.com")
    other = await make_user_with_data("other@example.com")
    doomed = await Device.find_one(Device.user_id == user.id)

    # A second machine on the same account, which must survive.
    kept = Device(user_id=user.id, device_name="Laptop", system_uuid=str(uuid.uuid4()), os_info="macOS")
    await kept.insert()
    await TelemetrySnapshotDocument(
        user_id=user.id, device_id=kept.id, timestamp=datetime.now(timezone.utc),
        sensor_id=kept.system_uuid, collection_duration_ms=10.0,
    ).insert()

    response = await async_client.delete(f"/api/v1/devices/{doomed.id}", headers=bearer(user))

    assert response.status_code == 204
    assert await Device.get(doomed.id) is None
    assert await TelemetrySnapshotDocument.find(TelemetrySnapshotDocument.device_id == doomed.id).count() == 0
    assert await AnomalyAlertDocument.find(AnomalyAlertDocument.device_id == doomed.id).count() == 0
    # The other machine on this account, and the account itself, are untouched.
    assert await Device.get(kept.id) is not None
    assert await TelemetrySnapshotDocument.find(TelemetrySnapshotDocument.device_id == kept.id).count() == 1
    assert (await counts_for(user))["metrics"] == 1
    # Another account is untouched.
    assert all(n == 1 for n in (await counts_for(other)).values())


@pytest.mark.asyncio
async def test_cannot_delete_someone_elses_device(full_db, async_client):
    owner = await make_user_with_data("owner2@example.com")
    intruder = await make_user_with_data("intruder@example.com")
    device = await Device.find_one(Device.user_id == owner.id)

    response = await async_client.delete(f"/api/v1/devices/{device.id}", headers=bearer(intruder))

    assert response.status_code in (403, 404)
    assert all(n == 1 for n in (await counts_for(owner)).values())


@pytest.mark.asyncio
async def test_deleted_account_token_no_longer_works(full_db, async_client):
    user = await make_user_with_data("gone@example.com")
    headers = bearer(user)

    assert (await async_client.delete("/api/v1/auth/account", headers=headers)).status_code == 200
    assert (await async_client.get("/api/v1/auth/me", headers=headers)).status_code == 401
    assert (await async_client.delete("/api/v1/auth/account", headers=headers)).status_code == 401
