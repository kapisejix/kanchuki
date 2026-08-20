# Google My Business Integration

**Status:** 🔴 Not Built — orphan stub in `services/gmb-sync/`, not wired into any app. Blocked on Google API access approval.  
**Plan:** Deferred until Google API access is approved (F-022 in CLAUDE.md).  
**Date:** 2026-08-20

---

## What Exists (Unreachable)
- `services/gmb-sync/src/gmb-sync.ts` — Standalone Fastify server with placeholder Google API config
- `services/gmb-sync/src/routes/gmb.ts` — Placeholder webhook and management routes

**None of this is reachable** — not in pnpm workspace, not referenced from `apps/api`.

## Blockers
- Google Business Profile API access approval required (unpredictable timeline)
- No real Google API credentials available
- F-022 in CLAUDE.md is marked "Planned (blocked on Google API access)"

## What Needs Building (When API Access Approved)
- Retailer OAuth-connects Google Business Profile
- Auto-post new arrivals via `localPosts.create`
- Review monitoring & response templates
- Q&A management

## ROI Metrics
- 25% higher footfall from Google Maps
- Improved local search ranking
- 40% increase in direction requests
