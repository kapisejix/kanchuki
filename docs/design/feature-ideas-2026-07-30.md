# Feature Ideas Review — 2026-07-30

Three ideas reviewed: cross-store coupon network, ratings/reviews, WhatsApp share buttons. Verdict per feature: feasible?, complexity, MVP-relevance.

---

## #1 — Cross-Store Coupon Network ("buy here, get discount there")

**What you described:** customer buys item at Store A → gets coupon → redeems at Store B (different retailer, possibly different category — shoes/jewellery/cosmetics) → Store B scans it in-app → item free/discounted at B. Stores pre-tie-up which categories/items qualify.

**Verdict: possible, but this is a marketplace feature, not a retail-tool feature. Heavy, and wrong for MVP.**

### Why it's heavy
This isn't "add a coupon field." It needs:
- **Retailer-to-retailer graph** — tie-ups are bilateral (A trusts B for X items), not global. New model: `StoreTieUp` (retailer_a, retailer_b, category/item scope, discount terms, status).
- **Coupon lifecycle** — issue (on purchase) → unique code/QR → redeem (scan at *another* retailer's device) → settle. Needs `Coupon` model: issuing_retailer, redeeming_retailer (nullable until used), customer, source_order, value_type (free/%/flat), scope (SKU/category), status (issued/redeemed/expired/void), expiry.
- **Cross-tenant scan flow** — today every scan/action in the retailer app is scoped to *your own* store's data (RLS is per-retailer, see `[[kanchuki-rls-convention]]`). Store B scanning a code issued by Store A means Store B's app must read *across* tenant boundary — a new, narrow RLS exception, not a toggle.
- **Money/settlement question you haven't answered yet:** who eats the discount? If Store B gives a free item because Store A's customer showed a code, does A owe B anything? Real inter-shop marketing tie-ups (mall coupon books, co-op ads) settle this with actual cash or barter *outside* the app. If Kanchuki must track "B is owed ₹X by A," that's a ledger system — real money movement, GST implications (is this a discount, a barter, or a taxable supply between two GST-registered businesses?). This alone could be a multi-week feature.
- **Fraud surface** — coupon reuse, screenshot-and-share, fake redemption by colluding retailers to inflate activity metrics. Needs one-time-use enforcement + audit trail (`[[kanchuki-admin-control-center-2026-07-26]]` deletion-vault/audit patterns apply here).
- **Discovery problem** — Store A's customer needs to *know* which stores B/C/D are tied up and what they offer. That's new UI surface on the customer PWA (a "linked stores" or "network offers" section), not just a coupon code.

### Complexity estimate
High — comparable in scope to the L2 checkout build (`docs/PRO-REQUIREMENTS.md` F-302), which took a dedicated schema, security threat model (`docs/SECURITY.md` §11), and phased rollout. This needs the same treatment: new schema, new RLS carve-out, a settlement/ledger decision, fraud controls, and new customer-facing discovery UI. Realistically 3–5 weeks for a defensible v1 (single-category, manual tie-up, no ledger — just "B trusts A's codes, no money changes hands, they reconcile offline").

### Is it important for MVP?
No. MVP goal (see `CLAUDE.md`) is single-retailer catalog/CRM/WhatsApp commerce — 50 retailers, ≥50 products each, WhatsApp links, enquiry conversion. Cross-store marketing networks assume *many* onboarded, active retailers in the same city/mall willing to tie up — you don't have that density yet. This is a **Phase 2+ growth-loop feature**, valuable once you have retailer density in a city, not before.

### If you want to de-risk it now
Ship the smallest version that tests the idea without the ledger/fraud machinery: single retailer gives a **"refer a friend" or "buy X get store credit at a partner store"** coupon, redemption is *manual* (retailer B types the code into a simple lookup, no scan, no automated trust boundary), no money settlement — just a marketing gesture between two owners who already know each other. That validates demand before you build the graph, scan flow, and ledger.

---

## #2 — Ratings System (product + store)

**Verdict: possible, standard e-commerce feature, moderate complexity, genuinely useful for MVP-adjacent trust-building.**

### What it needs
- **Schema:** `ProductReview` (product_id, customer_id, rating 1-5, comment, photos?, created_at) and `StoreReview` (retailer_id, customer_id, rating, comment). One review per customer per product/store — needs a purchase or enquiry check if you want to prevent drive-by fake reviews (see below).
- **Aggregate fields:** `Product.avg_rating`/`rating_count`, `Retailer.avg_rating`/`rating_count` — denormalized counters updated on write (trigger or app-level increment), so catalog browsing doesn't need a live aggregate query per product.
- **Customer-facing UI:** star display on product cards + product detail (already has a detail sheet — `ProductDetailSheet.tsx` — add rating block there), a "rate this" affordance (likely gated: only customers who enquired/ordered, to avoid spam ratings from people who never engaged).
- **Retailer-facing UI:** reviews visible on retailer's own product/store view; ideally a way to respond (standard for trust — "owner replied").
- **Moderation:** admin needs to see/remove abusive reviews — extends the existing Admin Control Center (F-013–F-017) rather than inventing a new system. `AuditLog` wiring for review deletion, same as other admin actions.

### Complexity estimate
Moderate — 3–5 days. Mostly CRUD + one denormalized-counter decision + admin moderation hook. No new architectural pattern; follows the same shape as everything else in the customer PWA + admin panel.

### Gating question (worth deciding before building)
Should rating require a prior enquiry/order? Recommend **yes** — unrestricted ratings on a catalog with no purchase-verification will fill with fake 5-stars from the retailer's own network or fake 1-stars from competitors. Tie eligibility to `CustomerInteraction`/`Order` records that already exist in the schema.

### Is it important for MVP?
Reasonably — it supports the "customer trust" side of the product but isn't in the locked MVP feature list (`CLAUDE.md` "Current Phase: MVP" section doesn't mention it, and MVP success metrics are about upload/link/conversion, not reviews). Recommend: **build after the MVP metrics are validated**, not before — reviews matter once there's repeat traffic to a store's page; with a brand-new catalog there's nothing to rate yet. Good Phase 1 addition, not Phase 0.

---

## #3 — Share Collection/Product to WhatsApp

**Verdict: mostly already built. Trivial remaining gap.**

### Current state (checked code, not assuming)
`CollectionView.tsx` already has a working share button (`handleShare`, `Share2` icon) using the native **Web Share API** (`navigator.share({ title, url })`) — on mobile this opens the OS share sheet, WhatsApp included, with no custom WhatsApp-specific code needed. `ContactGate.tsx`/enquiry flows already use `buildWhatsAppEnquiryLink`/`buildEnquiryMessage` from `@kanchuki/shared` for the "enquire on WhatsApp" message — so the wa.me link-building helper already exists in the shared package.

**Gap:** `ProductDetailSheet.tsx` (single product view) has no share button — only the collection-level view does.

### Complexity estimate
Trivial — under an hour. Copy the same `handleShare` pattern from `CollectionView.tsx` into `ProductDetailSheet.tsx`, pointing the shared URL at the product's anchor within the collection (or a dedicated product deep-link if one exists/is added: `/{slug}?product={id}` style). No new dependency, no new backend — `navigator.share` is a browser-native API already in use in this codebase.

### Is it important for MVP?
Yes, and cheap — directly supports the "WhatsApp collection link generator" MVP feature already in `CLAUDE.md`'s locked scope, and the ≥10 collection links sent/retailer/month metric. Recommend doing this one now, independent of the other two.

---

## Summary Table

| # | Feature | Feasible? | Complexity | MVP-relevant? | Recommendation |
|---|---|---|---|---|---|
| 1 | Cross-store coupon network | Yes, but heavy | High (3–5 wks) — new schema, cross-tenant RLS, settlement/ledger, fraud controls | No — needs retailer density Kanchuki doesn't have yet | Defer to post-MVP growth phase; if testing appetite now, ship a manual/no-ledger version only |
| 2 | Product + store ratings | Yes | Moderate (3–5 days) | Adjacent, not in locked MVP list | Build in Phase 1, gate ratings behind prior enquiry/order to avoid fake reviews |
| 3 | WhatsApp share button | Already 90% built | Trivial (<1 hr) | Yes — extends existing MVP feature | Do now — just add to `ProductDetailSheet.tsx` |

---

## Suggested order if you want to proceed
1. **#3 first** — near-free, closes a real gap in an already-shipped MVP feature.
2. **#2 next** — standalone, moderate effort, don't gate other work on it. Decide the enquiry/order-gating question before starting.
3. **#1 last, and only after validating demand** — start with the manual/no-ledger version described above before building the full tie-up graph + settlement ledger. Don't build the fraud/ledger machinery speculatively.
