# Country Assignments (Phase 4.1) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let each country name a primary owner, secondary owner, reviewer, and regional coordinator, chosen from app user accounts, displayed on the country detail Overview tab and country list cards.

**Architecture:** Four nullable `text` FK columns on `countries` → `user.id` (Better Auth uuid strings). Country GET/PATCH responses attach nested `{ userId, name }` assignee objects resolved with one `IN` query on `user`. A new write-role-gated `GET /users/assignable` feeds a user picker in the existing "Edit details" modal. Assignments are informational — the existing role gates are unchanged.

**Tech Stack:** Drizzle ORM, Express 5, OpenAPI/Orval codegen, React 19 + TanStack Router + TanStack Query, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-04-country-assignments-spec.md`

---

## Chunk 1: Database Column

### Task 1: Add assignment columns to `countries`

**Files:**
- Modify: `lib/db/src/schema/countries.ts`

- [x] **Step 1: Add the import**

At the top of `lib/db/src/schema/countries.ts` add after the existing imports:

```ts
import { userTable } from "./auth";
```

- [x] **Step 2: Add the four columns**

Add these to `countriesTable` after `strategy: text("strategy"),` (before `createdAt`):

```ts
  primaryOwnerUserId: text("primary_owner_user_id").references(() => userTable.id, { onDelete: "set null" }),
  secondaryOwnerUserId: text("secondary_owner_user_id").references(() => userTable.id, { onDelete: "set null" }),
  reviewerUserId: text("reviewer_user_id").references(() => userTable.id, { onDelete: "set null" }),
  regionalCoordinatorUserId: text("regional_coordinator_user_id").references(() => userTable.id, { onDelete: "set null" }),
```

- [x] **Step 3: Push the schema to the live database**

Run:
```bash
bun run --filter @workspace/db push
```
Expected: Drizzle reports adding 4 columns to `countries`, creates the FKs. Verify:
```bash
psql -d meridian -c "\d countries" | rg "owner_user_id|coordinator_user_id"
```
Expected: four `text` columns present.

- [x] **Step 4: Typecheck**

Run: `bun run typecheck:libs` — expected clean (auth.ts exports `userTable`, no cycle: `auth.ts` does not import `countries.ts`).

- [x] **Step 5: Commit**

```bash
git add lib/db/src/schema/countries.ts
git commit -m "feat(db): country assignment columns (owners, reviewer, coordinator)"
```

---

## Chunk 2: OpenAPI Contract & Codegen

### Task 2: Add the contract to `openapi.yaml`

**Files:**
- Modify: `lib/api-spec/openapi.yaml`

- [x] **Step 1: Add a `users` tag**

In the top-level `tags:` list (currently ends with `- name: deliverables`) add:
```yaml
- name: users
```

- [x] **Step 2: Add the `/users/assignable` path**

Insert this block immediately before the `  /contacts:` path (after the `/countries/{id}` block ends with its `'404'` response):

```yaml
  /users/assignable:
    get:
      operationId: listAssignableUsers
      tags:
      - users
      summary: List users that can be assigned to a country
      responses:
        '200':
          description: Assignable users (id, name, role; never email)
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/AssignableUser'
        '403':
          description: Forbidden for viewers
```

- [x] **Step 3: Add four assignee fields to the `Country` schema**

In `components.schemas.Country`, after the `strategy` property (which ends `type:\n  - string\n  - 'null'`), add — all four as **inline** optional-nullable objects (no `$ref`; on-a-`$ref` `nullable` is an OpenAPI 3.0 relic orval does not honor, which would make the zod schema non-nullable and crash `.parse` on every unassigned country):

```yaml
        primaryOwner:
          type:
          - object
          - 'null'
          properties:
            userId:
              type: string
            name:
              type: string
          required:
          - userId
          - name
        secondaryOwner:
          type:
          - object
          - 'null'
          properties:
            userId:
              type: string
            name:
              type: string
          required:
          - userId
          - name
        reviewer:
          type:
          - object
          - 'null'
          properties:
            userId:
              type: string
            name:
              type: string
          required:
          - userId
          - name
        regionalCoordinator:
          type:
          - object
          - 'null'
          properties:
            userId:
              type: string
            name:
              type: string
          required:
          - userId
          - name
```

- [x] **Step 4: Add the `AssignableUser` schema**

In `components.schemas` (alphabetical block), add:

```yaml
    AssignableUser:
      type: object
      required:
      - userId
      - name
      - role
      properties:
        userId:
          type: string
        name:
          type: string
        role:
          type: string
```

- [x] **Step 5: Add four assignment fields to `CountryUpdate`**

In `components.schemas.CountryUpdate`, after `strategy:`, add:

```yaml
        primaryOwnerUserId:
          type:
          - string
          - 'null'
        secondaryOwnerUserId:
          type:
          - string
          - 'null'
        reviewerUserId:
          type:
          - string
          - 'null'
        regionalCoordinatorUserId:
          type:
          - string
          - 'null'
```

- [x] **Step 7: Run codegen**

```bash
bun run --filter @workspace/api-spec codegen
```

- [x] **Step 8: Remove the known codegen pitfall**

Check `lib/api-zod/src/index.ts` for a trailing appended line. It will NOT contain it unless the patch script added it; verify/guard anyway:

```bash
rg -n "generated/types" lib/api-zod/src/index.ts
```
If the line `export * from './generated/types';` is present at the end, delete it (it duplicates the barrel and breaks exports). It was previously present and was removed manually; the patch script (`lib/api-spec/scripts/patch-generated.ts`) only patches `getHeaders` in api-client-react.

- [x] **Step 9: Rebuild the react-client dist and typecheck**

```bash
npx tsc --build lib/api-client-react
bun run typecheck
```

- [x] **Step 10: Verify the generated surface exists**

```bash
rg -n "listAssignableUsers|ListAssignableUsers|AssignableUser|useListAssignableUsers|getListAssignableUsers" lib/api-zod/src/generated lib/api-client-react/src/generated | head -30
```
Expected: schema names `ListAssignableUsersResponseItem` / `ListAssignableUsersResponse` (zod) and hook `useListAssignableUsers` + query-key fn `getListAssignableUsersQueryKey` (react). Note the EXACT zod response-schema names here — the API route will import the actual name found.

- [x] **Step 11: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod/src lib/api-client-react/src
git commit -m "feat(api): openapi contract for country assignments and /users/assignable"
```

---

## Chunk 3: API Handlers (test-first via auth-qa)

### Task 3: Extend `auth-qa.ts` with the assignment block

**Files:**
- Modify: `scripts/src/auth-qa.ts`

The test suite runs against the live Postgres in a spawned server; sessions via cookies; users created via `createAccount`/admin API; cleanup deletes users by `QA_EMAILS` and the country by `QA_CODE`.

- [x] **Step 1: Add a disposable assignee email**

Change the `QA_EMAILS` constant (line ~28) from 3 to 4 entries:

```ts
const QA_EMAILS = ["qa@meridian.local", "qa-viewer@meridian.local", "qa-admin2@meridian.local", "qa-assignee@meridian.local"];
```
Cleanup already deletes users by `inArray(userTable.email, QA_EMAILS)`.

- [x] **Step 2: Insert the Phase 4.1 block**

Insert this block immediately BEFORE the "// 25 (renumbered). Cleanup:" comment (around line 481), using the existing `adminJar`/`adminPostBody`/`viewerJar` variables:

```ts
  // 4.1 Country assignments (Phase 4.1, spec 2026-09-04).
  //    Admin creates a disposable assignee account (email QA_EMAILS[3]).
  const assigneeCreate = await fetch(`${origin}/api/admin/users`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: adminJar.header() },
    body: JSON.stringify({ email: QA_EMAILS[3], name: "QA Assignee", role: "country_lead" }),
  });
  check("POST /api/admin/users (assignee) -> 201", assigneeCreate.status === 201, `got ${assigneeCreate.status}`);

  const admUsers = await fetch(`${origin}/api/admin/users`, { headers: { cookie: adminJar.header() } });
  const admUsersBody = (await admUsers.json().catch(() => [])) as { id?: string; email?: string; name?: string; role?: string }[];
  const assignee = admUsersBody.find((u) => u.email === QA_EMAILS[3]);
  check(
    "admin users list includes assignee with id",
    Boolean(assignee?.id && assignee.name === "QA Assignee"),
    `assignee=${JSON.stringify(assignee)}`,
  );
  const assigneeId = assignee?.id;

  if (typeof adminPostBody.id === "number" && assigneeId) {
    // New endpoint lists { userId, name, role } for non-banned users.
    const assignable = await fetch(`${origin}/api/users/assignable`, { headers: { cookie: adminJar.header() } });
    const assignableBody = (await assignable.json().catch(() => [])) as { userId?: string; name?: string; role?: string }[];
    check(
      "GET /api/users/assignable lists assignee with id/name/role",
      assignable.status === 200 &&
        assignableBody.some((u) => u.userId === assigneeId && u.name === "QA Assignee" && u.role === "country_lead") &&
        assignableBody.every((u) => typeof u.userId === "string" && typeof u.name === "string" && typeof u.role === "string" && !("email" in u)),
      `status=${assignable.status} body=${JSON.stringify(assignableBody).slice(0, 160)}`,
    );

    // Viewers are rejected by the in-handler gate (mount middleware bypasses GET).
    const assignableViewer = await fetch(`${origin}/api/users/assignable`, { headers: { cookie: viewerJar.header() } });
    check("GET /api/users/assignable as viewer -> 403", assignableViewer.status === 403, `got ${assignableViewer.status}`);

    // Banned users are excluded.
    await db.update(userTable).set({ banned: true }).where(eq(userTable.email, QA_EMAILS[3]));
    const assignableBanned = await fetch(`${origin}/api/users/assignable`, { headers: { cookie: adminJar.header() } });
    const assignableBannedBody = (await assignableBanned.json().catch(() => [])) as { userId?: string }[];
    check(
      "banned user excluded from assignable",
      assignableBanned.status === 200 && !assignableBannedBody.some((u) => u.userId === assigneeId),
      `status=${assignableBanned.status}`,
    );
    await db.update(userTable).set({ banned: false }).where(eq(userTable.email, QA_EMAILS[3]));

    // Fresh country has no assignee.
    const countryBefore = await fetch(`${origin}/api/countries/${adminPostBody.id}`, { headers: { cookie: adminJar.header() } });
    const countryBeforeBody = (await countryBefore.json().catch(() => ({}))) as { primaryOwner?: { userId?: string } | null };
    check("fresh country has primaryOwner null", countryBefore.status === 200 && countryBeforeBody.primaryOwner === null, `status=${countryBefore.status} owner=${JSON.stringify(countryBeforeBody.primaryOwner)}`);

    // Assign primary owner -> response echoes { userId, name }.
    const assignPatch = await fetch(`${origin}/api/countries/${adminPostBody.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: adminJar.header() },
      body: JSON.stringify({ primaryOwnerUserId: assigneeId }),
    });
    const assignPatchBody = (await assignPatch.json().catch(() => ({}))) as { primaryOwner?: { userId?: string; name?: string } | null };
    check(
      "PATCH primaryOwnerUserId -> 200, echoes assignee",
      assignPatch.status === 200 && assignPatchBody.primaryOwner?.userId === assigneeId && assignPatchBody.primaryOwner?.name === "QA Assignee",
      `status=${assignPatch.status} body=${JSON.stringify(assignPatchBody).slice(0, 160)}`,
    );

    // Bogus user id -> clean 400 before FK.
    const bogusPatch = await fetch(`${origin}/api/countries/${adminPostBody.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: adminJar.header() },
      body: JSON.stringify({ reviewerUserId: "00000000-0000-0000-0000-000000000000" }),
    });
    check("PATCH with unknown user id -> 400", bogusPatch.status === 400, `got ${bogusPatch.status}`);

    // Clearing via null.
    const clearPatch = await fetch(`${origin}/api/countries/${adminPostBody.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: adminJar.header() },
      body: JSON.stringify({ primaryOwnerUserId: null }),
    });
    const clearPatchBody = (await clearPatch.json().catch(() => ({}))) as { primaryOwner?: unknown };
    check("PATCH primaryOwnerUserId null clears assignment", clearPatch.status === 200 && clearPatchBody.primaryOwner === null, `status=${clearPatch.status} owner=${JSON.stringify(clearPatchBody.primaryOwner)}`);

    // Assignment change appears in the country audit dif.
    const auditAssign = await fetch(`${origin}/api/audit?entityType=country&entityId=${adminPostBody.id}`, { headers: { cookie: adminJar.header() } });
    const auditAssignBody = (await auditAssign.json().catch(() => [])) as { after?: Record<string, unknown> }[];
    check(
      "country audit row captures assignment change",
      auditAssign.status === 200 && auditAssignBody.some((r) => r.after && "primaryOwnerUserId" in r.after),
      `status=${auditAssign.status}`,
    );
  }
```

- [x] **Step 3: Run auth-qa and confirm the new checks FAIL (red)**

Run:
```bash
export DATABASE_URL="postgresql://localhost:5432/meridian"; export BETTER_AUTH_SECRET="$(openssl rand -base64 32)"; bun run --filter @workspace/scripts auth-qa > /tmp/qa41a.out 2>&1; tail -5 /tmp/qa41a.out
```
Expected: new checks fail (e.g. `404` on `/users/assignable`, missing `primaryOwner`) and overall suite red. Do NOT fix yet.

### Task 4: Implement the API

**Files:**
- Modify: `artifacts/api-server/src/routes/platform.ts`

- [x] **Step 1: Extend imports**

Change the `@workspace/db` import to add `userTable`:
```ts
import { db, activityTable, agreementsTable, contactsTable, countriesTable, documentsTable, meetingsTable, newsTable, userTable } from "@workspace/db";
```
Add a new import after the `getActor` import:
```ts
import { WRITE_ROLES } from "@workspace/auth";
```
Add the generated zod import — append ONLY this new identifier to the existing `from "@workspace/api-zod"` import block (do NOT re-add identifiers already imported; EXACT NAMES from Task 2 Step 10):
```ts
  ListAssignableUsersResponse,
```
(If codegen named it `ListAssignableUsersResponseItem`+array, use the array name found in Task 2 Step 10.)

- [x] **Step 2: Add an assignee-resolution helper**

Immediately after the `countryFields` const (line ~65) add:

```ts
type AssigneeRow = {
  primaryOwnerUserId: string | null;
  secondaryOwnerUserId: string | null;
  reviewerUserId: string | null;
  regionalCoordinatorUserId: string | null;
};

async function attachAssignees<T extends AssigneeRow>(rows: T[]) {
  const ids = [
    ...new Set(
      rows.flatMap((r) => [
        r.primaryOwnerUserId,
        r.secondaryOwnerUserId,
        r.reviewerUserId,
        r.regionalCoordinatorUserId,
      ].filter((x): x is string => Boolean(x))),
    ),
  ];
  const users = ids.length
    ? await db.select({ id: userTable.id, name: userTable.name }).from(userTable).where(inArray(userTable.id, ids))
    : [];
  const byId = new Map(users.map((u) => [u.id, u.name]));
  const pick = (id: string | null) => (id && byId.has(id) ? { userId: id, name: byId.get(id)! } : null);
  return rows.map((r) => ({
    ...r,
    primaryOwner: pick(r.primaryOwnerUserId),
    secondaryOwner: pick(r.secondaryOwnerUserId),
    reviewer: pick(r.reviewerUserId),
    regionalCoordinator: pick(r.regionalCoordinatorUserId),
  }));
}

async function resolveAssignees<T extends AssigneeRow>(row: T) {
  const [resolved] = await attachAssignees([row]);
  return resolved;
}
```

- [x] **Step 3: Add the four raw columns to `countryFields`**

Add to the `countryFields` object:
```ts
  primaryOwnerUserId: countriesTable.primaryOwnerUserId,
  secondaryOwnerUserId: countriesTable.secondaryOwnerUserId,
  reviewerUserId: countriesTable.reviewerUserId,
  regionalCoordinatorUserId: countriesTable.regionalCoordinatorUserId,
```

- [x] **Step 4: Update the `GET /countries` list handler**

Replace the final `res.json(...)` (line ~109) with:

```ts
  const mapped = await attachAssignees(
    rows.map((row) => ({
      ...row,
      contactsCount: contactsByCountry.get(row.id) ?? 0,
      meetingsCount: meetingsByCountry.get(row.id) ?? 0,
    })),
  );
  res.json(ListCountriesResponse.parse(mapped));
```

- [x] **Step 5: Update `GET /countries/:id`**

Replace the final `res.json(...)` (line ~149) with:

```ts
  const resolved = await resolveAssignees({ ...row, contactsCount: Number(contactCounts[0]?.count ?? 0), meetingsCount: Number(meetingCounts[0]?.count ?? 0) });
  res.json(GetCountryResponse.parse(resolved));
```

- [x] **Step 6: Update `PATCH /countries/:id`**

After the `existing` 404 check (line ~157) add user-id validation:

```ts
  const assignmentIds = [
    parsed.data.primaryOwnerUserId,
    parsed.data.secondaryOwnerUserId,
    parsed.data.reviewerUserId,
    parsed.data.regionalCoordinatorUserId,
  ].filter((x): x is string => typeof x === "string");
  if (assignmentIds.length) {
    const found = await db.select({ id: userTable.id }).from(userTable).where(inArray(userTable.id, assignmentIds));
    if (found.length !== assignmentIds.length) {
      res.status(400).json({ error: "Unknown user id in country assignment." });
      return;
    }
  }
```

Change the `diffFields` allowlist (line ~159) to add the four keys:

```ts
  const diff = diffFields(existing as unknown as Record<string, unknown>, row as unknown as Record<string, unknown>, ["name", "region", "status", "riskLevel", "language", "governmentType", "electionYear", "team", "priority", "strategy", "primaryOwnerUserId", "secondaryOwnerUserId", "reviewerUserId", "regionalCoordinatorUserId"]);
```

Replace the final `res.json(...)` (line ~176) with:

```ts
  const resolved = await resolveAssignees({ ...row, contactsCount: Number(contactCounts[0]?.count ?? 0), meetingsCount: Number(meetingCounts[0]?.count ?? 0) });
  res.json(UpdateCountryResponse.parse(resolved));
```

- [x] **Step 7: Add the `GET /users/assignable` route**

Insert immediately after the `PATCH /countries/:id` handler (before `router.get("/contacts"`) :

```ts
// Write-role gated inside the handler: the requireWriteRole mount middleware
// bypasses GET, so this route checks the role itself.
router.get("/users/assignable", async (req, res): Promise<void> => {
  const actor = getActor(req);
  if (actor.role === null || !WRITE_ROLES.has(actor.role)) {
    res.status(403).json({ error: "forbidden", message: "Viewers have read-only access to the workspace." });
    return;
  }
  const rows = await db
    .select({ userId: userTable.id, name: userTable.name, role: userTable.role })
    .from(userTable)
    .where(eq(userTable.banned, false))
    .orderBy(asc(userTable.name));
  res.json(ListAssignableUsersResponse.parse(rows));
});
```

- [x] **Step 8: Typecheck**

Run: `bun run typecheck` — expected clean.

- [x] **Step 9: Run auth-qa to green**

Run (same env as Task 3 Step 3):
```bash
bun run --filter @workspace/scripts auth-qa > /tmp/qa41b.out 2>&1; tail -3 /tmp/qa41b.out
```
Expected: `ALL PASS` with the previous count + ~9 new checks. If a `400 Invalid country update` appears on the `PATCH` with only `primaryOwnerUserId`, that means `UpdateCountryBody` didn't get the field — re-check codegen / the parsed body key names.

- [x] **Step 10: Run route-qa to make sure API-side changes didn't break the SPA flow**

Run against a running SPA later (Task 6 Step 2 handles this); for now confirm nothing regressed at typecheck level.

- [x] **Step 11: Commit**

```bash
git add artifacts/api-server/src/routes/platform.ts scripts/src/auth-qa.ts
git commit -m "feat(api): country assignments + /users/assignable (auth-qa green)"
```

---

## Chunk 4: SPA UI (test-first via route-qa)

### Task 5: Extend `route-qa.ts` with assignment assertions

**Files:**
- Modify: `scripts/src/route-qa.ts`

- [x] **Step 1: Add list-card assertion**

In the demo branch, right after the `card-country-` wait/ID extraction (around line 147), add:

```ts
    const ownerChips = await page.locator('[data-testid="country-primary-owner"]').count();
    check("no primary-owner chip when unassigned (demo)", ownerChips === 0, `got ${ownerChips}`);
```

- [x] **Step 2: Add overview-tab assignment assertions**

In the demo `COUNTRY_TABS` loop, inside the `if (tab.id === "overview")` branch, after the existing `button-country-edit` check add:

```ts
        await page.waitForSelector('[data-testid="assignments-block"]', { timeout: 15000 });
        check('overview tab shows "Assignments" block', true);
        const roleRows = await page.locator('[data-testid^="assignment-role-"]').count();
        check("assignments block shows four assignee roles", roleRows === 4, `got ${roleRows}`);
        const unassignedText = ((await page.locator('[data-testid="assignments-block"]').textContent()) ?? "");
        check("each unassigned role shows a placeholder", (unassignedText.match(/Unassigned/g) ?? []).length >= 4, `got "${unassignedText.slice(0, 120)}"`);
```

- [x] **Step 3: Typecheck**

Run: `bun run typecheck` — expected clean.

### Task 6: Implement the SPA

**Files:**
- Modify: `artifacts/global-dr-platform/src/App.tsx`

- [x] **Step 1: Extend the generated imports**

Add to the first generated import block (alphabetical): `useListAssignableUsers`. Add to the `import type` block: `AssignableUser` (name confirmed in Task 2 Step 10). Do NOT import the query-key fn (`getListAssignableUsersQueryKey`) — no invalidation target needs it.

- [x] **Step 2: Add the AssignmentsBlock component**

Add this component immediately after `OverviewTab` (after line 244):

```tsx
const ASSIGNMENT_ROLES = [
  { key: 'primaryOwner', label: 'Primary owner', testId: 'primary-owner' },
  { key: 'secondaryOwner', label: 'Secondary owner', testId: 'secondary-owner' },
  { key: 'reviewer', label: 'Reviewer', testId: 'reviewer' },
  { key: 'regionalCoordinator', label: 'Regional coordinator', testId: 'regional-coordinator' },
] as const;

function AssignmentsBlock({ country }: { country: Country }) {
  return (
    <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]" data-testid="assignments-block">
      <div className="border-b border-[hsl(var(--border))] px-6 py-5">
        <h3 className="font-serif text-[22px]">Assignments</h3>
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Who owns, reviews, and coordinates this relationship.</p>
      </div>
      <div className="divide-y divide-[hsl(var(--border))]">
        {ASSIGNMENT_ROLES.map(({ key, label, testId }) => {
          const assignee = country[key];
          return (
            <div key={key} className="flex items-center justify-between px-6 py-4" data-testid={`assignment-role-${testId}`}>
              <span className="text-xs font-bold uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">{label}</span>
              <span className="text-xs" data-testid={`assignment-assignee-${testId}`}>
                {assignee ? (
                  <StatusPill tone="neutral">{assignee.name}</StatusPill>
                ) : (
                  <span className="text-[hsl(var(--muted-foreground))]">Unassigned</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [x] **Step 3: Wire the block into OverviewTab**

Change the `OverviewTab` signature (line 208) to:

```tsx
function OverviewTab({ country, countryId }: { country: Country; countryId: number }) {
```

Inside OverviewTab's returned JSX, insert `<AssignmentsBlock country={country} />` between the closing `</div>` of the KPI grid (line 222) and the `<section>` for "Recent activity" (line 223):

```tsx
      <AssignmentsBlock country={country} />
```

Note: the block is rendered unconditionally (list query top-level rule).

- [x] **Step 4: Pass `country` into OverviewTab**

At line 1018 change `{activeTab === 'overview' && <OverviewTab countryId={id} />}` to:

```tsx
{activeTab === 'overview' && country && <OverviewTab country={country} countryId={id} />}
```

- [x] **Step 5: Add assignment fields to the edit modal state**

In `CountryDetailPage`, extend `editValues` (lines ~865-872) initial state with the four fields:

```ts
  const [editValues, setEditValues] = useState({
    language: '',
    governmentType: '',
    electionYear: 0,
    team: '',
    priority: 'medium',
    strategy: '',
    primaryOwnerUserId: '',
    secondaryOwnerUserId: '',
    reviewerUserId: '',
    regionalCoordinatorUserId: '',
  });
```

In the `useEffect` sync (lines ~875-886) add:

```ts
        primaryOwnerUserId: country.primaryOwner?.userId ?? '',
        secondaryOwnerUserId: country.secondaryOwner?.userId ?? '',
        reviewerUserId: country.reviewer?.userId ?? '',
        regionalCoordinatorUserId: country.regionalCoordinator?.userId ?? '',
```

Add the query (top-level, lazy) after the `updateCountry` line (line ~873):

```ts
  const assignableUsersQuery = useListAssignableUsers({ query: { enabled: editOpen } });
  const assignableUsers = assignableUsersQuery.data ?? [];
```
Note: `listAssignableUsers` has no path/query params, so Orval generates a **single-arg** hook `useListAssignableUsers(options?)` — no `(undefined, options)` form.

- [x] **Step 6: Add the four selects to the edit modal**

In the edit `<form>` (which currently ends around line ~1010), immediately before the closing buttons row (`<div className="flex justify-end gap-3 border-t ...">`), add:

```tsx
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="Primary owner">
                      <select
                        name="primaryOwnerUserId"
                        value={editValues.primaryOwnerUserId}
                        onChange={(e) => setEditValues({ ...editValues, primaryOwnerUserId: e.target.value })}
                        className={selectClass}
                        data-testid="country-field-assignee-primary-owner"
                      >
                        <option value="">Unassigned</option>
                        {assignableUsers.map((u) => (
                          <option value={u.userId} key={u.userId}>{u.name} — {roleLabel(u.role)}</option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Secondary owner">
                      <select
                        name="secondaryOwnerUserId"
                        value={editValues.secondaryOwnerUserId}
                        onChange={(e) => setEditValues({ ...editValues, secondaryOwnerUserId: e.target.value })}
                        className={selectClass}
                        data-testid="country-field-assignee-secondary-owner"
                      >
                        <option value="">Unassigned</option>
                        {assignableUsers.map((u) => (
                          <option value={u.userId} key={u.userId}>{u.name} — {roleLabel(u.role)}</option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Reviewer">
                      <select
                        name="reviewerUserId"
                        value={editValues.reviewerUserId}
                        onChange={(e) => setEditValues({ ...editValues, reviewerUserId: e.target.value })}
                        className={selectClass}
                        data-testid="country-field-assignee-reviewer"
                      >
                        <option value="">Unassigned</option>
                        {assignableUsers.map((u) => (
                          <option value={u.userId} key={u.userId}>{u.name} — {roleLabel(u.role)}</option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Regional coordinator">
                      <select
                        name="regionalCoordinatorUserId"
                        value={editValues.regionalCoordinatorUserId}
                        onChange={(e) => setEditValues({ ...editValues, regionalCoordinatorUserId: e.target.value })}
                        className={selectClass}
                        data-testid="country-field-assignee-regional-coordinator"
                      >
                        <option value="">Unassigned</option>
                        {assignableUsers.map((u) => (
                          <option value={u.userId} key={u.userId}>{u.name} — {roleLabel(u.role)}</option>
                        ))}
                      </select>
                    </FormField>
                  </div>
```

- [x] **Step 7: Map `''` to `null` in the submit**

Replace the `handleEditSubmit` body (lines ~888-899) so empty strings become `null` for the four assignment fields:

```ts
  const handleEditSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data: CountryUpdate = {
      language: editValues.language,
      governmentType: editValues.governmentType as CountryUpdate['governmentType'],
      electionYear: editValues.electionYear,
      team: editValues.team,
      priority: editValues.priority as CountryUpdate['priority'],
      strategy: editValues.strategy,
      primaryOwnerUserId: editValues.primaryOwnerUserId === '' ? null : editValues.primaryOwnerUserId,
      secondaryOwnerUserId: editValues.secondaryOwnerUserId === '' ? null : editValues.secondaryOwnerUserId,
      reviewerUserId: editValues.reviewerUserId === '' ? null : editValues.reviewerUserId,
      regionalCoordinatorUserId: editValues.regionalCoordinatorUserId === '' ? null : editValues.regionalCoordinatorUserId,
    };
    updateCountry.mutate(
      { id, data },
      {
        onSuccess: () => {
          setEditOpen(false);
          void queryClient.invalidateQueries({ queryKey: getGetCountryQueryKey(id) });
          void queryClient.invalidateQueries({ queryKey: getListCountriesQueryKey() });
        },
      }
    );
  };
```
Note: `CountryUpdate` is already type-imported at `App.tsx:109`. The two casts are required because `useState` widens `editValues.priority`/`editValues.governmentType` to `string`, while `CountryUpdate` declares them as literal unions (`CountryUpdatePriority`, `CountryUpdateGovernmentType`).

- [x] **Step 8: Add the primary-owner chip to CountryCard**

In `CountryCard` (line 407-409), inside the risk row `<div className="mb-5 flex items-center gap-2 ...">`, after the risk text, add:

```tsx
          {country.primaryOwner && (
            <span className="ml-auto rounded-full bg-[hsl(var(--secondary)/.55)] px-2.5 py-1 font-bold" data-testid="country-primary-owner">
              {country.primaryOwner.name.split(' ')[0]}
            </span>
          )}
```

- [x] **Step 9: Typecheck + build**

Run: `bun run typecheck && bun run --filter @workspace/global-dr-platform build`

### Task 7: Run route-qa to green

**Files:** none (verification)

- [x] **Step 1: Boot API + SPA**

```bash
export DATABASE_URL="postgresql://localhost:5432/meridian"; export BETTER_AUTH_SECRET="$(openssl rand -base64 32)"
DATABASE_URL="$DATABASE_URL" BETTER_AUTH_SECRET="$BETTER_AUTH_SECRET" AUTH_PASSTHROUGH=true PORT=3000 bun run --filter @workspace/api-server dev > /tmp/api41.log 2>&1 &
VITE_AUTH_DEMO=1 API_PROXY_TARGET=http://localhost:3000 bun run --filter @workspace/global-dr-platform dev > /tmp/spa41.log 2>&1 &
```
Wait ~8s then verify both ports:
```bash
sleep 8; nc -z 127.0.0.1 3000 && echo api-up; nc -z 127.0.0.1 5173 && echo spa-up
```

- [x] **Step 2: Run route-qa**

```bash
bun run --filter @workspace/scripts route-qa > /tmp/routeqa41.out 2>&1; grep -E "PASS |FAIL |ALL PASS|FAILURES" /tmp/routeqa41.out | tail -50
```
Expected: `ALL PASS`, previous 44 + ~3 new checks. The demo DB already has countries (`QA Land` id 10, `Test Country` id 19) so the assignments block renders with 4 "Unassigned" rows.

- [x] **Step 3: Kill servers**

```bash
for p in 3000 5173; do lsof -ti tcp:$p | xargs kill 2>/dev/null; done
```

- [x] **Step 4: Commit**

```bash
git add artifacts/global-dr-platform/src/App.tsx scripts/src/route-qa.ts
git commit -m "feat(spa): country assignments block, edit modal pickers, owner chip (route-qa green)"
```

---

## Chunk 5: Docs & Final Verification

### Task 8: Update docs

**Files:**
- Modify: `docs/implementation-plan.md`
- Modify: `docs/roles-and-permissions.md`
- Modify: `docs/superpowers/plans/2026-09-04-country-assignments.md` (this file — check boxes)

- [x] **Step 1: `docs/implementation-plan.md`**

Under `### Phase 4 — Deliverables, tasks, and notifications` change `**Status: PLANNED**` to (NOTE: the file at `docs/implementation-plan.md:128` actually reads `**Status: \`PLANNED\`**` with backticks — match the exact current text when editing):

```markdown
**Status: `IN PROGRESS` — Phase 4.1 (country assignments) complete; deliverables/tasks, scorecards, and notifications remain.**

1. Add weekly and daily deliverables tied to action areas. — not started
2. Add country assignments with primary owner, secondary owner, reviewer, and regional coordinator. ✓ (Phase 4.1, this session: four user-linked columns, `/users/assignable`, Overview Assignments block, edit-modal pickers, primary-owner card chip; auth-qa + route-qa green)
3. Add failure analysis, completion percentage, response SLA, and country scorecards. — not started
4. Add notifications for position changes, upcoming meetings, expiring agreements, overdue follow-ups, elections, and confidence changes. — not started (in-app first)
5. Evaluate email, WhatsApp, Telegram, and Slack after the core workflow is stable. — not started
```
(Keep the existing 1-5 bullet phrasing but fold in the ✓ notes as shown.)

- [x] **Step 2: `docs/roles-and-permissions.md`**

In the `## Enforcement` section, after the write-routes bullet, add:

```markdown
- `GET /api/users/assignable` (country assignment picker) enforces write-role **inside the
  handler** — the shared `requireWriteRole()` middleware bypasses `GET`, so a bare mount
  would leak the roster to viewers. It returns only id/name/role and excludes banned users.
```

- [x] **Step 3: Mark this plan's tasks checked** as they are completed (all `- [x]` → `- [x]`).

- [x] **Step 4: Commit**

```bash
git add docs
git commit -m "docs: Phase 4.1 country assignments status + permission note"
```

### Task 9: Final verification & commit

- [x] **Step 1: Full verification**

```bash
bun run typecheck && bun run --filter @workspace/global-dr-platform build
```
Expected: clean.

- [x] **Step 2: Confirm nothing stray in git**

```bash
git status
```
Expected: only intended files.

- [x] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(country-assignments): Phase 4.1 complete — owners, reviewer, coordinator per country"
```

---

## Notes for Implementer

- **Codegen pitfall:** after `bun run --filter @workspace/api-spec codegen`, confirm `lib/api-zod/src/index.ts` has no appended `export * from './generated/types';`; if it does, delete that line. Then `npx tsc --build lib/api-client-react` before the workspace typecheck.
- **Zod object strictness:** generated zod objects are non-strict (strip), so extra raw FK keys in a row payload are silently removed by `.parse` — the SPA relies on the nested `primaryOwner`/etc. objects, not the raw ids.
- **GET write-role gating:** the `requireWriteRole()` mount middleware runs only for non-GET methods; `GET /users/assignable` MUST self-check `WRITE_ROLES.has(actor.role)` inside the handler.
- **`db.update().set(parsed.data)`:** the PATCH path relies on `UpdateCountryBody`'s new fields matching the Drizzle column names exactly (`primaryOwnerUserId`, …) so `parsed.data` sets them directly; null clears, absent leaves unchanged.
- **Lazy picker fetch:** `useListAssignableUsers({ query: { enabled: editOpen } })` is the single-arg generated signature (the op has no params); the React-Query enabled flag does the laziness. Called unconditionally at component top level, satisfying the hooks top-level rule.
- **auth-qa cleanup:** adding `qa-assignee@meridian.local` to `QA_EMAILS` makes the existing teardown remove it (cascade from `session`/`account`/`member`).