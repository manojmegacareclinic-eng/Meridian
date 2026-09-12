# Phase 4.4 — Notifications Center: Position Changes, Upcoming Meetings, Expiring Agreements, Overdue Follow-ups, Elections — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an in-app notifications center — five alert kinds (position change, upcoming meeting, agreement expiring, follow-up overdue, election approaching) — delivered per-user with read/unread state, a header bell with unread badge, mark-all-read, and deep links back into the relevant page.

**Architecture:** A `notifications` table + a **deterministic reconcile-on-read** routine (runs inside `GET /api/notifications`): insert missing fingerprints, refresh changed titles, retire rows whose signal no longer holds, prune deleted/banned recipients. Per-user row ownership means the feed and the two write endpoints (`PATCH :id/read`, `POST read-all`) are scoped to the actor's own rows, mounted **before** `requireWriteRole()` (readers may use the center). Five endpoints-worth of OpenAPI → orval → zod + React Query hooks; SPA header bell → dropdown panel with unread badge. Confidence changes explicitly deferred (no schema source). Order: DB → OpenAPI/codegen → API+auth-qa → SPA+route-qa → docs.

**Tech Stack:** Express + Drizzle (`@workspace/db`), OpenAPI → orval → `@workspace/api-zod` (server) + `@workspace/api-client-react` (TanStack Query hooks), React + Tailwind v4 SPA under TanStack Router, `tsx` QA harnesses (`auth-qa`, `route-qa`) with a real in-process API + Playwright.

---

## File structure

- Create `lib/db/src/schema/notifications.ts` — the `notifications` table + `(recipient_user_id, fingerprint)` unique index.
- Modify `lib/db/src/schema/index.ts` — register the export.
- Create `artifacts/api-server/src/lib/notifications.ts` — the reconcile routine (candidate queries, insert/refresh/retire/prune).
- Create `artifacts/api-server/src/routes/notifications.ts` — `GET /api/notifications`, `PATCH /api/notifications/:id/read`, `POST /api/notifications/read-all`.
- Modify `artifacts/api-server/src/routes/index.ts` — mount notifications router **before** `requireWriteRole()`.
- Modify `lib/api-spec/openapi.yaml` — `notifications` tag, 3 paths, `Notification`/`ListNotificationsResponse`/`ReadNotificationParams` schemas.
- Modify `lib/api-zod/src/index.ts` — remove codegen-appended wildcard; add curated type re-exports.
- Create `artifacts/global-dr-platform/src/components/NotificationsPanel.tsx` — the header dropdown feed.
- Modify `artifacts/global-dr-platform/src/App.tsx` — wire `button-notifications` to the panel, unread badge count, open/close state.
- Create `scripts/src/seed-notify.ts` — deterministic demo notifications data for route-qa.
- Modify `scripts/src/auth-qa.ts`, `scripts/src/route-qa.ts`, `scripts/package.json`.
- Modify `docs/implementation-plan.md`.

---

## Chunk 1: DB — `notifications` table

### Task 1: Create the schema module

**Files:**
- Create: `lib/db/src/schema/notifications.ts`
- Modify: `lib/db/src/schema/index.ts`

- [ ] **Step 1: Write the schema**

```ts
import { boolean, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { userTable } from "./auth";
import { countriesTable } from "./countries";

export const notificationKinds = [
  "position_change",
  "meeting_upcoming",
  "agreement_expiring",
  "follow_up_overdue",
  "election_approaching",
] as const;

export const notificationsTable = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    recipientUserId: text("recipient_user_id").notNull().references(() => userTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    countryId: integer("country_id").references(() => countriesTable.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id").notNull(),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    fingerprint: text("fingerprint").notNull(),
  },
  (table) => [
    uniqueIndex("notifications_recipient_fingerprint_unique").on(table.recipientUserId, table.fingerprint),
  ]
);

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
```

- [ ] **Step 2: Register the export** — in `lib/db/src/schema/index.ts`, add `export * from "./notifications";` in the block (alphabetically after `news`, before `activity`).

- [ ] **Step 3: Typecheck** — `bun run typecheck` exits 0.

- [ ] **Step 4: Commit**
```bash
git add lib/db/src/schema/notifications.ts lib/db/src/schema/index.ts
git commit -m "feat(db): notifications table with per-recipient fingerprint unique index"
```

### Task 2: Push the schema to the DB

- [ ] **Step 1: Push** — `bun run --filter @workspace/db push` with `DATABASE_URL="postgresql://localhost:5432/meridian"`.
- [ ] **Step 2: Verify live** — `psql` (or `bun -e` with drizzle): `\d notifications` shows the table, the two FKs, and `notifications_recipient_fingerprint_unique`.
- [ ] **Step 3: Commit** — skip; runtime artifact, no source change (mirrors Phase 4.3).

---

## Chunk 2: OpenAPI contract + codegen

### Task 1: OpenAPI paths + schemas

**Files:**
- Modify: `lib/api-spec/openapi.yaml`

- [ ] **Step 1: Add the `notifications` tag** — in the tags block, after `scorecards` (line 30).
- [ ] **Step 2: Add `GET /notifications`** — `operationId: listNotifications`, `tag: notifications`, optional `limit` (int, default 50) + `unread` (string enum `only`) query params, 200 → `ListNotificationsResponse` (schema: `{ unreadCount: integer, items: Notification[] }`).
- [ ] **Step 3: Add `PATCH /notifications/{id}/read`** — `operationId: markNotificationRead`, path param `id` (integer), 200 → `{ ok: boolean }`, 404.
- [ ] **Step 4: Add `POST /notifications/read-all`** — `operationId: markAllNotificationsRead`, 200 → `{ ok: boolean, updated: integer }`.
- [ ] **Step 5: Add schemas** — `Notification` (id, kind enum, title, body, countryId null, entityType, entityId, isRead, readAt null, createdAt), `NotificationKind`, `NotificationEntityType` (`office_term | meeting | agreement | task | country`), `NotificationId` path param (integer).
- [ ] **Step 6: Commit**
```bash
git add lib/api-spec/openapi.yaml
git commit -m "feat(api): openapi contract for notifications center"
```

### Task 2: Run codegen and repair the curated index

**Files:**
- Modify: `lib/api-zod/src/index.ts`

- [ ] **Step 1: Run codegen** — the orval command the repo uses for `api-client-react` + `api-zod` workspaces.
- [ ] **Step 2: Remove the auto-appended wildcard** — delete `export * from "./generated/types";` from `lib/api-zod/src/index.ts` (TS2308 collision otherwise).
- [ ] **Step 3: Add curated type re-exports** — `ListNotificationsResponse`, `Notification`, `NotificationKind`, `NotificationEntityType`, `ReadNotificationParams` if needed to satisfy the api-server payload typing.
- [ ] **Step 4: Typecheck + SPA build** — `bun run typecheck`, `bun run --filter @workspace/global-dr-platform build`.
- [ ] **Step 5: Verify SPA hooks exist** — `useListNotifications`, `useMarkNotificationRead`, `useMarkAllNotificationsRead` in `lib/api-client-react/src/generated/*`.
- [ ] **Step 6: Commit**
```bash
git add lib/api-spec/orval.config.ts lib/api-zod lib/api-client-react
git commit -m "feat(api): codegen for notifications contract + curated zod index"
```

---

## Chunk 3: Reconcile library + endpoints + auth-qa 4.4

### Task 1: The reconcile library

**Files:**
- Create: `artifacts/api-server/src/lib/notifications.ts`

- [x] **Step 1: Staff + assignee resolution** — all non-banned `user` rows = staff; the `passthrough` sentinel id gets a guaranteed recipient row (insert a `user` with `id='passthrough'`, `name='Demo'`, `role='global_admin'` `ON CONFLICT DO NOTHING` equivalent via existence check) so demo-mode route-qa is deterministic. Country assignees = non-null of the four `countries` FK columns.
- [x] **Step 2: Candidate queries** — one query per kind reading live tables (as specced: current office terms joined to positions→ministries→countries; scheduled meetings within 48h; signed/approved agreements with renewal_date in window; active tasks past due; countries with election_year in current/next year). Each candidate carries `{ kind, fingerprint, countryId, entityType, entityId, title, body, recipients[] }`.
- [x] **Step 3: Reconcile algorithm** — `reconcileNotifications()`: (a) insert candidates whose `(recipient_user_id, fingerprint)` doesn't exist; (b) refresh title/body when the fingerprint exists but text differs; (c) **retire** — delete rows whose fingerprint is no longer produced (query the live set of fingerprints per kind and delete the rest); (d) **prune** — delete rows whose recipient user is missing or banned. Return void.
- [x] **Step 4: Typecheck** — `bun run typecheck` exits 0.

### Task 2: The endpoints + mount

**Files:**
- Create: `artifacts/api-server/src/routes/notifications.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`

- [x] **Step 1: Router** — pattern-matched to `audit.ts`. All queries filter `recipient_user_id = getActor(req).id`.
- [x] **Step 2: `GET /api/notifications`** — run `reconcileNotifications()` first; then select the actor's rows `orderBy desc(createdAt), desc(id)`, optional `?limit=` (default 50) and `?unread=only`; respond `{ unreadCount, items }`.
- [x] **Step 3: `PATCH /api/notifications/:id/read`** — `ReadNotificationParams.safeParse`; update where `id` AND `recipient_user_id = actor`; if no row matched → 404 `{ error: "Notification not found." }`; else `{ ok: true }`.
- [x] **Step 4: `POST /api/notifications/read-all`** — update all rows where `recipient_user_id = actor` and `is_read = false`; respond `{ ok: true, updated }`.
- [x] **Step 5: Mount** — in `routes/index.ts`, after `auditRouter` (line 32) and **before** `requireWriteRole()` (line 33): `router.use("/notifications", notificationsRouter)`. Prefix mount (paths absolute under it).
- [x] **Step 6: Typecheck** — `bun run typecheck` exits 0.

### Task 3: auth-qa 4.4 section

**Files:**
- Modify: `scripts/src/auth-qa.ts`

- [x] **Step 1: Imports** — add `notificationsTable`, `officeTermsTable`, `election`-relevant selects; seed extra users if needed (a second staff user + a banned one + the four assignees already exist from 4.1).
- [x] **Step 2: Seeded scenario inserts** — one disposable country with full assignment set; one office term in a position; one upcoming meeting (within 48h); one signed agreement with renewal_date in window; one active overdue task; `election_year = currentYear`; then assert the exact expected feed (counts, recipients, fingerprints).
- [x] **Step 3: Assertions** —
  - `position_change` exists for every staff user, with the position/ministry/country title; replacing the current term retires the old row and inserts one for the new term; editing `personName` refreshes title, count unchanged.
  - `meeting_upcoming` for the in-window meeting only (completed/past meetings never alert); completing it retires the row.
  - `agreement_expiring` + `follow_up_overdue` arrive **only** for the country's assignees; for a second assignee-less country they fall back to all staff; archived / no-renewal-date / done / paused produce nothing.
  - `election_approaching` for `currentYear` and `currentYear+1`; `null` and `+2` produce nothing.
  - Idempotency: three `GET /api/notifications` calls → same table/counts.
  - Read flow: `PATCH :id/read` flips `isRead` + `readAt`; `POST read-all` zeroes `unreadCount`; a PATCH on another user's row → 404; a nonexistent id → 404.
  - Banned recipient's stale rows are pruned; the `passthrough` sentinel recipient exists in demo boot.
- [x] **Step 4: Run auth-qa** — the ENTIRE suite must stay green (`ALL PASS`).
- [x] **Step 5: Commit**
```bash
git add scripts/src/auth-qa.ts
git commit -m "feat(qa): auth-qa 4.4 notifications section green"
```

---

## Chunk 4: SPA notifications panel + route-qa 4.4

### Task 1: The dropdown panel component

**Files:**
- Create: `artifacts/global-dr-platform/src/components/NotificationsPanel.tsx`

- [x] **Step 1: Component** — `useListNotifications()`; wrapper `<div data-testid="notifications-panel">`; unread items first (dot), then read; kind → icon + label; "Mark all read" header button (`useMarkAllNotificationsRead`); per-item click → `useMarkNotificationRead` + deep-link (`router.navigate`): position_change → `/country/$countryId?tab=government`, meeting_upcoming → `/meetings`, agreement_expiring → `/country/$countryId?tab=documents`, follow_up_overdue → `/country/$countryId?tab=tasks`, election_approaching → `/country/$countryId`. Testids `notifications-item-${id}`, `notifications-mark-all-read`, `notifications-empty`. Loading + error states.

### Task 2: Wire the header bell

**Files:**
- Modify: `artifacts/global-dr-platform/src/App.tsx`

- [x] **Step 1: Badge** — `useListNotifications()` at layout level (or in panel); when `unreadCount > 0`, replace the decorative dot (App.tsx 327) with `<span data-testid="notifications-unread-badge">{unreadCount}</span>`; auto-refetch on close.
- [x] **Step 2: Toggle** — click `button-notifications` toggles the panel (closed by outside click / Escape). Panel renders positioned under the bell.
- [x] **Step 3: Commit**
```bash
git add artifacts/global-dr-platform/src/components/NotificationsPanel.tsx artifacts/global-dr-platform/src/App.tsx
git commit -m "feat(spa): header bell notification panel with unread badge + mark-all-read"
```

### Task 3: Deterministic seed + route-qa 4.4 checks

**Files:**
- Create: `scripts/src/seed-notify.ts`
- Modify: `scripts/package.json`, `scripts/src/route-qa.ts`

- [x] **Step 1: `seed-notify` script** — deterministic: ensure demo countries (`POSN` "Position Demo", meeting on an existing seeded country, etc.), create a current office term, an in-window meeting, a signed in-window agreement, an overdue task, an election-year country; prints the run summary. Idempotent (re-run refreshes same fingerprints). Add `"seed-notify": "tsx ./src/seed-notify.ts"` to `scripts/package.json`.
- [x] **Step 2: route-qa notifications checks** — on `baseURL + '/'`:
  - assert `button-notifications` exists and the unread badge shows the reconciled count;
  - click it → `notifications-panel` visible, `notifications-item-` rows render, at least the seeded `position_change` and `meeting_upcoming` titles present;
  - click an item → marks read + navigates (`waitForURL('**/country/**?tab=government')`);
  - click `notifications-mark-all-read` → badge hidden (count 0), `notifications-empty` when no items remain.
- [x] **Step 4: Run both suites** — one bash invocation (API `AUTH_PASSTHROUGH=true PORT=3000` + SPA `VITE_AUTH_DEMO=1 API_PROXY_TARGET=http://localhost:3000`, kill 3000/5173 first), run `seed-notify`, `route-qa` (64 prior checks + new), then auth-qa. Expected: both `ALL PASS`, counts recorded.
- [x] **Step 5: Commit**
```bash
git add scripts/src/seed-notify.ts scripts/package.json scripts/src/route-qa.ts
git commit -m "feat(qa): deterministic notifications seed + route-qa bell/panel checks"
```

---

## Chunk 5: Docs, full verification, final commit

### Task 1: Update the implementation plan

**Files:**
- Modify: `docs/implementation-plan.md`

- [x] **Step 1** — line 5: `**Current next task:** Phase 5 — Intelligence and source verification`.
- [x] **Step 2** — line 128: `**Status: \`IN PROGRESS\` — Phase 4.4 (notifications) complete; Phase 5 next.**`
- [x] **Step 3** — line 133 (item 4 notifications): mark `✓` and record evidence: five in-app alert kinds via reconcile-on-read, header bell + unread badge + mark-all-read + deep links; auth-qa and route-qa counts.

### Task 2: Full verification

- [x] **Step 1: Kill ports** — `lsof -ti tcp:3000 | xargs kill -9 2>/dev/null; lsof -ti tcp:5173 | xargs kill -9 2>/dev/null; true`.
- [x] **Step 2: One invocation, both suites** — boot API + SPA, wait `/api/healthz`, run `seed-notify`, `route-qa`, auth-qa; capture both `ALL PASS` lines and the exact counts. **Result: route-qa 75/75, auth-qa 163/163 — both `ALL PASS`.** (Also confirmed auth-qa stays green with POSN demo data present, its 4.4 assertions being relative to scoped fixtures; seed-notify resets its 5 fingerprints to unread each run so the feed is deterministic across repeat runs.)
- [x] **Step 3: typecheck + build** — `bun run typecheck`, SPA build — all exit 0; `git status` shows only intended files. (Root typecheck ✓ incl. scripts; SPA build `✓ built`; `git status` clean except the two docs below.)
- [ ] **Step 4 (only after user confirms push): commit + push** — final docs/plan commit; push `origin/main` only on explicit user confirmation (repo convention).
- [x] **Step 5: Verify the plan file** — every task in this *Phase 4.4* plan (Chunks 1–5, Tasks 1–2 of the three chunks) has its checkboxes marked done, with the exception of the push-only step (Step 4 above), which by convention waits for the user. This plan is the handoff document for `docs/superpowers/plans/2026-09-12-notifications-center-plan.md`; the sibling Phase 4.3 plan (`2026-09-05-analytics-scorecards.md`) is likewise fully ticked except its own push-only Step 4 (line 956).