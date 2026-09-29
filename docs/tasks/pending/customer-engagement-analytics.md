# Customer Catalog Engagement + Admin Behavior Analytics

**Document:** `docs/tasks/pending/customer-engagement-analytics.md`
**Date:** 2026-09-17
**Status (updated 2026-09-29):** **Phase 1 ✅ built (2026-09-18)** — `CustomerInteraction` model + migration `100_customer_interaction`, `POST /v1/public/passport/events` restored, `STORE_VISIT` write on QR lead capture, and consent-gated beacon for dwell-timed `view`, `favorite`/`unfavorite`, `enquiry`, and debounced `search`. **Phase 2 ✅ built (2026-09-29)** — nightly aggregation (`apps/api/src/jobs/engagement-aggregate.ts`, cron `0 1 * * *`), migration `121_engagement_aggregates`. **Phase 3 ✅ built (2026-09-29)** — admin aggregate dashboard + audited customer drill-down (`apps/api/src/routes/admin/admin-engagement.ts`, `apps/web/src/app/admin/engagement/page.tsx`); migration `122` is applied and verified. **Phase 4 🟨 partly built** — retailer aggregate view and engagement items 1, 2, 4, 5, 6, 8, 9 are built. Item 1, store-local “Picked for you,” uses consent-gated same-store interactions for recognized shoppers and validated per-tab visit IDs for anonymous shoppers; it requires no `CustomerFashionDNA` rebuild or migration. Item 7 is ✅ built at product level — catalog cards show ★ + average when `rating_count > 0` (`CollectionView.tsx`, commit `d73c8c54`), reviews list on the detail sheet; store-level rating on `/stores` is not built (owner decision pending). Pagination-time social-proof refresh was considered and deliberately not built. Details: `docs/build-log/part-6.md` (F-037 entries).
**Answers:** owner follow-up on F-036 — (1) what else increases time-on-catalog/customer engagement, (2) how admin tracks per-customer dwell time, liked products, search terms, and view history in the admin dashboard.
**Related:** `docs/tasks/pending/customer-pwa-push-notifications.md` (F-036), `docs/PRO-REQUIREMENTS.md §36 (Shopper Passport)` (Shopper Passport), `docs/PRO-REQUIREMENTS.md` §33.

---

## 0. Important correction found while researching this

The passport doc's §15.1 table says "reuse, don't rebuild" for `CustomerInteraction` and `CustomerFashionDNA`, citing them as already existing at specific schema lines (written 2026-08-30). **They no longer exist.** Migration `082_remove_unwanted_features` — applied 2026-08-31, one day later — explicitly drops both:

```
DROP TABLE IF EXISTS customer_fashion_dna CASCADE;
DROP TABLE IF EXISTS customer_interactions CASCADE;
DROP TABLE IF EXISTS store_affinities CASCADE;
```

These were the old **retailer-scoped** versions (built for the removed VTO/Fashion-DNA matching feature). They are gone from the live schema — confirmed by direct grep, not by re-trusting the older doc.

**What did survive and is live today** (confirmed in `packages/db/prisma/schema.prisma`): `CustomerAccount`, `CustomerStoreVisit`, `ConsentEvent`, `PassportSession`, `CustomerRecentlyViewed`, `CustomerWishlistItem` — the Shopper Passport identity core, plus recently-viewed and cross-store favorites. This is more of the passport work than `CLAUDE.md`'s feature index currently credits (it has no entry for Shopper Passport at all — a documentation gap worth closing separately, not in scope here).

**Consequence for this document:** behavioral tracking (dwell time, search log, view history, "most liked") is **net-new schema work**, not a column-widen on an existing table. This document specs it built directly at `CustomerAccount` scope from day one — no reason to rebuild the old retailer-scoped version first and migrate it later.

---

## 1. What was asked

1. What else can be done to keep customers on the catalog link longer / more interested, beyond F-036?
2. How does admin track, per customer: time spent on a store's catalog, which products they liked most, their search queries, and their view history — visible in the admin dashboard?

---

## 2. Engagement recommendations (beyond F-036)

These are prioritized by how directly they use infrastructure that already exists, cheapest/highest-leverage first.

| # | Idea | Why it works | Reuses |
|---|---|---|---|
| 1 | **"Picked for you" store-local feed** | Leads with best-match items instead of generic new-arrivals — proven pattern for session length | ✅ Built 2026-09-28: `POST /v1/public/recommendations` ranks available items using this store's consented shopper activity or this tab's validated visit IDs, with same-store catalog fallback; no `CustomerFashionDNA` or schema rebuild required. Details: `docs/BUILD-LOG.md` §2026-09-28 (F-037 store-local personalized feed) |
| 2 | **Recently-viewed carousel surfaced prominently** | Cuts backtrack friction, encourages deeper browsing per visit | ✅ Built 2026-09-28 — store-scoped `localStorage` history with a carousel above the catalog grid |
| 3 | **AI Stylist chat promoted, not buried** | Conversational interaction is inherently longer-dwell than passive scrolling | Already built (Customer Profile P2) |
| 4 | **"Complete the look" cross-sell within the same store** | More pages per session, keeps the customer in one store's catalog longer | ✅ Built 2026-09-28 — same-retailer related endpoint ranks by category, subtype, fabric, colour and price proximity |
| 5 | **Real social-proof chips** ("8 viewed today," "3 favorited this week") | Nudges longer looking + more clicks — real counts only, never fabricated | ✅ **Built 2026-09-29, follow-ups included** (§6 Phase 4) — needs the same interaction log this document specs anyway (§3), so it was a dual-purpose build |
| 6 | **Video/Ken Burns collections over static photos** | Video dwell time measurably exceeds static-photo dwell time | F-033 plus ✅ product clips now rendered in both product-detail gallery surfaces (2026-09-28) |
| 7 | **Ratings/reviews surfaced on product cards** | Social proof extends read time before a decision | ✅ Product cards built (`d73c8c54` — ★ + avg when `rating_count > 0`; `ReviewList` on detail sheet). Store-level rating on `/stores` not built — owner decision pending |
| 8 | **Size-match filter front-and-center** | Fewer irrelevant items shown → less bounce, more relevant browsing | ✅ Built 2026-09-28 — always-visible size chips backed by exact size filtering and canonical facets |
| 9 | **Perf: prefetch + smooth infinite scroll** | Load lag kills session length faster than weak content does | ✅ Built 2026-09-28 — shared 20-item page size, guarded append/prefetch, retry state |

**Explicitly not recommending:** 360° spin, Virtual Try-On, purchase-tied loyalty points — all were deliberately removed in `chore/remove-unwanted-features` (2026-08-31); re-introducing any of them for engagement purposes would contradict that decision without a fresh case being made to the owner.

---

## 3. Admin analytics — what "tracking this" actually requires

Four capabilities were identified here; the current shipped status is summarized in §5–6:

### 3.1 Event capture (client → server)

A customer-web beacon that writes one row per action:

| Event | Data captured |
|---|---|
| `view` | product id, store id, **dwell_ms** (computed via visibility-change/page-unload timer, not just page load), entry source (feed/search/catalog) |
| `search` | query text, filters applied (category/color/fabric/price), result count |
| `favorite` / `unfavorite` | product id, store id |
| `enquiry` | product id, store id |
| `store_visit` | store id, entry channel (QR/link/discovery), **session dwell** (total time between entry and exit/idle-timeout) |
| `not_interested` | product id, tags (optional, if that UI ships) |

This uses the event taxonomy implemented by F-037 Phase 1 and writes to the identity-scoped interaction log described above.

### 3.2 Storage — rebuilt directly at identity scope

A single `CustomerInteraction` table (net-new, not a revival of the dropped one), scoped to `CustomerAccount` from the start:

- `customer_account_id`, `retailer_id`, `type` (the event types in §3.1), `metadata` (JSON, shape per type), `created_at`.
- High write volume — this table should never be queried live for dashboard charts (§3.3 handles that).
- Retention: 24 months of raw rows (owner-approved 2026-09-29). Built 2026-09-29: `pruneCustomerInteractions()` in `apps/api/src/jobs/purge-soft-deleted.ts` deletes older rows in 5,000-row batches via the purge role, run daily from the 01:30 UTC `purge-soft-deleted` job. Rollup tables are not pruned. First rows date from 2026-09-18, so nothing is deleted before 2028-09.

### 3.3 Aggregation (nightly job, not live queries)

Raw event rows are not what the admin dashboard reads. A nightly rollup job computes, per `(customer_account_id, retailer_id)` and per `retailer_id` alone:

- Total dwell time, visit count, last-active date.
- Top-viewed / top-favorited products (simple count, no ML needed).
- Top search terms, and — genuinely useful — **zero-result searches**, which double as a catalog-gap report ("12 customers searched 'lehenga under 1500' and found nothing").
- View → favorite → enquiry funnel conversion, per store.

This rollup serves F-037's retailer and admin analytics. It does not build or imply the separate passport-discovery `StoreAffinity` work.

### 3.4 Admin dashboard surface

Two views, same visual conventions as existing admin analytics pages (the Campaign Analytics screen, `growth-campaigns-analytics.ts`, and the Admin Commission Tracker's two-tab layout are the closest existing patterns to follow — use the `dataviz` skill when this is actually built, for chart/color consistency with those):

- **Store-level view** (default): dwell-time trend, top products, search-term table with zero-result flag, funnel chart. Aggregate only.
- **Per-customer drill-down** (on-demand, not the default landing view): one customer's interaction history across every store they've visited — a support/investigation tool, not a general browsing feature for admin staff.

---

## 4. Privacy boundary — this is profiling, not just "analytics"

The shipped code enforces these data-use boundaries; this section records implementation behavior, not a legal conclusion:

- **Retailer isolation:** retailers receive aggregate analytics for their own store only. Named-customer drill-down is an admin investigation surface and is `AuditLog`-gated; retailers do not receive raw per-customer trails.
- **Recognized shopper:** event capture and use of persisted interaction signals for the store-local feed are gated by `profiling_enabled`. When disabled, the event beacon does not write behavioral events and the recommendation route does not use persisted or current-tab signals for that recognized session.
- **Anonymous shopper:** the feed may use product IDs from the current tab's visit history only after validating that each ID belongs to the active store. This history is not linked to a passport account by this route.
- **Notice and retention:** confirm the shopper-facing notice and preference controls accurately explain these uses and the raw-event retention period. Raw events are kept 24 months, then pruned daily (§3.2); the notice must state this period; do not treat this document as legal approval.

These are code-path boundaries. Any change to profiling, consent copy, or data retention needs the project's normal privacy/legal review before release.

---

## 5. What shipped and what remains

| Component | Type | Status / notes |
|---|---|---|
| `CustomerInteraction` model (identity-scoped, built fresh per §0) | DB | ✅ Built with migration `100`; RLS enabled/default-deny |
| Client event beacon (view dwell timer, search log, favorite/enquiry hooks) | Web | ✅ Built; consent-gated and dwell-timed |
| Nightly aggregation job | API/worker | ✅ Built with migration `121`; serves F-037 analytics only, not passport `StoreAffinity` |
| Store-level analytics admin page | Web (admin) | ✅ Built |
| Per-customer drill-down admin page | Web (admin) | ✅ Built; `AuditLog`-gated |
| Retailer-facing aggregate view | Mobile app | ✅ Built; retailer-scoped, aggregate-only per §4 |
| Raw-event retention policy + prune job | Worker / policy | ✅ Built 2026-09-29 — 24 months, `pruneCustomerInteractions()` in `apps/api/src/jobs/purge-soft-deleted.ts` |

---

## 6. Roadmap

**Phase 1 — Event capture + storage** ✅ Core capture built 2026-09-18; retention follow-up open
- `CustomerInteraction` model + RLS.
- Consent-gated client beacon for view/search/favorite/enquiry/store_visit, with real dwell-time measurement.
- ✅ Raw-event retention prune job — built 2026-09-29, 24 months (`pruneCustomerInteractions()` in `apps/api/src/jobs/purge-soft-deleted.ts`).

**Phase 2 — Aggregation** ✅ Built 2026-09-29
- Nightly rollup job (dwell totals, top products, search terms incl. zero-result). Funnel
  conversion (view→favorite→enquiry) is derivable from the three counts already stored per
  retailer-day/customer-summary row — a dedicated funnel field was not added since Phase 3's
  dashboard is what actually needs the computed rate, not the storage layer.

**Phase 3 — Admin dashboard** ✅ Built 2026-09-29
- Store-level analytics page (`/admin/engagement`): dwell trend, top viewed/favorited products,
  top searches with a zero-result flag, funnel.
- Per-customer drill-down, `AuditLog`-gated — every lookup writes the audit row before returning
  data, verified by test (`admin-engagement.test.ts`).

**Phase 4 — Retailer-facing view + engagement features** 🟨 Partly built 2026-09-29 (§2 item 5 added later the same day)
- ✅ Retailer aggregate view (§4 boundary enforced by construction — `GET /v1/growth/engagement`
  takes no customer id and no other-retailer id; it only ever reads `request.retailerId`).
  Mobile screen `apps/mobile/app/growth/engagement.tsx`.
- ✅ Item 1 (store-local “Picked for you” feed) — built 2026-09-28. Recognized shoppers use their own 90-day interactions at this retailer only when profiling is enabled; anonymous shoppers use current-tab visits scoped and verified against this retailer. Both paths return active-store available products, with catalog-order fallback. No `CustomerFashionDNA` dependency or schema migration.
- ✅ Item 5 (social-proof chips) — **built** 2026-09-29. `GET /v1/public/engagement-chips?store=<slug>`
  folds the same `RetailerEngagementDaily` rows through the same `mergeTopLists()` the two views
  above use (`viewed_today` = newest day alone; `favorited_week` = 7 days summed and re-ranked),
  and the customer storefront renders one chip per card from that map. Honesty rule (§2 row 5,
  §7.4) enforced in the response shape: a product with no count is **absent** from the map, never
  present-with-zero, because the rollup only stores each day's top 10 — "not in the top 10" is not
  the same fact as "nobody viewed it". The window the counts cover travels with them
  (`window.today`/`week_from`/`week_to`) so the label says "yesterday"/"recently" rather than
  misdating the number as "today" — the nightly job only ever summarizes completed days.
- ✅ Item 5 **follow-ups** (2026-09-29, same day):
  - **Minimum-count floors, asymmetric per signal** — `MIN_VIEWED_CHIP = 3`,
    `MIN_FAVORITED_CHIP = 1`, exported from `lib/socialProof.ts` and asserted as a *relationship*
    in test rather than left to a comment. A save is deliberate, so one is real evidence; a view is
    passive, so 1–2 is indistinguishable from noise and a "1 viewed today" chip argues against the
    product it is meant to sell. Equalising the two would either hide genuine single saves or
    re-ship the exact chip the floor exists to prevent. Note the ceiling: the rollup keeps only
    each day's top 10, so most counts in a quiet boutique are small and any floor suppresses most
    chips — tune from the real distribution, not from taste.
  - **Chips on both product-detail surfaces** — `ProductDetailSheet` takes the map as a **prop**,
    because it already mounts inside `CollectionView` and the map is store-wide, so the open
    product's entry is in memory: the chip costs **no** extra request. `SharedProductPage` renders
    under two standalone routes with no map-holding parent, so it reads the counts itself through
    the same `useSocialProof()` hook the grid now uses — the hook exists so this fetch effect is
    not hand-copied a second and third time (the RC-043 shape).
  - **Refresh as the visitor paginates — considered, deliberately not built.** Pagination adds no
    countable events (product views are not page views), the nightly job writes once at 01:00 UTC
    so the counts are frozen for the whole shopping day, a rollup older than a day degrades to
    "recently" and so stays honest, and the endpoint serves
    `public, max-age=300, s-maxage=300, stale-while-revalidate=3600` — a refetch inside 5 minutes is
    answered from cache with byte-identical content. A refresh would add requests and a new failure
    path for zero visible benefit; the only variant with any value is a re-focus across the rollup
    boundary, a session nobody has. Recorded so it is not re-opened as an oversight.

**Dependency note:** Phase 1 interaction capture supplies the recognized shopper's same-store signals; anonymous shoppers use only the current tab's store-scoped visit IDs. The feed is built on these independent paths and does not depend on `CustomerFashionDNA`. Item 5 (social-proof chips) is built. Items 2, 3, 4, 6, 8 and 9 are also built; item 7 is built at product-card level; only a store-level rating on `/stores` remains, pending an owner decision. Separately, raw-event retention/pruning still needs verification or implementation (§5).

---

## 7. Recommendation

1. ✅ **Interaction log at identity scope** (§0) — built with RLS; do not resurrect the dropped retailer-scoped table.
2. ✅ **Precomputed dashboard data** — Phase 2 aggregation is built; do not replace it with live raw-table chart queries.
3. ✅ **Aggregate-first admin view** — store dashboard is aggregate; named-customer drill-down is deliberate and `AuditLog`-gated.
4. ✅ **Use real engagement evidence** — social-proof chips omit products without a qualifying count; no fabricated numbers. The feed's fallback is explicitly labeled as ordinary store catalog content.
5. **Remaining F-037 work:** decide whether to add a store-level rating on `/stores` (product-card ratings are built).
