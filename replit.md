# Global Diplomatic Relations

Secure workspace for managing diplomatic relationships, government contacts, meetings, agreements, and follow-up work.

## Run & Operate

- `pnpm --filter @workspace/global-dr-platform run dev` — run the web app (managed workflow; `PORT` is injected)
- `pnpm --filter @workspace/api-server run dev` — run the API server (managed workflow; development service port is injected)
- `pnpm --filter @workspace/mockup-sandbox run dev` — run the component preview server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Current Implementation Status

- **Overall:** Foundation is set up and running on Replit; the development database schema is applied and the root web preview loads successfully.
- **Completed:** Dependencies, managed workflows, database setup, TypeScript validation, API health verification, and the initial operational UI for countries, contacts, meetings, agreements, activity, dashboard metrics, and settings.
- **Partial:** The database starts empty, the current schema covers the operational MVP rather than the full enterprise blueprint, and the workspace is not yet protected by authentication.
- **Next task:** **Task #2 — Require sign-in before exposing confidential diplomatic records.** Add frontend sign-in, API authorization, role permissions, and signed-in user context.
- **Current blocker:** Clerk is referenced by the project but is not configured in the development environment. Configure it through the supported Replit Auth/Clerk flow before implementing protected routes.
- **Living plan:** See [`docs/implementation-plan.md`](docs/implementation-plan.md) for the phase roadmap, current status, scope boundaries, and update protocol. Update that document and this section as work is completed.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/global-dr-platform` — React/Vite application and product UI.
- `artifacts/api-server` — Express API routes under `/api`.
- `lib/api-spec/openapi.yaml` — source of truth for API contracts.
- `lib/db/src/schema` — Drizzle/PostgreSQL schema.

## Architecture decisions

- The first release focuses on operational engagement workflows; intelligence scraping and autonomous agents are later phases.
- OpenAPI is the shared contract between the generated React client and Express API.
- Official contact records preserve verification state and source-oriented review rather than silently trusting automation.
- The built-in PostgreSQL database is used for development persistence.

## Product

- Executive overview with live counts, engagement pipeline, upcoming meetings, and recent activity.
- Searchable country workspaces, government contact directory, meeting pipeline, and agreement lifecycle records.
- Create flows for countries, contacts, meetings, and agreements with database-backed persistence.
- Settings and system-health context for the workspace.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `docs/implementation-plan.md` for the implementation roadmap and current next task
