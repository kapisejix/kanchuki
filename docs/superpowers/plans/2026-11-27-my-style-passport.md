# My Style Phase 3: Style Passport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One Style Passport on `/my-profile`, gender-aware feed with a per-visit toggle, ranked `pref_styles`, reason chips, and the account wishlist as the My Style shortlist.

**Architecture:** Ranker reports matched fit parts; the feed route turns them into <=2 reason codes per card and filters adults by `customer_accounts.gender` unless `all_wear`. Wishlist gains DELETE and becomes the shortlist store. `/my-profile` renders existing My Style cards from `GET /my-style/profile`.

**Tech Stack:** Fastify v5 + Prisma + zod (api), Next.js app router + React + vitest/RTL (web), `@kanchuki/shared`.

**Spec:** `docs/superpowers/specs/2026-11-27-my-style-passport-design.md`

## Global Constraints

- No migration, no schema change. `gender` enum `MALE`/`FEMALE`, nullable.
- NULL `audience` products always stay in the adult feed (keyword not-kids arm unchanged).
- Prices stay paise. Feed/profile responses stay `Cache-Control: private, no-store`.
- Chips only from computed matches; `palette` chip only for a good family, never avoid.
- Max 2 reasons per card; `near` threshold `distance_km <= 3`.
- `MY_STYLE_FIT.prefStyle = 0.05`.
- No body/skin label in any new UI copy.
- Before push: `pnpm --filter @kanchuki/ai build`; typecheck shared/ai/api/web; `npx biome check <changed files>`; `pnpm --filter @kanchuki/api test`; `pnpm --filter @kanchuki/web test`.

## Review Focus

1. Account with `gender` set and a catalogue of only NULL-audience products -> feed not empty (Task 2 test).
2. Style chip text with regex chars (`"A-line (long)"`) -> no throw, matches literally (Task 1 test).
3. Wishlist DELETE for another account's product -> deletes nothing of theirs (Task 4 test).
4. Shortlist move when one POST 404s and another fails on network -> key kept, retried next load (Task 5 test).
5. `/my-profile` when `GET /my-style/profile` fails -> Passport shows retry, rest of page renders (Task 7 test).

---

### Task 1: Ranker, `pref_styles` boost + reasons

**Files:** Modify `packages/shared/src/my-style-weights.ts` (`MY_STYLE_FIT`), `apps/api/src/lib/my-style-rank.ts`. Test `apps/api/src/lib/my-style-rank.test.ts`.

**Interfaces (produces):** `RankProfile.styles?: readonly string[]`; `type FitReason = { code: 'palette'|'occasion'|'color'|'style'|'fabric'; detail?: string }`; `RankedItem.reasons: FitReason[]` ordered palette, occasion, color, style, fabric. `detail` = matched occasion / style / fabric as the profile spelt it.

- [ ] Step 1, failing tests (`describe('pref_styles + reasons')`): `styles:['Anarkali']` + keyword `'anarkali suit'` beats `'straight kurti'` by `0.45*0.05` (`toBeCloseTo(0.0225,4)`); `styles:['A-line (long)']` + keyword `'a-line (long) kurti'` -> no throw, reason `{code:'style',detail:'A-line (long)'}`; keyword `'a-linexlong'` -> no style reason; palette good + occasion hit -> codes `['palette','occasion']`, occasion detail = profile occasion; avoid family -> no palette reason; nothing matched -> `[]`.
- [ ] Step 2: `pnpm --filter @kanchuki/api exec vitest run src/lib/my-style-rank.test.ts` -> FAIL.
- [ ] Step 3: add `prefStyle: 0.05`; `fit()` returns `{ value, reasons }`; one escaped whole-word regex per request (shape of `FRAME_RX`, `i` flag), first matching style reported. Frame/kids-age give no reason.
- [ ] Step 4: `pnpm --filter @kanchuki/shared build` + rerun -> PASS.
- [ ] Step 5: commit `feat(my-style): rank pref_styles and report fit reasons`.

### Task 2: Gender-aware adult filter

**Files:** Modify `apps/api/src/lib/my-style-candidates.ts`. Test `apps/api/src/lib/my-style-candidates.test.ts`.

**Interfaces (produces):** `adultsWhere(gender?: 'FEMALE'|'MALE'|null)`; `CandidateQuery.gender?: 'FEMALE'|'MALE'|null` (null/undefined = both).

- [ ] Step 1, failing tests: `'FEMALE'` -> first arm `{audience:{in:['WOMEN']}}`, NULL arm identical to `adultsWhere()`'s; `'MALE'` -> `['MEN']`; `null` -> `['WOMEN','MEN']`; `loadMyStyleCandidates({...,gender:'FEMALE'})` passes it to `findMany`.
- [ ] Step 2: run file -> FAIL. Step 3: implement, kids path untouched. Step 4: PASS.
- [ ] Step 5: commit `feat(my-style): filter adult feed by saved gender`.

### Task 3: Feed + Complete-the-look route

**Files:** Modify `apps/api/src/routes/public/public-my-style.ts` (`BodySchema`, feed handler, `toCard`, `LookQuerySchema`, look handler). Test `apps/api/src/routes/public/__tests__/public-my-style.test.ts`.

**Interfaces:** consumes Task 1 `reasons`, Task 2 `gender`. Produces card `reasons: {code:'palette'|'occasion'|'color'|'style'|'fabric'|'size'|'near'; detail?: string}[]` (<=2); meta `rationale_source:'rules'`, `gender_filter:'FEMALE'|'MALE'|null`; body `all_wear: boolean` default false; look query `all_wear: z.enum(['1']).optional()`.

- [ ] Step 1, failing tests: `gender:'FEMALE'` -> candidates get `gender:'FEMALE'`, meta `gender_filter:'FEMALE'`; + `all_wear:true` -> `null`/`null`; `kids:true` -> no gender; ranker `[palette,occasion]` + size hit -> only those two; no ranker reasons, body `size:'M'`, sizes `['M']`, distance 1.2 -> `[{code:'size',detail:'M'},{code:'near',detail:'1.2'}]`; unsized -> only near; `pref_styles` -> ranker `styles`; `rationale_source==='rules'`; look `gender:'MALE'` -> slots `gender:'MALE'`, `?all_wear=1` -> `null`.
- [ ] Step 2: run -> FAIL. Step 3: `toCard` appends size then near after ranker reasons, `slice(0,2)`. Step 4: PASS (all `public-my-style*`).
- [ ] Step 5: commit `feat(my-style): gender default, all_wear toggle, reason chips in feed`.

### Task 4: Preferences gender + wishlist DELETE + proxy DELETE

**Files:** Modify `apps/api/src/routes/public/passport/passport-preferences.ts`, `passport-wishlist.ts`, `apps/web/src/app/api/passport/[...path]/route.ts`. Tests: `passport-preferences.test.ts`, new `__tests__/passport-wishlist-delete.test.ts`, proxy `__tests__`.

**Interfaces (produces):** GET preferences adds `gender`; PUT accepts `gender:'FEMALE'|'MALE'|null`; `DELETE /passport/wishlist` body `{product_id}` -> 200 `{ok:true}`; proxy `DELETE` export with `DELETE_PATHS=['wishlist']`.

- [ ] Step 1, failing tests: PUT FEMALE / null / 'X'(400); GET returns gender; DELETE uses `deleteMany({where:{customer_account_id:<session>,product_id}})`, 200 on count 0, 401 no session, 400 no product_id; proxy DELETE `wishlist` forwards body, DELETE `preferences` -> 404.
- [ ] Steps 2-4: FAIL -> implement -> PASS.
- [ ] Step 5: commit `feat(passport): gender preference and wishlist remove`.

### Task 5: Web shortlist on the account wishlist

**Files:** Modify `apps/web/src/app/(shopper)/my-style/shortlist.ts`, `page.tsx` (shortlist state ~154-200). Test `__tests__/shortlist.test.ts`, fix `enquiry.test.tsx` mocks.

**Interfaces (produces):** `fetchShortlist(): Promise<ShortItem[]|null>`; `addShort(id): Promise<boolean>`; `removeShort(id): Promise<boolean>`; `moveDeviceShortlist(): Promise<void>`.

- [ ] Step 1, failing tests: mapping from wishlist row (`photo_url`, `retailer.shop_name`, `retailer.public_slug`), null slug dropped; move: 2x200 -> key removed; 404+200 -> removed; one rejects -> kept. Page: toggle POSTs; failed POST rolls back + `role="alert"` "Couldn't save. Try again.".
- [ ] Steps 2-4: FAIL -> implement (load = move then fetch; optimistic + rollback; `MAX_PER_STORE` kept; header comment updated) -> PASS all `my-style/__tests__`.
- [ ] Step 5: commit `feat(my-style): shortlist synced to the account`.

### Task 6: My Style page, chips + toggle + deep links

**Files:** Modify `my-style/lib.ts` (`FeedCard.reasons`, `FeedMeta.rationale_source:'none'|'rules'`, `gender_filter`, body `all_wear`), `StyleCard.tsx`, `page.tsx`, `LookPanel.tsx`. Tests `page.test.tsx`, `look.test.tsx`.

**Interfaces (produces):** `reasonLabel(r:{code:string;detail?:string}): string|null`. Copy: palette "Your colour"; occasion "For {detail}"; color "Colour you like"; style "{detail}, your style"; fabric "{detail}, you like it"; size "Size {detail} in stock"; near "{detail} km away"; unknown -> null.

- [ ] Step 1, failing tests: `reasonLabel` table; card shows 2 chips; `gender_filter:'FEMALE'` -> "Showing women's wear" + "Show all", click refetches `all_wear:true`, button becomes "Women's wear only"; never-filtered -> no toggle; `?retake=1` opens analyze sheet; `?palette=1` first call `palette_only:true`; header link "Style Passport" -> `/my-profile#passport`.
- [ ] Steps 2-4: FAIL -> implement (keep first `gender_filter` in state so toggle stays after Show all; `useSearchParams`) -> PASS.
- [ ] Step 5: commit `feat(my-style): why-this-matches chips and show-all-wear toggle`.

### Task 7: Style Passport on `/my-profile`

**Files:** Create `apps/web/src/app/(shopper)/my-profile/StylePassport.tsx`. Modify `my-profile/page.tsx` (top render, Saved remove). Tests `__tests__/page.test.tsx`, new `__tests__/passport.test.tsx`.

**Interfaces:** consumes `PaletteCard`, `TasteCard`, `MeasurementsCard`, existing profile fetch helper, Task 4 endpoints. Produces `completeness(profile, usualSize: string|null, prefStyles: string[]): { done: number; total: 3; steps: {key:'colours'|'size'|'taste'; done: boolean}[] }`.

- [ ] Step 1, failing tests: empty 0/3; palette 1; usual_size counts size; pref_styles counts taste. Renders "2 of 3 done"; PaletteCard or "Find your colours" -> `/my-style?retake=1`; Show me radios PUT FEMALE / null, failure reverts + error; profile 500 -> "Couldn't load your style profile." + Retry, name section still renders; `id="passport"`; Saved remove -> DELETE then gone; no `/curvy|petite|undertone|skin/i` text in Passport.
- [ ] Steps 2-4: FAIL -> implement (`onRetake` -> `/my-style?retake=1`, `onShop` -> `/my-style?palette=1`, `onCleared` -> refetch) -> PASS.
- [ ] Step 5: commit `feat(my-profile): Style Passport with completeness and Show me`.

### Task 8: Gate, docs, PR

- [ ] Step 1: all gate commands exit 0.
- [ ] Step 2: `docs/build-log/part-7.md`, PROJECT-MEMORY row 102, research doc §3 (gender, pref_styles, why-this-matches, profile split, shortlist -> Phase 3). Note: no migration, not device-tested.
- [ ] Step 3: commit docs + spec + plan; `git push -u origin feat/my-style-passport`; `gh pr create` with research §10 device checklist unchecked.
