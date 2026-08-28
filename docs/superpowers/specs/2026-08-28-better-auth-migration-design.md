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
- Optional Google/GitHub social sign-in (config-only in this migration; inert
  on this network, testable where OAuth endpoints are reachable)
- Migration away from Clerk (delete all Clerk wiring)

Explicitly out of scope (future work): 2FA, password reset/change out-of-band,
multi-organizational data partitioning.

**Phasing within the plan.** Although one plan covers the whole migration, it
is ordered so the core swap lands first and is shippable/verifiable on its own:
(1) schema + Better Auth core + guards replace Clerk — verifies 401-enforcement
against a fresh DB; (2) email verification + **CLI bootstrap** (first admin +
org, needed for any sign-in verification) + org + rate limiting — ends with a
provisioned admin and a real sign-in test; (3) admin panel (API + web page).
Each phase leaves the build green and the API auth-enforcing.

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

Auth is **on by default** whenever the API boots. There is no silent
auto-degradation: the guards enforce against the auth tables, which exist once
`drizzle-kit push` has run. Two explicit dev-only escape hatches exist (both
default OFF, both documented in `.env.example`):

- API: `AUTH_PASSTHROUGH=true` makes the guards pass-through (frontend-only
  development; never set alongside a reachable database in a real deployment).
- SPA: `VITE_AUTH_DEMO=1` shows the demo session ("Demo Analyst" /
  `global_admin`) without contacting the backend (frontend-only development).

`clerkAuth.ts` is deleted.

## Frontend

In `artifacts/global-dr-platform/src`:

- `lib/auth.tsx` rewritten around `createAuthClient` + `useSession()`:
  SessionProvider, loading state ("Preparing the workspace"), sign-in, sign-out.
  The demo session shows only when `VITE_AUTH_DEMO=1` (see §Enforcement).
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
  before signing in for the first time.
- `emailVerification` plugin: OTP codes stored in the `verification` table,
  `autoSignInAfterVerification`.
- **Verification timing:** the verification code is sent at **account
  creation** (when the CLI or `POST /api/admin/users` creates the user),
  alongside the temporary password, via the transport below. The planner must
  verify Better Auth's exact semantics so sign-in remains blocked until
  verified — if Better Auth only triggers emails on `sendVerificationEmail`
  hooks, the create path triggers the hook with the stored account so the email
  goes out immediately. This same create path covers both the CLI bootstrap and
  the admin API.
- **Bootstrap admin:** the CLI's first user (the `global_admin` org owner)
  can't receive email on a blocked network, so `create-user --verify` marks the
  account `emailVerified` at creation and **skips the OTP send** — offline
  bootstrap escape, documented in the CLI help. With `--verify`, the CLI prints
  the server-generated temp password so the admin has a documented sign-in
  path. Admins created later via the admin API (that is, without `--verify`)
  go through the normal verification path: code sent at creation, sign-in
  blocked until verified.
- **Transport is pluggable:**
  - Dev / blocked network: console transport logs the code/token to the server
    log (still exercises the full flow end-to-end).
  - When SMTP env vars are present: real email via SMTP.
- Verified state persists on `user.emailVerified`.

## Organizations

- Organization plugin enabled; **one seeded workspace org, "Meridian"**.
- The bootstrap CLI idempotently upserts the workspace org (org must exist
  before any invitation can be created) and creates the first `global_admin`
  as the org `owner`.
- Accounts are **admin-created** (`disableSignUp`); this is the entry point.
  The planner must verify Better Auth's invitation semantics for managed-only
  sign-up — if invitations cannot bootstrap a brand-new account, the intended
  flow is: admin creates the account first, then the invitation grants org
  membership (single-org, `member`).
- All users are members of the single org. Data-access role stays on
  `user.role`, defaulting to `viewer` for new members.
- **Org membership is administrative/bookkeeping only — it is not enforced by
  any data-access guard.** All authorization keys off `user.role`; membership
  exists so the org-plugin surface (members, invitations) is real but does not
  silently create a second access path.

## Admin panel & API

Custom guarded endpoints under `/api/admin` (deliberately not Better Auth's
admin plugin, so the workspace role model stays coherent). A new `adminRouter`
is mounted in `routes/index.ts` in this order — `healthRouter` → session guard →
`adminRouter` (guarded by `requireDataRole("global_admin")`) → write-role guard →
`platformRouter`. The admin guard runs before the write-role guard so admin
read endpoints are also admin-only; the session guard runs before both.

- `GET /api/admin/users` — list users (name, email, role, verified, member?)
- `POST /api/admin/users` — create user (email, name, role); a temporary
  password is **server-generated** and returned in that one response plus
  logged via the console/SMTP transport; verification code sent immediately
  at creation
- `PATCH /api/admin/users/:id/role` — set global role
- `GET /api/admin/members` — org members and pending invitations
- `POST /api/admin/invitations` — invite an existing account to the workspace
  org by email (membership grant; new members default to `viewer`)

Web: `/admin` route (visible only to `global_admin`, nav item "Administration"
or under Governance) consuming these endpoints, with data-testids for QA.

## Rate limiting

- Better Auth's built-in `rateLimiter` plugin.
- **Secondary storage is Postgres-backed** (single dependency): a `rate_limit`
  KV table (key, value, expiresAt) implementing Better Auth's
  `SecondaryStorage` interface via our `lib/db` drizzle instance. No Redis.
- Rules target the auth surface only, keyed concretely:
  - sign-in attempts: 5 / 60s per key (key = email + client IP)
  - verification-code requests: 3 / 60s per client IP
- Not applied to the data API (feeds on the confidential records stay
  unrestricted apart from auth).

## Environment & bootstrap

- `BETTER_AUTH_SECRET` (generate once: `openssl rand -base64 32`).
- Optional: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`,
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`,
  `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`.
- `.env.example` updated in both `artifacts/global-dr-platform/` and
  `artifacts/api-server/` (drop `VITE_CLERK_PUBLISHABLE_KEY`,
  `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`). Placement: the SPA example
  gains `VITE_AUTH_DEMO` (off by default); the API example gains
  `AUTH_PASSTHROUGH` (off by default), `BETTER_AUTH_SECRET`, and the optional
  `SMTP_*` / `GOOGLE_*` / `GITHUB_*` keys. `VITE_AUTH_DEMO` and
  `AUTH_PASSTHROUGH` are a **dev pairing** — use them together (demo SPA +
  passthrough API), or the missing side produces confusing 401s.
- `scripts/` package gains a `create-user` CLI
  (`create-user <email> <name> --role global_admin`) that idempotently seeds
  the workspace org and the first admin (org `owner`).
- README, `docs/roles-and-permissions.md`, and `docs/implementation-plan.md`
  updated (Task #2 rewritten as "Self-hosted sign-in (Better Auth)").

## Migration & cleanup

- Remove `@clerk/react` and `@clerk/themes` from `global-dr-platform` and
  `@clerk/express`, `@clerk/shared` from `api-server`; `bun install` prunes.
- Delete `artifacts/api-server/src/middlewares/clerkAuth.ts`.
- Remove `ClerkProvider` / `SignInButton` and token-getter plumbing from the
  web app; replace with the Better Auth client.
- Add the new Drizzle tables via `drizzle-kit push` (existing workflow). A
  fresh database gets all tables — including the auth/core/org tables — in one
  push; a real DB with data tables gets the auth tables added in place.

## Verification & testing

1. `bun run typecheck` and `bun run build` pass (all workspaces).
2. **Frontend demo-mode QA:** with `VITE_AUTH_DEMO=1` plus a stub data API for
   the React Query pages (the mockup-sandbox pattern), run the Playwright
   route QA — all pages render, correct header h1s and active nav, 404, demo
   user in the header, zero console errors. Note: demo mode fakes only the
   session, not the data, so without the stub data API the pages' network
   failures are expected and asserted as such rather than "zero errors." The
   route-QA helper is **added** to the `scripts/` workspace (new Playwright
   devDependency there) so it is kept in-repo rather than a throwaway temp
   file.
3. **DB-backed auth test** (with a Postgres). Phase 2 exercises the loop via a
   CLI-created user **without** `--verify`; the admin-API bullets only become
   runnable in phase 3 (they need `POST /api/admin/users`):
   - unauthenticated `/api/countries` → 401
   - create a user → temp password + OTP code appear in server log
     (console transport); unverified sign-in is rejected
   - OTP verify → sign-in succeeds → session cookie set, `/api/countries` → 200
   - `viewer` role POST → 403; `global_admin` POST → 200
   - admin endpoints blocked for non-`global_admin` → 403 (phase 3)
4. **Gate test:** real-auth mode (no `VITE_AUTH_DEMO`) with no session →
   workspace shell hidden ("Preparing the workspace" / sign-in shown); with a
   session → shell renders.

## Open questions

None — decisions above are recorded authoritatively for the implementation
plan.