from __future__ import annotations

from typing import Any

import pytest
from pydantic import ValidationError

from statesync_api.core.config import DEV_SECRET_PLACEHOLDER, Settings, normalise_database_url
from tests.helpers import PRODUCTION, make_settings


def production(**overrides: Any) -> Settings:
    return make_settings(**{**PRODUCTION, **overrides})


def test_development_defaults_are_valid() -> None:
    s = make_settings(environment="development")
    assert s.cookie_name == "statesync_session"
    assert s.cookie_secure is False
    assert s.allowed_origins == ["http://localhost:3000"]
    assert not s.is_production


def test_valid_production_configuration_is_accepted() -> None:
    s = production()
    assert s.is_production
    assert s.cookie_name.startswith("__Host-")


@pytest.mark.parametrize(
    ("override", "expected"),
    [
        ({"secret_key": "short"}, "SECRET_KEY"),
        ({"secret_key": DEV_SECRET_PLACEHOLDER}, "SECRET_KEY"),
        ({"cookie_name": "statesync_session"}, "__Host-"),
        ({"cookie_secure": False}, "COOKIE_SECURE"),
        ({"cookie_domain": "statesync.example"}, "COOKIE_DOMAIN"),
        ({"allowed_origins": ["http://statesync.example"]}, "https"),
        ({"allowed_origins": []}, "ALLOWED_ORIGINS"),
        ({"allow_missing_origin": True}, "ALLOW_MISSING_ORIGIN"),
    ],
)
def test_production_refuses_unsafe_settings(override: dict[str, Any], expected: str) -> None:
    with pytest.raises(ValidationError) as info:
        production(**override)
    assert expected in str(info.value)


@pytest.mark.parametrize("environment", ["development", "test", "production"])
def test_host_prefix_cookie_requires_secure_and_no_domain_in_every_environment(
    environment: str,
) -> None:
    base: dict[str, Any] = {**PRODUCTION, "environment": environment}
    with pytest.raises(ValidationError, match="COOKIE_SECURE"):
        make_settings(**{**base, "cookie_secure": False})
    with pytest.raises(ValidationError, match="COOKIE_DOMAIN"):
        make_settings(**{**base, "cookie_domain": "example.com"})


def test_cookie_name_must_be_a_valid_token() -> None:
    with pytest.raises(ValidationError):
        make_settings(cookie_name="bad name;")


@pytest.mark.parametrize(
    "url",
    [
        "postgres://u:p@h/db",
        "postgresql://u:p@h/db",
        "postgresql+psycopg://u:p@h/db",
    ],
)
def test_database_url_is_normalised_to_psycopg3(url: str) -> None:
    assert normalise_database_url(url) == "postgresql+psycopg://u:p@h/db"


@pytest.mark.parametrize(
    "url",
    ["sqlite:///./x.db", "sqlite://", "mysql://u:p@h/db", "postgresql+asyncpg://u:p@h/db", ""],
)
def test_non_postgres_database_urls_are_rejected(url: str) -> None:
    with pytest.raises(ValueError, match="PostgreSQL"):
        normalise_database_url(url)
    with pytest.raises(ValidationError):
        make_settings(database_url=url)


def test_origins_parse_from_comma_separated_environment_value(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://a.example, https://b.example:8443")
    s = Settings(_env_file=None, database_url=PRODUCTION["database_url"])
    assert s.allowed_origins == ["https://a.example", "https://b.example:8443"]


@pytest.mark.parametrize(
    "origin",
    [
        "*",
        "https://a.example/",
        "https://a.example/app",
        "ftp://a.example",
        "a.example",
        "https://",
    ],
)
def test_origins_must_be_exact(origin: str) -> None:
    with pytest.raises(ValidationError):
        make_settings(allowed_origins=[origin])


def test_validation_errors_never_echo_secrets() -> None:
    with pytest.raises(ValidationError) as info:
        make_settings(
            **{
                **PRODUCTION,
                "database_url": "postgresql://user:S3cr3tPassw0rd@db.example/app",
                "secret_key": "TopSecretValue",
            }
        )
    text = str(info.value)
    assert "S3cr3tPassw0rd" not in text
    assert "TopSecretValue" not in text


def test_trusted_proxy_count_is_bounded() -> None:
    assert make_settings(trusted_proxy_count=2).trusted_proxy_count == 2
    with pytest.raises(ValidationError):
        make_settings(trusted_proxy_count=-1)
    with pytest.raises(ValidationError):
        make_settings(trusted_proxy_count=50)
