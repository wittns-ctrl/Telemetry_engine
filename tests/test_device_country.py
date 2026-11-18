"""Device country: validation, registration, PATCH /devices/{id} and the countries list."""

import pytest
from pydantic import ValidationError

from app.core.countries import COUNTRIES, canonical_country
from app.models.telemetry import Device
from app.schemas.api import DeviceRegisterRequest, DeviceUpdateRequest


class TestCanonicalCountry:
    def test_matches_case_insensitively_and_returns_map_spelling(self):
        assert canonical_country("rwanda") == "Rwanda"
        assert canonical_country("  united   KINGDOM ") == "United Kingdom"
        assert canonical_country("dem. rep. congo") == "Dem. Rep. Congo"

    def test_blank_is_none(self):
        assert canonical_country(None) is None
        assert canonical_country("   ") is None

    def test_unknown_name_is_rejected(self):
        with pytest.raises(ValueError):
            canonical_country("Atlantis")

    def test_list_matches_the_map_data(self):
        assert len(COUNTRIES) == 177
        assert "Rwanda" in COUNTRIES and "United States of America" in COUNTRIES

    def test_schemas_validate_country(self):
        assert DeviceUpdateRequest(country="kenya").country == "Kenya"
        with pytest.raises(ValidationError):
            DeviceRegisterRequest(device_name="PC", system_uuid="uuid-12345", country="Atlantis")


class TestCountryEndpoints:
    async def test_countries_list(self, async_client, auth_headers, mock_mongo_client):
        r = await async_client.get("/api/v1/devices/countries", headers=auth_headers)
        assert r.status_code == 200
        assert r.json() == list(COUNTRIES)

    async def test_register_with_country(self, async_client, auth_headers):
        r = await async_client.post(
            "/api/v1/devices/register",
            json={"device_name": "Office PC", "system_uuid": "uuid-country-1", "country": "germany"},
            headers=auth_headers,
        )
        assert r.status_code == 201
        assert r.json()["device"]["country"] == "Germany"

    async def test_reregister_without_country_keeps_it(self, async_client, auth_headers):
        body = {"device_name": "Office PC", "system_uuid": "uuid-country-2", "country": "Kenya"}
        await async_client.post("/api/v1/devices/register", json=body, headers=auth_headers)
        body.pop("country")
        r = await async_client.post("/api/v1/devices/register", json=body, headers=auth_headers)
        assert r.json()["device"]["country"] == "Kenya"

    async def test_patch_sets_and_clears_country(self, async_client, auth_headers, test_device):
        url = f"/api/v1/devices/{test_device.id}"
        r = await async_client.patch(url, json={"country": "rwanda"}, headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["country"] == "Rwanda"
        assert (await Device.get(test_device.id)).country == "Rwanda"

        listed = (await async_client.get("/api/v1/devices", headers=auth_headers)).json()
        assert listed["devices"][0]["country"] == "Rwanda"

        # Renaming alone leaves the country alone.
        r = await async_client.patch(url, json={"device_name": "Lab PC"}, headers=auth_headers)
        assert r.json()["device_name"] == "Lab PC" and r.json()["country"] == "Rwanda"

        r = await async_client.patch(url, json={"country": None}, headers=auth_headers)
        assert r.json()["country"] is None

    async def test_patch_rejects_unknown_country(self, async_client, auth_headers, test_device):
        r = await async_client.patch(
            f"/api/v1/devices/{test_device.id}", json={"country": "Atlantis"}, headers=auth_headers
        )
        assert r.status_code == 422

    async def test_patch_rejects_blank_name(self, async_client, auth_headers, test_device):
        r = await async_client.patch(
            f"/api/v1/devices/{test_device.id}", json={"device_name": "   "}, headers=auth_headers
        )
        assert r.status_code == 422

    async def test_cannot_patch_another_users_device(self, async_client, auth_headers, other_device):
        r = await async_client.patch(
            f"/api/v1/devices/{other_device.id}", json={"country": "Kenya"}, headers=auth_headers
        )
        assert r.status_code == 403
        assert (await Device.get(other_device.id)).country is None

    async def test_patch_needs_auth(self, async_client, test_device):
        r = await async_client.patch(f"/api/v1/devices/{test_device.id}", json={"country": "Kenya"})
        assert r.status_code == 401
