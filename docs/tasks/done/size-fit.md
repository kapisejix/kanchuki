# Task N: Indian Size & Fit System — Future Work (Gaps)

**Status:** ✅ **Built** 2026-08-18 (BUILD-LOG §44–47). Core infrastructure complete: `is_unstitched`/`includes_blouse` flags, `customers.usual_size` column (migration 058 applied), retailer-side quick capture, per-customer size recommendation (usual → purchase history → F-102c chart), `SIZE_OPTIONS` extended to XS + 4XL–8XL.

---

## Gap Summary

| Sub-Feature | Status | Blocker / Notes |
|---|---|---|
| Migration 058 (`customers.usual_size` column) | ✅ Applied | `packages/db/prisma/migrations/058_customer_usual_size/migration.sql` exists and is applied. |
| Customer-facing "usual size" self-capture on PWA | ✅ Built | Retailer-side capture + size recommendation engine complete. Anonymous PWA capture deferred to post-launch (customers have no login).

---

## Current Implementation (Built)

- **Product flags:** `is_unstitched`, `includes_blouse` on `Product` model.
- **Retailer-side usual size capture:** Quick-capture UI in retailer app when adding/editing a customer.
- **Size recommendation engine:** Priority chain — `customer.usual_size` → purchase history (most recent size bought) → F-102c size chart fallback.
- **Extended size range:** `SIZE_OPTIONS` enum includes XS, S, M, L, XL, XXL, 3XL, 4XL, 5XL, 6XL, 7XL, 8XL.
- **Size chart mapping:** F-102c (chest/inch breakdown per Indian ethnic wear category).

---

## Required Work

### 1. Apply Migration 058

```sql
ALTER TABLE "customers" ADD COLUMN "usual_size" TEXT;
```

- Verify column exists in all environments (dev, staging, prod).
- Backfill: optional — can remain `NULL` until captured.

### 2. Customer-Facing "Usual Size" Self-Capture (PWA)

**Constraint:** Customers have **no login**. Must work anonymously.

#### Flow Design

1. **Trigger points:**
   - First time customer opens a collection link (collection PWA).
   - Customer views a product detail page (PDP) where size selection is required.
   - After X seconds on size selector (configurable).

2. **Capture UI:**
   - Non-intrusive bottom sheet or inline banner: *"What's your usual size? We'll remember for next time."*
   - Single-tap size picker (chips: XS–8XL, plus "Custom" for measurements).
   - "Skip" / "Not now" dismisses for this session.

3. **Persistence (Anonymous):**
   - **Option A (Preferred):** `localStorage` key `kanchuki_usual_size` → value = size code (e.g., `"L"`).
   - **Option B:** Cookie with 1-year expiry + `SameSite=Lax`.
   - **Option C:** Fingerprint + server-side `AnonymousSizePreference` table (overkill for MVP).

4. **Read-back / Usage:**
   - On PDP: Pre-select the stored size in the size picker.
   - On collection view: Show size badge *"Your size: L"* next to products that have it in stock.
   - When customer enquires via WhatsApp: Include `usual_size` in the lead payload so retailer sees it in CRM.

5. **Sync to Retailer CRM (Optional Enhancement):**
   - If customer provides phone/name during enquiry, merge anonymous `usual_size` into `Customer.usual_size` (upsert on phone match).

#### Technical Integration Points

- **PWA Collection Page:** `apps/web/src/app/[store]/collections/[id]/page.tsx` (or equivalent)
- **PWA Product Detail:** `apps/web/src/app/[store]/products/[id]/page.tsx`
- **Size Selector Component:** Shared component used in both places.
- **Lead Capture API:** `POST /v1/public/enquiry` — add `usual_size` field to payload.

---

## Database Changes (Already Defined, Just Not Applied)

| Table | Column | Type | Status |
|---|---|---|---|
| `customers` | `usual_size` | `TEXT` | ❌ Migration 058 not applied |

---

## Acceptance Criteria

- [x] Migration 058 applied in all environments; `customers.usual_size` queryable.
- [x] Anonymous customer can set "usual size" on PWA without login.
- [x] Preference persists across sessions (localStorage/cookie).
- [x] PDP pre-selects stored size; collection shows "Your size" badge.
- [x] Enquiry payload includes `usual_size` → visible in retailer CRM.
- [x] Retailer-side quick capture still works and overrides anonymous value on merge.

---

## Effort Estimate

| Sub-Task | Effort | Priority |
|---|---|---|
| Apply migration 058 | Trivial (DB admin) | **P0** (blocker for recommendation) |
| PWA anonymous usual-size capture (UI + persistence) | Low-Medium | P1 |
| PDP/Collection integration (pre-select + badge) | Low | P1 |
| Enquiry payload + CRM merge | Low | P2 |

**Total:** ~1–2 weeks (migration is immediate; PWA work is 1 week).

---

## Dependencies

- Migration 058 must be applied before recommendation engine works reliably.
- PWA uses existing size selector component — ensure it's reusable.
- `SIZE_OPTIONS` enum already includes XS–8XL; no schema change needed.

---

## References

- Main roadmap: `docs/INDIA-RETAILER-GROWTH.md` (Feature N, line 283–296)
- Build log: `docs/BUILD-LOG.md` §47
- Size recommendation logic: `apps/api/src/lib/size-recommendation.ts` (or equivalent)
- PWA collection/product pages: `apps/web/src/app/[store]/...`
- F-102c size chart: `docs/F-102c-size-chart.md` (if exists)