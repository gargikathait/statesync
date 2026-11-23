from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session

from statesync_api.core.db import get_session
from statesync_api.main import create_app
from tests.helpers import make_settings


def test_server_is_postgresql_16_or_newer(engine: Engine) -> None:
    with engine.connect() as connection:
        version = int(connection.execute(text("SHOW server_version_num")).scalar_one())
    assert version >= 160000


def test_ready_reports_ok_against_a_real_database(database_url: str) -> None:
    with TestClient(create_app(make_settings(database_url=database_url))) as client:
        response = client.get("/api/v1/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready", "database": "ok"}


def test_database_errors_do_not_expose_bound_parameters(engine: Engine) -> None:
    with pytest.raises(ProgrammingError) as info, engine.connect() as connection:
        connection.execute(
            text("SELECT * FROM table_that_does_not_exist WHERE c = :v"), {"v": "hunter2-payload"}
        )
    assert "hunter2-payload" not in str(info.value)


@pytest.fixture
def scratch_table(engine: Engine) -> Iterator[str]:
    name = f"scratch_{uuid.uuid4().hex[:12]}"
    with engine.begin() as connection:
        connection.execute(text(f"CREATE TABLE {name} (v text NOT NULL)"))
    yield name
    with engine.begin() as connection:
        connection.execute(text(f"DROP TABLE IF EXISTS {name}"))


def _app_with_probe_routes(database_url: str, table: str) -> TestClient:
    app = create_app(make_settings(database_url=database_url))

    @app.post("/api/v1/_probe/commit")
    def commit(session: Session = Depends(get_session)) -> dict[str, str]:  # noqa: B008
        session.execute(text(f"INSERT INTO {table} (v) VALUES ('committed')"))
        session.commit()
        return {"ok": "yes"}

    @app.post("/api/v1/_probe/no-commit")
    def no_commit(session: Session = Depends(get_session)) -> dict[str, str]:  # noqa: B008
        session.execute(text(f"INSERT INTO {table} (v) VALUES ('forgotten')"))
        return {"ok": "yes"}

    @app.post("/api/v1/_probe/fail")
    def fail(session: Session = Depends(get_session)) -> None:  # noqa: B008
        session.execute(text(f"INSERT INTO {table} (v) VALUES ('partial')"))
        raise RuntimeError("boom")

    return TestClient(app, raise_server_exceptions=False)


def test_request_session_persists_only_what_is_committed(
    database_url: str, engine: Engine, scratch_table: str
) -> None:
    with _app_with_probe_routes(database_url, scratch_table) as client:
        assert client.post("/api/v1/_probe/commit").status_code == 200
        assert client.post("/api/v1/_probe/no-commit").status_code == 200
        assert client.post("/api/v1/_probe/fail").status_code == 500
    with engine.connect() as connection:
        rows = connection.execute(text(f"SELECT v FROM {scratch_table}")).scalars().all()
    assert rows == ["committed"]
