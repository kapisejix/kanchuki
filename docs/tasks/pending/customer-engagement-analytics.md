# Customer Catalog Engagement + Admin Behavior Analytics

**Document:** `docs/tasks/pending/customer-engagement-analytics.md`
**Date:** 2026-09-17
**Status:** 🟡 **Phase 1 ✅ Built (2026-09-18)** — `CustomerInteraction` model + migration `100_customer_interaction`, `POST /v1/public/passport/events` restored, `STORE_VISIT` write on QR lead capture, consent-gated client beacon (dwell-timed `view`, `favorite`/`unfavorite`, `enquiry`, debounced `search`). See `docs/BUILD-LOG.md` §2026-09-18. **Phase 2 ✅ Built (2026-09-29)** — nightly aggregation job (`apps/api/src/jobs/engagement-aggregate.ts`, cron `0 1 * * *`), migration `121_engagement_aggregates` (`RetailerEngagementDaily`, `CustomerEngagementSummary`). See `docs/BUILD-LOG.md` §2026-09-29. **Phase 3 ✅ Built (2026-09-29)** — admin store-level dashboard + audited per-customer drill-down (`apps/api/src/routes/admin/admin-engagement.ts`, `apps/web/src/app/admin/engagement/page.tsx`). **Phase 4 🟨 Partly built (2026-09-29)** — retailer-facing aggregate view shipped (`/v1/growth/engagement`, `apps/mobile/app/growth/engagement.tsx`), and of the two gated engagement ideas from §2 **item 5 (social-proof chips) ✅ Built (2026-09-29)** — `GET /v1/public/engagement-chips` + storefront chips, real counts only (see `docs/BUILD-LOG.md` §2026-09-29 (later, F-037 §2 row 5)). **Item 1 (personalized feed) is still not built** — blocked on the `CustomerFashionDNA` rebuild (separate, unshipped subsystem — building the feed without it would mean building that subsystem too, out of scope for this task). §2 row 5's follow-ups (per-signal chip floors, chips on both product-detail surfaces) closed the same day; paginate-time refresh was assessed and **deliberately not built** — `docs/BUILD-LOG.md` §2026-09-29 (later, F-037 §2 row 5 follow-ups). Earlier phases: §2026-09-29 (Phase 3+4).
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
| 1 | **"For You" personalized feed as the catalog entry point** | Leads with best-match items instead of generic new-arrivals — proven pattern for session length | Already designed — `docs/PRO-REQUIREMENTS.md` §16.1–§16.4, incl. §16.2 "For You" feed (this row's earlier pointer to a `passport doc §16.2` is stale: `docs/customers/` was consolidated away). Blocked on the `CustomerFashionDNA` rebuild — §5 below |
| 2 | **Recently-viewed carousel surfaced prominently** | Cuts backtrack friction, encourages deeper browsing per visit | `CustomerRecentlyViewed` — already built, just needs a UI surface |
| 3 | **AI Stylist chat promoted, not buried** | Conversational interaction is inherently longer-dwell than passive scrolling | Already built (Customer Profile P2) |
| 4 | **"Complete the look" cross-sell within the same store** | More pages per session, keeps the customer in one store's catalog longer | New — pairs with the taxonomy (category/style/occasion/fabric) already built |
| 5 | **Real social-proof chips** ("8 viewed today," "3 favorited this week") | Nudges longer looking + more clicks — real counts only, never fabricated | ✅ **Built 2026-09-29, follow-ups included** (§6 Phase 4) — needs the same interaction log this document specs anyway (§3), so it was a dual-purpose build |
| 6 | **Video/Ken Burns collections over static photos** | Video dwell time measurably exceeds static-photo dwell time | Already built (F-033) |
| 7 | **Ratings/reviews surfaced on product cards** | Social proof extends read time before a decision | F-021, currently planned |
| 8 | **Size-match filter front-and-center** | Fewer irrelevant items shown → less bounce, more relevant browsing | Indian Size System, already built |
| 9 | **Perf: prefetch + smooth infinite scroll** | Load lag kills session length faster than weak content does | Standard web-perf practice, no new feature |

**Explicitly not recommending:** 360° spin, Virtual Try-On, purchase-tied loyalty points — all were deliberately removed in `chore/remove-unwanted-features` (2026-08-31); re-introducing any of them for engagement purposes would contradict that decision without a fresh case being made to the owner.

---

## 3. Admin analytics — what "tracking this" actually requires

Four separate capabilities, each buildable independently:

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

This is the same signal taxonomy the passport doc already designed in §15.2 — it just needs to be re-targeted at a schema that exists, per the §0 correction above.

### 3.2 Storage — rebuilt directly at identity scope

A single `CustomerInteraction` table (net-new, not a revival of the dropped one), scoped to `CustomerAccount` from the start:

- `customer_account_id`, `retailer_id`, `type` (the event types in §3.1), `metadata` (JSON, shape per type), `created_at`.
- High write volume — this table should never be queried live for dashboard charts (§3.3 handles that).
- Retention: 24 months for raw rows (matches the retention figure already decided in the passport doc §13-i), auto-pruned by a cron job.

### 3.3 Aggregation (nightly job, not live queries)

Raw event rows are not what the admin dashboard reads. A nightly rollup job computes, per `(customer_account_id, retailer_id)` and per `retailer_id` alone:

- Total dwell time, visit count, last-active date.
- Top-viewed / top-favorited products (simple count, no ML needed).
- Top search terms, and — genuinely useful — **zero-result searches**, which double as a catalog-gap report ("12 customers searched 'lehenga under 1500' and found nothing").
- View → favorite → enquiry funnel conversion, per store.

This mirrors the precompute pattern the passport doc already proposed for `StoreAffinity` (§16.4) — one aggregation job design serves both purposes; no need for two separate pipelines.

### 3.4 Admin dashboard surface

Two views, same visual conventions as existing admin analytics pages (the Campaign Analytics screen, `growth-campaigns-analytics.ts`, and the Admin Commission Tracker's two-tab layout are the closest existing patterns to follow — use the `dataviz` skill when this is actually built, for chart/color consistency with those):

- **Store-level view** (default): dwell-time trend, top products, search-term table with zero-result flag, funnel chart. Aggregate only.
- **Per-customer drill-down** (on-demand, not the default landing view): one customer's interaction history across every store they've visited — a support/investigation tool, not a general browsing feature for admin staff.

---

## 4. Privacy boundary — this is profiling, not just "analytics"

Two rules already locked in the passport doc apply directly, unchanged:

- **Retailer isolation (§18):** a retailer sees only aggregate stats for their own store's consented customers, never another store's data, never raw per-customer trails by default.
- **Admin drill-down needs an audit trail:** viewing a named customer's raw behavior (not aggregate) should write an `AuditLog` row (the mechanism already built for F-014 Admin Activity Tracking) — reuse it rather than building a second audit system. This also gives you a straight answer if a customer ever asks "who at Kanchuki looked at my data."
- **Consent:** this is "profiling" under DPDP, same umbrella already designed for personalized recommendations (§18 of the passport doc) — default ON with a one-tap off, itemized notice. No separate consent flow needs inventing; it's the same toggle, described accurately in its notice copy to also cover "we record what you search and view to show you and our retailers better matches."

---

## 5. What needs to be built (net-new)

| Component | Type | Notes |
|---|---|---|
| `CustomerInteraction` model (identity-scoped, built fresh per §0) | DB | RLS from day one |
| Client event beacon (view dwell timer, search log, favorite/enquiry hooks) | Web | dwell timing needs a visibility-change/unload handler, not just an onLoad fire |
| Nightly aggregation job | API/worker | feeds both dashboard charts and — reused — the passport doc's `StoreAffinity` discovery score |
| Store-level analytics admin page | Web (admin) | reuse Campaign Analytics / Commission Tracker visual pattern |
| Per-customer drill-down admin page | Web (admin) | gated, audit-logged via `AuditLog` |
| Retailer-facing aggregate view | Web (retailer app) | same data, retailer-scoped, aggregate-only per §4 |
| Retention cron (24-month prune on raw rows) | Worker | matches passport doc §13-i |

---

## 6. Roadmap

**Phase 1 — Event capture + storage**
- `CustomerInteraction` model + RLS.
- Client beacon for view/search/favorite/enquiry/store_visit, with real dwell-time measurement.

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
- ❌ Item 1 (personalized feed) — still blocked on the `CustomerFashionDNA` rebuild, a separate
  unshipped subsystem (§2 row 1). Not attempted.
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

**Dependency note:** §2's items 1 and 5 (personalized feed, social-proof chips) need Phase 1–2 of this roadmap to exist first — they consume the interaction data, they don't produce it. Items 2, 3, 6, 7, 8 in §2 have no dependency on this tracking work and can ship independently, at any time.

---

## 7. Recommendation

1. **Build the interaction log at identity scope from day one** (§0) — don't resurrect the retailer-scoped table just to migrate it later; that's strictly more work for the same end state.
2. **Never query raw `CustomerInteraction` for dashboard charts** — the nightly aggregation job is not optional once volume grows; building the dashboard against live raw-table queries will get slow and expensive fast.
3. **Default the admin dashboard to aggregate views.** Per-customer drill-down should feel like an investigation tool (audit-logged, deliberate), not a default browsing screen — this keeps you honest against the same DPDP profiling rules already governing the rest of this feature set, and avoids building something that reads as internal surveillance of identified individuals by default.
4. **Sequence engagement features behind the data, not ahead of it** — do not ship "12 people viewed this" as a static/fake number to hit a deadline; wait for Phase 1–2 so the number is real. A caught fake social-proof number is worse for trust than not having the feature yet.
