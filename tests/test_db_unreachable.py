"""A lost database connection answers 503, not a 500 with a traceback."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError

from app.main import database_unreachable


@pytest.fixture
def client():
    app = FastAPI()
    app.add_exception_handler(ConnectionFailure, database_unreachable)

    @app.get("/boom")
    async def boom():
        raise ServerSelectionTimeoutError("cluster0.example.mongodb.net:27017: [Errno 11001] getaddrinfo failed")

    return TestClient(app, raise_server_exceptions=False)


def test_unreachable_database_is_a_503(client):
    res = client.get("/boom")
    assert res.status_code == 503
    assert res.headers["retry-after"] == "15"
    assert "database" in res.json()["detail"]


def test_main_app_registers_the_handler():
    from app.main import app
    assert app.exception_handlers.get(ConnectionFailure) is database_unreachable
