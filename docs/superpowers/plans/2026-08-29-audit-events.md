# Audit Events (Task #3) — Implementation Plan

**Date:** 28 August 2026
**Source:** `docs/implementation-plan.md` → NEXT — Task #3: audit events
**Predecessor:** `2026-08-28-better-auth-migration.md` (all tasks DONE, committed)

## Objective

Record audit events for sensitive reads and all data changes so there is a
uniform, queryable trail of **who changed what (and who read confidential
records)**. Approved design (product owner, 28 Aug 2026):

- **Approach A** — extend the existing `activity` table with audit columns;
  one table serves both the "Recent activity" feed and a new `GET /api/audit`.
- **View access** — all signed-in users may query the audit trail (read access,
  like the activity feed); writes stay write-role/global-admin gated.
- **Sensitive reads to log** — dashboard summary, contact list (verification
  state), admin users/members lists. Mutation handlers log with actor.
- **UI** — new `/audit` page (filterable trail); activity feed stays as-is.

Failure mode: audit logging must never break the primary request path — rows
are written concurrently as a side effect and errors there are logged, not
propagated.

---

### Task A.1: Schema — `activity` gains audit columns

- **Files:** `lib/db/src/schema/activity.ts`
- Add nullable columns to `activityTable` (all nullable → backward compatible,
  existing rows keep rendering):
  - `actorId text("actor_id")`
  - `actorName text("actor_name")`
  - `action text("action")` — `create` | `update` | `read`
  - `entityType text("entity_type")` — `country` | `contact` | `meeting` |
    `agreement` | `admin_user` | `admin_invitation` | `dashboard_summary`
  - `entityId text("entity_id")`
  - `before jsonb("before")`, `after jsonb("after")`
- Verify: `bun run --filter @workspace/db push` (dev DB), typecheck.

### Task A.2: Actor name on the session + shared audit helper

- **Files:** `artifacts/api-server/src/middlewares/guards.ts`,
  `artifacts/api-server/src/lib/audit.ts` (new)
- Extend `req.actor` to `{ id, name, role }`; populate `name` from
  `session.user.name` (already on the Better Auth session; no extra query).
  Passthrough mode → `name: "Demo"`.
- New `writeAudit` helper: takes `{ actor, action, entityType, entityId,
  title, description, kind, countryId, before?, after? }` and inserts into
  `activityTable` inside try/catch (never throws to the caller).
- Small `diffFields(before, after, keys)` helper: produces `{ before, after }`
  objects limited to supplied field keys and only when values changed, so audit
  rows never echo full sensitive bodies (emails/phones at rest in one table).

### Task A.3: Instrumented handlers + sensitive reads

- **Files:** `artifacts/api-server/src/routes/platform.ts`,
  `artifacts/api-server/src/routes/admin.ts`
- Mutations (title stays human-friendly for the feed):
  | handler | action | entityType | before / after |
  | --- | --- | --- | --- |
  | POST /countries | create | country | after: {id, name, status} |
  | POST /contacts | create | contact | after: {id, name, verificationStatus} |
  | POST /meetings | create | meeting | after: {id, title, status, date} |
  | PATCH /meetings/:id | update | meeting | diff of changed fields |
  | POST /agreements | create | agreement | after: {id, name, status} |
  | PATCH /agreements/:id | update | agreement | diff of changed fields |
  | POST /admin/users | create | admin_user | after: {id, name, email, role} |
  | PATCH /admin/users/:id/role | update | admin_user | diff {id, role before/after} |
  | POST /admin/invitations | create | admin_invitation | after: {id, email, orgId} |
- Sensitive reads (action `read`):
  | handler | entityType |
  | --- | --- |
  | GET /dashboard/summary | dashboard_summary |
  | GET /contacts | contact |
  | GET /admin/users | admin_user |
  | GET /admin/members | admin_user |
- Reads write a short row (title/description summarizing the read, `entityId`
  null or a stable label). PATCH handlers fetch the existing row first so
  `before` is accurate.
- `digest` note: `AUTH_PASSTHROUGH` invites are 503 (already guarded) — no
  audit row for that failure.

### Task A.4: `GET /api/audit` (OpenAPI-first)

- **Files:** `lib/api-spec/openapi.yaml`, codegen output (regenerate), new
  `artifacts/api-server/src/routes/audit.ts`, mount in `routes/index.ts`
- OpenAPI:
  - tag `audit`; path `/audit` GET, operationId `listAudit`.
  - query params (optional strings): `action`, `entityType`, `entityId`,
    `actorId`, `limit` (integer, default 50, max 200).
  - response: array of `AuditEntry` = Activity item + `actorId`, `actorName`,
    `action`, `entityType`, `entityId`, `before`, `after` (nullable).
  - Enrich existing `Activity` component with nullable `actorName` so the feed
    can render the author.
- Router: `router.use("/audit", auditRouter)` after `/admin`, before platform
  (session guard already global). GET builds where-clauses from parsed filters,
  left-joins countries, `orderBy desc(occurredAt)`, clamps `limit`.

### Task A.5: SPA — nav item + `/audit` page

- **Files:** `artifacts/global-dr-platform/src/App.tsx`, new
  `artifacts/global-dr-platform/src/routes/audit.tsx`, `routeTree.gen.ts`
- Nav: add `{ href: "/audit", label: "Audit", icon: ScrollText }` to `navItems`
  (visible to all signed-in sessions incl. demo; renders in demo mode per the
  existing convention).
- `AuditPage`: PageIntro + filter bar (action select, entityType select, actor
  contains input, limit select, "Apply" clears to query) + table:
  actor (name + id), action pill, entity label, country, time, description;
  expandable before/after `<pre>` panels.
- Testids: `link-nav-audit`, `audit-filter-action`, `audit-filter-entity`,
  `audit-filter-actor`, `audit-filter-limit`, `button-audit-apply`,
  `audit-row-${id}`, `button-audit-toggle-${id}`, `audit-row-before-${id}`,
  `audit-row-after-${id}`.

### Task A.6: QA — extend `auth-qa`

- **Files:** `scripts/src/auth-qa.ts`
- After the existing admin country create: assert a `create`/`country` audit
  row exists for the disposable country with the actor id + name.
- Existing authenticated `GET /api/contacts` and `GET /api/admin/users` →
  assert subsequent `read` audit rows appear (query `/api/audit` filtered).
- `GET /api/audit` unauthenticated → `401`; as viewer/admin → `200`; filter by
  `entityType` works.
- Cleanup: existing blocks already delete the disposable country's activity
  rows and QA users; extend the residual check to count audit rows still
  referencing the disposable country (expect 0 after cleanup).

### Task A.7: Docs + roadmap

- **Files:** `docs/roles-and-permissions.md`, `docs/implementation-plan.md`
- roles-and-permissions.md: "Audit trail" section — who sees it (any signed-in
  session), the surface (activity feed + `GET /api/audit`), what is recorded
  (mutations with actor + before/after; sensitive reads), and that the trail is
  append-only (no user-writable audit columns).
- implementation-plan.md: mark Task #3 `DONE` with QA evidence; set the next
  task to Task #4 (expand the country/organization/institution/person model)
  per the Phase 1 roadmap item 4.

---

## Verify (per task progression)

```bash
bun run --filter @workspace/db push
bun run typecheck:libs && bun run --filter @workspace/api-spec codegen
bun run typecheck && bun run build
# QA suites (env: DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL)
bun run --filter @workspace/scripts auth-qa          # expect ALL PASS
# SPA: demo route-qa (API AUTH_PASSTHROUGH=true) + real-auth route-qa
```

## Status

All tasks A.1–A.7 are complete. QA evidence: `auth-qa` ALL PASS (26), demo `route-qa`
ALL PASS (18), real-auth `route-qa` ALL PASS (11); full typecheck + build green.

- **A.1** `461985a` feat(audit): activity schema gains actor/action/entity/before-after columns
- **A.2** `1cd7ecd` feat(audit): actor name on session and writeAudit side-effect helper
- **A.3** `d02bd2f` feat(audit): instrument mutations and sensitive reads with actor and before/after
- **A.4** `5b36dd1` feat(api): listAudit endpoint and audit-aware activity schema from OpenAPI
- **A.5** `2d4f256` feat(web): audit trail page with filters and before/after inspection
- **A.6** `4431c1f` test(api): auth-qa audit-trail assertions · `666c168` test(web): route-qa audit page checks
- **A.7** (commits below) docs: document audit trail and mark Task #3 done

## Commits (explicit pathspecs, never `git add -A`; 28 staged restoration files must stay staged)

1. `461985a` `feat(audit): activity schema gains actor/action/entity/before-after columns` — `lib/db`
2. `1cd7ecd` `feat(audit): actor name on session + writeAudit helper` — `artifacts/api-server/src`
3. `d02bd2f` `feat(audit): instrument mutations and sensitive reads with actor and before/after` — `artifacts/api-server/src/routes`
4. `5b36dd1` `feat(api): listAudit endpoint from OpenAPI spec` — `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`, `artifacts/api-server/src/routes`
5. `2d4f256` `feat(web): audit trail page` — `artifacts/global-dr-platform/src`
6. `4431c1f` `test(api): auth-qa audit assertions` — `scripts/src/auth-qa.ts`
7. `666c168` `test(web): route-qa audit page checks` — `scripts/src/route-qa.ts`
8. `docs: document audit trail and mark Task #3 done` — `docs/`