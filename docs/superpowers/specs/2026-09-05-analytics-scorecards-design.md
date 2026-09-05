# Phase 4.3 — Country Scorecards: Engagement Health Score, Completion %, SLA, Failure Analysis

**Status:** Approved by user (design sections 1–6)
**Date:** 2026-09-05
**Supersedes:** nothing
**Project:** Meridian — Global Diplomatic Relations (GDP) platform

---

## Why this feature

Phase 4.2 shipped per-country recurring tasks (action area + daily/weekly cadence, owner, status, dueDate, lastDoneAt). What the product brief calls for next is the analytical layer: "Weekly goals. Daily goals. Failure analysis. Completion percentage. Country scorecards." (brief lines 449–461), "Engagement Health Score" and "Country Performance" reports (lines 507–556), and "Failure analysis" in the team performance report (lines 1005–1013).

Today a mission lead can see every task, meeting, and action item — but cannot answer "how is this country actually doing?" in one glance. This phase computes that answer, entirely from data we already capture.

## Goals

- One **Engagement Health Score (0–100)** per country, derived transparently from completion %, SLA on-time rate, and failure-resistance.
- A **completion percentage** pooled across recurring tasks, meeting action items, and meetings.
- An **SLA on-time rate** (deadline adherence) for completed deliverables.
- **Failure analysis**: a board of every failure (overdue-not-done + completed-late) plus clustering that shows where failures concentrate (by action area, cadence, type).
- Surfaced in two places: the country **Analytics tab** (full scorecard, Layout A) and a platform-wide **scorecard strip above the existing overview stats** on `/`, with click-through into each country's Analytics tab.

## Non-goals

- No new scoreable schema beyond one nullable `completedAt` timestamp on meetings (opted in during design).
- No manual failure-analysis notes / AI coaching workflow (deferred — needs authored content, not derivation).
- No raw engagement-response SLA (reply-time tracking of outreach); not derivable from current data.
- No exports, scheduling, or history/report generation (deferred).
- No `weekly_reports`/`failure_analysis` storage tables (deferred; everything below is computed live).

---

## Metric definitions

All computed per country, live, at request time. "Today" = the server's current calendar date, using the same `dayOnly()` date normalization used by the tasks and action-items routes (ISO `YYYY-MM-DD` string; timestamps compared by date portion only).

### Pool (the denominator universe)

Scoreable items for a country:

- **Tasks**: `status = active | done` (paused excluded). Fields used: `dueDate` (date string, nullable), `lastDoneAt`, `cadence`, `actionArea`.
- **Action items**: all rows for the country's meetings. Fields used: `status` (pending | done), `dueDate` (nullable), `updatedAt` (completion-time proxy), parent `meeting.actionArea`.
- **Meetings**: `status != cancelled`. Fields used: `status` (incl. `completed`), `date` (scheduled timestamp), `completedAt` (new, nullable), `actionArea`.

Sub-sub-resources (`deliverables`) are excluded: too deeply nested to be meaningful at this level; phase scope stays to the three chosen pools.

### Completion

- `done` = task `status = done`, action item `status = done`, meeting `status = completed`.
- `completionPct = done / pool` (0–100). When `pool = 0` → `null`.

### SLA on-time rate

Only among **completed** items:

- Task on-time: `lastDoneAt <= dueDate` (both date-only; a task with no `dueDate` is SLA-exempt).
- Action item on-time: `updatedAt` (completion-time proxy) date <= `dueDate`; no `dueDate` → SLA-exempt.
- Meeting on-time: `completedAt` date <= `date` (scheduled) date; no `completedAt` but status `completed` → **counted as late** (pessimistic, keeps the rate honest).
- `slaRate = onTimeCompleted / completed` (0–100). When `completed = 0` → `null`.

### Failure analysis

A failure item is **overdue-not-done** (date passed, not completed) or **completed-late** (completed after due):

- Task overdue: `status != done` and `dueDate < today`. Task late: `lastDoneAt > dueDate`.
- Action item overdue: `status != done` and `dueDate < today`. Late: completed-date (`updatedAt`) > `dueDate`.
- Meeting overdue: `status != completed` and `date < today`. Meeting late: `completedAt` date > `date` date.

Items with no relevant date can never fail (no due date → neither overdue nor late; a past meeting that can never be completed is still a failure while overdue).

- `failureCount` = overdue-not-done + completed-late.
- `failureRate = failureCount / pool` (0–100); `failureResistance = 100 − failureRate`. `pool = 0` → `null`.
- Failure **board rows** carry: `type` (task | actionItem | meeting), `title` (task title / description / meeting title), `actionArea`, `cadence?` (tasks only), `dueDate?` (tasks/action items), `scheduledAt?` (meetings), `completedAt?`, `daysOver` (days overdue if not done, days late if done; sign-corrected to positive).
- **Clustering**: failure count + rate grouped by `actionArea`, by `cadence` (tasks only), and by `type`. Clusters with zero failures are omitted.

### Engagement Health Score

`score = round(0.4·completionPct + 0.4·slaRate + 0.2·failureResistance)`.

If **any** component is `null` → `score = null`. UI renders `— No data` for a null score (never 0).

### Rounding

Percentages/rates rounded to 1 decimal; score rounded to the nearest integer.

---

## Schema change (the one exception)

`meetings` gains:

```
completedAt: timestamp | null   — set to now() when a meeting's status transitions to "completed" (route-side)
```

No other schema changes. Existing meetings in `completed` state without a `completedAt` are treated per the pessimistic SLA rule and will show in the failure board as late only once their scheduled date has passed *and* they have no completion evidence — they still count as completed for completion %.

---

## API surface

Two read-only endpoints (approach A — server-computed aggregation, mirroring `GET /api/dashboard/summary`). No auth role gate (read-only aggregation like dashboard/summary). No audit rows written for scorecard reads.

### `GET /api/scorecards`

All countries, one summary each, sorted by score descending (null-score last).

```js
{
  items: [
    {
      countryId, countryName,
      score,            // int | null
      completionPct,    // number | null
      slaRate,          // number | null
      failureRate,      // number | null
      poolCount, completedCount, onTimeCount, failureCount
    }
  ]
}
```

### `GET /api/countries/:id/scorecard`

Full breakdown for one country. Unknown/foreign/non-numeric `:id` → 404.

```js
{
  summary:    { /* same fields as above */ },
  completion: {
    overallPct,                                   // number | null
    byType:   [{ type, done, total, pct }],       // pct number | null
    byActionArea: [{ actionArea, done, total, pct }]
  },
  sla: {
    overallRate,                                  // number | null
    byType: [{ type, onTime, completed, rate }]   // rate number | null
  },
  failures: {
    count, rate,                                 // rate number | null
    rows: [{ id, type, title, actionArea, cadence?, dueDate?, scheduledAt?, completedAt?, daysOver }],
    byActionArea: [{ actionArea, count, rate }],  // rate number (clusters only exist when count > 0)
    byCadence:    [{ cadence, count, rate }],     // tasks only
    byType:       [{ type, count, rate }]
  }
}
```

Contract flow: OpenAPI paths/schemas → orval codegen → zod values + React Query hooks (`useScorecards`, `useCountryScorecard`). After every codegen run, **remove the auto-appended `export * from "./generated/types";` line** from the hand-curated `lib/api-zod/src/index.ts` (TS2308 collision otherwise) and re-run `bun run typecheck` + SPA rebuild.

---

## UI

### Country Analytics tab — Layout A (approved)

Status: the analytics tab is currently `EmptyPlaceholder "Coming soon"` (App.tsx); becomes the full scorecard:

1. **Score header**: ring showing `score` (color band green ≥ 70 / amber ≥ 40 / red < 40), "Engagement Health Score" label, the weight formula line, pool-item and upcoming-overdue counts. `score = null` → empty ring + `— No data`.
2. **Three metric tiles**: Completion (green bar), SLA on-time (violet bar), Failure index (red bar) — value + "done/total" or "onTime/completed" or "overdue + late" caption.
3. **Failure board** (left, 2/3 width): list of failure rows (type badge, title, action area/cadence, "Nd overdue"/"Nd late" in red/amber). If none: "No failures — all clear".
4. **"Where they fail" clustering rail** (right, 1/3): bars per action area + cadence line. Omitted when zero failures.

States: `LoadingRows` while loading, `ErrorState` on error (retry), scorecard when data present.

### Overview strip on `/` (above the existing stats)

A horizontally scrollable/grid strip of score cards, one per country, each showing: country name, action-area count, score ring (compact), completion+SLA line, mini completion bar; `null` score → `— No data` card. Hover: elevation; **click: navigate to `/country/:id?tab=analytics`** (the country's Analytics tab). Placed **above** the existing overview stat cards.

---

## Error handling & edge cases

- Unknown/foreign/non-numeric country ID → 404.
- Zero pool → all metrics `null` (no 0s, no NaN/Infinity); UI shows `— No data`.
- Division guards: `completed = 0` → SLA null; `pool = 0` → completion & failure null.
- Date comparisons are date-only ISO strings; timezone handled by the same `dayOnly()` normalization as the tasks/action-items routes.
- Items without a due/meeting date are SLA- and failure-exempt but still count toward completion.
- Cancelled meetings and paused tasks excluded from the pool.
- Scorecard is computed live from current rows — no persistence, so deletions/cascades (tasks → country cascade; meetings → country; action items → meeting cascade) are automatically consistent.

---

## QA & testing

### auth-qa (API-level, DB-backed)

New 4.3 section following the Phase 4.2 tasks pattern (seed country → controlled dataset → assertions → cleanup). Seeded datasets must span: on-time task, late task (`lastDoneAt` after `dueDate`), overdue-pending task, action item with dueDate (done + overdue), action item without dueDate, completed-on-time meeting (with `completedAt`), completed-late meeting, cancelled meeting (excluded), past-not-completed meeting (overdue), never-completed future meeting. Asserts exact:

- `poolCount`, `done`, `completionPct`
- `onTimeCount`, `completed`, `slaRate`
- `failureCount`, each board row's `daysOver`, cluster entries
- `score` (exact integer)
- a fresh country with zero items → all metrics null
- unknown country → 404

### route-qa (SPA, Playwright)

- Overview `/`: assert `overview-scorecard-strip` visible **above** the stat cards; assert a seeded country's known score text; click the card → lands on that country's Analytics tab.
- Country Analytics tab (QA Land): assert `analytics-score-ring` shows the seeded score, tiles show seeded completion/SLA/failure values, failure-board rows render, one cluster row exists, and the `— No data` case renders for an empty country.
- **Locked testids**: `overview-scorecard-strip`, `scorecard-card-<id>`, `analytics-score-ring`, `analytics-completion-pct`, `analytics-sla-rate`, `analytics-failure-index`, `analytics-failure-row-<n>`, `analytics-cluster-<key>`, `scorecard-no-data`.

### Conventions

`bun run typecheck` and `bun run --filter @workspace/global-dr-platform build` clean; commit per chunk; docs/implementation-plan.md updated at the end.

---

## Implementation chunks

1. **DB**: nullable `completedAt` on meetings; set `completedAt = now()` when status → `completed` in the meetings route; `bun run --filter @workspace/db push`; existing auth-qa stays green.
2. **Contract**: OpenAPI `GET /scorecards` + `GET /countries/{id}/scorecard` (paths, response schemas), codegen, curated barrel fix + typecheck/rebuild.
3. **API**: scorecard computation module + both routes; auth-qa 4.3 section green.
4. **SPA**: `ScorecardTab` (Layout A) replacing the Analytics placeholder + overview strip component wired above overview stats; route-qa 4.3 checks green.
5. **Docs + final verification**: docs/implementation-plan.md (status, evidence, current-next-task → Phase 4.4 notifications), mark plan checkboxes, final commit; push on user confirmation.