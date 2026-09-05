# Phase 4.2 Spec: Weekly & Daily Tasks (Action-Area Deliverables)

**Date:** 2026-09-05
**Status:** Draft — awaiting spec review
**Depends on:** Phase 4.1 (country assignments) — Complete

---

## Overview

Phase 4.2 adds the second piece of Phase 4 (Deliverables, tasks, and notifications) of the
Global Diplomatic Relations platform: **recurring cadence tasks tied to action areas**. Each
task is a standing commitment scoped to a single country and one of the five action areas
(e.g. "submit the weekly security briefing for Côte d'Ivoire"), carrying a cadence of
`daily` or `weekly`, an owner, a lifecycle status, and lightweight next-due / last-completed
dates.

This is a **new top-level entity** (`tasks`). It is deliberately *not* the existing
`deliverables` entity — that name, tag, operationIds, and table are owned by the
per-action-item deliverables inside the meeting detail tab — so the new entity reuses the
plan's wording ("weekly and daily deliverables tied to action areas") but is surfaced under
the already-planned country **Tasks** tab, which currently renders "Coming soon".

The change is additive and follows the established flat-CRUD pattern (`ministries`):
one table, full CRUD under the existing write-role gate, audit on every write (with
`countryId`), and a grouped-by-action-area UI inside the existing country detail Tasks tab.
Scorecards, completion %, and SLA semantics are expressly **out of scope** (Phase 4.3).

---

## 1. Data Model

New table in `lib/db/src/schema/tasks.ts`, exported from `lib/db/src/schema/index.ts`:

| Column | Drizzle field | Type | Notes |
|---|---|---|---|
| `id` | `id` | `serial` PK | |
| `country_id` | `countryId` | `integer`, notNull | FK → `countries.id` |
| `action_area` | `actionArea` | `text`, notNull | one of the 5 action areas |
| `cadence` | `cadence` | `text`, notNull, default `'weekly'` | `daily` \| `weekly` |
| `title` | `title` | `text`, notNull | |
| `description` | `description` | `text` | nullable |
| `owner` | `owner` | `text` | nullable, free text (like `meetings.owner`), not an account |
| `status` | `status` | `text`, notNull, default `'active'` | `active` \| `paused` \| `done` |
| `due_date` | `dueDate` | `date` (string mode) | nullable, next-due YYYY-MM-DD |
| `last_done_at` | `lastDoneAt` | `date` (string mode) | nullable, last-completed YYYY-MM-DD |
| `created_at` / `updated_at` | `createdAt` / `updatedAt` | timestamps, `.defaultNow()` (matching every existing table — the repo has no `.$onUpdate` convention) | |

No FK cascade requirement (a country's tasks must be cleaned up before deleting the
country in QA — follows the existing `auth-qa` disposal ordering; `onDelete: "cascade"`
is acceptable here to match `meeting_agenda`-style child behavior).

### Enumerated values (single source of truth)

New `lib/db/src/schema/tasks.ts` contains the value constants; the SPA imports them from a
matching `artifacts/global-dr-platform/src/lib/tasks.ts`:

- `ACTION_AREAS` — the five existing meeting action areas: `Trade & investment`,
  `Security dialogue`, `Climate & energy`, `Humanitarian affairs`, `Protocol & access`.
- `TASK_CADENCES` — `daily`, `weekly`.
- `TASK_STATUSES` — `active`, `paused`, `done`.

The five action-area `<option>` strings currently hard-coded inline at
`App.tsx:498` (the meeting "Schedule" dialog) are lifted to import `ACTION_AREAS` from the
new shared constant, so the two selectors cannot drift. The DB column stays untyped
`text` (as `meetings.actionArea` does); enum **validation** is enforced at the API layer
via the OpenAPI-declared enums below — the "cannot drift" guarantee is between the two
SPA selectors, not API-vs-DB.

---

## 2. API Contract

### 2.1 OpenAPI (`lib/api-spec/openapi.yaml`)

- New tag `tasks` (snake_case-free, matches `countries`/`ministries` style).
- **`GET /tasks`** → `200` list, operationId `listTasks`.
  Query params: `countryId` (**required** int), optional `actionArea` (enum),
  `status` (enum), `cadence` (enum).
- **`POST /tasks`** → `201`, operationId `createTask`.
- **`PATCH /tasks/{id}`** → `200`, operationId `updateTask` (no get-one; the tab runs on
  the list).
- **`DELETE /tasks/{id}`** → `200`, operationId `deleteTask`.

Schemas (enum-declared so codegen produces `z.enum` validation for free):

- `Task` — read model: `id`, `countryId`, `countryName` (joined, like meetings),
  `actionArea` (enum), `cadence` (enum), `title`, `description` (nullable), `owner`
  (nullable), `status` (enum), `dueDate` (nullable date), `lastDoneAt` (nullable date),
  `createdAt`, `updatedAt`.
- `TaskInput` — required `countryId` (int), `actionArea` (enum), `title` (minLength 1);
  optional `cadence` (enum, default `weekly`), `description`, `owner`, `status` (enum,
  default `active`), `dueDate`, `lastDoneAt`.
- `TaskUpdate` — all optional; `countryId` **immutable** (not in the schema); the rest
  mirror `TaskInput` minus `countryId`.

Zod naming follows convention: `ListTasksResponseItem` + `ListTasksResponse`, `CreateTaskBody`/
`CreateTaskResponse`, `UpdateTaskBody`/`UpdateTaskParams`/`UpdateTaskResponse`,
`DeleteTaskParams`/`DeleteTaskResponse`, `ListTasksQueryParams`.

### 2.2 Operations (`artifacts/api-server/src/routes/tasks.ts`, new file)

Mounted in `routes/index.ts` **after** `requireWriteRole()` (so reads are readable by any
authenticated session, writes require a non-viewer role — identical to every resource
entity; no in-handler gate needed).

- `GET /tasks`: `safeParse` query (fails → 400); select with `countryId` filter + optional
  actionArea/status/cadence equality; join `countries.name` → `countryName`; order by
  `actionArea` then `title`; respond `ListTasksResponse`.
- `POST /tasks`: `safeParse` body → validate the country exists (400 if not) → insert →
  **look up `countries.name` and respond joined**, exactly like meetings
  (`CreateMeetingResponse.parse({ ...row, countryName: country?.name ?? "Unknown" })` at
  `platform.ts:334`) → `writeAudit({ actor: getActor(req), action: "create",
  entityType: "task", entityId, kind, title, description, countryId })` → `201` +
  `CreateTaskResponse.parse({ ...row, countryName })`. (Raw `.returning()` rows carry no
  `countryName`; `Task` requires it, so the join is mandatory on create and update.)
- `PATCH /tasks/{id}`: parse params + body → 404 if missing → update →
  **join `countries.name` as above** `UpdateTaskResponse.parse({ ...row, countryName })` →
  `diffFields(existing, row, ["title", "description", "actionArea", "cadence", "owner",
  "status", "dueDate", "lastDoneAt"])` → audit create/update with before/after.
- `DELETE /tasks/{id}`: parse params → 404 if missing → delete → audit `delete` →
  `DeleteTaskResponse`.

---

## 3. Audit

Entity type `task`. Create/update/delete rows all carry `countryId`. Update diffs are
limited to the `diffFields` allowlist above; the FKs and timestamps never appear in diffs.
No sensitive bodies echoed.

**Required code edit:** `writeAudit`'s `entityType` is typed as the `AuditEntityType` union
in `lib/audit.ts` (currently terminal at `"deliverable"`), so **add `| "task"`** to that
union or the route fails typecheck. The DB column (`activity.entity_type`, plain `text`)
and OpenAPI `AuditEntry.entityType` (plain string, no enum) accept `"task"` with no further
change.

---

## 4. SPA UI

### 4.1 Shared constants

`artifacts/global-dr-platform/src/lib/tasks.ts` exports `ACTION_AREAS`, `TASK_CADENCES`,
`TASK_STATUSES` (labels + values, imported from the db schema constants so the two json are
identical by construction). The meeting dialog's action-area `<select>` at `App.tsx:498`
now iterates `ACTION_AREAS` instead of literal `<option>` strings.

### 4.2 Countries → detail → Tasks tab

`CountryDetailPage` currently renders "Coming soon" for the `tasks` TABS entry. Replace
that placeholder with a new `TasksTab` component (`countryId` prop):

- One `<section>` per action area that has ≥1 task, headed by the area name + count badge
  (sections ordered as `ACTION_AREAS`); hidden when empty.
- Each task row shows: title, cadence pill (`Daily`/`Weekly`), owner, status pill
  (`active`/`paused`/`done` tones), and dates (`due ≤`, `last done`).
- Top-right **Add task** button (`button-add-task`); empty state shows
  `button-empty-add-task` instead of the row list.
- Shared create/edit `AddDialog`: fields `title`, `description`, `actionArea` (select),
  `cadence` (select), `owner`, `status` (select), `dueDate` (date input),
  `lastDoneAt` (date input). Editing loads the row into the same dialog; save dispatches
  create vs update.

Testids (repo convention): `button-add-task`, `button-empty-add-task`, `button-submit-task`,
`button-cancel-task`, `input-task-title`, `textarea-task-description`,
`select-task-action-area`, `select-task-cadence`, `select-task-status`, `input-task-owner`,
`input-task-due`, `input-task-last-done`, `row-task-<id>`, `button-edit-task-<id>`,
`button-delete-task-<id>`.

### 4.3 Data flow

Generated hooks `useListTasks({ countryId })` (required `countryId` list param is the
**first positional arg**, exactly like `useListMinistries({ countryId })` — the
single-arg `{ query }` form only exists for param-less hooks such as
`useListAssignableUsers`), plus `useCreateTask`, `useUpdateTask`, `useDeleteTask`. Optional
filters pass through params: `useListTasks({ countryId, actionArea, status })`.
Invalidate `getListTasksQueryKey({ countryId })` on every mutation success. No new route,
no nav change, no sidebar change.

---

## 5. Authorization Semantics

No change to the global role model. Writes require a non-viewer role (the existing
`requireWriteRole()` mount gate, exactly as for `ministries`/`agreements`); reads are
available to any authenticated session. No per-task or per-country resource-level
authorization this phase.

---

## 6. QA Plan

### 6.1 auth-qa (`scripts/src/auth-qa.ts` — new `tasks` block after the assignments block)

1. Create a country → create a task → `201`; response echoes `actionArea`, `cadence`
   (default `weekly`), `status` (default `active`), `countryName`.
2. Invalid `actionArea` → `400`. Bogus `countryId` → `400`.
3. `GET /api/tasks?countryId=` → the task is present; `status`/`cadence`/`actionArea`
   filters narrow it correctly.
4. `PATCH` status → `done` + cadence → `daily` echo; bogus enum value → `400`.
5. Audit: create + update rows both carry `countryId`; update `after` diff limited to the
   changed keys.
6. `DELETE` → `200`; list no longer contains it.
7. Cleanup: the tasks block **must** `await db.delete(tasksTable).where(
   eq(tasksTable.countryId, adminPostBody.id))` ahead of the existing country deletion in
   the disposal block (`auth-qa.ts:575-585`) — the country delete will throw if the FK
   still points at it.

### 6.2 route-qa (`scripts/src/route-qa.ts`)

1. In the country-detail loop, the `tasks` tab now asserts `button-add-task` is visible
   (in addition to clickable/visible).
2. Open the modal: `select-task-action-area` exposes the five action areas;
   `select-task-cadence` exposes Daily/Weekly; `button-submit-task` enabled with a title.
3. Cancel path and empty-state `button-empty-add-task` visible on a country with no tasks.

---

## 7. Verification & Delivery

- `bun run --filter @workspace/db push` (applies the new `tasks` table to the live DB).
- `bun run typecheck` (libs + all workspaces clean).
- Codegen: `bun run --filter @workspace/api-spec codegen` (orval regenerates
  `lib/api-zod/src/generated/*` and `lib/api-client-react/src/generated/*`; the
  `patch-generated.ts` script repatches the `getHeaders` helper). **`lib/api-zod/src/index.ts`
  is hand-curated and not touched by codegen** — manually add the new named type exports
  (`Task`, `TaskInput`, `TaskUpdate`, `ListTasksResponseItem`, `ListTasksResponse`,
  `ListTasksQueryParams`, `CreateTaskBody`/`Response`, `UpdateTaskBody`/`Params`/`Response`,
  `DeleteTaskParams`/`Response`) to its curated `export { type ... } from "./generated/types"`
  block (the Zod schemas themselves come through automatically via the
  `export * from "./generated/api"` at line 2) → rebuild `npx tsc --build lib/api-client-react`.
- auth-qa, route-qa, SPA `build` all green.
- Commit message: `feat(tasks): weekly/daily action-area tasks per country`.

---

## 8. Non-Goals (out of scope for 4.2)

- Anything about the existing per-action-item `deliverables` entity (left untouched).
- Completion %, on-time/overdue blazing, SLA, scorecards, failure analysis — Phase 4.3.
- Notifications/reminders for due or overdue tasks (in-app notifications are a later 4.x).
- Task-to-action-item linking, task comments, task history beyond audit rows.
- Replacing the 5-option action-area taxonomy or unifying it with the 9 DR strategy types.
- The vestigial `meetings.followUpTimeline` jsonb (unused; left as-is).