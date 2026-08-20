# Aggregator & Marketplace Sync

**Status:** 🔴 Not Built — 1-file orphan stub in `services/aggregator-sync/` with mock data. Not wired into any app.  
**Plan:** Phase 7 of `docs/marketing/IMPLEMENTATION-STATUS.md`  
**Date:** 2026-08-20

---

## What Exists (Unreachable)
- `services/aggregator-sync/src/aggregator-sync.ts` — Single file with mock API clients for Meesho, Instamojo, Glroad, Craftsvilla. All returning placeholder data. No real HTTP calls. Standalone Fastify server on its own port.

**None of this is reachable** — not in pnpm workspace, not referenced from `apps/api`.

## Blockers
- No real API credentials from Meesho/Instamojo/Glroad/Craftsvilla
- No evidence any pilot retailer sells on these channels yet

## What Needs Building (Phase 7)
- `apps/api/src/routes/retailers/retailers-aggregators.ts` — Channel adapter pattern
- `ChannelSync` DB model (retailer_id, channel, api_key_encrypted, sync_status, last_synced_at)
- `CHANNEL_SYNC` in `PlanFeatureKey`
- Admin UI for sync status + order aggregation
- Mobile UI for channel connection + order management

## ROI Metrics
- 5-10 hrs/week saved on manual inventory updates
- 15-20% sales increase from multi-channel presence
- Near-zero overselling incidents
