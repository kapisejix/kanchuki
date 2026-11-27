# My Style B2 (usual size first, inches) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shoppers pick a saved usual size (XS–4XL) that labels cards, and enter custom bust/waist/hip in inches (stored cm); the hidden `usual_size` feed filter goes away.

**Architecture:** Shared unit helpers + consent copy → API writes `usual_size` through the consent-gated `POST /my-style/measurements`, clears it everywhere measurements are cleared, and adds a `chart: 'usual'` fallback to the one `sizeFor` that feeds both card label and counter → web card/picker/Passport read it.

**Tech Stack:** TypeScript, Fastify + Prisma (API), Next.js/React + Vitest + Testing Library (web), Vitest (shared). pnpm + turbo monorepo.

**Spec:** `docs/superpowers/specs/2026-11-27-my-style-usual-size-design.md` (approved 2026-11-27, P1–P7 as written).

## Global Constraints

- Branch `feat/my-style-usual-size` (off origin/main 4f6ef16a). No upstream set; push only with owner OK: `git push -u origin feat/my-style-usual-size`.
- No migration. No prod DB write. `usual_size` already exists on `customer_accounts`.
- Retailer `Customer.usual_size` (`customers.ts`, `growth-sizes.ts`): do not touch.
- Usual size never filters or reorders the feed or Complete the look. Size dropdown stays per visit.
- Usual-size picker values: `XS S M L XL XXL XXXL 4XL` only.
- Storage stays integer cm. Inches entered at 0.5 step. Ranges stay `MY_STYLE_MEASUREMENT_RANGES` (cm).
- Card copy: usual → `Your usual size: M`; standard → `Your size: M · standard chart` (unchanged); store → `Your size: M` (unchanged).
- Consent version `mystyle-body-1.1`; intro names usual size.
- Kids feed never gets a label. Complete the look never gets a label.
- Build `shared` + `ai` before API tests (`pnpm --filter @kanchuki/shared build && pnpm --filter @kanchuki/ai build`). API reads shared from `dist`.
- Commit messages end `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Shopper with saved usual size picks a different size in the Size dropdown → feed filtered by the dropdown only; with dropdown "Any size" → nothing filtered. (Task 3 test.)
2. Usual-size-only shopper (no body numbers) sees the saved picker on reload, "Remove my measurements" is offered and clears the size. (Task 2 + Task 4 tests.)
3. Clearing usual size alone (`{ usual_size: null }`) is accepted, not rejected as "Send at least one measurement". (Task 2 test.)
4. Product `sizes[]` stored lower-case (`['m']`) still matches usual size `M`. (Task 3 test.)
5. Inch entry `34.5` saves `88` cm; `abc` / out-of-range shows an inch-worded error and sends nothing. (Task 4 test.)

---

### Task 1: Shared unit helpers, picker sizes, consent 1.1

**Files:**
- Modify: `packages/shared/src/my-style-measurements.ts` (helpers next to `feetInchesToCm`; consent version + intro)
- Modify: `packages/shared/src/my-style-size.ts:125-160` (use helpers; add `USUAL_SIZE_OPTIONS`)
- Test: `packages/shared/src/my-style-size.test.ts`
- Modify: `apps/api/src/routes/public/__tests__/public-my-style-measurements.test.ts:100` (`BODY_VERSION` → `'mystyle-body-1.1'`)

*Ruling: helpers live in `my-style-measurements.ts` (its header says "the only unit conversion lives here"; `my-style-size.ts` already imports it), not `my-style-size.ts` as spec §5.1 sketched.*

**Interfaces — Produces:**
- `inchesToCm(inches: number): number` = `Math.round(inches * 2.54)`
- `cmToInches(cm: number): number` = nearest 0.5"
- `cmToFeetInches(cm: number): { feet: number; inches: number }` (total inches rounded to whole, then split)
- `feetInchesToCm(feet, inches)` now `inchesToCm(feet * 12 + inches)` (same results)
- `USUAL_SIZE_OPTIONS` = `SIZE_OPTIONS.slice(0, 8)` as a const tuple usable in `z.enum`; `type UsualSize`
- `MY_STYLE_BODY_CONSENT.version === 'mystyle-body-1.1'`

- [ ] **Step 1: Failing tests** in `my-style-size.test.ts`, `describe('unit helpers')`:

```ts
expect(inchesToCm(34)).toBe(86);
expect(inchesToCm(34.5)).toBe(88);
expect(cmToInches(86)).toBe(34);
expect(cmToInches(88)).toBe(34.5);
expect(cmToFeetInches(163)).toEqual({ feet: 5, inches: 4 });
expect(cmToFeetInches(152)).toEqual({ feet: 5, inches: 0 });
expect(feetInchesToCm(5, 4)).toBe(163);
expect(USUAL_SIZE_OPTIONS).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL']);
expect(Object.keys(STANDARD_SIZE_CHART)).toEqual([...USUAL_SIZE_OPTIONS]);
expect(MY_STYLE_BODY_CONSENT.version).toBe('mystyle-body-1.1');
expect(MY_STYLE_BODY_CONSENT.intro).toMatch(/usual size/i);
```

- [ ] **Step 2:** `pnpm --filter @kanchuki/shared test -- my-style-size` → FAIL (not exported).
- [ ] **Step 3:** Implement. `chartFromInches` uses `inchesToCm`, `inchesFromChart` uses `cmToInches`; drop the private `CM_PER_INCH`. Intro: `'My Style can use your usual size, height, bust, waist and hip to suggest the size that is likely to fit. Adults only.'`. Check the other consent `points` for wording that lists only the four numbers; add usual size where they do.
- [ ] **Step 4:** shared tests all PASS (existing chart round-trip tests unchanged). `pnpm --filter @kanchuki/shared build`.
- [ ] **Step 5:** Commit `feat(shared): inch helpers, usual-size options, body consent 1.1`.

---

### Task 2: API write + clear + read back `usual_size`

**Files:**
- Modify: `apps/api/src/routes/public/public-my-style-analyze.ts:79-92` (schema), `:245-275` (handler)
- Modify: `apps/api/src/lib/my-style-consent.ts` (`STYLE_PROFILE_CLEARED`, `MEASUREMENTS_CLEARED`)
- Modify: `apps/api/src/routes/public/public-my-style.ts:100-125` (`savedProfile`)
- Test: `apps/api/src/routes/public/__tests__/public-my-style-measurements.test.ts`, `apps/api/src/routes/public/__tests__/passport-export-delete.test.ts`, profile test in `public-my-style.test.ts`

**Interfaces — Consumes:** `USUAL_SIZE_OPTIONS` (Task 1). **Produces:** profile response `measurements: { height_cm, bust_cm, waist_cm, hip_cm, usual_size: string | null, saved_at } | null`, non-null when any body number **or** `usual_size` is set.

- [ ] **Step 1: Failing tests** (measurements test file, existing mocks):
  - `saves usual_size alone, consent-gated, without stamping measurements_at` → update `data` equals `{ usual_size: 'M' }`.
  - `usual_size: null alone clears it (counts as a sent field)` → 200, update `data` `{ usual_size: null }`.
  - `rejects usual_size '5XL' and 'FREE'` → 400, no update.
  - `usual_size` without live consent and without `consent_version` → 400 like today.
  - Body numbers sent → `measurements_at` stamped (existing test keeps passing).
  - Withdraw test: update `data` includes `usual_size: null`.
  - Erasure and `/profile/clear` update `data` include `usual_size: null` (passport-export-delete test + clear test).
  - Profile: account with only `usual_size: 'L'` → `measurements.usual_size === 'L'`, body fields null; account with nothing → `measurements: null`.
- [ ] **Step 2:** `pnpm --filter @kanchuki/api test -- public-my-style-measurements passport-export-delete public-my-style.test` → new tests FAIL.
- [ ] **Step 3:** Implement. Schema: `usual_size: z.enum(USUAL_SIZE_OPTIONS).nullable().optional()`. Handler: `measurements_at: new Date()` only if one of the four cm fields is in the body. Add `usual_size: null` to both cleared lists. `savedProfile`: include `usual_size` in the condition and the object.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(api): save usual size under body consent, clear it with measurements`.

---

### Task 3: API feed — remove hidden filter, usual-size label + counter

**Files:**
- Modify: `apps/api/src/routes/public/public-my-style.ts:150-160` (`sizeFor`, `toCard`), `:247`, `:398-437`, `:560`
- Test: `apps/api/src/routes/public/__tests__/public-my-style.test.ts`, `apps/api/src/routes/public/__tests__/public-my-style-look.test.ts`

**Interfaces — Produces:** card `suggested_size: { size: string; between?: [string, string]; chart: 'store' | 'standard' | 'usual' } | null`; `sizeFor(p: CandidateRow, body: Body | null, usual: string | null)`; `toCard(p, distanceKm, body?, usual?)`.

- [ ] **Step 1: Failing tests:**
  - Feed: account `usual_size: 'M'`, no `size` query → `loadMyStyleCandidates` called with `size: undefined`; with `size=l` → `'L'` (Review Focus 1).
  - Complete the look: account `usual_size: 'M'` → every `loadMyStyleCandidates` call has `size: undefined`.
  - Label: usual `M`, no body, product `sizes: ['S','M']` → `{ size: 'M', chart: 'usual' }`; `sizes: ['m']` → same (Review Focus 4); `sizes: []` → null; `sizes: ['L']` → null.
  - Precedence: body giving standard `L` on an eligible kurti + usual `M` → `{ size: 'L', chart: 'standard' }`; same body on a men's shirt listing `M` → `chart: 'usual'`.
  - Kids feed (`kids=1`) with usual `M` → every card `suggested_size: null`, `size_matches: null`.
  - `size_matches`: usual only, 2 of 3 candidates list `M` → `2`; no body and no usual → `null`.
- [ ] **Step 2:** `pnpm --filter @kanchuki/api test -- public-my-style.test public-my-style-look` → FAIL.
- [ ] **Step 3:** Implement. `:247` → `size: b.size?.toUpperCase()`. `:560` → drop the `size` line. `sizeFor`: body suggestion first (existing code, only when `body`), else `usual && p.sizes.some((s) => s.toUpperCase() === usual)` → `{ size: usual, chart: 'usual' as const }`, else null. Feed: `const usual = b.kids ? null : (account.usual_size?.toUpperCase() ?? null)`; pass to `toCard`; `size_matches: bodyMeasurements || usual ? count : null`. Update the `:157` and `:398` comments to say usual size labels too.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(api): usual size labels cards only, drop hidden usual_size filter`.

---

### Task 4: Web My Style — label, picker first, inches

**Files:**
- Modify: `apps/web/src/app/(shopper)/my-style/lib.ts:25-47` (`Measurements.usual_size: string | null`, `SuggestedSize.chart` adds `'usual'`)
- Modify: `apps/web/src/app/(shopper)/my-style/analyze.ts:373` (`saveMeasurements` body accepts `usual_size?: string | null`)
- Modify: `apps/web/src/app/(shopper)/my-style/StyleCard.tsx:87-100`
- Modify: `apps/web/src/app/(shopper)/my-style/MeasurementsCard.tsx`
- Modify: `apps/web/src/app/(shopper)/my-style/page.tsx:388-395, 641` (delete `pickUsualSize` + prop)
- Test: `apps/web/src/app/(shopper)/my-style/__tests__/MeasurementsCard.test.tsx`; card label test wherever the Phase 4 "standard chart" label is tested (`grep -l "standard chart" __tests__`)

**Interfaces — Consumes:** `USUAL_SIZE_OPTIONS`, `inchesToCm`, `cmToInches`, `cmToFeetInches`, `feetInchesToCm`, `MY_STYLE_BODY_CONSENT` (Task 1); profile `measurements.usual_size` (Task 2); `chart: 'usual'` (Task 3).

- [ ] **Step 1: Failing tests:**
  - StyleCard `chart: 'usual'` → text `Your usual size: M`, no "standard chart".
  - Card with `initial` holding only `usual_size: 'M'` → no consent step; radio `M` has `aria-checked="true"`; "Remove my measurements" shown.
  - Pick `L`, Save → `saveMeasurements` called with `{ usual_size: 'L', consent_version: 'mystyle-body-1.1' }`; Clear → `{ usual_size: null, consent_version: 'mystyle-body-1.1' }`.
  - Picker heading comes before the "Custom measurements" heading in DOM order.
  - Bust label says `(inches)`; type `34.5`, Save → payload `bust_cm: 88` (Review Focus 5); `abc` → error mentioning inches, no call.
  - Initial `bust_cm: 86` → bust input value `34`.
  - Height shows ft/in inputs by default; initial `height_cm: 163` → `5` / `4`; "Use cm" toggle still works.
  - "No tape? Pick your usual size" button is gone.
- [ ] **Step 2:** `pnpm --filter @kanchuki/web test -- MeasurementsCard` (+ label test file) → FAIL.
- [ ] **Step 3:** Implement. Picker = `role="radiogroup"` of buttons with `role="radio"` / `aria-checked`, one per `USUAL_SIZE_OPTIONS`, plus Save and (when saved) Clear, inside the post-consent form, above "Custom measurements". Custom section is a `<details>`, collapsed when `usual_size` is set and no body numbers, open otherwise. Inch error: `` `${LABEL[f]} should be between ${cmToInches(r.min)} and ${cmToInches(r.max)} inches.` ``; convert with `inchesToCm`, then `inMeasurementRange`. `ftIn` initial `true`; seed feet/inches from `cmToFeetInches(initial.height_cm)`. Remove-button condition includes `usual_size`. Delete `onPickUsualSize` prop, `pickUsualSize` and its call site.
- [ ] **Step 4:** Same tests → PASS; `pnpm --filter @kanchuki/web exec tsc --noEmit` clean.
- [ ] **Step 5:** Commit `feat(web): usual size picker first, measurements in inches`.

---

### Task 5: Web Passport "Your size" block

**Files:**
- Modify: `apps/web/src/app/(shopper)/my-profile/StylePassport.tsx:21, 218-230`
- Test: `apps/web/src/app/(shopper)/my-profile/__tests__/passport.test.tsx`

**Interfaces — Consumes:** `cmToInches`, `cmToFeetInches` (Task 1).

- [ ] **Step 1: Failing tests:** usual `M`, `height_cm: 163`, `bust_cm: 86` → text `Usual size M · Height 5 ft 4 in · Bust 34 in`; progress step text `Your size shown on products` with no `(coming soon)`.
- [ ] **Step 2:** `pnpm --filter @kanchuki/web test -- passport` → FAIL.
- [ ] **Step 3:** Implement with the helpers.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(web): Passport size block in inches`.

---

### Task 6: Full verification + docs

**Files:** `docs/build-log/part-7.md`, `docs/PROJECT-MEMORY.md` (F-045 row 102), `.superpowers/sdd/2026-11-27-my-style-device-test/progress.md`, spec status line.

- [ ] **Step 1:** `pnpm --filter @kanchuki/shared build && pnpm --filter @kanchuki/ai build`, then `pnpm turbo run typecheck` → 0 errors.
- [ ] **Step 2:** `pnpm biome check .` → only error `apps/mobile/expo-env.d.ts` (gitignored, ignore).
- [ ] **Step 3:** `pnpm turbo run test --continue`; any package with 5 s timeouts → re-run `pnpm turbo run test --filter=<pkg> --concurrency=1` → green. Shared's 1 known red = RC-190 (#370), not ours.
- [ ] **Step 4:** Read-only prod check `SELECT count(*) FROM customer_accounts WHERE usual_size IS NOT NULL` → record result in ledger.
- [ ] **Step 5:** Build-log entry (not merged, not device-tested), F-045 row line, ledger rulings, spec status → "built on branch". Commit `docs(my-style): B2 usual size build log`.
- [ ] **Step 6:** Stop. Ask owner before push.
