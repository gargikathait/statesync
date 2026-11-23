from __future__ import annotations

import logging

from fastapi import APIRouter, Request
from pydantic import BaseModel
from sqlalchemy import Engine, text

from statesync_api.core.errors import AppError

logger = logging.getLogger("statesync.health")
router = APIRouter(tags=["health"])


class Health(BaseModel):
    status: str


class Ready(BaseModel):
    status: str
    database: str


@router.get("/health", response_model=Health)
def health() -> Health:
    """Liveness: the process is up. Does not touch the database."""
    return Health(status="ok")


@router.get("/ready", response_model=Ready)
def ready(request: Request) -> Ready:
    """Readiness: the database accepts connections. Details are never returned to callers."""
    engine: Engine = request.app.state.engine
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as exc:
        logger.warning("readiness_failed type=%s", type(exc).__name__)
        raise AppError("NOT_READY", "The service is not ready.", 503) from None
    return Ready(status="ready", database="ok")
