"""Gzip-compressed request bodies (the agent compresses uploads of 1 KB or more)."""

import gzip
import json

import httpx
import pytest
from fastapi import FastAPI, Request

from app.core.gzip_request import GzipRequestMiddleware


def _app(max_size: int = 1024 * 1024) -> FastAPI:
    app = FastAPI()

    @app.post("/echo")
    async def echo(request: Request):
        data = await request.json()
        return {"got": data, "length": request.headers.get("content-length"),
                "encoding": request.headers.get("content-encoding")}

    app.add_middleware(GzipRequestMiddleware, max_size=max_size)
    return app


async def _post(app, content: bytes, headers: dict):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        return await client.post("/echo", content=content, headers={"Content-Type": "application/json", **headers})


@pytest.mark.asyncio
async def test_a_compressed_body_reaches_the_route_unpacked():
    payload = {"readings": [{"cpu": i} for i in range(200)]}
    raw = json.dumps(payload).encode()
    r = await _post(_app(), gzip.compress(raw), {"Content-Encoding": "gzip"})
    assert r.status_code == 200
    body = r.json()
    assert body["got"] == payload
    assert body["length"] == str(len(raw))
    assert body["encoding"] is None


@pytest.mark.asyncio
async def test_plain_bodies_are_untouched():
    r = await _post(_app(), b'{"a": 1}', {})
    assert r.status_code == 200 and r.json()["got"] == {"a": 1}


@pytest.mark.asyncio
async def test_a_broken_gzip_body_is_400():
    r = await _post(_app(), b"this is not gzip", {"Content-Encoding": "gzip"})
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_a_zip_bomb_is_refused_with_413():
    bomb = gzip.compress(b"0" * (5 * 1024 * 1024))  # ~5 KB packed, 5 MB unpacked
    assert len(bomb) < 20_000
    r = await _post(_app(max_size=1024 * 1024), bomb, {"Content-Encoding": "gzip"})
    assert r.status_code == 413


@pytest.mark.asyncio
async def test_the_real_app_accepts_compressed_requests():
    from app.main import app
    assert any(m.cls is GzipRequestMiddleware for m in app.user_middleware)
