from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from statesync_api import __version__
from statesync_api.core.config import Settings, get_settings
from statesync_api.core.db import make_engine, make_session_factory
from statesync_api.core.errors import register_exception_handlers
from statesync_api.core.logging import configure_logging
from statesync_api.core.middleware import RequestContextMiddleware
from statesync_api.modules import health

API_PREFIX = "/api/v1"


def create_app(settings: Settings | None = None) -> FastAPI:
    """Application factory. Run with: uvicorn --factory statesync_api.main:create_app"""
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = make_engine(settings)  # lazy: connects on first use
        app.state.engine = engine
        app.state.session_factory = make_session_factory(engine)
        try:
            yield
        finally:
            engine.dispose()

    docs = not settings.is_production
    app = FastAPI(
        title="StateSync API",
        version=__version__,
        lifespan=lifespan,
        docs_url="/docs" if docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if docs else None,
    )
    app.state.settings = settings
    app.add_middleware(RequestContextMiddleware, production=settings.is_production)
    register_exception_handlers(app)
    app.include_router(health.router, prefix=API_PREFIX)
    return app
