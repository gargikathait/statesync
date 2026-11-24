from __future__ import annotations

import re
from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

from statesync_api.core.config import Settings
from statesync_api.main import create_app
from tests.helpers import PRODUCTION, make_settings

BAD_DB = "postgresql://statesync:topsecretpw@127.0.0.1:1/nowhere"


def client_for(settings: Settings, *, raise_exceptions: bool = False) -> TestClient:
    return TestClient(create_app(settings), raise_server_exceptions=raise_exceptions)


@pytest.fixture
def client() -> Iterator[TestClient]:
    with client_for(make_settings()) as c:
        yield c


def test_health_is_ok_and_needs_no_database(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_request_id_is_generated_and_valid_ids_are_echoed(client: TestClient) -> None:
    generated = client.get("/api/v1/health").headers["x-request-id"]
    assert re.fullmatch(r"[0-9a-f]{32}", generated)
    echoed = client.get("/api/v1/health", headers={"X-Request-ID": "trace-12345678"})
    assert echoed.headers["x-request-id"] == "trace-12345678"


def test_unsafe_request_ids_are_replaced(client: TestClient) -> None:
    response = client.get("/api/v1/health", headers={"X-Request-ID": "bad id\r\nX-Evil: 1"})
    assert re.fullmatch(r"[0-9a-f]{32}", response.headers["x-request-id"])


def test_unknown_route_uses_the_error_envelope(client: TestClient) -> None:
    response = client.get("/api/v1/nope")
    assert response.status_code == 404
    error = response.json()["error"]
    assert error["code"] == "NOT_FOUND"
    assert error["request_id"] == response.headers["x-request-id"]
    assert error["details"] is None


def test_wrong_method_uses_the_error_envelope(client: TestClient) -> None:
    response = client.post("/api/v1/health")
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "METHOD_NOT_ALLOWED"


class Body(BaseModel):
    password: str = Field(min_length=12)


def test_validation_errors_do_not_echo_submitted_values() -> None:
    app = create_app(make_settings())

    @app.post("/api/v1/_probe")
    def probe(body: Body) -> dict[str, str]:  # pragma: no cover - never reached
        return {"ok": "yes"}

    with TestClient(app) as c:
        response = c.post("/api/v1/_probe", json={"password": "tiny-secret"})
    assert response.status_code == 422
    assert "tiny-secret" not in response.text
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["details"]["errors"][0]["loc"] == ["body", "password"]


def test_unexpected_errors_become_a_safe_500_with_headers() -> None:
    app = create_app(make_settings())

    @app.get("/api/v1/_boom")
    def boom() -> None:
        raise RuntimeError("connection string postgresql://u:hunter2@db leaked")

    with TestClient(app, raise_server_exceptions=False) as c:
        response = c.get("/api/v1/_boom")
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"
    assert "hunter2" not in response.text
    assert response.headers["x-request-id"]
    assert response.headers["x-content-type-options"] == "nosniff"


def test_security_headers_are_present(client: TestClient) -> None:
    headers = client.get("/api/v1/health").headers
    assert headers["cache-control"] == "no-store"
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["referrer-policy"] == "no-referrer"
    assert "frame-ancestors 'none'" in headers["content-security-policy"]
    assert "strict-transport-security" not in headers


def test_production_adds_hsts_and_hides_api_docs() -> None:
    with client_for(make_settings(**PRODUCTION)) as c:
        assert "max-age" in c.get("/api/v1/health").headers["strict-transport-security"]
        host = {"Host": "api.statesync.example"}  # production only answers to its own host
        assert c.get("/docs", headers=host).status_code == 404
        assert c.get("/openapi.json", headers=host).status_code == 404
        assert c.get("/docs").status_code == 400  # default test host is not allowed


def test_development_serves_openapi(client: TestClient) -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert "/api/v1/health" in response.json()["paths"]
    # Swagger UI needs to load assets, so /docs must not carry the strict CSP.
    assert "content-security-policy" not in client.get("/docs").headers


def test_ready_returns_503_without_leaking_connection_details() -> None:
    with client_for(make_settings(database_url=BAD_DB)) as c:
        response = c.get("/api/v1/ready")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "NOT_READY"
    for secret in ("topsecretpw", "127.0.0.1", "nowhere", "statesync:"):
        assert secret not in response.text


def test_app_factory_has_no_import_side_effects() -> None:
    app = create_app(make_settings())
    assert isinstance(app, FastAPI)
