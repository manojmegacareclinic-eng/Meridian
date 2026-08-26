# Global Diplomatic Relations — Implementation Plan

**Status:** Foundation running; MVP implementation in progress  
**Last updated:** 26 August 2026  
**Current next task:** **Task #2 — Require sign-in before exposing confidential diplomatic records**  
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
- **PARTIAL** — The current database is empty and the app is using a small operational schema; the blueprint's 195-country coverage and extended intelligence model are not populated yet.

### NEXT — Task #2: access control

**Require sign-in before exposing confidential diplomatic records.**

Done looks like:

- A user must sign in before opening the diplomatic workspace.
- API routes reject unauthenticated requests, not just the frontend.
- The signed-in user is displayed in the workspace shell.
- The chosen role/permission model is documented and enforced consistently.
- Clerk configuration requirements are documented without putting secrets in source control.

**Current blocker:** Clerk dependencies are present in the codebase, but no Clerk configuration is currently available in the development environment. Use Replit-managed Clerk unless the product owner explicitly chooses another provider.

## Product delivery roadmap

### Phase 1 — Secure operational foundation

**Status: `PARTIAL` — Task #2 is `NEXT`.**

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

**Status: `PARTIAL` — the current app has country/contact lists and basic CRUD, but not full country workspaces.**

1. Add a country detail workspace with overview, government, contacts, organizations, meetings, documents, news, tasks, and analytics sections.
2. Add institutions, ministries, positions, office terms, and position history.
3. Never overwrite a person's historical position; close the old term and create a new term.
4. Add organization types for ministries, embassies, cities, universities, NGOs, parties, and religious institutions.
5. Add the global map with status colors, country selection, and filters for region, language, government type, election year, team, priority, strategy, and meeting status.

### Phase 3 — Diplomatic relations and engagement workflows

**Status: `PARTIAL` — meeting and agreement records exist; configurable relationship strategies and full lifecycle automation remain.**

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

- Keep the existing pnpm workspace, React/Vite frontend, Express API, PostgreSQL, Drizzle, OpenAPI, and generated client.
- Do not migrate the project to the blueprint's proposed Next.js, Supabase, Turborepo, or Neo4j stack unless a separate decision explicitly authorizes that change.
- Use the built-in Replit PostgreSQL database for development persistence.
- Use Replit-managed Clerk for authentication when Task #2 begins, unless the product owner chooses an external provider.
- Treat official records as sensitive. Automation must preserve provenance and route uncertain changes through human review.
- Build the trusted operational record and review workflow before political-risk scoring, autonomous scraping, or agentic automation.

## Definition of an MVP

The first production-minded MVP is complete when an authorized team can securely manage reviewed countries, institutions, contacts, meetings, agreements, follow-up work, and audit history; search those records; and see reliable executive summaries. Intelligence ingestion and AI agents are later phases, not prerequisites for the operational core.
