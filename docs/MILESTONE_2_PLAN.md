# Milestone 2 plan: backend foundation (M2a)

Status: **approved with amendments** (decisions D1 to D14 and six additional requirements). Implementation proceeds one step at a time; see section 12 for the live status of each step.

M2 is split: **M2a** (this document, backend only) and **M2b** (web authentication and session screens, later). M2a changes no UI, design tokens or accessibility checks.

## 1. Approved decisions

| # | Decision |
|---|---|
| D1 | Split into M2a (backend) and M2b (frontend) |
| D2 | Fixed snapshot envelope now; Zod and JSON Schema in M3 |
| D3 | Snapshot payload is the canonical store for all eight categories; only `action_checkpoints` is a separate table (M3). No `workflow_states`, `calculation_states`, `permission_requirements`, `session_windows` or `session_tabs` tables. This amends ARCHITECTURE section 14 |
| D4 | Synchronous SQLAlchemy 2.0 with psycopg 3 |
| D5 | Opaque cookie sessions, CSRF protection, same-origin proxy |
| D6 | No PostgreSQL row-level security in M2; application-level isolation plus composite foreign keys |
| D7 | Explicit `409 EMAIL_TAKEN` on duplicate registration. Trade-off: it reveals that an email is registered. Mitigated by rate limiting (section 6.5); documented as a known limitation |
| D8 | Argon2id; minimum 12 characters, maximum 128, small local denylist, no composition rules |
| D9 | Database-backed account throttling |
| D10 | Hard deletion of sessions and accounts |
| D11 | uv, ruff, mypy |
| D12 | `/api/v1` prefix and the error envelope in section 7 |
| D13 | Next.js dev proxy rewrite added only after Step 2.1 and after you confirm the backend setup |
| D14 | Integration tests use `TEST_DATABASE_URL` |

Out of scope for M2a: email verification and password reset (no mail infrastructure), `/diff` (needs the M3 schema), `/sync/*` and `/conflicts` (M4), `/actions` (M3), any frontend work.

## 2. Architecture

A modular monolith: one FastAPI app, domain modules, no extra services. Layers: router, then service, then models. Routers are thin. Services own business rules and take `user_id` in every function; there is no fetch-by-id without an owner. Each request uses one database transaction (unit of work): commit on success, roll back on any error.

```
apps/api/
  pyproject.toml  uv.lock  alembic.ini  Dockerfile  .dockerignore  .env.example
  migrations/                      # Alembic
  src/statesync_api/
    main.py                        # create_app() factory (run with uvicorn --factory)
    core/  config.py  db.py  errors.py  middleware.py  security.py  csrf.py  deps.py
    modules/  auth/  devices/  sessions/  snapshots/   (router, schemas, service)
    db/  base.py  models.py
  tests/  unit/  integration/  conftest.py
docker-compose.yml                 # repo root
```

## 3. Data model (PostgreSQL 16 or newer)

UUID primary keys, `timestamptz` in UTC, a naming convention on every constraint. Server version 15 or newer is required (composite `SET NULL (column)` actions); tests assert 16 or newer.

| Table | Columns | Constraints |
|---|---|---|
| `users` | id, email, email_normalized, password_hash, display_name, is_active, failed_login_count, last_failed_at, locked_until, created_at, updated_at, last_login_at | unique(email_normalized) |
| `devices` | id, user_id, name, browser, platform, created_at, last_seen_at, revoked_at | FK user cascade; unique(user_id, id) |
| `auth_sessions` | id, user_id, device_id?, token_hash (SHA-256), created_at, expires_at, last_used_at, revoked_at, user_agent | unique(token_hash); composite FK (user_id, device_id) to devices(user_id, id) **ON DELETE CASCADE** |
| `auth_throttle` | scope, key_hash, window_start, count | PK(scope, key_hash, window_start) |
| `sessions` | id, user_id, title, summary, status, head_version (default 0), created_by_device_id?, created_at, updated_at, last_active_at | unique(user_id, id); index(user_id, updated_at desc) |
| `session_snapshots` | id, session_id, user_id, version, parent_version?, source_version?, device_id?, device_label, kind, schema_version, payload JSONB, payload_hash, size_bytes, tab_count, window_count, client_op_id?, client_created_at?, created_at | see below |

`session_snapshots` constraints:

- unique(session_id, version); unique(session_id, client_op_id).
- Composite FK (session_id, user_id) to sessions(user_id, id) **ON DELETE CASCADE**: a snapshot can never reference another user's session.
- Composite FK (user_id, device_id) to devices(user_id, id) **ON DELETE SET NULL (device_id)**: see 3.1.
- CHECK `version >= 1`; CHECK `(version = 1 AND parent_version IS NULL) OR parent_version = version - 1`.
- CHECK `(kind = 'restore') = (source_version IS NOT NULL)`; CHECK `source_version < version`.
- `device_label` copies the device name at write time, so attribution survives device removal.
- An immutability trigger (section 3.2).

### 3.1 Device foreign keys and revocation

Plain `ON DELETE SET NULL` on a composite key `(user_id, device_id)` nulls **both** columns, which violates `user_id NOT NULL` and would block deletion. PostgreSQL 15 and later support `ON DELETE SET NULL (device_id)`, which nulls only the device column and leaves `user_id`, and so the ownership reference, intact. With the default `MATCH SIMPLE`, a NULL `device_id` means no device and is accepted, while a non-NULL `device_id` belonging to a different user is rejected. These behaviours are verified against the real server by `tests/integration/test_pg_semantics.py` (Step 2.1), not assumed.

Revocation is **soft**: `DELETE /devices/{id}` sets `revoked_at` in one transaction together with `revoked_at` on every `auth_session` of that device. The row stays, so attribution and ownership references are untouched. Defence in depth: authentication also rejects any session whose device is revoked, so revocation takes effect immediately even if a session row were missed. A revoked device cannot register new logins or push snapshots (`403 DEVICE_REVOKED`). Hard deletion of a device happens only through account deletion cascading.

### 3.2 Immutability trigger

A `BEFORE UPDATE` trigger on `session_snapshots` rejects every update **except** the foreign-key action that nulls `device_id` (allowed only when `NEW.device_id IS NULL` and every other column is unchanged). Without that exception the trigger would break `ON DELETE SET NULL (device_id)` and account deletion. Both behaviours are tested (Step 2.2).

## 4. Snapshot version lineage

| Term | Where it lives | Meaning |
|---|---|---|
| `base_version` | Request field only; **not stored** | The session head the client built on. Optimistic-concurrency precondition: must equal `sessions.head_version`, else `409 VERSION_CONFLICT`. `0` for the first snapshot |
| `parent_version` | Stored, server-assigned | The immediate predecessor in this session's history. Always `version - 1` (NULL for version 1), enforced by a CHECK. On success it equals `base_version` |
| `source_version` | Stored, **restore only** | The earlier version whose content was copied. Not an ancestry link: the parent of a restore is still `version - 1` |

History is one linear chain and is never rewritten.

Restore (`POST /sessions/{id}/restore` with `{source_version, base_version, device_id}`):

1. Requires `base_version == head_version` (else 409, same as any push).
2. Creates version `head + 1` with `kind = restore`, `parent_version = head`, `source_version = <requested>`.
3. Copies `payload`, `schema_version`, counts and `payload_hash` from the source verbatim.
4. Advances `head_version`. No existing row is updated or deleted.
5. Restoring the current head is rejected (`422 RESTORE_SOURCE_IS_HEAD`). Restoring a restore snapshot copies that snapshot's content and records that snapshot as `source_version` (no transitive chain resolution). An unknown source returns `404`.

Merges (M4) are pushes with `kind = merge` and a fresh `base_version`; the three versions involved are recorded in the `conflicts` table, not in snapshot columns.

## 5. Snapshot envelope and schema compatibility

Envelope: `{ "schema_version": <int>, "payload": { ... } }`.

- The server holds `SUPPORTED_SCHEMA_VERSIONS` (currently `{1}`). A push with a version outside it is rejected with `422 UNSUPPORTED_SCHEMA_VERSION` and `details: {received, supported}`, telling the client to update. Non-integer, zero and negative versions return `422 VALIDATION_ERROR`.
- `payload` must be a JSON object. Under a supported version, its top-level keys must be among the eight categories (`ui, drafts, workflow, selection, calculation, navigation, permissions, actions`). An unknown top-level key is rejected with `422 UNKNOWN_CATEGORY` and the offending keys listed. Nothing is stored and nothing is stripped.
- **Nothing is silently discarded.** A rejected push stores nothing, so the client's data stays in its own offline queue and can be retried after the client or server is updated. Accepted payloads are stored without removal, renaming or coercion of any field. Restores copy verbatim. Reads return the stored payload with its `schema_version` unchanged; the client decides how to migrate older versions.
- Contents inside a category are opaque in M2 (including unknown nested fields, which are preserved). M3 adds the Zod schema and chooses strict or pass-through per field.
- Storage note: JSONB does not preserve key order, whitespace or duplicate keys. `payload_hash` is computed over the canonical JSON (sorted keys, no insignificant whitespace) of the received value, so the hash identifies the content independent of those details.
- Size cap (default 512 KB): `413 PAYLOAD_TOO_LARGE`.

## 6. Authentication and security

### 6.1 Passwords
Argon2id (argon2-cffi), rehash on login when parameters change. Minimum 12, maximum 128 characters, local denylist, no composition rules. Login performs a dummy hash for unknown emails so timing does not reveal which emails exist; error messages are generic.

### 6.2 Sessions
256-bit random opaque token, stored only as a SHA-256 hash. Idle timeout 7 days, absolute lifetime 30 days. A new token on every login, revoked on logout, all other sessions revoked on password change. Not JWT: sessions stay revocable and no token is ever visible to JavaScript.

### 6.3 Cookie requirements
The API sets exactly one cookie, the session cookie, and it is always `HttpOnly`. In production:

- Name must start with `__Host-` (default `__Host-statesync_session`), with `Secure`, `Path=/` and **no `Domain` attribute**, `SameSite=Lax`.
- Settings validation **refuses to start** in production if the cookie name lacks the prefix, `Secure` is off, a cookie domain is set, or origins are not exact `https` origins. Independently of environment, a `__Host-` name with `Secure` off or a domain set is rejected, because browsers would drop the cookie.
- Development uses `statesync_session` without `Secure` (so it works on `http://localhost`).

### 6.4 CSRF and Origin
- **No JavaScript-readable cookie exists.** The CSRF token is `HMAC-SHA256(key derived from SECRET_KEY, auth_session_id)`, returned in the JSON body of register, login and `GET /auth/me`, held in memory by the client and sent in `X-CSRF-Token`. The server recomputes it and compares in constant time (`403 CSRF_FAILED`).
- **Origin check on every unsafe method** (POST, PUT, PATCH, DELETE): `Origin` must exactly match an entry in `ALLOWED_ORIGINS`, else `403 ORIGIN_NOT_ALLOWED`. A request with no `Origin` is rejected unless `ALLOW_MISSING_ORIGIN` is on, which is for development and tests only and is refused in production. A present `Sec-Fetch-Site: cross-site` is also rejected.
- Login and register have no session yet, so they rely on the Origin check plus a required `Content-Type: application/json` (`415` otherwise), which blocks plain HTML form posts.
- To verify at deployment (D13): that the proxy rewrite preserves the `Origin` header.

### 6.5 Throttling and rate limiting
- **Account throttle (authoritative, database-backed):** `users.failed_login_count` and `locked_until`. After 5 consecutive failures the delay grows exponentially up to 15 minutes; success resets it. Trade-off: an attacker can delay a victim's login for up to 15 minutes; this is accepted and documented.
- **Per-IP throttle (authoritative, database-backed):** the `auth_throttle` table holds fixed-window counters (keyed by a keyed hash of the client IP) for login and register, shared by every worker and instance without Redis. Old windows are purged opportunistically.
- **In-memory limiter: not production-grade protection and not relied upon.** Each worker process keeps its own counters, so N workers allow N times the limit, counters reset on restart or redeploy, and it cannot see other instances. If used at all it is a cheap burst pre-filter in front of the database counters.
- **Client IP:** taken from `X-Forwarded-For` only through a configured `TRUSTED_PROXY_COUNT` (the Nth entry from the right; never the leftmost, which clients can forge). Default 0 means the socket peer. Behind the Vercel rewrite to Render all requests would otherwise appear to come from the proxy, making per-IP limits shared and ineffective, so the correct hop count must be verified at deployment. The per-account throttle does not depend on IP.
- **Deployment-level strategy (defence in depth):** Vercel WAF rate limiting on `/api/v1/auth/*`. Vercel's documentation lists it as available on all plans, with one rate-limit rule on Hobby; a recent community report says enabling 429 enforcement on Hobby prompted a Pro upgrade, so confirm in your dashboard. Render offers no built-in WAF as far as we know, so a Cloudflare layer would require a custom domain. Neither is required for correctness; the database-backed limits are the baseline.

### 6.6 Isolation and hygiene
- Every query is scoped by `user_id`; composite foreign keys enforce ownership in the database.
- Other users' resources return `404`, never `403`.
- `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a restrictive CSP on API responses.
- No CORS by default (same-origin proxy). API docs disabled in production.
- Logs contain request id, method, path (no query string), status and duration; never payloads, passwords, tokens or cookies. Validation errors never echo submitted values.

## 7. API contract (`/api/v1`)

| Endpoint | Purpose | Success | Notable errors |
|---|---|---|---|
| `POST /auth/register` | `{email, password, display_name?}` | 201 `{user, csrf_token}` + cookie | 409 EMAIL_TAKEN, 422, 429 |
| `POST /auth/login` | `{email, password}` | 200 `{user, csrf_token}` + cookie | 401 INVALID_CREDENTIALS, 429 |
| `POST /auth/logout` | revoke current session | 204 | |
| `GET /auth/me` | session check, refresh CSRF token | 200 | 401 |
| `POST /auth/change-password` | revokes other sessions | 204 | 401, 422 |
| `DELETE /me` | `{password}`, hard delete everything | 204 | 401 |
| `POST/GET /devices`, `PATCH/DELETE /devices/{id}` | register, list, rename, **revoke** | 201/200/204 | 404 |
| `POST/GET /sessions`, `GET/PATCH/DELETE /sessions/{id}` | CRUD; list has `limit`, `cursor`, `q`, `status` | 201/200/204 | 404 |
| `POST /sessions/{id}/snapshots` | `{device_id, base_version, schema_version, payload, client_op_id?, client_created_at?, kind?}` | 201 | 409 VERSION_CONFLICT (with `current_head`), 413, 422, 403 DEVICE_REVOKED |
| `GET /sessions/{id}/snapshots` | metadata list, `after_version`, no payloads | 200 | |
| `GET /sessions/{id}/snapshots/{version}`, `/head` | full snapshot | 200 | 404 |
| `POST /sessions/{id}/restore` | `{source_version, base_version, device_id}` | 201 | 404, 409, 422 RESTORE_SOURCE_IS_HEAD |
| `GET /health` | liveness, no database | 200 | |
| `GET /ready` | readiness, checks the database | 200 | 503 NOT_READY |

Idempotency: the same `client_op_id` with the same `payload_hash` returns the original snapshot (200, `Idempotent-Replayed: true`); the same id with a different payload returns `409 IDEMPOTENCY_KEY_REUSED`.

Error envelope: `{"error": {"code", "message", "request_id", "details"}}`.

| Status | Codes |
|---|---|
| 401 | UNAUTHENTICATED, INVALID_CREDENTIALS |
| 403 | CSRF_FAILED, ORIGIN_NOT_ALLOWED, DEVICE_REVOKED |
| 404 | NOT_FOUND |
| 405 | METHOD_NOT_ALLOWED |
| 409 | VERSION_CONFLICT, EMAIL_TAKEN, IDEMPOTENCY_KEY_REUSED |
| 413 | PAYLOAD_TOO_LARGE |
| 415 | UNSUPPORTED_MEDIA_TYPE |
| 422 | VALIDATION_ERROR, UNSUPPORTED_SCHEMA_VERSION, UNKNOWN_CATEGORY, RESTORE_SOURCE_IS_HEAD |
| 429 | RATE_LIMITED (with `Retry-After`) |
| 500 | INTERNAL_ERROR (no internals exposed) |
| 503 | NOT_READY |

The OpenAPI document is exported to `openapi.json` with a CI drift check (Step 2.7), ready for TypeScript type generation.

## 8. Alembic strategy

Autogenerate then hand-review; migrations are never edited after merge; one head. Migrations run as a separate step (compose `migrate` service; Render pre-deploy command), using the direct (non-pooled) connection string (`DATABASE_URL_DIRECT`, falling back to `DATABASE_URL`). Tests build the schema from migrations, never `create_all`. CI: upgrade on an empty database, `alembic check` for drift, downgrade and upgrade round trip.

## 9. Testing plan (real PostgreSQL)

Unit tests need no database. Integration tests require `TEST_DATABASE_URL`, **fail loudly** if it is missing (no silent skips), and refuse to run against a database whose name does not contain `test`. Isolation per test by rolled-back savepoint; concurrency tests use separate committed connections and clean up.

| Area | Cases |
|---|---|
| Server semantics (2.1) | PostgreSQL 16 or newer; plain composite `SET NULL` fails; `SET NULL (device_id)` preserves `user_id`; cross-user device reference rejected; NULL device allowed; composite cascade and mismatch rejection for snapshots |
| Config and cookies (2.1, 2.3) | Production refuses weak secret, missing `__Host-`, Secure off, cookie domain, non-https or wildcard origins, `ALLOW_MISSING_ORIGIN`; every `Set-Cookie` has `HttpOnly`; exactly one cookie |
| CSRF and Origin (2.3) | Missing and wrong token, correct token, wrong Origin, missing Origin, `Sec-Fetch-Site: cross-site`, non-JSON login; safe methods unaffected |
| Auth (2.3) | Generic login errors, rehash, expiry, revocation, logout, password change revokes others |
| Throttling (2.3) | Account delay and reset; per-IP window; **limit holds across two separate app instances sharing one database** (the property an in-memory limiter cannot give); trusted-proxy IP selection and spoof resistance |
| Devices (2.4) | Revocation sets `revoked_at` and revokes all of that device's sessions atomically; revoked device rejected on login and push; hard-deleting a device keeps `user_id` and payload intact; account deletion works with the trigger |
| Isolation (2.4 to 2.6) | Two-user matrix over every endpoint (404s); raw SQL cross-user inserts rejected |
| Lineage (2.6) | Linear versions; `parent_version = version - 1`; restore adds a row, leaves all earlier rows unchanged, copies payload and hash, sets `source_version`; restore of head rejected; restore with stale base returns 409; restore of a restore; unknown source returns 404; DB CHECKs reject invalid rows inserted by SQL |
| Schema compatibility (2.6) | Unsupported future version returns 422 with supported list and stores nothing; zero, negative, non-integer versions; unknown category returns 422 listing keys and stores nothing; nested unknown fields, large integers and unicode round-trip exactly; restore never alters payload |
| Snapshots (2.6) | Stale base returns 409 with head; **20 parallel pushes on one base give exactly one 201 and nineteen 409s, contiguous versions**; idempotent replay and key reuse; immutability trigger; size cap |
| Deletion and migrations (2.2, 2.4) | Account delete cascades through every table; upgrade, downgrade and upgrade round trip; no model drift |

Tooling: pytest, pytest-cov, httpx, ruff, mypy. Results are reported as run; anything not run (Docker, GitHub Actions) is stated as unverified.

## 10. Docker and CI

`docker-compose.yml`: `db` (postgres:16-alpine, healthcheck, volume, bound to 127.0.0.1), `migrate` (runs `alembic upgrade head` after the database is healthy), `api` (starts after migrate succeeds), and an `api-tests` service under the `test` profile. The Dockerfile is multi-stage, slim, non-root, with a healthcheck. Dev defaults for the database password and secret are placeholders for local use only; production settings validation rejects the placeholder secret. CI gets an `api` job (PostgreSQL 16 service container, lint, types, migrations, tests) and an image-build check.

## 11. How this supports later milestones

- **Offline sync (M4):** `base_version` gives optimistic concurrency, `client_op_id` makes queued operations replayable, `client_created_at` is kept for display, and pull uses `after_version` plus the `(user_id, updated_at)` index.
- **Three-way merge (M4):** immutable snapshots, a linear `parent_version` chain and `payload_hash` let the client fetch base, local and remote exactly; the 409 returns the remote head; `kind` already allows `merge` and `conflict_resolution`.
- **Cross-device recovery:** devices, per-snapshot attribution, `last_seen_at` and soft revocation. Permission grants are never stored server-side (ARCHITECTURE 12.2).
- **Actions (M3):** `action_checkpoints` with unique(user_id, idempotency_key) slots in without touching snapshots.

## 12. Steps and status

| Step | Scope | Status |
|---|---|---|
| 2.1 | Scaffold, Docker, `/health`, `/ready`, config validation, error envelope, CI job, PostgreSQL semantics tests | In progress |
| 2.2 | Models, initial migration, immutability trigger | Not started |
| 2.3 | Auth, cookies, CSRF and Origin, throttling | Not started |
| 2.4 | Devices, revocation, isolation matrix | Not started |
| 2.5 | Sessions CRUD, pagination, search | Not started |
| 2.6 | Snapshots, lineage, schema compatibility, concurrency | Not started |
| 2.7 | OpenAPI export and drift check, docs, security checklist, Render and Neon notes | Not started |

## 13. Assumptions and limitations

PostgreSQL 16 locally and in CI (Neon may run a newer version); both pooled and direct Neon connection strings are available; free-tier Render and Neon can be slow on the first request after idle; no email verification or password reset; UUIDv4 identifiers; snapshot versions are per-session integers; duplicate-email responses reveal registration (D7).
