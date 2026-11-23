from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[2]


def alembic(database_url: str, *args: str) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "DATABASE_URL": database_url}
    env.pop("DATABASE_URL_DIRECT", None)
    return subprocess.run(  # noqa: S603
        [sys.executable, "-m", "alembic", *args],
        cwd=API_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )


def test_upgrade_head_runs_on_the_test_database(database_url: str) -> None:
    result = alembic(database_url, "upgrade", "head")
    assert result.returncode == 0, result.stderr


def test_upgrade_is_idempotent(database_url: str) -> None:
    assert alembic(database_url, "upgrade", "head").returncode == 0
    assert alembic(database_url, "upgrade", "head").returncode == 0


def test_downgrade_to_base_then_upgrade_round_trips(database_url: str) -> None:
    assert alembic(database_url, "upgrade", "head").returncode == 0
    assert alembic(database_url, "downgrade", "base").returncode == 0
    assert alembic(database_url, "upgrade", "head").returncode == 0


def test_a_missing_database_url_fails_loudly() -> None:
    env = {k: v for k, v in os.environ.items() if not k.startswith("DATABASE_URL")}
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=API_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    assert result.returncode != 0
    assert "DATABASE_URL" in result.stderr
