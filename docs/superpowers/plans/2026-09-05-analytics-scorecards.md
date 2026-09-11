# Phase 4.3 — Country Scorecards: Health Score, Completion %, SLA, Failure Analysis — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship per-country scorecards — an Engagement Health Score (0.4·completion + 0.4·SLA + 0.2·failure-resistance), completion %, SLA on-time rate, and a failure board with clustering — in the country Analytics tab and a platform-wide strip on `/`.

**Architecture:** Server-computed aggregation (approach A). Two read-only endpoints (`GET /scorecards`, `GET /countries/:id/scorecard`) aggregate tasks/action-items/meetings per country into zod-validated scorecard payloads; the SPA renders them (Analytics tab = Layout A, overview strip above the stat cards). One schema addition: nullable `meetings.completedAt`, plus a route-side `updatedAt` bump for action items. Order: DB → OpenAPI/codegen → API+auth-qa → SPA+route-qa → docs.

**Tech Stack:** Express + Drizzle (`@workspace/db`), OpenAPI → orval → `@workspace/api-zod` (server) + `@workspace/api-client-react` (TanStack Query hooks), React + Tailwind v4 SPA under TanStack Router, `tsx` QA harnesses (`auth-qa`, `route-qa`) with played-through real API + Playwright.

---

## File structure

- Modify `lib/db/src/schema/meetings.ts` — add `completedAt` column.
- Modify `artifacts/api-server/src/routes/platform.ts` — set `completedAt` on meeting PATCH → completed.
- Modify `artifacts/api-server/src/routes/actionItems.ts` — bump `updatedAt` on action-item PATCH → completed.
- Create `artifacts/api-server/src/lib/scorecard.ts` — pure metric computation (pool/completion/SLA/failures/score) + aggregation queries.
- Create `artifacts/api-server/src/routes/scorecards.ts` — the two endpoints.
- Modify `artifacts/api-server/src/routes/index.ts` — mount scorecards router.
- Modify `lib/api-spec/openapi.yaml` — tag, two paths, `ScorecardId` param, 10 schemas, `completedAt` on `Meeting`.
- Modify `lib/api-zod/src/index.ts` — remove codegen-appended wildcard; add curated type re-exports.
- Create `artifacts/global-dr-platform/src/components/ScorecardTab.tsx` — Analytics tab content (Layout A).
- Create `artifacts/global-dr-platform/src/components/ScorecardStrip.tsx` — overview strip.
- Modify `artifacts/global-dr-platform/src/components/MapPage.tsx`-style navigation: `App.tsx` + `src/routes/country.$countryId.tsx` — analytics branch, strip wiring, `?tab=` deep-link.
- Create `scripts/src/seed-scorecard.ts` — deterministic demo scorecard data for route-qa.
- Modify `scripts/src/auth-qa.ts`, `scripts/src/route-qa.ts`, `scripts/package.json`.
- Modify `docs/implementation-plan.md`.

---

## Chunk 1: DB + completion timestamps

### Task 1: Add `completedAt` to the meetings table

**Files:**
- Modify: `lib/db/src/schema/meetings.ts` (insert after the `status` column, after line 11)

- [ ] **Step 1: Edit the schema**

In `lib/db/src/schema/meetings.ts`, after the `status` line, add the nullable `completedAt` column:

```ts
  completedAt: timestamp("completed_at", { withTimezone: true }),
```

The `timestamp` import is already present (line 1). No new import needed.

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: `@workspace/db` (tsc `--build`) and all workspaces exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/db/src/schema/meetings.ts
git commit -m "feat(db): nullable completedAt column on meetings"
```

### Task 2: Push the schema to the DB

**Files:**
- (none — DB only)

- [ ] **Step 1: Push**

Run:
```bash
DATABASE_URL="postgresql://localhost:5432/meridian" bun run --filter @workspace/db push
```
Expected: drizzle-kit reports the new `completed_at` column added to `meetings`.

- [ ] **Step 2: Verify in the live DB**

Run: `psql postgresql://localhost:5432/meridian -c '\d meetings'`
Expected: `completed_at | timestamp with time zone |` present (nullable — no `not null`).

- [ ] **Step 3: Commit** (skip — schema change already committed in Task 1; this is a runtime artifact). If `git status --short` shows nothing new, do nothing.

### Task 3: Meetings PATCH sets `completedAt` on transition to completed

**Files:**
- Modify: `artifacts/api-server/src/routes/platform.ts:337-350` (the PATCH handler)

- [ ] **Step 1: Restructure the PATCH handler**

Current code (`platform.ts:337-350`) builds `values` *before* selecting `existing`:

```ts
router.patch("/meetings/:id", async (req, res): Promise<void> => {
  const params = UpdateMeetingParams.safeParse(req.params);
  const parsed = UpdateMeetingBody.safeParse(req.body);
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid meeting update." }); return; }
  const values = {
    ...parsed.data,
    date: parsed.data.date ? new Date(parsed.data.date) : undefined,
  };
  const [existing] = await db.select({
    id: meetingsTable.id, title: meetingsTable.title, status: meetingsTable.status, date: meetingsTable.date,
    actionArea: meetingsTable.actionArea, owner: meetingsTable.owner,
  }).from(meetingsTable).where(eq(meetingsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Meeting not found." }); return; }
  const [row] = await db.update(meetingsTable).set(values).where(eq(meetingsTable.id, params.data.id)).returning();
```

Move the `existing` select ABOVE the `values` build, and add `completedAt` to `values` (set once, on the exact transition to `completed`):

```ts
router.patch("/meetings/:id", async (req, res): Promise<void> => {
  const params = UpdateMeetingParams.safeParse(req.params);
  const parsed = UpdateMeetingBody.safeParse(req.body);
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid meeting update." }); return; }
  const [existing] = await db.select({
    id: meetingsTable.id, title: meetingsTable.title, status: meetingsTable.status, date: meetingsTable.date,
    actionArea: meetingsTable.actionArea, owner: meetingsTable.owner,
  }).from(meetingsTable).where(eq(meetingsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Meeting not found." }); return; }
  const values = {
    ...parsed.data,
    date: parsed.data.date ? new Date(parsed.data.date) : undefined,
    completedAt: parsed.data.status === "completed" && existing.status !== "completed" ? new Date() : undefined,
  };
  const [row] = await db.update(meetingsTable).set(values).where(eq(meetingsTable.id, params.data.id)).returning();
```

The rest of the handler (country select, diffFields, writeAudit, response) stays unchanged. Note: `completedAt: undefined` is omitted by drizzle's `.set()`, so repeat PATCHes to `completed` and transitions away do not mutate it.

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: exit 0.

### Task 4: Action-item PATCH bumps `updatedAt` on transition to completed

**Files:**
- Modify: `artifacts/api-server/src/routes/actionItems.ts:149-153`

- [ ] **Step 1: Edit the update object**

Current code (`actionItems.ts:149-153`):

```ts
  const dueDateStr = parsed.data.dueDate ? new Date(parsed.data.dueDate).toISOString().split('T')[0] : null;
  const updateData = {
    ...parsed.data,
    dueDate: dueDateStr,
  };
```

Replace with a version that stamps `updatedAt` on the exact transition to `completed` (guarded by the pre-PATCH status read in `existing`, selected at line 130):

```ts
  const dueDateStr = parsed.data.dueDate ? new Date(parsed.data.dueDate).toISOString().split('T')[0] : null;
  const updateData = {
    ...parsed.data,
    dueDate: dueDateStr,
    ...(parsed.data.status === "completed" && existing.status !== "completed" ? { updatedAt: new Date() } : {}),
  };
```

The rest of the handler stays unchanged. This makes `updatedAt` a real completion-time proxy for the scorecard SLA/failure math.

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: exit 0.

### Task 5: auth-qa regression checks for both timestamp behaviors

**Files:**
- Modify: `scripts/src/auth-qa.ts` (import line 8, plus a new section inserted after the Phase 4.2 tasks section ends at line 649, before the cleanup banner at line 651)

- [ ] **Step 1: Add the table import**

Change the `@workspace/db` import at `auth-qa.ts:8` to include `actionItemsTable`:

```ts
import { db, pool, activityTable, countriesTable, documentsTable, newsTable, userTable, meetingsTable, agreementsTable, drStrategiesTable, tasksTable, actionItemsTable } from "@workspace/db";
```

- [ ] **Step 2: Insert the timestamp checks section**

Insert after line 649 (the last 4.2 tasks `check`), before the cleanup banner:

```ts
  // 4.3-0 timestamps (Phase 4.3 chunk 1). A meeting's transition to completed
  // stamps completedAt; an action item's transition stamps updatedAt.
  const stampMeeting = await fetch(`${origin}/api/meetings`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: adminJar.header() },
    body: JSON.stringify({ title: "QA completion stamp", countryId, date: new Date().toISOString(), actionArea: "Trade & investment" }),
  });
  const stampMeetingBody = (await stampMeeting.json().catch(() => ({}))) as { id?: number };
  check("4.3-0 POST /api/meetings seeded for completion stamp", stampMeeting.status === 201 && typeof stampMeetingBody.id === "number", `status=${stampMeeting.status}`);
  const stampTransition = await fetch(`${origin}/api/meetings/${stampMeetingBody.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: adminJar.header() },
    body: JSON.stringify({ status: "completed" }),
  });
  check("4.3-0 PATCH meeting -> completed accepts", stampTransition.status === 200, `status=${stampTransition.status}`);
  const [stampedMeeting] = await db.select({ completedAt: meetingsTable.completedAt }).from(meetingsTable).where(eq(meetingsTable.id, stampMeetingBody.id as number));
  check("4.3-0 meeting completedAt stamped on completion", stampedMeeting?.completedAt != null, JSON.stringify(stampedMeeting));

  const stampItem = await fetch(`${origin}/api/meetings/${meetingId}/action-items`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: adminJar.header() },
    body: JSON.stringify({ meetingId, description: "QA updatedAt proxy", assignee: "QA User" }),
  });
  const stampItemBody = (await stampItem.json().catch(() => ({}))) as { id?: number };
  check("4.3-0 POST action item seeded for updatedAt bump", stampItem.status === 201 && typeof stampItemBody.id === "number", `status=${stampItem.status}`);
  await fetch(`${origin}/api/action-items/${stampItemBody.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: adminJar.header() },
    body: JSON.stringify({ status: "completed" }),
  });
  const [bumpedItem] = await db.select({ createdAt: actionItemsTable.createdAt, updatedAt: actionItemsTable.updatedAt }).from(actionItemsTable).where(eq(actionItemsTable.id, stampItemBody.id as number));
  check(
    "4.3-0 action item updatedAt bumped on completion",
    bumpedItem != null && new Date(bumpedItem.updatedAt).getTime() > new Date(bumpedItem.createdAt).getTime(),
    JSON.stringify(bumpedItem),
  );
```

(The `meetingId` const from the Phase 3 section — `auth-qa.ts:375` — is still in scope at this point in `main()`.)

- [ ] **Step 3: Run auth-qa — must stay fully green**

Run:
```bash
DATABASE_URL="postgresql://localhost:5432/meridian" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" bun run --filter @workspace/scripts auth-qa
```
Expected: `ALL PASS (92 passed)` (previous 87 + the 5 new checks in the 4.3-0 section). Any FAIL is a blocker — do not proceed.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/platform.ts artifacts/api-server/src/routes/actionItems.ts scripts/src/auth-qa.ts
git commit -m "feat(api): stamp completion timestamps — meetings.completedAt + action-item updatedAt (auth-qa green)"
```

---

## Chunk 2: OpenAPI contract + codegen

### Task 1: OpenAPI schema + paths for scorecards

**Files:**
- Modify: `lib/api-spec/openapi.yaml`

- [ ] **Step 1: Add the scorecards tag**

Locate the `tags:` list entries (the `- name: users`/`- name: tasks` block). Add after the last tag entry:

```yaml
- name: scorecards
```

- [ ] **Step 2: Add the two paths**

Insert both paths immediately before the `/   news:` path key (previously anchored at line 514 — verify the current line with `rg -n "^  /news:" lib/api-spec/openapi.yaml`). The scorecard paths don't collide with any existing `/scorecards` or `/countries/{id}/scorecard` key — confirm with `rg -n "scorecard" lib/api-spec/openapi.yaml` (expect no matches before this edit).

```yaml
  /scorecards:
    get:
      tags: [scorecards]
      operationId: ListScorecards
      responses:
        "200":
          description: Platform-wide scorecard summaries, one per country, sorted by score descending (null-score last).
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ScorecardList"
  /countries/{id}/scorecard:
    get:
      tags: [scorecards]
      operationId: GetCountryScorecard
      parameters:
        - $ref: "#/components/parameters/ScorecardId"
      responses:
        "200":
          description: Full scorecard breakdown for one country.
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/CountryScorecard"
        "404":
          description: Unknown country.
```

- [ ] **Step 3: Add the `ScorecardId` path parameter**

Find the `parameters:` component block that defines `MinistryId`/`TaskId` (`rg -n "MinistryId:" lib/api-spec/openapi.yaml`). Add after the actual **last** `...Id` definition — more follow `TaskId` (`PositionId`, `TermId`, `OrganizationId`, …) — so run `rg -n "^    [A-Za-z]+Id:" lib/api-spec/openapi.yaml` and anchor on the final one:

```yaml
    ScorecardId:
      name: id
      in: path
      required: true
      schema:
        type: integer
```

Match the exact indentation of the `MinistryId` block.

- [ ] **Step 4: Add `completedAt` to the `Meeting` schema**

Find the `Meeting:` component schema in the same `components.schemas` block that holds `MeetingUpdate`. Add a nullable `completedAt` (read-only output field, never in `MeetingInput`/`MeetingUpdate`), matching this file's 3.1.0 nullability convention — block-style `type: [string, 'null']`, NOT `nullable: true` (see sibling `Meeting.owner`):

```yaml
        completedAt:
          type:
          - string
          - 'null'
          format: date-time
          readOnly: true
```

Align indentation with sibling fields (properties keys at 8 spaces, nested keys at 10). Verify `MeetingInput`/`MeetingUpdate` do NOT gain this field (only the output `Meeting` schema).

- [ ] **Step 5: Add the scorecard response schemas**

Insert after the `MeetingUpdate` schema / before the `Position` schema (or at the end of the `MinistryUpdate`-style output-schema cluster; keep with the aggregate output schemas such as `DashboardSummary`). All ten:

> **Nullability convention (important):** this file has no `nullable: true` anywhere — all nullable fields use block-style `type: [-]`/`[type, 'null']` as in `Meeting.owner`. Copy each `- 'null'` line exactly as shown.

```yaml
    ScorecardSummary:
      type: object
      required: [countryId, countryName]
      properties:
        countryId:
          type: integer
          format: int64
        countryName:
          type: string
        score:
          type:
          - integer
          - "null"
        completionPct:
          type:
          - number
          - "null"
        slaRate:
          type:
          - number
          - "null"
        failureRate:
          type:
          - number
          - "null"
        poolCount:
          type: integer
        completedCount:
          type: integer
        onTimeCount:
          type: integer
        failureCount:
          type: integer
    ScorecardList:
      type: object
      required: [items]
      properties:
        items:
          type: array
          items:
            $ref: "#/components/schemas/ScorecardSummary"
    ScorecardFailureRow:
      type: object
      required: [id, type, title, actionArea, daysOver]
      properties:
        id:
          type: integer
          format: int64
        type:
          type: string
          enum: [task, actionItem, meeting]
        title:
          type: string
        actionArea:
          type: string
        cadence:
          type:
          - string
          - "null"
          enum: [daily, weekly]
        dueDate:
          type:
          - string
          - "null"
          format: date
        scheduledAt:
          type:
          - string
          - "null"
          format: date-time
        completedAt:
          type:
          - string
          - "null"
          format: date-time
        daysOver:
          type:
          - integer
          - "null"
    ScorecardActionAreaCluster:
      type: object
      required: [actionArea, count, rate]
      properties:
        actionArea:
          type: string
        count:
          type: integer
        rate:
          type: number
    ScorecardCadenceCluster:
      type: object
      required: [cadence, count, rate]
      properties:
        cadence:
          type: string
          enum: [daily, weekly]
        count:
          type: integer
        rate:
          type: number
    ScorecardTypeCluster:
      type: object
      required: [type, count, rate]
      properties:
        type:
          type: string
          enum: [task, actionItem, meeting]
        count:
          type: integer
        rate:
          type: number
    CompletionBreakdown:
      type: object
      required: [overallPct, byType, byActionArea]
      properties:
        overallPct:
          type:
          - number
          - "null"
        byType:
          type: array
          items:
            type: object
            required: [type, done, total, pct]
            properties:
              type:
                type: string
                enum: [task, actionItem, meeting]
              done:
                type: integer
              total:
                type: integer
              pct:
                type:
                - number
                - "null"
        byActionArea:
          type: array
          items:
            type: object
            required: [actionArea, done, total, pct]
            properties:
              actionArea:
                type: string
              done:
                type: integer
              total:
                type: integer
              pct:
                type:
                - number
                - "null"
    SlaBreakdown:
      type: object
      required: [overallRate, byType]
      properties:
        overallRate:
          type:
          - number
          - "null"
        byType:
          type: array
          items:
            type: object
            required: [type, onTime, completed, rate]
            properties:
              type:
                type: string
                enum: [task, actionItem, meeting]
              onTime:
                type: integer
              completed:
                type: integer
              rate:
                type:
                - number
                - "null"
    ScorecardFailures:
      type: object
      required: [count, rate, rows, byActionArea, byCadence, byType]
      properties:
        count:
          type: integer
        rate:
          type:
          - number
          - "null"
        rows:
          type: array
          items:
            $ref: "#/components/schemas/ScorecardFailureRow"
        byActionArea:
          type: array
          items:
            $ref: "#/components/schemas/ScorecardActionAreaCluster"
        byCadence:
          type: array
          items:
            $ref: "#/components/schemas/ScorecardCadenceCluster"
        byType:
          type: array
          items:
            $ref: "#/components/schemas/ScorecardTypeCluster"
    CountryScorecard:
      type: object
      required: [summary, completion, sla, failures]
      properties:
        summary:
          $ref: "#/components/schemas/ScorecardSummary"
        completion:
          $ref: "#/components/schemas/CompletionBreakdown"
        sla:
          $ref: "#/components/schemas/SlaBreakdown"
        failures:
          $ref: "#/components/schemas/ScorecardFailures"
```

- [ ] **Step 6: Sanity-check the YAML** — ensure the file parses. If `bunx yaml-lint` is unavailable, run the codegen step next and rely on its parse errors.

- [ ] **Step 7: Commit**

```bash
git add lib/api-spec/openapi.yaml
git commit -m "feat(api): openapi contract for country scorecards"
```

### Task 2: Run codegen and repair the curated index

**Files:**
- Modify: `lib/api-zod/src/index.ts` (remove one appended line; add curated type re-exports)

- [ ] **Step 1: Run codegen**

Run: `bun run --filter @workspace/api-spec codegen`
Expected: orval regenerates `lib/api-client-react/src/generated/*` and `lib/api-zod/src/generated/*`; schema count increases.

- [ ] **Step 2: Remove the auto-appended wildcard**

**Known pitfall:** every codegen run appends `export * from "./generated/types";` to the *end* of the hand-curated `lib/api-zod/src/index.ts`. This collides with `generated/api` exports (TS2308). Remove that trailing line (keep the curated named-type block above it as-is).

Verify with: `tail -5 lib/api-zod/src/index.ts` — the last line must be the curated `} from "./generated/types";` closing brace, NOT a bare `export * from "./generated/types";`.

- [ ] **Step 3: Verify generated zod values for the new endpoints**

Check `lib/api-zod/src/generated/api.ts` contains (search `ListScorecards` / `CountryScorecard`):
- `ListScorecardsResponse` (parses `{ items: ScorecardSummary[] }`)
- `GetCountryScorecardResponse` (parses `CountryScorecard`)
- `GetCountryScorecardParams` (parses `{ id: number }` via coerce)
- `ScorecardSummary`, `CountryScorecard`, `ScorecardFailureRow`, `ScorecardActionAreaCluster`, `ScorecardCadenceCluster`, `ScorecardTypeCluster`, `CompletionBreakdown`, `SlaBreakdown`, `ScorecardFailures`

If any generated name differs from the above, adjust Task 3 of Chunk 3 to the actual name.

- [ ] **Step 4: Verify generated types files**

Confirm `lib/api-zod/src/generated/types/` gained `scorecardSummary.ts`/`countryScorecard.ts` (etc.) — the `ScorecardSummary`, `CountryScorecard` interfaces with `score: number | null`, `completionPct: number | null`, `slaRate: number | null`, `failureRate: number | null`, and `daysOver: number | null`.

- [ ] **Step 5: Add curated type re-exports**

In `lib/api-zod/src/index.ts`, inside the curated named-type block (alphabetical position: after the `Position*` names, before `Task`/`SlaBreakdown`-style names as fit), add:

```ts
  ScorecardActionAreaCluster,
  ScorecardCadenceCluster,
  ScorecardFailureRow,
  ScorecardSummary,
  ScorecardTypeCluster,
```

And in the same block add `CountryScorecard`, `CompletionBreakdown`, `SlaBreakdown`, `ScorecardFailures` if the convention re-exports nested-entity interfaces (match what `Task`/`Position` do — task types were all individually re-exported; follow the same generosity so the type names resolve). After this step, typecheck will confirm exactly which names must be present.

- [ ] **Step 6: Typecheck + regenerate the SPA contract**

Run: `bun run typecheck`
Expected: exit 0 (this is the first real check of the curated list). If TS2308 appears again, a wildcard line slipped back in — remove it (Step 2) and re-run.

Then run: `bun run --filter @workspace/global-dr-platform typecheck`
Expected: exit 0 — confirms `@workspace/api-client-react` typings picked up `useListScorecards`/`useGetCountryScorecard`.

- [ ] **Step 7: Verify the generated SPA hooks exist**

Confirm `lib/api-client-react/src/generated/api.ts` defines:
- `useListScorecards` + `getListScorecardsQueryKey()`
- `useGetCountryScorecard` + `getGetCountryScorecardQueryKey({ id })`
- `ListScorecardsResponse`-shaped data (`{ items: ScorecardSummary[] }`) and `GetCountryScorecardResponse`

- [ ] **Step 8: Commit**

```bash
git add lib/api-zod/src/index.ts lib/api-spec lib/api-zod/src/generated lib/api-client-react/src/generated
git commit -m "feat(api): codegen for scorecards contract + curated zod index"
```

---

## Chunk 3: Scorecard computation + endpoints + auth-qa 4.3

### Task 1: Create the scorecard computation module

**Files:**
- Create: `artifacts/api-server/src/lib/scorecard.ts` (pure computation, no Express imports)
- Modify: `artifacts/api-server/src/routes/scorecards.ts` (create) and `artifacts/api-server/src/routes/index.ts` (mount)

- [x] **Step 1: Define the normalized input row**

```ts
export type ScorecardKind = "task" | "actionItem" | "meeting";
export type ScorecardRow = {
  countryId: number;
  kind: ScorecardKind;
  id: number;
  title: string;
  actionArea: string;
  cadence: string | null;      // tasks only
  completed: boolean;          // task "done" / AI "completed" / meeting "completed"
  pool: boolean;               // pool member (paused tasks / cancelled rows excluded)
  due: string | null;          // date-only: task.dueDate, AI.dueDate, dayOnly(meeting.date)
  evidence: string | null;     // date-only: task.lastDoneAt, dayOnly(AI.updatedAt), dayOnly(meeting.completedAt)
};
```

- [x] **Step 2: Reuse the `dayOnly` normalization**

Copy the exact helper from `tasks.ts:20`:
```ts
const dayOnly = (value?: Date | string | null) => (value ? new Date(value).toISOString().split("T")[0] : null);
```
and `export const today = dayOnly(new Date())`. All comparisons in this module are date-only ISO string comparisons (lexicographic `<=` works on `YYYY-MM-DD`). Days-over is integer calendar days: `Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)`.

- [x] **Step 3: Loader — fetch all pool rows per type**

Export `loadScorecardRows(db)`. It returns the union of three queries (each selects `id, countryId, actionArea, cadence, due, evidence, evidenceRaw, completed, pool`):
- **tasks**: `status IN ('active','done')` (paused excluded → `pool:false` rows are simply not returned; a task is `completed = status === 'done'`), `due = dueDate`, `evidence = dayOnly(lastDoneAt)`, `evidenceRaw = lastDoneAt`.
- **action items**: joined to `meetingsTable` for `countryId` + `actionArea` (`innerJoin(meetingsTable, eq(actionItemsTable.meetingId, meetingsTable.id))`); `status IN ('pending','in_progress','completed')`; `completed = status === 'completed'`; `due = dueDate`; `evidence = dayOnly(updatedAt)`, `evidenceRaw = updatedAt`.
- **meetings**: `status IN ('scheduled','completed','follow_up')` (a directly-seeded `cancelled` row is excluded, matching the spec — the OpenAPI enum has no `cancelled`, so the pool filter is what enforces it); `completed = status === 'completed'`; `due = dayOnly(date)`, `scheduledAt = date`; `evidence = dayOnly(completedAt)`, `evidenceRaw = completedAt`.

- [x] **Step 4: Pure metric functions**

Export three pure helpers (all take `today: string` and rows):
- `round1 = (x: number) => Math.round(x * 10) / 10`
- `computeSummary(countryId, rows, today)` → `{ score, completionPct, slaRate, failureRate, poolCount, completedCount, onTimeCount, failureCount }`:
  - pool = rows of that country; `completedCount` = completed in pool.
  - `completionPct = pool.length ? round1(completedCount / pool.length * 100) : null`.
  - SLA: among completed rows, those with a non-null `due` are SLA-scoped. `onTimeCount` = scoped rows where `evidence != null && evidence <= due`. `slaRate = scoped ? round1(onTimeCount / scoped.length * 100) : null`. (Completed rows without a due date are completion-counted but SLA-exempt — this is the `t5`/`a4` case.)
  - failures (see Step 6); `failureRate = pool.length ? round1(failureCount / pool.length * 100) : null`.
  - `score = completionPct == null || slaRate == null || failureRate == null ? null : Math.round(0.4 * completionPct + 0.4 * slaRate + 0.2 * (100 - failureRate))`.
  - Zero pool → all metrics `null` (no `0`, no `NaN`).
- `computeBreakdown(countryId, rows, today)` → `{ completion: { overallPct, byType, byActionArea }, sla: { overallRate, byType }, failures: { count, rate, rows, byActionArea, byCadence, byType } }` (per-type arrays are `{type, done, total, pct}` / `{type, onTime, completed, rate}` over `["task","actionItem","meeting"]` fixed order with zero-filled entries; byActionArea groups by `actionArea` over all pool rows).

- [x] **Step 5: Failure classification**

For each country's pool row, it is a failure if:
- **Overdue-not-done**: `!completed && due && due < today` → `daysOver = days(today, due)`.
- **Completed-late**: `completed && due` and (`evidence == null` **or** `evidence > due`) → `daysOver = evidence ? days(evidence, due) : null`.
- Else not a failure.

`daysOver` is `integer | null` exactly as in the API contract. Failure rows are emitted `{ id, kind: "task"|"actionItem"|"meeting", title, actionArea, cadence (null for non-tasks), due (date-only), scheduledAt (meeting's full `date` timestamp; null for tasks/actionItems), completedAt (evidenceRaw when present — a full timestamp for actionItems/meetings, the date-only string for tasks — else null), daysOver }`. **Note:** orchestrating zod parses all of these as `z.string()`, so the `date-time` vs `date` `format` distinction in OpenAPI is advisory — safe.

Clusters (= `failures` breakdown):
- `byActionArea`: group failure rows by `actionArea` → `{ actionArea, count, rate: round1(count / failureCount * 100) }`.
- `byCadence`: task failure rows only, group by `cadence` → `{ cadence, count, rate }`.
- `byType`: group by `kind` → `{ type, count, rate }`.
- Sort each: `count` desc, then key asc, then `id` asc. Zero-count clusters omitted.
- `failureCount === 0` → empty arrays (rates would divide by zero).

- [x] **Step 6: Unit sanity check (optional but cheap)** — add a tiny `if ((import.meta as { main?: boolean }).main)` block in the module **or simply run a throwaway `bun artifacts/api-server/src/lib/scorecard.ts` print from a scratch file** (api-server's tsconfig has `"types": ["node"]`, no bun types — deleted cleanly). Feed a hard-coded 5-row fixture (2 done 1 late 1 overdue 1 no-due) and confirm the percentages/score math before wiring routes. Delete afterwards — the module must compile under the repo typecheck at Task 2 Step 5.

### Task 2: Wire the two endpoints

**Files:**
- Create: `artifacts/api-server/src/routes/scorecards.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`

- [x] **Step 1: Create the router** (pattern-matched to `platform.ts`):

```ts
import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, countriesTable } from "@workspace/db";
import { loadScorecardRows, computeSummary, computeBreakdown, today } from "../lib/scorecard";
import { CountryScorecard, GetCountryScorecardParams, ListScorecardsResponse, ScorecardList, ScorecardSummary } from "@workspace/api-zod";

const router: IRouter = Router();

export default router;
```

- [x] **Step 2: `GET /scorecards`**

Load all rows once, load all countries, then for every country compute `computeSummary` and build `ScorecardSummary` items. Sort `score` descending with `null` scores last (`score == null` sorts after every numeric score, tie-break `countryName` asc). Respond `ListScorecardsResponse.parse({ items })`.

- [x] **Step 3: `GET /countries/:id/scorecard`**

`GetCountryScorecardParams.safeParse(req.params)`; non-numeric/absent id → 404. Look up the country (`countriesTable.id`); unknown → 404 (same wording as `platform.ts` meeting pattern). Otherwise `computeSummary` + `computeBreakdown` for that id and respond `CountryScorecard.parse({ summary, ...breakdown })`. **No audit rows written** for scorecard reads (read-only, mirrors `dashboard/summary`'s write-role inheritance without the audit write).

- [x] **Step 4: Mount** in `routes/index.ts` after `tasksRouter` (line 49): `import scorecardsRouter from "./scorecards";` + `router.use(scorecardsRouter);`. The router definitions use absolute paths (`/scorecards`, `/countries/:id/scorecard`), so mount at root like the other resource routers — do **not** prefix.

- [x] **Step 5: Typecheck** — `bun run typecheck` exits 0. This also proves the generated zod values (`CountryScorecard`, `ListScorecardsResponse`, `GetCountryScorecardParams`) satisfy the payload shapes.

### Task 3: Shared deterministic fixture module

**Files:**
- Create: `scripts/src/scorecard-fixture.ts`

A single source of truth for the QA datasets (auth-qa + route-qa + seed) so neither harness duplicates the row definitions or the expected numbers.

- [x] **Step 1: Export `scorecardFixture()`**

```ts
export type Fixture = { tasks: [...]; actionItems: [...]; meetings: [...]; expected: {...} };
export function scorecardFixture(today: string): Fixture
```

Build the dataset with `today`-relative dates (via a helper `const d = (offset: number) => add-days(today, offset)`), where `today = new Date().toISOString().split("T")[0]`. The dataset is exactly (one country, `actionArea` "Security dialogue" for tasks/meetings except the host meeting which is "Trade & investment"):

| row | kind      | completed | pool | due        | evidence            | failure?  | daysOver |
|-----|-----------|-----------|------|------------|---------------------|-----------|----------|
| t1  | task      | done      | yes  | today - 2  | latest = today - 3  | no (on-time) | – |
| t2  | task      | done      | yes  | today - 2  | today - 1           | late      | 1        |
| t3  | task      | done      | yes  | today - 1  | null                | late      | null     |
| t4  | task      | active    | yes  | today - 3  | null                | overdue   | 3        |
| t5  | task      | done      | yes  | null       | today - 1           | no (SLA-exempt) | – |
| t6  | task      | paused    | no   | –          | –                   | –         | –        |
| a1  | actionItem| completed | yes  | today - 1  | updatedAt today - 2 | on-time   | –        |
| a2  | actionItem| completed | yes  | today - 2  | updatedAt today - 1 | late      | 1        |
| a3  | actionItem| pending   | yes  | today - 4  | updatedAt today - 5 | overdue   | 4        |
| a4  | actionItem| pending   | yes  | null       | updatedAt today - 5 | no (SLA-exempt) | – |
| m1  | meeting   | completed | yes  | day(today - 3) | completedAt today - 3 | on-time  | –        |
| m2  | meeting   | completed | yes  | day(today - 2) | completedAt today - 1 | late     | 1        |
| m3  | meeting   | completed | yes  | day(today - 2) | completedAt null    | late     | null     |
| m4  | meeting   | scheduled | yes  | day(today - 4) | –                  | overdue  | 4        |
| m5  | meeting (host) | scheduled | yes | day(today + 5) | –            | no       | –        |
| m6  | meeting   | cancelled | no   | –          | –                   | –         | –        |

Rows t1-t5 + m1-m4 are `actionArea` "Security dialogue"; m5 and all action items are "Trade & investment" (AIs are hosted by m5). t2 cadence `daily`, t3 + t4 cadence `weekly`.

- [x] **Step 2: Export the expected values as literals with an invariance note**

```ts
expected: {
  poolCount: 14, completedCount: 9, completionPct: 64.3,
  onTimeCount: 3, slaRate: 37.5,
  failureCount: 8, failureRate: 57.1,
  score: 49,
  slaByType: { task: 33.3, actionItem: 50.0, meeting: 33.3 },
  completionByType: { task: 80.0, actionItem: 50.0, meeting: 60.0 },
  completionByActionArea: { "Security dialogue": 77.8, "Trade & investment": 40.0 },
  failures: [ {kind:"task", id: "<t2>", daysOver: 1}, {kind:"task", id:"<t3>", daysOver: null},
              {kind:"task", id:"<t4>", daysOver: 3}, {kind:"actionItem", id:"<a2>", daysOver: 1},
              {kind:"actionItem", id:"<a3>", daysOver: 4}, {kind:"meeting", id:"<m2>", daysOver: 1},
              {kind:"meeting", id:"<m3>", daysOver: null}, {kind:"meeting", id:"<m4>", daysOver: 4} ],
  byActionArea: [ ["Security dialogue", 6, 75.0], ["Trade & investment", 2, 25.0] ],
  byCadence:   [ ["weekly", 2, 25.0], ["daily", 1, 12.5] ],
  byType:      [ ["meeting", 3, 37.5], ["task", 3, 37.5], ["actionItem", 2, 25.0] ],
}
```

These numbers are **date-invariant** — every offset is relative to `today`, so `done/pool`, SLA scoping, failure membership, and score are constant no matter when the test runs. Only absolute `daysOver` strings (derived from the row's own dates) would move, but even those are relative differences. Do not "recompute" generously — these are the ground truth the API must match.

The fixture returns `{ rows, expected, hostMeetingIndex }` where `rows` is the ordered insert list (each row carrying its own insert payload) and also exposes per-row generated ids back via a small resolved map (the `id` placeholders above are filled by the harness after insert).

- [x] **Step 3: Add the `seed-scorecard` wiring note** — this module is imported by auth-qa (Chunk 3 Task 4) and route-qa/seed (Chunk 4), not run standalone. No `scripts/package.json` change needed yet; Chunk 4 adds the `seed-scorecard` script.

### Task 4: auth-qa 4.3 section — exact-math assertions

**Files:**
- Modify: `scripts/src/auth-qa.ts`

Insert a new 4.3 block **after the 4.2 tasks block's DELETE checks (after line 649) and before the cleanup banner** (the 4.3-0 timestamp checks from Chunk 1 already sit at the top, before the 4.1/4.2 sections). Uses the existing `adminJar`, `check`, and creates its OWN disposable country (code e.g. `QC${digit}`) so it is self-contained.

- [x] **Step 1: Create a disposable country + meetings/action items/tasks from the fixture**

Create the country via `POST /admin/countries` (same pattern as the 4.1 section, capture `id`). Insert the fixture rows **directly into the DB** (`db.insert(tasksTable/actionItemsTable/meetingsTable)`) — direct inserts are required because several cases (paused task, cancelled meeting, a completed meeting with `completedAt = null`, a completed timestampless task, controlled `updatedAt` for the on-time/late action items) cannot be produced through the public API. For action items pass `meetingId = <m5 host row id>` and `updatedAt` explicitly. Captured ids populate the fixtures' expected `failures` entries.

- [x] **Step 2: Assert `GET /api/countries/:id/scorecard` matches the fixture exactly**

`check` for each of: `poolCount === 14`, `completedCount === 9`, `completionPct === 64.3`, `onTimeCount === 3`, `slaRate === 37.5`, `failureCount === 8`, `failureRate === 57.1`, `score === 49`. Then the breakdown: `completion.byType` (task 80.0 / actionItem 50.0 / meeting 60.0), `completion.byActionArea` (77.8 / 40.0), `sla.byType` (33.3 / 50.0 / 33.3 — task/actionItem/meeting), each fixture failure row present with its exact `daysOver` (match by `kind` + `id`; 8 checks), and the three cluster arrays match the fixture (compare `count`/`rate` per key; order per spec = count desc then key asc).

- [x] **Step 3: Assert `GET /api/scorecards`**

The disposable country's `ScorecardSummary` is present with `score === 49` and correct `completionPct/slaRate/failureRate/counts`. Also assert the summary list sorts scores descending with nulls last: every non-null score appears before any `null` score.

- [x] **Step 4: Zero-pool + unknown country cases**

Create a second disposable country (`QD${digit}`) with **no rows**. Its scorecard responds with all metrics `null` and `score: null`. `GET /api/countries/999999/scorecard` → 404; `GET /api/countries/abc/scorecard` (non-numeric) → 404.

- [x] **Step 5: Cleanup + run**

Delete the two disposable countries' rows (meetings first — they cascade action items — then tasks), the countries, and the audit rows (same sweep as the existing cleanup at lines 651-682, but scoped to the 4.3 codes). Run:
```bash
DATABASE_URL="postgresql://localhost:5432/meridian" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" bun run --filter @workspace/scripts auth-qa
```
Expected: `ALL PASS` — count = previous 92 + the number of `check()` calls written in this block (Step 2 ≈ 27, Step 3 ≈ 4, Step 4 ≈ 7, so ≈ 130 total; the exact number is whatever you wrote — the run prints it). Any FAIL is a blocker.

- [x] **Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/scorecard.ts artifacts/api-server/src/routes/scorecards.ts artifacts/api-server/src/routes/index.ts scripts/src/scorecard-fixture.ts scripts/src/auth-qa.ts
git commit -m "feat(api): per-country scorecards health score + completion + SLA + failure analysis (auth-qa green)"
```

---

## Chunk 4: SPA — Analytics tab (Layout A) + overview strip + deep-link + route-qa

### Task 1: `ScorecardTab` (country Analytics tab, Layout A)

**Files:**
- Create: `artifacts/global-dr-platform/src/components/ScorecardTab.tsx`

- [ ] **Step 1: Component skeleton** — follow the `TasksTab` conventions (React Query hook, loading/error/data states). Use `useGetCountryScorecard(countryId)`; render `<LoadingRows count={4}/>` while loading, `<ErrorState onRetry={refetch}/>` on error.

- [ ] **Step 2: Score header ring**

Outer section (testid `analytics-score-ring`) showing: the ring (SVG circle, stroke-dasharray proportional to `score`), "Engagement Health Score", the formula line `0.4·completion + 0.4·SLA + 0.2·failure-resistance`, and `poolCount` + `failureCount` captions. Color band: `score >= 70` green, `>= 40` amber, `< 40` red (use the same `hsl(...)` palette tokens the rest of the SPA uses). `score == null` → empty ring with `— No data` and testid `scorecard-no-data`.

- [ ] **Step 3: Three metric tiles** — grid of three cards with a left color bar and a value bar:
  - Completion (green): `<scorecard.completion.overallPct>` (testid `analytics-completion-pct`), caption `done/total` from `{completedCount}/{poolCount}`.
  - SLA on-time (violet): `<scorecard.sla.overallRate>` (testid `analytics-sla-rate`), caption `onTime/completed` from `{onTimeCount}/{completedCount}`.
  - Failure index (red): `<scorecard.failures.rate>` (testid `analytics-failure-index`), caption `overdue + late` from `{failureCount}`.
  - Null values render `—` (never `0`).

- [ ] **Step 4: Failure board** (main column, `2/3` width) — list `failures.rows` as cards: type badge (`TASK`/`ACTION ITEM`/`MEETING`), title, `actionArea` + `cadence` when task, and right-aligned `Nd overdue` (amber) / `Nd late` (red) / `late — no date recorded` (red). Row testids `analytics-failure-row-${index}` (index = position in `rows`). Empty → `<EmptyState>` "No failures — all clear".

- [ ] **Step 5: "Where they fail" rail** (side column, `1/3` width) — for each of `byActionArea`, `byCadence`, `byType`: a labeled bar row with `count` + `rate%`. Testids `analytics-cluster-${key}` (key = actionArea/cadence/type value). SQL/aria-free; omit the rail entirely when `failureCount === 0`.

- [ ] **Step 6: Commit**
```bash
git add artifacts/global-dr-platform/src/components/ScorecardTab.tsx
git commit -m "feat(spa): country Analytics tab scorecard view (Layout A)"
```

### Task 2: Wire `ScorecardTab` into the country page + `?tab=` deep-link

**Files:**
- Modify: `artifacts/global-dr-platform/src/App.tsx` (analytics branch ~1154-1159, `activeTab` at 908, TabButton onClick at 1140)
- Modify: `artifacts/global-dr-platform/src/routes/country.$countryId.tsx` (add `validateSearch`)

- [ ] **Step 1: Replace the analytics placeholder** — swap the `EmptyPlaceholder "Coming soon"` branch (App.tsx 1154-1159) for `<ScorecardTab countryId={id} />`. Import `ScorecardTab`.

- [ ] **Step 2: Deep-link search param** — in `country.$countryId.tsx` add:

```tsx
import { z } from 'zod';

const countrySearchSchema = z.object({
  tab: z.string().optional(),
});

export const Route = createFileRoute('/country/$countryId')({
  validateSearch: countrySearchSchema,
  component: CountryDetailPage,
});
```

- [ ] **Step 3: Initialize `activeTab` from the search param** — in `CountryDetailPage` (App.tsx 898):

```tsx
import { useSearch } from '@tanstack/react-router';
const search = useSearch({ from: '/country/$countryId', strict: true });
```

Replace `const [activeTab, setActiveTab] = useState<TabId>('overview')` with an initializer that maps `search.tab` onto a valid `TabId` (else `'overview'`): `useState<TabId>(() => TABS.some((t) => t.id === search.tab) ? (search.tab as TabId) : 'overview')`. This makes `/country/:id?tab=analytics` a true deep link.

- [ ] **Step 4: Keep the URL in sync on tab change** — change the `TabButton` onClick (App.tsx 1140) to also `router.navigate({ to: '/country/$countryId', params: { countryId: params.countryId }, search: { tab: tab.id === 'overview' ? undefined : tab.id }, replace: true })` via `useNavigate()`. (`overview` omits the param so the URL stays clean.)

- [ ] **Step 5: Typecheck + build**

`bun run --filter @workspace/global-dr-platform typecheck` (regenerates `routeTree.gen` via `tsr generate` — required after adding `validateSearch`) then `bun run --filter @workspace/global-dr-platform build`. Both exit 0.

### Task 3: Overview scorecard strip on `/`

**Files:**
- Create: `artifacts/global-dr-platform/src/components/ScorecardStrip.tsx`
- Modify: `artifacts/global-dr-platform/src/App.tsx` (Dashboard render, after `<PageIntro>` at 380, before the stats grid at 381)

- [ ] **Step 1: Component** — `useListScorecards()`. Wrapper `<section data-testid="overview-scorecard-strip">` styled as a horizontally scrollable grid. One card per `ScorecardSummary` (testid `scorecard-card-${countryId}`): country name, pool-item count (the available proxy for the spec's "action-area count"), `score` ring (compact), `completionPct` + `slaRate` line, mini completion bar. `score == null` → `— No data` badge (testid `scorecard-no-data`). Loading → `LoadingRows`. Click navigates `router.navigate({ to: '/country/$countryId', params: { countryId }, search: { tab: 'analytics' } })`.

- [ ] **Step 2: Insert into Dashboard** — place `<ScorecardStrip />` directly after the `<PageIntro …>` element (App.tsx 380) and **above** the `mb-8 grid` stats div (381). Nothing else in Dashboard changes.

- [ ] **Step 3: Commit**
```bash
git add artifacts/global-dr-platform/src/components/ScorecardStrip.tsx artifacts/global-dr-platform/src/App.tsx artifacts/global-dr-platform/src/routes/country.$countryId.tsx
git commit -m "feat(spa): overview scorecard strip + ?tab analytics deep-link"
```

### Task 4: Deterministic seed + route-qa 4.3 checks

**Files:**
- Create: `scripts/src/seed-scorecard.ts`
- Modify: `scripts/package.json`, `scripts/src/route-qa.ts`

- [ ] **Step 1: `seed-scorecard` script** — imports `scorecardFixture(today)`, creates/refreshes two well-known demo countries by code (`SCOR` "Scorecards Demo" and `SCER` "Scorecards Empty" — delete their existing tasks/meetings first, then insert the fixture rows into SCOR; SCER stays empty). Add `"seed-scorecard": "tsx ./src/seed-scorecard.ts"` to `scripts/package.json`. Idempotent. Prints the two country ids.

- [ ] **Step 2: route-qa overview strip check** — after the NAV_ROUTES loop (before the `/countries` section), on `baseURL + '/'`:
  - `[data-testid="overview-scorecard-strip"]` visible, and it renders **above** the stat cards (assert `document.querySelector('[data-testid="overview-scorecard-strip"]').compareDocumentPosition(statCard) & Node.DOCUMENT_POSITION_FOLLOWING`).
  - Locate the SCOR card via `page.locator('[data-testid^="scorecard-card-"]').filter({ hasText: 'Scorecards Demo' })`, read its id from the testid, and assert its score text equals `49`.
  - Click it → `page.waitForURL('**/country/**?tab=analytics')`, then assert `[data-testid="tab-analytics"]` is active and `[data-testid="analytics-score-ring"]` is visible (deep-link honored).

- [ ] **Step 3: country Analytics assertions (SCOR)** — navigate `GET /country/${scorId}?tab=analytics`; assert ring, `analytics-completion-pct` text `64.3`, `analytics-sla-rate` `37.5`, `analytics-failure-index` `57.1`, ≥ 8 `analytics-failure-row-` on screen, and at least one `analytics-cluster-`. Then navigate to SCER's `?tab=analytics` and assert `scorecard-no-data` renders.

- [ ] **Step 4: Run both suites** — in one bash invocation (API `AUTH_PASSTHROUGH=true PORT=3000` + SPA `VITE_AUTH_DEMO=1 API_PROXY_TARGET=http://localhost:3000`, kill listeners on 3000/5173 first — see Chunk 5 note): run `seed-scorecard`, then `route-qa`. Expected: 52 prior checks + the new ones, `ALL PASS`. Also re-run auth-qa → still green.

- [ ] **Step 5: Commit**
```bash
git add scripts/src/seed-scorecard.ts scripts/package.json scripts/src/route-qa.ts
git commit -m "feat(qa): deterministic scorecard seed + route-qa scorecard/deep-link checks"
```

---

## Chunk 5: Docs, full verification, final commit

### Task 1: Update the implementation plan

**Files:**
- Modify: `docs/implementation-plan.md`

- [ ] **Step 1** — line 5: `**Current next task:** Phase 4.4 — notifications (in-app first; position changes, upcoming meetings, expiring agreements, overdue follow-ups, elections, confidence changes)`.
- [ ] **Step 2** — line 128: `**Status: \`IN PROGRESS\` — Phase 4.3 (country scorecards) complete; notifications remain.**`
- [ ] **Step 3** — line 132 (item 3 scorecards): mark `✓` and record evidence: per-country scorecard (health score, completion %, SLA on-time rate, failure board + clustering), overview strip with deep-links, analytics tab; the one schema addition (`meetings.completedAt`); **auth-qa <N>/<N>** and **route-qa <M>/<M>** green (fill in the actual passing counts from Chunk 4's final run).
- [ ] **Step 4** — line 133 (item 4 notifications): mark as `NEXT`/in progress only if the user starts Phase 4.4; otherwise leave `— not started`.

### Task 2: Full verification

- [ ] **Step 1: Kill ports** — this environment reaps background processes between tool calls, and a stale listener on 3000/5173 silently shadows the real API (caused `countries.map is not a function` in 4.2). Before booting: `lsof -ti tcp:3000 | xargs kill -9 2>/dev/null; lsof -ti tcp:5173 | xargs kill -9 2>/dev/null; true`.
- [ ] **Step 2: One invocation, both suites** — in a single bash call boot API (`AUTH_PASSTHROUGH=true PORT=3000 bun ...`) + SPA (`VITE_AUTH_DEMO=1 API_PROXY_TARGET=http://localhost:3000 bun ...`), wait for readiness (`/api/healthz`), run `seed-scorecard`, run `route-qa`, run auth-qa (separate DB creds), capture both `ALL PASS` lines and the exact passing counts.
- [ ] **Step 3: typecheck + build** — `bun run typecheck`, `bun run --filter @workspace/global-dr-platform build`, `bun run --filter @workspace/scripts typecheck` — all exit 0. `git status` shows only intended files.
- [ ] **Step 4 (only after user confirms push): commit + push** — the plan file carries the final chunks; commit any remaining docs/plan changes. Push `origin/main` only after the user explicitly says to (repo convention — 4.1/4.2 pushed only on request; the final commit for your own repo follows the same norm).

- [ ] **Step 5: Verify the plan file** — every task in this plan now has its checkboxes marked done, and the Chunk 5 status section reflects reality. This plan is the handoff document for `docs/superpowers/plans/2026-09-05-analytics-scorecards.md`.