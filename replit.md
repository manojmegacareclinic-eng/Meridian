# Global Diplomatic Relations

Secure workspace for managing diplomatic relationships, government contacts, meetings, agreements, and follow-up work.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

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
