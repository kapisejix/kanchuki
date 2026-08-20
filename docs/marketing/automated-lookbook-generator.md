# Automated Lookbook Generator

**Status:** 🔴 Not Built — orphan stub in `services/lookbook-generator/`, not wired into any app.  
**Plan:** Phase 6 of `docs/marketing/IMPLEMENTATION-STATUS.md`  
**Date:** 2026-08-20

---

## What Exists (Unreachable)
- `services/lookbook-generator/src/lookbook-generator.ts` — Minimal HTML lookbook generation with basic product info. Standalone Fastify server.

**None of this is reachable** — not in pnpm workspace, not referenced from `apps/api`.

## What Needs Building (Phase 6)
- `apps/api/src/routes/growth/growth-lookbook.ts` — Select 3-5 products → generate coordinated lookbook
- `Lookbook` DB model (retailer_id, product_ids, output_url, format, created_at)
- `apps/mobile/app/growth/lookbook.tsx` — Retailer selects products, previews, exports

## ROI Metrics
- ₹150-250 AOV increase
- 1.5x cross-sell success rate
- 25% increase in average order value
