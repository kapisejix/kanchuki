# My Style Phase 3: Style Passport (design)

Date: 2026-11-27. Branch: `feat/my-style-passport` (from main `6d36c5bd`).
Source: `docs/tasks/pending/customer-profile-research.md` §7.1, §7.4, §9, §10 Phase 3, §11 D6/D7.

## 1. Intent

Every customer input must visibly change what they see. Today the profile is split over
`/my-profile`, `/my-style` and the device; `gender` is never set and never used (women see
men's wear); `pref_styles` is collected and ignored; the shortlist lives on one phone; no card
says why it ranks high. Phase 3 puts the profile in one place and makes each input pay off.

## 2. Goals

1. **Style Passport** (D7): a section at the top of `/my-profile`, linked from `/my-style`.
   Completeness bar + colours block (same content as the My Style result screen) + size +
   taste + "Show me" picker.
2. **Gender picker + feed default** (D6): "Show me: Women's / Men's / Both". Feed defaults to it,
   with a visible per-visit toggle on `/my-style` to show other wear.
3. **Synced shortlist**: the account wishlist becomes the My Style shortlist ("Saved looks").
4. **`pref_styles` ranked**: small fit boost when a chosen style matches a product.
5. **Reason chips**: at most 2 "why this matches" chips per feed card.

## 3. Non-goals / out of scope

D1 stored thumbnail, D2 full-body, D3 body scan, size charts (Phase 4), MediaPipe, new
migrations, a city field (feed uses device location, then the existing `city`), tuning weights,
Phase 2 known gaps (manual pick, Adjust on PaletteCard, example photos).

## 4. Anti-goals

- Any body or skin label shown to the customer (frame stays hidden; chips never mention it).
- Gender hiding products with no audience (NULL audience = adult unisex/unclassified, must stay).
- Chips that claim something the ranker did not compute (RC-059: no canned reasons).
- Losing a customer's existing on-device shortlist during the switch.

## 5. Constraints

- No schema change: `customer_accounts.gender` (enum `MALE`/`FEMALE`, nullable) and
  `customer_wishlist_items` already exist. Nothing to apply in prod.
- Feed stays signed-in only; prices stay paise (RC-055); feed stays `no-store`.
- Passport proxy (`apps/web/src/app/api/passport/[...path]/route.ts`) is an exact-path
  allowlist per verb. New verbs get their own narrow list (like `PATCH_PATHS`).
- Fastify v5 rejects an empty JSON body: DELETE sends a JSON body.
- Local gate before push: `pnpm --filter @kanchuki/ai build`, tsc shared/ai/api/web, Biome on
  changed files, web + api tests (Actions blocked by billing).

## 6. Approaches (owner picked 2026-11-27)

**Shortlist.** A (picked): wishlist is the single source when signed in; on-device items are
copied up once and the device copy cleared. B: keep the device copy and two-way sync, rejected
(merge bugs, two truths). Trade-off accepted: store-page hearts (signed-in) and the My Style
shortlist become one "Saved looks" list.

**Passport components.** A (picked): `/my-profile` imports `PaletteCard`, `TasteCard`,
`MeasurementsCard` from `../my-style/` and reads `GET /v1/public/my-style/profile`; Retake /
Adjust / quiz buttons link to `/my-style` (camera and drape test live there). B: move cards to a
shared folder first, rejected (churn, no third user).

## 7. Design

### 7.1 Gender ("Show me")

- API `PUT /passport/preferences` accepts `gender: 'FEMALE' | 'MALE' | null` (optional).
  `GET /passport/preferences` returns it.
- Passport UI: 3-option segmented control "Women's wear / Men's wear / Both" → FEMALE / MALE /
  null. Copy: "Sets what your My Style feed shows first. You can still see everything."
- Feed: `adultsWhere(gender?)`:
  - FEMALE → `audience = WOMEN` OR (`audience IS NULL` AND not-kids-by-keyword)
  - MALE → `audience = MEN` OR (same NULL arm)
  - null or `all_wear` → today's query (WOMEN, MEN, NULL arm). Kids path untouched.
- Feed body gains `all_wear: boolean` (default false). Feed meta returns
  `gender_filter: 'FEMALE' | 'MALE' | null` (null = not filtering) so the page knows to show
  the toggle.
- `/my-style` toggle shown only when the account has a gender: "Showing women's wear · Show all".
  Page state only, resets next visit (owner: a toggle, not a second setting).
- Complete the look uses the same `adultsWhere(gender)` with the same `all_wear` flag.

### 7.2 `pref_styles` boost

- `RankProfile.styles: readonly string[]`; feed passes `account.pref_styles`.
- `MY_STYLE_FIT.prefStyle = 0.05` in `packages/shared/src/my-style-weights.ts`.
- Match: a chosen style appears as whole words inside any candidate keyword (same whole-word
  regex shape as `FRAME_RX`, case-insensitive, regex-escaped, built once per request).

### 7.3 Reason chips

- `fit()` also reports which parts matched; `rankProducts` returns `reasons` on each
  `RankedItem`, ordered by weight: `palette` (good family only, never avoid), `occasion`,
  `color`, `style`, `fabric`. Positive matches only.
- `toCard` adds `size` when the feed's `size` filter (body `size`) is in the product's `sizes`
  (unsized products get no size chip), and `near` when
  `distance_km` ≤ 3.
- Each card carries `reasons: { code, detail? }[]`, max 2 (ranker reasons first, then size,
  then near). `detail` = the matched occasion / style / fabric / size, or the km.
  Meta `rationale_source: 'rules'` (type widens from `'none'`).
- Web maps codes to copy: `palette` "Your colour" · `occasion` "For {detail}" · `color`
  "Colour you like" · `style` "{detail}, your style" · `fabric` "{detail}, you like it" ·
  `size` "Size {detail} in stock" · `near` "{detail} km away".
- Find similar feed: reasons still computed; no similarity chip (the banner already says it).

### 7.4 Synced shortlist

- API `DELETE /passport/wishlist` body `{ product_id }` → deletes that row for the session
  account only; 200 `{ ok: true }` even if absent (idempotent). 401 without session.
- Proxy: `DELETE` handler + `DELETE_PATHS = ['wishlist']`.
- Web `shortlist.ts`: load = `GET /api/passport/wishlist` mapped to `ShortItem` (`photo_url`,
  `retailer.shop_name`, `retailer.public_slug`; rows without a slug dropped, as today).
  Add = POST, remove = DELETE; optimistic, rolled back with an inline error on failure.
- One-time move: on first load, if `localStorage['my-style:shortlist']` has items, POST each
  (404 = product gone, skip); remove the key only when every call settled without a network
  error, else keep it and retry next load.
- `MAX_PER_STORE` (20) still enforced client-side.
- `/my-profile` Saved list gains a remove button (same DELETE).

### 7.5 Style Passport on `/my-profile`

New `apps/web/src/app/(shopper)/my-profile/StylePassport.tsx`, rendered at the top of the page
with `id="passport"`:

```
Style Passport                         [Open My Style →]
2 of 3 done  ▓▓▓▓▓▓░░░
  ✓ Colours  ✓ Taste  ○ Size — "Add your size to see it on products (coming soon)"
[PaletteCard]          or  "Find your colours" → /my-style?retake=1
[Measurements summary] or  "Add your size" → /my-style
[TasteCard]            or  "Take the 1-minute quiz" → /my-style
Show me: (Women's wear) (Men's wear) (Both)
```

- Data: `GET /v1/public/my-style/profile` (existing) + preferences the page already loads.
- Completeness, 3 steps (pure fn, unit-tested): colours = `style_profile` set; size =
  `measurements` set or `usual_size`; taste = `taste` set or `pref_styles` non-empty.
  **Call:** "Show me" is a setting, not a step, because "Both" = null cannot be told apart
  from "never chosen" without a migration.
- PaletteCard `onRetake` → `/my-style?retake=1` (page opens the analyze sheet on that param);
  `onShop` → `/my-style?palette=1` (page starts with Shop my colours on).
- `/my-style` header gets a "Style Passport" link to `/my-profile#passport`.
- Existing `/my-profile` sections stay below, unchanged except Saved remove.
- Profile fetch failure: the Passport shows "Couldn't load your style profile. Retry." and the
  rest of the page still works.

## 8. Testing (tests first)

- api `my-style-rank.test.ts`: style boost; reasons order; avoid never a reason.
- api `my-style-candidates.test.ts`: `adultsWhere('FEMALE')` keeps NULL arm, excludes MEN.
- api `public-my-style.test.ts`: gender default, `all_wear`, meta `gender_filter`,
  `rationale_source: 'rules'`, ≤2 reasons incl. size/near.
- api `passport-preferences.test.ts`: gender round trip, bad value 400.
- api wishlist: DELETE idempotent, 401 signed out, only own rows.
- web proxy test: DELETE allowed on `wishlist`, 404 elsewhere.
- web `shortlist.test.ts`: server load mapping; move clears key only on success.
- web `/my-profile`: Passport blocks, completeness, gender save, profile-load failure.
- web `/my-style`: toggle only with `gender_filter`, sends `all_wear`; chips render; `retake=1`
  opens the sheet.

## 9. Left to the builder

Copy polish, chip styling (reuse existing chip classes in `ui`).

## 10. Docs after ship

`docs/build-log/part-7.md`, PROJECT-MEMORY row 102, research doc §3 (mark gaps fixed), RC row
for any bug found.
