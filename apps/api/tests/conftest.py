from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError

from statesync_api.core.config import Settings, normalise_database_url
from tests.helpers import is_safe_test_database_name

_SETTINGS_ENV = [name.upper() for name in Settings.model_fields]


@pytest.fixture(autouse=True)
def _clean_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """A developer's shell must never leak configuration into tests."""
    for name in _SETTINGS_ENV:
        monkeypatch.delenv(name, raising=False)


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    integration_dir = Path(__file__).parent / "integration"
    for item in items:
        if integration_dir in Path(str(item.fspath)).parents:
            item.add_marker(pytest.mark.integration)


def _ensure_database(url: str) -> None:
    parsed = make_url(url)
    name = parsed.database or ""
    if not is_safe_test_database_name(name):
        pytest.fail(
            f"Refusing to run integration tests against database {name!r}: "
            "its name must end in '_test' so real data is never touched."
        )
    try:
        with create_engine(url).connect():
            return
    except OperationalError:
        pass
    admin = create_engine(parsed.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as connection:
            connection.execute(text(f'CREATE DATABASE "{name}"'))
    except OperationalError as exc:
        pytest.fail(
            f"Cannot reach PostgreSQL at {parsed.host}:{parsed.port} to prepare {name!r} "
            f"({type(exc.orig).__name__}). Start the database and set TEST_DATABASE_URL."
        )
    finally:
        admin.dispose()


@pytest.fixture(scope="session")
def database_url() -> str:
    raw = os.environ.get("TEST_DATABASE_URL")
    if not raw:
        pytest.fail(
            "TEST_DATABASE_URL is not set. Integration tests need a real PostgreSQL "
            "(e.g. postgresql://statesync:statesync_dev@localhost:5432/statesync_test). "
            "Run only unit tests with: pytest -m 'not integration'"
        )
    url = normalise_database_url(raw)
    _ensure_database(url)
    return url


@pytest.fixture(scope="session")
def engine(database_url: str) -> Iterator[Engine]:
    eng = create_engine(database_url, hide_parameters=True)
    yield eng
    eng.dispose()
