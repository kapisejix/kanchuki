# Local Discovery Engine

**Status:** 🔴 Not Built — orphan stub in `services/local-discovery-engine/`, not wired into any app.  
**Plan:** Phase 3 of `docs/marketing/IMPLEMENTATION-STATUS.md`  
**Date:** 2026-08-20

---

## What Exists (Unreachable)
- `services/local-discovery-engine/src/routes/near-me.ts` — Haversine distance calculation, bounding box geo-query
- `services/local-discovery-engine/src/local-discovery-engine.ts` — Standalone Fastify server on port 3002 (never deployed)

**None of this is reachable** — not in pnpm workspace, not referenced from `apps/api`.

## What Needs Building (Phase 3)

### Backend
- `apps/api/src/routes/public/near-me.ts` — Public geo-search endpoint
  - GET /v1/near-me?latitude=&longitude=&radius= — find nearby retailers
  - Uses Haversine formula + bounding box optimization (extract from orphan)
  - Retailers filtered by `is_suspended: false`, `deleted_at: null`

### Admin UI
- `apps/web/src/app/admin/discovery/page.tsx` — Map view, location management

## Business Logic to Extract
- `getBoundingBox(lat, lng, radiusKm)` → narrowing query for Prisma
- `haversineDistance(lat1, lon1, lat2, lon2)` → exact distance filter
- Retailer location query with `latitude`/`longitude` bounds

## ROI Metrics
- +15% footfall from local searches
- +10% sales from geo-targeted offers
- 30% increase in "near me" search impressions
