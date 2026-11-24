from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from statesync_api.main import create_app
from tests.helpers import PRODUCTION, make_settings

EVIL = {"Host": "evil.example"}


def client(**overrides: object) -> TestClient:
    return TestClient(create_app(make_settings(**overrides)), raise_server_exceptions=False)


def test_development_defaults_accept_local_hosts_with_or_without_port() -> None:
    with client() as c:
        for host in ("localhost", "localhost:8000", "127.0.0.1:8000", "testserver", "LOCALHOST"):
            assert c.get("/api/v1/nope", headers={"Host": host}).status_code == 404, host


def test_unknown_host_is_rejected_with_the_error_envelope() -> None:
    with client() as c:
        response = c.get("/api/v1/nope", headers=EVIL)
    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "INVALID_HOST"
    assert error["request_id"] == response.headers["x-request-id"]
    assert "evil.example" not in response.text  # never reflect the attacker's value


@pytest.mark.parametrize(
    "host",
    [
        "evil.example",
        "localhost.evil.example",
        "evil.example:80",
        "localhost@evil.example",
        "a b",
        "",
    ],
)
def test_malformed_or_lookalike_hosts_are_rejected(host: str) -> None:
    with client() as c:
        assert c.get("/api/v1/nope", headers={"Host": host}).status_code == 400


def test_data_endpoints_are_checked_but_liveness_is_exempt() -> None:
    with client() as c:
        assert c.get("/api/v1/ready", headers=EVIL).status_code == 400
        health = c.get("/api/v1/health", headers=EVIL)
    assert health.status_code == 200
    assert health.json() == {"status": "ok"}


def test_configured_hosts_replace_the_defaults() -> None:
    with client(allowed_hosts=["api.statesync.example"]) as c:
        assert c.get("/api/v1/nope", headers={"Host": "api.statesync.example"}).status_code == 404
        assert c.get("/api/v1/nope", headers={"Host": "localhost"}).status_code == 400


def test_comma_separated_environment_value_is_parsed(monkeypatch: pytest.MonkeyPatch) -> None:
    from statesync_api.core.config import Settings

    monkeypatch.setenv("ALLOWED_HOSTS", " API.Example.com , other.example ")
    settings = Settings(_env_file=None, database_url="postgresql://u:p@h/db_x")
    assert settings.allowed_hosts == ["api.example.com", "other.example"]


@pytest.mark.parametrize(
    "bad",
    [
        "*",
        "https://api.example.com",
        "api.example.com:8000",
        "api.example.com/path",
        "a_b.example",
        "-x.example",
    ],
)
def test_invalid_host_entries_fail_fast(bad: str) -> None:
    with pytest.raises(ValidationError):
        make_settings(allowed_hosts=[bad])


def test_production_requires_allowed_hosts() -> None:
    missing = {k: v for k, v in PRODUCTION.items() if k != "allowed_hosts"}
    with pytest.raises(ValidationError) as excinfo:
        make_settings(**missing)
    assert "ALLOWED_HOSTS" in str(excinfo.value)
    with pytest.raises(ValidationError):
        make_settings(**{**PRODUCTION, "allowed_hosts": []})
    assert make_settings(**PRODUCTION).effective_allowed_hosts == ["api.statesync.example"]
