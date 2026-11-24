# apps/api

FastAPI + Pydantic + SQLAlchemy 2 (sync, psycopg 3) + Alembic on **PostgreSQL 16**. Plan, schema, API contract and security rules: [`docs/MILESTONE_2_PLAN.md`](../../docs/MILESTONE_2_PLAN.md).

**Status: Step 2.1.** Implemented: app factory, fail-fast configuration, error envelope, request ids and security headers, `GET /api/v1/health`, `GET /api/v1/ready`, Alembic wiring (no migrations yet), Docker setup. Not implemented yet: models, authentication, devices, sessions, snapshots (Steps 2.2 to 2.6).

## Run with Docker (recommended)

From the repository root (needs Docker):

```bash
npm run api:up            # PostgreSQL 16 -> migrations -> API on http://127.0.0.1:8000
curl http://127.0.0.1:8000/api/v1/health
curl http://127.0.0.1:8000/api/v1/ready
npm run api:test          # tests against the Compose PostgreSQL
npm run api:down
```

The password and secret in `docker-compose.yml` are local-development placeholders. The API refuses to start in production with them.

## Run natively (needs uv and a PostgreSQL 16 you control)

```bash
cd apps/api
cp .env.example .env                      # edit DATABASE_URL if needed
uv sync                                   # creates .venv from uv.lock
uv run alembic upgrade head
uv run uvicorn --factory statesync_api.main:create_app --reload
```

## Tests

Unit tests need no database. Integration tests need a real PostgreSQL through `TEST_DATABASE_URL` and **fail (never skip)** if it is missing. The database name must contain `test`; it is created if absent.

```bash
export TEST_DATABASE_URL=postgresql://statesync:statesync_dev@localhost:5432/statesync_test
uv run pytest -q                          # everything
uv run pytest -q -m "not integration"     # unit tests only
uv run ruff check . && uv run ruff format --check . && uv run mypy
```

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `ENVIRONMENT` | `development` | `development`, `test` or `production` |
| `DATABASE_URL` | required | PostgreSQL only; SQLite is rejected. Normalised to psycopg 3 |
| `DATABASE_URL_DIRECT` | none | Non-pooled URL used by migrations (Neon) |
| `SECRET_KEY` | dev placeholder | Production requires 32+ random characters |
| `COOKIE_NAME`, `COOKIE_SECURE`, `COOKIE_DOMAIN` | `statesync_session`, false, none | Production requires `__Host-` name, Secure, no domain |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma separated exact origins; https only in production |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Bare hostnames the API answers to (no scheme, port or wildcard). **Required in production.** `/api/v1/health` is exempt |
| `ALLOW_MISSING_ORIGIN` | false | Development and tests only; refused in production |
| `TRUSTED_PROXY_COUNT` | 0 | Number of trusted proxy hops for client IP (used from Step 2.3) |
| `MAX_PAYLOAD_BYTES` | 524288 | Snapshot size cap (used from Step 2.6) |

Secrets and database URLs are never echoed in validation errors, logs or exception text.
