# Sub-project 1 — Country Workspace Foundation — Design

**Date:** 28 August 2026
**Source:** `docs/implementation-plan.md` → Phase 2 item 1 & Phase 1 item 4
**Roadmap context:** Full Phase 2 is decomposed into three sub-projects, built in order:
1. **Country workspace foundation** (this spec)
2. Government directory (institutions, organizations, people, positions, office terms, org tree)
3. Global map (status colors, filters)

Each sub-project has its own spec → plan → implementation cycle.

## Objective

Give every country a first-class detail workspace. Expand the country record with the
fields the Sub-3 map filters need, and render a tabbed country page whose real sections
cover Overview, Contacts, Meetings, Agreements, Documents, and News (Government,
Organizations, Tasks, and Analytics render as placeholders until their owning sub-projects
or phases land).

Approved decisions (product owner, 28 Aug 2026):

- **Navigation:** top tabs across the 9 sections (matches the app's pill/nav idiom; revisit
  when org trees arrive in Sub 2).
- **Sections now:** Overview, Contacts, Meetings, Agreements, Documents, News are
  functional. Government, Organizations, Tasks, Analytics are empty-state placeholders.
- **Country fields:** six new nullable columns — `language`, `governmentType`, `electionYear`,
  `team`, `priority`, `strategy` — needed by the Sub-3 map filters and the Overview header.
- **Documents:** human-entered, each optionally linked to an agreement, with a lifecycle
  status (draft/review/approved/signed/archived).
- **News:** human-entered micro-news (title, source, url, summary, publishedAt).
- **API shape:** `GET /countries/:id` + `PATCH /countries/:id`; documents/news CRUD;
  `?countryId` filter on agreements (already present on contacts/meetings). The SPA composes
  sections client-side with the generated hooks.

## Architecture

```
countries (expanded) ─┬── contacts (countryId)
                      ├── meetings (countryId)
                      ├── agreements (countryId) ←── documents.agreementId (nullable)
                      ├── documents (countryId) ←── NEW
                      ├── news (countryId) ←── NEW
                      └── activity (countryId, audit rows)
```

- Follows the existing pattern: Drizzle schema in `lib/db/src/schema/`, handlers in
  `artifacts/api-server/src/routes/` mounted via `routes/index.ts`, OpenAPI spec →
  `lib/api-spec/openapi.yaml` → codegen (zod + react hooks), SPA in
  `artifacts/global-dr-platform/src/`.
- Audit integration reuses `writeAudit` (`artifacts/api-server/src/lib/audit.ts`) — every
  mutation writes an audit row; it never throws into the request path.

## Data model (`lib/db/src/schema/`)

### countries (extend)

Add nullable columns to `countriesTable` — all nullable so existing rows stay valid:

| column | type | notes |
| --- | --- | --- |
| `language` | text | primary official language, free text |
| `governmentType` | text | constrained: presidential republic, semi-presidential, parliamentary republic, parliamentary monarchy, constitutional monarchy, absolute monarchy, one-party state, transitional |
| `electionYear` | integer | next/current election year |
| `team` | text | assigned team/owner label, free text |
| `priority` | text | constrained: low, medium, high |
| `strategy` | text | free text for now; becomes configurable in Phase 3 |

`insertCountrySchema` gains the new fields and a new **`updateCountrySchema`** is created
(both driven by the OpenAPI payload schemas). `countryFields` select in `platform.ts`
includes the new fields. `governmentType` and `priority` are modeled as **OpenAPI enums** to
server-generated zod, so invalid values fail with `400` (the codebase's normal constraint
path).

### NEW documents

`id` serial PK · `countryId` int FK → countries not null · `title` text not null ·
`type` text not null (default `other`; enum: `mou`, `loi`, `agreement`, `proclamation`,
`report`, `official source`, `other`) · `url` text nullable · `datedOn` date nullable ·
`notes` text nullable · `agreementId` int FK → agreements (nullable, `onDelete: set null`) ·
`status` text not null (default `draft`; enum: `draft`, `review`, `approved`, `signed`,
`archived`) · `createdAt` timestamptz default now.

### NEW news

`id` serial PK · `countryId` int FK → countries not null · `title` text not null ·
`source` text not null · `url` text nullable · `summary` text nullable ·
`publishedAt` timestamptz not null · `createdAt` timestamptz default now.

## API

All under the existing session + write-role middleware. Writes are gated to non-viewer
roles (consistent with current handlers).

| route | op | notes |
| --- | --- | --- |
| `GET /api/countries/:id` | `getCountry` | 404 when missing; returns full Country incl. new fields **and the `contactsCount`/`meetingsCount` the Country schema requires** (same computation as the list route) |
| `PATCH /api/countries/:id` | `updateCountry` | 404 when missing; partial update of expanded fields; returns the updated full `Country` — **including `contactsCount`/`meetingsCount`, same computation as getCountry**; audit `update`/country, diff of changed keys |
| `GET /api/activity` | `listActivity` | **gains optional `countryId` query** (currently no params, returns last 12 globally) — needed for the Overview tab's per-country recent activity; regenerated hook becomes `useListActivity({countryId})` |
| `GET /api/documents` | `listDocuments` | query: `countryId` **optional — when absent lists all** (consistent with contacts/meetings), plus `type`, `status`, `agreementId`, `limit`; rows join agreement name for the "agreement link" label |
| `POST /api/documents` | `createDocument` | validates agreementId exists (400 if unknown); audit `create`/document, after: {id, title, type, status} |
| `PATCH /api/documents/:id` | `updateDocument` | 404 when missing; diff allowlist {title, type, url, datedOn, notes, agreementId, status}; audit `update` |
| `DELETE /api/documents/:id` | `deleteDocument` | audit `action: "delete"` (entity rows are removed but the activity row keeps entityId/title); returns `200 { id }`, same shared `DeleteResponse` schema as news |
| `GET /api/news` | `listNews` | query: `countryId` (optional), `limit` |
| `POST /api/news` | `createNews` | audit `create`/news, after: {id, title, source} |
| `PATCH /api/news/:id` | `updateNews` | 404 when missing; diff allowlist {title, source, url, summary, publishedAt}; audit `update` |
| `DELETE /api/news/:id` | `deleteNews` | audit `action: "delete"`; returns `200 { id }`, same shared `DeleteResponse` schema |

All document/news **audit writes** pass **`countryId`** to `writeAudit` so the test sweep (and
country-level audit filtering) can find them.

- `GET /api/agreements` gains optional `countryId` query filter (mirrors contacts/meetings).
- `AuditEntityType` (in `artifacts/api-server/src/lib/audit.ts`) gains **`document`** and
  **`news`**; `AuditAction` gains **`delete`** alongside the current `create | update | read`.
  The `activity.action` column is free text and the generated `AuditEntry.action` is
  `string`, so `delete` rows list/filter with no further changes
  (`GET /api/audit?action=delete` works out of the box).
- OpenAPI: extend `Country` component and its create/update payloads — **all six new
  fields nullable/optional so existing `POST /api/countries` (name, code, region) still
  parses**; model `governmentType`/`priority` as enums; add `Document`, `DocumentInput`,
  `DocumentUpdate`, `News`, `NewsInput`, `NewsUpdate` schemas; add
  `listDocuments`/`createDocument`/`updateDocument`/`deleteDocument` and
  `listNews`/`createNews`/`updateNews`/`deleteNews` tags/paths; `getCountry`/`updateCountry`;
  extend `listActivity` params with `countryId`; add the `countryId` param to
  `listAgreements`.
- Regenerate `lib/api-zod` and `lib/api-client-react` (same codegen loop as Task #3/A.4).

## SPA (`artifacts/global-dr-platform/src/`)

- Country list rows become links to `/countries/:id` (`link-country-row-${id}`).
- New route `countries.$countryId.tsx` hosting **`CountryDetailPage`**:
  - **Header:** country name, status + priority pills, region · government type ·
    election year · team · language · risk level; inline **"Edit details"** form (PATCH)
    for the six new fields (`button-country-edit`, `country-field-language` …).
  - **Top tabs** (`country-tab-overview` …), nine sections. Functional now:
    - **Overview** — KPI cards (contacts, meetings, **active agreements = status `!= archived`**,
      next upcoming meeting), recent country activity (filtered `useListActivity` via the
      new `countryId` param), and quick links into the other tabs (`kpi-contacts-count`,
      `kpi-meetings-count`, `kpi-active-agreements`, `kpi-next-meeting`).
    - **Contacts / Meetings / Agreements** — existing lists filtered by `countryId`
      (`useListContacts({countryId})`, etc.), sharing the existing inline add/edit idiom.
    - **Documents** — list rows with type + status pills, agreement link, datedOn;
      inline add/edit form; delete. Testids `document-row-${id}`, `button-document-add`,
      `button-document-delete-${id}`.
    - **News** — list rows with source, publishedAt, summary; inline add/edit; delete.
      Testids `news-row-${id}`, `button-news-add`, `button-news-delete-${id}`.
  - **Placeholders now:** Government, Organizations (Sub 2), Tasks (Phase 4), Analytics
    (Phase 6) — render the existing EmptyState with a one-line "why it's coming later" note.
- Tabs are client-side state; each tab queries its own data (parallel generated hooks),
  so no section payload is fetched until the tab is opened.

## Error handling

- `GET /countries/:id` missing → `404` with a JSON message; SPA shows the ErrorState.
- Zod failures → `400`; unknown `agreementId` on document create/update → `400`.
- Delete of a document referenced nowhere else is safe (only `activity` rows reference it
  by id, and those are appended not verified).

## Testing

### auth-qa (`scripts/src/auth-qa.ts`)
- After the existing flows: as admin, `POST /api/documents` and `POST /api/news` for the
  disposable country → `201`; assert `create`/`document` and `create`/`news` audit rows
  with actor id.
- `PATCH /api/countries/:id` (disposable country, e.g. set `priority: high`) → `200`;
  assert an `update`/`country` audit row whose `after.priority === "high"`.
- Viewer `POST /api/documents` → `403`.
- `GET /api/documents?countryId=` and `GET /api/news?countryId=` return exactly the
  created rows (`length === 1`, asserting no cross-country contamination);
  `GET /api/activity?countryId=` returns their rows.
- Cleanup: **delete document + news rows for the disposable country first, then the
  editable country row (their `countryId` FKs are non-null, no cascade, so order
  matters)**; audit rows are append-only and never cascade — **the suite's existing
  `DELETE FROM activity WHERE country_id = ?` sweep removes every audit row referencing
  the disposable country (including document/news/country-update rows, since all carry
  `countryId`)**; residual check expects 0.

### route-qa (`scripts/src/route-qa.ts`)
- demo + real-auth: from the countries list, click a country row → detail page; assert
  header + Overview tab KPIs render; open Documents and News tabs and assert empty-state /
  list render; save an "Edit details" change and assert it persists. Include an
  unauthenticated `GET /api/countries/:id` → `401` check in auth-qa.

### Per commit
- `bun run --filter @workspace/db push` (needs `DATABASE_URL`)
- `bun run typecheck:libs` + `bun run --filter @workspace/api-spec codegen`
- `bun run typecheck` + `bun run build`
- `auth-qa` (expect ALL PASS) + demo/real-auth `route-qa`

## Out of scope (deliberately)

- Government/Organizations sections and all institution/person/position entities → Sub 2.
- Global map and its filters → Sub 3.
- Tasks table and deliverables → Phase 4.
- Chart analytics, executive reports → Phase 6.
- News ingestion, source provenance, confidence scores → Phase 5.
- Configurable DR strategies (country `strategy` stays free text) → Phase 3.
- Position-change notification triggers → Phase 4.