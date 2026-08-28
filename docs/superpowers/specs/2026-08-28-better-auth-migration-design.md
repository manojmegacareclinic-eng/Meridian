# Self-hosted Authentication with Better Auth (replacing Clerk)

**Date:** 2026-08-28
**Status:** Approved (design), pending implementation plan
**Related:** `docs/implementation-plan.md` Task #2 (rewritten), `docs/roles-and-permissions.md`

## Problem

Clerk was chosen for Task #2 (require sign-in before exposing confidential
diplomatic records) but it cannot function in this environment: Clerk's hosted
authentication is served entirely from `*.clerk.accounts.dev`, which this
network blocks. The sign-in modal never loads. Self-hosted auth is required so
authentication runs on our own origin.

## Decision

Replace Clerk with **Better Auth** (v1.x) on both the Express API server and the
Vite + TanStack Router SPA.

- Better Auth is the actively-developed successor to NextAuth/Auth.js; its docs
  now carry a "Migrate to Better Auth" banner. `@auth/express` still works but
  its project has been absorbed into Better Auth.
- It is framework-agnostic with first-class Express integration, a Drizzle
  adapter, and an official React client — the right shape for a Vite SPA +
  Express API workspace (the app is **not** Next.js, so `next-auth` itself is
  not usable here).
- All auth runs on our own origin → works on this blocked network (credentials
  path). OAuth/social and SMTP are wired but only function where external
  domains are reachable.

Alternatives considered and rejected:

- **`@auth/express` (Auth.js v5):** works, but the project has been folded into
  Better Auth; thinner SPA tooling (no official React client for Express).
- **Hand-rolled auth:** viable, but we would own password hashing, CSRF,
  sessions, OAuth, and the admin surface ourselves with no benefit over Better
  Auth for this scope.

## Scope

In scope (all explicitly requested):

- Email + password sign-in with **email verification** (OTP)
- Reliable identity independent of external domains (self-hosted)
- **Rate limiting** of the auth surface (Postgres-backed)
- **Organization plugin** (single workspace org)
- **Admin panel** in the web app for user/invitation/role management
- Migration away from Clerk (delete all Clerk wiring)

Explicitly out of scope (future work): 2FA, password reset out-of-band,
multi-organizational data partitioning.

## Architecture

Better Auth runs inside `api-server`.

- Mount the handler at `/api/auth/*splat` — Express 5 catch-all syntax — using
  `toNodeHandler(auth)` from `better-auth/node`.
- Mount **before** `express.json()` / `express.urlencoded()` (body parsers
  consume the request stream and break Better Auth).
- Sessions are database-backed, delivered via an httpOnly `sameSite=lax`
  cookie.
- Dev: the SPA talks to `localhost:3000` through the existing vite `/api`
  proxy, so everything is same-origin and cookies just work.
- Prod: SPA and API share an origin (reverse proxy); if split, CORS must
  allow the SPA origin with credentials.
- The SPA uses `createAuthClient` from `better-auth/react` (cookie baseURL
  `/api/auth`) and `useSession()`.
- No bearer-token plumbing: the cookie authenticates API calls automatically;
  `setAuthTokenGetter` usage is removed.

## Data model

New Drizzle schema modules in `lib/db/src/schema/` following existing file
conventions (e.g. `countries.ts`):

- `user`, `session`, `account`, `verification` — Better Auth core tables
- `organization`, `member`, `invitation` — organization plugin tables
- `rate_limit` — custom KV table backing Better Auth secondary storage

User `role` is a custom column added via Better Auth's
`user.additionalFields`, configured with `input: false` (server-owned; users
cannot self-escalate) and `defaultValue: "viewer"`. The column is required and
returned in session responses.

## Roles & RBAC mapping

Two independent role axes:

1. **Global (data) role** — `global_admin`, `regional_director`, `country_lead`,
   `research`, `meeting_coordinator`, `viewer` — stored on `user.role`.
   This is the authority for data access: read vs write. `viewer` is read-only.
   Semantics are unchanged from `docs/roles-and-permissions.md`.
2. **Organization role** — `owner` / `admin` / `member` (Better Auth org
   plugin) — governs membership and invitations within the single workspace
   org, not data access.

The role set/types move out of the old Clerk middleware into a shared module
(e.g. `lib/db` schema or an api-server auth module); the SPA keeps its
presentation copy (`ROLE_LABELS`).

## Enforcement (replaces Clerk guards)

In `artifacts/api-server/src/routes/index.ts`:

- `GET /api/healthz` stays public, mounted first.
- Session guard: `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })`
  from `better-auth/node`; `null` → `401 { error: "unauthorized" }`.
- Write-role guard: mutating requests (not GET/HEAD/OPTIONS) require
  `session.user.role` in the write set; otherwise `403 { error: "forbidden" }`.
  Reads pass through for any signed-in user.
- Admin guard (new): only `global_admin` may call `/api/admin/*`.

Dev fallback (preserved): when `DATABASE_URL` is unset there are no auth tables,
so guards become pass-through and the SPA shows the demo session
("Demo Analyst" / `global_admin`). Auth is effectively "on" whenever a database
is configured.

`clerkAuth.ts` is deleted.

## Frontend

In `artifacts/global-dr-platform/src`:

- `lib/auth.tsx` rewritten around `createAuthClient` + `useSession()`:
  SessionProvider, loading state ("Preparing the workspace"), sign-in, sign-out,
  demo-session fallback.
- `SignInScreen`: email + password form, styled with the existing
  Manrope/DM Mono design system. Posts to the Better Auth email sign-in
  endpoint via the client. OTP entry view for verification codes.
- Auth gate in `__root.tsx` unchanged in shape (workspace hidden until a
  session or demo fallback is active).
- Shell header + Settings access panel show name/email/role and a working
  sign-out; `button-sign-out`, `current-user-name` etc. data-testids kept.
- Social "Continue with Google/GitHub" buttons render only when the provider is
  configured server-side; inert on this network (OAuth endpoints are external).

## Email verification

- `emailAndPassword: { enabled: true, disableSignUp: true,
  requireEmailVerification: true }` — accounts are created/invited by
  administrators only (no open sign-up), and a user must verify their email
  before signing in.
- `emailVerification` plugin: OTP codes stored in the `verification` table,
  `autoSignInAfterVerification`.
- **Transport is pluggable:**
  - Dev / blocked network: console transport logs the code/token to the server
    log (still exercises the full flow end-to-end).
  - When SMTP env vars are present: real email via SMTP.
- Verified state persists on `user.emailVerified`.

## Organizations

- Organization plugin enabled; **one seeded workspace org, "Meridian"**.
- First `global_admin` (created by the bootstrap CLI) is the org `owner`.
- Admins invite members by email (invitation record + email via the same
  transport). Accepting makes the user an org `member`.
- All users are members of the single org. Data-access role stays on
  `user.role`, defaulting to `viewer` for new members.

## Admin panel & API

Custom guarded endpoints under `/api/admin`, all requiring the `global_admin`
data role (deliberately not Better Auth's admin plugin, so the workspace role
model stays coherent):

- `GET /api/admin/users` — list users (name, email, role, verified, member?)
- `POST /api/admin/users` — create user (email, name, role, temp password);
  triggers verification email at first sign-in
- `PATCH /api/admin/users/:id/role` — set global role
- `GET /api/admin/members` — org members and pending invitations
- `POST /api/admin/invitations` — invite by email (new member defaults to
  `viewer`)

Web: `/admin` route (visible only to `global_admin`, nav item "Administration"
or under Governance) consuming these endpoints, with data-testids for QA.

## Rate limiting

- Better Auth's built-in `rateLimiter` plugin.
- **Secondary storage is Postgres-backed** (single dependency): a `rate_limit`
  KV table (key, value, expiresAt) implementing Better Auth's
  `SecondaryStorage` interface via our `lib/db` drizzle instance. No Redis.
- Rules target the auth surface only:
  - sign-in attempts: ≈ 5 / 60s per key
  - verification-code requests: ≈ 3 / 60s
- Not applied to the data API (feeds on the confidential records stay
  unrestricted apart from auth).

## Environment & bootstrap

- `BETTER_AUTH_SECRET` (generate once: `openssl rand -base64 32`).
- Optional: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`,
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`,
  `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`.
- `.env.example` updated in both `artifacts/global-dr-platform/` and
  `artifacts/api-server/` (drop `VITE_CLERK_PUBLISHABLE_KEY`,
  `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`).
- `scripts/` package gains a `create-user` CLI
  (`create-user <email> <name> --role global_admin`) that seeds the first
  admin and the workspace org.
- README, `docs/roles-and-permissions.md`, and `docs/implementation-plan.md`
  updated (Task #2 rewritten as "Self-hosted sign-in (Better Auth)").

## Migration & cleanup

- Remove `@clerk/react` from `global-dr-platform` and `@clerk/express`,
  `@clerk/shared` from `api-server`; `bun install` prunes.
- Delete `artifacts/api-server/src/middlewares/clerkAuth.ts`.
- Remove `ClerkProvider` / `SignInButton` and token-getter plumbing from the
  web app; replace with the Better Auth client.
- Add the new Drizzle tables via `drizzle-kit push` (existing workflow).

## Verification & testing

1. `bun run typecheck` and `bun run build` pass (all workspaces).
2. **No-DB dev QA:** boot stub API + vite, run `router-qa.mjs` — all routes,
   header h1s, active nav, 404, demo user, zero console errors.
3. **DB-backed auth test** (with a Postgres): 
   - unauthenticated `/api/countries` → 401
   - OTP request → code appears in server log (console transport)
   - verified sign-in → cookie set, `/api/countries` → 200
   - `viewer` role POST → 403; `global_admin` POST → 200
   - admin endpoints blocked for non-`global_admin` → 403
4. Gate test repeats with `VITE_*` unset/present to confirm the workspace
   shell is hidden pre-auth.

## Open questions

None — decisions above are recorded authoritatively for the implementation
plan.