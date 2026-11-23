# syntax=docker/dockerfile:1
# Targets: runtime (default, production) and dev (adds test dependencies and tests).

FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never
RUN pip install --no-cache-dir uv==0.11.32
WORKDIR /app
COPY pyproject.toml uv.lock ./

FROM base AS build-runtime
RUN uv sync --frozen --no-install-project --no-dev
COPY src ./src
RUN uv sync --frozen --no-dev --no-editable

FROM base AS build-dev
RUN uv sync --frozen --no-install-project
COPY src ./src
RUN uv sync --frozen

FROM python:3.12-slim AS dev
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PATH="/app/.venv/bin:$PATH"
WORKDIR /app
COPY --from=build-dev /app/.venv /app/.venv
COPY pyproject.toml ./
COPY src ./src
COPY alembic.ini ./
COPY migrations ./migrations
COPY tests ./tests
CMD ["pytest", "-q"]

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PATH="/app/.venv/bin:$PATH"
RUN useradd --system --uid 10001 --no-create-home app
WORKDIR /app
COPY --from=build-runtime /app/.venv /app/.venv
COPY alembic.ini ./
COPY migrations ./migrations
USER app
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=2).status == 200 else 1)"]
# --no-proxy-headers: client IPs are derived by the app from TRUSTED_PROXY_COUNT, never by uvicorn.
# --no-access-log: the app writes its own access log without query strings.
CMD ["uvicorn", "--factory", "statesync_api.main:create_app", "--host", "0.0.0.0", "--port", "8000", "--no-proxy-headers", "--no-access-log"]
