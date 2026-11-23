# StateSync

**Your browser remembers where you left off.**
*Don't just restore your tabs. Restore your work.*

StateSync reconstructs a user's working state across devices, crashes, connectivity loss and time away: drafts, workflow position, selections, calculations, permissions and partly finished actions, not just open tabs. Built for the SpectoV National Hackathon 2026, Web Development track, problem **WD-01** ([official problem](https://snh.hiringspectov.com/tracks/web-dev/)).

## Status

| Milestone | Scope | State |
|---|---|---|
| 0 | Requirements and architecture audit | Done (see `docs/ARCHITECTURE.md`) |
| **1** | **Design foundation: tokens, light and dark themes, core components** | **Done** |
| 2a | Backend foundation (FastAPI, PostgreSQL, auth, sessions, snapshots); plan in `docs/MILESTONE_2_PLAN.md` | In progress: Step 2.1 done |
| 2b | Web sign-in and session screens | Planned |
| 3 | Working-state engine: snapshots, workflow, calculations, checkpoints | Planned |
| 4 | Offline-first sync and conflict resolution | Planned |
| 5 | Browser extension and adapters | Planned |
| 6 | Recovery experience, accessibility, end-to-end tests | Planned |
| 7 | Docs, demo, deployment | Planned |

Capture, synchronisation and recovery are **not implemented yet**. The running app currently contains the landing page and the design-system reference (`/design`).

## What exists today

- Monorepo (npm workspaces) with a Next.js 16 / React 19 / Tailwind 4 web app.
- `@statesync/design-tokens`: the five brand colours (Ivory `#F3F1EC`, Moss `#B6B8AB`, Smoke `#9FA3AD`, Garden `#E0DFD2`, Midnight `#3C3E4A`), derived accessible tokens, WCAG contrast maths, and a generated `tokens.css`.
- Accessible light and dark themes (Light / System / Dark switch, no flash on load).
- Components: Button, Panel, StatusPill (the six sync states), Callout, TextField, TabStrip (browser-style tabs), ThemeToggle.
- Automated tests for tokens, contrast, themes and components.

## Setup

Requirements: Node.js 20 or newer (22 recommended, see `.nvmrc`) and npm.

```bash
npm install
npm run dev        # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Start the web app |
| `npm run build` | Production build |
| `npm test` | Run all Vitest suites |
| `npm run typecheck` | TypeScript across workspaces |
| `npm run tokens:build` | Regenerate `packages/design-tokens/tokens.css` |
| `npm run tokens:check` | Fail if `tokens.css` is stale (also run in CI) |
| `npm run tokens:report` | Print the contrast tables used in `docs/DESIGN_SYSTEM.md` |
| `npm run check` | tokens check, typecheck, tests and build in one go (web only) |
| `npm run api:up` | Start PostgreSQL 16, run migrations, start the API in Docker (needs Docker) |
| `npm run api:test` | Run the API tests against PostgreSQL in Docker |
| `npm run api:lint` | ruff and mypy for the API (needs uv) |

No environment variables are required yet. Backend variables will be documented when the API lands (Milestone 2).

## Repository layout

```
apps/web                 Next.js app
apps/api                 FastAPI service (Step 2.1: shell, config, health)
apps/extension           Browser extension (planned)
packages/design-tokens   Brand tokens, themes, contrast maths
docs/                    ARCHITECTURE.md, DESIGN_SYSTEM.md
.github/workflows        CI: tokens check, typecheck, tests, build
```

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): approved architecture, security decisions, status of every part, limitations and risks.
- [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md): palette roles, contrast corrections and verified ratios.
- [`docs/MILESTONE_2_PLAN.md`](docs/MILESTONE_2_PLAN.md): approved backend plan (schema, lineage rules, security, tests).
- [`apps/api/README.md`](apps/api/README.md): running and testing the API.

## Planned deployment

Vercel (web), Render (API), Neon (PostgreSQL). Not deployed yet.

## Disclosure

- Developed with AI assistance (Claude by Anthropic) under the participant's direction.
- Main third-party libraries: Next.js, React, Tailwind CSS, TypeScript, Vitest, Testing Library, jsdom, tsx.
- The design foundation was started before the 1 December 2026 build phase; see the compliance note in `docs/ARCHITECTURE.md`.
