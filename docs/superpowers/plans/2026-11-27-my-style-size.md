# My Style Phase 4 "Size that works" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Your size: M" shows on real products: a standard women's chart in code as the fallback, an optional retailer chart in the mobile form, an illustrated guide and a payoff counter.

**Architecture:** Pure helpers in `packages/shared/src/my-style-size.ts` (rising rule, standard chart, eligibility, inch↔cm). The API feed (`public-my-style.ts`) picks store chart ?? standard chart, tags the source, skips the kids feed and counts matches in meta. Web renders the label, counter and guide; mobile gets one `SizeChartEditor` used by the add and edit forms.

**Tech Stack:** TypeScript, Vitest, Fastify + Prisma (API), Next.js (web), Expo RN (mobile), pnpm + turbo.

**Spec:** `docs/superpowers/specs/2026-11-27-my-style-size-design.md` (approved 2026-11-27).

## Global Constraints

- No migration, no new customer data, no new consent, no AI call. No prod DB write.
- Option A: a product with empty `sizes[]` never gets a label (existing `suggestSize` behaviour; keep it).
- A store chart (`products.size_chart`) always wins over the standard chart, even when it answers null.
- Size never filters or reorders the feed.
- Copy (verbatim): `Your size: {size}`; standard suffix ` · standard chart`; standard title/sr text `Based on a standard size chart. Store sizes may differ.`; counter `Your size is shown on {N} products in your feed` / `No product in your feed has a size for your measurements yet`; mobile nudge `Shoppers who saved their measurements see 'Your size' on this item.`; mobile error `Each size must be bigger than the one before`; guide line `Measure over light clothing, tape snug, not tight`; fallback `No tape? Pick your usual size`.
- Standard chart values exactly as spec §5.1 (XS..4XL).
- After any `packages/shared` change, rebuild it (`pnpm --filter @kanchuki/shared build`) before running API/web/mobile tests (they import `dist`).
- Before push: `pnpm typecheck`, `pnpm test`, `pnpm biome check .` all green locally (Actions blocked by billing). Ask owner before push.
- Ledger: `.superpowers/sdd/2026-11-27-my-style-size/progress.md`, a `Ruling:` line for each judgment call.

## Review Focus

1. A shopper whose bust is below XS (e.g. 72 cm) → `XS`, not null (existing smallest-size rule); pin in Task 2.
2. A NULL-audience product named "Mens Kurta Pajama" or "Girls Kurti" → no standard chart; pin in Task 2.
3. A store chart that only lists XL, shopper is M → label XL from the store chart; shopper above XL → null, standard chart NOT used; pin in Task 4.
4. Retailer leaves some dims blank for some sizes (bust only for S, M) → chart keeps only filled dims; all blank → `null`; pin in Task 3.
5. Feed with measurements but kids flag on → no card has a label and `meta.size_matches` is `null`; pin in Task 4.

---

### Task 1: Rising-size rule in `parseSizeChart`

**Files:**
- Modify: `packages/shared/src/my-style-size.ts` (`parseSizeChart`)
- Test: `packages/shared/src/my-style-size.test.ts`

**Interfaces:**
- Produces: `parseSizeChart(input: unknown): SizeChart | null` now also returns `null` when, for any dimension, the upper bounds are not strictly rising in `SIZE_OPTIONS` order across the sizes that list that dimension.

- [ ] **Step 1: Write the failing test** `describe('parseSizeChart rising rule')`:
  - `parseSizeChart({ S: { bust: [84, 88] }, M: { bust: [80, 86] } })` → `null`
  - `parseSizeChart({ M: { bust: [89, 94] }, S: { bust: [84, 88] } })` → the chart (key order in the object doesn't matter)
  - `parseSizeChart({ S: { bust: [84, 88] }, M: { hip: [97, 101] }, L: { bust: [95, 99] } })` → the chart (a dimension missing in one size is fine)
- [ ] **Step 2:** `pnpm --filter @kanchuki/shared test -- my-style-size` → the first case FAILS (returns the chart).
- [ ] **Step 3:** After building `out`, for each dim walk sizes sorted by `order()` and reject when an upper bound is `<=` the previous one.
- [ ] **Step 4:** Same command → PASS; then the whole shared suite passes.
- [ ] **Step 5:** Commit `feat(my-style): size charts must rise with size`.

### Task 2: Standard chart + eligibility

**Files:**
- Modify: `packages/shared/src/my-style-size.ts`
- Test: `packages/shared/src/my-style-size.test.ts`

**Interfaces:**
- Consumes: `audienceForText`, `ProductAudienceValue` from `./product-audience.js` (`product-audience` imports `my-style-look`, not `my-style-size`, so there's no cycle).
- Produces:
  - `export const STANDARD_SIZE_CHART: SizeChart` (spec §5.1 values, XS..4XL, bust/waist/hip).
  - `export function standardChartFor(p: { audience: ProductAudienceValue | null; category: string | null; subtype: string | null }): SizeChart | null`

- [ ] **Step 1: Write failing tests** `describe('standardChartFor')`:
  - `parseSizeChart(STANDARD_SIZE_CHART)` deep-equals `STANDARD_SIZE_CHART`.
  - `{ audience: 'WOMEN', category: 'Ladies Suit', subtype: null }` → `STANDARD_SIZE_CHART`; same for `Kurti`, `Kurtis`, `Salwar Suits`, `Gown`, `Tops & Tunics`, `Co-ords`, `Ladies`.
  - `{ audience: null, category: 'Kurta', subtype: null }` → chart; `{ audience: null, category: 'Women Kurti', subtype: null }` → chart.
  - Null: `audience` `'MEN'`, `'GIRLS'`, `'BOYS'`, `'KIDS_UNISEX'` with category `Kurti`; `{ audience: null, category: "Men's Kurta Pajama" }`; `{ audience: null, category: 'Girls Kurti' }`; `{ audience: 'WOMEN' }` with category `Saree`, `Lehenga`, `Dupatta`, `Unstitched Suit`, `Dress Material`, `Blouse Piece`, `Stole`; `{ audience: 'WOMEN', category: 'Laptop Bag' }`; `{ audience: 'WOMEN', category: null, subtype: null }`.
  - `suggestSize({ bust_cm: 72 }, STANDARD_SIZE_CHART, ['XS','S'])` → `{ size: 'XS' }`; `suggestSize({ bust_cm: 91, waist_cm: 76, hip_cm: 99 }, STANDARD_SIZE_CHART, ['S','M','L'])` → `{ size: 'M' }`; `suggestSize({ bust_cm: 125 }, STANDARD_SIZE_CHART, ['4XL'])` → `null`.
- [ ] **Step 2:** Run → FAIL (not exported).
- [ ] **Step 3:** Implement. Eligible audience: `WOMEN`, or `null` with `audienceForText(category, subtype)` neither `MEN` nor a kids value. Text = `` `${category ?? ''} ${subtype ?? ''}`.toLowerCase() ``. Include regex `/\b(kurtis?|kurtas?|suits?|salwar|anarkali|gowns?|tops?|tunics?|co-ords?|ladies)\b/`; exclude regex `/\b(sarees?|sari|dupattas?|lehengas?|unstitched|dress material|blouse piece|fabric|stoles?)\b/`. Exclusion wins.
- [ ] **Step 4:** Run → PASS; whole shared suite passes.
- [ ] **Step 5:** Commit `feat(my-style): standard women's size chart and eligibility`.

### Task 3: Inches ↔ cm chart helpers

**Files:**
- Modify: `packages/shared/src/my-style-size.ts`
- Test: `packages/shared/src/my-style-size.test.ts`

**Interfaces:**
- Produces:
  - `export type InchRows = Record<string, Partial<Record<SizeChartDimension, number>>>` (the "fits up to" value per size per dim, inches)
  - `export function chartFromInches(rows: InchRows): SizeChart | null | 'invalid'`: `null` when every value is blank/absent; `'invalid'` when the built chart fails `parseSizeChart`; otherwise the chart.
  - `export function inchesFromChart(chart: SizeChart): InchRows`: upper ÷ 2.54, rounded to the nearest 0.5.
  - `export function standardInchRows(sizes: readonly string[]): InchRows`: `inchesFromChart(STANDARD_SIZE_CHART)` limited to `sizes` (sizes outside the chart, e.g. 5XL, get no row).

- [ ] **Step 1: Write failing tests:**
  - `chartFromInches({ S: { bust: 34 }, M: { bust: 36 } })` → `{ S: { bust: [81, 86] }, M: { bust: [87, 91] } }` (upper = round(in × 2.54); a dim's first size: lower = upper − 5; next sizes: lower = previous upper of that dim + 1; walk in `SIZE_OPTIONS` order).
  - `chartFromInches({ S: { bust: 34 }, M: { hip: 39 } })` → `{ S: { bust: [81, 86] }, M: { hip: [94, 99] } }`.
  - `chartFromInches({})` and `chartFromInches({ S: {} })` → `null`.
  - `chartFromInches({ S: { bust: 36 }, M: { bust: 34 } })` → `'invalid'`.
  - `inchesFromChart({ M: { bust: [89, 94] } })` → `{ M: { bust: 37 } }`.
  - Round trip: `chartFromInches(inchesFromChart(STANDARD_SIZE_CHART))` is not `'invalid'`, and `suggestSize` gives the same size for bust 85, 91, 100, 118 (all sizes available) as on `STANDARD_SIZE_CHART`.
  - `standardInchRows(['M','5XL'])` → `{ M: { bust: 37, waist: 30.5, hip: 40 } }`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement as specified.
- [ ] **Step 4:** Run → PASS; whole shared suite; then `pnpm --filter @kanchuki/shared build`.
- [ ] **Step 5:** Commit `feat(my-style): inch rows to size chart and back`.

### Task 4: API feed: fallback chart, source, kids guard, counter

**Files:**
- Modify: `apps/api/src/routes/public/public-my-style.ts` (`toCard` ~147, `bodyMeasurements` ~391, meta ~414)
- Test: `apps/api/src/routes/public/__tests__/public-my-style.test.ts` (the size describe ~485-536)

**Interfaces:**
- Consumes: `parseSizeChart`, `standardChartFor`, `suggestSize` (Tasks 1-2).
- Produces: card `suggested_size: { size: string; between?: [string, string]; chart: 'store' | 'standard' } | null`; feed `meta.size_matches: number | null`.

- [ ] **Step 1: Update and add tests.** Existing expectations gain `chart: 'store'` (e.g. `{ size: 'M', chart: 'store' }`). The existing "null for a product with no chart" test must give its rows a non-eligible category (e.g. `category: 'Saree'`), or they now get the standard chart. New tests:
  - no store chart, `audience: 'WOMEN'`, `category: 'Kurti'`, `sizes: ['S','M','L']`, bust 91 → `{ size: 'M', chart: 'standard' }`.
  - same with `sizes: []` → `null`.
  - store chart `{ XL: { bust: [100, 104] } }`, sizes `['M','XL']`, category Kurti: bust 91 → `{ size: 'XL', chart: 'store' }`; bust 110 → `null` (standard not used).
  - kids feed (`kids: true`) with measurements and a kids product carrying a valid store chart → every `suggested_size` is `null`, and `meta.size_matches` is `null`.
  - `meta.size_matches`: two eligible sized products + one Saree, measurements saved → `2`; no measurements → `null`; measurements but nothing matches → `0`.
  - Existing "never reorders" test still passes.
- [ ] **Step 2:** `pnpm --filter @kanchuki/api test -- public-my-style` → new tests FAIL.
- [ ] **Step 3:** Implement. One local `sizeFor(p, body)`: `const store = parseSizeChart(p.size_chart)`; `const chart = store ?? standardChartFor(p)`; `suggestSize(body, chart, p.sizes)` tagged `chart: store ? 'store' : 'standard'`. Both `toCard` and the `size_matches` count over `inRange` use `sizeFor`, so the card and the count never disagree. `bodyMeasurements` is `null` when `b.kids`. `size_matches` is `null` when `bodyMeasurements` is null.
- [ ] **Step 4:** Same command → PASS; whole API suite; `pnpm --filter @kanchuki/api typecheck`.
- [ ] **Step 5:** Commit `feat(my-style): standard size chart fallback, kids guard, size_matches`.

### Task 5: Web card label

**Files:**
- Modify: `apps/web/src/app/(shopper)/my-style/lib.ts` (`SuggestedSize` ~41, feed meta type), `apps/web/src/app/(shopper)/my-style/StyleCard.tsx` (~86)
- Test: `apps/web/src/app/(shopper)/my-style/__tests__/redesign.test.tsx` (the file that already asserts `data-testid="suggested-size"`)

**Interfaces:**
- Produces: `SuggestedSize = { size: string; between?: [string, string]; chart: 'store' | 'standard' }`; feed meta type gains `size_matches?: number | null`.

- [ ] **Step 1: Failing tests:** `chart: 'store'` → `suggested-size` text exactly `Your size: M`; `chart: 'standard'` → text starts `Your size: M · standard chart`, the element has `title="Based on a standard size chart. Store sizes may differ."` and sr-only text with the same sentence; between still renders `(between M and L)`.
- [ ] **Step 2:** `pnpm --filter @kanchuki/web test -- redesign` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; web typecheck.
- [ ] **Step 5:** Commit `feat(my-style): show which chart backs the size`.

### Task 6: Measurements card: counter, illustrated guide, no-tape fallback

**Files:**
- Modify: `apps/web/src/app/(shopper)/my-style/MeasurementsCard.tsx` (guide `<details>` ~240), `apps/web/src/app/(shopper)/my-style/page.tsx` (`<MeasurementsCard>` ~627, Size `<select>` ~426)
- Test: the existing MeasurementsCard test under `apps/web/src/app/(shopper)/my-style/__tests__/`, or create `measurements-card.test.tsx`

**Interfaces:**
- Produces: `MeasurementsCard` props gain `sizeMatches?: number | null` and `onPickUsualSize?: () => void`.

- [ ] **Step 1: Failing tests** (`data-testid="size-matches"`):
  - saved bust + `sizeMatches={12}` → `Your size is shown on 12 products in your feed`; `sizeMatches={0}` → `No product in your feed has a size for your measurements yet`; `null`/`undefined` → absent; no saved measurements + `sizeMatches={3}` → absent.
  - The guide renders 3 `svg` with `role="img"` and `aria-label` `Bust`, `Waist`, `Hip`, and the line `Measure over light clothing, tape snug, not tight`.
  - Button `No tape? Pick your usual size` calls `onPickUsualSize` once; absent when the prop is absent.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. SVGs inline (simple outline + one tape line each), existing theme classes. In `page.tsx`: pass `sizeMatches={view.kind === 'ok' ? (view.meta.size_matches ?? null) : null}`; add a `ref` on the Size `<select>`; `onPickUsualSize` = `scrollIntoView({ block: 'center' })` then `focus()`.
- [ ] **Step 4:** PASS; whole web suite; web typecheck.
- [ ] **Step 5:** Commit `feat(my-style): size payoff counter and illustrated measuring guide`.

### Task 7: Mobile retailer size-chart section

**Files:**
- Create: `apps/mobile/src/components/product-detail/SizeChartEditor.tsx`
- Modify: `apps/mobile/app/product/add.tsx` (Sizes ~1191, payload ~474), `apps/mobile/src/components/product-detail/ProductAttributesForm.tsx` (below Sizes chips), `apps/mobile/src/hooks/useProductDetailForm.ts` (state, load, save payload ~143)
- Test: `apps/mobile/__tests__/product/size-chart-editor.test.tsx`

**Interfaces:**
- Consumes: `InchRows`, `chartFromInches`, `inchesFromChart`, `standardInchRows`, `parseSizeChart` (Tasks 1, 3).
- Produces:
  - `SizeChartEditor({ sizes: string[]; rows: InchRows; onChange: (rows: InchRows) => void; error: string | null })`
  - `export function sizeChartPayload(rows: InchRows): { size_chart: SizeChart | null } | { error: string }` (same file): `'invalid'` → `{ error: 'Each size must be bigger than the one before' }`.
  - Both forms hold `rows: InchRows`. Save calls `sizeChartPayload`; on `error`, show it and don't call the API. Edit loads `rows = inchesFromChart(parseSizeChart(product.size_chart) ?? {})` and sends `size_chart` only when the rows were touched (the `stockTouched` pattern). Rows for sizes that are no longer ticked are dropped before save.

- [ ] **Step 1: Failing tests** (pattern of `audience-chips.test.tsx`; testIDs `size-chart-toggle`, `size-chart-standard`, `size-chart-{size}-{dim}`):
  - `sizes={[]}` → renders nothing.
  - `sizes={['S','M']}` → collapsed shows the nudge, no inputs; pressing `size-chart-toggle` shows inputs for S and M × bust/waist/hip.
  - Pressing `size-chart-standard` calls `onChange` with `standardInchRows(['S','M'])`.
  - Typing `36` into `size-chart-M-bust` → `onChange` with M bust `36`; clearing it removes the key.
  - The `error` prop renders its text.
  - `sizeChartPayload({ S: { bust: 36 }, M: { bust: 34 } })` → `{ error: 'Each size must be bigger than the one before' }`; `sizeChartPayload({})` → `{ size_chart: null }`; `sizeChartPayload({ S: { bust: 34 } })` → `{ size_chart: { S: { bust: [81, 86] } } }`.
- [ ] **Step 2:** `pnpm --filter @kanchuki/mobile test -- size-chart-editor` → FAIL.
- [ ] **Step 3:** Implement the component (numeric `TextInput`, `keyboardType="decimal-pad"`, `AnimatedPressable` per repo convention) and wire both forms.
- [ ] **Step 4:** PASS; whole mobile suite; mobile typecheck.
- [ ] **Step 5:** Commit `feat(mobile): optional size chart in the product form`.

### Task 8: Docs, final verification

**Files:**
- Modify: `docs/build-log/part-7.md` (new 2026-11-27 Phase 4 entry), `docs/tasks/pending/customer-profile-research.md` (status line; §7.5 note that the retailer UI was not built before Phase 4), `docs/PRO-REQUIREMENTS.md` §42 (one update line), spec status line (built, not device-tested)

- [ ] **Step 1:** Write the entries: what shipped, rulings, no migration, device checklist unchecked.
- [ ] **Step 2:** At repo root: `pnpm --filter @kanchuki/shared build && pnpm typecheck && pnpm test && pnpm biome check .` → all green. Record counts in the ledger.
- [ ] **Step 3:** Commit `docs(my-style): Phase 4 size build log`.
- [ ] **Step 4:** Stop. Ask the owner before push. After approval: `git push -u origin feat/my-style-size`, then `gh pr create` with body: rulings, deferred minors (Phase 3 list + saved usual-size editor), §10 device checklist unchecked.
