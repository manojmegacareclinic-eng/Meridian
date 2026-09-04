# Phase 4.1 Spec: Country Assignments

**Date:** 2026-09-04  
**Status:** Approved  
**Depends on:** Phase 3 (Diplomatic Relations & Engagement Workflows) — Complete

---

## Overview

Phase 4.1 adds the first piece of Phase 4 (Deliverables, tasks, and notifications) of the
Global Diplomatic Relations platform: **country assignments**. Each country can be assigned
a primary owner, secondary owner, reviewer, and regional coordinator — all drawn from the
app's user accounts. Assignments are **informational** (organisation, attribution, and a
foundation for later scorecards); they do **not** change authorization.

The change is deliberately small and additive: four nullable FK columns on `countries`,
nested assignee objects on the existing country read endpoints, one lightweight users-list
endpoint, and UI on the country detail page and the country list/map.

---

## 1. Data Model

`lib/db/src/schema/countries.ts` gains four nullable foreign-key columns to the Better Auth
`user` table (`lib/db/src/schema/auth.ts` → `userTable`):

| Column | Drizzle field | Type | References |
|---|---|---|---|
| `primary_owner_user_id` | `primaryOwnerUserId` | `text`, nullable | `userTable.id`, `onDelete: "set null"` |
| `secondary_owner_user_id` | `secondaryOwnerUserId` | `text`, nullable | `userTable.id`, `onDelete: "set null"` |
| `reviewer_user_id` | `reviewerUserId` | `text`, nullable | `userTable.id`, `onDelete: "set null"` |
| `regional_coordinator_user_id` | `regionalCoordinatorUserId` | `text`, nullable | `userTable.id`, `onDelete: "set null"` |

Note: `userTable.id` is `text` (Better Auth string UUIDs), so these columns and every
`*UserId` value in the API payloads are **strings**, never integers (country `id` stays
`serial`).

No new table, no jsonb, no history. If a user is deleted their assignment becomes `null`
(referential integrity preserved, historical ownership is out of scope for this phase).

The existing free-text `countries.team` field is **kept untouched and coexists** with
assignments: `team` is a grouping label (already used by the map/list filter), assignments
are individual accountability.

---

## 2. API Contract

### 2.1 OpenAPI changes (`lib/api-spec/openapi.yaml` + codegen)

- **`Country`** (used by `GET /countries` list and `GET /countries/:id`) gains four nested
  read objects, each `{ userId: string, name: string } | null`:
  `primaryOwner`, `secondaryOwner`, `reviewer`, `regionalCoordinator`.
- **Country update body** (`PATCH /countries/:id`) gains four optional nullable **strings**:
  `primaryOwnerUserId`, `secondaryOwnerUserId`, `reviewerUserId`, `regionalCoordinatorUserId`.
  Sending `null` clears the assignment. Values are user UUID strings.
- **New path `GET /users/assignable`** → `200` with `[{ userId: string, name: string, role: string }]`
  ordered by name, **excluding banned users** (`banned = false`). **Email is never returned**
  (consistent with the audit "no sensitive bodies echoed" rule).

### 2.2 Behavior of `GET /countries` and `GET /countries/:id`

The existing `countryFields` select in `artifacts/api-server/src/routes/platform.ts` gains
the four FK columns. After the row select, one `SELECT id, name FROM user WHERE id IN (…)`
query resolves the four columns (empty user set → no names → all `null`); every list row and
the single-country response gets the four nested objects attached.

### 2.3 Behavior of `PATCH /countries/:id`

- Parse the four optional nullable strings.
- If any supplied id is present but **not a real user id**, return `400 { error: "…" }`
  *before* the FK constraint turns it into a 500. (Drizzle `push` creates the FK in Postgres,
  so the constraint is live; the explicit check keeps the failure a clean 400.)
- Update the row, resolve names as in 2.2, return the full country (with nested assignees).

### 2.4 `GET /users/assignable`

- `router.get("/users/assignable", …)` in `platform.ts`.
- **The shared `requireWriteRole()` mount gate does NOT protect this route**: that middleware
  bypasses `GET`/`HEAD`/`OPTIONS` (see `artifacts/api-server/src/middlewares/guards.ts`), so the
  handler must enforce the gate itself — an explicit `getActor(req)` check that **rejects any
  role not in `WRITE_ROLES`** (currently: anything except `viewer`, with null/unknown roles
  rejected too), mirroring the `requireWriteRole` semantics in `guards.ts`.
- Returns id/name/role for all non-banned users, ordered by name.

Note: users with `banned: true` are excluded outright this phase. Time-scoped bans
(`banExpires` in the past) are **not** re-admitted — acceptable for informational
attribution; revisit only if exact ban semantics matter later.

---

## 3. Audit

No new audit entity type. Assignment changes ride the existing country-update audit path:
the `diffFields` allowlist at `platform.ts:159`
(`["name", "region", "status", "riskLevel", "language", "governmentType", "electionYear", "team", "priority", "strategy"]`)
gains the four assignment keys (`primaryOwnerUserId`, `secondaryOwnerUserId`,
`reviewerUserId`, `regionalCoordinatorUserId`). A PATCH that only changes an owner therefore
emits one `country` update row with a before/after diff limited to that key.

---

## 4. SPA UI

### 4.1 Country detail — Overview tab "Assignments" block

A new card/section on the Overview tab of `CountryDetailPage` (`App.tsx`) rendering four
rows —

| Row | Shows |
|---|---|
| Primary owner | Assignee name + role chip, or "Unassigned" |
| Secondary owner | Assignee name + role chip, or "Unassigned" |
| Reviewer | Assignee name + role chip, or "Unassigned" |
| Regional coordinator | Assignee name + role chip, or "Unassigned" |

### 4.2 Editing — inside the existing "Edit details" modal

The four assignment selects are added to the existing "Edit details" `AddDialog` (which
already PATCHes the country and carries the `button-country-edit`/`country-field-*` testids):

- Four `<select>`s, each listing all assignable users (`{ userId, name, role }`) plus a
  blank "Unassign" option; pre-filled from the current assignee.
- Options labelled `name — role` so the role chip is redundant in the picker but the display
  block still shows the chip for readability.
- On save, `updateCountry.mutate({ id, data: { …4 ids, plus existing editable fields } })`;
  invalidate `getGetCountryQueryKey(id)` and `getListCountriesQueryKey()` on success.
- Data source: new generated hook `useListAssignableUsers()` (`GET /users/assignable`),
  fetched only when the edit modal is open (lazy), so viewers never request it and writers
  get a fresh list per open.

### 4.3 Country list + map badges

- `CountryCard` (list rows on `/countries`): when the primary owner is set, show a small
  chip with the owner's first name (or initials). Insert after the risk/team metadata row,
  before the contacts/meetings count grid — the card is compact, so the chip renders inline
  with that metadata rather than adding a new block. Nothing when unassigned.
- `WorldMap` tooltip: no change unless trivial — the detail page is the canonical surface,
  and the map tooltip already carries the essentials. (Decided during design: badges on list
  rows only; the map layer is left as-is to avoid a noisy tooltip.)

### 4.4 No new routes

Everything renders inside existing pages; no TanStack route additions.

---

## 5. Authorization Semantics

- Assignments are **informational only**. The existing global role gates are unchanged:
  `viewer` = read-only everywhere; all writers can read and edit assignments; `GET
  /users/assignable` is gated inside its handler (viewer → `403`), not by the mount
  middleware.
- Assigning any user (including a `viewer`) to a role is allowed — it is attribution, not
  privilege. No cross-role restrictions are introduced in this phase.

---

## 6. QA Plan

### 6.1 auth-qa (`scripts/src/auth-qa.ts` — extends the existing country block)

1. Create a country → assert all four nested assignees are `null`.
2. Create a disposable assignee via the established `createAccount` helper from
   `@workspace/auth` (the same mechanism auth-qa already uses for its qa/viewer accounts)
   — yields a real user id + name to assert against.
3. `GET /api/users/assignable` → array; each item has `userId`, `name`, `role`; the seeded
   user is present; shape matches the contract. **Banned exclusion asserted for real**: mark
   the disposable assignee `banned: true` via a direct `db.update(userTable).set({ banned: true })`;
   assert they disappear from the list; then clear `banned` back to `false` before the
   assignment assertions.
4. `GET /api/users/assignable` as the **viewer** role → `403` (the in-handler gate, not the
   mount middleware).
5. `PATCH /countries/:id` with `primaryOwnerUserId` = seeded user → `200`; response echoes
   `primaryOwner: { userId, name }`.
6. `PATCH` with a bogus user id → `400`.
7. `PATCH` with `primaryOwnerUserId: null` → assignment cleared (`null`).
8. Audit: the assignment-change PATCH produced a `country` update row; the `after` diff
   includes the changed assignment key.
9. Cleanup: delete the seeded country and the disposable assignee before teardown. Follow
   the existing country/user teardown ordering so dependents are removed first — users have
   cascade sources in `session`/`account`/`member`, so deleting the user row then relies on
   the same cascade behavior auth-qa already asserts for its disposable accounts.

### 6.2 route-qa (`scripts/src/route-qa.ts`)

Stable demo-mode assertions (passthrough demo has no user rows, so the unassigned state is
the reliable one):
1. Country detail Overview tab shows a block titled **Assignments**.
2. All four rows show the "Unassigned" placeholder.
3. Country list rows do **not** show a primary-owner chip (nothing crashes, chip simply
   absent).

No end-to-end assigned-state browser assertion in demo mode — assigning requires a real user
row, which the demo environment does not provide. The API-level path is covered by auth-qa.

---

## 7. Verification & Delivery

- `bun run --filter @workspace/db push` (applies the 4 new columns to the live DB).
- `bun run typecheck` (libs + all workspaces clean).
- Codegen: `bun run --filter @workspace/api-spec codegen` → **manually remove the appended
  `export * from './generated/types';` line** from `lib/api-zod/src/index.ts` if the patch
  script re-inserts it (known codegen pitfall) → rebuild `npx tsc --build lib/api-client-react`.
- auth-qa, route-qa, SPA `build` all green.
- Commit message: `feat(country-assignments): owners, reviewer, coordinator per country`.

---

## 8. Non-Goals (explicitly out of scope for 4.1)

- Assignment-based access control / resource-level authorization.
- Assignment history or a separate `country_assignment` audit entity.
- Multiple holders of the same role on one country.
- Replacing or filtering by the free-text `team` field.
- Scorecards, completion %, SLA — these wait for later Phase 4 sub-projects (deliverables,
  analytics) and are listed here only so their dependency on assignments is recorded.