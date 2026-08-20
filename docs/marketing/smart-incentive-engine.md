# Smart Incentive Engine

**Status:** 🔴 Not Built — orphan stub in `services/incentive-engine/`, not wired into any app.  
**Plan:** Phase 1 of `docs/marketing/IMPLEMENTATION-STATUS.md`  
**Date:** 2026-08-20

---

## What Exists (Unreachable)
- `services/incentive-engine/src/routes/incentive-rules.ts` — IncentiveRule CRUD (Prisma queries, validation, soft-delete)
- `services/incentive-engine/src/routes/visits.ts` — CustomerVisit tracking
- `services/incentive-engine/src/incentive-engine.ts` — Standalone Fastify server on port 3001 (never deployed)

**None of this is reachable** — not in pnpm workspace, not referenced from `apps/api`.

## What Needs Building (Phase 1)

### Backend
- `apps/api/src/routes/growth/growth-incentives.ts` — Fold incentive-engine CRUD logic into existing growth routes pattern
  - POST /growth/incentives/rules — create incentive rule
  - GET /growth/incentives/rules — list rules
  - PUT /growth/incentives/rules/:id — update rule
  - DELETE /growth/incentives/rules/:id — soft-delete
  - POST /growth/incentives/check — evaluate applicable incentives for customer
  - POST /growth/incentives/visits — record customer visit

### Admin UI
- `apps/web/src/app/admin/incentives/page.tsx` — Rules list, create/edit, analytics

### Mobile UI
- `apps/mobile/app/growth/incentives.tsx` — Retailer manages rules, views stats

### Schema
- `IncentiveRule` model in `packages/db/prisma/schema.prisma`
- `CustomerVisit` model in `packages/db/prisma/schema.prisma`
- `INCETIVE_ENGINE` in `PlanFeatureKey` enum

## Business Logic to Extract
- Trigger evaluation: FIRST_VISIT (visitCount === 0), BIRTHDAY (needs customer DOB), LOYALTY_TIER (spend/visit thresholds)
- Discount application: PERCENT (capped at 100) or FIXED_AMOUNT (capped at subtotal)
- Date range validation: starts_at/ends_at overlap check

## ROI Metrics
- ₹200-300 avg. uplift per new customer
- 3x likelihood of second visit
- 35% increase in first-time visitor conversion
