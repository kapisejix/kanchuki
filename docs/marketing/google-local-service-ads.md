# Google Local Service Ads

**Status:** 🔴 Not Built — orphan stub in `services/google-local-service-ads/`, not wired into any app. Blocked on Google Ads API access.  
**Plan:** Deferred until Google Ads API credentials are available. Lowest priority for clothing retailers.  
**Date:** 2026-08-20

---

## What Exists (Unreachable)
- `services/google-local-service-ads/src/google-local-service-ads.ts` — Standalone Fastify server with placeholder Google Ads API config

**None of this is reachable** — not in pnpm workspace, not referenced from `apps/api`.

## Blockers
- No Google Ads API credentials
- Niche feature for clothing retailers (more relevant for service businesses)

## What Needs Building (When API Access Available)
- Service-based ad management (e.g., "alteration services near me")
- Lead tracking & follow-up reminders
- SMS/email alerts for new leads

## ROI Metrics
- Medium impact for service add-ons
- Lead tracking for appointment booking
