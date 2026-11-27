"""PC location: off until the owner switches it on; owner-only; forgotten when switched off."""

from datetime import datetime, timezone

import pytest

from app.core.security import hash_token
from app.models.location import LocationHistory
from app.models.telemetry import Device

KEY = "location-device-key-0123456789abcdef"
AGENT = {"X-Device-Key": KEY}
URL = "/api/v1/agent/location"


@pytest.fixture
async def keyed_device(test_device):
    test_device.ingest_key_hash = hash_token(KEY)
    await test_device.save()
    return test_device


def ok(lat=-1.95, lon=30.06, acc=69.0):
    return {"status": "ok", "latitude": lat, "longitude": lon, "accuracy_m": acc, "source": "windows",
            "measured_at": datetime.now(timezone.utc).isoformat()}


async def switch(client, device, on: bool):
    r = await client.patch(f"/api/v1/devices/{device.id}", json={"location_enabled": on})
    assert r.status_code == 200
    return r.json()


async def test_off_by_default_and_nothing_is_kept(async_client, keyed_device):
    assert (await async_client.get(URL, headers=AGENT)).json()["wanted"] is False
    r = await async_client.post(URL, headers=AGENT, json=ok())
    assert r.json() == {"stored": False}
    assert (await Device.get(keyed_device.id)).location is None
    assert await LocationHistory.find(LocationHistory.device_id == keyed_device.id).count() == 0


async def test_switched_on_the_position_is_stored_and_shown_to_the_owner(authenticated_client, keyed_device):
    await switch(authenticated_client, keyed_device, True)
    assert (await authenticated_client.get(URL, headers=AGENT)).json()["wanted"] is True
    r = await authenticated_client.post(URL, headers=AGENT, json=ok())
    assert r.json() == {"stored": True}

    shown = (await authenticated_client.get(f"/api/v1/devices/{keyed_device.id}")).json()
    assert shown["location_enabled"] is True
    assert shown["location"]["status"] == "ok"
    assert shown["location"]["latitude"] == -1.95 and shown["location"]["accuracy_m"] == 69.0
    assert await LocationHistory.find(LocationHistory.device_id == keyed_device.id).count() == 1


async def test_another_account_cant_see_it(authenticated_client, other_auth_headers, keyed_device):
    await switch(authenticated_client, keyed_device, True)
    await authenticated_client.post(URL, headers=AGENT, json=ok())
    r = await authenticated_client.get(f"/api/v1/devices/{keyed_device.id}", headers=other_auth_headers)
    assert r.status_code in (403, 404)
    listed = (await authenticated_client.get("/api/v1/devices", headers=other_auth_headers)).json()["devices"]
    assert all(d["id"] != str(keyed_device.id) for d in listed)


async def test_switching_off_forgets_the_position_and_history(authenticated_client, keyed_device):
    await switch(authenticated_client, keyed_device, True)
    await authenticated_client.post(URL, headers=AGENT, json=ok())
    await authenticated_client.post(URL, headers=AGENT, json=ok(lat=-1.96))
    shown = await switch(authenticated_client, keyed_device, False)
    assert shown["location"] is None
    assert await LocationHistory.find(LocationHistory.device_id == keyed_device.id).count() == 0


async def test_windows_location_off_is_shown_without_a_position(authenticated_client, keyed_device):
    await switch(authenticated_client, keyed_device, True)
    report = {"status": "off", "latitude": 1.0, "longitude": 1.0, "source": "windows",
              "measured_at": datetime.now(timezone.utc).isoformat()}
    await authenticated_client.post(URL, headers=AGENT, json=report)
    loc = (await authenticated_client.get(f"/api/v1/devices/{keyed_device.id}")).json()["location"]
    assert loc["status"] == "off" and loc["latitude"] is None
    assert await LocationHistory.find(LocationHistory.device_id == keyed_device.id).count() == 0


@pytest.mark.parametrize("bad", [
    {"status": "ok", "latitude": 95, "longitude": 10},
    {"status": "ok", "latitude": None, "longitude": 10},
    {"status": "somewhere"},
])
async def test_impossible_reports_are_refused(authenticated_client, keyed_device, bad):
    await switch(authenticated_client, keyed_device, True)
    r = await authenticated_client.post(URL, headers=AGENT, json={
        "source": "windows", "measured_at": datetime.now(timezone.utc).isoformat(), **bad})
    assert r.status_code == 422


async def test_needs_a_device_key(async_client, keyed_device):
    assert (await async_client.get(URL, headers={"X-Device-Key": "wrong-key-0123456789abcdefghij"})).status_code == 401


# ------------------------------------------------- estimate from the internet address

from app.services import ip_location  # noqa: E402


def off(status="off"):
    return {"status": status, "source": "windows", "measured_at": datetime.now(timezone.utc).isoformat()}


async def test_without_windows_location_the_address_gives_an_approximate_position(
        authenticated_client, keyed_device, monkeypatch):
    seen = []

    def fake_lookup(address):
        seen.append(address)
        return ip_location.IPPlace(latitude=-1.94, longitude=30.06, city="Kigali", country="Rwanda")
    monkeypatch.setattr(ip_location, "lookup", fake_lookup)
    await switch(authenticated_client, keyed_device, True)
    await authenticated_client.post(URL, headers=AGENT, json=off())

    loc = (await authenticated_client.get(f"/api/v1/devices/{keyed_device.id}")).json()["location"]
    assert loc["status"] == "approximate" and loc["source"] == "ip"
    assert loc["city"] == "Kigali" and loc["country"] == "Rwanda" and loc["windows_status"] == "off"
    assert loc["accuracy_m"] == ip_location.APPROXIMATE_M
    assert seen  # the PC's own connection address was looked up
    assert await LocationHistory.find(LocationHistory.device_id == keyed_device.id).count() == 1


async def test_no_estimate_means_no_position(authenticated_client, keyed_device, monkeypatch):
    monkeypatch.setattr(ip_location, "lookup", lambda address: None)
    await switch(authenticated_client, keyed_device, True)
    await authenticated_client.post(URL, headers=AGENT, json=off("unavailable"))
    loc = (await authenticated_client.get(f"/api/v1/devices/{keyed_device.id}")).json()["location"]
    assert loc["status"] == "unavailable" and loc["latitude"] is None


async def test_windows_location_wins_over_the_estimate(authenticated_client, keyed_device, monkeypatch):
    monkeypatch.setattr(ip_location, "lookup", lambda address: pytest.fail("looked up despite an exact position"))
    await switch(authenticated_client, keyed_device, True)
    await authenticated_client.post(URL, headers=AGENT, json=ok())
    loc = (await authenticated_client.get(f"/api/v1/devices/{keyed_device.id}")).json()["location"]
    assert loc["status"] == "ok" and loc["source"] == "windows"


async def test_no_estimate_while_switched_off(async_client, keyed_device, monkeypatch):
    monkeypatch.setattr(ip_location, "lookup", lambda address: pytest.fail("looked up while switched off"))
    assert (await async_client.post(URL, headers=AGENT, json=off())).json() == {"stored": False}


def test_private_and_bad_addresses_are_never_looked_up(monkeypatch):
    monkeypatch.setattr(ip_location, "_open", lambda: pytest.fail("opened the database for a private address"))
    for address in ("192.168.1.10", "10.0.0.5", "127.0.0.1", "::1", "not-an-ip", "", None):
        assert ip_location.lookup(address) is None


def test_country_names_follow_the_map():
    assert ip_location.map_country("United States") == "United States of America"
    assert ip_location.map_country("Rwanda") == "Rwanda"
    assert ip_location.map_country("Atlantis") is None


def test_a_missing_database_just_means_no_estimate(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "IP_LOCATION_DB", "does/not/exist.mmdb")
    ip_location.reset_for_tests()
    try:
        assert ip_location.lookup("8.8.8.8") is None
    finally:
        ip_location.reset_for_tests()
