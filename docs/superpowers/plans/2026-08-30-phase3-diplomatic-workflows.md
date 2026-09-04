# Phase 3 Implementation Plan: Diplomatic Relations & Engagement Workflows

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 3 — Diplomatic Relations & Engagement Workflows with configurable DR strategies, expanded meeting records, action items, and enhanced lifecycle states.

**Architecture:** Extend existing PostgreSQL/Drizzle schema, Express API routes, OpenAPI contract, React SPA components. Follow existing patterns for audit, auth, and codegen.

**Tech Stack:** Drizzle ORM, Express 5, TanStack Router, React 19, OpenAPI/Orval codegen, existing auth/audit infrastructure.

---

## File Structure Map

### New Files
- `lib/db/src/schema/drStrategies.ts` — DR strategy definitions
- `lib/db/src/schema/meetingAgenda.ts` — Meeting agenda items
- `lib/db/src/schema/meetingParticipants.ts` — Meeting participants
- `lib/db/src/schema/meetingTranscripts.ts` — Meeting transcripts/notes
- `lib/db/src/schema/actionItems.ts` — Action items from meetings
- `lib/db/src/schema/deliverables.ts` — Deliverables from meetings
- `artifacts/api-server/src/routes/drStrategies.ts` — DR strategy CRUD
- `artifacts/api-server/src/routes/meetingAgenda.ts` — Meeting agenda CRUD
- `artifacts/api-server/src/routes/meetingParticipants.ts` — Participants CRUD
- `artifacts/api-server/src/routes/meetingTranscripts.ts` — Transcripts CRUD
- `artifacts/api-server/src/routes/actionItems.ts` — Action items CRUD
- `artifacts/api-server/src/routes/deliverables.ts` — Deliverables CRUD
- `artifacts/global-dr-platform/src/components/StrategyPipeline.tsx` — Pipeline visualization
- `artifacts/global-dr-platform/src/components/MeetingDetail.tsx` — Expanded meeting view

### Modified Files
- `lib/db/src/schema/agreements.ts` — Add lifecycle states
- `lib/db/src/schema/meetings.ts` — Add expanded fields
- `lib/db/src/schema/documents.ts` — Already has correct states
- `lib/db/src/schema/index.ts` — Export new schemas
- `lib/api-spec/openapi.yaml` — New paths and schemas
- `artifacts/api-server/src/lib/audit.ts` — New entity types
- `artifacts/api-server/src/routes/index.ts` — Mount new routers
- `artifacts/api-server/src/routes/agreements.ts` — Update lifecycle
- `artifacts/api-server/src/routes/meetings.ts` — Expand endpoints
- `artifacts/global-dr-platform/src/components/AgreementsTab.tsx` — Enhanced UI
- `artifacts/global-dr-platform/src/components/MeetingsTab.tsx` — Enhanced UI
- `artifacts/global-dr-platform/src/App.tsx` — Export new components

---

## Chunk 1: Database Schema & Audit Unions

### Task 1: DR Strategies Schema
- [ ] Create `lib/db/src/schema/drStrategies.ts` with strategy types and pipeline stages
- [ ] Add enum for strategy types (8 predefined + custom)
- [ ] Include pipeline stages per strategy type

### Task 2: Meeting Expansion Schema
- [ ] Update `lib/db/src/schema/meetings.ts` with new fields:
  - `agenda` (text)
  - `transcript` (text)
  - `notes` (text)
  - `aiSummary` (text)
  - `riskLevel` (text)
  - `attachments` (jsonb)
  - `followUpTimeline` (jsonb)
- [ ] Create `meetingAgenda.ts` for agenda items
- [ ] Create `meetingParticipants.ts` for participants
- [ ] Create `meetingTranscripts.ts` for transcripts/notes

### Task 3: Action Items & Deliverables Schema
- [ ] Create `actionItems.ts` with fields: meetingId, description, assignee, dueDate, status, deliverableId
- [ ] Create `deliverables.ts` with fields: actionItemId, title, description, dueDate, status, url

### Task 4: Agreement Lifecycle States
- [ ] Update `agreements.ts` with lifecycle states: draft, review, approved, signed, archived
- [ ] Add `lifecycleState` field (separate from status)
- [ ] Add `signedAt`, `signedBy`, `reviewedAt`, `reviewedBy`

### Task 5: Document Lifecycle (verify)
- [ ] Confirm documents.ts has correct states: draft, review, approved, signed, archived ✓

### Task 6: Audit Unions
- [ ] Update `artifacts/api-server/src/lib/audit.ts` with new entity types

### Task 7: Export Schemas
- [ ] Update `lib/db/src/schema/index.ts` with new exports

### Task 8: DB Push & Typecheck
```bash
DATABASE_URL="postgresql://localhost:5432/meridian" bun run --filter @workspace/db push
bun run typecheck
```

### Task 8: Commit
```bash
git commit -m "feat(db): DR strategies, expanded meetings, action items, deliverables, agreement lifecycle"
```

---

## Chunk 2: OpenAPI Contract & Codegen

### Task 9: OpenAPI Schemas
- [ ] Add schemas for DRStrategy, DRStrategyInput, DRStrategyUpdate
- [ ] Add schemas for MeetingAgenda, MeetingParticipant, MeetingTranscript
- [ ] Add schemas for ActionItem, ActionItemInput, ActionItemUpdate
- [ ] Add schemas for Deliverable, DeliverableInput, DeliverableUpdate
- [ ] Update Agreement schema with lifecycleState
- [ ] Update Meeting schema with expanded fields

### Task 10: OpenAPI Paths
- [ ] `/dr-strategies` GET, POST
- [ ] `/dr-strategies/{id}` GET, PATCH, DELETE
- [ ] `/meetings/{id}/agenda` GET, POST
- [ ] `/meetings/{id}/participants` GET, POST
- [ ] `/meetings/{id}/transcripts` GET, POST
- [ ] `/meetings/{id}/action-items` GET, POST
- [ ] `/action-items/{id}` GET, PATCH, DELETE
- [ ] `/deliverables` GET, POST
- [ ] `/deliverables/{id}` GET, PATCH, DELETE
- [ ] Update `/agreements/{id}` PATCH for lifecycleState

### Task 11: Codegen & Typecheck
```bash
bun run --filter @workspace/api-spec codegen
bun run typecheck:libs
```

### Task 12: Commit
```bash
git commit -m "feat(api): openapi contract for DR strategies, expanded meetings, action items, deliverables"
```

---

## Chunk 3: API Handlers

### Task 13: DR Strategies Routes
- [ ] Create `artifacts/api-server/src/routes/drStrategies.ts` with CRUD
- [ ] Include pipeline stages in response

### Task 14: Meeting Expansion Routes
- [ ] Create `meetingAgenda.ts` CRUD
- [ ] Create `meetingParticipants.ts` CRUD
- [ ] Create `meetingTranscripts.ts` CRUD
- [ ] Update `meetings.ts` with expanded fields

### Task 15: Action Items & Deliverables Routes
- [ ] Create `actionItems.ts` CRUD
- [ ] Create `deliverables.ts` CRUD

### Task 16: Agreement Lifecycle Routes
- [ ] Update `agreements.ts` PATCH for lifecycleState transitions
- [ ] Validate state transitions

### Task 16: Mount Routers
- [ ] Update `artifacts/api-server/src/routes/index.ts`

### Task 17: Verify & Commit
```bash
bun run typecheck
git commit -m "feat(api): DR strategies, expanded meetings, action items, deliverables, agreement lifecycle"
```

---

## Chunk 4: SPA Components

### Task 18: Strategy Pipeline Component
- [ ] Create `artifacts/global-dr-platform/src/components/StrategyPipeline.tsx`
- [ ] Visual pipeline with drag-and-drop stages
- [ ] Per-strategy stage configuration

### Task 19: Enhanced Meeting Detail
- [ ] Create `artifacts/global-dr-platform/src/components/MeetingDetail.tsx`
- [ ] Tabs: Details, Agenda, Participants, Transcripts, Action Items, Deliverables
- [ ] AI summary display

### Task 20: Enhanced Agreements Tab
- [ ] Add lifecycle state badge
- [ ] Transition buttons (draft → review → approved → signed)

### Task 21: Enhanced Meetings Tab
- [ ] Link to MeetingDetail
- [ ] Show action items count

### Task 22: Register Components
- [ ] Export from App.tsx
- [ ] Update routes

### Task 23: Route Tree & Commit
```bash
bun run --filter @workspace/global-dr-platform routes
bun run typecheck
bun run build
git commit -m "feat(spa): DR strategy pipeline, expanded meeting detail, lifecycle UI"
```

---

## Chunk 5: QA & Docs

### Task 24: Auth-QA Extensions
- [x] Add assertions for DR strategies CRUD
- [x] Add assertions for meeting agenda/participants/transcripts
- [x] Add assertions for action items/deliverables CRUD
- [x] Add assertions for agreement lifecycle transitions
- [x] Run auth-qa: `DATABASE_URL=... bun run --filter @workspace/scripts auth-qa` → **ALL PASS (66 passed)**

### Task 25: Route-QA Extensions
- [x] Add route checks for DR strategies page
- [x] Add route checks for meeting detail tabs
- [x] Add route checks for agreement lifecycle
- [x] Run route-qa → **ALL PASS (44 passed)** in demo mode

### Task 26: Docs Updates
- [x] Update `docs/implementation-plan.md`
- [x] Update `docs/roles-and-permissions.md` if needed

### Task 27: Final Commit & Push
- [ ] Commit & push Phase 3 completion

> **QA follow-ups:** auth-qa surfaced and this session fixed three real backend defects —
> (1) `CreateMeetingResponse.owner` rejected the nullable column (`owner → null`) with a
> 500; fixed in the OpenAPI `Meeting.owner` (nullable) + codegen. (2) agreement lifecycle
> `PATCH` parsed the raw DB row against a response schema requiring the joined
> `countryName`; route now joins it like `platform.ts`. (3) meeting sub-resource list GETs
> validated the empty query against a required-`id` path schema (400), and the
> `/meetings/:meetingId/action-items` collection + `/action-items/:actionItemId` item
> routes used params schemas that demanded the wrong keys; route-local `{ meetingId }` /
> `{ actionItemId }` schemas added (and `zod` added as an api-server dependency).

---

## Notes for Implementer

- **TDD approach:** Write failing tests/assertions first where practical
- **Codegen naming:** Use exact zod schema names from `lib/api-zod/src/generated/`
- **Audit pattern:** Follow existing `writeAudit` calls in `platform.ts`
- **Hooks rules:** All list queries at component top level (not conditional)
- **Route tree:** Always run `bun run --filter @workspace/global-dr-platform routes` after adding routes
- **Drizzle defaults:** Use `defaultNow()` for timestamps, `default("draft")` for status
- **FK constraints:** Use `onDelete: "cascade"` for child tables, `set null` for optional refs

---

*Plan complete. Ready to execute?*