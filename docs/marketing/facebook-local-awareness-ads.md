# Facebook Local Awareness Ads

**Status:** 🔴 Not Built — orphan stub in `services/facebook-ads/`, not wired into any app. Blocked on Meta Marketing API access.  
**Plan:** Deferred until Meta Marketing API credentials are available.  
**Date:** 2026-08-20

---

## What Exists (Unreachable)
- `services/facebook-ads/src/facebook-ads.ts` — Standalone Fastify server with placeholder Meta API config (port 3007)

**None of this is reachable** — not in pnpm workspace, not referenced from `apps/api`.

## Blockers
- No Meta Marketing API credentials
- Requires Facebook Business Manager access

## What Needs Building (When API Access Available)
- Radius-based ad campaigns (5km/10km)
- A/B test creative (product vs. lifestyle)
- Budget pacing alerts
- Retailer dashboard for ad management

## ROI Metrics
- ₹15-20 CPL (vs. ₹40-50 for broad targeting)
- 10-15% sales lift from ad-driven footfall
- 30% lower CPL vs. broad targeting
