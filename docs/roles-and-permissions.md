# Roles & permissions

Everything below describes the Better Auth self-hosted implementation (see `auth` in
`artifacts/api-server/src/lib/`, schema in `lib/db/src/schema/`).

## Sign-in requirement

- Every route under `/api` (except `/api/healthz` and the Better Auth route) requires a
  verified session. Unverified users get `403 EMAIL_NOT_VERIFIED` on sign-in and never
  reach data routes.
- An **application owner** (`global_admin`) can create accounts and invitations and picks
  the role. Anyone signed in can see the app shell; data routes additionally enforce the
  role checks below.

## Roles

| Role | Can see | Can write |
| --- | --- | --- |
| `viewer` | All read routes, including the audit trail | Nothing |
| `country_lead` | Everything | Everything |
| `meeting_coordinator` | Everything | Everything |
| `research_team` | Everything | Everything |
| `global_admin` | Everything (incl. `/admin`) and the audit trail | Everything plus user/invitation administration |

Site access is role-independent: an unverified non-member or a `viewer` still returns
`401`/`403` rather than a rendered denial page, and role-specific nav appears only when
the user's role allows it.

## Enforcement

- Admin API: `GET/POST /api/admin/users`, `GET /api/admin/members`,
  `POST /api/admin/invitations`, `PATCH /api/admin/users/:id/role` require
  `role === global_admin`. A `viewer` gets `403` on these.
- Write routes (POST/PATCH on countries, contacts, meetings, agreements, invitations,
  DR strategies, agenda/participants/transcripts, action items, deliverables, and the
  agreement lifecycle) require `role !== viewer` — the same `requireWriteRole()` guard
  in `routes/index.ts` covers every Phase 2/3 write endpoint.
- Every request maps a verified session (or the dev `AUTH_PASSTHROUGH` session) to an
  actor `{ id, name, role }`; the actor name and id are stamped onto audit rows.

## Email verification

- `createAccount` mints a verification token. Signing in before verifying is rejected.
  `verify-email?token=…` verifies (and auto-signs-in).
- In production the token is emailed via SMTP; in development the default console
  transport prints it to logs, and `sendOnSignIn` re-issues one at each unverified sign-in.

## Audit trail

Every data change and every sensitive read writes an **append-only** `activity` row (via
`writeAudit` in `artifacts/api-server/src/lib/audit.ts`, which never throws into the
primary request path):

- **Writes** — create/update on countries, contacts, meetings, agreements, admin
  users, invitations, ministries, positions, office terms, organizations, documents,
  news, DR strategies, meeting agenda items, meeting participants, meeting transcripts,
  action items, and deliverables. Updates carry a compact `before`/`after` diff over an
  allowlist of keys (e.g. `title`, `status`, `date`, `roles`), so sensitive full bodies
  (emails, phone numbers) are never echoed.
- **Sensitive reads** — dashboard summary, contact records, and the admin user/member
  directory. These are `action: "read"` rows with the actor.
- Each row has the actor id/name, action, entity type + id, and timestamp. The foreign
  key to countries is preserved so a country's whole trail can be deleted with it.

The trail is queryable in two ways:

1. **Activity feed** — `GET /api/activity` (summary entries, used by the Overview page).
2. **Audit endpoint** — `GET /api/audit` (`listAudit`) with filters for `action`,
   `entityType`, `entityId`, and `actorId`, default limit 50, max 200.

**Who can view it:** every signed-in user (roles `viewer` and up). Unauthenticated access
returns `401`. The `/audit` page surfaces filterable, expandable before/after records.
Records are not editable or deletable through the application.

**New entity types** (Phase 2): ministries, positions, office_terms, organizations, documents, news — all audited with `action` ∈ {create, update, delete} and `entityType` matching the entity name.

**New entity types** (Phase 3): dr_strategies, meeting_agenda, meeting_participants, meeting_transcripts, action_items, deliverables — all audited the same way; the agreement lifecycle transition writes an `agreement` update row via `PATCH /api/agreements/:id/lifecycle`.

## Development without a deployed instance

- `VITE_AUTH_DEMO=1` + `AUTH_PASSTHROUGH=true` puts the web/api in dev passthrough mode
  (no login wall; the actor is `Demo`). Set `AUTH_PASSTHROUGH` to the literal `"true"`.
- Otherwise run a real database (see `DATABASE_URL`), `db push` the schema, and bootstrap
  an owner with `bun run create-user email name --role global_admin --verify`
  (`--verify` returns a one-time console-link to verify instantly). Full SMTP setup:
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`.
- In development, point `BETTER_AUTH_URL` at the web dev server
  (`http://localhost:5173`) so browser sessions resolve correctly.

## Bootstrap

`db push` + `create-user` on a fresh database produce exactly one verified `global_admin`;
no other rows are created, so a clean instance contains just that account.

## Verification checklist

1. unauthenticated API → `401`; authed-but-unverified sign-in → `403 EMAIL_NOT_VERIFIED`.
2. `viewer` can read everything (including `/api/audit`) but every write → `403`.
3. `global_admin` can create users (gets temp password + token), invite, and change roles.
4. Every create/update on countries/contacts/meetings/agreements/users/invitations
   produces an audit row with the actor and before/after where relevant.
5. `GET /api/audit` reflects those rows and honors `action`/`entityType`/`entityId`/
   `actorId` filters; no user can create or edit audit rows through the API.