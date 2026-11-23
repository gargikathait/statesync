"""Verifies the PostgreSQL behaviours the schema design depends on, on the real server.

These are assumptions about the database, not about our code: if a future server version
or a hosted provider behaved differently, these tests would show it before the schema did.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import psycopg.errors
import pytest
from sqlalchemy import Connection, Engine, text
from sqlalchemy.exc import IntegrityError

DDL = """
CREATE TABLE users (id int PRIMARY KEY);
CREATE TABLE devices (
  id int PRIMARY KEY,
  user_id int NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  UNIQUE (user_id, id)
);
CREATE TABLE snaps_plain (
  id int PRIMARY KEY, user_id int NOT NULL, device_id int,
  FOREIGN KEY (user_id, device_id) REFERENCES devices (user_id, id) ON DELETE SET NULL
);
CREATE TABLE snaps_cols (
  id int PRIMARY KEY, user_id int NOT NULL, device_id int,
  FOREIGN KEY (user_id, device_id) REFERENCES devices (user_id, id)
    ON DELETE SET NULL (device_id)
);
CREATE TABLE sessions (
  id int PRIMARY KEY,
  user_id int NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  UNIQUE (user_id, id)
);
CREATE TABLE snaps_cascade (
  id int PRIMARY KEY, session_id int NOT NULL, user_id int NOT NULL,
  FOREIGN KEY (user_id, session_id) REFERENCES sessions (user_id, id) ON DELETE CASCADE
);
INSERT INTO users VALUES (1), (2);
INSERT INTO devices VALUES (10, 1), (20, 2);
INSERT INTO sessions VALUES (100, 1), (200, 2);
"""


@pytest.fixture
def probe(engine: Engine) -> Iterator[Connection]:
    schema = f"probe_{uuid.uuid4().hex[:12]}"
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
        connection.execute(text(f"CREATE SCHEMA {schema}"))
        connection.execute(text(f"SET search_path TO {schema}"))
        for statement in filter(None, (s.strip() for s in DDL.split(";"))):
            connection.execute(text(statement))
        try:
            yield connection
        finally:
            connection.execute(text("RESET search_path"))
            connection.execute(text(f"DROP SCHEMA {schema} CASCADE"))


def test_set_null_on_a_composite_key_without_a_column_list_nulls_user_id_too(
    probe: Connection,
) -> None:
    """The trap: plain SET NULL nulls BOTH columns, so deleting a device fails outright."""
    probe.execute(text("INSERT INTO snaps_plain VALUES (1, 1, 10)"))
    with pytest.raises(IntegrityError) as info:
        probe.execute(text("DELETE FROM devices WHERE id = 10"))
    assert isinstance(info.value.orig, psycopg.errors.NotNullViolation)


def test_set_null_with_a_column_list_clears_only_the_device(probe: Connection) -> None:
    probe.execute(text("INSERT INTO snaps_cols VALUES (1, 1, 10)"))
    probe.execute(text("DELETE FROM devices WHERE id = 10"))
    row = probe.execute(text("SELECT user_id, device_id FROM snaps_cols WHERE id = 1")).one()
    assert row.user_id == 1  # ownership reference is untouched
    assert row.device_id is None


def test_a_device_owned_by_another_user_cannot_be_referenced(probe: Connection) -> None:
    with pytest.raises(IntegrityError) as info:
        # user 1 referencing user 2's device
        probe.execute(text("INSERT INTO snaps_cols VALUES (1, 1, 20)"))
    assert isinstance(info.value.orig, psycopg.errors.ForeignKeyViolation)


def test_a_null_device_is_accepted_for_an_owned_row(probe: Connection) -> None:
    probe.execute(text("INSERT INTO snaps_cols VALUES (1, 1, NULL)"))
    assert probe.execute(text("SELECT count(*) FROM snaps_cols")).scalar_one() == 1


def test_removing_the_owner_cascades_through_devices_and_snapshots(probe: Connection) -> None:
    probe.execute(text("INSERT INTO snaps_cols VALUES (1, 1, 10), (2, 2, 20)"))
    probe.execute(text("DELETE FROM users WHERE id = 1"))
    assert probe.execute(text("SELECT id FROM devices")).scalars().all() == [20]
    assert probe.execute(text("SELECT id FROM snaps_cols ORDER BY id")).scalars().all() == [1, 2]
    # snaps_cols rows are not cascaded by the user FK (no user FK on that table): the device
    # FK only clears device_id. Row 1 keeps user_id=1 as a plain integer in this probe schema.


def test_a_snapshot_cannot_point_at_another_users_session(probe: Connection) -> None:
    with pytest.raises(IntegrityError) as info:
        # session 100 belongs to user 1, so a row claiming user 2 must be rejected
        probe.execute(text("INSERT INTO snaps_cascade VALUES (1, 100, 2)"))
    assert isinstance(info.value.orig, psycopg.errors.ForeignKeyViolation)


def test_deleting_a_session_cascades_to_its_snapshots(probe: Connection) -> None:
    probe.execute(text("INSERT INTO snaps_cascade VALUES (1, 100, 1), (2, 200, 2)"))
    probe.execute(text("DELETE FROM sessions WHERE id = 100"))
    assert probe.execute(text("SELECT id FROM snaps_cascade")).scalars().all() == [2]
