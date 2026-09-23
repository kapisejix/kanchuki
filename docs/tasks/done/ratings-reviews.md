# F-021 Product & Store Ratings — BUILT
> Extracted 2026-09-23 from `docs/PRO-REQUIREMENTS.md` (lines 1143–1168). Reclassified pending → done the same day: the extraction header said "post-launch", but the feature is built.


**Status:** ✅ **Built** (2026-08-20). Migration `072_product_store_ratings` + `ProductReview`/`StoreReview` models + retailer API (`routes/retailers/retailers-ratings.ts`) + admin moderation API (`routes/admin/admin-ratings.ts`) + public API (`routes/public/public-reviews.ts`) + mobile moderation screen (`apps/mobile/app/growth/ratings.tsx`, linked from the Growth Hub) + admin page (`/admin/ratings`) + customer-web components (`ReviewList`, `StarPicker`). See `docs/BUILD-LOG.md` §52.

**Re-verified 2026-09-23 (docs reorg):** all three route groups are registered (`routes/retailers.ts`, `routes/admin.ts`, `routes/public.ts`) and the schema is valid. The residual item — surfacing ratings inside the newer customer-PWA personalisation surfaces — is tracked as an engagement item in `docs/tasks/pending/customer-engagement-analytics.md` (F-037), not as a gap in this feature.

**Problem:** Customers browsing a collection link have no signal of store or product trustworthiness beyond the retailer's own photos/description — no way to leave or see feedback.

**Design:**
- `ProductReview` (product_id, customer_id, rating 1–5, comment, created_at) and `StoreReview` (retailer_id, customer_id, rating, comment, created_at) — separate tables, product review is item-specific, store review is about service/staff/experience.
- One review per customer per product/store — enforced via a unique constraint.
- **Gating decision (required before build):** rating eligibility should be tied to a prior `CustomerInteraction`/`Order` record, not open to any visitor — otherwise the catalog fills with fake 5-stars from the retailer's own network or fake 1-stars from competitors.
- Denormalized `Product.avg_rating`/`rating_count` and `Retailer.avg_rating`/`rating_count`, updated on write — avoids a live aggregate query on every catalog page load. **This aggregate is never filtered** — every submitted rating counts, including low ones (see Google-review routing below, which is a separate, gated flow).
- Customer-facing: star display on `ProductDetailSheet.tsx` and product cards; a "rate this" affordance gated per above.
- Retailer-facing: reviews visible on the retailer's own product/store view, with an optional owner-reply field.
- Moderation: extends the existing Admin Control Center (F-013–F-017) — admin can remove abusive reviews, `AuditLog`-wired the same as other admin delete actions, rather than a new moderation system.

**Google Business Profile review link:**
- `Retailer.google_place_id` (new field) — retailer pastes their Google Business Profile link once in settings; Kanchuki derives the direct review-write URL (`search.google.com/local/writereview?placeid={id}`). No Google API integration — Google has no public API to post a review programmatically (by design, to block fake/incentivized reviews); this is a plain deep link the customer completes themselves on Google's own page, with their own account.
- **Routing after in-app rating submit:** rating ≥4 → show "Loved it? Leave us a Google review" CTA with the link above. Rating ≤3 → show a private "Tell us what went wrong" prompt instead, routed to the retailer's dashboard (optionally an admin support ticket), never surfaced publicly.
- **Flagged risk — read before building:** this rating-based routing is "review gating," a pattern explicitly prohibited by Google's Business Profile review policies (don't selectively prompt only happy customers to post publicly). Enforcement against small businesses is inconsistent, but Google can flag or suspend a profile it catches doing this. Kanchuki's own in-app `avg_rating` above stays unfiltered specifically so that one honest signal exists regardless of this decision. Building it because explicitly requested — the risk is the retailer's/platform's call, not a technical blocker.

**Complexity estimate:** Moderate, 3–5 days — CRUD + one denormalized-counter decision + admin moderation hook + the Google-link field/routing (adds ~half a day on top, reuses the same rating-submit flow), no new architectural pattern.

**Why not built yet:** not in the locked MVP feature list (Section 3) — MVP success metrics are about catalog upload/collection-link/enquiry conversion, not reviews, and a brand-new catalog has nothing to rate yet. Candidate for Phase 1, once Phase 0 metrics are validated and there's repeat customer traffic worth rating.

---


Idea review: `docs/references/research/feature-ideas-2026-07-30.md` §2.
