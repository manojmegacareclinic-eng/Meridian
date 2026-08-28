# Global Diplomatic Relations

Secure workspace for managing diplomatic relationships, government contacts, meetings, agreements, and follow-up work.

## Required environment

- Node 24
- [Bun](https://bun.sh) as the package manager and task runner
- Postgres — set `DATABASE_URL`

## Setup

```sh
bun install
```

## Run & Operate

The web dev server proxies `/api/*` to the API server (default `http://localhost:3000`, override with `API_PROXY_TARGET`), so run the API first:

- `PORT=3000 DATABASE_URL=... BETTER_AUTH_SECRET=... BETTER_AUTH_URL=http://localhost:5173 bun run --filter @workspace/api-server dev` — run the API server (requires `DATABASE_URL`; see Authentication below)
- `bun run --filter @workspace/global-dr-platform dev` — run the web app (defaults to port 5173)
- `bun run --filter @workspace/mockup-sandbox dev` — run the component preview server (defaults to port 5174)
- `bun run typecheck` — full typecheck across all packages
- `bun run build` — typecheck + build all packages
- `bun run audit` — run Bun's dependency vulnerability scanner
- `bun run --filter @workspace/api-spec codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `bun run --filter @workspace/db push` — push DB schema changes (dev only)

## Authentication (Better Auth)

Sign-in is self-hosted with [Better Auth](https://better-auth.com) — no
external provider keys are required, so the whole stack stays on this network.

1. Set `BETTER_AUTH_SECRET` on the API server (generate once):
   `openssl rand -base64 32`
2. Push the auth schema: `bun run --filter @workspace/db push`
3. Bootstrap the first admin (creates the "Meridian" workspace org, signs the
   account in as a verified global admin, and prints a temp password shown
   only once):
   `bun run --filter @workspace/scripts create-user admin@meridian.gov "Ada Lovelace" --role global_admin --verify`
4. Sign in at the web app. New non-bootstrap accounts must verify their email
   before their password works (the token is mailed via the configured
   transport).

In development the API server trusts the web app's origin with
`BETTER_AUTH_URL=http://localhost:5173` (the vite dev server proxies
`/api` to the API server).

Dev flags: `VITE_AUTH_DEMO=1` on the web app boots a demo global-admin session
with the sign-in gate hidden; `AUTH_PASSTHROUGH=1` on the API server skips
session enforcement. Never combine them on a real deployment.

Verification mail defaults to console output; set `SMTP_*`
in `artifacts/api-server/.env` for real delivery (see `.env.example`).

Global admins manage accounts, roles, and invitations from the **Administration**
page (`/admin`). See `docs/roles-and-permissions.md` for the role model and
enforcement rules.

## Stack

- Bun workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- UI: React 19 + Vite, TanStack Query (data), TanStack Router (routing)
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

## Pointers

- See `docs/implementation-plan.md` for the implementation roadmap and current next task.