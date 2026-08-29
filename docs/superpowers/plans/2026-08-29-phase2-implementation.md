# Phase 2 Implementation Plan: Government, Organizations & Global Map

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Phase 2 by making Government and Organizations tabs functional and adding an interactive global map with filters.

**Architecture:** Three independent subsystems (Government hierarchy, Organizations, Global Map) sharing existing audit/auth patterns. Each subsystem: DB schema → API routes → SPA components. Map uses Leaflet + GeoJSON with client-side filtering.

**Tech Stack:** Drizzle ORM, Express 5, TanStack Router, React 19, Leaflet + react-leaflet, existing OpenAPI/Orval codegen, existing auth/audit infrastructure.

---

## File Structure Map

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
lib/db/src/schema/index.ts
lib/api-spec/openapi.yaml
artifacts/api-server/src/routes/index.ts
artifacts/api-server/src/lib/audit.ts
artifacts/global-dr-platform/src/App.tsx
artifacts/global-dr-platform/src/routes/__root.tsx (nav)
```

---

## Chunk 1: Database Schemas & Audit Unions

### Task 1.1: Create `lib/db/src/schema/ministries.ts`
- [ ] Write schema per spec (id, country_id FK, name, type, created_at)
- [ ] Export `ministriesTable`, `insertMinistrySchema`, `Ministry` type
- [ ] Run `bun run typecheck` to verify

### Task 1.2: Create `lib/db/src/schema/positions.ts`
- [ ] Write schema per spec (id, ministry_id FK, title, description, sort_order, created_at)
- [ ] Export `positionsTable`, `insertPositionSchema`, `Position` type

### Task 1.3: Create `lib/db/src/schema/office_terms.ts`
- [ ] Write schema per spec (id, position_id FK, person_name, person_email, person_phone, start_date, end_date, is_current, created_at)
- [ ] Add unique partial index: `UNIQUE (position_id) WHERE is_current = true`
- [ ] Export `officeTermsTable`, `insertOfficeTermSchema`, `OfficeTerm` type

### Task 1.4: Create `lib/db/src/schema/organizations.ts`
- [ ] Write schema per spec (id, country_id FK, name, type enum, address, website, notes, metadata jsonb, created_at)
- [ ] Type enum: `ministry`, `embassy`, `city`, `university`, `ngo`, `party`, `religious`
- [ ] Export `organizationsTable`, `insertOrganizationSchema`, `Organization` type

### Task 1.5: Update `lib/db/src/schema/index.ts`
- [ ] Add exports for all 4 new schema modules

### Task 1.6: Update `artifacts/api-server/src/lib/audit.ts`
- [ ] Add `"ministry"`, `"position"`, `"office_term"`, `"organization"` to `AuditEntityType` union

### Task 1.7: Push DB & verify
```bash
DATABASE_URL="postgresql://localhost:5432/meridian" bun run --filter @workspace/db push
bun run typecheck
```
- [ ] Expected: 4 new tables created, typecheck clean

### Task 1.8: Commit
```bash
git add lib/db/src/schema/ministries.ts lib/db/src/schema/positions.ts lib/db/src/schema/office_terms.ts lib/db/src/schema/organizations.ts lib/db/src/schema/index.ts artifacts/api-server/src/lib/audit.ts
git commit -m "feat(db): ministries, positions, office_terms, organizations tables; audit unions"
```

---

## Chunk 2: OpenAPI Contract & Codegen

### Task 2.1: Update `lib/api-spec/openapi.yaml`
- [ ] Add tags: `ministries`, `positions`, `office_terms`, `organizations`
- [ ] Add schemas: `Ministry`, `MinistryInput`, `MinistryUpdate`, `Position`, `PositionInput`, `PositionUpdate`, `OfficeTerm`, `OfficeTermInput`, `OfficeTermUpdate`, `Organization`, `OrganizationInput`, `OrganizationUpdate`
- [ ] Add paths:
  - `/ministries` (GET list, POST create)
  - `/ministries/{id}` (PATCH, DELETE)
  - `/ministries/{id}/positions` (GET, POST)
  - `/positions/{id}` (PATCH, DELETE)
  - `/positions/{id}/terms` (GET, POST)
  - `/terms/{id}` (PATCH, DELETE)
  - `/organizations` (GET, POST)
  - `/organizations/{id}` (GET, PATCH, DELETE)
- [ ] Run codegen: `bun run --filter @workspace/api-spec codegen`
- [ ] Run `bun run typecheck:libs`

### Task 2.2: Commit
```bash
git add lib/api-spec/openapi.yaml lib/api-client-react/src/generated lib/api-zod/src/generated
git commit -m "feat(api): openapi contract for ministries, positions, office_terms, organizations"
```

---

## Chunk 3: API Route Handlers

### Task 3.1: Create `artifacts/api-server/src/routes/ministries.ts`
- [ ] GET `/ministries?countryId=` — list with countryId filter
- [ ] POST `/ministries` — create, verify country exists
- [ ] PATCH `/ministries/:id` — update
- [ ] DELETE `/ministries/:id` — delete (cascade handled by DB FK)
- [ ] All write ops call `writeAudit` with entityType `ministry`

### Task 3.2: Create `artifacts/api-server/src/routes/positions.ts`
- [ ] GET `/ministries/:id/positions` — list positions for ministry
- [ ] POST `/ministries/:id/positions` — create position
- [ ] PATCH `/positions/:id` — update
- [ ] DELETE `/positions/:id` — delete
- [ ] All write ops call `writeAudit` with entityType `position`

### Task 3.3: Create `artifacts/api-server/src/routes/office_terms.ts`
- [ ] GET `/positions/:id/terms` — list terms for position (ordered by start_date desc)
- [ ] POST `/positions/:id/terms` — create term:
  - Set `is_current = true`
  - Update previous current term: `end_date = newTerm.start_date - 1 day`, `is_current = false`
- [ ] PATCH `/terms/:id` — update term; if `end_date` set, `is_current = false`; if `end_date` cleared, `is_current = true` (and close any other current term for same position)
- [ ] DELETE `/terms/:id` — delete
- [ ] All write ops call `writeAudit` with entityType `office_term`

### Task 3.4: Create `artifacts/api-server/src/routes/organizations.ts`
- [ ] GET `/organizations?countryId=&type=` — filterable list
- [ ] POST `/organizations` — create, verify country exists
- [ ] GET `/organizations/:id` — single org
- [ ] PATCH `/organizations/:id` — update
- [ ] DELETE `/organizations/:id` — delete
- [ ] All write ops call `writeAudit` with entityType `organization`

### Task 3.5: Update `artifacts/api-server/src/routes/index.ts`
- [ ] Import all 4 new routers
- [ ] Mount after `platformRouter`: `router.use(ministriesRouter); router.use(positionsRouter); router.use(officeTermsRouter); router.use(organizationsRouter);`

### Task 3.6: Verify & commit
```bash
bun run typecheck
```
```bash
git add artifacts/api-server/src/routes/ministries.ts artifacts/api-server/src/routes/positions.ts artifacts/api-server/src/routes/office_terms.ts artifacts/api-server/src/routes/organizations.ts artifacts/api-server/src/routes/index.ts
git commit -m "feat(api): ministries, positions, office_terms, organizations endpoints"
```

---

## Chunk 4: SPA — Government Tab Component

### Task 4.1: Create `artifacts/global-dr-platform/src/components/GovernmentTab.tsx`
- [ ] Accept `countryId: number` prop
- [ ] Fetch: `useListMinistries({ countryId })` → ministries with nested positions/terms
- [ ] UI: Ministries accordion → positions list → terms timeline
- [ ] State: expanded ministries, selected position for detail
- [ ] Add Ministry dialog
- [ ] Add Position dialog (per ministry)
- [ ] Add Term dialog (per position) — pre-fills start_date = today
- [ ] Position detail panel: current holder + past terms timeline
- [ ] "Set as current" action on past terms
- [ ] Mutations: `useCreateMinistry`, `useUpdateMinistry`, `useDeleteMinistry`, `useCreatePosition`, `useUpdatePosition`, `useDeletePosition`, `useCreateOfficeTerm`, `useUpdateOfficeTerm`, `useDeleteOfficeTerm`
- [ ] Query invalidation on mutations

### Task 4.2: Update `artifacts/global-dr-platform/src/App.tsx`
- [ ] Import `GovernmentTab`
- [ ] Replace placeholder in `CountryDetailPage` for `activeTab === 'government'` with `<GovernmentTab countryId={id} />`

### Task 4.3: Verify & commit
```bash
bun run typecheck
bun run build
```
```bash
git add artifacts/global-dr-platform/src/components/GovernmentTab.tsx artifacts/global-dr-platform/src/App.tsx
git commit -m "feat(spa): Government tab with ministry/position/term hierarchy"
```

---

## Chunk 5: SPA — Organizations Tab Component

### Task 5.1: Create `artifacts/global-dr-platform/src/components/OrganizationsTab.tsx`
- [ ] Accept `countryId: number` prop
- [ ] Fetch: `useListOrganizations({ countryId, type })`
- [ ] State: `selectedType` filter, `search` filter
- [ ] UI: Filter bar (type dropdown + search), table (Name, Type badge, Address, Website, Actions)
- [ ] Add Organization dialog — type selector first, then dynamic metadata fields
- [ ] Type-specific metadata fields (conditional render):
  - embassy: `diplomaticRank`, `sendingCountry`
  - university: `accreditation`, `studentCount`
  - ngo: `focusAreas` (multi-select), `registrationNumber`
  - party: `ideology`, `seatsInParliament`
  - religious: `denomination`, `adherentsEstimate`
  - city: `population`, `isCapital`
  - ministry: `portfolio`, `ministerPositionId` (select from positions)
- [ ] Mutations: `useCreateOrganization`, `useUpdateOrganization`, `useDeleteOrganization`
- [ ] Query invalidation

### Task 5.2: Update `artifacts/global-dr-platform/src/App.tsx`
- [ ] Import `OrganizationsTab`
- [ ] Replace placeholder for `activeTab === 'organizations'` with `<OrganizationsTab countryId={id} />`

### Task 5.3: Verify & commit
```bash
bun run typecheck
bun run build
```
```bash
git add artifacts/global-dr-platform/src/components/OrganizationsTab.tsx artifacts/global-dr-platform/src/App.tsx
git commit -m "feat(spa): Organizations tab with 7 types and metadata"
```

---

## Chunk 6: SPA — Global Map

### Task 6.1: Install Leaflet dependencies
```bash
bun add -w leaflet react-leaflet @types/leaflet
```

### Task 6.2: Add GeoJSON file
- [ ] Download simplified world countries GeoJSON (Natural Earth 1:110m, ~50KB)
- [ ] Save as `artifacts/global-dr-platform/public/world-countries.geojson`
- [ ] Properties needed: `iso_a2` (ISO A2 code), `name`, `region`

### Task 6.3: Create `artifacts/global-dr-platform/src/components/FilterSidebar.tsx`
- [ ] Props: `filters`, `onFilterChange`, `colorBy`, `onColorByChange`, `isOpen`, `onClose`
- [ ] Filter controls:
  - Region: multi-select checkboxes
  - Language: multi-select
  - Government type: multi-select
  - Election year: range slider (min/max from data)
  - Team: multi-select
  - Priority: multi-select
  - Strategy: text search
  - Meeting status: multi-select
  - Color-by: dropdown (status, riskLevel, priority, meetingCount)
- [ ] Reset filters button
- [ ] Slide-out animation (CSS)

### Task 6.4: Create `artifacts/global-dr-platform/src/components/CountryLayer.tsx`
- [ ] Props: `geojson`, `countries` (API data), `colorBy`, `onClick`
- [ ] Join API data by `country.code` === `feature.properties.iso_a2`
- [ ] Style function: color by selected metric
- [ ] Hover highlight + tooltip
- [ ] Click handler → navigate

### Task 6.5: Create `artifacts/global-dr-platform/src/components/WorldMap.tsx`
- [ ] Props: `countries`, `filters`, `colorBy`, `onFilterChange`, `onColorByChange`, `onCountryClick`
- [ ] Leaflet MapContainer with OSM tiles
- [ ] Renders `CountryLayer`
- [ ] Renders `FilterSidebar`

### Task 6.6: Create `artifacts/global-dr-platform/src/components/MapPage.tsx`
- [ ] Fetch: `useListCountries({ ...filters })`
- [ ] State: `filters`, `colorBy`, `sidebarOpen`
- [ ] Derived: filtered countries for map layer
- [ ] Renders `WorldMap`

### Task 6.7: Create `artifacts/global-dr-platform/src/routes/map.tsx`
```tsx
import { createFileRoute } from '@tanstack/react-router';
import { MapPage } from '@/components/MapPage';

export const Route = createFileRoute('/map')({
  component: MapPage,
});
```

### Task 6.8: Update nav in `artifacts/global-dr-platform/src/routes/__root.tsx`
- [ ] Add "Global Map" nav link between Audit and Settings
- [ ] Icon: `Globe2` from lucide-react

### Task 6.9: Update `artifacts/global-dr-platform/src/App.tsx`
- [ ] Export `MapPage` (or import from components)
- [ ] Add to imports

### Task 6.10: Regenerate route tree
```bash
bun run --filter @workspace/global-dr-platform routes
```

### Task 6.11: Verify & commit
```bash
bun run typecheck
bun run build
```
```bash
git add artifacts/global-dr-platform/public/world-countries.geojson artifacts/global-dr-platform/src/components/FilterSidebar.tsx artifacts/global-dr-platform/src/components/CountryLayer.tsx artifacts/global-dr-platform/src/components/WorldMap.tsx artifacts/global-dr-platform/src/components/MapPage.tsx artifacts/global-dr-platform/src/routes/map.tsx artifacts/global-dr-platform/src/routes/__root.tsx artifacts/global-dr-platform/src/routeTree.gen.ts artifacts/global-dr-platform/src/App.tsx
git commit -m "feat(spa): Global Map route with Leaflet, filters, country navigation"
```

---

## Chunk 7: auth-qa & route-qa Extensions

### Task 7.1: Extend `scripts/src/auth-qa.ts`
- [ ] Add assertions for ministries CRUD (create, read, update, delete)
- [ ] Add assertions for positions CRUD
- [ ] Add assertions for office_terms CRUD (including is_current logic)
- [ ] Add assertions for organizations CRUD with metadata
- [ ] Add audit assertions for new entityTypes
- [ ] Add cleanup for new entity types (reverse FK order: terms → positions → ministries → organizations)
- [ ] Run to verify: `DATABASE_URL=... bun run --filter @workspace/scripts auth-qa`

### Task 7.2: Extend `scripts/src/route-qa.ts`
- [ ] Add map route check in demo mode (nav to `/map`, verify map renders)
- [ ] Add Government tab check (click tab, verify accordion renders)
- [ ] Add Organizations tab check (click tab, verify table renders)
- [ ] Run demo mode: `bun run --filter @workspace/scripts route-qa`

### Task 7.3: Commit
```bash
git add scripts/src/auth-qa.ts scripts/src/route-qa.ts
git commit -m "test: auth-qa and route-qa coverage for Phase 2 entities"
```

---

## Chunk 8: Final Verification & Docs

### Task 8.1: Full verification suite
```bash
bun run typecheck
bun run build
DATABASE_URL="postgresql://localhost:5432/meridian" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" AUTH_PASSTHROUGH="false" PORT=3000 bun run --filter @workspace/scripts auth-qa
bun run --filter @workspace/scripts route-qa
```

### Task 8.2: Update `docs/implementation-plan.md`
- [ ] Mark Phase 2 items as DONE where delivered
- [ ] Update status headers

### Task 8.3: Commit docs
```bash
git add docs/implementation-plan.md docs/superpowers/plans/2026-08-29-phase2-implementation.md
git commit -m "docs: update implementation plan for Phase 2 completion"
```

### Task 8.4: Push
```bash
git push origin main
```

---

## Notes for Implementer

- **TDD approach:** Write failing tests/assertions first where practical (auth-qa is assertion-based)
- **Codegen naming:** Use the exact zod schema names from `lib/api-zod/src/generated/` after codegen
- **Audit pattern:** Follow existing `writeAudit` calls in `platform.ts` exactly
- **Hooks rules:** All list queries at component top level (not conditional) to avoid hooks order issues
- **Route tree:** Always run `bun run --filter @workspace/global-dr-platform routes` after adding routes
- **Leaflet CSS:** Import `leaflet/dist/leaflet.css` in `MapPage.tsx` or global CSS
- **GeoJSON join:** Match `country.code` (e.g., "USA") to `feature.properties.iso_a2` — verify codes align

---

*Plan complete. Ready to execute?*