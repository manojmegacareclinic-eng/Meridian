# Phase 2 Design: Government, Organizations & Global Map

**Date:** 2026-08-29  
**Status:** Approved  
**Implementation Plan:** `docs/superpowers/plans/2026-08-29-phase2-implementation.md`

---

## Overview

Phase 2 completes the Country Workspaces foundation by making the Government and Organizations tabs functional and adding an interactive global map with filters. This builds on the country detail page (6 tabs delivered in Task #4) and adds the remaining 3 functional tabs + a new top-level Map route.

---

## 1. Government Tab — Ministry → Position → Term Hierarchy

### Data Model (3 new tables)

#### `ministries`
| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| country_id | integer | FK → countries.id, NOT NULL |
| name | text | NOT NULL |
| type | text | NOT NULL (e.g., "foreign", "finance", "defense", "interior") |
| created_at | timestamptz | NOT NULL DEFAULT now() |

#### `positions`
| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| ministry_id | integer | FK → ministries.id, NOT NULL |
| title | text | NOT NULL (e.g., "Minister", "Deputy Minister", "Permanent Secretary") |
| description | text | nullable |
| sort_order | integer | NOT NULL DEFAULT 0 |
| created_at | timestamptz | NOT NULL DEFAULT now() |

#### `office_terms`
| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| position_id | integer | FK → positions.id, NOT NULL |
| person_name | text | NOT NULL |
| person_email | text | nullable |
| person_phone | text | nullable |
| start_date | date | NOT NULL |
| end_date | date | nullable (NULL = current) |
| is_current | boolean | NOT NULL DEFAULT true |
| created_at | timestamptz | NOT NULL DEFAULT now() |

**Constraints:**
- Unique index on `office_terms(position_id, is_current) WHERE is_current = true` — ensures only one current holder per position
- `office_terms.end_date` NULL = current term; when a new term starts, previous term's `end_date` is set and `is_current` = false

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ministries?countryId=` | List ministries for a country |
| POST | `/api/ministries` | Create ministry (body: `{ countryId, name, type }`) |
| PATCH | `/api/ministries/:id` | Update ministry |
| DELETE | `/api/ministries/:id` | Delete ministry (cascades to positions/terms) |
| GET | `/api/ministries/:id/positions` | List positions in a ministry |
| POST | `/api/ministries/:id/positions` | Create position (body: `{ ministryId, title, description?, sortOrder? }`) |
| PATCH | `/api/positions/:id` | Update position |
| DELETE | `/api/positions/:id` | Delete position (cascades to terms) |
| GET | `/api/positions/:id/terms` | List office terms for a position (includes history) |
| POST | `/api/positions/:id/terms` | Create term (body: `{ positionId, personName, personEmail?, personPhone?, startDate, endDate? }`) — auto-sets `is_current`, updates previous term |
| PATCH | `/api/terms/:id` | Update term (allows changing end_date, which triggers `is_current` recalc) |
| DELETE | `/api/terms/:id` | Delete term |

### UI — Government Tab

- **Left panel**: Ministries list (accordion per ministry → positions list)
- **Right panel**: Position detail — shows current holder + full timeline of past terms (expandable)
- **Add Ministry** button (dialog)
- **Add Position** button per ministry (dialog)
- **Add Term** button per position (dialog) — pre-fills start_date = today
- Clicking a past term shows details; "Set as current" action available on past terms (closes current term, opens new one)

---

## 2. Organizations Tab — 7 Types, Country-Scoped

### Data Model (1 new table)

#### `organizations`
| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| country_id | integer | FK → countries.id, NOT NULL |
| name | text | NOT NULL |
| type | text | NOT NULL, enum: `ministry`, `embassy`, `city`, `university`, `ngo`, `party`, `religious` |
| address | text | nullable |
| website | text | nullable |
| notes | text | nullable |
| metadata | jsonb | nullable (type-specific fields) |
| created_at | timestamptz | NOT NULL DEFAULT now() |

**Type-specific `metadata` examples:**
- `embassy`: `{ diplomaticRank: "ambassador", sendingCountry: "USA" }`
- `university`: `{ accreditation: "regional", studentCount: 25000 }`
- `ngo`: `{ focusAreas: ["humanitarian", "health"], registrationNumber: "NGO-1234" }`
- `party`: `{ ideology: "center-right", seatsInParliament: 45 }`
- `religious`: `{ denomination: "catholic", adherentsEstimate: 1200000 }`
- `city`: `{ population: 500000, isCapital: true }`
- `ministry`: `{ portfolio: "foreign affairs", ministerPositionId: 42 }` (link to positions table)

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/organizations?countryId=&type=` | List orgs for a country (optional type filter) |
| POST | `/api/organizations` | Create org (body: `{ countryId, name, type, address?, website?, notes?, metadata? }`) |
| GET | `/api/organizations/:id` | Get single org |
| PATCH | `/api/organizations/:id` | Update org |
| DELETE | `/api/organizations/:id` | Delete org |

### UI — Organizations Tab

- **Filter bar**: Type dropdown (All + 7 types), search input
- **Table view**: Name, Type (badge), Address, Website (link), Actions
- **Add Organization** dialog — type selector first, then dynamic fields based on type (metadata fields shown conditionally)
- Row actions: Edit, Delete

---

## 3. Global Map — Leaflet + OpenStreetMap

### Frontend — `/map` route

**Dependencies:** `leaflet`, `react-leaflet`, `@types/leaflet`

**Components:**
- `MapPage` — top-level route at `/map`
- `WorldMap` — Leaflet map component
- `CountryLayer` — GeoJSON layer with country polygons
- `FilterSidebar` — slide-out panel (mobile: slide-out; desktop: fixed left sidebar, 320px)

**GeoJSON Source:** Static `public/world-countries.geojson` (simplified, ~50KB, properties: `iso_a2`, `name`, `region`)

**Visual encoding:**
- Fill color by selected metric:
  - `status` → categorical (leads=blue, scheduled=green, active=orange, agreement=purple, inactive=gray)
  - `riskLevel` → sequential (low=green, medium=yellow, high=red)
  - `priority` → categorical
  - `meetingStatus` → count of scheduled meetings (choropleth)
- Hover tooltip: country name, code, status, risk
- Click → navigate to `/country/$countryId`

**Filter Sidebar (slide-out panel):**
- Region multi-select
- Language multi-select
- Government type multi-select
- Election year range slider
- Team multi-select
- Priority multi-select
- Strategy text search
- Meeting status multi-select
- Color-by selector (dropdown: status/riskLevel/priority/meetingCount)
- "Reset filters" button

**Performance:**
- GeoJSON loaded once, filtered client-side for instant filter changes
- Memoized color scale computation
- Map viewport persists across filter changes

### Backend

No new endpoints needed. Map consumes:
- `GET /api/countries?search=&region=&status=` — existing endpoint with all filter params
- Frontend joins API data with GeoJSON by `code` (ISO A2) ↔ `countries.code`

---

## 4. Audit Integration

All new entities audited via existing `writeAudit`:

| Entity | entityType | Actions |
|--------|------------|---------|
| ministry | `ministry` | create, update, delete |
| position | `position` | create, update, delete |
| office_term | `office_term` | create, update, delete |
| organization | `organization` | create, update, delete |

Audit rows include `countryId` for proper cleanup and filtering.

---

## 5. Route Structure

| Route | Component | Purpose |
|-------|-----------|---------|
| `/country/$countryId` | `CountryDetailPage` | Existing — now with functional Government/Organizations tabs |
| `/map` | `MapPage` | New top-level route, added to nav |

**Nav update:** Add "Global Map" link in sidebar between "Audit" and "Settings".

---

## 6. File Structure

### New Files
```
lib/db/src/schema/
  ministries.ts
  positions.ts
  office_terms.ts
  organizations.ts

artifacts/api-server/src/routes/
  ministries.ts
  positions.ts
  office_terms.ts
  organizations.ts

artifacts/global-dr-platform/src/
  routes/map.tsx
  components/
    GovernmentTab.tsx
    OrganizationsTab.tsx
    MapPage.tsx
    WorldMap.tsx
    CountryLayer.tsx
    FilterSidebar.tsx
```

### Modified Files
```
lib/db/src/schema/index.ts                    # export new schemas
lib/api-spec/openapi.yaml                     # new paths + schemas
artifacts/api-server/src/routes/index.ts      # mount new routers
artifacts/api-server/src/lib/audit.ts         # new entityTypes
artifacts/global-dr-platform/src/App.tsx      # add MapPage, import GovernmentTab/OrganizationsTab
artifacts/global-dr-platform/src/routes/      # add map.tsx
```

---

## 7. Verification Commands

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

## 8. Acceptance Criteria

- [ ] Government tab: ministry accordion → positions → terms timeline (past + current)
- [ ] Government tab: add/edit/delete ministry, position, term
- [ ] Organizations tab: filterable table by type, add/edit/delete with type-specific metadata fields
- [ ] Global Map route accessible from nav, shows colored countries, filters work
- [ ] Clicking country on map navigates to country detail
- [ ] All new CRUD audited (verify via `/api/audit?entityType=ministry` etc.)
- [ ] `bun run typecheck` clean
- [ ] `bun run build` clean
- [ ] `auth-qa` 43/43 PASS (existing + new assertions for new entities)
- [ ] `route-qa` demo mode PASS (includes map route + gov/org tab checks)