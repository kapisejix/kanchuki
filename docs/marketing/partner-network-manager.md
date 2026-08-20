# Partner Network Manager

**Status:** 🟡 Partial — API route exists at `apps/api/src/routes/retailers/retailers-partners/index.ts`, but schema.prisma has broken inline enum syntax blocking `npx prisma validate`. No admin UI, no mobile UI.  
**Plan:** Phase 0 (fix schema) + Phase 2 (build UI) of `docs/marketing/IMPLEMENTATION-STATUS.md`  
**Date:** 2026-08-20

---

## What Exists (Partially Reachable)
- `apps/api/src/routes/retailers/retailers-partners/index.ts` — Full CRUD:
  - GET /retailers/me/partners — list partners
  - POST /retailers/me/partners — create partner
  - PUT /retailers/me/partners/:id — update partner
  - DELETE /retailers/me/partners/:id — deactivate partner
  - GET /retailers/me/partners/:id/referrals — get partner referrals
  - POST /retailers/me/partners/referrals/:id/pay — mark commission as paid
  - GET /retailers/me/partners/events — list events
  - POST /retailers/me/partners/events — create event
  - PUT /retailers/me/partners/events/:id — update event
  - DELETE /retailers/me/partners/events/:id — delete event

**BLOCKED:** `schema.prisma` has `Partner.commission_type` and `PartnerReferral.status` as inline enums (invalid Prisma syntax). `npx prisma validate` fails. `PARTNER_NETWORK` is missing from `PlanFeatureKey` enum.

## What Needs Building

### Phase 0 (Prerequisite)
- Fix inline enums → proper Prisma enums (`PartnerType`, `CommissionType`, `PartnerReferralStatus`)
- Add `PARTNER_NETWORK` to `PlanFeatureKey`
- Create migration

### Phase 2 (UI)
- `apps/web/src/app/admin/partners/page.tsx` — Admin partner overview
- `apps/mobile/app/growth/partners.tsx` — Retailer partner management

## ROI Metrics
- ₹500-1000 avg. referral value
- 2x repeat rate from partner leads
- 25% reduction in CAC via referrals
