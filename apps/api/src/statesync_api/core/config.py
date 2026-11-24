"""Application settings with fail-fast validation.

Production rules are enforced here so a misconfigured deployment refuses to
start instead of running with weak cookies or secrets.
"""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

DEV_SECRET_PLACEHOLDER = "dev-only-insecure-secret-key-change-me-0123456789"  # noqa: S105
HOST_PREFIX = "__Host-"
_COOKIE_NAME_RE = re.compile(r"^[A-Za-z0-9_-]+$")
_HOSTNAME_RE = re.compile(
    r"^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$"
)
DEFAULT_DEV_HOSTS = ("localhost", "127.0.0.1", "testserver")  # testserver: Starlette TestClient

Environment = Literal["development", "test", "production"]


def normalise_database_url(url: str) -> str:
    """Return a psycopg 3 SQLAlchemy URL, rejecting anything that is not PostgreSQL."""
    value = url.strip()
    if value.startswith("postgres://"):
        value = "postgresql://" + value.removeprefix("postgres://")
    if value.startswith("postgresql://"):
        return "postgresql+psycopg://" + value.removeprefix("postgresql://")
    if value.startswith("postgresql+psycopg://"):
        return value
    raise ValueError(
        "DATABASE_URL must be a PostgreSQL URL (postgresql://...). "
        "SQLite and other databases are not supported."
    )


def _validate_origin(origin: str) -> str:
    parts = urlsplit(origin)
    exact = f"{parts.scheme}://{parts.netloc}"
    if (
        origin == "*"
        or parts.scheme not in {"http", "https"}
        or not parts.netloc
        or origin != exact
    ):
        raise ValueError(
            f"Invalid origin {origin!r}: use an exact origin such as https://app.example "
            "(no wildcard, path or trailing slash)."
        )
    return origin


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
        hide_input_in_errors=True,  # never echo secrets or URLs in validation errors
    )

    environment: Environment = "development"
    database_url: SecretStr
    database_url_direct: SecretStr | None = None
    secret_key: SecretStr = SecretStr(DEV_SECRET_PLACEHOLDER)

    cookie_name: str = "statesync_session"
    cookie_secure: bool = False
    cookie_domain: str | None = None
    allowed_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )
    allow_missing_origin: bool = False
    # Hostnames (no scheme, no port) this API answers to. Optional in development/test,
    # required in production. Wildcards are not supported on purpose.
    allowed_hosts: Annotated[list[str] | None, NoDecode] = None
    trusted_proxy_count: int = Field(default=0, ge=0, le=5)

    max_payload_bytes: int = Field(default=512 * 1024, ge=1024)
    db_pool_size: int = Field(default=5, ge=1, le=50)
    db_max_overflow: int = Field(default=5, ge=0, le=50)
    db_connect_timeout_seconds: int = Field(default=5, ge=1, le=60)
    log_level: str = "INFO"

    @field_validator("database_url", "database_url_direct", mode="after")
    @classmethod
    def _postgres_only(cls, value: SecretStr | None) -> SecretStr | None:
        if value is None:
            return None
        return SecretStr(normalise_database_url(value.get_secret_value()))

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("allowed_origins", mode="after")
    @classmethod
    def _exact_origins(cls, value: list[str]) -> list[str]:
        return [_validate_origin(origin) for origin in value]

    @field_validator("allowed_hosts", mode="before")
    @classmethod
    def _split_hosts(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("allowed_hosts", mode="after")
    @classmethod
    def _exact_hosts(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        cleaned = [host.lower() for host in value]
        for host in cleaned:
            if not _HOSTNAME_RE.fullmatch(host):
                raise ValueError(
                    f"Invalid host {host!r}: use a bare hostname such as api.example.com "
                    "(no scheme, port, path or wildcard)."
                )
        return cleaned

    @field_validator("cookie_name")
    @classmethod
    def _cookie_token(cls, value: str) -> str:
        if not _COOKIE_NAME_RE.fullmatch(value):
            raise ValueError("COOKIE_NAME may only contain letters, digits, '_' and '-'.")
        return value

    @model_validator(mode="after")
    def _cookie_and_production_rules(self) -> Settings:
        problems: list[str] = []

        # Browsers silently drop __Host- cookies that break these rules, in any environment.
        if self.cookie_name.startswith(HOST_PREFIX):
            if not self.cookie_secure:
                problems.append("a __Host- cookie requires COOKIE_SECURE=true")
            if self.cookie_domain is not None:
                problems.append("a __Host- cookie must not set COOKIE_DOMAIN")

        if self.environment == "production":
            secret = self.secret_key.get_secret_value()
            if len(secret) < 32 or secret == DEV_SECRET_PLACEHOLDER:
                problems.append(
                    "SECRET_KEY must be a unique random value of at least 32 characters"
                )
            if not self.cookie_name.startswith(HOST_PREFIX):
                problems.append("COOKIE_NAME must start with __Host- in production")
            if not self.cookie_secure:
                problems.append("COOKIE_SECURE must be true in production")
            if self.cookie_domain is not None:
                problems.append("COOKIE_DOMAIN must not be set in production")
            if not self.allowed_origins:
                problems.append("ALLOWED_ORIGINS must list at least one https origin")
            if any(not origin.startswith("https://") for origin in self.allowed_origins):
                problems.append("every ALLOWED_ORIGINS entry must be https in production")
            if self.allow_missing_origin:
                problems.append("ALLOW_MISSING_ORIGIN must be false in production")
            if not self.allowed_hosts:
                problems.append(
                    "ALLOWED_HOSTS must list the API's public host name(s) in production"
                )

        if problems:
            raise ValueError("Invalid configuration: " + "; ".join(problems))
        return self

    @property
    def effective_allowed_hosts(self) -> list[str]:
        return list(self.allowed_hosts) if self.allowed_hosts else list(DEFAULT_DEV_HOSTS)

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # values come from the environment
