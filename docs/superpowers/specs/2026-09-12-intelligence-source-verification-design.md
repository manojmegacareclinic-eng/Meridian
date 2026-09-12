# Phase 5 — Intelligence & Source Verification: findings, confidence, human approval queue

**Status:** Draft for review
**Date:** 2026-09-12
**Supersedes:** nothing
**Project:** Meridian — Global Diplomatic Relations (GDP) platform

---

## Why this feature

The product brief and `docs/implementation-plan.md` Phase 5 call for an **intelligence feed for government changes, elections, diplomatic news, religious affairs, NGO news, and university news**, sourced with an explicit priority order (official government websites → parliament directories → embassy websites → government gazettes → official LinkedIn → official Facebook/X), plus **source records, confidence, change events, and a human approval queue**. The phase header carries a hard constraint: **do not automate before provenance and human review are in place** — and plan item 4 gates scheduled ingestion behind defined rate limits, source terms, retries, and provenance.

The platform already has the products of *official* work (countries, ministries, positions, organizations, contacts, agreements, meetings, news) and a reconcile-based notifications center (Phase 4.4). What it does **not** have is the *candidate/trust layer*: a place where an observed claim lives **separately from official records** until a human accepts it, carrying with it its source, its confidence, and a reviewer's decision that becomes an audited change event.

So this phase builds the **sink** that any future ingestion (manual, seed, or later an agent) writes into — the provenance + human-gate half of the plan — **without** the crawler. Scheduled ingestion is explicitly deferred by the plan's own ordering.

## Goals

- **Source records** (`intelligence_sources`) with provenance metadata: kind, priority tier (the item-2 order), base URL, status. The priority order becomes a first-class, sortable concept.
- **Findings queue** (`intelligence_findings`): candidate change-events — headline claim, URL, summary, confidence (0–100), topic, optional target entity, and optionally a proposed official-field change. Findings are the single intake shape for manual, seed (deterministic demo), and future automated ingestion.
- **Separation of automated findings from official records** (plan item 5): findings never touch official tables. Only an explicit human **approve** action may apply a proposed change, and only for an allowlisted set of fields; approval (or rejection) is a one-way decision stamped with reviewer + timestamp.
- **Change events** (`change_events`): the provenance ledger linking a finding → the applied official change (before/after) → the reviewer, so the trail is queryable and reversible in principle.
- **Confidence** tracked per finding and surfaced (chip/bar), human-entered for now — there is no provenance pipeline to compute a score from yet (see Non-goals).
- **Feed topics** map to plan item 1's categories; the SPA queue groups by them.
- **Notification tie-in** closes the Phase 4.4 deferral of "new proclamation received" (news-intelligence alerts): a new `new_finding` alert kind (all staff) fed by the existing reconcile machinery.
- **SPA**: an Intelligence page — findings queue (topic/confidence/tier chips, source attribution, approve/reject, apply-on-approve) and a sources index — plus bell deep-links from `new_finding` notifications.

## Non-goals / deferred (per plan item 4 and the phase status header)

- **No scheduled ingestion, crawling, or scraping** — no scrapers, RSS, polling, or background workers. Rate-limit policy, source terms parsing, retry policy, and the provenance *pipeline* are explicitly deferred until defined and designed. Findings enter via the API only (manual now; agents/ingestion later).
- **No AI/automated confidence scoring** — confidence is set explicitly on the finding (integer 0–100, default 50). A future agent fills it once provenance exists.
- **No email/WhatsApp/Telegram/Slack channels** — in-app first, consistent with Phase 4.4's channel deferral.
- **No editing or deleting findings through the application** — a finding is a one-way record (create → approve | reject). Corrections come as new findings (dedupe still applies via fingerprint).
- **Apply is allowlisted and explicit** — approving never silently overwrites arbitrary fields; see the allowlist below. Rejecting writes nothing.
- **No source-scope/terms per source**, no per-source rate-limit records, no crawl state.

## Domain model

### Source kinds and tier (plan item 2)

Tier = position in the brief's priority order. Stored on the source as a snapshot for stable sorting, defaulted from kind (a source whose kind places it higher outranks a lower one regardless of name):

| tier | kind | label |
| --- | --- | --- |
| 1 | `government_site` | Government website |
| 2 | `parliament_directory` | Parliament directory |
| 3 | `embassy_site` | Embassy website |
| 4 | `government_gazette` | Government gazette |
| 5 | `linkedin` | Official LinkedIn |
| 6 | `facebook_x` | Official Facebook/X |
| 7 | `other` | Other |

### Feed topics (plan item 1)

`government_change`, `election`, `diplomatic_news`, `religious_affairs`, `ngo_news`, `university_news`, `other`.

### Findings lifecycle

- **open** — in the reviewer queue (default on create).
- **approved** — accepted by a human. If the finding carries an applicable proposed field change and the reviewer chose apply, the official record is updated (allowlist only), a `change_events` row records before/after + provenance, and the change is written to the existing audit trail. `applied` on the finding reflects whether apply happened.
- **rejected** — declined; the finding remains as decided history (with optional review note).
- Once decided, a finding cannot be re-decided (approve/reject → 409). Fingerprint dedupe (see below) still allows *new* distinct findings from the same source.

### Fingerprint / dedupe

`fingerprint = "<sourceId>:<url | normalized headline>"`. On `POST /intelligence/findings`: if the fingerprint exists and its stage is **open**, the incoming data refreshes the existing row in place (title/summary/url/confidence — never the stage or reviewer). If it exists and is **decided**, the create returns `409` with the existing id, so re-ingestion can never silently undo a human decision.

### Apply-on-approve allowlist

Approval applies `field` + `value` to the target entity only for these (targetType → column) pairs. Anything else with apply requested → `400` explaining it cannot be applied (the finding can still be approved without applying).

| targetType | fields |
| --- | --- |
| `country` | `governmentType`, `electionYear`, `status`, `language` |
| `organization` | `name`, `type`, `website`, `address`, `notes` |
| `contact` | `title`, `institution`, `verificationStatus` |

`electionYear` is validated as an integer year. Apply is best-effort-and-explicit: the target row must still exist (else `404`), and the field format must validate (else `400`).

## Schema (additive; `lib/db/src/schema/intelligence.ts`)

```ts
sourceKinds = ["government_site","parliament_directory","embassy_site","government_gazette","linkedin","facebook_x","other"];
findingTopics = ["government_change","election","diplomatic_news","religious_affairs","ngo_news","university_news","other"];
findingStages = ["open","approved","rejected"];
```

- `intelligence_sources`: id, name, kind, tier, baseUrl, notes, status (`active|deprecated|suspended`, default active), createdAt.
- `intelligence_findings`: id, sourceId (FK sources), topic, headline, url, summary, confidence (int, default 50), targetType (nullable `country|organization|contact`), targetId (nullable int), field (nullable), value (nullable), stage (default open), reviewNote, applied (bool default false), reviewedByUserId (FK users), reviewedAt, fingerprint (unique), createdAt.
- `change_events`: id, findingId (FK findings), entityType, entityId, field, beforeValue, afterValue, applied (bool), sourceUrl, reviewedByUserId (FK users), reviewedAt, createdAt.
- **`new_finding`** added to `notificationKinds` in `lib/db/src/schema/notifications.ts`.

## API (`/api/intelligence/*`, read+write role split mirrors the audit/notifications pattern)

Part of the router is mounted **before** `requireWriteRole()` (reads visible to all signed-in roles, honoring `docs/roles-and-permissions.md`), with mutation routes guarded **in-router** (same pattern as `admin`).

- `GET /api/intelligence/sources` — list, ordered tier asc, then name. Any role.
- `POST /api/intelligence/sources` — create (kind → default tier). Write role.
- `PATCH /api/intelligence/sources/:id` — update name/baseUrl/notes/status/tier. Write role.
- `GET /api/intelligence/findings` — queue; filters `topic`, `stage`, `sourceId`, `targetType`, `minConfidence`, `limit` (default 200, max 200); order: open first, then createdAt desc. Any role.
- `GET /api/intelligence/findings/:id` — single (includes sourceName + tier). Any role.
- `POST /api/intelligence/findings` — create / refresh-on-open / 409-if-decided. Write role.
- `POST /api/intelligence/findings/:id/approve` — body `{ apply?: boolean, reviewNote?: string }`; marks approved (once), optionally applies allowlisted field → official record + `change_event` + audit; `409` if already decided.
- `POST /api/intelligence/findings/:id/reject` — body `{ reviewNote?: string }`; marks rejected (once); `409` if already decided.
- `GET /api/intelligence/change-events` — ledger; filters `entityType`, `entityId`, `findingId`; order reviewedAt desc. Any role.

Audit: every sources create/update, findings create, approve (incl. the applied record change), and reject writes an `activity` row with the actor via the existing `writeAudit`.

## SPA

- New route `/intelligence` (TanStack Router file `src/routes/intelligence.tsx`) → `IntelligencePage`: stage-filtered findings queue (Open / Approved / Rejected with counts), finding cards showing tier chip (from source), topic chip, confidence bar, source name + URL, headline, summary, target deep-link, review note; Open cards have **Reject** and **Approve** ("Approve & apply" when an applicable field+value is present, "Approve (record only)" otherwise). Sources index: list with kind/tier/status/baseUrl.
- Nav entry "Intelligence" in the app shell (existing nav pattern).
- `NotificationsPanel.focusItem`: new `new_finding` branch → `/intelligence?focus=<id>`; meeting_upcoming deep-link gap (→ `/meetings`) fixed while here.

## Deterministic QA

- **`scripts/src/seed-intelligence.ts`** (`seed-intelligence` script in `scripts/package.json`): idempotent by URL/fingerprint. Seeds SCOR sources (country-site tier 1, gazette tier 4, LinkedIn tier 5) and findings covering topics, stages, and confidence — including an open `government_change` with an applicable, allowlisted change (`country.governmentType`: baseline `presidential` → proposed `parliamentary`). **Each run restores the baseline** (target country field reset, seed findings reset to canonical stage, related `new_finding` notifications reset to unread) so the flow is deterministic across repeat runs — the same reset idiom as `seed-notify`.
- **`auth-qa` Phase 5 section** (real API, no browser): sources CRUD + role guards; findings create/dedupe/refresh/409; queue filters/order; approve (apply + change_event + audit + official field changed on the target row); approve-without-apply; reject; idempotency (second decision → 409); viewer 403 on every mutation; `new_finding` notification appears for staff, disappears when the finding closes, and expires outside the 7-day window.
- **`route-qa` Phase 5 section** (browser + API asserts): `/intelligence` renders sources sorted by tier and the open queue; approve & apply updates the country (API assert `governmentType == parliamentary`) and moves the card to Approved with an Applied badge; bell shows the `new_finding` badge and deep-links to `/intelligence?focus`.

## Order of work (full detail in the plan)

DB (schema + `new_finding` kind + push) → OpenAPI + codegen (+ curated zod index, same codegen re-append gotcha as 4.4) + seed script → server lib + routes + reconcile branch + `auth-qa` → SPA page + nav + deep-link + `route-qa` → docs + final combined verification + push on user confirmation.

## Decisions for review

1. Findings are the single intake shape for manual + future automated ingestion (no separate "agent-only" type yet).
2. Approve may apply an allowlisted change to the official record; the reviewer explicitly chooses apply (checkbox-style, pre-checked when applicable). Reject never writes.
3. Decided findings are immutable through the app; corrections arrive as new findings.
4. Confidence is human-entered for now (no provenance → no auto-score); a future agent fills it.
5. Tiers come from the brief's source-type order and are snapshotted on the source (editable).
6. `new_finding` notifications reconcile from **open findings newer than 7 days**, all staff.