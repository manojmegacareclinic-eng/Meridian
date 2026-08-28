# Implementation Plan: Country Workspace Foundation

**Date:** 2026-08-28
**Status:** In progress
**Spec:** `docs/superpowers/specs/2026-08-28-country-workspace-foundation-spec.md` (Approved)

## Overview

Sub-project 1 of Phase 2 (roadmap Task #4). Gives every country a first-class
workspace: six new editable country fields (language, government type, election
year, team, priority, strategy), a tabbed country detail page, and two new
record types scoped to a country (documents, news). Read the spec first — all
design decisions and review refinements live there.

Chunk 1 (this file, Tasks 0–5) covers the backend: schema, audit unions, OpenAPI
contract + codegen, API handlers, and auth-qa write-path coverage.
Chunk 2 (Tasks 6–8) covers the SPA, route-qa coverage, and docs/closeout.

## Driven constraints (from spec review, all resolved)

- Country list/detail responses embed `contactsCount` + `meetingsCount`
  (`Country` schema requires them).
- `getCountry`/`updateCountry` 404 on missing id; mutation bodies validated via
  generated zod (400 on invalid enum, e.g. `governmentType` or `priority`).
- New `AuditEntityType` entries `document` and `news`; `AuditAction` gains
  `delete` so `GET /api/audit?action=delete` filters work.
- DELETE endpoints return `200 { id }` (shared `DeleteResponse`).
- `GET /agreements` and `GET /activity` both gain an optional `countryId`
  query param (the Overview tab reads recent activity by country).
- Overview "active agreements" KPI = status `!= archived`.
- `listDocuments` joins `agreements.name` as `agreementName` for the link label.
- Documents lifecycle status is its own enum `draft | review | approved | signed
  | archived` — do NOT reuse the agreements enum (agreements have no approved).
- Documents/news mutations audit with `countryId` passed to `writeAudit`.
- Documents reference agreements via a nullable `agreementId` FK
  (`onDelete: set null`).
- auth-qa cleanup ordering: delete disposable document + news rows BEFORE the
  country row; the activity sweep (`WHERE country_id = ?`) removes every audit
  row the new writes leave behind; residual check must still expect 0.
- route-qa stays read-only (playwright + fetch only, no `@workspace/db` import,
  cannot row-cleanup). Full write path is covered by auth-qa. This is a
  deliberate deviation from the spec's "save an Edit details change" bullet:
  it would mutate seeded data, and the write path is DB-backed validated
  elsewhere. Surface this to the user at the end.

## File structure map

New files:
- `lib/db/src/schema/documents.ts` — documents table + insert schema + types
- `lib/db/src/schema/news.ts` — news table + insert schema + types
- `artifacts/api-server/src/routes/documents.ts` — documents CRUD handlers
- `artifacts/api-server/src/routes/news.ts` — news CRUD handlers
- `artifacts/global-dr-platform/src/routes/countries.$countryId.tsx` — detail route

Modified files:
- `lib/db/src/schema/countries.ts` — six new nullable columns
- `lib/db/src/schema/index.ts` — export the two new schema modules
- `artifacts/api-server/src/lib/audit.ts` — `delete` action; `document`/`news` entities
- `lib/api-spec/openapi.yaml` — Country/CountryUpdate, countries/{id},
  documents, news, DeleteResponse, `countryId` params on activity + agreements
- `lib/api-client-react/src/generated/*`, `lib/api-zod/src/generated/*` — regenerated
- `artifacts/api-server/src/routes/platform.ts` — countryFields, getCountry,
  updateCountry, activity countryId, agreements countryId
- `artifacts/api-server/src/routes/index.ts` — mount documents + news routers
- `scripts/src/auth-qa.ts` — write-path coverage (Task 5)
- `artifacts/global-dr-platform/src/App.tsx` — CountryDetailPage + country row links
- `scripts/src/route-qa.ts` — read-only nav/render coverage (Task 7)
- `docs/implementation-plan.md`, `docs/roles-and-permissions.md` — doc updates (Task 8)

## Verification commands (used throughout)

```bash
bun run --filter @workspace/db push        # needs DATABASE_URL (see below)
bun run typecheck:libs                     # after every codegen
bun run typecheck                          # full: libs + workspaces (regenerates routeTree)
bun run --filter @workspace/api-spec codegen
```
- All QA runs write to a log file (`> /tmp/qa.log 2>&1`), never piped through
  head/tail (SIGPIPE aborts cleanup).
- API env: `DATABASE_URL="postgresql://localhost:5432/meridian"`
  `BETTER_AUTH_SECRET="$(openssl rand -base64 32)"` `BETTER_AUTH_URL="http://localhost:5173"`
  `PORT=3000` and the literal `AUTH_PASSTHROUGH="true"` (auth-qa uses `AUTH_PASSTHROUGH=0` typically — reuse the previous run's exact env from auth-qa.ts head).
- Bootstrap admin: `admin@meridian.gov` / `SfyCcYiezLXvFsqQMmxgsh-l` (used as `ROUTE_QA_PASSWORD`).
- **Git:** explicit pathspec commits only. The 28 staged restoration files must
  remain staged and uncommitted.

## Task 0 — Commit the plan after review approval

- [ ] After both chunks are approved by the plan-document-reviewer, commit this
  document:
  ```bash
  git commit -m "docs: plan for country workspace foundation (sub-project 1 of Phase 2)" -- docs/superpowers/plans/2026-08-28-country-workspace-foundation.md
  ```
- [ ] Then begin Task 1.

---

## Task 1 — DB schema: six country fields + documents/news tables

**Ticket:** none (roadmap Task #4 / Sub 1).

### Steps

- [ ] 1.1 `lib/db/src/schema/countries.ts`: add six nullable columns after
  `riskLevel` (no default → nullable; `insertCountrySchema` unchanged and still
  parses existing POSTs):
  ```ts
  language: text("language"),
  governmentType: text("government_type"),
  electionYear: integer("election_year"),
  team: text("team"),
  priority: text("priority"),
  strategy: text("strategy"),
  ```
- [ ] 1.2 New `lib/db/src/schema/documents.ts`:
  ```ts
  import { date, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
  import { createInsertSchema } from "drizzle-zod";
  import { z } from "zod/v4";
  import { countriesTable } from "./countries";
  import { agreementsTable } from "./agreements";

  export const documentStatuses = ["draft", "review", "approved", "signed", "archived"] as const;

  export const documentsTable = pgTable("documents", {
    id: serial("id").primaryKey(),
    countryId: integer("country_id").notNull().references(() => countriesTable.id),
    title: text("title").notNull(),
    type: text("type").notNull().default("other"),
    url: text("url"),
    datedOn: date("dated_on", { mode: "string" }),
    notes: text("notes"),
    agreementId: integer("agreement_id").references(() => agreementsTable.id, { onDelete: "set null" }),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  });

  export const insertDocumentSchema = createInsertSchema(documentsTable).omit({ id: true, createdAt: true });
  export type InsertDocument = z.infer<typeof insertDocumentSchema>;
  export type Document = typeof documentsTable.$inferSelect;
  ```
- [ ] 1.3 New `lib/db/src/schema/news.ts`:
  ```ts
  import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
  import { createInsertSchema } from "drizzle-zod";
  import { z } from "zod/v4";
  import { countriesTable } from "./countries";

  export const newsTable = pgTable("news", {
    id: serial("id").primaryKey(),
    countryId: integer("country_id").notNull().references(() => countriesTable.id),
    title: text("title").notNull(),
    source: text("source").notNull(),
    url: text("url"),
    summary: text("summary"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  });

  export const insertNewsSchema = createInsertSchema(newsTable).omit({ id: true, createdAt: true });
  export type InsertNews = z.infer<typeof insertNewsSchema>;
  export type News = typeof newsTable.$inferSelect;
  ```
- [ ] 1.4 `lib/db/src/schema/index.ts`: add `export * from "./documents";` and
  `export * from "./news";` next to the existing exports.
- [ ] 1.5 Push and typecheck:
  ```bash
  DATABASE_URL="postgresql://localhost:5432/meridian" bun run --filter @workspace/db push
  bun run typecheck
  ```
  **Expected:** push applies `documents`, `news`, and the six new columns;
  typecheck clean.
- [ ] 1.6 Commit:
  ```bash
  git commit -m "feat(db): six new country fields; documents and news tables" -- lib/db/src/schema/countries.ts lib/db/src/schema/documents.ts lib/db/src/schema/news.ts lib/db/src/schema/index.ts
  ```

## Task 2 — Audit unions grow

**File:** `artifacts/api-server/src/lib/audit.ts`

- [ ] 2.1 `AuditAction` gains `"delete"`:
  ```ts
  export type AuditAction = "create" | "update" | "read" | "delete";
  ```
- [ ] 2.2 `AuditEntityType` gains `"document"` and `"news"` (sorted in the union).
- [ ] 2.3 `bun run typecheck` → clean.
- [ ] 2.4 Commit:
  ```bash
  git commit -m "feat(api): audit actions/entities for delete, documents, and news" -- artifacts/api-server/src/lib/audit.ts
  ```

## Task 3 — OpenAPI contract + codegen

**File:** `lib/api-spec/openapi.yaml`

- [ ] 3.1 Tags: append `- name: documents` and `- name: news` to the tags block.
- [ ] 3.2 `Country` schema: keep `required` untouched; add six optional
  properties (append after `riskLevel`):
  ```yaml
        language: { type: string }
        governmentType:
          type: string
          enum: [presidential republic, semi-presidential, parliamentary republic, parliamentary monarchy, constitutional monarchy, absolute monarchy, one-party state, transitional]
        electionYear: { type: integer }
        team: { type: string }
        priority:
          type: string
          enum: [low, medium, high]
        strategy: { type: string }
  ```
- [ ] 3.3 New `CountryUpdate` schema (all optional so PATCH is partial):
  ```yaml
    CountryUpdate:
      type: object
      properties:
        name: { type: string, minLength: 1 }
        region: { type: string, minLength: 1 }
        status:
          type: string
          enum: [active, leads, inactive, agreement, scheduled]
        riskLevel:
          type: string
          enum: [low, medium, high]
        language: { type: string }
        governmentType:
          type: string
          enum: [presidential republic, semi-presidential, parliamentary republic, parliamentary monarchy, constitutional monarchy, absolute monarchy, one-party state, transitional]
        electionYear: { type: integer }
        team: { type: string }
        priority:
          type: string
          enum: [low, medium, high]
        strategy: { type: string }
  ```
- [ ] 3.4 New path `/countries/{id}` (place after `/countries`):
  ```yaml
  /countries/{id}:
    get:
      operationId: getCountry
      tags: [countries]
      summary: Get a country workspace
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      responses:
        "200":
          description: Country
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Country"
        "404":
          description: Country not found
    patch:
      operationId: updateCountry
      tags: [countries]
      summary: Update a country workspace
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CountryUpdate"
      responses:
        "200":
          description: Updated country
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Country"
        "404":
          description: Country not found
  ```
- [ ] 3.5 `/agreements` GET: add a `countryId` integer query param (after `status`).
- [ ] 3.6 `/activity` GET: add a `countryId` integer query param.
- [ ] 3.7 New `/documents` + `/documents/{id}` paths:
  ```yaml
  /documents:
    get:
      operationId: listDocuments
      tags: [documents]
      summary: List documents for a country
      parameters:
        - name: countryId
          in: query
          schema: { type: integer }
        - name: type
          in: query
          schema: { type: string }
        - name: status
          in: query
          schema:
            type: string
            enum: [draft, review, approved, signed, archived]
        - name: agreementId
          in: query
          schema: { type: integer }
        - name: limit
          in: query
          schema: { type: integer }
      responses:
        "200":
          description: Documents
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/Document"
    post:
      operationId: createDocument
      tags: [documents]
      summary: Create a document record
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/DocumentInput"
      responses:
        "201":
          description: Created
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Document"
  /documents/{id}:
    patch:
      operationId: updateDocument
      tags: [documents]
      summary: Update a document
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/DocumentUpdate"
      responses:
        "200":
          description: Updated document
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Document"
        "404":
          description: Document not found
    delete:
      operationId: deleteDocument
      tags: [documents]
      summary: Delete a document
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      responses:
        "200":
          description: Deleted
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/DeleteResponse"
        "404":
          description: Document not found
  ```
- [ ] 3.8 New `/news` + `/news/{id}` paths (mirror the documents paths; tags
  `[news]`, operationIds `listNews`, `createNews`, `updateNews`, `deleteNews`;
  query params only `countryId` + `limit`; request bodies `NewsInput`, body
  `NewsUpdate`, responses `News` / `DeleteResponse`).
- [ ] 3.9 New schemas (add in components/schemas):
  ```yaml
    Document:
      type: object
      required: [id, countryId, title, type, status]
      properties:
        id: { type: integer }
        countryId: { type: integer }
        title: { type: string }
        type: { type: string }
        url:
          type: ["string", "null"]
        datedOn:
          type: ["string", "null"]
          format: date
        notes:
          type: ["string", "null"]
        agreementId:
          type: ["integer", "null"]
        agreementName:
          type: ["string", "null"]
        status:
          type: string
          enum: [draft, review, approved, signed, archived]
        createdAt: { type: string, format: date-time }
    DocumentInput:
      type: object
      required: [countryId, title]
      properties:
        countryId: { type: integer }
        title: { type: string, minLength: 1 }
        type: { type: string }
        url: { type: string }
        datedOn: { type: string, format: date }
        notes: { type: string }
        agreementId: { type: integer }
        status:
          type: string
          enum: [draft, review, approved, signed, archived]
    DocumentUpdate:
      type: object
      properties:
        title: { type: string, minLength: 1 }
        type: { type: string }
        url:
          type: ["string", "null"]
        datedOn:
          type: ["string", "null"]
          format: date
        notes:
          type: ["string", "null"]
        agreementId:
          type: ["integer", "null"]
        status:
          type: string
          enum: [draft, review, approved, signed, archived]
    News:
      type: object
      required: [id, countryId, title, source, publishedAt]
      properties:
        id: { type: integer }
        countryId: { type: integer }
        title: { type: string }
        source: { type: string }
        url:
          type: ["string", "null"]
        summary:
          type: ["string", "null"]
        publishedAt: { type: string, format: date-time }
        createdAt: { type: string, format: date-time }
    NewsInput:
      type: object
      required: [countryId, title, source, publishedAt]
      properties:
        countryId: { type: integer }
        title: { type: string, minLength: 1 }
        source: { type: string, minLength: 1 }
        url: { type: string }
        summary: { type: string }
        publishedAt: { type: string, format: date-time }
    NewsUpdate:
      type: object
      properties:
        title: { type: string, minLength: 1 }
        source: { type: string, minLength: 1 }
        url:
          type: ["string", "null"]
        summary:
          type: ["string", "null"]
        publishedAt: { type: string, format: date-time }
    DeleteResponse:
      type: object
      required: [id]
      properties:
        id: { type: integer }
  ```
- [ ] 3.10 Regenerate and typecheck libs:
  ```bash
  bun run --filter @workspace/api-spec codegen
  bun run typecheck:libs
  ```
  **Expected:** `lib/api-zod/src/generated` and `lib/api-client-react/src/generated`
  rewritten; typecheck clean. Sanity-check the new zod exports exist:
  `ListDocumentsQueryParams`, `CreateDocumentBody`, `UpdateDocumentBody`,
  `UpdateDocumentParams`, `DeleteDocumentParams`, `ListNewsQueryParams`,
  `CreateNewsBody`, `UpdateNewsBody`, `UpdateNewsParams`, `DeleteNewsParams`,
  `CountryUpdate`, `Document`, `DocumentInput`, `News`, `NewsInput`,
  `DeleteResponse`, and `ListActivityQueryParams`/`ListAgreementsQueryParams`
  now carrying `countryId`. **Naming note:** direct `$ref` response schemas are
  exported under the schema name (e.g. `Document`); if codegen emits a suffix
  (e.g. `DocumentSchema`), adjust the Task 4 imports to what codegen actually
  produced.
- [ ] 3.11 Commit:
  ```bash
  git commit -m "feat(api): openapi contract for country detail, documents, and news" -- lib/api-spec/openapi.yaml lib/api-client-react/src/generated lib/api-zod/src/generated
  ```

## Task 4 — API handlers

### 4A. `artifacts/api-server/src/routes/platform.ts`

- [ ] 4A.1 Extend `countryFields` so list/detail return the new fields:
  ```ts
  const countryFields = {
    id: countriesTable.id,
    name: countriesTable.name,
    code: countriesTable.code,
    region: countriesTable.region,
    status: countriesTable.status,
    riskLevel: countriesTable.riskLevel,
    language: countriesTable.language,
    governmentType: countriesTable.governmentType,
    electionYear: countriesTable.electionYear,
    team: countriesTable.team,
    priority: countriesTable.priority,
    strategy: countriesTable.strategy,
  };
  ```
- [ ] 4A.2 Imports: add `GetCountryParams`, `CountryUpdate`, `Country`,
  `ListActivityQueryParams` from `@workspace/api-zod` (mirror whatever codegen
  named them per Task 3.10).
- [ ] 4A.3 `GET /countries/:id` handler (directly below `POST /countries`):
  ```ts
  router.get("/countries/:id", async (req, res): Promise<void> => {
    const params = GetCountryParams.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "Invalid country id." }); return; }
    const [row] = await db.select(countryFields).from(countriesTable).where(eq(countriesTable.id, params.data.id));
    if (!row) { res.status(404).json({ error: "Country not found." }); return; }
    const [contactCounts, meetingCounts] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(contactsTable).where(eq(contactsTable.countryId, row.id)),
      db.select({ count: sql<number>`count(*)` }).from(meetingsTable).where(eq(meetingsTable.countryId, row.id)),
    ]);
    res.json(Country.parse({ ...row, contactsCount: Number(contactCounts[0]?.count ?? 0), meetingsCount: Number(meetingCounts[0]?.count ?? 0) }));
  });
  ```
- [ ] 4A.4 `PATCH /countries/:id` handler:
  ```ts
  router.patch("/countries/:id", async (req, res): Promise<void> => {
    const params = GetCountryParams.safeParse(req.params);
    const parsed = CountryUpdate.safeParse(req.body);
    if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid country update." }); return; }
    const [existing] = await db.select(countryFields).from(countriesTable).where(eq(countriesTable.id, params.data.id));
    if (!existing) { res.status(404).json({ error: "Country not found." }); return; }
    const [row] = await db.update(countriesTable).set(parsed.data).where(eq(countriesTable.id, params.data.id)).returning();
    const diff = diffFields(existing as unknown as Record<string, unknown>, row as unknown as Record<string, unknown>, ["name", "region", "status", "riskLevel", "language", "governmentType", "electionYear", "team", "priority", "strategy"]);
    await writeAudit({
      actor: getActor(req),
      action: "update",
      entityType: "country",
      entityId: String(row.id),
      kind: "country",
      title: "Country workspace updated",
      description: `${row.name} was updated in the portfolio.`,
      countryId: row.id,
      before: diff?.before ?? null,
      after: diff?.after ?? null,
    });
    const [contactCounts, meetingCounts] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(contactsTable).where(eq(contactsTable.countryId, row.id)),
      db.select({ count: sql<number>`count(*)` }).from(meetingsTable).where(eq(meetingsTable.countryId, row.id)),
    ]);
    res.json(Country.parse({ ...row, contactsCount: Number(contactCounts[0]?.count ?? 0), meetingsCount: Number(meetingCounts[0]?.count ?? 0) }));
  });
  ```
- [ ] 4A.5 `GET /agreements`: add a country filter. Change `async (req, res)` and
  after the existing `status` filter add:
  ```ts
  if (parsed.data.countryId) filters.push(eq(agreementsTable.countryId, parsed.data.countryId));
  ```
- [ ] 4A.6 `GET /activity`: add param filter. Change `async (_req, res)` to
  `async (req, res)`, parse `ListActivityQueryParams.safeParse(req.query)` (400
  on failure), and gate the select with:
  ```ts
  const filters = [];
  if (parsed.data.countryId) filters.push(eq(activityTable.countryId, parsed.data.countryId));
  ```
  then add `.where(filters.length ? and(...filters) : undefined)` before
  `.orderBy(...)`.

### 4B. New `artifacts/api-server/src/routes/documents.ts`

- [ ] 4B.1 Handler file with four routes (patterns mirror `platform.ts`):
  - `GET /` (listDocuments): parse `ListDocumentsQueryParams` (400 on failure);
    filters `countryId`, `type`, `status` (eq), `agreementId` (eq); select
    document columns + `agreementName` via `leftJoin(agreementsTable,
    eq(documentsTable.agreementId, agreementsTable.id))`; order `desc(createdAt)`;
    limit `Math.min(parsed.data.limit ?? 50, 200)`.
  - `POST /` (createDocument): parse `CreateDocumentBody` (400 on failure);
    verify the country exists (else `400 "Country workspace not found."`);
    if `agreementId` provided, verify the agreement exists (else `400 "Agreement not found."`);
    insert `{ ...parsed.data, datedOn: parsed.data.datedOn ? parsed.data.datedOn.toISOString().slice(0, 10) : null, status: parsed.data.status ?? "draft" }`;
    `writeAudit` create/document with `after { id, title, type, status }`;
    left-join agreement name for the 201 response.
  - `PATCH /:id` (updateDocument): parse `UpdateDocumentParams` + `UpdateDocumentBody`;
    fetch existing (404 if missing); if `agreementId` is set to a value, verify
    the agreement exists (400); update with `datedOn: parsed.data.datedOn === null
    ? null : parsed.data.datedOn?.toISOString().slice(0, 10)`; `diffFields`
    allowlist `["title", "type", "status", "url", "datedOn", "notes", "agreementId"]`;
    `writeAudit` update/document; respond with joined agreement name.
  - `DELETE /:id` (deleteDocument): parse `DeleteDocumentParams`; fetch existing
    (404 if missing); delete row; `writeAudit` delete/document, title
    `"Document removed"`, description `` `${title} was removed from the workspace.` ``,
    passing `countryId`; respond `res.json(DeleteResponse.parse({ id: params.data.id }))`.
- [ ] 4B.2 Audit calls carry `countryId: row.countryId` (create/update/delete);
  delete writes carry `action: "delete"`, `entityType: "document"`.

### 4C. New `artifacts/api-server/src/routes/news.ts`

- [ ] 4C.1 Four routes mirroring documents (no joins beyond countries count not
  needed; responses are `News` which has no `countryName`):
  - `GET /` (listNews): parse `ListNewsQueryParams`; filter `countryId` (eq);
    order `desc(publishedAt)`, limit `Math.min(parsed.data.limit ?? 50, 200)`.
  - `POST /` (createNews): parse `CreateNewsBody`; verify country exists (400);
    insert `{ ...parsed.data, publishedAt: parsed.data.publishedAt }`;
    `writeAudit` create/news, `after { id, title, source }`.
  - `PATCH /:id` (updateNews): parse; fetch existing (404); update;
    `diffFields` allowlist `["title", "source", "url", "summary", "publishedAt"]`;
    `writeAudit` update/news.
  - `DELETE /:id` (deleteNews): parse; fetch existing (404); delete;
    `writeAudit` delete/news title `"News item removed"`; respond `DeleteResponse`.
- [ ] 4C.2 Audit calls carry `countryId: row.countryId`.

### 4D. Mount the routers: `artifacts/api-server/src/routes/index.ts`

- [ ] 4D.1 Import `documentsRouter` and `newsRouter` from their files.
- [ ] 4D.2 After `router.use(platformRouter);` add:
  ```ts
  router.use(documentsRouter);
  router.use(newsRouter);
  ```
- [ ] 4D.3 Verify: `bun run typecheck` clean; start the API with the QA env and
  smoke-check as the bootstrap admin:
  ```
  GET  /api/countries/{latestId}      -> 200 with the six new fields (null)
  PATCH /api/countries/{latestId}     { "priority": "high", "language": "English" } -> 200
  PATCH /api/countries/{latestId}     { "governmentType": "not-a-type" } -> 400
  PATCH /api/countries/999999         -> 404
  POST  /api/documents                { countryId, title } -> 201
  GET  /api/documents?countryId=      -> 1 row
  ```
  (Smoke via curl is optional; the hard assertions land in Task 5.)
- [ ] 4D.4 Commit:
  ```bash
  git commit -m "feat(api): country detail/patch, documents, and news endpoints" -- artifacts/api-server/src/routes/platform.ts artifacts/api-server/src/routes/documents.ts artifacts/api-server/src/routes/news.ts artifacts/api-server/src/routes/index.ts
  ```

## Task 5 — auth-qa write-path coverage

**File:** `scripts/src/auth-qa.ts` (patterns: `check()`, `cookieJar()`,
`QA_EMAILS`, `QA_CODE`, `adminJar`, disposable country `adminPostBody`).

Insert a new section after the existing audit-assertions block (before the
cleanup block at "25. Cleanup").

- [ ] 5.1 Fetch `GET /api/countries/${adminPostBody.id}`:
  - expect 200; body has `contactsCount`/`meetingsCount` numbers.
- [ ] 5.2 `PATCH /api/countries/${adminPostBody.id}` as admin with
  `{ language: "English", governmentType: "presidential republic", electionYear: 2024, team: "QA desk", priority: "high", strategy: "Test strategy" }`:
  - expect 200; body echoes the values.
- [ ] 5.3 `PATCH` with `{ governmentType: "bogus" }` -> 400.
- [ ] 5.4 `PATCH /api/countries/999999` -> 404.
- [ ] 5.5 `POST /api/documents` `{ countryId: adminPostBody.id, title: "QA protocol review", type: "report" }`:
  - expect 201; body has `status: "draft"`, `agreementId`/`agreementName` null.
- [ ] 5.6 `GET /api/documents?countryId=${adminPostBody.id}`: exactly 1 row.
- [ ] 5.7 `PATCH /api/documents/${docId}` `{ status: "approved" }`: 200, echoes status.
- [ ] 5.8 `PATCH /api/documents/999999` -> 404; `POST /api/documents` with a bad
  `countryId` -> 400 (verifies country-existence validation).
- [ ] 5.9 `POST /api/news` `{ countryId, title: "QA briefing", source: "Reuters", publishedAt: new Date().toISOString() }`:
  - 201; body echoes publishedAt.
- [ ] 5.10 `GET /api/news?countryId=${adminPostBody.id}`: exactly 1 row.
- [ ] 5.11 `PATCH /api/news/${newsId}` `{ summary: "updated" }`: 200.
- [ ] 5.12 `GET /api/activity?countryId=${adminPostBody.id}`: includes the
  country update + document create + news create rows (kind/entityType checks).
- [ ] 5.13 Audit-specific assertions:
  - `GET /api/audit?entityType=document&entityId=${docId}`: 1+ create row, after
    has `status: "draft"`.
  - `GET /api/audit?entityType=document&action=update&entityId=${docId}`: 1+ row.
  - `GET /api/audit?entityType=news&entityId=${newsId}`: 1+ create row.
  - `GET /api/audit?entityType=country&action=update&entityId=${adminPostBody.id}`:
    1+ row with `before.language` null and `after.language` `"English"`.
- [ ] 5.14 Cleanup ordering (replace the bullet in the existing cleanup block):
  - delete news rows `WHERE country_id = ${adminPostBody.id}`;
  - delete document rows `WHERE country_id = ${adminPostBody.id}`;
  - then existing steps: activity sweep by `countryId`, delete the country row.
  - residual audit check (`WHERE country_id = ?`) still expects 0 rows.
- [ ] 5.15 Run to a log file; expect `ALL PASS`, same failure threshold as before
  (previous full suite was 26 passes — new checks add to it).
- [ ] 5.16 Commit:
  ```bash
  git commit -m "test(api): country detail, documents, and news write-path assertions" -- scripts/src/auth-qa.ts
  ```

---

*End of Chunk 1 (Tasks 0–5). Chunk 2 (Tasks 6–8) continues below.*