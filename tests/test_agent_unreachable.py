"""When the agent can't reach its server it says why in plain words, before asking for a password."""

import httpx
import pytest

from agent.telemetry_agent import register, unreachable_message


def test_unknown_server_name_says_the_address_is_wrong():
    error = httpx.ConnectError("[Errno 11001] getaddrinfo failed")
    text = unreachable_message("https://your-api-address", error)
    assert "No server called 'your-api-address' exists" in text
    assert "Download the agent again" in text


def test_refused_connection_points_at_the_internet_or_server():
    error = httpx.ConnectError("[WinError 10061] No connection could be made")
    text = unreachable_message("https://api.lectio.app", error)
    assert "couldn't connect" in text
    assert "internet connection" in text


def test_timeout_says_the_server_did_not_answer():
    text = unreachable_message("https://api.lectio.app", httpx.ConnectTimeout("timed out"))
    assert "didn't answer in time" in text


@pytest.mark.asyncio
async def test_no_password_is_asked_when_the_server_is_unreachable(monkeypatch):
    asked = []
    monkeypatch.setattr("builtins.input", lambda *a: asked.append("input") or "")
    monkeypatch.setattr("getpass.getpass", lambda *a: asked.append("password") or "")

    def refuse(request):
        raise httpx.ConnectError("[Errno 11001] getaddrinfo failed", request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(refuse)) as client:
        with pytest.raises(httpx.ConnectError):
            await register(client, "https://your-api-address", {}, "Test PC")
    assert asked == []
