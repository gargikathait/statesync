"""Alembic environment. Uses DATABASE_URL_DIRECT (non-pooled) when set, else DATABASE_URL."""

import os
from logging.config import fileConfig

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import create_engine, pool

import statesync_api.db.models  # noqa: F401  (registers models on Base.metadata)
from statesync_api.core.config import normalise_database_url
from statesync_api.db.base import Base

load_dotenv(override=False)

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def _database_url() -> str:
    raw = os.environ.get("DATABASE_URL_DIRECT") or os.environ.get("DATABASE_URL")
    if not raw:
        raise RuntimeError("Set DATABASE_URL (or DATABASE_URL_DIRECT) before running migrations.")
    return normalise_database_url(raw)


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_database_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
