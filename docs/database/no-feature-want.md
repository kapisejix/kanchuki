# Tables to Remove — Feature Teardown Spec

**Created:** 2026-08-31
**Owner ask:** "Check these DB tables, tell me what functionality they power, then remove the codebase, functionality and features tied to them entirely. If I want them later I'll rebuild differently."

This document maps each of the 22 named tables to the feature that owns it, records the full code + schema + migration + doc surface, and gives an ordered teardown plan.

**Scope decision (RESOLVED 2026-08-31):** owner chose the maximal removal on all three follow-up questions (see §3). Final removal set = the 22 named tables **plus** `retailer_payment_accounts` (§3.2) and `customer_visits` (§3.3), and `customer_interactions` is dropped **fully** — its readers in kept features get gutted (§3.1).

---

## 1. Summary

The 24 tables (22 named + `retailer_payment_accounts` + `customer_visits`) belong to **6 feature clusters**, all post-MVP additions:

| # | Cluster | Tables | Verdict |
|---|---------|--------|---------|
| A | **Virtual Try-On (VTO)** + body measurements + training-photo retention | `try_on_jobs`, `try_on_usage_logs`, `training_photo_consents`, `customer_measurements` | Remove — self-contained, low risk |
| B | **Fashion DNA CRM** + interaction tracking | `customer_fashion_dna`, `customer_interactions` | Remove **both** — kept-feature readers of `customer_interactions` get gutted (§3.1) |
| C | **L2 Ecommerce Checkout** (cart → pay → GST invoice) | `orders`, `order_items`, `retailer_payment_accounts` | Remove all three (§3.2) — `PaymentMode` / `RouteOnboardingStatus` enums become dead too |
| D | **Size charts + size recommendation** (roadmap N) | `size_charts`, `size_chart_rows` | Remove — low risk; `usual_size` columns stay |
| E | **Growth-engine sub-features** (incentives, suppliers, bookings, customer referrals, partner network, festival backgrounds, lookbooks) | `incentive_rules`, `suppliers`, `supplier_transactions`, `bookings`, `referrals`, `referral_credits`, `partners`, `partner_referrals`, `partner_events`, `festival_backgrounds`, `lookbooks`, `customer_visits` | Remove all — `customer_visits` only fed the incentive loyalty tier (§3.3) |
| F | **360° spin view** | `product_spin_frames` | Remove — self-contained, low risk |

Everything is behind a `PlanFeature` flag or a `QuotaResourceType`, so the plan-matrix admin screens need row cleanup too.

**Nothing here is in the MVP scope** (`CLAUDE.md` → "NOT in MVP: VTO, … Fashion DNA AI matching, …"). Checkout, growth sub-features and spin view were built later and are all removable without touching the core catalog / collection / WhatsApp-share / storefront path.

---

## 2. Detailed breakdown per cluster

### Cluster A — Virtual Try-On + measurements + training data

**What it does:** customer/shopkeeper uploads a photo, the garment is composited onto them by the self-hosted Fashion V-Tone / CatVTON engine. `customer_measurements` holds MediaPipe-Pose-derived or manually-entered body measurements used to scale the garment. `try_on_usage_logs` is the per-retailer GPU-cost ledger for billing. `training_photo_consents` is a consent-gated, admin-only retained copy of try-on photos for model training, with a `/consent/revoke` token flow.

**Built:** Phase-1-ready scaffolding; migrations 002–010, 021. Live V-Tone infra (BUILD-LOG §23, §27) — Hetzner box + shared-secret auth.

**Schema objects**
- Models: `TryOnJob`, `TryOnUsageLog`, `TrainingPhotoConsent`, `CustomerMeasurement`
- Enums: `TryOnStatus`, `MeasurementSource`, `TryOnSource` (all only used here)
- Relations: `Retailer.try_on_usage`, `Customer.measurements`, `CustomerMeasurement.try_on_jobs`
- Columns on kept tables: `Retailer.try_on_credits`
- `QuotaResourceType.TRY_ON` (enum value) + `PlanFeatureKey.VIRTUAL_TRY_ON`
- `TryOnJob.consent_to_training`, `TryOnUsageLog.try_on_job_id` (loose String, no FK), `TrainingPhotoConsent.try_on_job_id` (loose String, no FK)

**API**
- `apps/api/src/routes/tryon.ts` (mounted `/v1/try-on`, `index.ts:166`)
- `apps/api/src/routes/consent.ts` (mounted `/v1/consent`, `index.ts:170`) — training-photo revoke
- `apps/api/src/jobs/process-tryon.ts`, `jobs/extract-measurement.ts`, `jobs/cleanup-training-data.ts`, `jobs/admin-tryon.ts` (+ `admin-tryon.test.ts`, `cleanup-training-data.test.ts`)
- `apps/api/src/jobs/index.ts` — queue/worker registration for `TRY_ON`, `MEASUREMENT_EXTRACTION`
- `packages/ai/src/tryon.ts` (+ `tryon.test.ts`)
- Partial: `apps/api/src/lib/quota.ts` (TRY_ON branch), `routes/admin/admin-retailers/admin-retailers-detail.ts` (try-on stats block), `routes/retailers/retailers-stats.ts`

**Web**
- `apps/web/src/app/api/try-on/remote/route.ts` + `remote/[id]/route.ts`
- `apps/web/src/app/c/[slug]/components/TryOnModal.tsx`
- `apps/web/src/app/consent/revoke/page.tsx`
- Marketing copy mentions: `for-customers`, `how-it-works`, `faq`, `privacy`, `terms`, `MarketingSections.tsx` (prose only — edit, don't delete files)

**Mobile**
- `apps/mobile/app/tryon/in-store.tsx`
- `apps/mobile/app/customer/[id]/measurement.tsx`
- `apps/mobile/src/lib/api/tryon.ts`

**Migrations that touch these tables:** 002, 003, 004, 006, 008, 009, 010, 021; RLS also set in 015, 016, 017, 018.

---

### Cluster B — Fashion DNA CRM + interaction tracking

**What it does:** `customer_fashion_dna` stores a per-customer learned `preference_vector` (pgvector 1536-dim) plus colour/style/fabric/occasion affinity JSON and a confidence score. `customer_interactions` is the raw event log (`view | favorite | enquiry | purchase | try_on`) that feeds the vector and also feeds the Shopper-Passport "For You" feed, store-affinity scoring, campaign analytics and reactivation targeting.

**Built:** interaction infra + passport "For You" is live. Fashion-DNA *matching* is explicitly NOT in MVP but the tables + jobs exist.

**Schema objects**
- Models: `CustomerFashionDNA`, `CustomerInteraction`
- Relations: `Customer.fashion_dna`, `Customer.interactions`, `CustomerAccount.fashion_dna`, `CustomerAccount.interactions`, `Product.interactions`
- `CustomerInteraction.customer_account_id`, `CustomerFashionDNA.customer_account_id` (Shopper-Passport scoped)
- Queue: `FASHION_DNA` (`packages/shared/src/constants/index.ts` `QUEUES.FASHION_DNA`)

**API / jobs**
- `apps/api/src/jobs/update-fashion-dna.ts`, `jobs/interaction-retention.ts` (+ `__tests__/interaction-retention.test.ts`)
- `packages/ai/src/fashion-dna.ts`, `packages/ai/src/preference-vector.ts`
- `apps/api/src/lib/recommend.ts` (+ `__tests__/recommend.test.ts`), `lib/recommendation-triggers.ts`
- `apps/api/src/lib/passport-activity.ts` (+ test) — reads `customer_interactions`
- `apps/api/src/routes/public/for-you.ts`
- Interaction **writes** are scattered: `routes/customers.ts`, `routes/public/passport.ts`, `routes/public/public-reviews.ts`, `routes/public/public-products.ts`, `routes/public/public-collections.ts` — surgical edits, not file deletes
- Interaction **reads** in features you are keeping: `routes/growth/growth-campaign-analytics.ts`, `growth-campaigns.ts`, `growth-inventory.ts`, `growth-seasonal.ts`, `routes/retailers/retailers-stats.ts`, `routes/admin/admin-retailers/admin-retailers-detail.ts`, `jobs/store-affinity.ts`, `jobs/purge-soft-deleted.ts`, `jobs/purge-retailer-now.ts` → **see §3.1**

**Web**
- `apps/web/src/app/(shopper)/for-you/` + `apps/web/src/app/api/for-you/`

**Migrations:** 000 baseline, 001 (pgvector indexes), 079/080 (passport interaction columns).

---

### Cluster C — L2 Ecommerce Checkout

**What it does:** cart → address → Razorpay pay on the customer storefront, with GST-invoice PDF generation. `orders` is the order header (amounts in paise, shipping snapshot, GST invoice fields), `order_items` the per-product snapshot lines. Payment runs through the retailer's own Razorpay account (`retailer_payment_accounts`, Stage A DIRECT).

**Built:** BUILD-LOG §3 (2026-08-18), migrations 031, 038.

**Schema objects**
- Models: `Order`, `OrderItem`
- Enums: `OrderStatus` (only used by `Order`) — remove. `PaymentMode`, `RouteOnboardingStatus` — **keep** (also used by `RetailerPaymentAccount`).
- Relations: `Retailer.orders`, `Product.order_items`, `Order.items`, `Order.partner_referrals` (goes with Cluster E), `Collection` loose `collection_id`
- `PlanFeatureKey.CHECKOUT_CART`, `PlanFeatureKey.RAZORPAY_ROUTE`

**API**
- `apps/api/src/routes/checkout.ts` + `routes/checkout/` (`index.ts`, `checkout-flow.ts`, `checkout-orders.ts`, `checkout-webhook.ts`, `checkout-helpers.ts`) — mounted `/v1` (`index.ts:174`)
- Keep `routes/checkout/checkout-payment-account.ts` **only if** you keep `retailer_payment_accounts` (see §3.2)
- `apps/api/src/jobs/expire-pending-orders.ts`
- `apps/api/src/lib/invoice.ts` — GST invoice PDF; also used by `quota_addon_purchases` + subscription invoices, so **surgical edit, not delete** (strip the order path only)

**Web**
- `apps/web/src/app/api/checkout/create-order/` + `verify-payment/` (+ their `__tests__`)
- `apps/web/src/app/api/orders/[orderId]/` (+ `__tests__`)
- `apps/web/src/app/api/[store]/[collection]/checkout-status/route.ts`, `apps/web/src/app/api/c/[slug]/checkout-status/` (+ `__tests__`)
- `apps/web/src/app/c/[slug]/cart/` (`page.tsx`, `CartPage.tsx`), `c/[slug]/checkout/` (`page.tsx`, `CheckoutForm.tsx`, `__tests__`), `c/[slug]/order/[orderId]/OrderView.tsx`
- `apps/web/src/app/[store]/[collection]/cart/page.tsx`, `[store]/[collection]/checkout/page.tsx`
- `apps/web/src/lib/checkout.ts`
- Cart/checkout wiring inside `c/[slug]/components/CollectionView.tsx`, `ProductDetailSheet.tsx` — surgical edit

**Mobile**
- `apps/mobile/app/(tabs)/orders.tsx`, `app/orders/[id].tsx`, `app/(tabs)/_layout.tsx` (Orders tab), `apps/mobile/src/lib/api/orders.ts`
- Order counts on `app/(tabs)/index.tsx` dashboard — surgical edit

**Migrations:** 031, 038.

---

### Cluster D — Size charts + size recommendation

**What it does:** retailer builds a size chart (`size_charts`, one per UPPER/LOWER category) with per-size measurement ranges (`size_chart_rows`: bust/waist/hip/length min-max). `apps/api/src/lib/size-recommend.ts` walks the chart against a customer's `usual_size` / purchase history to recommend a size on the product page (roadmap N, F-102c).

**Built:** migration 005; roadmap N (BUILD-LOG §47).

**Schema objects**
- Models: `SizeChart`, `SizeChartRow`
- Enum: `SizeChartCategory` (only used here)
- Relations: `Retailer.size_charts`, `SizeChart.rows`
- **Keep** `Customer.usual_size` and `CustomerAccount.usual_size` columns (cheap, harmless; the "what's your usual size" capture in `growth-sizes.ts` can stay as plain profile data) — only the chart-lookup consumer goes.

**API**
- `apps/api/src/routes/size-chart.ts` (+ `size-chart.test.ts`) — mounted `/v1/size-charts` (`index.ts:169`)
- `apps/api/src/lib/size-recommend.ts` (+ `lib/size-recommend.test.ts`, `lib/__tests__/`)
- `apps/api/src/routes/growth/growth-sizes.ts` — **surgical**: keep the `usual_size` capture endpoint, drop the chart-recommendation endpoint
- Size-recommend call sites in `routes/public/public-products.ts` — surgical edit

**Mobile**
- `apps/mobile/app/size-chart.tsx`, `apps/mobile/src/lib/api/size-charts.ts`

**Migrations:** 005.

---

### Cluster E — Growth-engine sub-features

All under `apps/api/src/routes/growth/` (mounted `/v1/growth`, `index.ts:167`) unless noted. Each is registered in `apps/api/src/routes/growth/index.ts` and `apps/api/src/routes/admin/index.ts`, has a mobile screen under `apps/mobile/app/growth/`, and a tile in `apps/mobile/app/growth/index.tsx`.

| Sub-feature | Tables | API files | Admin | Web | Mobile | Enums / flags | Migration |
|---|---|---|---|---|---|---|---|
| **Incentive engine** (auto rewards, loyalty tiers) | `incentive_rules` | `growth/growth-incentives.ts` | `admin/admin-incentives.ts`, web `app/admin/incentives/` | — | `app/growth/incentives.tsx` | `IncentiveTriggerType`, `IncentiveDiscountType`, `PlanFeatureKey.INCENTIVE_ENGINE` | 066 |
| **Supplier management** (directory + payment ledger) | `suppliers`, `supplier_transactions` | `growth/growth-suppliers.ts` | — | — | `app/growth/suppliers.tsx`, `app/growth/supplier-form.tsx` | `SupplierTransactionKind` | 055 |
| **Showroom / try-on-room booking** | `bookings` | `growth/growth-bookings.ts` | — | `app/api/[store]/bookings/route.ts`, `app/c/[slug]/components/BookingForm.tsx` | `app/growth/bookings.tsx`, `app/growth/booking-form.tsx` | `BookingStatus` | 055 |
| **Customer referral program** (code + WhatsApp share) | `referrals`, `referral_credits` | `growth/growth-referrals.ts` | — | `app/c/[slug]/components/CustomerReferral.tsx` | `app/growth/referrals.tsx` | `ReferralCreditStatus`; `Retailer.referral_enabled`, `Retailer.referral_reward_paise` cols | 055 |
| **Partner Network Manager** (salons/tailors/stylists, commission) | `partners`, `partner_referrals`, `partner_events` | `routes/retailers/retailers-partners/` | `admin/admin-partners.ts`, web `app/admin/partners/` | — | `app/growth/partners.tsx` | `PartnerType`, `CommissionType`, `PartnerReferralStatus`, `PlanFeatureKey.PARTNER_NETWORK` | 066, 076, 077 |
| **Festival background library** (seasonal AI-shoot backdrops) | `festival_backgrounds` | `growth/growth-backgrounds.ts`, `routes/products/products-festival-background.ts` | `admin/admin-festival-backgrounds.ts`, web `app/admin/festival-backgrounds/` | — | `app/growth/backgrounds.tsx` | `PlanFeatureKey.FESTIVAL_BACKGROUNDS` | 067 |
| **Lookbook generator** (3–10 products → styled lookbook PDF/carousel) | `lookbooks` | `growth/growth-lookbooks.ts` | `admin/admin-lookbooks.ts`, web `app/admin/lookbooks/` | `app/[store]/components/CustomerLookbooks.tsx`, `app/api/[store]/lookbooks/route.ts` | `app/growth/lookbook.tsx` | `LookbookFormat`, `LookbookStatus`, `PlanFeatureKey.LOOKBOOK_GENERATOR` | 068 |

Extra jobs: `apps/api/src/jobs/generate-lookbook.ts` (+ queue registration in `jobs/index.ts`).

Mobile growth-hub tiles to remove from `apps/mobile/app/growth/index.tsx`: `Referrals`, `Suppliers`, `Try-on Bookings`, `Incentives`, `Partners`, `Lookbooks`, `Festival Backgrounds` (lines ~46–58, plus the quick-action `router.push` calls at ~226/246/264).

**Not removed** (growth engine features you keep): campaigns, campaign analytics, promotions, GST reports, inventory alerts, product videos, AI translate, AI search, AI campaign assistant, seasonal analytics, social templates, aggregator/channel sync.

---

### Cluster F — 360° spin view

**What it does:** retailer uploads a spin video; `apps/api/src/jobs/extract-spin-frames.ts` (ffmpeg) cuts it into frames stored in `product_spin_frames`; the storefront renders a swipe-to-rotate viewer.

**Built:** migration 026.

**Schema objects**
- Model: `ProductSpinFrame`
- Relation: `Product.spin_frames`
- Columns on `products`: `spin_status`, `spin_error`
- `PlanFeatureKey.SPIN_360`
- Queue: `SPIN_FRAME_EXTRACTION` (`QUEUES.SPIN_FRAME_EXTRACTION`)

**API**
- `apps/api/src/jobs/extract-spin-frames.ts` (+ registration in `jobs/index.ts`)
- Spin blocks inside `routes/products/products-media.ts`, `products-crud.ts`, `products-helpers.ts`, `routes/public/public-products.ts`, `public-collections.ts`, `public-helpers.ts`, `public-retailers.ts`, `routes/retailers/retailers-profile.ts`, `retailers-settings.ts`, `routes/admin/admin-media.ts` — all **surgical edits**
- Purge handling in `jobs/purge-retailer-now.ts`, `jobs/purge-soft-deleted.ts`

**Mobile**
- `apps/mobile/app/product/[id]/spin-video.tsx` (delete)
- Spin UI in `app/product/[id].tsx`, `app/product/add.tsx`, `app/product/bulk.tsx` — surgical edits

**Web**
- Spin viewer usage in `apps/web/src/app/[store]/[collection]/product/[productId]/page.tsx` (+ `__tests__/page.test.tsx`), `c/[slug]/components/ProductDetailSheet.tsx`, `c/[slug]/lib/fetchProductDetail.ts` — surgical edits

**Migrations:** 026.

---

## 3. Follow-up scope questions — RESOLVED 2026-08-31

Owner chose the maximal removal on all three. Recorded here for the teardown PR.

### 3.1 `customer_interactions` — **DROP FULLY** (option b)

It is read by kept features: campaign analytics, reactivation suggestions, inventory alerts, seasonal analytics, retailer stats, Shopper-Passport "For You" + store-affinity.

- `routes/growth/growth-campaign-analytics.ts`, `growth-campaigns.ts`, `growth-inventory.ts`, `growth-seasonal.ts`
- `routes/retailers/retailers-stats.ts`, `routes/admin/admin-retailers/admin-retailers-detail.ts`
- `jobs/store-affinity.ts`, `routes/public/for-you.ts`, `lib/passport-activity.ts`

**Consequence, accepted:** every one of those readers is gutted — remove the "For You" feed end to end (`routes/public/for-you.ts`, `apps/web/src/app/(shopper)/for-you/`, `apps/web/src/app/api/for-you/`, the `(shopper)` nav link), delete `jobs/store-affinity.ts` + `store_affinities` writes, and strip the interaction-derived blocks from campaign analytics / reactivation / inventory / seasonal / retailer stats / admin retailer detail so they compute only from orders-free signals (favorites via `CustomerWishlistItem`, enquiries via `CollectionEnquiry`, sales via `Customer.total_purchases`). Note: `store_affinities` table itself is **not** in the removal list — decide separately whether to keep it as a now-unfed table or add it to the drop set.

### 3.2 `retailer_payment_accounts` — **DROP** (option a)

Remove `retailer_payment_accounts` + model `RetailerPaymentAccount` + `apps/api/src/routes/checkout/checkout-payment-account.ts` + enums `PaymentMode` / `RouteOnboardingStatus` + any retailer "connect Razorpay / payments" UI. Surface confirmed small: only `apps/api/src/routes/checkout/*` and `jobs/purge-retailer-now.ts` reference it; no dedicated mobile/web settings screen found (verify during the PR).

### 3.3 `customer_visits` — **DROP** (option a)

Remove `customer_visits` + model `CustomerVisit` + `Customer.visits` / `Retailer.customer_visits` relations + the visit-log write in `routes/growth/growth-incentives.ts`. Refs confined to `growth-incentives.ts`, `admin-incentives.ts`, `jobs/purge-retailer-now.ts` — all deleted or edited anyway by Cluster E.

---

## 4. Teardown plan

Execute in this order. Steps 1–4 are code (present as a PR diff per `CLAUDE.md` operational policy). Step 5 is the DB migration — **applied from the admin dashboard / `prisma migrate deploy` with your approval only**, never from a local machine.

### Step 1 — API

**Delete files**
```
apps/api/src/routes/tryon.ts
apps/api/src/routes/consent.ts
apps/api/src/routes/size-chart.ts               + size-chart.test.ts
apps/api/src/routes/checkout.ts
apps/api/src/routes/checkout/                    (whole dir; keep checkout-payment-account.ts only under §3.2(b))
apps/api/src/routes/growth/growth-incentives.ts
apps/api/src/routes/growth/growth-suppliers.ts
apps/api/src/routes/growth/growth-bookings.ts
apps/api/src/routes/growth/growth-referrals.ts
apps/api/src/routes/growth/growth-lookbooks.ts
apps/api/src/routes/growth/growth-backgrounds.ts
apps/api/src/routes/retailers/retailers-partners/   (whole dir)
apps/api/src/routes/products/products-festival-background.ts
apps/api/src/routes/admin/admin-incentives.ts
apps/api/src/routes/admin/admin-partners.ts
apps/api/src/routes/admin/admin-lookbooks.ts
apps/api/src/routes/admin/admin-festival-backgrounds.ts
apps/api/src/jobs/process-tryon.ts
apps/api/src/jobs/extract-measurement.ts
apps/api/src/jobs/cleanup-training-data.ts        + cleanup-training-data.test.ts
apps/api/src/jobs/admin-tryon.ts                  + admin-tryon.test.ts
apps/api/src/jobs/expire-pending-orders.ts
apps/api/src/jobs/extract-spin-frames.ts
apps/api/src/jobs/generate-lookbook.ts
apps/api/src/jobs/update-fashion-dna.ts
apps/api/src/jobs/interaction-retention.ts        + __tests__/interaction-retention.test.ts
apps/api/src/jobs/store-affinity.ts               (interaction-fed — drop; also drop store_affinities writes)
apps/api/src/lib/size-recommend.ts               + size-recommend.test.ts + lib/__tests__ entries
apps/api/src/lib/recommend.ts                     + __tests__/recommend.test.ts + recommendation-triggers.ts
apps/api/src/lib/passport-activity.ts             + __tests__/passport-activity.test.ts
apps/api/src/routes/public/for-you.ts
apps/api/src/routes/checkout/checkout-payment-account.ts   (§3.2)
packages/ai/src/tryon.ts                          + tryon.test.ts
packages/ai/src/fashion-dna.ts, preference-vector.ts
```

**Surgical edits**
- `apps/api/src/index.ts` — remove imports + `server.register(...)` for `tryOnRoutes`, `consentRoutes`, `sizeChartRoutes`, `checkoutRoutes`, and the try-on/checkout prefixes (lines ~20, 22, 29, 32, 166, 169, 170, 174)
- `apps/api/src/routes/public/index.ts` + `routes/public.ts` — drop the `for-you` mount
- `apps/api/src/routes/growth/index.ts` — drop the 6 removed sub-route imports + registers
- `apps/api/src/routes/admin/index.ts` — drop `adminIncentiveRoutes`, `adminPartnerRoutes`, `adminFestivalBackgroundsRoutes`, `adminLookbookRoutes` exports
- `apps/api/src/routes/retailers/index.ts` — drop `retailers-partners` mount
- `apps/api/src/routes/products/index.ts` — drop `products-festival-background` mount
- `apps/api/src/jobs/index.ts` — drop `TRY_ON`, `MEASUREMENT_EXTRACTION`, `FASHION_DNA`, `SPIN_FRAME_EXTRACTION` worker/queue registration + the removed cron jobs
- `apps/api/src/lib/quota.ts` — drop the `TRY_ON` resource branch
- `apps/api/src/lib/invoice.ts` — strip the `Order` invoice path (keep subscription + addon invoice paths)
- `apps/api/src/lib/features.ts` — drop helpers for the dead `PlanFeatureKey`s
- Spin blocks (Cluster F "surgical edits" list): `routes/products/products-media.ts`, `products-crud.ts`, `products-helpers.ts`, `routes/public/public-products.ts`, `public-collections.ts`, `public-helpers.ts`, `public-retailers.ts`, `routes/retailers/retailers-profile.ts`, `retailers-settings.ts`, `routes/admin/admin-media.ts`, `admin/admin-plans.ts`
- Interaction **writes** — remove every `prisma.customerInteraction.create(...)` call: `routes/customers.ts`, `routes/public/passport.ts`, `public-reviews.ts`, `public-products.ts`, `public-collections.ts`
- Interaction **reads** in kept features — strip the interaction-derived blocks, recompute from favorites (`CustomerWishlistItem`), enquiries (`CollectionEnquiry`), sales (`Customer.total_purchases`): `growth-campaign-analytics.ts`, `growth-campaigns.ts`, `growth-inventory.ts`, `growth-seasonal.ts`, `retailers-stats.ts`, `admin-retailers-detail.ts`, `lib/passport-activity.ts` callers
- `jobs/purge-retailer-now.ts` (+ `.test.ts`), `jobs/purge-soft-deleted.ts` — drop delete-cascade handling for every removed table (`retailer_payment_accounts`, `customer_visits`, all 22)
- `routes/growth/growth-sizes.ts` — keep `usual_size` capture, drop size-chart recommendation endpoint
- `routes/retailers/retailers-stats.ts`, `admin-retailers-detail.ts` — drop try-on / order stat blocks
- Delete affected test files or trim removed-feature cases: `security.test.ts`, `admin.test.ts`, `billing.test.ts`, `retailers.test.ts`, `products.test.ts`, `growth-*.test.ts`

### Step 2 — Web

**Delete**
```
apps/web/src/app/api/try-on/                      (whole dir)
apps/web/src/app/api/checkout/                    (whole dir)
apps/web/src/app/api/orders/                      (whole dir)
apps/web/src/app/api/[store]/[collection]/checkout-status/
apps/web/src/app/api/c/[slug]/checkout-status/
apps/web/src/app/api/[store]/bookings/
apps/web/src/app/api/[store]/lookbooks/
apps/web/src/app/c/[slug]/cart/                   (whole dir)
apps/web/src/app/c/[slug]/checkout/               (whole dir)
apps/web/src/app/c/[slug]/order/                  (whole dir)
apps/web/src/app/[store]/[collection]/cart/
apps/web/src/app/[store]/[collection]/checkout/
apps/web/src/app/consent/revoke/                  (whole dir)
apps/web/src/app/(shopper)/for-you/               (whole dir)
apps/web/src/app/api/for-you/                     (whole dir)
apps/web/src/app/c/[slug]/components/TryOnModal.tsx
apps/web/src/app/c/[slug]/components/BookingForm.tsx
apps/web/src/app/c/[slug]/components/CustomerReferral.tsx
apps/web/src/app/[store]/components/CustomerLookbooks.tsx
apps/web/src/lib/checkout.ts
apps/web/src/app/admin/incentives/               (whole dir)
apps/web/src/app/admin/partners/                 (whole dir)
apps/web/src/app/admin/lookbooks/                (whole dir)
apps/web/src/app/admin/festival-backgrounds/     (whole dir)
```

**Surgical edits**
- `apps/web/src/app/admin/components/Sidebar.tsx` — drop Incentives / Partners / Lookbooks / Festival Backgrounds nav links
- `apps/web/src/app/(shopper)/layout.tsx` — drop the "For You" nav link; if `(shopper)` has nothing left but `my-profile`, keep the group
- `apps/web/src/app/[store]/**` + `c/[slug]/**` — remove `CustomerLookbooks` / `CustomerReferral` / `BookingForm` mounts
- `apps/web/src/app/admin/plan-features/page.tsx` + `admin/plan-limits/page.tsx` — drop the removed `PlanFeatureKey` / `QuotaResourceType` rows
- `apps/web/src/app/c/[slug]/components/CollectionView.tsx`, `ProductDetailSheet.tsx`, `fetchProductDetail.ts` — remove cart / try-on / spin-viewer / referral / booking / lookbook UI
- `apps/web/src/app/[store]/**` product page + `__tests__/page.test.tsx` — remove SpinViewer
- `apps/web/src/app/billing/page.tsx`, `admin/billing/page.tsx` — drop try-on-credit + checkout-plan rows
- Marketing prose: `for-customers/page.tsx`, `for-retailers/page.tsx`, `how-it-works/page.tsx`, `faq/page.tsx`, `privacy/page.tsx`, `terms/page.tsx`, `sections/MarketingSections.tsx`, `survey/translations.ts` — remove VTO / try-on / measurement claims
- `apps/web/src/app/sw.ts` — drop cached `/cart`, `/checkout`, `/try-on` routes
- Delete / trim tests under `apps/web` referencing the removed routes

### Step 3 — Mobile

**Delete**
```
apps/mobile/app/tryon/                            (whole dir)
apps/mobile/app/customer/[id]/measurement.tsx
apps/mobile/app/orders/                           (whole dir)
apps/mobile/app/size-chart.tsx
apps/mobile/app/growth/incentives.tsx
apps/mobile/app/growth/suppliers.tsx       + supplier-form.tsx
apps/mobile/app/growth/bookings.tsx        + booking-form.tsx
apps/mobile/app/growth/referrals.tsx
apps/mobile/app/growth/lookbook.tsx
apps/mobile/app/growth/backgrounds.tsx
apps/mobile/app/growth/partners.tsx
apps/mobile/app/product/[id]/spin-video.tsx
apps/mobile/src/lib/api/tryon.ts
apps/mobile/src/lib/api/orders.ts
apps/mobile/src/lib/api/size-charts.ts
```

**Surgical edits**
- `apps/mobile/app/(tabs)/_layout.tsx` — remove Orders tab
- `apps/mobile/app/(tabs)/index.tsx` — remove order-count / try-on dashboard cards
- `apps/mobile/app/(tabs)/growth.tsx` + `app/growth/index.tsx` — remove the 7 tiles + quick actions listed in Cluster E
- `apps/mobile/app/product/[id].tsx`, `product/add.tsx`, `product/bulk.tsx` — remove spin-video UI
- `apps/mobile/app/customer/[id].tsx` — remove measurement / try-on entry points
- `apps/mobile/src/lib/api/index.ts`, `growth.ts`, `client.ts` — drop the removed endpoint wrappers
- `apps/mobile/app/billing.tsx`, `plan-select.tsx`, `onboarding.tsx` — drop try-on-credit / checkout copy

### Step 4 — Shared packages + docs

- `packages/shared/src/constants/index.ts` — remove `try_on_credits` from `PLAN_LIMITS`, `ADDON_PRICING.TRY_ON`, `QUEUES.TRY_ON / MEASUREMENT_EXTRACTION / FASHION_DNA / SPIN_FRAME_EXTRACTION`
- `packages/shared/src/types/index.ts` — remove `try_on_credits` from the plan-limit type
- `packages/db/prisma/seed.ts` — remove `tryOnJob` / interaction / order / etc. seed blocks
- Docs to update in the same PR (per `CLAUDE.md` rules 10/11): `CLAUDE.md` "What's Built" index rows 3, 44, 47 + VTO mentions in the tech-stack table; `docs/BUILD-LOG.md` §3, §23, §27, §44–47; `docs/PRO-REQUIREMENTS.md` F-009 try-on, F-010 TRY_ON, F-102*, F-302, roadmap C/K/L/N/P; `docs/PLAN.md`; `docs/INDIA-RETAILER-GROWTH.md` Sprint Block A/B/C rows; `docs/DATABASE.md`; `docs/API.md`; `docs/SECURITY.md` §3b (training photos), §19; `docs/DESIGN.md` try-on / cart screens

### Step 5 — Database migration `082_remove_unwanted_features`

`DROP TABLE ... CASCADE` also drops dependent FKs, RLS policies and indexes. Children-first order keeps it readable:

```sql
-- packages/db/prisma/migrations/082_remove_unwanted_features/migration.sql

-- Cluster E — growth sub-features
DROP TABLE IF EXISTS partner_referrals CASCADE;
DROP TABLE IF EXISTS partner_events    CASCADE;
DROP TABLE IF EXISTS partners          CASCADE;
DROP TABLE IF EXISTS referral_credits  CASCADE;
DROP TABLE IF EXISTS referrals         CASCADE;
DROP TABLE IF EXISTS supplier_transactions CASCADE;
DROP TABLE IF EXISTS suppliers         CASCADE;
DROP TABLE IF EXISTS bookings          CASCADE;
DROP TABLE IF EXISTS incentive_rules   CASCADE;
DROP TABLE IF EXISTS customer_visits   CASCADE;   -- §3.3
DROP TABLE IF EXISTS festival_backgrounds CASCADE;
DROP TABLE IF EXISTS lookbooks         CASCADE;

-- Cluster C — checkout
DROP TABLE IF EXISTS order_items       CASCADE;
DROP TABLE IF EXISTS orders            CASCADE;
DROP TABLE IF EXISTS retailer_payment_accounts CASCADE;  -- §3.2

-- Cluster A — VTO
DROP TABLE IF EXISTS training_photo_consents CASCADE;
DROP TABLE IF EXISTS try_on_usage_logs  CASCADE;
DROP TABLE IF EXISTS try_on_jobs        CASCADE;
DROP TABLE IF EXISTS customer_measurements CASCADE;

-- Cluster B — Fashion DNA + interaction log (§3.1 — both dropped)
DROP TABLE IF EXISTS customer_fashion_dna CASCADE;
DROP TABLE IF EXISTS customer_interactions CASCADE;
-- store_affinities is now unfed. Uncomment to drop it too, or keep as a dead table:
-- DROP TABLE IF EXISTS store_affinities CASCADE;

-- Cluster D — size charts
DROP TABLE IF EXISTS size_chart_rows   CASCADE;
DROP TABLE IF EXISTS size_charts       CASCADE;

-- Cluster F — spin
DROP TABLE IF EXISTS product_spin_frames CASCADE;

-- Orphaned columns on kept tables
ALTER TABLE retailers DROP COLUMN IF EXISTS try_on_credits;
ALTER TABLE retailers DROP COLUMN IF EXISTS referral_enabled;
ALTER TABLE retailers DROP COLUMN IF EXISTS referral_reward_paise;
ALTER TABLE products  DROP COLUMN IF EXISTS spin_status;
ALTER TABLE products  DROP COLUMN IF EXISTS spin_error;

-- Plan-matrix / quota rows for the dead feature keys
DELETE FROM plan_features WHERE feature_key IN
  ('SPIN_360','VIRTUAL_TRY_ON','CHECKOUT_CART','RAZORPAY_ROUTE',
   'PARTNER_NETWORK','INCENTIVE_ENGINE','FESTIVAL_BACKGROUNDS','LOOKBOOK_GENERATOR');
DELETE FROM plan_limits             WHERE resource_type = 'TRY_ON';
DELETE FROM retailer_limit_overrides WHERE resource_type = 'TRY_ON';
DELETE FROM usage_counters          WHERE resource_type = 'TRY_ON';
DELETE FROM quota_addon_purchases   WHERE resource_type = 'TRY_ON';

-- Standalone enums with no remaining table (CASCADE handled the columns already)
DROP TYPE IF EXISTS "TryOnStatus";
DROP TYPE IF EXISTS "MeasurementSource";
DROP TYPE IF EXISTS "TryOnSource";
DROP TYPE IF EXISTS "OrderStatus";
DROP TYPE IF EXISTS "PaymentMode";
DROP TYPE IF EXISTS "RouteOnboardingStatus";
DROP TYPE IF EXISTS "SizeChartCategory";
DROP TYPE IF EXISTS "BookingStatus";
DROP TYPE IF EXISTS "SupplierTransactionKind";
DROP TYPE IF EXISTS "ReferralCreditStatus";
DROP TYPE IF EXISTS "PartnerType";
DROP TYPE IF EXISTS "CommissionType";
DROP TYPE IF EXISTS "PartnerReferralStatus";
DROP TYPE IF EXISTS "IncentiveTriggerType";
DROP TYPE IF EXISTS "IncentiveDiscountType";
-- PlanFeatureKey / QuotaResourceType keep their now-unused values (see note below).
```

**Now-dead enums** — `TryOnStatus`, `MeasurementSource`, `TryOnSource`, `OrderStatus`, `PaymentMode`, `RouteOnboardingStatus`, `SizeChartCategory`, `BookingStatus`, `SupplierTransactionKind`, `ReferralCreditStatus`, `PartnerType`, `CommissionType`, `PartnerReferralStatus`, `IncentiveTriggerType`, `IncentiveDiscountType` (standalone types — safe to `DROP TYPE` once their tables are gone) and the enum **values** `PlanFeatureKey.{SPIN_360,VIRTUAL_TRY_ON,CHECKOUT_CART,RAZORPAY_ROUTE,PARTNER_NETWORK,INCENTIVE_ENGINE,FESTIVAL_BACKGROUNDS,LOOKBOOK_GENERATOR}` + `QuotaResourceType.TRY_ON` (PostgreSQL can't drop a single enum value without recreating the type). **Recommended (lazy + safe):** `DROP TYPE` the standalone enums in migration 082; leave the `PlanFeatureKey` / `QuotaResourceType` values in place with a `// deprecated, no rows` comment in `schema.prisma`. A later migration can rebuild those two types clean if desired.

**`schema.prisma`**: delete the 24 models + every relation field pointing at them from `Retailer`, `Customer`, `CustomerAccount`, `Product`, `Collection`. Delete the standalone dead enums; annotate the two enums with dead values. Run `prisma generate` + `prisma migrate deploy`.

### Step 6 — Verify

```
pnpm --filter @kanchuki/db prisma generate
rtk tsc                    # all three apps typecheck
rtk vitest run             # apps/api + apps/web + packages
npx vitest run src/routes/security.test.ts      # per CLAUDE.md rule 8
npx vitest run src/routes/admin.login.test.ts   # per CLAUDE.md rule 9
```
Grep for stragglers:
```
rg -i "tryon|try-on|spin_frame|fashion.?dna|customer_measurement|order_items|size_chart|lookbook|festival_background|incentive_rule|partner_referral|supplier_transaction" apps packages --glob '!**/node_modules/**'
```
Expect only intentional keeps (`usual_size`, `promotions`, `campaigns`, subscription/addon invoices).

---

## 5. Tables NOT in scope (stay)

`campaigns`, `campaign_sends`, `festivals`, `promotions`, `product_videos`, `channel_syncs`, `social_templates`, `social_accounts`, `social_posts`, `customer_accounts`, `customer_store_visits`, `customer_recently_viewed`, `customer_wishlist_items`, `consent_events`, `passport_sessions`, `product_reviews`, `store_reviews`, `design_references`, `bug_reports` — plus all core catalog / collection / subscription / quota / AI-provider / team / taxonomy tables.

`store_affinities` stays by default but is **now unfed** (its only source, `customer_interactions`, is gone via §3.1). Either drop it in migration 082 (commented line in the SQL) or leave it empty for a future rebuild.
