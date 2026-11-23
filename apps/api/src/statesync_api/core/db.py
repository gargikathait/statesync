from __future__ import annotations

from collections.abc import Iterator

from fastapi import Request
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from statesync_api.core.config import Settings


def make_engine(settings: Settings) -> Engine:
    return create_engine(
        settings.database_url.get_secret_value(),
        pool_pre_ping=True,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        # Never put bound parameters (payloads, password hashes) into exception text or logs.
        hide_parameters=True,
        connect_args={"connect_timeout": settings.db_connect_timeout_seconds},
    )


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


def get_session(request: Request) -> Iterator[Session]:
    """Request-scoped session. Services commit explicitly; anything uncommitted is rolled
    back when the session closes, so a failed request never leaves partial writes."""
    factory: sessionmaker[Session] = request.app.state.session_factory
    with factory() as session:
        try:
            yield session
        except Exception:
            session.rollback()
            raise
