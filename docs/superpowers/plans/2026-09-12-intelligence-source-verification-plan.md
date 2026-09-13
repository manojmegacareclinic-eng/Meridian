# Phase 5 — Intelligence & Source Verification: findings, confidence, human approval queue

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ship the *trust layer* of intelligence — `intelligence_sources` (with the brief's priority tiers), `intelligence_findings` (candidate change-events with confidence, topic, source attribution), a human approve/reject queue, `change_events` (the provenance ledger), and a `new_finding` notification kind — never touching official records until a human approves an allowlisted change. Scheduling/crawling is **deferred** by design (spec Non-goals; implementation-plan Phase 5 item 4).

**Architecture:** Express + Drizzle, OpenAPI → orval → `@workspace/api-zod` (server) + `@workspace/api-client-react` (TanStack Query hooks), React/Tailwind v4 SPA under TanStack Router, `tsx` QA harnesses (`auth-qa` real-API, `route-qa` Playwright) with a deterministic `seed-intelligence` demo seed. Order: DB → OpenAPI/codegen + seed → API + auth-qa → SPA + route-qa → docs.

**Design:** `docs/superpowers/specs/2026-09-12-intelligence-source-verification-design.md`.

---

## File structure

- Create `lib/db/src/schema/intelligence.ts` — three tables (sources, findings, change_events) + kind/topic/stage const arrays.
- Modify `lib/db/src/schema/notifications.ts` — add `new_finding` to `notificationKinds`.
- Modify `lib/db/src/schema/index.ts` — export intelligence.
- Create `artifacts/api-server/src/lib/intelligence.ts` — tier map, apply-allowlist, `applyFindingToOfficialRecord` helper, `findingCandidates` reconcile candidates + `findFindingCandidates` query.
- Modify `artifacts/api-server/src/lib/notifications.ts` — wire `new_finding` candidates into `reconcileNotifications` (global, all staff, open findings < 7 days).
- Create `artifacts/api-server/src/routes/intelligence.ts` — the 10 endpoints; in-router write-role guard; `writeAudit` on mutations.
- Modify `artifacts/api-server/src/routes/index.ts` — mount intelligence router **before** `requireWriteRole()` (line 34-35), reads visible to viewers.
- Modify `lib/api-spec/openapi.yaml` — `intelligence` tag, 10 paths, ~15 schemas, `IntelligenceId` param.
- Modify `lib/api-zod/src/index.ts` — remove codegen-appended wildcard; add curated re-exports (codegen re-appends it every run — check after each regen).
- Create `scripts/src/seed-intelligence.ts`; modify `scripts/package.json` (`seed-intelligence`), `scripts/src/auth-qa.ts` (Phase 5 section), `scripts/src/route-qa.ts` (Phase 5 section).
- Create `artifacts/global-dr-platform/src/routes/intelligence.tsx` (SPA route + page); modify `App.tsx` (nav entry) and `NotificationsPanel.tsx` (`new_finding` deep-link + meeting_upcoming fix).
- Modify `docs/implementation-plan.md` (Phase 5 status + evidence, next task → Phase 6) and tick this plan.

---

## Chunk 1: DB schema + `new_finding` kind

### Task 1: Create `lib/db/src/schema/intelligence.ts`

**Files:**
- Create: `lib/db/src/schema/intelligence.ts`
- Modify: `lib/db/src/schema/index.ts`

- [x] **Step 1: Author the schema file** — follow the `notifications.ts`/`organizations.ts` conventions (`pgTable`, `serial` PK, `createInsertSchema` + `z` imports, `uniqueIndex` where needed):

```ts
import { boolean, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { userTable } from "./auth";

export const sourceKinds = ["government_site","parliament_directory","embassy_site","government_gazette","linkedin","facebook_x","other"] as const;
export const findingTopics = ["government_change","election","diplomatic_news","religious_affairs","ngo_news","university_news","other"] as const;
export const findingStages = ["open","approved","rejected"] as const;
export const targetTypes = ["country","organization","contact"] as const;

export const intelligenceSourcesTable = pgTable("intelligence_sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  tier: integer("tier").notNull(),
  baseUrl: text("base_url").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const intelligenceFindingsTable = pgTable("intelligence_findings", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").notNull().references(() => intelligenceSourcesTable.id),
  topic: text("topic").notNull(),
  headline: text("headline").notNull(),
  url: text("url"),
  summary: text("summary"),
  confidence: integer("confidence").notNull().default(50),
  targetType: text("target_type"),
  targetId: integer("target_id"),
  field: text("field"),
  value: text("value"),
  stage: text("stage").notNull().default("open"),
  reviewNote: text("review_note"),
  applied: boolean("applied").notNull().default(false),
  reviewedByUserId: text("reviewed_by_user_id").references(() => userTable.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  fingerprint: text("fingerprint").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("intelligence_findings_fingerprint_unique").on(table.fingerprint)]);

export const changeEventsTable = pgTable("change_events", {
  id: serial("id").primaryKey(),
  findingId: integer("finding_id").notNull().references(() => intelligenceFindingsTable.id),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
  field: text("field"),
  beforeValue: text("before_value"),
  afterValue: text("after_value"),
  applied: boolean("applied").notNull().default(false),
  sourceUrl: text("source_url"),
  reviewedByUserId: text("reviewed_by_user_id").references(() => userTable.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertIntelligenceSourceSchema = createInsertSchema(intelligenceSourcesTable).omit({ id: true, createdAt: true });
export const insertIntelligenceFindingSchema = createInsertSchema(intelligenceFindingsTable).omit({ id: true, reviewedAt: true, createdAt: true });
export const insertChangeEventSchema = createInsertSchema(changeEventsTable).omit({ id: true, createdAt: true });
export type InsertIntelligenceSource = z.infer<typeof insertIntelligenceSourceSchema>;
export type IntelligenceSource = typeof intelligenceSourcesTable.$inferSelect;
export type InsertIntelligenceFinding = z.infer<typeof insertIntelligenceFindingSchema>;
export type IntelligenceFinding = typeof intelligenceFindingsTable.$inferSelect;
export type InsertChangeEvent = z.infer<typeof insertChangeEventSchema>;
export type ChangeEvent = typeof changeEventsTable.$inferSelect;
```

- [x] **Step 2: Add `new_finding` to `notificationKinds`** in `lib/db/src/schema/notifications.ts`.
- [x] **Step 3: Export** `export * from "./intelligence";` from `lib/db/src/schema/index.ts` (after `./notifications`).
- [x] **Step 4: Typecheck** — `bun run typecheck` all workspaces exit 0.
- [x] **Step 5: Commit**

```bash
git add lib/db/src/schema/intelligence.ts lib/db/src/schema/notifications.ts lib/db/src/schema/index.ts
git commit -m "feat(db): intelligence sources/findings/change_events + new_finding notification kind"
```

### Task 2: Push the schema

- [x] **Step 1: Push** — `DATABASE_URL="postgresql://localhost:5432/meridian" bun run --filter @workspace/db push` → adds `intelligence_sources`, `intelligence_findings`, `change_events`.
- [x] **Step 2: Verify** — `psql postgresql://localhost:5432/meridian -c '\d intelligence_findings'` shows the unique index on `fingerprint`.
- [x] **Step 3: Commit** — skip (runtime artifact).

---

## Chunk 2: OpenAPI + codegen + seed script

### Task 1: OpenAPI contract

- [x] **Step 1: Add `intelligence` tag + 10 paths + schemas to `lib/api-spec/openapi.yaml`** — mirror the `notifications` tag layout (tag registration near line 31). OperationIds (used as zod export names):
  - `listIntelligenceSources` (GET), `createIntelligenceSource` (POST), `updateIntelligenceSource` (PATCH)
  - `listIntelligenceFindings` (GET, query `topic?stage?sourceId?targetType?minConfidence?limit`), `getIntelligenceFinding` (GET), `createIntelligenceFinding` (POST)
  - `approveIntelligenceFinding` (POST `/{id}/approve`, body `{ apply?: boolean, reviewNote?: string }`), `rejectIntelligenceFinding` (POST `/{id}/reject`, body `{ reviewNote?: string }`)
  - `listChangeEvents` (GET, query `entityType?entityId?findingId`)
  - Response schemas include `sourceName`/`sourceTier` joined fields on finding payloads.
- [x] **Step 2: Check the generated names** — regenerate then confirm the exports exist in `lib/api-zod/src/generated/api.ts` before wiring routes (orval derives names from operationIds).

### Task 2: Regenerate codegen

- [x] **Step 1: Run** — `bun run --filter @workspace/api-spec codegen`.
- [x] **Step 2: Fix `lib/api-zod/src/index.ts`** — remove the auto-appended `export * from "./generated/types";` AND the `export * from "./notifications"`-style leftovers it intends; add curated re-exports for the intelligence schemas (same gotcha as 4.4 — codegen re-appends it every run).
- [x] **Step 3: Typecheck** — root typecheck exits 0. If odd TS errors persist, `rm lib/api-zod/tsconfig.tsbuildinfo` + `dist` first (stale-cache gotcha).
- [x] **Step 4: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react/src/generated
git commit -m "feat(api): openapi + codegen for intelligence findings/approval contract"
```

### Task 3: Deterministic seed

- [x] **Step 1: Create `scripts/src/seed-intelligence.ts`** — idempotent by baseUrl (sources) and fingerprint (findings); registers `seed-intelligence` in `scripts/package.json`.
  - Sources: `SCOR Government Portal` (kind `government_site`, tier 1), `SCOR Government Gazette` (kind `government_gazette`, tier 4), `SCOR MFA LinkedIn` (kind `linkedin`, tier 5).
  - Findings (canonical, restored each run):
    - open, `government_change`, conf 80, tier-1 URL, target `country` SCOR, field `governmentType`, value `parliamentary` (baseline of the field is set back to `presidential` each run), summary + headline.
    - open, `election`, conf 62, target country SCOR, field `electionYear`, value currentYear+1.
    - open, `diplomatic_news`, conf 48, no target/field.
    - rejected, `religious_affairs`, conf 55, with reviewNote (decided history for the queue mix).
  - **Reset step** (each run, the `seed-notify` idiom): restore SCOR baseline (`governmentType = presidential`), reset the seed findings' stage/review to the canonical state, and reset the related `new_finding` notifications (`fingerprint like 'new_finding:<id>'`) to unread.
- [x] **Step 2: Commit**

```bash
git add scripts/src/seed-intelligence.ts scripts/package.json
git commit -m "feat(qa): deterministic intelligence seed"
```

---

## Chunk 3: API + reconcile + auth-qa

### Task 1: Server lib (`artifacts/api-server/src/lib/intelligence.ts`)

- [x] **Step 1: Tier map** — `sourceKindTier: Record<string, number>` (government_site 1 … facebook_x 6, other 7) + `tierForKind`.
- [x] **Step 2: Apply allowlist** — `applyAllowlist: Record<string, string[]>` for country/organization/contact (spec table); `applyFindingToOfficialRecord(db, finding)` returns `{ ok, beforeValue?, afterValue?, reason? }` — resolves the target row, validates the field/value (`electionYear` must be a plausible year), returns `{ok:false, reason}` for missing row/unsupported field/invalid value.
- [x] **Step 3: `findFindingCandidates(db)`** — open findings with `createdAt > now - 7d`, joined to sources for `sourceName`; fingerprints `new_finding:<findingId>`; title `New intelligence finding — <headline>`, body `<topic label> · confidence <n>% · via <sourceName>`; entityType `intelligence_finding`, entityId findingId; countryId = targetId when targetType is `country`.

### Task 2: Wire the notification kind

- [x] **Step 1** — in `artifacts/api-server/src/lib/notifications.ts`: import `findFindingCandidates`, include its candidates in `reconcileNotifications` as a global (all-staff) set alongside positions/meetings/elections.

### Task 3: Routes (`artifacts/api-server/src/routes/intelligence.ts`) + mount

- [x] **Step 1: Author the router** — all 10 endpoints; mutation routes use `requireWriteRole()` as an in-router middleware; `getActor(req)` for reviewer id/name; `writeAudit` on every mutation (entity types `intelligence_source`, `intelligence_finding`, `change_event` — the applied record change ALSO gets an audit row for its own entity type via the updating code path); open-finding create refreshes in place; decided-fingerprint create → 409 with existing id; decide-again → 409.
- [x] **Step 2: Mount** — in `routes/index.ts`, `router.use("/intelligence", intelligenceRouter);` immediately after the `/notifications` mount **and before** `requireWriteRole()` (line 34-35 region).
- [x] **Step 3: Typecheck + boot smoke** — typecheck exits 0; boot API in passthrough, `GET /api/intelligence/sources` → `[]`.

### Task 4: auth-qa Phase 5 section

- [x] **Step 1: Add the Phase 5 block to `scripts/src/auth-qa.ts`** (after Phase 4.4). Fixtures: fresh `sources`/`findings` under the disposable QA countries (`QN*`/`QO*`/`QS*`); a QA user actor; a second **viewer** actor for role checks. Cover:
  - 5.0 sources: create (tier defaults from kind), list order tier asc, patch status/notes, viewer 403 on POST/PATCH but 200 GET.
  - 5.1 findings: create open (sourceName joined), fingerprint duplicate → refresh-in-place (same id, updated summary, still open); dedupe after decision → 409; queue filters (topic/stage/minConfidence/limit) + open-first ordering.
  - 5.2 approve + apply: official country/government column changes to the finding's value, `change_event` row (before/after), audit row, finding applied=true, second approve → 409.
  - 5.3 approve without apply (field present, `apply:false`) → official column unchanged, no change_event, `applied=false`; approve with unsupported field + apply → 400 and **not** decided.
  - 5.4 reject: stage rejected, reviewNote stored, audit row; reject again → 409; viewer rejects → 403.
  - 5.5 `new_finding` notification: staff feed contains kind `new_finding` pointing at the fresh finding; closing the finding (approve/reject) retires the notification row; a synthetic 8-day-old finding produces none.
  - 5.6 target-row quality: apply to a deleted/missing target → 404; `electionYear` non-numeric → 400.
- [x] **Step 2: Run auth-qa** — boot API (passthrough), run; expect the previous 163 plus the new Phase 5 checks ALL PASS; note the new total.

### Task 5: Commit

```bash
git add artifacts/api-server/src/lib/intelligence.ts artifacts/api-server/src/lib/notifications.ts artifacts/api-server/src/routes/intelligence.ts artifacts/api-server/src/routes/index.ts scripts/src/auth-qa.ts
git commit -m "feat(api): intelligence sources/findings/approval endpoints + new_finding reconcile (auth-qa green)"
```

---

## Chunk 4: SPA + route-qa

### Task 1: Intelligence page + nav + deep-link

- [x] **Step 1: Create the page** — `src/routes/intelligence.tsx` (thin, `validateSearch` for `focus<id>`) + component extracted to `src/components/IntelligencePage.tsx` — `useListIntelligenceFindings` + `useListIntelligenceSources` + `useListChangeEvents`; stage filter tabs (Open/Approved/Rejected counts from the list), finding cards (tier chip, topic chip, confidence bar, source name+url, headline, summary, target deep-link to `/country/:id?tab=government` when target is a country, review note), Open-card actions: Reject / Approve (pre-flagged a checkbox "Apply the proposed change to the official record" when an applicable field+value is present; default checked). Mutations via the generated react-client hooks + invalidate on success.
- [x] **Step 2: Nav entry** — "Intelligence" in the app shell nav per the existing nav pattern (`App.tsx`).
- [x] **Step 3: `NotificationsPanel.focusItem`** — add `new_finding` → `/intelligence?focus=<id>` (highlight that finding); fix the `meeting_upcoming` early-return to navigate `/meetings` (spec gap found in 4.4).
- [x] **Step 4: Typecheck + SPA build** — both exit 0.

### Task 2: route-qa Phase 5 section

- [x] **Step 1: Add the Phase 5 block** — boot via the combined runner (`seed-intelligence` then suite):
  - `/intelligence` renders; sources table sorted tier 1→5.
  - Open queue shows the government_change finding with topic + confidence + tier chips; rejected finding visible under Rejected.
  - Approve & apply flow: card moves to Approved (Applied badge), API assert `GET /api/countries` SCOR `governmentType == parliamentary`.
  - Bell: new_finding badge present (seed reset it unread), clicking deep-links to `/intelligence?focus=<id>` and highlights it; badge count reflects the seeded window.
  - Non-applicable approve: the find with no field shows no apply checkbox.
  - `?focus=<id>` highlight works on direct navigation.
- [x] **Step 2: Typecheck + build + run** — all green; note the new route-qa total.

### Task 3: Commit

```bash
git add artifacts/global-dr-platform/src/routes/intelligence.tsx artifacts/global-dr-platform/src/App.tsx artifacts/global-dr-platform/src/components/NotificationsPanel.tsx scripts/src/route-qa.ts
git commit -m "feat(spa): intelligence page with approve/reject queue + new_finding deep-link (route-qa green)"
```

---

## Chunk 5: Docs, full verification, final commit

### Task 1: Update `docs/implementation-plan.md`

- [x] **Step 1** — line 5: `**Current next task:** Phase 6 — Search, analytics, and reporting`.
- [x] **Step 2** — Phase 5 status line (137 area): `IN PROGRESS — trust layer (sources, findings, confidence, human approval queue, change events) shipped; scheduled ingestion deferred until rate limits/source terms/retries/provenance are defined`.
- [x] **Step 3** — items 1–3: mark `✓` with evidence (tables, endpoints, apply-allowlist, `new_finding` kind, auth-qa/route-qa totals); items 4–5 stay with their constraint language (item 4 deferred, item 5 satisfied-by-design and recorded).

### Task 2: Full verification

- [x] **Step 1: Kill ports** — `lsof -ti tcp:3000 | xargs kill -9 2>/dev/null; lsof -ti tcp:5173 | xargs kill -9 2>/dev/null; true`.
- [x] **Step 2: One invocation, both suites** — boot API+SPA, wait `/api/healthz`, run `seed-scorecard` + `seed-notify` + `seed-intelligence`, then `route-qa`, then `auth-qa`; capture both `ALL PASS` lines + the exact totals (record auth-qa and route-qa phase counts incl. the new Phase 5 totals).
- [x] **Step 3: typecheck + build** — root `bun run typecheck`, SPA build — exit 0; `git status` shows only intended files.
 - [x] **Step 4 (only after user confirms push): commit + push** — final docs/plan commit; push `origin/main` only on explicit confirmation (repo convention).
- [x] **Step 5: Verify the plan file** — every checkbox marked done except the push step; tick this plan's own Chunk 5 box as the handoff document.