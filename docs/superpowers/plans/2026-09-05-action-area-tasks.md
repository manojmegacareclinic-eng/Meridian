# Action-Area Tasks (Phase 4.2) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each country define recurring daily/weekly deliverables tied to one of the five action areas, tracked with an owner, status, next-due, and last-completed dates, shown in the country detail "Tasks" tab.

**Architecture:** New flat `tasks` table (countryId FK, actionArea/cadence/status enums enforced at the API via OpenAPI-declared enums, `date`-mode strings for dueDate/lastDoneAt). Full CRUD in a new `routes/tasks.ts` mounted after `requireWriteRole()` (reads any session, writes write-role), every write audited with the countryId. SPA: new `TasksTab.tsx` component fills the existing country "Tasks" placeholder tab, grouped into one section per action area; the meeting dialog's action-area options lift to a shared constant. Scorecards/SLA/completion % remain out of scope (Phase 4.3).

**Tech Stack:** Drizzle ORM, Express 5, OpenAPI/Orval codegen, React 19 + TanStack Router + TanStack Query, Playwright, bun workspaces.

**Spec:** `docs/superpowers/specs/2026-09-05-action-area-tasks-design.md`

---

## Chunk 1: Database

### Task 1: Create the `tasks` table

**Files:**
- Create: `lib/db/src/schema/tasks.ts`
- Modify: `lib/db/src/schema/index.ts`

- [ ] **Step 1: Create the schema file**

`lib/db/src/schema/tasks.ts` (models `ministries.ts`):

```ts
import { integer, pgTable, serial, text, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { countriesTable } from "./countries";

export const ACTION_AREAS = [
  "Trade & investment",
  "Security dialogue",
  "Climate & energy",
  "Humanitarian affairs",
  "Protocol & access",
] as const;

export const TASK_CADENCES = ["daily", "weekly"] as const;
export const TASK_STATUSES = ["active", "paused", "done"] as const;

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  countryId: integer("country_id").notNull().references(() => countriesTable.id, { onDelete: "cascade" }),
  actionArea: text("action_area").notNull(),
  cadence: text("cadence").notNull().default("weekly"),
  title: text("title").notNull(),
  description: text("description"),
  owner: text("owner"),
  status: text("status").notNull().default("active"),
  dueDate: date("due_date", { mode: "string" }),
  lastDoneAt: date("last_done_at", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
```

- [ ] **Step 2: Export from the schema barrel**

In `lib/db/src/schema/index.ts`, add `export * from "./tasks";` to the other `export * from "./…"` lines.

- [ ] **Step 3: Push to the live database**

```bash
bun run --filter @workspace/db push
```
Expected: Drizzle reports creating table `tasks`. Verify:
```bash
psql -d meridian -c "\d tasks" | rg "action_area|due_date|last_done_at"
```

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck` — expected clean.

- [ ] **Step 5: Commit**

```bash
git add lib/db/src/schema/tasks.ts lib/db/src/schema/index.ts
git commit -m "feat(db): tasks table (country x action-area cadence deliverables)"
```

---

## Chunk 2: OpenAPI Contract & Codegen

### Task 2: Add the `tasks` contract to `openapi.yaml`

**Files:**
- Modify: `lib/api-spec/openapi.yaml`

- [ ] **Step 1: Add the `tasks` tag**

In the top-level `tags:` list (now ends with `- name: users`, ~line 28), add after `users`:
```yaml
- name: tasks
```

- [ ] **Step 2: Add the `TaskId` path parameter**

In `components.parameters` (the block starting `MinistryId:` ~line 1622), add after one of the existing `*Id` entries:
```yaml
    TaskId:
      name: id
      in: path
      required: true
      schema:
        type: integer
```

- [ ] **Step 3: Add the `/tasks` and `/tasks/{id}` paths**

Insert immediately before the `  /news:` path block (the `/news:` key, currently ~line 514 — paths are order-independent, so pick this single anchor).

```yaml
  /tasks:
    get:
      operationId: listTasks
      tags:
      - tasks
      summary: List recurring tasks for a country
      parameters:
      - name: countryId
        in: query
        required: true
        schema:
          type: integer
      - name: actionArea
        in: query
        schema:
          type: string
          enum:
          - Trade & investment
          - Security dialogue
          - Climate & energy
          - Humanitarian affairs
          - Protocol & access
      - name: status
        in: query
        schema:
          type: string
          enum:
          - active
          - paused
          - done
      - name: cadence
        in: query
        schema:
          type: string
          enum:
          - daily
          - weekly
      responses:
        '200':
          description: Tasks
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Task'
    post:
      operationId: createTask
      tags:
      - tasks
      summary: Create a recurring task
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/TaskInput'
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Task'
  /tasks/{id}:
    patch:
      operationId: updateTask
      tags:
      - tasks
      summary: Update a recurring task
      parameters:
      - $ref: '#/components/parameters/TaskId'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/TaskUpdate'
      responses:
        '200':
          description: Updated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Task'
        '404':
          description: Task not found
    delete:
      operationId: deleteTask
      tags:
      - tasks
      summary: Delete a recurring task
      parameters:
      - $ref: '#/components/parameters/TaskId'
      responses:
        '200':
          description: Deleted
          content:
            application/json:
              schema:
                type: object
                required:
                - id
                properties:
                  id:
                    type: integer
```

- [ ] **Step 4: Add the `Task` / `TaskInput` / `TaskUpdate` schemas**

In `components.schemas` (alphabetical — after the `Position`/`Organization` block, anywhere in the block). Enums are declared so Orval generates `z.enum` validation:

```yaml
    Task:
      type: object
      required:
      - id
      - countryId
      - countryName
      - actionArea
      - cadence
      - title
      - status
      - createdAt
      - updatedAt
      properties:
        id:
          type: integer
        countryId:
          type: integer
        countryName:
          type: string
        actionArea:
          type: string
          enum:
          - Trade & investment
          - Security dialogue
          - Climate & energy
          - Humanitarian affairs
          - Protocol & access
        cadence:
          type: string
          enum:
          - daily
          - weekly
        title:
          type: string
        description:
          type:
          - string
          - 'null'
        owner:
          type:
          - string
          - 'null'
        status:
          type: string
          enum:
          - active
          - paused
          - done
        dueDate:
          type:
          - string
          - 'null'
          format: date
        lastDoneAt:
          type:
          - string
          - 'null'
          format: date
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
    TaskInput:
      type: object
      required:
      - countryId
      - actionArea
      - title
      properties:
        countryId:
          type: integer
        actionArea:
          type: string
          enum:
          - Trade & investment
          - Security dialogue
          - Climate & energy
          - Humanitarian affairs
          - Protocol & access
        cadence:
          type: string
          enum:
          - daily
          - weekly
          default: weekly
        title:
          type: string
          minLength: 1
        description:
          type: string
        owner:
          type: string
        status:
          type: string
          enum:
          - active
          - paused
          - done
          default: active
        dueDate:
          type: string
          format: date
        lastDoneAt:
          type: string
          format: date
    TaskUpdate:
      type: object
      properties:
        actionArea:
          type: string
          enum:
          - Trade & investment
          - Security dialogue
          - Climate & energy
          - Humanitarian affairs
          - Protocol & access
        cadence:
          type: string
          enum:
          - daily
          - weekly
        title:
          type: string
          minLength: 1
        description:
          type:
          - string
          - 'null'
        owner:
          type:
          - string
          - 'null'
        status:
          type: string
          enum:
          - active
          - paused
          - done
        dueDate:
          type:
          - string
          - 'null'
          format: date
        lastDoneAt:
          type:
          - string
          - 'null'
          format: date
```

- [ ] **Step 5: Run codegen**

```bash
bun run --filter @workspace/api-spec codegen
```
Expected: orval regenerates `lib/api-zod/src/generated/*` and `lib/api-client-react/src/generated/*`, then `patch-generated.ts` prints `patched getHeaders in …`.

- [ ] **Step 6: Add the new named type exports to the hand-curated zod barrel**

`lib/api-zod/src/index.ts` is **not** touched by codegen. Orval generates two layers: (a) all request/response/bodies as **zod schemas in `generated/api.ts`**, which flow through `export * from "./generated/api"` at line 2 automatically — this covers `ListTasksQueryParams`, `ListTasksResponseItem`, `CreateTaskBody`, `CreateTaskResponse`, `UpdateTaskParams/Body/Response`, `DeleteTaskParams/Response` (these are the zod values the route file imports); (b) per-schema **types in `generated/types/`**, which require hand re-export.

Add **only** these 12 generated type names to the `export { type … } from "./generated/types"` block (each will exist in a newly generated `types/task*.ts` file, mirroring `ActionItem*`) — insert alphabetically with the other entries:

```
  type Task,
  type TaskActionArea,
  type TaskCadence,
  type TaskInput,
  type TaskInputActionArea,
  type TaskInputCadence,
  type TaskInputStatus,
  type TaskStatus,
  type TaskUpdate,
  type TaskUpdateActionArea,
  type TaskUpdateCadence,
  type TaskUpdateStatus,
```

**Do NOT** add `ListTasksParams` (a `listTasksParams.ts` type file is generated, but by repo convention the curated block omits every `List*Params` type — check: `ListMinistriesParams` is not in it) and **do NOT** add `ListTasksQueryParams`, `*ResponseItem`, `ListTasksResponse`, `CreateTaskBody/Response`, `UpdateTask*Params/Body/Response`, `DeleteTaskParams/Response` as `type` re-exports — those exist only as zod **values** in `generated/api.ts`, and re-exporting them from `./generated/types` produces TS2305 ("has no exported member") and breaks the build.

- [ ] **Step 7: Rebuild the react-client dist and typecheck**

```bash
npx tsc --build lib/api-client-react
bun run typecheck
```

- [ ] **Step 8: Verify the generated surface exists**

```bash
rg -n "useListTasks|useCreateTask|useUpdateTask|useDeleteTask|getListTasksQueryKey|ListTasksResponseItem|ListTasksQueryParams" lib/api-zod/src/generated lib/api-client-react/src/generated | head -30
```
Expected: hooks `useListTasks`/`useCreateTask`/`useUpdateTask`/`useDeleteTask`, key fn `getListTasksQueryKey`, zod schemas `ListTasksResponseItem`/`ListTasksQueryParams` (these names are **values** in `lib/api-zod/src/generated/api.ts`, auto-exported — they are what the route file imports).

- [ ] **Step 9: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod/src lib/api-client-react/src
git commit -m "feat(api): openapi contract for per-country recurring tasks"
```

---

## Chunk 3: API Handlers (test-first via auth-qa)

### Task 3: Extend `auth-qa.ts` with the tasks block (red)

**Files:**
- Modify: `scripts/src/auth-qa.ts`

- [ ] **Step 1: Import `tasksTable`**

Change the `@workspace/db` import (line ~8) to add `tasksTable`:
```ts
import { db, pool, activityTable, countriesTable, documentsTable, newsTable, userTable, meetingsTable, agreementsTable, drStrategiesTable, tasksTable } from "@workspace/db";
```

- [ ] **Step 2: Insert the Phase 4.2 block**

Insert immediately BEFORE the `// 25 (renumbered). Cleanup:` comment (line ~572). Note: `countryId` (number) is already in scope at line 288, and `adminJar`/`adminPostBody` are in scope from the 4.1 block:

```ts
  // 4.2 Tasks (Phase 4.2, spec 2026-09-05). Per-country recurring deliverables.
  const taskCreate = await fetch(`${origin}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: adminJar.header() },
    body: JSON.stringify({ countryId, title: "Weekly security briefing", actionArea: "Security dialogue" }),
  });
  const taskBody = (await taskCreate.json().catch(() => ({}))) as { id: number; cadence?: string; status?: string; actionArea?: string; countryName?: string };
  check(
    "POST /api/tasks -> 201 defaults weekly/active, echoes countryName",
    taskCreate.status === 201 && taskBody.cadence === "weekly" && taskBody.status === "active" && taskBody.actionArea === "Security dialogue" && String(taskBody.countryName).length > 0,
    `status=${taskCreate.status} body=${JSON.stringify(taskBody).slice(0, 160)}`,
  );
  const taskId = taskBody.id;

  const taskBadArea = await fetch(`${origin}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: adminJar.header() },
    body: JSON.stringify({ countryId, title: "bad", actionArea: "Bogus area" }),
  });
  check("POST /api/tasks invalid actionArea -> 400", taskBadArea.status === 400, `got ${taskBadArea.status}`);

  const taskBadCountry = await fetch(`${origin}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: adminJar.header() },
    body: JSON.stringify({ countryId: 999999, title: "bad", actionArea: "Security dialogue" }),
  });
  check("POST /api/tasks unknown countryId -> 400", taskBadCountry.status === 400, `got ${taskBadCountry.status}`);

  const taskList = await fetch(`${origin}/api/tasks?countryId=${countryId}`, { headers: { cookie: adminJar.header() } });
  const taskListBody = (await taskList.json().catch(() => [])) as { id: number }[];
  check("GET /api/tasks?countryId -> includes task", taskList.status === 200 && taskListBody.some((t) => t.id === taskId), `status=${taskList.status} count=${taskListBody.length}`);

  const taskFiltered = await fetch(`${origin}/api/tasks?countryId=${countryId}&cadence=weekly&status=active`, { headers: { cookie: adminJar.header() } });
  const taskFilteredBody = (await taskFiltered.json().catch(() => [])) as { id: number }[];
  const taskFilteredOut = await fetch(`${origin}/api/tasks?countryId=${countryId}&cadence=daily`, { headers: { cookie: adminJar.header() } });
  const taskFilteredOutBody = (await taskFilteredOut.json().catch(() => [])) as { id: number }[];
  check(
    "GET /api/tasks filters narrow correctly",
    taskFiltered.status === 200 && taskFilteredBody.some((t) => t.id === taskId) && taskFilteredOut.status === 200 && !taskFilteredOutBody.some((t) => t.id === taskId),
    `status=${taskFiltered.status}`,
  );

  const taskPatch = await fetch(`${origin}/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: adminJar.header() },
    body: JSON.stringify({ cadence: "daily", status: "done" }),
  });
  const taskPatchBody = (await taskPatch.json().catch(() => ({}))) as { cadence?: string; status?: string };
  check("PATCH /api/tasks/:id cadence+status -> echoes daily/done", taskPatch.status === 200 && taskPatchBody.cadence === "daily" && taskPatchBody.status === "done", `status=${taskPatch.status} body=${JSON.stringify(taskPatchBody).slice(0, 120)}`);

  const taskPatchBad = await fetch(`${origin}/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: adminJar.header() },
    body: JSON.stringify({ status: "bogus" }),
  });
  check("PATCH /api/tasks/:id invalid status -> 400", taskPatchBad.status === 400, `got ${taskPatchBad.status}`);

  const taskPatch404 = await fetch(`${origin}/api/tasks/999999`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: adminJar.header() },
    body: JSON.stringify({ status: "done" }),
  });
  check("PATCH unknown task -> 404", taskPatch404.status === 404, `got ${taskPatch404.status}`);

  const auditTask = await fetch(`${origin}/api/audit?entityType=task&entityId=${taskId}`, { headers: { cookie: adminJar.header() } });
  const auditTaskBody = (await auditTask.json().catch(() => [])) as { countryId?: number | null; after?: Record<string, unknown> }[];
  check(
    "audit task rows carry countryId and diff",
    auditTask.status === 200 && auditTaskBody.some((r) => r.countryId === countryId) && auditTaskBody.some((r) => (r.after ?? {})["status"] === "done"),
    `status=${auditTask.status} rows=${auditTaskBody.length}`,
  );

  const taskDelete = await fetch(`${origin}/api/tasks/${taskId}`, { method: "DELETE", headers: { cookie: adminJar.header() } });
  check("DELETE /api/tasks/:id -> 200", taskDelete.status === 200, `got ${taskDelete.status}`);

  const taskListAfter = await fetch(`${origin}/api/tasks?countryId=${countryId}`, { headers: { cookie: adminJar.header() } });
  const taskListAfterBody = (await taskListAfter.json().catch(() => [])) as { id: number }[];
  check("task removed after delete", taskListAfter.status === 200 && !taskListAfterBody.some((t) => t.id === taskId), `count=${taskListAfterBody.length}`);
```

- [ ] **Step 3: Extend the cleanup block**

In the cleanup block (line ~577), add a tasks sweep BEFORE the `drStrategiesTable` delete so the FK can never block country deletion:
```ts
    await db.delete(tasksTable).where(eq(tasksTable.countryId, adminPostBody.id));
```

- [ ] **Step 4: Run auth-qa and confirm the new checks FAIL (red)**

```bash
export DATABASE_URL="postgresql://localhost:5432/meridian"; export BETTER_AUTH_SECRET="$(openssl rand -base64 32)"; bun run --filter @workspace/scripts auth-qa > /var/folders/41/dlw_dftx72v3cxf9mnrw3bxc0000gn/T/opencode/qa42a.out 2>&1; tail -5 /var/folders/41/dlw_dftx72v3cxf9mnrw3bxc0000gn/T/opencode/qa42a.out
```
Expected: new `POST /api/tasks` checks fail (404/400 on the missing route) and the suite is red. Do NOT fix yet.

### Task 4: Implement the API (green)

**Files:**
- Create: `artifacts/api-server/src/routes/tasks.ts`
- Modify: `artifacts/api-server/src/lib/audit.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`

- [ ] **Step 1: Add `"task"` to the audit entity-type union**

In `artifacts/api-server/src/lib/audit.ts`, add `| "task"` to the `AuditEntityType` union (after `| "deliverable"`). Without this, `writeAudit({ entityType: "task" })` fails typecheck.

- [ ] **Step 2: Create `routes/tasks.ts`**

Model on `routes/ministries.ts`, with the `countryName` join of `routes/platform.ts` meetings and the date normalization of `routes/actionItems.ts` (codegen coerces body dates to `Date`; the DB columns are `date` string mode):

```ts
import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, tasksTable, countriesTable } from "@workspace/db";
import { diffFields, writeAudit } from "../lib/audit";
import { getActor } from "../middlewares/guards";
import {
  CreateTaskBody,
  CreateTaskResponse,
  DeleteTaskParams,
  DeleteTaskResponse,
  ListTasksQueryParams,
  ListTasksResponseItem,
  UpdateTaskBody,
  UpdateTaskParams,
  UpdateTaskResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const dayOnly = (value?: Date | string | null) => (value ? new Date(value).toISOString().split("T")[0] : null);

router.get("/tasks", async (req, res): Promise<void> => {
  const parsed = ListTasksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const conds = [eq(tasksTable.countryId, parsed.data.countryId)];
  if (parsed.data.actionArea) conds.push(eq(tasksTable.actionArea, parsed.data.actionArea));
  if (parsed.data.status) conds.push(eq(tasksTable.status, parsed.data.status));
  if (parsed.data.cadence) conds.push(eq(tasksTable.cadence, parsed.data.cadence));
  const rows = await db
    .select({
      id: tasksTable.id,
      countryId: tasksTable.countryId,
      countryName: countriesTable.name,
      actionArea: tasksTable.actionArea,
      cadence: tasksTable.cadence,
      title: tasksTable.title,
      description: tasksTable.description,
      owner: tasksTable.owner,
      status: tasksTable.status,
      dueDate: tasksTable.dueDate,
      lastDoneAt: tasksTable.lastDoneAt,
      createdAt: tasksTable.createdAt,
      updatedAt: tasksTable.updatedAt,
    })
    .from(tasksTable)
    .innerJoin(countriesTable, eq(countriesTable.id, tasksTable.countryId))
    .where(and(...conds))
    .orderBy(asc(tasksTable.actionArea), asc(tasksTable.title));
  res.json(ListTasksResponseItem.array().parse(rows));
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [country] = await db
    .select({ name: countriesTable.name })
    .from(countriesTable)
    .where(eq(countriesTable.id, parsed.data.countryId));
  if (!country) {
    res.status(400).json({ error: "Country workspace not found." });
    return;
  }
  const [row] = await db
    .insert(tasksTable)
    .values({ ...parsed.data, dueDate: dayOnly(parsed.data.dueDate), lastDoneAt: dayOnly(parsed.data.lastDoneAt) })
    .returning();
  await writeAudit({
    actor: getActor(req),
    action: "create",
    entityType: "task",
    entityId: String(row.id),
    kind: "task",
    title: "Task created",
    description: `${row.title} (${row.actionArea}, ${row.cadence}) was added to the workspace.`,
    countryId: row.countryId,
    after: { id: row.id, title: row.title, actionArea: row.actionArea, cadence: row.cadence, status: row.status },
  });
  res.status(201).json(CreateTaskResponse.parse({ ...row, countryName: country.name }));
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid task update." });
    return;
  }
  const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Task not found." });
    return;
  }
  const [row] = await db
    .update(tasksTable)
    .set({ ...parsed.data, dueDate: dayOnly(parsed.data.dueDate), lastDoneAt: dayOnly(parsed.data.lastDoneAt) })
    .where(eq(tasksTable.id, params.data.id))
    .returning();
  const [country] = await db.select({ name: countriesTable.name }).from(countriesTable).where(eq(countriesTable.id, row.countryId));
  const diff = diffFields(existing, row, ["title", "description", "actionArea", "cadence", "owner", "status", "dueDate", "lastDoneAt"]);
  await writeAudit({
    actor: getActor(req),
    action: "update",
    entityType: "task",
    entityId: String(row.id),
    kind: "task",
    title: "Task updated",
    description: `${row.title} (${row.actionArea}, ${row.cadence}) was updated.`,
    countryId: row.countryId,
    before: diff?.before ?? null,
    after: diff?.after ?? null,
  });
  res.json(UpdateTaskResponse.parse({ ...row, countryName: country?.name ?? "Unknown" }));
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid task id." });
    return;
  }
  const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Task not found." });
    return;
  }
  await db.delete(tasksTable).where(eq(tasksTable.id, params.data.id));
  await writeAudit({
    actor: getActor(req),
    action: "delete",
    entityType: "task",
    entityId: String(params.data.id),
    kind: "task",
    title: "Task deleted",
    description: `${existing.title} (${existing.actionArea}, ${existing.cadence}) was removed.`,
    countryId: existing.countryId,
  });
  res.json(DeleteTaskResponse.parse({ id: params.data.id }));
});

export default router;
```

- [ ] **Step 3: Mount the router**

In `artifacts/api-server/src/routes/index.ts`: add `import tasksRouter from "./tasks";` to the imports and `router.use(tasksRouter);` with the other resource routers (after `router.use(actionItemsRouter);`). The `requireWriteRole()` mount at line 31 then covers GETs-for-any-session and write-role-gated writes automatically.

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck` — expected clean. If `ListTasksResponseItem`/`CreateTaskResponse`/etc. are not found, re-check the exact generated names from Task 2 Step 8 and fix the import list.

- [ ] **Step 5: Run auth-qa to green**

```bash
export DATABASE_URL="postgresql://localhost:5432/meridian"; export BETTER_AUTH_SECRET="$(openssl rand -base64 32)"; bun run --filter @workspace/scripts auth-qa > /var/folders/41/dlw_dftx72v3cxf9mnrw3bxc0000gn/T/opencode/qa42b.out 2>&1; tail -3 /var/folders/41/dlw_dftx72v3cxf9mnrw3bxc0000gn/T/opencode/qa42b.out
```
Expected: `ALL PASS` with the previous 76 + ~12 new checks.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/routes/tasks.ts artifacts/api-server/src/lib/audit.ts artifacts/api-server/src/routes/index.ts scripts/src/auth-qa.ts
git commit -m "feat(api): per-country recurring tasks CRUD + audit (auth-qa green)"
```

---

## Chunk 4: SPA UI (test-first via route-qa)

### Task 5: Extend `route-qa.ts` with tasks-tab assertions (red)

**Files:**
- Modify: `scripts/src/route-qa.ts`

- [ ] **Step 1: Add a `tasks` branch to the country-detail tab loop**

Inside the `for (const tab of COUNTRY_TABS)` loop in the demo branch, after the existing `news` branch (line ~217), add:

```ts
      if (tab.id === "tasks") {
        await page.waitForSelector('[data-testid="button-add-task"]', { timeout: 15000 });
        check('tasks tab shows "Add task" button', true);
        await page.click('[data-testid="button-add-task"]');
        await page.waitForSelector('[data-testid="select-task-action-area"]', { timeout: 15000 });
        const taskAreaOptions = await page.locator('[data-testid="select-task-action-area"] option').count();
        check("task modal action-area select lists five areas", taskAreaOptions === 5, `got ${taskAreaOptions}`);
        const taskCadenceOptions = await page.locator('[data-testid="select-task-cadence"] option').count();
        check("task modal cadence select lists daily + weekly", taskCadenceOptions === 2, `got ${taskCadenceOptions}`);
        const taskStatusOptions = await page.locator('[data-testid="select-task-status"] option').count();
        check("task modal status select lists three statuses", taskStatusOptions === 3, `got ${taskStatusOptions}`);
        await page.click('[data-testid="button-cancel-task"]');
        await page.waitForTimeout(200);
      }
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck` — expected clean (assertions run only at runtime).

### Task 6: Create the shared constants and lift the meeting action-area options

**Files:**
- Create: `artifacts/global-dr-platform/src/lib/tasks.ts`
- Modify: `artifacts/global-dr-platform/src/App.tsx`

- [ ] **Step 1: Create `src/lib/tasks.ts`**

```ts
export const ACTION_AREAS = [
  "Trade & investment",
  "Security dialogue",
  "Climate & energy",
  "Humanitarian affairs",
  "Protocol & access",
] as const;

export const TASK_CADENCES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
] as const;

export const TASK_STATUSES = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "done", label: "Done" },
] as const;

export const CADENCE_LABEL = Object.fromEntries(TASK_CADENCES.map((c) => [c.value, c.label])) as Record<string, string>;
export const STATUS_LABEL = Object.fromEntries(TASK_STATUSES.map((s) => [s.value, s.label])) as Record<string, string>;
```

- [ ] **Step 2: Lift the meeting dialog action-area options in `App.tsx`**

Add the import (with the other `@/` imports, ~line 129):
```ts
import { ACTION_AREAS } from '@/lib/tasks';
```

In `MeetingsPage`'s "Action area" select (the `data-testid="select-meeting-action-area"` block, line ~498), replace the five literal `<option>` lines with:
```tsx
<option value="" disabled>What is this meeting for?</option>{ACTION_AREAS.map((area) => <option key={area}>{area}</option>)}
```

- [ ] **Step 3: Commit**

```bash
git add artifacts/global-dr-platform/src/lib/tasks.ts artifacts/global-dr-platform/src/App.tsx scripts/src/route-qa.ts
git commit -m "feat(spa): shared action-area constants; tasks-tab route-qa assertions"
```
(commit after Task 7 so the route-qa red run can happen before the SPA wiring lands — see Task 8 Step 4.)

### Task 7: Implement `TasksTab.tsx`

**Files:**
- Create: `artifacts/global-dr-platform/src/components/TasksTab.tsx`

Model on `GovernmentTab.tsx` (component file importing shared UI from `@/App`) and the `DocumentsList` CRUD flow in `App.tsx`:

```tsx
import { useState } from "react";
import { Calendar, CheckCircle2, Edit2, Plus, Trash2, User } from "lucide-react";
import {
  useListTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  getListTasksQueryKey,
} from "@workspace/api-client-react";
import type { Task, TaskInput, TaskUpdate } from "@workspace/api-client-react";
import { queryClient } from "@/lib/query";
import { PrimaryButton, AddDialog, FormField, StatusPill, LoadingRows, ErrorState, EmptyPlaceholder, inputClass, selectClass } from "@/App";
import { ACTION_AREAS, TASK_CADENCES, TASK_STATUSES, CADENCE_LABEL, STATUS_LABEL } from "@/lib/tasks";

const EMPTY_FORM = {
  title: "",
  description: "",
  actionArea: "",
  cadence: "weekly",
  owner: "",
  status: "active",
  dueDate: "",
  lastDoneAt: "",
};

const toDateInput = (d: Date | string | null | undefined) => {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const shortDate = (d: Date | string | null | undefined) => (d ? String(d).slice(0, 10) : "");

export function TasksTab({ countryId }: { countryId: number }) {
  const tasksQuery = useListTasks({ countryId });
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const tasks = tasksQuery.data ?? [];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: getListTasksQueryKey({ countryId }) });

  const openAdd = () => { setEditing(null); setForm({ ...EMPTY_FORM }); setOpen(true); };
  const openEdit = (task: Task) => {
    setEditing(task);
    setForm({
      title: task.title,
      description: task.description ?? "",
      actionArea: task.actionArea,
      cadence: task.cadence,
      owner: task.owner ?? "",
      status: task.status,
      dueDate: toDateInput(task.dueDate),
      lastDoneAt: toDateInput(task.lastDoneAt),
    });
    setOpen(true);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editing) {
      const data: TaskUpdate = {
        title: form.title,
        actionArea: form.actionArea as TaskUpdate["actionArea"],
        cadence: form.cadence as TaskUpdate["cadence"],
        description: form.description === "" ? null : form.description,
        owner: form.owner === "" ? null : form.owner,
        status: form.status as TaskUpdate["status"],
        dueDate: form.dueDate === "" ? null : form.dueDate,
        lastDoneAt: form.lastDoneAt === "" ? null : form.lastDoneAt,
      };
      updateTask.mutate({ id: editing.id, data }, { onSuccess: () => { setOpen(false); invalidate(); } });
    } else {
      const data: TaskInput = {
        countryId,
        title: form.title,
        actionArea: form.actionArea as TaskInput["actionArea"],
        cadence: form.cadence as TaskInput["cadence"],
        description: form.description === "" ? undefined : form.description,
        owner: form.owner === "" ? undefined : form.owner,
        status: form.status as TaskInput["status"],
        dueDate: form.dueDate === "" ? undefined : form.dueDate,
        lastDoneAt: form.lastDoneAt === "" ? undefined : form.lastDoneAt,
      };
      createTask.mutate({ data }, { onSuccess: () => { setOpen(false); invalidate(); } });
    }
  };

  const handleDelete = (task: Task) => {
    if (!confirm(`Delete "${task.title}"?`)) return;
    deleteTask.mutate({ id: task.id }, { onSuccess: invalidate });
  };

  const statusTone: Record<string, "neutral" | "gold" | "green" | "red" | "blue"> = {
    active: "green",
    paused: "gold",
    done: "blue",
  };

  const grouped = ACTION_AREAS.map((area) => ({
    area,
    items: tasks.filter((t) => t.actionArea === area),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Recurring tasks</h2>
        <PrimaryButton testId="button-add-task" onClick={openAdd}><Plus size={16} /> Add task</PrimaryButton>
      </div>

      <AddDialog open={open} title={editing ? "Edit task" : "Add task"} onClose={() => setOpen(false)}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Title">
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required placeholder="e.g. Weekly security briefing" className={inputClass} data-testid="input-task-title" />
          </FormField>
          <FormField label="Description">
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What must be delivered, and to whom" className="h-24 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--accent-foreground))]" data-testid="textarea-task-description" />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Action area">
              <select value={form.actionArea} onChange={(e) => setForm((f) => ({ ...f, actionArea: e.target.value }))} required className={selectClass} data-testid="select-task-action-area">
                {ACTION_AREAS.map((area) => <option key={area} value={area}>{area}</option>)}
              </select>
            </FormField>
            <FormField label="Cadence">
              <select value={form.cadence} onChange={(e) => setForm((f) => ({ ...f, cadence: e.target.value }))} className={selectClass} data-testid="select-task-cadence">
                {TASK_CADENCES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </FormField>
            <FormField label="Owner">
              <input value={form.owner} onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))} placeholder="Team member" className={inputClass} data-testid="input-task-owner" />
            </FormField>
            <FormField label="Status">
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={selectClass} data-testid="select-task-status">
                {TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </FormField>
            <FormField label="Next due">
              <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className={inputClass} data-testid="input-task-due" />
            </FormField>
            <FormField label="Last completed">
              <input type="date" value={form.lastDoneAt} onChange={(e) => setForm((f) => ({ ...f, lastDoneAt: e.target.value }))} className={inputClass} data-testid="input-task-last-done" />
            </FormField>
          </div>
          <div className="flex justify-end gap-3 border-t border-[hsl(var(--border))] pt-5">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2.5 text-xs font-bold hover:bg-[hsl(var(--muted))]" data-testid="button-cancel-task">Cancel</button>
            <PrimaryButton type="submit" testId="button-submit-task">{createTask.isPending || updateTask.isPending ? "Saving…" : editing ? "Save changes" : "Create task"}</PrimaryButton>
          </div>
        </form>
      </AddDialog>

      {tasksQuery.isLoading ? (
        <LoadingRows count={3} />
      ) : tasksQuery.isError ? (
        <ErrorState onRetry={() => void tasksQuery.refetch()} />
      ) : grouped.length === 0 ? (
        <EmptyPlaceholder icon={CheckCircle2} title="No tasks yet" description="Add your first recurring daily or weekly deliverable for this country." action={<PrimaryButton testId="button-empty-add-task" onClick={openAdd}><Plus size={15} /> Add task</PrimaryButton>} />
      ) : (
        <div className="space-y-6">
          {grouped.map(({ area, items }) => (
            <section key={area} className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]" data-testid={`tasks-section-${area}`}>
              <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-3">
                <h3 className="text-sm font-bold">{area}</h3>
                <span className="rounded-full bg-[hsl(var(--secondary))] px-2 py-0.5 text-[10px] font-bold text-[hsl(var(--muted-foreground))]">{items.length}</span>
              </div>
              <div className="divide-y divide-[hsl(var(--border))]">
                {items.map((task) => (
                  <div key={task.id} className="flex items-center justify-between gap-4 px-5 py-4" data-testid={`row-task-${task.id}`}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{task.title}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                        <span className="rounded-full bg-[hsl(var(--secondary)/.55)] px-2 py-0.5 font-bold">{CADENCE_LABEL[task.cadence]}</span>
                        {task.owner && <span className="flex items-center gap-1"><User size={11} /> {task.owner}</span>}
                        {(task.dueDate || task.lastDoneAt) && (
                          <span className="flex items-center gap-1">
                            <Calendar size={11} />
                            {task.dueDate ? `Due ${shortDate(task.dueDate)}` : ""}
                            {task.dueDate && task.lastDoneAt ? " · " : ""}
                            {task.lastDoneAt ? `Last ${shortDate(task.lastDoneAt)}` : ""}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusPill tone={statusTone[task.status] ?? "neutral"}>{STATUS_LABEL[task.status] ?? task.status}</StatusPill>
                      <button onClick={() => openEdit(task)} className="rounded p-1 hover:bg-[hsl(var(--muted))]" aria-label="Edit task" data-testid={`button-task-edit-${task.id}`}><Edit2 size={12} /></button>
                      <button onClick={() => handleDelete(task)} className="rounded p-1 text-red-500 hover:bg-[hsl(var(--destructive)/.15)]" aria-label="Delete task" data-testid={`button-task-delete-${task.id}`}><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 1: Typecheck the component**

Run: `bun run typecheck` — expected clean. If `task.dueDate` is typed `string | null` instead of `Date | null`, the `Date` branch of `toDateInput` is simply unused; if typed `Date | null`, `shortDate` still works.

### Task 8: Wire `TasksTab` into `App.tsx` and run route-qa to green

**Files:**
- Modify: `artifacts/global-dr-platform/src/App.tsx`

- [ ] **Step 1: Import `TasksTab`**

Add with the other component imports (~line 131): `import { TasksTab } from '@/components/TasksTab';`

- [ ] **Step 2: Replace the "Coming soon" branch**

In `CountryDetailPage` (line ~1151), change:

```tsx
        {['tasks', 'analytics'].includes(activeTab) && (
          <EmptyPlaceholder
            icon={BarChart2}
            title="Coming soon"
            description={`The ${TABS.find((t) => t.id === activeTab)?.label} tab is not yet implemented.`}
          />
        )}
```

to:

```tsx
        {activeTab === 'tasks' && country && <TasksTab countryId={id} />}
        {activeTab === 'analytics' && (
          <EmptyPlaceholder
            icon={BarChart2}
            title="Coming soon"
            description={`The ${TABS.find((t) => t.id === activeTab)?.label} tab is not yet implemented.`}
          />
        )}
```

- [ ] **Step 3: Typecheck + build**

```bash
bun run typecheck && bun run --filter @workspace/global-dr-platform build
```
Expected: clean; `✓ built` (≈2s).

- [ ] **Step 4: Boot API + SPA and run route-qa (same invocation)**

```bash
export DATABASE_URL="postgresql://localhost:5432/meridian"; export BETTER_AUTH_SECRET="$(openssl rand -base64 32)"
DATABASE_URL="$DATABASE_URL" BETTER_AUTH_SECRET="$BETTER_AUTH_SECRET" AUTH_PASSTHROUGH=true PORT=3000 bun run --filter @workspace/api-server dev > /var/folders/41/dlw_dftx72v3cxf9mnrw3bxc0000gn/T/opencode/api42.log 2>&1 &
VITE_AUTH_DEMO=1 API_PROXY_TARGET=http://localhost:3000 bun run --filter @workspace/global-dr-platform dev > /var/folders/41/dlw_dftx72v3cxf9mnrw3bxc0000gn/T/opencode/spa42.log 2>&1 &
sleep 8; nc -z 127.0.0.1 3000 && echo api-up; nc -z 127.0.0.1 5173 && echo spa-up
bun run --filter @workspace/scripts route-qa > /var/folders/41/dlw_dftx72v3cxf9mnrw3bxc0000gn/T/opencode/routeqa42.out 2>&1; grep -E "PASS |FAIL |ALL PASS|FAILURES" /var/folders/41/dlw_dftx72v3cxf9mnrw3bxc0000gn/T/opencode/routeqa42.out | tail -60
```
Expected: `ALL PASS`, previous 48 + 4 new `tasks` checks. If the later meeting/agreement sections of route-qa fail on `card-meeting-`/`row-agreement-` timeouts, re-seed the demo rows (QA Meeting/QA Agreement for countries 10 and 19) first, as in the 4.1 round.

- [ ] **Step 5: Kill servers**

```bash
for p in 3000 5173; do lsof -ti tcp:$p | xargs kill 2>/dev/null; done
```

- [ ] **Step 6: Commit**

```bash
git add artifacts/global-dr-platform/src/App.tsx artifacts/global-dr-platform/src/components/TasksTab.tsx scripts/src/route-qa.ts
git commit -m "feat(spa): country Tasks tab grouped by action area (route-qa green)"
```

---

## Chunk 5: Docs & Final Verification

### Task 9: Update docs

**Files:**
- Modify: `docs/implementation-plan.md`
- Modify: `docs/superpowers/plans/2026-09-05-action-area-tasks.md` (this file — check the boxes)

- [ ] **Step 1: `docs/implementation-plan.md` — Phase 4 status + checklist**

Change line 128:
`**Status: \`IN PROGRESS\` — Phase 4.1 (country assignments) complete; deliverables/tasks, scorecards, and notifications remain.**`
to:
`**Status: \`IN PROGRESS\` — Phase 4.2 (action-area tasks) complete; scorecards and notifications remain.**`

Change line 130:
`1. Add weekly and daily deliverables tied to action areas. — not started`
to:
`1. Add weekly and daily deliverables tied to action areas. ✓ (Phase 4.2, this session: per-country \`tasks\` entity with action area + daily/weekly cadence, owner, status, next-due / last-completed; country Tasks tab grouped by action area; auth-qa + route-qa green)`

Change line 5 (`**Current next task:**`):
`**Current next task:** Phase 4.2+ — deliverables/tasks, scorecards, and notifications.`
to:
`**Current next task:** Phase 4.3 — scorecards, completion percentage, response SLA, and failure analysis.`

- [ ] **Step 2: Mark this plan's checkboxes** `- [ ]` → `- [x]` as each task completes.

- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs: Phase 4.2 action-area tasks status"
```

### Task 10: Final verification & commit

- [ ] **Step 1: Full verification**

```bash
bun run typecheck && bun run --filter @workspace/global-dr-platform build
```
Expected: clean.

- [ ] **Step 2: Confirm nothing stray in git**

```bash
git status
```
Expected: only intended files.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(tasks): Phase 4.2 complete — weekly/daily action-area tasks per country"
```

---

## Notes for Implementer

- **Codegen:** `bun run --filter @workspace/api-spec codegen` regenerates `generated/*` only; `lib/api-zod/src/index.ts` is hand-curated — add the 12 generated Task type names listed in Task 2 Step 6 (do NOT re-export zod-value-only names like `*Body`/`*Response`/`*Params` as types; those arrive via `export * from "./generated/api"`). Rebuild with `npx tsc --build lib/api-client-react`.
- **Body date coercion:** orval's zod config coerces `date` fields in bodies to `Date`; the DB columns are `date` string mode. Always normalize via `dayOnly()` before insert/update (mirrors `routes/actionItems.ts:88-92`).
- **Audit union:** `writeAudit` requires `"task"` to be added to `AuditEntityType` in `artifacts/api-server/src/lib/audit.ts`, or the route fails typecheck.
- **Read/write gates:** mounting `tasksRouter` after `requireWriteRole()` means reads work for any session and writes are gated to non-viewers — no in-handler gate needed (unlike `/users/assignable`).
- **Hook shape:** `useListTasks({ countryId })` — the required query param is the first positional arg (like `useListMinistries({ countryId })`), NOT the single-arg `{ query }` form.
- **route-qa specifics:** API + SPA dev servers must be booted in the SAME bash invocation as the route-qa run (background jobs don't survive across tool invocations). Use `/var/folders/41/dlw_dftx72v3cxf9mnrw3bxc0000gn/T/opencode/*.log` for logs (the `/tmp` cleanup already bit us). The demo DB needs the QA Meeting + QA Agreement rows (countries 10/19) or the meeting/agreement sections of route-qa time out — re-seed if missing.
- **auth-qa dates:** don't assert `dueDate` string-equality (date normalization differs across codegen/DB); assert enum fields (`cadence`/`status`/`actionArea`) only.
- **Empty-state each run:** demo data has no tasks, so route-qa sees `button-add-task` + the empty state; create/edit/delete flows are covered at the API level by auth-qa.