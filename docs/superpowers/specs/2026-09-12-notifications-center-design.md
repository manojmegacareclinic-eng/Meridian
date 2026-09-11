# Phase 4.4 — Notifications Center: position changes, upcoming meetings, expiring agreements, overdue follow-ups, elections

**Status:** Draft for review
**Date:** 2026-09-12
**Supersedes:** nothing
**Project:** Meridian — Global Diplomatic Relations (GDP) platform

---

## Why this feature

The product brief calls for a **Notifications Center** and an **Alerts** surface: `Alert: Minister changed. / Meeting tomorrow. / Agreement expiring. / Follow-up overdue. / New proclamation received. / Election approaching. / AI confidence dropped.` with channels Email and WhatsApp (brief lines 769–793). Phase 4 (plan item 4) scopes this as "notifications for position changes, upcoming meetings, expiring agreements, overdue follow-ups, elections, and confidence changes — **in-app first**."

Today the SPA header already renders a bell button (`button-notifications`, App.tsx line 327) with a decorative red dot and **no behavior**. This phase makes it real.

## Goals

- A per-user, in-app notifications feed populated by a **deterministic reconcile** over live data, so alerts are always true to the current state of the workspace (never stale, never duplicated).
- Five alert kinds, each derivable from schema that already exists: **position change**, **upcoming meeting**, **agreement expiring**, **follow-up overdue**, **election approaching**.
- Assignment-aware delivery: country-scoped alerts reach the country's owners/assignees; workspace-wide alerts reach all staff.
- Read/unread state per user, a "mark all read" action, and click-through deep links back into the relevant page.
- The header bell becomes a working dropdown panel with an unread-count badge.

## Non-goals

- **Confidence changes** (`AI confidence dropped`) — no confidence/verification-score column exists anywhere in the schema; the field itself is a precondition, not derivable from current data. Deferred until an AI confidence source lands (plan item 4 explicitly lists it; decision made in design).
- **"New proclamation received"** (news) alerts — the plan scopes Phase 4.4 to the six kinds above; news-intelligence notifications belong with Phase 5 (Intelligence and source verification).
- **Email / WhatsApp / Telegram / Slack channels** — explicitly in-app first; channel delivery is plan item 5, deferred.
- No scheduled/cron generation — reconcile runs **on read**, idempotently; no background worker, no notification preferences page, no per-kind opt-out.
- No notification *history* — notifications are a live set over current state; a row disappears when its underlying condition no longer holds (read/unread history is not retained).

---

## Alert kinds and definitions

All windows use the same time basis as the scorecards phase: the server's current **UTC** calendar date for date fields (`YYYY-MM-DD`), and the exact timestamp for `meetings.date`.

### `position_change`

**Signal:** an `office_terms` row with `is_current = 1` (the current holder of a position). A new current term (new `id`) means a handover. Joined to `positions.title` → `ministries.name` → `countries.name`.

**Title/body:**
```
New position holder — <position title> — <ministry> — <country>
<personName> is now the current holder of <position title>.
```

**Fingerprint:** `position_change:<officeTermId>`. If `personName` on the *same* current term is edited, the existing row's title/body is refreshed, not duplicated.

**Recipients:** all staff.

### `meeting_upcoming`

**Signal:** `meetings.status = 'scheduled'` and `date` within `(now, now + 48h]`. Completed/cancelled/follow-up meetings excluded.

**Title/body:**
```
Upcoming meeting — <title> — <country>
Scheduled <ISO date/time> · <actionArea>.
```

**Fingerprint:** `meeting_upcoming:<meetingId>`.

**Recipients:** all staff.

### `agreement_expiring`

**Signal:** `agreements.lifecycle_state IN ('approved','signed')` (operative, not draft/archived) and `renewal_date` within `[today, today + 30 days]`.

**Title/body:**
```
Agreement expiring — <name> — <country>
Renewal date <renewalDate> · <type>.
```

**Fingerprint:** `agreement_expiring:<agreementId>`.

**Recipients:** the agreement's **country assignees** (non-null of `primaryOwnerUserId`, `secondaryOwnerUserId`, `reviewerUserId`, `regionalCoordinatorUserId`). If the country has **no assignees**, fall back to **all staff** so the alert is never orphaned.

### `follow_up_overdue`

**Signal:** `tasks.status = 'active'` and `due_date < today` (the same overdue predicate as the scorecards failure board).

**Title/body:**
```
Overdue follow-up — <task title> — <country>
Due <dueDate> · <actionArea>.
```

**Fingerprint:** `follow_up_overdue:<taskId>`.

**Recipients:** the task's country assignees; fallback to all staff if the country has no assignees (same rule as agreements).

### `election_approaching`

**Signal:** `countries.election_year` within `[currentYear, currentYear + 1]` (this calendar year or next).

**Title/body:**
```
Election approaching — <country>
Election year <electionYear>.
```

**Fingerprint:** `election_approaching:<countryId>:<electionYear>` (a changed year re-alerts once).

**Recipients:** all staff.

---

## Reconcile semantics (the core algorithm)

A single idempotent routine runs **inside `GET /api/notifications`** before the response is built. It keeps the notifications table equal to the current live alert set:

1. **Insert missing**: for each candidate alert (kind + fingerprint + recipients), insert a row `isRead = false` when that fingerprint does not already exist for that recipient.
2. **Refresh**: for rows whose fingerprint exists but whose title/body would differ (e.g. name edited on a current office term), update title/body in place. No duplication.
3. **Retire**: delete notification rows whose signal no longer holds (meeting completed/passed, agreement archived/renewed past-window, task done/paused/no-longer-overdue, election year passed, office term no longer current). A row that has been **read** but is still valid (condition still holds) stays put — reading is orthogonal to liveness.
4. **Prune**: delete rows whose recipient user is deleted or banned.

Because fingerprints are unique per recipient, calling `GET /api/notifications` N times yields the same table (no duplicates on refresh of the SPA badge).

**Dev/demo determinism:** in `AUTH_PASSTHROUGH=true` demo mode the actor is the sentinel `id = "passthrough"` (guards.ts line 41). The reconcile ensures that sentinel recipient exists in `user` before selecting recipients, so `seed-scorecard`-driven `route-qa` runs get a deterministic feed. Real sessions are unaffected.

---

## Schema change

`lib/db/src/schema/notifications.ts` → new table `notifications`:

| Column | Type | Notes |
|---|---|---|
| `id` | `serial` pk | |
| `recipient_user_id` | `text`, FK → `userTable.id` `onDelete: "cascade"` | the owner of this row; feed is per-user |
| `kind` | `text` | `position_change` \| `meeting_upcoming` \| `agreement_expiring` \| `follow_up_overdue` \| `election_approaching` |
| `title` | `text` | |
| `body` | `text` | |
| `country_id` | `int`, FK → `countries.id` `onDelete: "cascade"`, nullable | deep-link anchor |
| `entity_type` | `text` | `office_term` \| `meeting` \| `agreement` \| `task` \| `country` |
| `entity_id` | `int` | |
| `is_read` | `boolean` default `false` | the per-user read state |
| `read_at` | `timestamp`, nullable | set when marked read |
| `created_at` | `timestamp` `defaultNow()` | |
| `fingerprint` | `text` | dedup key |

**Unique index:** `(recipient_user_id, fingerprint)` — the idempotency guarantee.

Controlled wins: `onDelete: "cascade"` means deleting a country, meeting, agreement, task, or user automatically removes its linked notification rows — the reconcile's prune step stays cheap.

Registered in `lib/db/src/schema/index.ts` and pushed with `bun run --filter @workspace/db push`.

---

## API surface

Three endpoints on a new `notifications` router. **Mounting:** after `requireSession()` and **before** `requireWriteRole()` in `routes/index.ts` (like the `admin`/`audit` routers) — reading the feed and marking rows read is personal data, not a workspace write; viewers may use the center. `GET` needs no role; the two mutating endpoints are scoped to the actor's own rows, so per-user authorization is by row ownership, not role.

### `GET /api/notifications`

Reconciles, then returns the current actor's feed, newest first:

```js
{
  unreadCount: number,
  items: [
    {
      id, kind, title, body,
      countryId,             // int | null (deep-link anchor)
      entityType, entityId,  // for deep-link targets
      isRead, readAt, createdAt
    }
  ]
}
```

`?limit=` optional (default 50). `?unread=only` optional (filter to unread).

### `PATCH /api/notifications/:id/read`

Marks one of the actor's rows read. **404** if the row doesn't exist or belongs to another user (never leaks others' rows).

```js
200 → { ok: true }
```

### `POST /api/notifications/read-all`

Marks all of the actor's unread rows read.

```js
200 → { ok: true, updated: number }
```

No audit rows are written for notification operations (they are viewer-level personal state, not workspace mutations).

**Contract flow:** OpenAPI paths/schemas (tag `notifications`) → orval codegen → zod values + React Query hooks (`useNotifications`, `useMarkNotificationRead`, `useMarkAllNotificationsRead`). After every codegen run, **remove the auto-appended `export * from "./generated/types";` line** from the hand-curated `lib/api-zod/src/index.ts` (TS2308 collision otherwise) and re-run `bun run typecheck` + SPA rebuild.

---

## UI

### Header bell → notifications dropdown

Replace the decorative dot with a real feed:

1. **Bell button** (`button-notifications`, already in App.tsx header): shows an unread-count badge (small number chip, hidden when 0) fed by `useNotifications`.
2. **Dropdown panel** (`notifications-panel`) anchored under the bell, opened by click (and closed on outside click / Escape):
   - **Unread items** first (darker/with a dot), then read; each row: kind icon, `title`, `body` (muted, 2-line clamp), relative `createdAt`.
   - **"Mark all read"** action (`notifications-mark-all-read`) in the panel header.
   - **Click item** → marks that row read + deep-links: `position_change` → the country's **Government** tab; `meeting_upcoming` → `/meetings`; `agreement_expiring`/`follow_up_overdue` → `/country/:id` (Documents / Tasks tab respectively); `election_approaching` → `/country/:id`.
   - **Empty state** (`notifications-empty`): "All caught up — no alerts right now."
   - Loading skeleton while fetching; error text with retry on failure.

Deep links reuse the `?tab=` search-param mechanism built in Phase 4.3 (country page already honors `?tab=analytics`; Government/Documents/Tasks tabs follow the same pattern).

States: `LoadingRows` while loading, `ErrorState` on error (retry), panel when data present.

**Locked testids:** `button-notifications`, `notifications-unread-badge`, `notifications-panel`, `notifications-item-<id>`, `notifications-mark-all-read`, `notifications-empty`.

---

## Error handling & edge cases

- **Signal gone between reconcile and read** → the read PATCH on a retired row returns 404 (row was deleted by the next reconcile); SPA treats 404 as "already gone" and refetches.
- **Other user's rows** are never returned or mutable (all queries filter `recipient_user_id = actor.id`).
- **No assignees on a country** → country-scoped alerts fall back to all staff (files never orphaned).
- **`electionYear` null / non-numeric** → no alert.
- **Agreement with `renewal_date = null`** → no alert (no date to compare).
- **Meetings with `status != 'scheduled'`** (completed/follow-up/cancelled) → never an upcoming-meeting alert.
- **Tasks `done`/`paused`** → never overdue; a past-due active task alerts, a done one is retired.
- **Reconcile on every GET** is cheap at this data scale (small filtered reads); no pagination beyond `?limit=`.

---

## QA & testing

### auth-qa (API-level, DB-backed)

New 4.4 section following the established pattern (seed users + country + controlled dataset → assertions → cleanup). Users: one `global_admin`, one extra staff user, one `viewer`, one `banned` (to prove exclusion). Country with full assignments (primary/secondary/reviewer/regional coordinator) → seeded alert kinds assert:

- **`position_change`**: create a current office term → alert exists for every staff user; replace with a new current term → old row retired, new row present; edit `personName` on the current term → title refreshed, count unchanged.
- **`meeting_upcoming`**: meeting with `date` in `(now, now+48h]`, `status='scheduled'` → alert; a completed meeting and a `date` beyond the window → no alert; completing the meeting → row retired.
- **`agreement_expiring`**: `lifecycleState='signed'`, `renewal_date` in window → alert **only for the country's assignees**; an archived agreement and one without `renewal_date` → none; on archive → retired.
- **`follow_up_overdue`**: task `active` with `due_date < today` → assignee-targeted alert; `done` or `paused` → none; marking done → retired.
- **`election_approaching`**: `election_year = currentYear` → staff alert; `null` and `currentYear + 2` → none.
- **Idempotency**: call `GET /api/notifications` three times → identical table/counts.
- **Assignment fallback**: a second country with **no assignees** → its agreement/overdue alerts reach all staff.
- **Read/unread**: `PATCH :id/read` flips `isRead` + sets `readAt`; `POST read-all` zeroes `unreadCount`; PATCH on another user's row (or a non-existent id) → 404; viewer can read and mark their own notifications.
- **Banned/prune**: a banned user's stale rows are removed by reconcile.

### route-qa (SPA, Playwright)

- Header bell shows an unread badge matching the seeded `unreadCount`.
- Click bell → `notifications-panel` renders the seeded `position_change` and `meeting_upcoming` items with titles; clicking an item marks it read and navigates to the correct page (e.g. `/country/:id?tab=government`).
- `notifications-mark-all-read` clears the badge (unread count 0); panel shows empty state when no alerts remain.
- `notifications-empty` state renders for a user/country with no alerts.
- **Locked testids** as listed in the UI section.

### Conventions

`bun run typecheck` and `bun run --filter @workspace/global-dr-platform build` clean; commit per chunk; `docs/implementation-plan.md` updated at the end (status, evidence, current-next-task); push on user confirmation.

---

## Implementation chunks

1. **DB**: `notifications` table + unique `(recipient_user_id, fingerprint)` index + schema export; `bun run --filter @workspace/db push`; existing auth-qa stays green.
2. **Contract**: OpenAPI `tag: notifications` (GET list, PATCH read, POST read-all) + schemas, codegen, curated barrel fix + typecheck/rebuild; auth-qa compile untouched.
3. **API**: reconcile module + notifications router (mounted before `requireWriteRole`), sentinel-recipient guarantee, deep-link fields; auth-qa 4.4 section green.
4. **SPA**: wire `button-notifications` → dropdown panel with unread badge, mark-all-read, per-item read + deep links; route-qa 4.4 checks green.
5. **Docs + final verification**: `docs/implementation-plan.md` (Phase 4.4 done, evidence, current-next-task → Phase 5), mark plan/spec checkboxes, final commit; push on user confirmation.