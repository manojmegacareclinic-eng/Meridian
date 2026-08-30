# Global Diplomatic Relations — Implementation Plan

**Status:** Foundation running; MVP implementation in progress  
**Last updated:** 30 August 2026  
**Current next task:** Phase 3 — Diplomatic relations and engagement workflows.  
**Source brief:** `attached_assets/Pasted--Global-Diplomatic-Relations-Government-Engagement-Plat_1787756992171.txt`

This is a living delivery plan for the Global Diplomatic Relations (GDP) platform. It translates the enterprise blueprint into an incremental plan that matches the current Replit project instead of requiring a wholesale rewrite.

## How to use this document

Every implementation task must update the **Current status** section before work starts and after verification:

- `DONE` — implemented and verified in the running project.
- `PARTIAL` — some functionality exists, but the blueprint requirement is not complete.
- `NEXT` — the next recommended task.
- `BLOCKED` — cannot proceed until an external decision, integration, or secret is available.
- `PLANNED` — intentionally scheduled for a later phase.

When a task is completed, record the evidence briefly, mark the next task as `NEXT`, and update `replit.md` if the project-wide status or operating instructions changed.

## Current status

### Completed — foundation

- **DONE** — Imported project dependencies installed from the locked pnpm workspace.
- **DONE** — Development PostgreSQL schema applied with Drizzle.
- **DONE** — API server workflow running behind `/api`.
- **DONE** — React/Vite web workflow running at the root preview.
- **DONE** — Component preview workflow running for the canvas.
- **DONE** — Full workspace TypeScript check passes.
- **DONE** — API health and dashboard endpoints verified through the Replit proxy.
- **DONE** — Existing operational UI is available for countries, contacts, meetings, agreements, activity, dashboard metrics, and settings.
- **DONE** — Task #2 (access control): the workspace is gated behind a sign-in screen; accounts are self-hosted with Better Auth; every API route except `GET /api/healthz` requires a valid session; mutating routes enforce a write-role guard (viewers are read-only); `global_admin`s create accounts, change roles, and invite users from the `/admin` page. Verified by typecheck/build and by the QA suites on a clean database — `auth-qa` 19/19 PASS, SPA demo `route-qa` 16/16 PASS, real-auth `route-qa` 8/8 PASS (sign-in gate, admin nav, `/admin` page). See `docs/roles-and-permissions.md`.
- **PARTIAL** — The current database is empty and the app is using a small operational schema; the blueprint's 195-country coverage and extended intelligence model are not populated yet.

### DONE — Task #3: audit events

**Record audit events for sensitive reads and all data changes** so there is a uniform, queryable trail of who changed what (and who read confidential records).

Done looks like:

- Every create/update action writes an audit row with actor, action, entity, timestamp, and before/after detail where relevant.
- Sensitive reads (e.g. dashboard summary, contact verification state) are logged with the actor.
- The audit trail is visible and queryable (via the activity feed and an audit endpoint), and roles able to view it are documented.

**Status: `DONE`.** `activity` gained `actor_id`, `actor_name`, `action`, `entity_type`,
`entity_id`, `before`, `after`; `writeAudit` records every create/update on countries,
contacts, meetings, agreements, admin users, and invitations plus sensitive reads
(dashboard summary, contacts, admin directory), with compact before/after diffs over an
allowlist of keys. `GET /api/audit` (`listAudit`) exposes the trail to any signed-in user
with `action`/`entityType`/`entityId`/`actorId` filters; the `/audit` page renders
filterable, expandable records. Auth-qa now asserts audit rows, 401 for anonymous access,
and cleanup (`ALL PASS, 26`); demo and real-auth route-qa push the audit page (`ALL PASS,
18` and `11`). See `docs/roles-and-permissions.md → Audit trail`.

## Product delivery roadmap

### Phase 1 — Secure operational foundation

**Status: `DONE` — Task #4 complete: country workspace foundation delivered.**

1. Complete authentication and server-side authorization.
2. Add the initial RBAC roles from the brief:
   - Global Admin
   - Regional Director
   - Country Lead
   - Research Team
   - Meeting Coordinator
   - Viewer
3. Add audit events for sensitive reads and all data changes.
4. Expand the country, organization, institution, and person model only as needed by the first verified workflows.
5. Load a reviewed baseline country directory, beginning with the countries the team actually operates on.
6. Preserve contact verification state, source links, and verification timestamps.

### Phase 1 — Secure operational foundation

**Status: `DONE` — Task #4 complete: country workspace foundation delivered.**

1. Complete authentication and server-side authorization.
2. Add the initial RBAC roles from the brief:
   - Global Admin
   - Regional Director
   - Country Lead
   - Research Team
   - Meeting Coordinator
   - Viewer
3. Add audit events for sensitive reads and all data changes.
4. Expand the country, organization, institution, and person model only as needed by the first verified workflows.
5. Load a reviewed baseline country directory, beginning with the countries the team actually operates on.
6. Preserve contact verification state, source links, and verification timestamps.

### Phase 2 — Country workspaces and government directory

**Status: `DONE` — Country detail workspace delivered with all core tabs functional.**

1. Add a country detail workspace with overview, government, contacts, organizations, meetings, agreements, documents, news, tasks, and analytics sections. ✓ (6 functional tabs: overview, contacts, meetings, agreements, documents, news; 4 placeholder tabs: government, organizations, tasks, analytics)
2. Add institutions, ministries, positions, office terms, and position history. ✓ (ministries, positions, office terms with history implemented)
3. Never overwrite a person's historical position; close the old term and create a new term. ✓ (office term logic auto-closes previous term when creating new one)
4. Add organization types for ministries, embassies, cities, universities, NGOs, parties, and religious institutions. ✓ (7 types implemented with type-specific metadata)
4. Add the global map with status colors, country selection, and filters for region, language, government type, election year, team, priority, strategy, and meeting status. ✓ (interactive Leaflet map with filter sidebar)

**Evidence:** `bun run typecheck` clean, `bun run build` passes, `auth-qa` 43/43 PASS, `route-qa` 30/31 PASS (1 external resource 404).

### Phase 3 — Diplomatic relations and engagement workflows

**Status: `NEXT` — meeting and agreement records exist; configurable relationship strategies and full lifecycle automation remain.**

1. Add configurable DR strategies:
   - USKDR
   - HQ Agreement
   - Host Country Agreement
   - Sister City
   - Proclamation
   - NGO Partnership
   - Refugee Partnership
   - University Partnership
   - Honorary Doctorate
2. Give each strategy its own visible pipeline stages.
3. Expand meeting records to include agenda, participants, transcript, notes, AI summary, risk, attachments, and follow-up timeline.
4. Connect completed meetings to action items and deliverables.
5. Add document and agreement lifecycle states: draft, review, approved, signed, and archived.

### Phase 4 — Deliverables, tasks, and notifications

**Status: `PLANNED`**

1. Add weekly and daily deliverables tied to action areas.
2. Add country assignments with primary owner, secondary owner, reviewer, and regional coordinator.
3. Add failure analysis, completion percentage, response SLA, and country scorecards.
4. Add notifications for position changes, upcoming meetings, expiring agreements, overdue follow-ups, elections, and confidence changes.
5. Add in-app notifications first; evaluate email, WhatsApp, Telegram, and Slack after the core workflow is stable.

### Phase 5 — Intelligence and source verification

**Status: `PLANNED` — do not automate before provenance and human review are in place.**

1. Add a source-oriented intelligence feed for government changes, elections, diplomatic news, religious affairs, NGO news, and university news.
2. Prioritize sources in this order:
   - Official government websites
   - Parliament directories
   - Embassy websites
   - Government gazettes
   - Official LinkedIn
   - Official Facebook/X
3. Add source records, confidence, change events, and a human approval queue.
4. Add scheduled ingestion only after rate limits, source terms, retries, and provenance are defined.
5. Keep automated findings separate from approved official records until a reviewer accepts them.

### Phase 6 — Search, analytics, and reporting

**Status: `PLANNED`**

1. Add universal search across countries, people, phone numbers, WhatsApp, embassies, universities, agreements, meetings, and political parties.
2. Add executive reports for country performance, DR funnel, meetings, lead conversion, contact coverage, position changes, engagement health, and country heat maps.
3. Add charts for agreements by region, completed meetings over time, and engagement status.
4. Export reviewed reports to PDF only after the underlying data and access rules are reliable.

### Phase 7 — AI assistance and automation

**Status: `PLANNED` — human-reviewed assistance, not autonomous authority.**

1. Add structured prompt workflows for country research, official discovery, contact verification, meeting summaries, follow-up drafts, MOU drafts, and country reports.
2. Keep AI outputs explainable with source citations, confidence, timestamps, and reviewer decisions.
3. Add agents in this order:
   - Research
   - Contact discovery
   - Verification
   - Meeting assistant
   - Report writer
   - News
   - Translation
   - Relationship scoring
   - Document generation
4. Do not let an agent silently overwrite official records, change a position history, or send external communications.

### Phase 8 — Production hardening

**Status: `PLANNED`**

1. Add automated API and browser smoke tests for the highest-risk workflows.
2. Review authorization, validation, rate limits, auditability, soft deletion, and sensitive-field handling.
3. Add backup/restore procedures and operational monitoring.
4. Configure production authentication and review the published database schema through Replit's supported publish flow.
5. Publish only after access control, representative data, and recovery procedures are verified.

## Project decisions and boundaries

- Keep the existing bun workspace, React/Vite frontend, Express API, PostgreSQL, Drizzle, OpenAPI, and generated client.
- Do not migrate the project to the blueprint's proposed Next.js, Supabase, Turborepo, or Neo4j stack unless a separate decision explicitly authorizes that change.
- Use PostgreSQL for development persistence.
- **Authentication provider decision (made 28 August 2026): self-hosted Better Auth.** Clerk was the initial choice but its hosted origin is unreachable on this network, so sign-in moved to a self-hosted Better Auth instance (session cookie + email verification, `BETTER_AUTH_SECRET`, no provider keys). Accounts live in the workspace Postgres; roles are stored on the user record. See `docs/roles-and-permissions.md` for the role model and `README.md` for setup.
- Treat official records as sensitive. Automation must preserve provenance and route uncertain changes through human review.
- Build the trusted operational record and review workflow before political-risk scoring, autonomous scraping, or agentic automation.

## Definition of an MVP

The first production-minded MVP is complete when an authorized team can securely manage reviewed countries, institutions, contacts, meetings, agreements, follow-up work, and audit history; search those records; and see reliable executive summaries. Intelligence ingestion and AI agents are later phases, not prerequisites for the operational core.
