"""
Open alerts must be able to close in every situation, not only while the API
process that raised them is still running:

- after a restart, a normal reading closes an alert raised before it;
- an alert whose reading stops arriving closes after ALERT_STALE_MINUTES;
- an alert closed by hand does not reopen on the very next reading.
"""

from datetime import datetime, timedelta, timezone

import pytest
from beanie import PydanticObjectId

from app.core.config import settings
from app.models.alert import AlertSeverity, AnomalyAlertDocument
from app.models.telemetry import CPUMetrics, TelemetrySnapshot
from app.services.alert_service import AlertService
from app.services.anomaly_engine import AnomalyEngine

RULE = "CPU_HIGH_UTILIZATION_INFO"  # utilisation over 90% for 60 s; clears after 30 s


@pytest.fixture
def ids(test_user):
    return str(test_user.id), str(PydanticObjectId())


def snap(at: datetime, util: float | None) -> TelemetrySnapshot:
    return TelemetrySnapshot(timestamp=at, sensor_id="agent-test", cpu=CPUMetrics(utilization_percent=util))


async def open_alert(user_id: str, device_id: str, at: datetime) -> AnomalyAlertDocument:
    alert = AnomalyAlertDocument(
        user_id=PydanticObjectId(user_id),
        device_id=PydanticObjectId(device_id),
        rule_name=RULE,
        severity=AlertSeverity.INFO,
        metric_name="cpu_utilization_percent",
        trigger_value=99.0,
        threshold_limit=90.0,
        message="CPU utilization high",
        created_at=at,
        last_breach_at=at,
    )
    await alert.insert()
    return alert


@pytest.mark.asyncio
async def test_alert_raised_before_a_restart_closes_on_a_normal_reading(ids):
    user_id, device_id = ids
    now = datetime.now(timezone.utc)
    alert = await open_alert(user_id, device_id, now - timedelta(minutes=5))

    fresh_engine = AnomalyEngine()  # a restarted API: nothing in memory
    await fresh_engine.evaluate_snapshot(user_id, device_id, snap(now, 20.0))

    alert = await AnomalyAlertDocument.get(alert.id)
    assert alert.is_active is False
    assert alert.resolved_reason == "recovered"


@pytest.mark.asyncio
async def test_breach_after_a_restart_updates_the_open_alert_instead_of_duplicating(ids):
    user_id, device_id = ids
    now = datetime.now(timezone.utc)
    alert = await open_alert(user_id, device_id, now - timedelta(minutes=5))

    fresh_engine = AnomalyEngine()
    await fresh_engine.evaluate_snapshot(user_id, device_id, snap(now, 97.0))

    open_alerts = await AnomalyAlertDocument.find(
        AnomalyAlertDocument.device_id == PydanticObjectId(device_id),
        AnomalyAlertDocument.is_active == True,  # noqa: E712
    ).to_list()
    assert [a.id for a in open_alerts] == [alert.id]
    assert open_alerts[0].trigger_value == 97.0


@pytest.mark.asyncio
async def test_alert_closes_when_its_reading_stops_arriving(ids):
    user_id, device_id = ids
    now = datetime.now(timezone.utc)
    stale_for = timedelta(minutes=settings.ALERT_STALE_MINUTES + 1)
    alert = await open_alert(user_id, device_id, now - stale_for)

    engine = AnomalyEngine()
    await engine.evaluate_snapshot(user_id, device_id, snap(now, None))

    alert = await AnomalyAlertDocument.get(alert.id)
    assert alert.is_active is False
    assert alert.resolved_reason == "no_reading"


@pytest.mark.asyncio
async def test_alert_with_a_briefly_missing_reading_stays_open(ids):
    user_id, device_id = ids
    now = datetime.now(timezone.utc)
    alert = await open_alert(user_id, device_id, now - timedelta(minutes=1))

    engine = AnomalyEngine()
    await engine.evaluate_snapshot(user_id, device_id, snap(now, None))

    assert (await AnomalyAlertDocument.get(alert.id)).is_active is True


@pytest.mark.asyncio
async def test_brief_spikes_with_normal_readings_between_raise_no_alert(ids):
    user_id, device_id = ids
    engine = AnomalyEngine()
    start = datetime.now(timezone.utc) - timedelta(minutes=5)
    # Over the limit at 0 s and 70 s, normal in between: never 60 s in a row.
    for second, util in [(0, 97.0), (30, 20.0), (70, 97.0), (75, 97.0)]:
        await engine.evaluate_snapshot(user_id, device_id, snap(start + timedelta(seconds=second), util))

    assert await AnomalyAlertDocument.find(AnomalyAlertDocument.device_id == PydanticObjectId(device_id)).count() == 0


@pytest.mark.asyncio
async def test_alert_closed_by_hand_does_not_reopen_on_the_next_reading(ids, monkeypatch):
    user_id, device_id = ids
    engine = AnomalyEngine()
    # Closing by hand must reset the engine the API actually uses.
    monkeypatch.setattr("app.services.anomaly_engine.anomaly_engine", engine)

    start = datetime.now(timezone.utc) - timedelta(minutes=3)
    for second in range(0, 75, 5):  # 75 s over the limit raises the alert
        await engine.evaluate_snapshot(user_id, device_id, snap(start + timedelta(seconds=second), 97.0))
    alert = await AnomalyAlertDocument.find_one(AnomalyAlertDocument.device_id == PydanticObjectId(device_id))
    assert alert and alert.is_active

    assert await AlertService.manually_resolve_alert(str(alert.id), user_id)
    await engine.evaluate_snapshot(user_id, device_id, snap(start + timedelta(seconds=80), 97.0))

    alerts = await AnomalyAlertDocument.find(AnomalyAlertDocument.device_id == PydanticObjectId(device_id)).to_list()
    assert len(alerts) == 1
    assert alerts[0].is_active is False
    assert alerts[0].resolved_reason == "closed_by_user"
