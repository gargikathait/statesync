from __future__ import annotations

import logging
import re
import time
from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from statesync_api.core.errors import error_body

logger = logging.getLogger("statesync.http")

_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{8,64}$")
_DOC_PATHS = {"/docs", "/redoc", "/docs/oauth2-redirect"}
_HOST_RE = re.compile(r"^(?P<host>[a-z0-9.-]+)(?::\d{1,5})?$")
# Liveness only: platforms probe it with whatever Host they use, and it returns no data.
HOST_CHECK_EXEMPT_PATHS = frozenset({"/api/v1/health"})
_CSP = "default-src 'none'; frame-ancestors 'none'"
_HSTS = "max-age=63072000; includeSubDomains"


def apply_common_headers(response: Response, request_id: str, path: str, production: bool) -> None:
    response.headers["X-Request-ID"] = request_id
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    if path not in _DOC_PATHS:  # Swagger UI loads assets, so it needs a relaxed policy (dev only)
        response.headers["Content-Security-Policy"] = _CSP
    if production:
        response.headers["Strict-Transport-Security"] = _HSTS


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assigns a request id, converts unexpected errors into the error envelope, adds
    security headers and writes one access-log line (path only, no query string)."""

    def __init__(
        self, app: object, production: bool = False, allowed_hosts: list[str] | None = None
    ) -> None:
        super().__init__(app)  # type: ignore[arg-type]
        self._production = production
        self._allowed_hosts = frozenset(allowed_hosts or [])

    def _host_allowed(self, request: Request) -> bool:
        if not self._allowed_hosts or request.url.path in HOST_CHECK_EXEMPT_PATHS:
            return True
        match = _HOST_RE.fullmatch(request.headers.get("host", "").lower())
        return match is not None and match.group("host") in self._allowed_hosts

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        incoming = request.headers.get("x-request-id", "")
        request_id = incoming if _REQUEST_ID_RE.fullmatch(incoming) else uuid4().hex
        request.state.request_id = request_id
        started = time.perf_counter()
        try:
            if not self._host_allowed(request):
                # The rejected value is deliberately not echoed back or logged.
                response: Response = JSONResponse(
                    error_body("INVALID_HOST", "Invalid host header.", request_id),
                    status_code=400,
                )
            else:
                response = await call_next(request)
        except Exception as exc:
            # Log the exception type only: messages from drivers can contain connection details.
            logger.error("unhandled_error request_id=%s type=%s", request_id, type(exc).__name__)
            response = JSONResponse(
                error_body("INTERNAL_ERROR", "An unexpected error occurred.", request_id),
                status_code=500,
            )
        apply_common_headers(response, request_id, request.url.path, self._production)
        logger.info(
            "request id=%s method=%s path=%s status=%s duration_ms=%.1f",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            (time.perf_counter() - started) * 1000,
        )
        return response
