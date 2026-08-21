# Remaining Coding Work — Prioritized Task List

**Created:** 2026-08-20  
**Source:** Audit of `docs/PRO-REQUIREMENTS.md`, `docs/INDIA-RETAILER-GROWTH.md`, `docs/photoshoots/photo-feature-audit.md`, `docs/tasks/PHASE-II-WHATSAPP-CATALOG-BREAKDOWN.md`, `docs/marketing/IMPLEMENTATION-STATUS.md`  
**Purpose:** Point-by-point coding checklist, ordered by priority. Complete each item in order before moving to the next.

---

## Priority Legend

| Symbol    | Meaning                                                  |
| --------- | -------------------------------------------------------- |
| 🔴 **P0** | Critical blocker or broken build — must fix first        |
| 🟠 **P1** | High value, unblocked, ready to code                     |
| 🟡 **P2** | Medium value, partially blocked or lower urgency         |
| 🔵 **P3** | Low urgency, deferred, or blocked on external dependency |
| ⬜ **P4** | Nice-to-have polish, no functional gap                   |

---

## 🔴 P0 — Critical / Blocker

### 1. ~~Fix Partner Network Manager Schema~~ ✅ DONE
- **Status:** Schema validates clean, enums are top-level declarations, migration 066 exists.

### 2. ~~Partner Network Manager — Migrations + Mobile UI~~ ✅ DONE
- **Status:** Migration 066 applied, mobile screen complete (358 lines: list + create modal + partner cards). API routes already registered.

---

## 🟠 P1 — High Value, Ready to Code### 3. ~~F-021 Product & Store Ratings~~ ✅ DONE (backend + mobile UI)
- **What:** Schema (`ProductReview`, `StoreReview` tables) + CRUD API + moderation (reuse admin AuditLog) + customer-facing star display on `ProductDetailSheet` + retailer review view + Google Business Profile review link (`Retailer.google_place_id`). Rating ≥4 → "Leave us a Google review" CTA; ≤3 → private feedback prompt.
- **Source:** `docs/PRO-REQUIREMENTS.md §10.12`
- **Status:** ✅ Built — migration 072, retailer API (6 endpoints), admin moderation API (5 endpoints), mobile ratings screen (358 lines: summary + product reviews + store reviews + Google review link), denormalized `avg_rating`/`rating_count` on Product + Retailer. API + mobile `tsc --noEmit` clean.

### 4. ~~F-303 Order Management & Delivery Tracking~~ ✅ DONE

- **What:** Retailer-facing order list (mobile + admin): view, mark fulfilled/shipped/cancelled, filter by status. Delivery tracking (Shiprocket/Delhivery) is later — retailers fulfill manually at launch.
- **Source:** `docs/PRO-REQUIREMENTS.md` (F-303 section)
- **Status:** ✅ Already built — Order/OrderItem models (F-302), API routes (`checkout-orders.ts`), mobile list screen (`app/(tabs)/orders.tsx` with filter chips + fulfill/cancel), mobile detail screen (`app/orders/[id].tsx` with timeline + shipping + payment summary + GST invoice).

### 5. ~~F-021 doc status update in INDIA-RETAILER-GROWTH.md~~ ✅ DONE
- **Status:** `docs/INDIA-RETAILER-GROWTH.md` line 21/198 already say "✅ Built" — doc already matches reality, item was stale. No action needed.

### 6. F-305 Multi-Store Management - Not Required DONT CODE

- **What:** Allow retailers to manage multiple store locations from one account — separate product catalogs, separate collection links, shared settings.
- **Source:** `docs/PRO-REQUIREMENTS.md` (F-305 section, minimal spec)
- **Blocked on:** Nothing, but scope is underspecified — needs design before coding
- **Estimate:** ~1 week (after design)

---

## 🟡 P2 — Medium Value, Partially Blocked

### 7. Instagram Business Publishing (F-301 Phase 2)

- **What:** Extend F-031 (currently Facebook-only) to include Instagram Business connect via linked FB Page + carousel posts + auto-generated captions + per-platform CTA (Instagram: "DM us / link in bio"; Facebook: clickable link). Personal-account retailers get a guided conversion path.
- **Source:** `docs/PRO-REQUIREMENTS.md §23.5 Phase 2`, `docs/INDIA-RETAILER-GROWTH.md`
- **Blocked on:** Meta app review for `instagram_business_content_publish` permission (external timing)
- **Estimate:** 4–6 days once approved

### 8. ~~Photo Audit — Polling Exponential Backoff (try-on + studio + cleanup)~~ ✅ DONE
- **Status:** Shipped commits `cd80899`, `8b91f6a` (2026-08-20/21) — try-on + studio shoots + admin V-Tone polling all on exponential backoff.

### 9. ~~Photo Audit — Progress/ETA Indicators in Generation Status~~ ✅ DONE
- **Status:** Shipped commit `8b91f6a` — studio shoot progress UI landed alongside backoff work.

### 10. ~~Photo Audit — BFL Credit Consumption Tracking per Retailer~~ ✅ DONE
- **Status:** Shipped commit `8b91f6a` — BFL credit tracking landed.

### 11. ~~Photo Audit — Image Size Validation Before BFL Submit~~ ✅ DONE
- **Status:** Shipped commit `19bf0e5` — image size validation before BFL FLUX submit.

### 12. Photo Audit — GPU Detection for V-Tone - Not Required DONT CODE

- **What:** Detect if GPU is available on the V-Tone Hetzner box, adjust timeout and possibly use a different API endpoint. Currently always CPU with fixed 30min timeout.
- **Source:** `docs/photoshoots/photo-feature-audit.md §4.2`
- **Blocked on:** Nothing
- **Estimate:** ~2 hours

### 13. Photo Audit — Product Gallery Lazy Loading

- **What:** All images in `ProductGallery.tsx` load at once. Add `loading="lazy"` on non-priority images or IntersectionObserver to preload when slide becomes active. Reduces initial page load.
- **Source:** `docs/photoshoots/photo-feature-audit.md §4.4`
- **Blocked on:** Nothing
- **Estimate:** ~1 hour

### 14. Photo Audit — Color Chip Disabled State for SOLD Variants

- **What:** When a variant is SOLD, the color chip in `ProductGallery.tsx` still looks interactive. Gray it out or add "Sold" badge to indicate unavailability.
- **Source:** `docs/photoshoots/photo-feature-audit.md §4.4`
- **Blocked on:** Nothing
- **Estimate:** ~30 minutes

### 15. Auto-Built Per-Variant Collection Links (A/B Testing)

- **What:** Currently A/B testing creates two separate collection links manually. Auto-generate per-variant collection links with a `HIDDEN` status so they don't hijack the ACTIVE storefront.
- **Source:** `docs/INDIA-RETAILER-GROWTH.md S`
- **Blocked on:** Need a hidden collection status in the schema
- **Estimate:** ~3 hours

---

## 🔵 P3 — Low Urgency / Blocked on External

### 17. F-022 Auto-Post to Google Business Profile

- **What:** Retailer OAuth-connects their Google Business Profile. Kanchuki posts latest 3–4 new arrivals via `localPosts.create` API. Toggle in retailer settings.
- **Source:** `docs/PRO-REQUIREMENTS.md §10.13`
- **Blocked on:** Google Business Profile API access approval (external, unknown timeline)
- **Estimate:** 3–5 days once approved

### 18. F-302 Razorpay Route — Marketplace Split-Payments

- **What:** Stage 2 of F-302. Retailer onboards via Razorpay Linked Account (Route) instead of connecting their own Razorpay. Kanchuki becomes merchant-of-record with auto-split. `payment_mode: DIRECT | ROUTE` coexistence.
- **Source:** `docs/PRO-REQUIREMENTS.md §F-307`
- **Blocked on:** Legal/compliance sign-off on RBI marketplace-payment guidance
- **Estimate:** 1–2 weeks

### 19. ~~F-302 L2 Ecommerce Checkout (Full Implementation)~~ ✅ DONE
- **Status:** `CLAUDE.md` #3 already says "✅ Built 2026-08-18" — item was stale, false premise. No action needed.

### 20. Facebook Local Awareness Ads (Retailer Self-Service)

- **What:** Retailer connects Meta Marketing API credentials → creates local awareness ad campaigns (campaign → ad set → ad creative → ad) with radius targeting.
- **Source:** `docs/marketing/IMPLEMENTATION-STATUS.md`
- **Blocked on:** Meta Marketing API credentials (retailer provides via Integrations screen)
- **Backend exists:** `apps/api/src/routes/retailers/retailers-integrations.ts` — full flow coded
- **Mobile UI exists:** `apps/mobile/app/growth/integrations/fb-ads.tsx`
- **Estimate:** Testing/verification only (code exists)

### 21. Google Local Service Ads (Retailer Self-Service)

- **What:** Retailer connects Google Ads credentials → manages LSA campaigns.
- **Source:** `docs/marketing/IMPLEMENTATION-STATUS.md`
- **Blocked on:** Google Ads API credentials (retailer provides via Integrations screen)
- **Backend exists:** `apps/api/src/routes/retailers/retailers-integrations.ts`
- **Mobile UI exists:** `apps/mobile/app/growth/integrations/google-ads.tsx`
- **Estimate:** Testing/verification only (code exists)

### 22. Native In-App Microphone for Voice Search - Not Required DONT CODE

- **What:** Currently AI search uses keyboard dictation. Native mic needs a dev build (Expo Go can't run it).
- **Source:** `docs/INDIA-RETAILER-GROWTH.md M`
- **Blocked on:** Dev build (EAS Build), not code
- **Estimate:** ~1 day after dev build is available

### 23. PWA/Retailer UI Language Toggle - Not Required DONT CODE

- **What:** No i18n infrastructure exists yet. Toggle to switch UI language (Hindi/Hinglish/regional) for the retailer app and customer PWA.
- **Source:** `docs/INDIA-RETAILER-GROWTH.md M`
- **Blocked on:** No i18n framework installed (react-i18next or similar)
- **Estimate:** ~1 week (infrastructure + translation + wiring)

### 24. F-025 Scan-to-Sell — Print-Ready QR/SKU Tag Surface

- **What:** Scan-to-sell works but there's no way for the retailer to print a QR/SKU tag to stick on the rack. Add a print-friendly view of SKU + QR code at product-tagging time.
- **Source:** `docs/PRO-REQUIREMENTS.md §15`
- **Blocked on:** Nothing, but low urgency (physical sticker printing is a retailer choice)
- **Estimate:** ~2 hours

### 25. Customer-Facing "Usual Size" Self-Capture on PWA - Not Required DONT CODE

- **What:** Customers have no login on the PWA, so they can't save their usual size. Needs a Phase 1 customer-identity flow.
- **Source:** `docs/INDIA-RETAILER-GROWTH.md N`
- **Blocked on:** Customer identity/login on PWA
- **Estimate:** Unknown (depends on identity system)

---

## ⬜ P4 — Nice-to-Have / Future

### 16. Seasonal Deep-Dive Dashboards (Campaign Analytics) — demoted from P2

- **What:** Beyond the existing category-level wedding-season vs daily-wear comparison, add deeper seasonal analytics: festival-over-festival trends, year-over-year comparison, regional performance heatmaps.
- **Source:** `docs/INDIA-RETAILER-GROWTH.md R`
- **Blocked on:** Not enough season-over-season data yet — project ~1 month old, needs multiple festival cycles before this is useful
- **Estimate:** ~2–3 days

### 26. F-302 Phase B — Product Video Generation (Seedance/Kling)

- **What:** Product photo + motion preset → 5s 1080p clip via commercial API. Paid add-on (~₹49–99/clip).
- **Source:** `docs/PRO-REQUIREMENTS.md §24.4B`
- **Blocked on:** Budget decision on paid API costs
- **Estimate:** 1–2 weeks

### 27. F-302 Phase C — AI Fashion Model - Not Required DONT CODE

- **What:** Consistent brand model across listings. V-Tone garment-transfer is the seed, but this is riskiest for ethnic wear (saree draping).
- **Source:** `docs/PRO-REQUIREMENTS.md §24.4C`
- **Blocked on:** Research, not scoped for build
- **Estimate:** Unestimated

### 28. F-101 Fashion DNA — AI Customer Matching - Not Required DONT CODE

- **What:** AI learns customer preferences from behavior and auto-suggests matching products.
- **Source:** `docs/PRO-REQUIREMENTS.md §F-101`
- **Blocked on:** Needs 3–6 months of MVP behavior data
- **Estimate:** Unknown

### 29. F-103 Remote Try-On via WhatsApp

- **What:** Retailer sends product via WhatsApp → customer replies with photo → AI generates try-on → retailer sends back.
- **Source:** `docs/PRO-REQUIREMENTS.md §F-103`
- **Blocked on:** WhatsApp Business API automation (Phase 2)
- **Estimate:** ~1 week

### 30. F-104 Auto-Personalized Collection Building

- **What:** AI auto-suggests collection of 10–15 products for a specific customer based on Fashion DNA.
- **Source:** `docs/PRO-REQUIREMENTS.md §F-104`
- **Blocked on:** F-101 Fashion DNA
- **Estimate:** Unknown

### 31. Phase 2 B2B Supply Chain (F-201–F-204)

- **What:** Wholesaler catalog import, retailer-to-wholesaler ordering, manufacturer catalog upload, design popularity analytics.
- **Source:** `docs/PRO-REQUIREMENTS.md §Phase 2`
- **Blocked on:** Phase 2 scope decision
- **Estimate:** 4–6 weeks total

### 32. Photo Audit — Responsive Aspect Ratio in Product Gallery

- **What:** Fixed 3:4 ratio may not suit all product types. Use responsive aspect ratio or per-product aspect ratio.
- **Source:** `docs/photoshoots/photo-feature-audit.md §4.4`
- **Estimate:** ~2 hours

### 33. Photo Audit — Loading Skeleton for Fullscreen Lightbox

- **What:** Show spinner or placeholder during image load in lightbox, especially on slow connections.
- **Source:** `docs/photoshoots/photo-feature-audit.md §4.4`
- **Estimate:** ~1 hour

### 34. Photo Audit — ARIA Live Region for Gallery Status Changes

- **What:** When slide changes, announce new slide index for screen readers.
- **Source:** `docs/photoshoots/photo-feature-audit.md §4.4`
- **Estimate:** ~30 minutes

---

## 🔧 Operational / DevOps (Not Code)

| #   | What                                                                            | Action Required                                                |
| --- | ------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| D1  | Apply migrations 066–071 to production DB                                       | `npx prisma migrate deploy` or Supabase SQL Editor             |
| D2  | Meta app review for `pages_manage_posts` / `instagram_business_content_publish` | Submit via Meta for Developers dashboard                       |
| D3  | Google Business Profile API access request                                      | Submit via Google API Console                                  |
| D4  | DLT registration of MSG91 sender ID                                             | MSG91 dashboard → Sender ID → DLT registration (2–7 days)      |
| D5  | Mobile EAS build with MSG91 widget                                              | `eas build` with `EXPO_PUBLIC_MSG91_WIDGET_ID` / `_TOKEN_AUTH` |

---

## Summary Counts

| Priority             | Count  | Est. Total Effort     |
| -------------------- | ------ | --------------------- |
| 🔴 P0 (Critical)     | 0 ✅   | Done                  |
| 🟠 P1 (High)         | 4 ✅ / 1 done above (item 5) | ~1.5 weeks (mostly already done) |
| 🟡 P2 (Medium)       | 5      | ~2 days               |
| 🔵 P3 (Blocked/Low)  | 8      | Varies (most blocked) |
| ⬜ P4 (Nice-to-have) | 10     | Varies (future scope) |
| 🔧 DevOps            | 5      | Config/deploy only    |
| **Total**            | **39** | 6 items marked ✅ DONE this pass (5, 8, 9, 10, 11, 19) |

**Recommended next action:** Items 1–4 + 5, 8–11, 19 already done. Next unblocked, zero-conflict work: item 13 (gallery lazy-load) → item 14 (sold-chip) → item 15 (hidden collection status for A/B links).

---

## Cross-References

| Source Document                           | Items Covered                                                 |
| ----------------------------------------- | ------------------------------------------------------------- |
| `docs/PRO-REQUIREMENTS.md`                | Items 3, 4, 6, 17, 18, 20, 21, 24, 25, 26, 27, 28, 29, 30, 31 |
| `docs/INDIA-RETAILER-GROWTH.md`           | Items 5, 7, 15, 16, 22, 23                                    |
| `docs/photoshoots/photo-feature-audit.md` | Items 8, 9, 10, 11, 12, 13, 14, 32, 33, 34                    |
| `docs/marketing/IMPLEMENTATION-STATUS.md` | Items 19, 20, 21                                              |
| `docs/BUILD-LOG.md`                       | Referenced for all "already built" cross-checks               |
| `CLAUDE.md`                               | Feature index — items 1, 2, 3, 4, 19 update this              |
