"""Telemetry retention: the TTL index on telemetry_snapshots.timestamp and its migration."""

import mongomock_motor
import pytest
from pydantic import ValidationError
from pymongo import ASCENDING

from app.core.config import Settings, settings
from app.db.session import migrate_indexes
from app.models.telemetry import (
    TELEMETRY_TIMESTAMP_INDEX,
    TelemetrySnapshotDocument,
    telemetry_retention_seconds,
)

COLL = TelemetrySnapshotDocument.Settings.name
# The configured retention (default 7 days; .env may change it).
RETENTION = telemetry_retention_seconds()


@pytest.fixture
def fresh_db():
    """An empty in-memory database, not registered with Beanie."""
    return mongomock_motor.AsyncMongoMockClient().retention_test


async def _indexes(db):
    return await db[COLL].index_information()


def test_default_retention_is_7_days():
    # Raw readings for a week; longer graphs use the hourly and daily summaries.
    assert Settings.model_fields["TELEMETRY_RETENTION_DAYS"].default == 7
    assert telemetry_retention_seconds() == settings.TELEMETRY_RETENTION_DAYS * 24 * 60 * 60


def test_retention_must_be_at_least_one_day():
    with pytest.raises(ValidationError):
        Settings(MONGODB_URI="mongodb://x", MONGO_DB="x", SECRET_KEY="x", TELEMETRY_RETENTION_DAYS=0)


def test_model_declares_one_ttl_index_on_timestamp():
    ttl = [
        i for i in TelemetrySnapshotDocument.Settings.indexes
        if not isinstance(i, str) and i.document["key"] == {"timestamp": ASCENDING}
    ]
    assert len(ttl) == 1
    assert ttl[0].document["name"] == TELEMETRY_TIMESTAMP_INDEX
    assert ttl[0].document["expireAfterSeconds"] == RETENTION
    # No second, plain timestamp index: MongoDB allows one per key pattern.
    assert "timestamp" not in [i for i in TelemetrySnapshotDocument.Settings.indexes if isinstance(i, str)]


async def test_app_database_gets_the_ttl_index(mock_mongo_client):
    info = await mock_mongo_client.telemetry_test[COLL].index_information()
    assert info[TELEMETRY_TIMESTAMP_INDEX]["expireAfterSeconds"] == RETENTION


async def test_migration_drops_an_old_plain_timestamp_index(fresh_db):
    await fresh_db[COLL].create_index([("timestamp", ASCENDING)], name=TELEMETRY_TIMESTAMP_INDEX)
    await migrate_indexes(fresh_db)
    assert TELEMETRY_TIMESTAMP_INDEX not in await _indexes(fresh_db)


async def test_migration_drops_a_ttl_index_with_another_retention(fresh_db):
    await fresh_db[COLL].create_index(
        [("timestamp", ASCENDING)], name=TELEMETRY_TIMESTAMP_INDEX, expireAfterSeconds=RETENTION + 24 * 3600
    )
    await migrate_indexes(fresh_db)
    assert TELEMETRY_TIMESTAMP_INDEX not in await _indexes(fresh_db)


async def test_migration_keeps_a_matching_ttl_index(fresh_db):
    await fresh_db[COLL].create_index(
        [("timestamp", ASCENDING)], name=TELEMETRY_TIMESTAMP_INDEX, expireAfterSeconds=RETENTION
    )
    await migrate_indexes(fresh_db)
    assert (await _indexes(fresh_db))[TELEMETRY_TIMESTAMP_INDEX]["expireAfterSeconds"] == RETENTION


async def test_migration_follows_a_changed_retention_setting(fresh_db, monkeypatch):
    await fresh_db[COLL].create_index(
        [("timestamp", ASCENDING)], name=TELEMETRY_TIMESTAMP_INDEX, expireAfterSeconds=RETENTION
    )
    monkeypatch.setattr(settings, "TELEMETRY_RETENTION_DAYS", 90)
    await migrate_indexes(fresh_db)
    assert TELEMETRY_TIMESTAMP_INDEX not in await _indexes(fresh_db)


async def test_migration_without_the_collection_does_nothing(fresh_db):
    await migrate_indexes(fresh_db)
    assert COLL not in await fresh_db.list_collection_names()


async def test_readings_past_retention_are_removed(mock_mongo_client, test_user, test_device):
    """mongomock applies TTL indexes on read, like MongoDB's background task."""
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    for label, age in (("old", timedelta(days=31)), ("fresh", timedelta(minutes=5))):
        await TelemetrySnapshotDocument(
            user_id=test_user.id, device_id=test_device.id, timestamp=now - age, sensor_id=f"sensor_{label}"
        ).insert()

    left = await TelemetrySnapshotDocument.find(TelemetrySnapshotDocument.device_id == test_device.id).to_list()
    assert [s.sensor_id for s in left] == ["sensor_fresh"]
