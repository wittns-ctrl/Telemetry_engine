"""The Windows agent is downloaded from the API itself, without signing in."""

import hashlib

import pytest

from app.core.config import settings


@pytest.mark.asyncio
async def test_info_says_unavailable_when_no_agent_is_published(async_client, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "AGENT_DOWNLOAD_PATH", str(tmp_path / "missing.exe"))

    info = await async_client.get("/api/v1/agent/download/info")
    assert info.status_code == 200
    assert info.json()["available"] is False

    download = await async_client.get("/api/v1/agent/download")
    assert download.status_code == 404


@pytest.mark.asyncio
async def test_published_agent_downloads_as_an_attachment(async_client, tmp_path, monkeypatch):
    exe = tmp_path / "lectio-agent.exe"
    content = b"MZ" + b"\x00" * 4096
    exe.write_bytes(content)
    monkeypatch.setattr(settings, "AGENT_DOWNLOAD_PATH", str(exe))

    info = (await async_client.get("/api/v1/agent/download/info")).json()
    assert info["available"] is True
    assert info["filename"] == "lectio-agent.exe"
    assert info["sha256"] == hashlib.sha256(content).hexdigest()

    response = await async_client.get("/api/v1/agent/download")
    assert response.status_code == 200
    assert response.content == content
    assert 'attachment; filename="lectio-agent.exe"' in response.headers["content-disposition"]
    assert response.headers["content-type"] == "application/vnd.microsoft.portable-executable"
