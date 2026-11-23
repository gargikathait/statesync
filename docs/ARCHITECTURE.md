# StateSync architecture

**Problem:** SpectoV National Hackathon 2026, Web Development track, WD-01 "StateSync Web: Websites That Resume Themselves".
**Promise:** Don't just restore your tabs. Restore your work.

This document describes the approved architecture. Each section is marked with its implementation status so that nothing here is read as a claim of completed work.

| Status | Meaning |
|---|---|
| Implemented | Exists in the repository and is covered by checks |
| Planned (Mx) | Designed here, scheduled for Milestone x |
| Stretch | Only if time allows; never claimed unless built and validated |

Current state: **Milestone 1 complete** (design foundation). Everything below marked Planned is not built yet.

## 1. Principles

1. **Working state, not tab lists.** The product value is reconstructing drafts, workflow position, selections, calculations, permissions and pending actions.
2. **Honest boundaries.** A website cannot read other sites' internal state. Deep recovery is demonstrated in a StateSync-compatible workspace; browser-level recovery (tabs, windows) comes from the extension.
3. **Never silently lose work.** Conflicts preserve both versions; restores create new versions rather than overwriting history.
4. **Never repeat an irreversible action automatically.** Verify, then ask.
5. **Permissions are per device.** Requirements sync; grants never do.
6. **Core recovery needs no AI.** AI is optional and consent-gated.
7. **Modular monolith.** No extra services without a concrete reason.

## 2. System overview

```
 Browser (Chrome / Edge / Firefox / Safari)
 ┌────────────────────────────────────────────────────────────┐
 │  Extension (MV3)            StateSync web app (Next.js)    │
 │  - capture/restore tabs     - sessions, history, recovery  │
 │  - browser-adapter          - demo workspace + state engine│
 │  - local capture store      - Dexie/IndexedDB + SW queue   │
 │        ▲  origin-checked bridge (content script)  ▲        │
 └────────┼──────────────────────────────────────────┼────────┘
          └───────────── window.postMessage ─────────┘
                                   │ same-origin /api/* (Next rewrite)
                                   ▼
                  FastAPI (modular monolith)  ──►  PostgreSQL (Neon)
```

Key decision: the **extension never holds credentials and never talks to the API**. It hands captured data to the web app through the bridge, and the web app (which owns the authenticated session) syncs it. This removes a whole class of token-handling risk.

## 3. Stack

| Layer | Choice | Status |
|---|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript 7, Tailwind CSS 4 | Implemented (M1 shell) |
| Client state | Zustand (UI state), TanStack Query (server state) | Planned (M2) |
| Offline | Dexie over IndexedDB, Service Worker, durable sync queue | Planned (M4) |
| Backend | Python, FastAPI, Pydantic, SQLAlchemy 2 (sync, psycopg 3), Alembic | In progress (M2a, Step 2.1 done) |
| Database | PostgreSQL 16 (Neon in production), JSONB snapshot payloads | Dev database and test harness in place (2.1); schema in 2.2 |
| Extension | WebExtensions, MV3 (Chromium), Firefox manifest, shared adapters | Planned (M5) |
| Tests | Vitest, React Testing Library, Pytest, Playwright | Vitest + RTL implemented; others planned |
| Hosting | Vercel (web), Render (API), Neon (Postgres) | Planned (M7) |

Installed versions are in `package-lock.json`.

## 4. Repository layout

```
apps/web                 Next.js app (implemented: shell, landing, /design)
apps/api                 FastAPI service            (Step 2.1: app shell, config, health; models from 2.2)
apps/extension           Browser extension          (planned, README only)
packages/design-tokens   Brand tokens, themes, contrast maths  (implemented)
packages/state-schema    Zod schemas for the 8 state categories (planned, M3)
packages/merge-engine    Three-way merge and conflict model     (planned, M4)
packages/browser-adapter Capability detection + per-browser adapters (planned, M5)
docs/                    This document, DESIGN_SYSTEM.md
e2e/                     Playwright (planned, M6)
```

## 5. The eight state categories

All live inside one versioned snapshot document (`schemaVersion` + one key per category), validated by a shared schema.

| # | Category | Representation | Notes |
|---|---|---|---|
| 1 | UI position | `payload.ui` (scroll, active section, panel layout, viewport) | Restored best-effort; viewport differences reported |
| 2 | Unsaved work | `payload.drafts` (per-field value, base version, edited-at) | Never overwrites newer remote content |
| 3 | Workflow stage | `workflow_states` row + `payload.workflow` | Completed and pending steps, current step |
| 4 | Selected components | `payload.selection`, `payload.filters` | Widget ids, filter values, arrangement |
| 5 | Temporary calculations | `calculation_states` row | Inputs, method, options, intermediates, result, and the input hash that produced it |
| 6 | Navigation state | `session_windows`, `session_tabs` | Window and tab order, active tab, URLs, pinned and muted, groups where supported |
| 7 | Permissions | `permission_requirements` (synced) + device-local observed grants | See section 9 |
| 8 | Partially completed actions | `action_checkpoints` | See section 10 |

The restored calculation is **recomputed from stored inputs** and compared with the stored result, so recovery is demonstrably reconstruction rather than replaying a saved number.

## 6. Snapshots and versioning (Planned M3)

- Snapshots are immutable rows: `(session_id, version)` unique, with `parent_version`, `device_id`, `payload` JSONB, `created_at`.
- A session holds a `head_version` pointer. Pushing requires `base_version`; a stale base returns `409` with the remote head.
- History, diff and "restore an earlier state" are cheap: a restore creates a **new** head snapshot copied from the old one.
- Capture excludes sensitive input at the serialiser: password fields, payment fields, `autocomplete` credential types, and anything marked sensitive by the workspace.

## 7. Offline-first synchronisation (Planned M4)

1. Edits are written to IndexedDB (Dexie) immediately. `localStorage` is used only for the theme preference, never for snapshots.
2. Changes become operations in a durable queue, each with a unique `client_op_id` (idempotent on the server).
3. A service worker and online/offline events drive reconnection; retries use exponential backoff with jitter.
4. Pull uses `GET /sync/pull?since=`. Push is batched. Transport starts as HTTP with polling/SSE; WebSocket is Stretch.
5. The UI reports the six states: Synced, Syncing, Offline, Pending changes, Conflict detected, Recovery available.

## 8. Conflict resolution (Planned M4)

One implementation, in TypeScript (`packages/merge-engine`), so client and server cannot drift. The server is authoritative via optimistic concurrency; the client merges on `409`.

- Three-way, field-level merge over base, local and remote.
- Independent fields merge automatically. Free text gets a line-level three-way merge first.
- Same-field divergence is **not** auto-resolved: both values are stored in a `conflicts` row and the user chooses (keep mine, keep theirs, or edit a combined value) in a side-by-side comparison.
- Timestamps inform presentation, not winners: last-write-wins is never the only strategy.

## 9. Permission recovery (Planned M3 to M4)

- **Requirements** ("this feature needs notifications / clipboard") are part of synced state.
- **Grants** are observed per device with the real browser APIs (for example `navigator.permissions.query`) and stored only on that device. A grant seen on Device A is never trusted on Device B.
- On restore, the recovery screen re-checks every requirement, lists what is missing, and offers a **user-initiated** request. Native prompts are never bypassed, and the dependent feature resumes only after an actual grant.

## 10. Interrupted action recovery (Planned M3)

`action_checkpoints`: `action_id`, `workflow_id`, `status` (`not_started`, `in_progress`, `interrupted`, `awaiting_confirmation`, `completed`, `failed`), `last_checkpoint`, `safe_to_retry`, `requires_confirmation`, `idempotency_key` (unique per user).

- Duplicate execution is prevented by the unique idempotency key and by checkpoint transitions enforced on the server.
- Actions flagged irreversible (payments, messages, submissions, purchases) are never retried automatically. See correction 4.

## 11. Browser integration (Planned M5)

A shared adapter interface with capability detection, so browser-specific APIs live in one package:

```ts
interface BrowserAdapter {
  id: "chrome" | "edge" | "firefox" | "safari";
  capabilities(): Promise<Capabilities>;     // tabs, windows, tabGroups, sidePanel, scrollCapture, ...
  captureWindows(): Promise<CapturedWindow[]>;
  restoreWindows(w: CapturedWindow[], opts: RestoreOptions): Promise<RestoreReport>;
  getActiveTab(): Promise<TabRef | null>;
  getMetadata(): Promise<BrowserMeta>;
}
```

`RestoreReport` lists restored, skipped and degraded items with a reason each, so the recovery screen shows exactly what happened. The web app stays fully usable when the extension is absent.

| Browser | Plan | Validation honesty |
|---|---|---|
| Chrome, Edge | MV3, shared Chromium manifest | Validated only where tests were actually run |
| Firefox | Firefox manifest and `browser.*` differences handled in the adapter | Same rule; tab-group support differs |
| Safari | Adapter and notes; packaging needs macOS and Xcode (`safari-web-extension-converter`) | **Stretch, unvalidated** until built on macOS |

## 12. Approved technical corrections

These five corrections refine the original brief and are binding on later milestones.

### 12.1 Contrast
Smoke and Moss cannot carry text or UI boundaries on light surfaces (see `docs/DESIGN_SYSTEM.md`). Derived tokens exist for muted text, accent text and strong borders, and every promised pairing is checked by unit tests in both themes. State is never conveyed by colour alone.

### 12.2 Browser permissions
Requirements sync; grants do not. Grants are re-checked on each device with the real APIs, requested only on user action, and never assumed to carry across devices or browsers.

### 12.3 Extension messaging security
- The extension holds no session credentials and does not call the API; it only exchanges messages with the web app.
- The bridge content script is injected **only** on exact allowlisted StateSync origins (production origin, plus localhost in development). No wildcard matches.
- Page-to-extension messages are accepted only when `event.source === window` and `event.origin` is on the allowlist.
- Messages are versioned and validated against a strict schema with an allowlist of message types; unknown types and extra fields are rejected.
- A per-page-load random nonce is established in a handshake and required on every message to prevent replay from other frames or pages.
- The bridge exposes only coarse commands (capture, restore request, capability query). Restore requests carry data only: URLs are checked against an `http`/`https` allowlist, so `javascript:`, `data:`, `file:` and browser-internal schemes are refused.
- Least privilege: required permissions are limited (for example `tabs`, `storage`); scroll capture and host access are optional permissions requested at runtime with user consent.
- Captured data is held locally in the extension until the web app pulls it; nothing is uploaded in the background.

### 12.4 External action verification
For any action that touches an external system (payment, message, submission, purchase), an interrupted attempt moves to `interrupted`, then a **verification step** looks up the outcome with the action's idempotency key before anything else happens. Only after verification does the action move to `awaiting_confirmation`, and a retry requires an explicit user click showing what will happen. In this project the "external system" in the demonstration is a StateSync-owned demo ledger, which is the only system whose outcome StateSync can truthfully verify. For real third-party systems StateSync can record checkpoints and ask the user, but cannot verify the outcome on their behalf.

### 12.5 Implementation priorities
Solo build, with the build window 1 to 6 December 2026.

- **Must be real and tested:** eight-category snapshot engine, versioning and history, offline queue, three-way merge and conflict UI, cross-device restore through the backend, demo workspace, action checkpoints, permission re-check, Chrome and Edge extension.
- **Stretch:** Firefox validation, WebSocket push, AI features, Safari port.
- **Never claimed without evidence:** browser parity, a passing test, cross-device recovery, or synchronisation that was not actually run.

## 13. Security and privacy

Planned (M2 and later): password hashing with a modern algorithm (Argon2id), httpOnly and Secure session cookies, CSRF protection on mutating requests, strict Pydantic validation, per-user ownership checks on every query, and user-controlled capture and deletion.

Deployment decision: Vercel (web) and Render (API) are different sites, so cross-site cookies would break session auth. The web app proxies `/api/*` to the API through a Next.js rewrite, keeping cookies first-party. HTTPS is provided by the hosts.

Never captured: passwords, authentication tokens, payment credentials, sensitive private form values.

## 14. Data model (Planned M2 to M3)

> **Amended by `docs/MILESTONE_2_PLAN.md` (decision D3).** The snapshot payload is the canonical store for all eight categories. Only `users`, `devices`, `auth_sessions`, `sessions`, `session_snapshots` (M2) and `action_checkpoints`, `conflicts`, `sync_operations` (M3 to M4) are tables. The separate `workflow_states`, `calculation_states`, `permission_requirements`, `session_windows` and `session_tabs` tables listed below are **not** built.

`users`, `devices`, `browser_profiles`, `sessions`, `session_windows`, `session_tabs`, `session_snapshots`, `session_events`, `sync_operations`, `conflicts`, `workspaces`, `workflow_states`, `calculation_states`, `permission_requirements`, `action_checkpoints`, `user_preferences`. All rows carry `user_id` ownership; snapshot uniqueness is `(session_id, version)`; `sync_operations.client_op_id` and `action_checkpoints.idempotency_key` are unique.

## 15. API contract v1 (Planned)

```
POST   /auth/register | /auth/login | /auth/logout
GET    /devices            POST /devices          DELETE /devices/{id}
GET    /sessions           POST /sessions
GET    /sessions/{id}      PATCH /sessions/{id}   DELETE /sessions/{id}
GET    /sessions/{id}/snapshots
POST   /sessions/{id}/snapshots   (base_version required; 201 or 409 + remote head)
GET    /sessions/{id}/diff?from=&to=
POST   /sessions/{id}/restore     (creates a new head from an old snapshot)
GET    /conflicts          POST /conflicts/{id}/resolve
POST   /sync/push          GET /sync/pull?since=
GET    /actions/{id}       PUT /actions/{id}      POST /actions/{id}/confirm-retry
```

## 16. Testing strategy

| Layer | Tool | Status |
|---|---|---|
| Design tokens, contrast | Vitest | Implemented |
| UI components, theme logic | Vitest + React Testing Library | Implemented |
| Merge engine, state schema, sync queue | Vitest | Planned (M3, M4) |
| API, ownership, idempotency | Pytest | Planned (M2, M3) |
| End to end, offline, cross-device | Playwright | Planned (M6) |
| Extension on each browser | Manual and scripted, recorded per browser | Planned (M5) |

A test is reported as passing only when it was run. Test evidence is recorded in `docs/` at Milestone 7.

## 17. Technical limitations and risks

| Item | Limitation / risk | Handling |
|---|---|---|
| Third-party pages | Their internal state (unsaved forms) is not accessible | Deep recovery shown in the StateSync workspace; stated plainly |
| Browser differences | Tab groups, scroll capture, history access vary by browser | Capability detection; recovery screen shows "degraded" with reasons |
| Safari | Needs macOS and Xcode to package and test | Stretch; documented as unvalidated |
| Permissions | Cannot be transferred or pre-granted; some cannot be queried | Re-check and re-request per device |
| External actions | StateSync can only verify outcomes in systems it can query | Demo uses its own ledger; real systems get checkpoint plus user confirmation |
| Free-tier hosting | Render free services and Neon compute may take time to wake after inactivity | Warm the demo before presenting; offline mode keeps the app usable |
| Fonts | System font stacks only, so typography varies by operating system | Deliberate: offline-safe and zero layout shift; a bundled font can be added |
| Solo timeline | Six build days | Priorities in 12.5 |
| Not yet verified visually | Milestone 1 was verified by unit tests and a production build, not by looking at it in a real browser | Review `/design` in a browser in both themes before relying on the visuals |

## 18. Hackathon compliance notes

- The rules state the build phase runs 1 to 6 December 2026 and that previously developed work must be meaningfully modified or **disclosed**. This repository's design foundation was started before 1 December; commit history shows this. Disclose it in the submission or confirm with the organisers (support@spectov.in).
- The rules require disclosure of significant third-party tools. Development is AI-assisted (Claude); the README lists libraries. The participant must be able to explain every part of the implementation.
- Demonstrations must be real: no fabricated results. This is why the plan forbids mock data in core flows.
