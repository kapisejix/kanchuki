# F-001e Ghost-Mannequin AI Generation — PENDING (P2)
> Extracted 2026-09-23 from `docs/PRO-REQUIREMENTS.md` (lines 182–203). Pending — not built.

**Status:** Planned (not built) — job + Snappyit client scaffolded (`apps/api/src/jobs/ghost-mannequin.ts`, `packages/ai/src/snappyit.ts`) but the worker is paused as of 2026-08-02 (consolidated-cron change, `8b7a5be`) — not functional. Snappyit itself later confirmed to have no public API at all — see `docs/photo-feature/ghost-mannequin-research.md`. A local LaMa-inpainting version of the hollow-gap-fill step now exists and works (`scripts/batch-clean-photos.py --ghost-mannequin`, commit `0c66a7f`), reachable today only from the admin photo-cleanup **test tool** (`apps/web/src/app/admin/photo-cleanup-test`) — it is NOT wired into this retailer-facing flow (steps 1–4 below), which stays not-built.
**Priority:** P2 (nice-to-have, not MVP-blocking)
**Vendor:** Snappyit API (evaluated 2026-07-25 vs WearView/bitStudio/Scenario — Snappyit chosen for confirmed public API + lowest cost; WearView/Scenario had no confirmed public developer API at eval time)

**Problem:** Many retailers stock packed/plastic-wrapped suits and don't want to unpack per unit just to catalog. Ghost-mannequin AI can't work off a packed/wrapped photo directly — garment shape, print, and collar must be visible in source image. Needs a one-time unpack per SKU/design, not per unit.

**Flow:**
1. Retailer unpacks once per new design, lays flat or hangs it, takes one photo (reuses existing F-001 capture UI).
2. Photo sent to Snappyit ghost-mannequin API → returns hollow-body catalog image (full worn look, no visible mannequin/hanger).
3. Catalog image reused for every restocked unit of the same design — no reshoot on restock.
4. API key stored via existing F-012 encrypted-integration-settings mechanism (`/admin/integrations`), not hardcoded.

**Cost (researched 2026-07-25):** Snappyit pay-per-image, ~$0.10/image, plans from $6.90–8.20/mo. At MVP scale (≥50 img/retailer/mo × 50 retailers) roughly $250/mo total — cheap vs manual ghost-mannequin editing ($3–5/img). No confirmed INR billing — factor forex into F-010 quota/plan-limit math, same treatment as WhatsApp/VTO pass-through costs.

**Acceptance Criteria (draft, refine at build time):**
- Retailer can flag a product "packed, unpack later" on capture
- Ghost-mannequin generation runs as async job (reuse existing AI-tagging job queue pattern); retailer notified when catalog image ready
- Falls back to plain photo if API fails/quota exceeded — never blocks product save

---


Research: `docs/ai-studio/ghost-mannequin-research.md`.
