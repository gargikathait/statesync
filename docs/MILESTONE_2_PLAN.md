# Milestone 2 plan: backend foundation (M2a)

Status: **approved with amendments** (decisions D1 to D14 and amendments A1 to A6 below). Implementation proceeds one step at a time; each step is reported and reviewed.

| Step | Scope | State |
|---|---|---|
| 2.1 | Scaffold, Docker, `/health`, `/ready`, error envelope, CI job | See repository history |
| 2.2 | Models, initial migration, immutability trigger | Planned |
| 2.3 | Auth, CSRF, Origin checks, throttling | Planned |
| 2.4 | Devices, revocation, isolation matrix | Planned |
| 2.5 | Sessions CRUD, pagination, search | Planned |
| 2.6 | Snapshots, optimistic concurrency, idempotency, restore, schema validation | Planned |
| 2.7 | OpenAPI export and drift check, docs, security checklist, Render and Neon notes | Planned |

Scope split (D1): **M2a** is this backend. **M2b** is the web UI for authentication, workspace and session detail. No frontend, design-token or accessibility-check changes happen in M2a. The Next.js dev proxy rewrite (D13) is added only after Step 2.1 is confirmed.

## 1. Decisions log

| # | Decision |
|---|---|
| D1 | Split into M2a (backend) and M2b (frontend) |
| D2 | Fixed snapshot envelope now; Zod and JSON Schema in M3 |
| D3 | Snapshot payload is the canonical store for all eight categories; only `action_checkpoints` is a separate table (M3) |
| D4 | Synchronous SQLAlchemy 2.0 with psycopg 3 |
| D5 | Opaque cookie sessions, CSRF protection, same-origin proxy (not JWT) |
| D6 | Application-level isolation plus composite foreign keys; no PostgreSQL RLS in M2 |
| D7 | Duplicate registration returns an explicit 409. Trade-off: it reveals that an email is registered. Mitigated by rate limiting; documented, not hidden |
| D8 | Argon2id; minimum 12, maximum 128 characters; small local denylist; no composition rules |
| D9 | Database-backed account throttling |
| D10 | Hard deletion of sessions and accounts |
| D11 | uv, ruff, mypy |
| D12 | `/api/v1` prefix and a single error envelope |
| D13 | Next.js proxy rewrite only after Step 2.1 is confirmed |
| D14 | Integration tests read `TEST_DATABASE_URL` |

## 2. Architecture

Modular monolith: one FastAPI app, domain modules, no extra services. Layers: router (thin) to service (business rules, transactions) to models. Every service function takes `user_id`; there is no fetch-by-id-alone.

```
apps/api/
  pyproject.toml  uv.lock  alembic.ini  Dockerfile  .dockerignore
  docker/initdb/            # creates the *_test database on first volume init
  migrations/               # Alembic (env.py, versions/)
  src/statesync_api/
    main.py                 # create_app() factory (no import-time side effects)
    core/  config.py  db.py  errors.py  logging.py  middleware.py
    api/   health.py        # /health, /ready (root level); versioned router mounted at /api/v1
    db/    base.py          # naming convention, DeclarativeBase; models arrive in 2.2
    modules/                # auth, devices, sessions, snapshots (Steps 2.3 to 2.6)
  tests/  unit/  integration/  conftest.py
docker-compose.yml  .env.example        # repository root
```

## 3. Database schema (PostgreSQL 16)

UUID primary keys, `timestamptz` in UTC, explicit constraint naming convention.

| Table | Columns | Constraints |
|---|---|---|
| `users` | id, email, email_normalized, password_hash, display_name, is_active, failed_login_count, locked_until, created_at, updated_at, last_login_at | unique(email_normalized) |
| `devices` | id, user_id, name, browser, platform, created_at, last_seen_at, revoked_at | FK user cascade; **unique(id, user_id)** |
| `auth_sessions` | id, user_id, device_id?, token_hash, created_at, expires_at, last_used_at, revoked_at, user_agent | unique(token_hash); composite FK (device_id, user_id) to devices, cascade |
| `sessions` | id, user_id, title, summary, status, head_version, created_by_device_id?, created_at, updated_at, last_active_at | **unique(id, user_id)**; composite FK (created_by_device_id, user_id) `ON DELETE SET NULL (created_by_device_id)` |
| `session_snapshots` | id, session_id, user_id, version, parent_version?, source_version?, device_id?, device_label, kind, schema_version, payload JSONB, payload_hash, size_bytes, tab_count, window_count, client_op_id?, client_created_at?, created_at | see below |

Snapshot constraints:

- unique(session_id, version); unique(session_id, client_op_id).
- Composite FK (session_id, user_id) to sessions(id, user_id), cascade.
- Composite FK (device_id, user_id) to devices(id, user_id) with `ON DELETE SET NULL (device_id)`.
- Composite FK (session_id, parent_version) to session_snapshots(session_id, version).
- Composite FK (session_id, source_version) to session_snapshots(session_id, version).
- CHECK version >= 1, and `(version = 1 AND parent_version IS NULL) OR parent_version = version - 1` (history is linear).
- CHECK `(kind = 'restore') = (source_version IS NOT NULL)` and `source_version <= parent_version`.
- A trigger rejects any UPDATE (snapshots are immutable).

Not in M2: `conflicts`, `sync_operations` (M4); `action_checkpoints` (M3). Separate tables for workflow, calculations, permission requirements and tabs are dropped (D3).

## 4. Amendments

### A1. Version lineage

Three distinct concepts. They are never interchangeable.

| Term | Where | Meaning |
|---|---|---|
| `base_version` | Request field only | The session head the client believes is current. It is the optimistic-concurrency token. The push is accepted only if it equals the server's current `head_version`; otherwise 409 `VERSION_CONFLICT` with the current head. Not stored as its own column |
| `parent_version` | Stored | The immediate predecessor in the session's linear history. For an accepted write it equals the previous head, therefore equals `base_version` and `version - 1`. Null only for version 1 |
| `source_version` | Stored, restore only | The historical version whose payload was copied. Null for every other kind |

Restore semantics (exact):

1. Request: `{source_version, device_id, base_version}`. `base_version` must equal the current head, same as any write.
2. The server inserts a **new** snapshot `version = head + 1`, `parent_version = head`, `source_version = <the old version>`, `kind = 'restore'`, with the source payload copied byte-for-byte (same `payload_hash`, same `schema_version`).
3. No existing row is modified or deleted. History stays 1..N intact; the head moves forward to N+1.
4. Example: head is 7; restoring version 3 yields version 8 with parent 7 and source 3.
5. Restoring a version whose payload hash equals the current head's is rejected with 422 `NOTHING_TO_RESTORE`, to avoid duplicate noise.
6. A nonexistent or other-user `source_version` returns 404.

### A2. Device foreign keys and revocation

Verified on PostgreSQL 16.2 (empirical test run in this environment):

- A composite FK `(device_id, user_id)` with plain `ON DELETE SET NULL` **fails** when the device is deleted, because it also tries to null `user_id` (NOT NULL). The delete is rolled back.
- `ON DELETE SET NULL (device_id)` (column list, PostgreSQL 15 and later) works: the row keeps `user_id` and only `device_id` becomes null. This is what the schema uses. It requires PostgreSQL 15 or newer.
- A reference to another user's device is rejected by the composite FK.
- A null `device_id` is allowed (MATCH SIMPLE).

Not yet verified (the test script lacked the cascade clause): user-delete cascading through devices and snapshots. It is covered by Step 2.2 integration tests.

Policy:

- `DELETE /devices/{id}` **revokes** (sets `revoked_at`) rather than deleting the row, so ownership references stay intact. Hard deletion of device rows happens only through account deletion.
- In the same transaction, every `auth_sessions` row of that device is revoked. Its next request returns 401. If the caller revokes their own device they are logged out.
- A revoked device cannot push snapshots (403 `DEVICE_REVOKED`).
- Snapshots keep `device_label` so history stays readable even if a device reference is later nulled.

### A3. Rate limiting

- The in-memory per-IP limiter is **best-effort dampening only**. It is per process: with N workers or instances the effective limit is multiplied by N, it resets on restart, and behind a proxy it sees the proxy's address unless forwarded headers are trusted from known proxies only. It is never relied on as protection.
- **Authoritative control:** database-backed account throttling (D9). Progressive delay on failed logins, capped at 15 minutes, without hard lockout (a hard lockout would let an attacker lock a victim out). A correct password after the delay still works.
- **Deployment-level strategy:** all production traffic enters through the Vercel proxy, so rate limits on `/api/v1/auth/*` belong at that edge (Vercel's firewall rate-limiting rules; availability and limits depend on the plan and must be verified before relying on them). Run a single API worker on Render (`WEB_CONCURRENCY=1`) so in-process counters stay coherent.
- **Known residual risk:** password spraying across many accounts from one IP is only mitigated by the edge rule and the in-memory limiter. Documented, not hidden.

### A4. Cookies, CSRF and Origin

- Production refuses to start unless cookie settings satisfy `__Host-` rules: name prefixed `__Host-`, `Secure`, `Path=/`, no `Domain`, plus `HttpOnly` and `SameSite=Lax`.
- No cookie is readable by JavaScript: the session cookie is HttpOnly, and the CSRF token is **not a cookie**. It is returned in a JSON body and held in memory by the client.
- Server-side CSRF validation on POST, PUT, PATCH and DELETE: `X-CSRF-Token` must equal an HMAC bound to the session, compared in constant time. A token from another session fails.
- Origin check on the same unsafe methods: `Origin` must be present and exactly match the configured public origin(s); `Origin: null` and missing Origin are rejected with 403 `CSRF_FAILED` in production. Development allows a configured localhost origin.
- Local development over `http://localhost` uses an unprefixed cookie name without `Secure` (the prefix requires Secure); this is a development-only setting that production validation forbids.

### A5. Snapshot schema compatibility

- `schema_version` is validated against an explicit supported range (initially 1 only). Outside the range the request is rejected with 422 `UNSUPPORTED_SCHEMA_VERSION`, with `details: {received, supported_min, supported_max}`. **Nothing is stored, truncated or downgraded.**
- For a supported version, the allowed top-level categories are exactly the eight. Unknown categories are **rejected** with 422 `UNKNOWN_CATEGORIES` (listing them), never silently dropped. New categories require a new `schema_version`.
- The server stores the validated payload unmodified and returns it unfiltered on read. Nested contents stay opaque until M3.
- Client contract: on either error the client must keep the pending operation (offline queue, M4) and show an "update required" state. Data is never discarded because the server is older than the client.
- Stored snapshots keep the `schema_version` they were written with; older versions are migrated on read by the client (M3).
- Hardening: duplicate JSON keys are rejected with 422 `DUPLICATE_JSON_KEY` (a standard parser would silently keep the last one), and `\u0000` in strings is rejected (PostgreSQL JSONB cannot store it). JSONB normalises key order and whitespace; payload hashes are computed over a canonical form.
- A `GET /api/v1/meta` endpoint will expose the supported schema range and payload size limit.

### A6. Tests added

| Area | Cases |
|---|---|
| Lineage | head 7 restore of 3 gives version 8, parent 7, source 3; all earlier rows byte-identical before and after; contiguous versions; stale `base_version` returns 409; `NOTHING_TO_RESTORE`; CHECK constraints reject bad parent/source via raw SQL |
| Devices | composite FK rejects cross-user device; `SET NULL (device_id)` preserves `user_id` on raw device delete; revoke kills that device's auth sessions only; revoked device cannot push; other user cannot revoke |
| Rate limiting | account throttle across separate connections; progressive delay and cap; correct password after delay works; limiter documented as per-process |
| Cookies and CSRF | `__Host-` attributes in production config; production startup refuses invalid cookie config; no JS-readable cookie; missing, wrong, other-session and valid CSRF tokens; missing, `null`, foreign and valid Origin |
| Schema | unsupported future and too-old versions rejected with nothing stored; unknown category rejected; duplicate key and NUL rejected; stored payload equals sent payload |

## 5. API contract (`/api/v1`)

| Endpoint | Purpose |
|---|---|
| `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`, `DELETE /me` | Account and session handling |
| `POST/GET /devices`, `PATCH/DELETE /devices/{id}` | Register, list, rename, revoke |
| `POST/GET /sessions`, `GET/PATCH/DELETE /sessions/{id}` | CRUD; list supports `limit`, `cursor`, `q`, `status` |
| `POST /sessions/{id}/snapshots` | `{device_id, base_version, schema_version, payload, client_op_id?, client_created_at?, kind?}` |
| `GET /sessions/{id}/snapshots`, `/snapshots/{version}`, `/snapshots/head` | History and retrieval |
| `POST /sessions/{id}/restore` | `{source_version, device_id, base_version}` (A1) |
| `GET /meta` | Supported schema range and limits |
| `GET /health`, `GET /ready` | Liveness; readiness with database check (root level, not versioned) |

Error envelope: `{"error": {"code", "message", "request_id", "details"}}`. Codes: UNAUTHENTICATED (401), CSRF_FAILED and DEVICE_REVOKED (403), NOT_FOUND (404), VERSION_CONFLICT, EMAIL_TAKEN, IDEMPOTENCY_KEY_REUSED (409), PAYLOAD_TOO_LARGE (413), VALIDATION_ERROR, UNSUPPORTED_SCHEMA_VERSION, UNKNOWN_CATEGORIES, DUPLICATE_JSON_KEY, NOTHING_TO_RESTORE (422), RATE_LIMITED (429), INTERNAL_ERROR (500), SERVICE_UNAVAILABLE (503). Deferred: `/diff` (M3), `/sync/*` and `/conflicts` (M4), `/actions` (M3).

## 6. Authentication and isolation

Argon2id with rehash-on-login and a dummy hash for unknown emails. Opaque 256-bit session token stored only as a SHA-256 hash; idle timeout 7 days, absolute 30. Isolation in three layers: every query scoped by `user_id`; composite foreign keys; a two-user test matrix over every endpoint where another user's resources return 404, never 403. Authenticated responses are `Cache-Control: no-store`. No CORS by default. Logs never contain payloads, passwords or query strings. Not in M2: email verification and password reset (no mail infrastructure).

## 7. Migrations

Typed SQLAlchemy 2.0 models; Alembic autogenerate with hand review; applied migrations are never edited; single head. Migrations run as a separate step (compose `migrate` service locally, pre-deploy command on Render) using the **direct** Neon connection (`MIGRATION_DATABASE_URL`), not the pooled one. CI: upgrade on an empty database, drift check, downgrade and upgrade round trip. Tests build the schema from migrations, never `create_all`.

## 8. Testing strategy

- Unit tests run without a database. Integration tests use a real PostgreSQL through `TEST_DATABASE_URL` and **fail loudly** (never skip) when it is unset.
- Safety guard: the test database name must end in `_test`, because the suite drops and recreates the schema.
- Sources of PostgreSQL: Docker Compose locally; a `postgres:16` service container in GitHub Actions; in the author's sandbox a pip-installed PostgreSQL 16.2, used only for development verification and not a project dependency.
- Concurrency tests (for example 20 parallel pushes with one `base_version` give exactly one 201 and nineteen 409) use separate committed connections and clean up after themselves.
- Reported honestly: what ran, what did not (Docker, GitHub Actions), and real coverage figures.

## 9. Local development with Docker

`docker-compose.yml` services: `db` (postgres:16, healthcheck, volume, bound to 127.0.0.1), `migrate` (one-shot `alembic upgrade head`), `api` (uvicorn with reload, starts after migrate succeeds). Multi-stage non-root Dockerfile with a healthcheck. `.env.example` has placeholders only; no secrets are committed. The init script creates `statesync_test` on first volume initialisation (reset with `docker compose down -v`).

## 10. How this supports later milestones

- **Offline sync (M4):** `base_version` gives optimistic concurrency; `client_op_id` makes queued operations replay-safe; `client_created_at` is kept for display; pull builds on `after_version` listings and the `(user_id, updated_at)` index.
- **Three-way merge (M4):** immutable snapshots with a linear `parent_version` chain and `payload_hash` let the client fetch base, local and remote exactly; 409 returns the remote head; `kind` includes `merge` and `conflict_resolution`; the `conflicts` table will reference snapshot ids.
- **Cross-device recovery:** devices, per-snapshot attribution, `last_seen_at` and revocation are in place. Permission grants are never stored server-side.
- **Actions (M3):** `action_checkpoints` with unique(user_id, idempotency_key) slots in without touching snapshots.

## 11. Assumptions and known limitations

PostgreSQL 15 or newer is required (column-list `SET NULL`); the target is 16. Render's free tier can sleep and Neon can auto-suspend, so the first request after idle may be slow. No email verification or password reset in M2. IDs are UUIDv4; snapshot versions are per-session integers. This is still pre-1 December work; see the compliance note in `ARCHITECTURE.md`.
