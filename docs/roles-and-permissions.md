# Roles & permissions

Access control is served by **Better Auth** (self-hosted authentication) plus a
small Express enforcement layer. This document defines the workspace role model,
how a user is assigned a role, and how the rules are enforced on the server.

## Sign-in requirement

- **Web app:** the workspace UI (the Shell) is gated behind a sign-in screen.
  Without a valid, loaded session you see only the branded sign-in screen plus
  the route-level 404. No country, contact, meeting, agreement, or activity
  data is rendered before sign-in.
- **API:** every route except `GET /api/healthz` requires a valid signed-in
  session. The `requireSession` guard (Better Auth session cookie) rejects
  requests with `401`.

`GET /api/healthz` is public on purpose: it returns a static `{ status: "ok" }`
used by operational probes and leaks nothing.

## Roles

A user's global role lives on the user record (`user.role` in the database),
assigned at account creation and changeable only by a `global_admin` (from the
Administration page or `PATCH /api/admin/users/:id/role`). Org memberships in
the `member` table are bookkeeping-only; access control keys off the global
role.

| Role | Capability summary |
| --- | --- |
| `global_admin` | Full access, including the `/admin` API group: create accounts, change roles, invite others into the workspace org. |
| `regional_director` | Full access across the portfolio; owns regional strategy and scoring. |
| `country_lead` | Full access within assigned country workspaces and portfolio records. |
| `research` | Full access to records; contributes research, sources, and verification. |
| `meeting_coordinator` | Full access to records; drives scheduling, briefings, and follow-up. |
| `viewer` | Read-only access to the workspace. No create, update, or delete. |

## Enforcement

All enforcement happens server-side; the UI gate is a convenience, not the
control.

1. **Authenticated by default** — `requireSession()` runs on every `/api`
   route (except `/api/healthz`). Unauthenticated → `401`.
2. **Write-role guard** — `requireWriteRole()` runs on every mutating request
   (`POST`, `PATCH`, `PUT`, `DELETE`). A `viewer` session (or a session whose
   role cannot be determined) → `403`. Read requests always pass through.
3. **Admin guard** — admin routes under `/admin` additionally require
   `requireDataRole("global_admin")`; any other role (or a non-session) → `403`.
4. **Legitimate role values** — only the six roles above are accepted; anything
   else is treated as "role undetermined" and treated like `viewer` for writes.

As features that genuinely need narrower permissions arrive (audit events,
document workflows, admin actions), add per-route checks with the session actor
and the role claim rather than weakening the default guards.

## Email verification

New accounts are created with a temporary password and an email-verification
token. Sign-in with a temp password is rejected with `403 EMAIL_NOT_VERIFIED`
until the user visits the verify link (token delivered by console or SMTP).
Bootstrap admins created with `--verify` skip this step.

## Development without a deployed instance

Both layers degrade gracefully so the codebase stays runnable without an
external auth provider:

- API: without a valid `BETTER_AUTH_SECRET` the server refuses to start (fail
  fast rather than silently open). With `AUTH_PASSTHROUGH=1`,
  `requireSession`/`requireWriteRole` become pass-through — **all routes are
  open**. Never enable pass-through in production.
- Web app: without `VITE_AUTH_DEMO=1` the app boots to the sign-in screen and
  stays hidden until a session loads. With `VITE_AUTH_DEMO=1` it renders a demo
  global-admin session (sign-out hidden; admin nav suppressed) for frontend-only
  work.

See `artifacts/global-dr-platform/.env.example` and
`artifacts/api-server/.env.example`.

## Bootstrap

```sh
bun run --filter @workspace/db push
bun run --filter @workspace/scripts create-user admin@meridian.gov "Ada Lovelace" --role global_admin --verify
```

The first `--verify` global admin is also made owner of the seeded "Meridian"
workspace org; the temp password is printed once at creation.

## Verification checklist

To confirm access control is wired correctly:

1. Visit the app signed out → only the sign-in screen renders.
2. Sign in → the workspace opens and the header shows your name, email, and role.
3. `curl -i http://localhost:3000/api/countries` without a session → `401`.
4. Sign in with a `viewer` account and attempt `POST /api/countries` → `403`.
5. Sign in with a write-role account and `POST /api/countries` → `201`.
6. Sign in as a non-`global_admin` and call `GET /api/admin/users` → `403`.
7. Sign in as a `global_admin` → `GET /api/admin/users` → `200`, and the
   Administration page (`/admin`) renders the user table.