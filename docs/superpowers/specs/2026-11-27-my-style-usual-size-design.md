# My Style B2: usual size first, inches for measurements (design)

Status: **approved 2026-11-27 (P1-P7 as written).** Branch `feat/my-style-usual-size` off `origin/main` 4f6ef16a (PR #370 still open, not stacked). No migration.
Source: device test B2 (`.superpowers/sdd/2026-11-27-my-style-device-test/progress.md`, "B2 brainstorm"), Phase 4 spec `2026-11-27-my-style-size-design.md`, research `docs/tasks/pending/customer-profile-research.md` §7.1, §7.5, §12.

## 1. Intent

Most shoppers know their size, few own a tape. Today the only way to get "Your size" on a card is bust/waist/hip in cm. B2 puts **"Pick your usual size"** first, saves it to the account, and moves custom measurements to inches (how Indians measure). Usual size is a **label only**: it never filters or reorders the feed.

## 2. What exists (verified on origin/main 4f6ef16a)

- `customer_accounts.usual_size String?` exists. No shopper writer. Read by `passport-session.ts:30` (→ `/my-profile` Passport block) and exported (`passport-data.ts:52`).
- **Hidden filter:** `public-my-style.ts:247` feed `size: (b.size ?? account.usual_size)` and `:560` Complete the look `size: account.usual_size` (kids feed too). Dormant only because nothing writes the column.
- **Erasure gap:** `usual_size` is in neither `STYLE_PROFILE_CLEARED` (erasure + photo "Clear my data") nor `MEASUREMENTS_CLEARED` ("Remove my measurements"), both in `apps/api/src/lib/my-style-consent.ts`.
- Label: `sizeFor(p, body)` (`public-my-style.ts:150`) → `{ size, between?, chart: 'store' | 'standard' }`; `size_matches` counter counts it; both null without bust/waist/hip and on the kids feed.
- `MeasurementsCard.tsx`: bust/waist/hip in cm, height cm with a ft/in toggle (default cm), "No tape? Pick your usual size" scrolls to the per-visit Size filter.
- Inch maths inline in `chartFromInches` / `inchesFromChart` (`packages/shared/src/my-style-size.ts:125-160`), `CM_PER_INCH` private.
- Retailer `Customer.usual_size` (`customers.ts`, `growth-sizes.ts`) is a different model. Untouched.

## 3. Owner decisions (2026-11-27, fixed)

1. Usual size labels cards only. Remove both hidden fallbacks (:247 → `b.size`, :560 → no size). Size dropdown stays manual, per visit.
2. Measurements card order: (1) "Pick your usual size" XS–4XL, saved to `customer_accounts.usual_size`; (2) "Custom measurements": bust / waist / hip in inches, stored as cm.
3. Inch↔cm helpers extracted from `chartFromInches` / `inchesFromChart` and reused, not duplicated.
4. Honest label: "Your usual size: M" vs "Your size: M · standard chart" / "Your size: M" (store chart).

## 4. Proposed defaults — **owner: confirm or change each**

| # | Proposal | Why |
|---|---|---|
| P1 | **Precedence:** measurements-derived size wins; usual size is the fallback when measurements give no answer for that product (none saved, product not chart-eligible, body above chart). | Measurements are more specific. |
| P2 | **Usual-size label shows on any adult product whose `sizes[]` lists that size**, chart or not, men's included (label only). Empty `sizes[]` = no label (option A holds). Kids feed never sized. Complete the look stays label-free (as Phase 4). | Usual size is the shopper's own claim, not a chart guess, so no eligibility rule needed. |
| P3 | **DPDP:** usual size sits under the body-measurements consent. Wording bump `mystyle-body-1.0 → 1.1` naming "usual size". "Remove my measurements" and erasure / "Clear my data" also clear `usual_size`. | One body-data notice, one withdraw button. |
| P4 | **Existing 1.0 grants are not re-prompted.** `hasLiveBodyConsent` checks the event kind, not the version (today's behaviour); same purpose (suggest a size), less sensitive field. | Re-prompting needs version-aware consent code for ~0 existing grants. Say if you want re-prompt. |
| P5 | Height input defaults to ft/in (cm toggle stays). | Matches inches for body. |
| P6 | **Counter** (`size_matches`) counts usual-size labels too, so "Your size is shown on N products" is right for a usual-size-only shopper. | Same `sizeFor` feeds both, can't drift. |
| P7 | Passport progress copy "Your size shown on products (coming soon)" → drop "(coming soon)". Passport "Your size" block shows inches + ft/in. | It's live now. |

## 5. Design

### 5.1 Shared (`packages/shared/src/my-style-size.ts`)

*Plan ruling: the unit helpers go in `my-style-measurements.ts` (header: "the only unit conversion lives here"; `feetInchesToCm` is there and `my-style-size.ts` already imports it). `USUAL_SIZE_OPTIONS` stays in `my-style-size.ts`.*

```ts
export const CM_PER_INCH = 2.54;
export const inchesToCm = (inches: number) => Math.round(inches * CM_PER_INCH);    // integer cm, as stored
export const cmToInches = (cm: number) => Math.round((cm / CM_PER_INCH) * 2) / 2; // nearest 0.5"
export const USUAL_SIZE_OPTIONS = SIZE_OPTIONS.slice(0, 8); // XS..4XL, same span as STANDARD_SIZE_CHART
```

`chartFromInches` / `inchesFromChart` call these (behaviour unchanged, existing tests stay green). Consent copy in `my-style-measurements.ts`: version `mystyle-body-1.1`, intro names usual size.

### 5.2 API

- **Writer = `POST /v1/public/my-style/measurements`** (not `PUT /passport/preferences`): it already has the body-consent gate, rate limit and `no-store`. `MeasurementsSchema` gains `usual_size: z.enum(USUAL_SIZE_OPTIONS).nullable().optional()`; `null` clears it. The "at least one" refine counts it. `measurements_at` is set only when a body number is sent. *Ruling: preferences has no consent gate; putting body data there would skip it.*
- `savedProfile` returns `usual_size` so the card reads it back. A usual-size-only account still counts as "has saved body data", so the card skips the consent step for a shopper who already consented.
- `MEASUREMENTS_CLEARED` and `STYLE_PROFILE_CLEARED` gain `usual_size: null`.
- `sizeFor(p, body, usual)`: measurement suggestion if any, else (`usual && p.sizes.includes(usual)`) → `{ size: usual, chart: 'usual' }`, else null. Feed passes `usual = b.kids ? null : account.usual_size`. `size_matches` non-null when body **or** usual (P6). Complete the look unchanged (no label).
- Remove the two hidden filters (§3.1).

### 5.3 Web

- `StyleCard`: `chart === 'usual'` → "Your usual size: M"; others unchanged.
- `MeasurementsCard` (after the consent step, which is unchanged):
  1. **"Your usual size"**: XS–4XL chip row (radio group), Save, "Clear" when set. Same `saveMeasurements` call with `{ usual_size }`.
  2. **"Custom measurements"** (collapsed when a usual size is set and no measurements saved; open otherwise): bust / waist / hip in **inches** (step 0.5), height ft/in by default. Validation keeps today's cm ranges, message shown in inches. Initial values via `cmToInches`.
  - The "No tape? Pick your usual size" button and the `onPickUsualSize` scroll-to-filter prop are deleted (the picker is now in the card).
- `StylePassport` "Your size" block: "Usual size M · Height 5 ft 4 in · Bust 34 in · …"; progress copy per P7.

## 6. Data, security, compliance

No migration, no new column, no new consent purpose. Usual size is shopper-only like the measurements, never shown to a store. Export already covers it; erasure, "Clear my data" and "Remove my measurements" now clear it (§12: erasure covers every column). No AI call. No SECURITY.md §12-18 change.

Prod check before merge (read-only): `SELECT count(*) FROM customer_accounts WHERE usual_size IS NOT NULL`, expected 0; if not 0, those rows start showing labels (never filters).

## 7. Tests (TDD)

- Shared: `inchesToCm` / `cmToInches` values + 0.5 rounding; chart helpers still green; consent version is 1.1.
- API: feed no longer filters by `usual_size` (product without that size still returned); Complete the look no size filter; label precedence (measurements win, usual fallback, `sizes[]` must list it, empty `sizes[]` null, kids null); `size_matches` with usual only; `/measurements` accepts `usual_size` alone, `null` clears, rejects `5XL` / `FREE`, still needs consent; withdraw + clear + erasure null `usual_size`; `savedProfile` returns it.
- Web: card label copy for `usual`; picker saves / clears; inches in → cm payload; cm → inches on load; height ft/in default; Passport copy.
- Whole suite + tsc + Biome locally, every package (Actions blocked by billing).

## 8. Out of scope

Deferred minors in the progress ledger (half-inch waist XS/S shift, SizeChartEditor draft text, toggle announce, figure name twice, Phase 3 race, CTL gender, Passport Taste stale, wishlist server picks, "0 km away"). Phase 5. Mobile app (no shopper My Style there). Retailer `Customer.usual_size`.

## 9. Device checklist (re-run with owner)

Android Chrome + iOS Safari: B2 pick usual size → cards show "Your usual size: M" only where listed, feed count unchanged; B3 with saved size; B5 inches entry → "Your size: M · standard chart" wins over usual; "Remove my measurements" clears both.
