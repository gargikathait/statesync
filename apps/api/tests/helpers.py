from __future__ import annotations

from typing import Any

from statesync_api.core.config import Settings

UNIT_DB_URL = "postgresql://statesync:unit-test-pw@localhost:5432/statesync_unit_unused"

PRODUCTION: dict[str, Any] = {
    "environment": "production",
    "database_url": "postgresql://u:p@db.example/app?sslmode=require",
    "secret_key": "k" * 40,
    "cookie_name": "__Host-statesync_session",
    "cookie_secure": True,
    "allowed_origins": ["https://statesync.example"],
}


def make_settings(**overrides: Any) -> Settings:
    """Build settings from explicit values only (never from a developer's .env)."""
    values: dict[str, Any] = {"environment": "test", "database_url": UNIT_DB_URL}
    values.update(overrides)
    if values["environment"] != "production":
        values.setdefault("allow_missing_origin", True)  # lets non-browser test clients omit Origin
    return Settings(_env_file=None, **values)
