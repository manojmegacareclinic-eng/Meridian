# Phase 3 Spec: Diplomatic Relations & Engagement Workflows

**Date:** 2026-08-30  
**Status:** Approved  
**Depends on:** Phase 2 (Country Workspaces) — Complete

---

## Overview

Phase 3 extends the diplomatic platform with configurable diplomatic relationship (DR) strategies, enriched meeting workflows, action item tracking, and enhanced lifecycle management for agreements and documents.

---

## 1. Configurable DR Strategies

### 1.1 Strategy Types (8 Predefined + Custom)

| Type ID | Label | Description | Default Pipeline Stages |
|---------|-------|-------------|------------------------|
| `uskdr` | USKDR | U.S. Key Diplomatic Relationship | `scoping → negotiation → approval → implementation → monitoring` |
| `hq_agreement` | HQ Agreement | Headquarters Agreement | `drafting → negotiation → legal_review → signature → ratification` |
| `host_country` | Host Country Agreement | Host Country Agreement | `negotiation → legal_review → approval → signature → implementation` |
| `sister_city` | Sister City | Sister City Partnership | `proposal → agreement → exchange_programs → review` |
| `proclamation` | Proclamation | Presidential/Ministerial Proclamation | `drafting → review → approval → publication` |
| `ngo_partnership` | NGO Partnership | NGO Partnership | `scoping → moa_drafting → review → signing → implementation` |
| `refugee_partnership` | Refugee Partnership | Refugee Partnership | `assessment → agreement → implementation → monitoring` |
| `university_partnership` | University Partnership | University Partnership | `proposal → mou → program_design → launch → evaluation` |
| `custom` | Custom | User-defined strategy | User-defined stages |

### 1.2 Pipeline Stages

Each strategy type has a defined ordered list of stages. Stages are:
- Ordered (position integer)
- Named (label)
- Optional description
- Optional SLA (days)
- Optional required fields for stage entry

### 1.3 CRUD Operations

- **List** — filter by countryId, type
- **Create** — name, type, customStages (optional override), countryId
- **Read** — full strategy with stages
- **Update** — name, customStages, isActive
- **Delete** — soft delete (isActive = false)

### 1.4 Audit

All CRUD operations audited with `entityType: "dr_strategy"`

---

## 2. Expanded Meeting Records

### 2.1 New Meeting Fields

| Field | Type | Description |
|-------|------|-------------|
| `agenda` | text | Meeting agenda (markdown) |
| `transcript` | text | Full transcript (markdown) |
| `notes` | text | Internal notes (markdown) |
| `aiSummary` | text | AI-generated summary |
| `riskLevel` | text | low/medium/high |
| `attachments` | jsonb | Array of {name, url, type, size} |
| `followUpTimeline` | jsonb | [{date, action, owner, status}] |

### 2.2 Meeting Agenda Items

| Field | Type | Description |
|-------|------|-------------|
| `meetingId` | integer | FK → meetings |
| `order` | integer | Display order |
| `title` | text | Agenda item title |
| `description` | text | Details |
| `durationMinutes` | integer | Estimated duration |
| `presenter` | text | Who presents |
| `status` | text | pending/in_progress/completed |

### 2.3 Meeting Participants

| Field | Type | Description |
|-------|------|-------------|
| `meetingId` | integer | FK → meetings |
| `contactId` | integer | FK → contacts (optional) |
| `name` | text | Name (if not contact) |
| `role` | text | Role in meeting |
| `organization` | text | Organization |
| `attended` | boolean | Attendance confirmation |

### 2.4 Meeting Transcripts/Notes

| Field | Type | Description |
|-------|------|-------------|
| `meetingId` | integer | FK → meetings |
| `authorId` | text | Actor ID |
| `authorName` | text | Display name |
| `content` | text | Markdown content |
| `type` | text | transcript/notes/summary |
| `createdAt` | timestamp | Auto |

---

## 3. Action Items & Deliverables

### 3.1 Action Items

| Field | Type | Description |
|-------|------|-------------|
| `id` | serial | PK |
| `meetingId` | integer | FK → meetings |
| `description` | text | What needs to be done |
| `assignee` | text | Assignee name/email |
| `assigneeContactId` | integer | FK → contacts (optional) |
| `dueDate` | date | Due date |
| `status` | text | pending/in_progress/completed/cancelled |
| `deliverableId` | integer | FK → deliverables (optional) |
| `createdAt` | timestamp | Auto |
| `updatedAt` | timestamp | Auto |

### 3.2 Deliverables

| Field | Type | Description |
|-------|------|-------------|
| `id` | serial | PK |
| `actionItemId` | integer | FK → action_items |
| `title` | text | Deliverable name |
| `description` | text | Details |
| `dueDate` | date | Due date |
| `status` | text | pending/in_progress/completed |
| `url` | text | Link to artifact |
| `createdAt` | timestamp | Auto |
| `updatedAt` | timestamp | Auto |

---

## 4. Agreement Lifecycle States

### 4.1 Lifecycle States (separate from status)

| State | Description | Valid Transitions |
|-------|-------------|-------------------|
| `draft` | Initial creation | → `review` |
| `review` | Under review | → `approved`, `draft` |
| `approved` | Approved, awaiting signature | → `signed`, `review` |
| `signed` | Fully executed | → `archived` |
| `archived` | Complete/expired | (terminal) |

### 4.2 Additional Fields

| Field | Type | Description |
|-------|------|-------------|
| `lifecycleState` | text | Current state (default: draft) |
| `reviewedAt` | timestamp | When moved to review |
| `reviewedBy` | text | Actor name |
| `approvedAt` | timestamp | When approved |
| `approvedBy` | text | Actor name |
| `signedAt` | timestamp | When signed |
| `signedBy` | text | Actor name |

### 4.3 Transition Validation

- Only forward transitions allowed (except back to draft from review)
- Each transition writes audit row with before/after
- `signedAt` and `signedBy` required on transition to `signed`

---

## 5. Document Lifecycle (Already Implemented)

Documents already have: `draft`, `review`, `approved`, `signed`, `archived` — confirmed complete.

---

## 6. SPA Components

### 6.1 Strategy Pipeline Component

- Visual Kanban-style pipeline per strategy
- Drag-and-drop stage reordering (admin only)
- Stage cards show count, SLA, required fields
- Click stage → filter agreements/meetings by stage

### 6.2 Meeting Detail Page

Tabs:
1. **Details** — Basic info, risk, attachments, follow-up timeline
2. **Agenda** — Ordered items with presenter, duration, status
3. **Participants** — List with attendance toggle
4. **Transcripts** — Chronological notes/transcript/summary
5. **Action Items** — Table with assignee, due date, status, deliverable link
6. **Deliverables** — Linked from action items

### 6.3 Agreement Lifecycle UI

- Lifecycle state badge (color-coded)
- Transition buttons (disabled if invalid)
- Confirmation modal on transition
- Audit trail link

---

## 7. API Endpoints Summary

### DR Strategies
```
GET    /api/dr-strategies?countryId=        → List
POST   /api/dr-strategies                   → Create
GET    /api/dr-strategies/:id               → Read
PATCH  /api/dr-strategies/:id               → Update
DELETE /api/dr-strategies/:id               → Soft delete
```

### Meeting Extensions
```
GET    /api/meetings/:id/agenda             → List agenda items
POST   /api/meetings/:id/agenda             → Create agenda item
PATCH  /api/meetings/:id/agenda/:itemId     → Update
DELETE /api/meetings/:id/agenda/:itemId     → Delete

GET    /api/meetings/:id/participants       → List
POST   /api/meetings/:id/participants       → Add participant
DELETE /api/meetings/:id/participants/:pid  → Remove

GET    /api/meetings/:id/transcripts        → List
POST   /api/meetings/:id/transcripts        → Add transcript/note
```

### Action Items & Deliverables
```
GET    /api/meetings/:id/action-items       → List
POST   /api/meetings/:id/action-items       → Create
PATCH  /api/action-items/:id                → Update
DELETE /api/action-items/:id                → Delete

GET    /api/deliverables?actionItemId=      → List
POST   /api/deliverables                    → Create
PATCH  /api/deliverables/:id                → Update
DELETE /api/deliverables/:id                → Delete
```

### Agreement Lifecycle
```
PATCH /api/agreements/:id/lifecycle         → Transition state
```
Body: `{ lifecycleState: "review" | "approved" | "signed" | "archived" }`

---

## 8. Audit Entity Types (New)

- `dr_strategy`
- `meeting_agenda`
- `meeting_participant`
- `meeting_transcript`
- `action_item`
- `deliverable`

All with actions: `create`, `update`, `delete`

---

## 9. Verification Commands

```bash
# DB push
DATABASE_URL="postgresql://localhost:5432/meridian" bun run --filter @workspace/db push

# Typecheck
bun run typecheck

# Codegen
bun run --filter @workspace/api-spec codegen
bun run typecheck:libs

# Build
bun run build

# QA
DATABASE_URL="postgresql://localhost:5432/meridian" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" AUTH_PASSTHROUGH="false" PORT=3000 bun run --filter @workspace/scripts auth-qa
bun run --filter @workspace/scripts route-qa
```

---

## 10. Acceptance Criteria

- [ ] All 8 DR strategy types creatable with custom pipeline
- [ ] Meeting agenda/participants/transcripts CRUD working
- [ ] Action items linkable to meetings and deliverables
- [ ] Agreement lifecycle transitions validated and audited
- [ ] All new endpoints return 401/403 for unauthorized
- [ ] `bun run typecheck` clean
- [ ] `bun run build` passes
- [ ] `auth-qa` passes (new assertions added)
- [ ] `route-qa` passes (new routes covered)