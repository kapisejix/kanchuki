# Product Audience + Kids Age Group Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retailers set a product's Audience (+ kids Age group); My Style's adult/kids split and the kids form use it, with the keyword rule kept only for products whose audience is NULL.

**Architecture:** Two nullable Postgres enums on `products`. One shared module owns the enums, labels and keyword→audience helper (used by API, mobile, web, backfill). The tagger fills them only while NULL. The My Style candidate query branches on `audience` with an explicit `null` arm so SQL NULL semantics cannot drop rows.

**Tech Stack:** Prisma/Postgres, Fastify + zod, vitest, Expo React Native, Next.js 14, `@kanchuki/shared`.

**Spec:** `docs/superpowers/specs/2026-11-15-product-audience-design.md`

## Global Constraints

- Branch `feat/product-audience` (from `origin/main` `80a473b3`). No deploys, no prod writes, no migration run by me; owner applies `160_product_audience` and runs the backfill.
- Enums exactly: `ProductAudience { WOMEN MEN BOYS GIRLS KIDS_UNISEX }`, `KidsAgeGroup { NEW_BORN AGE_0_2 AGE_3_5 AGE_6_8 AGE_9_12 AGE_13_16 }`; both columns nullable, no default, no index, no CHECK.
- Adult unisex = NULL. `kids_age_group` only kept when audience is BOYS/GIRLS/KIDS_UNISEX.
- KidsForm Girl -> GIRLS or KIDS_UNISEX, Boy -> BOYS or KIDS_UNISEX (hard filter); age is a rank boost only, NULL age neutral.
- Retailer value never overwritten by a re-tag (write only while current value is NULL).
- No new unauthenticated surface; no audience text added to public product cards.
- Local checks only (CI out of minutes): rebuild `packages/shared` before API/web/mobile tests; web tests need `NODE_OPTIONS=--no-experimental-webstorage`; run vitest, `tsc`, biome per package.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Do not merge the PR.

## Review Focus

1. NULL-audience adult product (no kids keyword) still appears in the adult feed (NOT-over-NULL trap). Pinned in Task 4.
2. `audience=WOMEN` product whose category text says "Kids Ethnic Wear" appears in the adult feed, not the kids feed (stored value beats keyword). Task 4.
3. `audience=BOYS` product with category "Ladies" appears in kids feed only. Task 4.
4. PATCH `audience: 'WOMEN'` or `null` clears a stored `kids_age_group`; POST with `WOMEN` + an age ignores the age. Task 3.
5. Re-tag / tagger abstain or return an invalid enum never overwrites or crashes: result is NULL. Task 3.
6. One bad `audience` value on one catalog-import item does not fail the whole import. Task 3.

## File Structure

- Create `packages/shared/src/product-audience.ts` (+ test) — enums, labels, `audienceForText`, `kidsAudiencesFor`.
- Modify `packages/shared/src/index.ts` (export), `packages/shared/src/constants/index.ts` (`demographicForCategory` 3rd param).
- Modify `packages/db/prisma/schema.prisma`; create `packages/db/prisma/migrations/160_product_audience/migration.sql`; modify `docs/DATABASE.md`.
- Modify `apps/api/src/routes/products/products-helpers.ts`, `products-crud.ts`, `apps/api/src/routes/catalog-import.ts` (this is also the bulk-onboard path: `bulk-onboard.tsx` calls it), `apps/api/src/jobs/tag-product.ts`, `packages/ai/src/tagger.ts`.
- Modify `apps/api/src/lib/my-style-candidates.ts`, `my-style-rank.ts`, `apps/api/src/routes/public/public-my-style.ts`, `apps/web/src/app/(shopper)/my-style/{page.tsx,KidsForm.tsx}`.
- Create `apps/mobile/src/components/product-detail/AudienceChips.tsx`; modify `apps/mobile/app/product/add.tsx`, `apps/mobile/src/hooks/useProductDetailForm.ts`, `apps/mobile/src/components/product-detail/ProductAttributesForm.tsx`, `apps/mobile/app/product/catalog-import.tsx`, `apps/mobile/src/lib/api/{products,catalog-import}.ts`.
- Create `apps/api/scripts/backfill-product-audience.ts` (+ test of its pure classifier).

---

### Task 1: Shared audience module

**Files:** Create `packages/shared/src/product-audience.ts`, `packages/shared/src/product-audience.test.ts`; Modify `packages/shared/src/index.ts`, `packages/shared/src/constants/index.ts`.

**Interfaces:**
- Produces: `PRODUCT_AUDIENCES` (readonly tuple, enum order), `KIDS_AGE_GROUPS`, `type ProductAudienceValue`, `type KidsAgeGroupValue`, `AUDIENCE_LABELS: Record<ProductAudienceValue,string>` (Women / Men / Boys / Girls / Kids unisex), `AGE_GROUP_LABELS: Record<KidsAgeGroupValue,string>` (New born / 0–2 yrs / 3–5 yrs / 6–8 yrs / 9–12 yrs / 13–16 yrs), `isKidsAudience(a: ProductAudienceValue | null | undefined): boolean`, `audienceForText(category?: string | null, subtype?: string | null, name?: string | null): ProductAudienceValue | null` (null when unsure; reuses `KIDS_KEYWORDS` and the `demographicForCategory` patterns), `kidsAudiencesFor(who: 'Girl' | 'Boy'): ProductAudienceValue[]` (`['GIRLS','KIDS_UNISEX']` / `['BOYS','KIDS_UNISEX']`), `ageGroupFromLabel(label: string): KidsAgeGroupValue | null` (maps KidsForm strings "0–2 yrs" … "13–16 yrs").
- Changes: `demographicForCategory(category?, name?, audience?: ProductAudienceValue | null)` — WOMEN→womens, MEN→mens, BOYS→kids_boy, GIRLS→kids_girl, KIDS_UNISEX→kids_boy; null/undefined keeps today's keyword behaviour.

- [ ] **Step 1: Failing tests** in `product-audience.test.ts`: `audienceForText('Kids Ethnic Wear')==='KIDS_UNISEX'`; `('Kids','Girls Frock')==='GIRLS'`; `("Men's Kurta Pajama")==='MEN'`; `('Saree')==='WOMEN'`; `('Other')===null`; `('Dupatta')===null`; `isKidsAudience('GIRLS')===true`, `('WOMEN')===false`, `(null)===false`; `kidsAudiencesFor('Boy')` equals `['BOYS','KIDS_UNISEX']`; `ageGroupFromLabel('3–5 yrs')==='AGE_3_5'`, `('x')===null`; `demographicForCategory('Ladies Suit', null, 'GIRLS')==='kids_girl'`; `demographicForCategory('Kids', null, null)==='kids_boy'` (unchanged).
- [ ] **Step 2:** Run `pnpm --filter @kanchuki/shared test -- product-audience` — expect FAIL (module missing).
- [ ] **Step 3:** Implement the signatures above; export from `index.ts`; add the third param to `demographicForCategory`.
- [ ] **Step 4:** Same command — expect PASS; run `pnpm --filter @kanchuki/shared build` and `tsc --noEmit`.
- [ ] **Step 5:** Commit `feat(shared): product audience + kids age group module`.

---

### Task 2: Schema, migration, DATABASE.md

**Files:** Modify `packages/db/prisma/schema.prisma` (after `ProductSegment` enum near L68 and in `model Product` next to `subtype`); Create `packages/db/prisma/migrations/160_product_audience/migration.sql`; Modify `docs/DATABASE.md`.

**Interfaces:** Produces Prisma `Product.audience: ProductAudience | null`, `Product.kids_age_group: KidsAgeGroup | null` and the two Prisma enums.

- [ ] **Step 1:** Add enums and two optional fields (comment: retailer-set, NULL = adult unisex/unknown).
- [ ] **Step 2:** `migration.sql`: `CREATE TYPE "ProductAudience" AS ENUM (...)`, `CREATE TYPE "KidsAgeGroup" AS ENUM (...)`, `ALTER TABLE "products" ADD COLUMN "audience" "ProductAudience", ADD COLUMN "kids_age_group" "KidsAgeGroup";` with a header comment: additive, owner applies, rollback = drop columns then types.
- [ ] **Step 3:** `pnpm --filter @kanchuki/db exec prisma generate` and `prisma validate` — expect success. Do NOT run migrate.
- [ ] **Step 4:** DATABASE.md: columns, enum values, writer map (retailer product routes, tag-product job, backfill script), reader (My Style candidates), rollback SQL.
- [ ] **Step 5:** Commit `feat(db): products.audience + kids_age_group (migration 160, owner applies)`.

---

### Task 3: API — create/update/import/tagger

**Files:** Modify `products-helpers.ts` (CreateProductSchema L85, UpdateProductSchema L124), `products-crud.ts` (create ~L89, update handler), `catalog-import.ts` (item schema ~L75, create ~L416), `tag-product.ts` (~L128), `packages/ai/src/tagger.ts` (tool schema ~L47, parse ~L235). Tests beside each (`products-audience.test.ts`, extend `tag-product.test.ts`, catalog-import test).

**Interfaces:**
- Consumes: Task 1 `PRODUCT_AUDIENCES`, `KIDS_AGE_GROUPS`, `isKidsAudience`, `audienceForText`.
- Produces: `normalizeAudience(a: ProductAudienceValue | null | undefined, age: KidsAgeGroupValue | null | undefined): { audience?: ProductAudienceValue | null; kids_age_group?: KidsAgeGroupValue | null }` in `products-helpers.ts` — `undefined` passes through (field untouched), explicit `null` clears, forces `kids_age_group: null` when audience is set and not kids, or is `null`. Tagger `TagResult` gains `audience: ProductAudienceValue | null`, `kids_age_group: KidsAgeGroupValue | null` (invalid/absent -> null).

- [ ] **Step 1: Failing tests:** (a) POST with `audience:'GIRLS', kids_age_group:'AGE_3_5'` persists both; (b) POST `audience:'WOMEN', kids_age_group:'AGE_3_5'` stores age `null` (Review 4); (c) PATCH `audience:null` clears a stored age; PATCH `audience:'MEN'` clears age; PATCH with neither field leaves both untouched; (d) POST `audience:'NOPE'` -> 400; (e) response/GET includes both fields; (f) another retailer's product 404 unchanged; (g) tag-product with current `audience:'MEN'` and tagger returning `GIRLS` keeps `MEN`; current `null` and tagger `GIRLS` writes `GIRLS` (Review 5); tagger returns `'junk'` -> parsed `null`; (h) catalog-import item with `audience:'junk'` imports with audience `null` and the rest succeeds (Review 6); item with `audience:'BOYS'` persists.
- [ ] **Step 2:** Run `pnpm --filter @kanchuki/api test -- products-audience tag-product catalog-import` — expect FAIL.
- [ ] **Step 3:** Add `audience`/`kids_age_group` to Create/Update zod as `z.enum(...).nullable().optional()`; spread `normalizeAudience(...)` into the create and update `data`; add both to the tagger tool schema (enum; description "who the garment is for; omit if unsure", plus age for kids) and to the import extraction type; `tag-product` writes each only when current is NULL (same pattern as `subtype` L130); import tolerates a bad value via `safeParse` -> null.
- [ ] **Step 4:** Rerun the command — expect PASS; `pnpm --filter @kanchuki/api typecheck`; `pnpm --filter @kanchuki/ai test`.
- [ ] **Step 5:** Commit `feat(api): accept and AI-fill product audience`.

---

### Task 4: My Style filter, age boost, web form

**Files:** Modify `my-style-candidates.ts`, `my-style-rank.ts`, `public-my-style.ts` (BodySchema L54, loader call L135), `apps/web/src/app/(shopper)/my-style/page.tsx` (L111 `kids` state, L186 body), `KidsForm.tsx`; shared constant next to `MY_STYLE_FIT`. Tests: `apps/api/src/lib/my-style-candidates.test.ts` (use `routes/public/__tests__/where-eval.ts` to evaluate the where against rows), a `my-style-rank` test, `public-my-style.test.ts`, web KidsForm/page test.

**Interfaces:**
- Consumes: Task 1 `kidsAudiencesFor`, `ageGroupFromLabel`, `isKidsAudience`.
- Produces: `CandidateQuery` gains `kidsWho?: 'Girl' | 'Boy'`; exported `adultsWhere` / `kidsWhere` become functions `adultsWhere(): Prisma.ProductWhereInput` and `kidsWhere(who?: 'Girl'|'Boy'): Prisma.ProductWhereInput`; BodySchema gains `kids_who: z.enum(['Girl','Boy']).optional()`, `kids_age: z.enum(KIDS_AGE_GROUPS).optional()` (both only meaningful when `kids`); `RankCandidate.kids_age_group: string | null`; `RankProfile.kidsAge?: string`; shared `MY_STYLE_KIDS_AGE = { exact, adjacent }` (weights smaller than `MY_STYLE_FIT.occasion`, adjacent = exact/2).

- [ ] **Step 1: Failing tests** (where-eval over rows `{audience, category, subtype}`): adult where keeps `{audience:null,category:'Saree',subtype:null}` (Review 1); keeps `{audience:'WOMEN',category:'Kids Ethnic Wear'}` (Review 2); drops `{audience:'BOYS',category:'Ladies'}` (Review 3); drops `{audience:null,category:'Kids'}`; keeps `{audience:'MEN'}`; kids where (no who) keeps BOYS/GIRLS/KIDS_UNISEX and `{null,'Kids'}`, drops WOMEN/MEN and `{null,'Saree'}`; `kidsWhere('Girl')` drops BOYS, keeps GIRLS and KIDS_UNISEX; rank: exact age match scores above no-match, adjacent in between, NULL age equals no-match (never excluded); route: `kids:true,kids_who:'Boy',kids_age:'AGE_3_5'` forwards to the loader; `kids_who` without `kids` accepted but ignored; invalid `kids_age` -> 400; web: KidsForm apply sends `who` and age label, page posts `kids_who`/`kids_age` (via `ageGroupFromLabel`), and the helper text "we match on occasion and budget" now says gender and age are used.
- [ ] **Step 2:** Run `pnpm --filter @kanchuki/api test -- my-style` and `NODE_OPTIONS=--no-experimental-webstorage pnpm --filter web test -- my-style` — expect FAIL.
- [ ] **Step 3:** Implement. Every audience arm is `{ audience: null, <keyword arm> }` OR `{ audience: { in: [...] } }` — never `NOT`/`notIn` on `audience`. The NULL branch keeps the existing per-field `OR [null, NOT contains]` keyword arm.
- [ ] **Step 4:** Rerun both commands — expect PASS; `tsc` for api and web.
- [ ] **Step 5: Falsify:** temporarily change the adult arm to `audience: { notIn: ['BOYS','GIRLS','KIDS_UNISEX'] }`; run the candidates test — expect the NULL-row test to FAIL; revert. Temporarily drop the `audience: null` arm — expect FAIL; revert. Record both in the PR.
- [ ] **Step 6:** Commit `feat(my-style): filter by product audience, age boost, kids form sends gender+age`.

---

### Task 5: Mobile chips (add, edit, import review)

**Files:** Create `apps/mobile/src/components/product-detail/AudienceChips.tsx`; Modify `app/product/add.tsx` (payload ~L466), `useProductDetailForm.ts` (state ~L76-88, save ~L125), `ProductAttributesForm.tsx` (render), `app/product/catalog-import.tsx` (item rows + payload), `src/lib/api/products.ts` and `catalog-import.ts` (types). Tests: `AudienceChips` render test, hook test for payload, add-screen payload test.

**Interfaces:**
- Consumes: Task 1 `PRODUCT_AUDIENCES`, `KIDS_AGE_GROUPS`, `AUDIENCE_LABELS`, `AGE_GROUP_LABELS`, `isKidsAudience`, `audienceForText`.
- Produces: `<AudienceChips audience={ProductAudienceValue | null} ageGroup={KidsAgeGroupValue | null} onChange={(next: { audience: ProductAudienceValue | null; kids_age_group: KidsAgeGroupValue | null }) => void} />`. Tapping the active audience chip clears it; age chips render only when `isKidsAudience(audience)`; switching to a non-kids audience clears age; accessibility label on every chip; touch target ≥ 44.

- [ ] **Step 1: Failing tests:** chips list shows the five labels; age row hidden for WOMEN/null, shown for BOYS/GIRLS/KIDS_UNISEX; tapping the active chip emits `{audience:null,kids_age_group:null}`; switching GIRLS->MEN emits age null; hook: an AI-tagged value shows on an untouched form, a retailer tap marks it touched and a later product refetch does not overwrite it; save payload carries `audience`/`kids_age_group` (`undefined` when untouched and unchanged); add screen: a category/subtype whose text `audienceForText` resolves pre-selects the chip until the retailer taps one; payload carries both fields.
- [ ] **Step 2:** `pnpm --filter mobile test -- AudienceChips useProductDetailForm add` — expect FAIL.
- [ ] **Step 3:** Implement the component (reuse the size-chip styles in `ProductAttributesForm`), wire add/edit/import, add the two fields to the TS types.
- [ ] **Step 4:** Rerun — expect PASS; `pnpm --filter mobile exec tsc --noEmit`.
- [ ] **Step 5:** Commit `feat(mobile): who-is-it-for chips on add, edit and catalog import`.

---

### Task 6: Backfill script

**Files:** Create `apps/api/scripts/backfill-product-audience.ts`, `apps/api/scripts/backfill-product-audience.test.ts`.

**Interfaces:**
- Consumes: Task 1 `audienceForText`.
- Produces: pure `classifyProduct(p: { category: string | null; subtype: string | null; name: string | null }): { audience: ProductAudienceValue | null }`; CLI flags `--apply` (default dry-run), `--batch 500`, `--retailer <id>` (optional). Dry-run prints counts per audience and an "undecided" list (id, retailer, category, subtype); selects only `audience IS NULL AND deleted_at IS NULL`; `--apply` writes with `updateMany where {id, audience: null}` so it never overwrites; resumable (a re-run only sees NULL rows). Uses the owner's `DATABASE_URL` only when the owner runs it; I never run it.

- [ ] **Step 1: Failing tests** for `classifyProduct`: `'Kids Ethnic Wear'`->KIDS_UNISEX, `'New Born'`->KIDS_UNISEX, `'Ladies Suit'`->WOMEN, `'Kurti'`->WOMEN, `'Ladies'`->WOMEN, `"Men's Kurta Pajama"`->MEN, `'Other'`/empty->null.
- [ ] **Step 2:** `pnpm --filter @kanchuki/api test -- backfill-product-audience` — expect FAIL.
- [ ] **Step 3:** Implement; print a clear "DRY RUN — nothing written" banner unless `--apply`.
- [ ] **Step 4:** Rerun — PASS (dry-run path exercised against a mocked prisma in the test only).
- [ ] **Step 5:** Commit `feat(api): dry-run-first product audience backfill script`.

---

### Task 7: Docs, full local check, PR

**Files:** Modify `docs/BUILD-LOG.md` (part-7 entry), `docs/PRO-REQUIREMENTS.md` §42, recheck `docs/DATABASE.md`, CLAUDE.md What's-Built row only (index row + status line, never the policy sections). RC entry + row **only if** a real bug is found; the RC-169 keyword guess is a design limit, not a new bug — say so rather than minting an RC.

- [ ] **Step 1:** Write the BUILD-LOG entry (files, migration 160 owner-applied, backfill owner-run, EAS rebuild needed for chips, not device tested) and the PRO-REQUIREMENTS §42 update.
- [ ] **Step 2:** Run locally: shared build + test; db `prisma validate`; api `typecheck` + vitest for touched dirs; ai tests; web tests with `NODE_OPTIONS=--no-experimental-webstorage`; mobile tests + `tsc`; `biome check` on changed files. Report real pass/fail counts.
- [ ] **Step 3:** Commit docs, push branch, open PR to `main` (do not merge) with: root cause (audience was inferred, not stored), owner steps (apply migration 160 before deploy, deploy, run backfill dry-run then `--apply`, EAS build), and "NOT verified": no device test, no browser test, backfill never run on real data, tagger audience quality never run against a real model, migration never applied, age boost weights untuned.
