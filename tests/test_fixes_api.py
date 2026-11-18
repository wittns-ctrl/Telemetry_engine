"""Fixes API: the website asks, the agent checks in, runs, reports and undoes."""

from datetime import datetime, timedelta, timezone

import pytest

from app.core.security import hash_token
from app.models.alert import AlertSeverity, AnomalyAlertDocument
from app.models.fix import FixRequest, FixStatus
from app.models.telemetry import Device

KEY = "test-device-key-0123456789abcdef"
OTHER_KEY = "other-device-key-0123456789abcdef"


@pytest.fixture
async def keyed_device(test_device):
    test_device.ingest_key_hash = hash_token(KEY)
    await test_device.save()
    return test_device


@pytest.fixture
async def keyed_other_device(other_device):
    other_device.ingest_key_hash = hash_token(OTHER_KEY)
    await other_device.save()
    return other_device


@pytest.fixture
async def heat_alert(test_user, keyed_device):
    alert = AnomalyAlertDocument(
        user_id=test_user.id, device_id=keyed_device.id, rule_name="CPU_OVERHEATING_CRITICAL",
        severity=AlertSeverity.CRITICAL, metric_name="cpu_core_temperature_c",
        trigger_value=96, threshold_limit=90, message="CPU core temperature 96°C",
    )
    await alert.insert()
    return alert


AGENT = {"X-Device-Key": KEY}


async def ask(client, headers, device, fix_id, **body):
    return await client.post(f"/api/v1/devices/{device.id}/fixes", json={"fix_id": fix_id, **body}, headers=headers)


async def agent_next(client, key=KEY, version=None):
    params = {"agent_version": version} if version else {}
    return await client.get("/api/v1/agent/fixes/next", headers={"X-Device-Key": key}, params=params)


class TestCatalogueAndSuggestions:
    async def test_catalogue_lists_every_fix(self, async_client, auth_headers):
        r = await async_client.get("/api/v1/fixes/catalogue", headers=auth_headers)
        assert r.status_code == 200
        ids = {f["id"] for f in r.json()}
        assert {"cool_down", "close_app", "clean_fans"} <= ids
        cool = next(f for f in r.json() if f["id"] == "cool_down")
        assert cool["size"] == "small" and cool["needs_pc_approval"] is False and cool["undoable"] is True

    async def test_suggestions_for_a_heat_alert(self, async_client, auth_headers, keyed_device, heat_alert):
        r = await async_client.get(
            f"/api/v1/devices/{keyed_device.id}/fixes/suggestions", params={"alert_id": str(heat_alert.id)},
            headers=auth_headers,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["source"] == "rules" and body["fix_level"] == "standard"  # no OpenAI key in tests
        ids = [f["id"] for f in body["options"]]
        assert ids[0] == "cool_down" and body["options"][0]["recommended"] is True
        assert all(o["reason"] for o in body["options"])
        assert ids[-1] == "clean_fans"  # advice is offered too, after the PC fixes
        assert "close_app" not in ids  # needs to know which app, which Lectio can't tell yet

    async def test_suggestions_for_someone_elses_alert(self, async_client, other_auth_headers, keyed_device, heat_alert):
        r = await async_client.get(
            f"/api/v1/devices/{keyed_device.id}/fixes/suggestions", params={"alert_id": str(heat_alert.id)},
            headers=other_auth_headers,
        )
        assert r.status_code == 403


class TestRequesting:
    async def test_small_fix_is_queued_without_pc_approval(self, async_client, auth_headers, keyed_device, heat_alert):
        r = await ask(async_client, auth_headers, keyed_device, "cool_down", alert_id=str(heat_alert.id))
        assert r.status_code == 201
        body = r.json()
        assert body["status"] == "queued" and body["needs_pc_approval"] is False
        assert body["params"] == {"minutes": 60, "max_percent": 80}
        assert body["alert_id"] == str(heat_alert.id)

    async def test_big_fix_needs_pc_approval(self, async_client, auth_headers, keyed_device):
        r = await ask(async_client, auth_headers, keyed_device, "close_app", params={"process": "chrome.exe"})
        assert r.status_code == 201 and r.json()["needs_pc_approval"] is True

    @pytest.mark.parametrize("fix_id, params, why", [
        ("format_drive", {}, "Unknown fix"),
        ("clean_fans", {}, "step for you"),
        ("close_app", {"process": "explorer.exe"}, "part of Windows"),
        ("close_app", {}, "process is required"),
        ("cool_down", {"minutes": 9999}, "15 to 240"),
        ("cool_down", {"command": "del *"}, "unknown parameter"),
        ("restart_service", {"service": "WinDefend"}, "must be one of"),
    ])
    async def test_refused(self, async_client, auth_headers, keyed_device, fix_id, params, why):
        r = await ask(async_client, auth_headers, keyed_device, fix_id, params=params)
        assert r.status_code == 422
        assert why in r.json()["detail"]

    async def test_same_fix_twice_while_waiting(self, async_client, auth_headers, keyed_device):
        assert (await ask(async_client, auth_headers, keyed_device, "balanced_power")).status_code == 201
        r = await ask(async_client, auth_headers, keyed_device, "balanced_power")
        assert r.status_code == 409

    async def test_cannot_fix_someone_elses_pc(self, async_client, other_auth_headers, keyed_device):
        r = await ask(async_client, other_auth_headers, keyed_device, "cool_down")
        assert r.status_code == 403
        assert await FixRequest.find_all().count() == 0

    async def test_needs_sign_in(self, async_client, keyed_device):
        r = await async_client.post(f"/api/v1/devices/{keyed_device.id}/fixes", json={"fix_id": "cool_down"})
        assert r.status_code == 401


class TestAgentRoundTrip:
    async def test_check_in_records_agent_status(self, async_client, auth_headers, keyed_device):
        r = await agent_next(async_client, version="0.2.0")
        assert r.status_code == 200 and r.json()["fix"] is None
        device = (await async_client.get(f"/api/v1/devices/{keyed_device.id}", headers=auth_headers)).json()
        assert device["agent_version"] == "0.2.0"
        assert device["agent_last_seen"] is not None

    async def test_run_report_and_undo(self, async_client, auth_headers, keyed_device):
        fix_id = (await ask(async_client, auth_headers, keyed_device, "cool_down")).json()["id"]

        taken = (await agent_next(async_client)).json()["fix"]
        assert taken["id"] == fix_id and taken["fix_id"] == "cool_down" and taken["undo"] is False
        assert taken["title"] == "Cool it down now" and "params" in taken
        assert (await agent_next(async_client)).json()["fix"] is None  # taken only once

        r = await async_client.post(
            f"/api/v1/agent/fixes/{fix_id}/result", headers=AGENT,
            json={"status": "succeeded", "message": "Done.", "undo_data": {"recorded": True}},
        )
        assert r.status_code == 200 and r.json()["status"] == "succeeded" and r.json()["can_undo"] is True

        undo = await async_client.post(f"/api/v1/fixes/{fix_id}/undo", headers=auth_headers)
        assert undo.status_code == 201
        assert undo.json()["is_undo"] is True and undo.json()["title"].startswith("Undo: ")
        undo_id = undo.json()["id"]

        taken = (await agent_next(async_client)).json()["fix"]
        assert taken["id"] == undo_id and taken["undo"] is True and taken["undo_of"] == fix_id
        assert "undo_data" not in taken  # the agent undoes from its own record only

        await async_client.post(f"/api/v1/agent/fixes/{undo_id}/result", headers=AGENT,
                                json={"status": "succeeded", "message": "Back to normal."})
        history = (await async_client.get(f"/api/v1/devices/{keyed_device.id}/fixes", headers=auth_headers)).json()
        original = next(h for h in history if h["id"] == fix_id)
        assert original["can_undo"] is False and original["undone"] is True
        assert (await async_client.post(f"/api/v1/fixes/{fix_id}/undo", headers=auth_headers)).status_code == 409

    async def test_declined_on_the_pc(self, async_client, auth_headers, keyed_device):
        fix_id = (await ask(async_client, auth_headers, keyed_device, "check_disk")).json()["id"]
        await agent_next(async_client)
        r = await async_client.post(f"/api/v1/agent/fixes/{fix_id}/result", headers=AGENT,
                                    json={"status": "declined", "message": "Not now."})
        assert r.json()["status"] == "declined" and r.json()["can_undo"] is False

    async def test_result_only_once(self, async_client, auth_headers, keyed_device):
        fix_id = (await ask(async_client, auth_headers, keyed_device, "clear_temp_files")).json()["id"]
        await agent_next(async_client)
        body = {"status": "succeeded", "message": "Done."}
        assert (await async_client.post(f"/api/v1/agent/fixes/{fix_id}/result", headers=AGENT, json=body)).status_code == 200
        assert (await async_client.post(f"/api/v1/agent/fixes/{fix_id}/result", headers=AGENT, json=body)).status_code == 409

    async def test_timed_fix_reverted_by_the_agent(self, async_client, auth_headers, keyed_device):
        fix_id = (await ask(async_client, auth_headers, keyed_device, "cool_down")).json()["id"]
        await agent_next(async_client)
        await async_client.post(f"/api/v1/agent/fixes/{fix_id}/result", headers=AGENT,
                                json={"status": "succeeded", "message": "Done.", "undo_data": {"recorded": True}})
        r = await async_client.post(f"/api/v1/agent/fixes/{fix_id}/reverted", headers=AGENT)
        assert r.json()["reverted_at"] is not None and r.json()["can_undo"] is False

    async def test_wrong_key(self, async_client, keyed_device):
        assert (await agent_next(async_client, key="not-a-real-key-0123456789")).status_code == 401

    async def test_agent_cannot_touch_another_pcs_fix(self, async_client, auth_headers, keyed_device, keyed_other_device):
        fix_id = (await ask(async_client, auth_headers, keyed_device, "cool_down")).json()["id"]
        assert (await agent_next(async_client, key=OTHER_KEY)).json()["fix"] is None
        r = await async_client.post(f"/api/v1/agent/fixes/{fix_id}/result", headers={"X-Device-Key": OTHER_KEY},
                                    json={"status": "succeeded", "message": "x"})
        assert r.status_code == 404


class TestLifecycle:
    async def test_cancel_before_the_pc_takes_it(self, async_client, auth_headers, keyed_device):
        fix_id = (await ask(async_client, auth_headers, keyed_device, "cool_down")).json()["id"]
        r = await async_client.post(f"/api/v1/fixes/{fix_id}/cancel", headers=auth_headers)
        assert r.json()["status"] == "cancelled"
        assert (await agent_next(async_client)).json()["fix"] is None

    async def test_cannot_cancel_once_started(self, async_client, auth_headers, keyed_device):
        fix_id = (await ask(async_client, auth_headers, keyed_device, "cool_down")).json()["id"]
        await agent_next(async_client)
        assert (await async_client.post(f"/api/v1/fixes/{fix_id}/cancel", headers=auth_headers)).status_code == 409

    async def test_unclaimed_fix_expires(self, async_client, auth_headers, keyed_device):
        fix_id = (await ask(async_client, auth_headers, keyed_device, "cool_down")).json()["id"]
        req = await FixRequest.get(fix_id)
        req.created_at = datetime.now(timezone.utc) - timedelta(minutes=31)
        await req.save()
        assert (await agent_next(async_client)).json()["fix"] is None
        assert (await FixRequest.get(fix_id)).status == FixStatus.EXPIRED

    async def test_other_users_cannot_see_history(self, async_client, auth_headers, other_auth_headers, keyed_device):
        await ask(async_client, auth_headers, keyed_device, "cool_down")
        r = await async_client.get(f"/api/v1/devices/{keyed_device.id}/fixes", headers=other_auth_headers)
        assert r.status_code == 403

    async def test_deleting_the_device_deletes_its_fixes(self, async_client, auth_headers, keyed_device):
        await ask(async_client, auth_headers, keyed_device, "cool_down")
        assert (await async_client.delete(f"/api/v1/devices/{keyed_device.id}", headers=auth_headers)).status_code == 204
        assert await FixRequest.find(FixRequest.device_id == keyed_device.id).count() == 0


class TestFixLevel:
    async def set_level(self, client, headers, level):
        r = await client.patch("/api/v1/auth/profile", json={"fix_level": level}, headers=headers)
        assert r.status_code == 200 and r.json()["fix_level"] == level

    async def test_default_is_standard(self, async_client, auth_headers):
        r = await async_client.get("/api/v1/auth/me", headers=auth_headers)
        assert r.json()["fix_level"] == "standard"

    async def test_suggest_only_blocks_fixes(self, async_client, auth_headers, keyed_device, heat_alert):
        await self.set_level(async_client, auth_headers, "suggest")
        r = await ask(async_client, auth_headers, keyed_device, "cool_down")
        assert r.status_code == 403 and "Settings" in r.json()["detail"]
        # Suggestions still come, so the user knows what to do.
        s = await async_client.get(f"/api/v1/devices/{keyed_device.id}/fixes/suggestions",
                                   params={"alert_id": str(heat_alert.id)}, headers=auth_headers)
        assert s.json()["fix_level"] == "suggest" and s.json()["options"]

    async def test_always_ask_needs_pc_approval_for_small_fixes(self, async_client, auth_headers, keyed_device, heat_alert):
        await self.set_level(async_client, auth_headers, "always_ask")
        r = await ask(async_client, auth_headers, keyed_device, "cool_down")
        assert r.json()["needs_pc_approval"] is True
        s = await async_client.get(f"/api/v1/devices/{keyed_device.id}/fixes/suggestions",
                                   params={"alert_id": str(heat_alert.id)}, headers=auth_headers)
        assert all(o["needs_pc_approval"] for o in s.json()["options"])

    async def test_unknown_level_rejected(self, async_client, auth_headers):
        r = await async_client.patch("/api/v1/auth/profile", json={"fix_level": "anything"}, headers=auth_headers)
        assert r.status_code == 422
