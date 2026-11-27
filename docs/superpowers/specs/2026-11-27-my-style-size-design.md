# My Style Phase 4: "Size that works" (design)

Status: **approved 2026-11-27; built on branch, not pushed, not device-tested.** Branch `feat/my-style-size` from `origin/main` a73ebbd8.
Source: `docs/tasks/pending/customer-profile-research.md` §7.5, §10 (Phase 4 row), §11, §12; `docs/tasks/pending/my-style-body-profile.md` §3, §5.

## 1. Intent

Shoppers who save measurements get nothing back today: 0 of ~260 adult products have a `size_chart`, so the existing `suggestSize` label (`StyleCard.tsx:86`) never shows. Phase 4 makes **"Your size: M"** appear on real products from day one, without waiting for retailers, and gives retailers a reason and an easy way to add their own chart.

Success: a shopper with saved bust/waist/hip sees "Your size" on every stitched women's product near them that lists sizes, and the Measurements card tells them on how many.

## 2. What exists (verified 2026-11-27)

- `packages/shared/src/my-style-size.ts`: `parseSizeChart` (validates `{size: {bust|waist|hip: [lo, hi]}}`, integer cm, sizes from `SIZE_OPTIONS`) and `suggestSize(body, chart, available)` (smallest listed size whose upper bound covers each dimension; different sizes → `between`; larger than the largest → null). Tested.
- `products.size_chart` JSONB (migration 162, applied). API create/edit accept and validate it (`products-helpers.ts:119`, `products-crud.ts`).
- Feed card: `toCard` (`public-my-style.ts:147`) sets `suggested_size` when the shopper saved measurements; web renders it.
- **Not built:** any retailer UI for the chart (mobile add / edit forms have only the `sizes[]` chips). Research §7.5 "already built" is wrong for the UI.
- **Bug:** the kids feed passes the parent's measurements to `toCard` (`public-my-style.ts:391-405`), so with charts in place a kids' item could show the parent's size.

Prod read (read-only, non-DUMMY, 2026-11-27):

| Category | Products | `sizes[]` ticked |
|---|---|---|
| Ladies Suit | 87 | 15 |
| Kurti / Kurtis | 32 | 11 |
| Ladies | 23 | 21 |
| Salwar Suits | 7 | 6 |
| Lehenga / Gown / Saree / Tops & Tunics | 18 | 0 |
| Kids (all) | 83 | 18 |

`is_unstitched` is false on every row, so it can't be relied on.

## 3. Goals, non-goals, anti-goals

Goals
1. A standard women's size chart in code, used when a product has no chart of its own.
2. A "standard" vs "store" source on the size label, so the shopper knows which chart backs it.
3. The kids feed never shows a size label.
4. Retailer: an optional size-chart section in the mobile add / edit product form, prefilled from the standard chart.
5. Illustrated measuring guide (bust, waist, hip) plus a "No tape? Pick your usual size" fallback.
6. Payoff counter on the Measurements card: "Your size is shown on N products in your feed".

Non-goals: admin chart editor or chart table (approach 2, rejected); backfilling `products.size_chart` (approach 3, rejected); men's, kids', saree, dupatta, lehenga, unstitched / dress-material sizing; free-size; using size to filter or rank; length / height; any new customer data.

Anti-goals (failure even if it works)
- Naming a size the product doesn't list (**owner decision 2026-11-27: option A**, products with empty `sizes[]` stay silent).
- A standard-chart size shown as if it were the store's own chart.
- A size on a kids' card, a men's card, a saree or a dupatta.

## 4. Approaches (owner picked 1, 2026-11-27)

1. **Constant in code (picked).** `STANDARD_SIZE_CHART` + `standardChartFor(product)` in `packages/shared`. No migration, testable, one source of truth. A number change needs a deploy; standard Indian charts rarely change.
2. Admin table + editor: editable without deploy, but migration + RLS + admin UI + API for three rarely-edited charts. ~3× the work.
3. Backfill `products.size_chart`: prod DB write, disguises a standard guess as the store's chart, misses new products. Rejected.

## 5. Design

### 5.1 Shared: standard chart + eligibility (`packages/shared/src/my-style-size.ts`)

One women's body-measurement chart (cm, integer, contiguous, built from the common Indian brand inch chart: bust 32-46", waist 26-40", hip 35-49", 2" per size, ±1" around the centre):

| Size | Bust | Waist | Hip |
|---|---|---|---|
| XS | 79-83 | 64-68 | 86-91 |
| S | 84-88 | 69-73 | 92-96 |
| M | 89-94 | 74-78 | 97-101 |
| L | 95-99 | 79-83 | 102-106 |
| XL | 100-104 | 84-88 | 107-111 |
| XXL | 105-109 | 89-93 | 112-116 |
| XXXL | 110-114 | 94-98 | 117-121 |
| 4XL | 115-119 | 99-104 | 122-127 |

5XL-8XL are left out: no common standard; a body above 4XL gets no label (existing `suggestSize` rule). **Owner: check these numbers against one or two charts you trust before merge.**

`standardChartFor({ audience, category, subtype }): SizeChart | null` returns the chart only when:
- `audience` is `WOMEN`, or `NULL` and `audienceForText(category + subtype)` (`packages/shared/src/product-audience.ts`, word-boundary `MENS` regex + `KIDS_KEYWORDS`) says neither men nor kids, **and**
- `category + subtype` (lowercased) matches a stitched keyword **as a whole word** (`\b…\b`, so "top" never matches "laptop"): `kurti`, `kurtis`, `kurta`, `suit`, `suits`, `salwar`, `anarkali`, `gown`, `top`, `tops`, `tunic`, `tunics`, `co-ord`, `co-ords`, `ladies`, **and**
- no whole-word match of: `saree`, `sari`, `dupatta`, `lehenga`, `unstitched`, `dress material`, `blouse piece`, `fabric`, `stole`.

Exclusion wins over inclusion. "Ladies Suit" passes; option A then keeps unstitched dress material silent, because those rows list no sizes.

*Call (2026-11-27): reuse `audienceForText` rather than a new men list; plain substrings would turn "women" into "men".*

**Rising-size rule, in `parseSizeChart`.** Each dimension's upper bound must strictly rise with `SIZE_OPTIONS` order across the sizes that list it, or the chart is rejected. The API then backstops the mobile form, and mobile reuses the same function. Safe: 0 stored charts in prod. *Call: put it in the shared parser, not only in the form.*

**A store chart always wins**, even when it gives no answer for this product (for example, it only has an XL row and the shopper is M). The store knows its own garment better than a standard chart does. *Call.*

### 5.2 API (`apps/api/src/routes/public/public-my-style.ts`)

- `toCard`: chart = `parseSizeChart(p.size_chart)` ?? `standardChartFor(p)`. `suggested_size` becomes `{ size, between?, chart: 'store' | 'standard' }`, or null. `suggestSize` itself is unchanged. The candidate query uses Prisma `include`, so `audience`, `category` and `subtype` are already loaded (checked by the builder review).
- Kids feed: `bodyMeasurements = null` when `b.kids` (fixes the bug in §2).
- Feed meta: `size_matches: number | null`. It counts products in `inRange` with a non-null suggestion. Null when the shopper has no measurements or on the kids feed. It reuses the rows already loaded, so no extra query. `inRange` is taken after this request's size, budget and gender filters and is capped at `CANDIDATE_CAP`, so the number means **"in this feed"**, not across all stores. *Call: a stable all-stores count needs a second unfiltered query, which isn't worth it for one line of copy. The copy says "in your feed" so it never over-claims.*
- Complete the look (`toCard(p, r.distance_km)`, line 577) keeps no size label, unchanged.

### 5.3 Web (`apps/web/src/app/(shopper)/my-style/`)

- `StyleCard`: "Your size: M" for `store`; "Your size: M · standard chart" for `standard`, with a `title` / screen-reader text "Based on a standard size chart. Store sizes may differ." The between text stays as it is.
- `MeasurementsCard`:
  - Receives `sizeMatches` from the feed meta (page passes `view.meta.size_matches` when the feed is `ok`). With measurements saved: `N > 0` → "Your size is shown on N products in your feed"; `0` → "No product in your feed has a size for your measurements yet". Hidden while the feed is loading, failed, or without measurements.
  - "How to measure" becomes 3 inline SVG figures (bust, waist, hip: where the tape goes), one line each, plus "Measure over light clothing, tape snug, not tight". No image files, no new dependency.
  - "No tape? Pick your usual size": a button that scrolls to the existing Size filter on `/my-style` (`page.tsx:426`) and focuses it. *Call: shoppers have no web editor or endpoint for `usual_size` (only the retailer-side `customers.ts` writes it), so linking to `/my-profile` would land on nothing. The page's own Size filter already narrows the feed. It lasts for the visit only; a saved usual-size editor is a later item.*

### 5.4 Mobile retailer form (`apps/mobile`)

In both the add form (`app/product/add.tsx`) and the edit form (`ProductAttributesForm` / `useProductDetailForm`), below the Sizes chips, and only once at least one size is ticked:
- A collapsed section "Size chart (optional)" with the nudge "Shoppers who saved their measurements see 'Your size' on this item."
- A "Use standard chart" button. It fills one row per ticked size with **"fits up to" values in inches** for bust, waist and hip, taken from the standard chart's upper bounds. Inches, because Indian retailers measure in inches.
- Each value is editable. On save, the inches are converted to a cm chart: the upper bound is `round(in × 2.54)`, and the lower bound is the previous size's upper + 1 (the first size's lower is `upper − 5`). This matches `suggestSize`, which only reads upper bounds. A blank dimension is left out. All blank → `size_chart: null`.
- Edit loads an existing chart back into inches (upper bound ÷ 2.54, rounded to 0.5").
- If `parseSizeChart` would reject the chart (for example, values not rising with size, per the rule added in §5.1), the form shows "Each size must be bigger than the one before" and blocks save. The API rejects the same chart.

## 6. Data, security, compliance

- No migration. No new customer data, no new consent. Measurements are read exactly as today (consented, shopper-only). §12 guardrails unchanged. No SECURITY.md §12-18 change.
- `size_matches` is a count over public products, so it reveals nothing about other shoppers.
- No AI call is added.

## 7. Tests (TDD per task)

- Shared: `standardChartFor` (include / exclude keywords, exclusion wins, kids and men out, NULL audience, "Women Kurti" stays in, "laptop" never matches "top"); `parseSizeChart` rejects a non-rising chart; the standard chart passes `parseSizeChart`; inches ↔ cm conversion helper round-trips (shared, so mobile and its test use the same code).
- API: store chart wins over standard; standard used when there's no chart; `chart` source field; empty `sizes[]` → null; kids feed → no label and `size_matches: null`; `size_matches` count.
- Web: card copy for both sources; counter copy for N > 0, 0 and hidden; guide renders 3 figures with labels.
- Mobile: section hidden until a size is ticked; "Use standard chart" prefill; invalid order blocks save; payload shape.
- Whole suite + `tsc` + Biome locally before push (Actions blocked by billing).

## 8. Left to the builder

- Exact SVG drawings and their copy.
- Where the inches ↔ cm helper sits in `packages/shared` (next to `my-style-size.ts`).
- The candidate `select` changes needed for `standardChartFor`.

## 9. Device checklist (research §10, unchecked)

Android Chrome PWA and iOS Safari: shopper with measurements sees "Your size" on a sized kurti; standard vs store label; the kids feed shows none; the counter. Retailer on Android (Expo Go): add a product with sizes + standard chart, edit it, reopen it.
