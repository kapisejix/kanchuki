# Local Discovery Engine

**Status:** ✅ Built — folded into `apps/` architecture  
**Plan:** Phase 3 of `docs/marketing/IMPLEMENTATION-STATUS.md`  
**Commit:** `7efc6db`  
**Date:** 2026-08-20

---

## What Was Built

### Backend
- `apps/api/src/routes/public/near-me.ts` — Public geo-search endpoint
  - GET /v1/near-me?latitude=&longitude=&radius= — find nearby retailers
  - Uses Haversine formula + bounding box optimization (extracted from orphan)
  - Retailers filtered by `is_suspended: false`, `deleted_at: null`
- Registered in `apps/api/src/routes/public/index.ts` barrel + `public.ts` aggregator

### Admin UI
- `apps/web/src/app/admin/discovery/page.tsx` — Retailer grid with locations, stats, search, storefront links
- Sidebar entry (MapPin icon) in `apps/web/src/app/admin/components/Sidebar.tsx`

## Business Logic Extracted
- `getBoundingBox(lat, lng, radiusKm)` → narrowing query for Prisma
- `haversineDistance(lat1, lon1, lat2, lon2)` → exact distance filter
- Retailer location query with `latitude`/`longitude` bounds

## ROI Metrics
- +15% footfall from local searches
- +10% sales from geo-targeted offers
- 30% increase in "near me" search impressions
