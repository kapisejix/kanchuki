# Automated Festival Background Library

**Status:** 🔴 Not Built — doc-only spec, no code exists. The IMPLEMENTATION-STATUS.md previously claimed this was part of `services/photo-cleanup/` but that's a different feature (mannequin removal).  
**Plan:** Phase 4 of `docs/marketing/IMPLEMENTATION-STATUS.md`  
**Date:** 2026-08-20

---

## What Exists
- `services/photo-cleanup/` — Mannequin removal + LaMa inpainting (different feature, not festival backgrounds)
- Existing `studio-shoot` FLUX pipeline (F-032) can generate backgrounds

## What Needs Building (Phase 4)
- `FestivalBackground` DB model (occasion, image_url, season, is_active, valid_from, valid_to)
- `FESTIVAL_BACKGROUNDS` in `PlanFeatureKey`
- `apps/api/src/routes/admin/admin-festival-backgrounds.ts` — CRUD + apply-to-product
- `apps/web/src/app/admin/festival-backgrounds/page.tsx` — Upload, preview, seasonal rotation

## ROI Metrics
- Diwali/Wedding season sales uplift of 20-30%
- Reduced dependency on photographers
- 70% faster seasonal campaign launch
