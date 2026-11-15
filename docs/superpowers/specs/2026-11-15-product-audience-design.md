# Product Audience + Kids Age Group — design

Date: 2026-11-15 · Branch: `feat/product-audience` (from `origin/main` `80a473b3`, after PR #274 merged)
Status: DRAFT — schema section awaits owner confirmation.

## Intent and why

My Style (F-045) keeps kids' wear out of the adult feed by a keyword match on `products.category` +
`subtype` (`KIDS_KEYWORDS`, `adultsWhere`/`kidsWhere` in `apps/api/src/lib/my-style-candidates.ts`,
RC-169). It is a guess: a kids piece the retailer tagged "Ladies" still leaks. `products.category`
is free text; `ProductCategory.segment` is never set by mobile and defaults to LADIES, so it
cannot answer this. The retailer knows who the garment is for. Let them say so, and let My Style use it.

## Goals

- Retailer sets **Audience** (and, for kids, **Age group**) on add, edit and import.
- AI tagger pre-fills Audience from the photo; the retailer can change it. Category choice gives a default.
- My Style adult feed / "For my child" filter on the stored value.
- Keyword rule stays only as fallback for products with `audience IS NULL`.
- Existing products classified by a dry-run-first backfill (owner runs it).

## Non-goals

- No change to `ProductCategory.segment` or the taxonomy.
- No audience shown on the customer product card; no new public route or field exposure beyond what My Style already returns.
- No hard age filter (age is a rank boost). No adult-unisex value (NULL means no restriction — owner decision).
- Not replacing `demographicForCategory()` wholesale; it only prefers `audience` when set.

## Anti-goals

- A mandatory field that slows photo-first upload (both columns stay optional).
- Adult feed silently losing products because of SQL NULL semantics (`NOT` over NULL excludes rows).
- Prod writes or migrations run by me.

## Constraints

- Owner applies the migration and the backfill; I write the SQL and script only.
- Photo-first UX; AI call count must not rise (audience rides the existing tagging call).
- CI is out of minutes: run tests/tsc/biome locally; rebuild `packages/shared` first; web tests need `NODE_OPTIONS=--no-experimental-webstorage`.
- Docs: BUILD-LOG part-7, DATABASE.md, RC entry + row only if a bug is found, PRO-REQUIREMENTS §42.

## Approaches considered

- **A. Columns + category default + AI pre-fill + keyword fallback — CHOSEN by owner.**
- B. Columns, manual only: breaks photo-first, most rows stay NULL, keyword guess keeps leaking.
- C. Better keywords only: no schema change, but it is the thing that already leaks and the retailer cannot correct it.

## Schema (OWNER TO CONFIRM)

Two nullable enums on `Product`. Postgres enum labels cannot start with a digit, so age labels are prefixed.

```
enum ProductAudience { WOMEN MEN BOYS GIRLS KIDS_UNISEX }
enum KidsAgeGroup    { NEW_BORN AGE_0_2 AGE_3_5 AGE_6_8 AGE_9_12 AGE_13_16 }

Product.audience        ProductAudience?
Product.kids_age_group  KidsAgeGroup?
```

- Age bands match `KidsForm.tsx` (`0–2, 3–5, 6–8, 9–12, 13–16 yrs`) plus `NEW_BORN`; this replaces the
  `TEEN` in the original sketch, so a parent's pick maps one-to-one.
- `kids_age_group` is only meaningful when audience is BOYS/GIRLS/KIDS_UNISEX; the API clears it otherwise.
- Migration `160_product_audience`: two `CREATE TYPE`, two `ALTER TABLE products ADD COLUMN` (nullable, no default,
  no backfill in the migration, so it is metadata-only and instant). No index on `audience` (candidate query is
  already bounded by retailer/geo and capped at 300 rows). RLS: `products` already has RLS; adding columns needs no
  policy change. `kanchuki_app` already has UPDATE on `products`; no new grant.
- Rollback: `ALTER TABLE products DROP COLUMN ...; DROP TYPE ...;` (columns are additive, unread by anything older).

## Behaviour

**Retailer UI (mobile).** Chip picker "Who is it for?" (Women / Men / Boys / Girls / Kids unisex; tap again to clear = NULL).
Age chips appear only for Boys/Girls/Kids unisex. Add and edit screens, plus the catalog-import review rows.
Default: picking a category/subtype whose text matches kids/men/women keywords pre-selects the chip (shared
`audienceForCategory()`); AI result overrides only while the retailer has not touched the chip. The retailer's value is never
clobbered by a re-tag (same rule `tag-product.ts` already uses for name/sku/subtype).

**API.** `audience` and `kids_age_group` accepted and returned on create, update, import (`catalog-import.ts`) and
bulk-create paths; zod `z.enum`, nullable; owner-scoped like every other product field. No new unauthenticated surface.
Tagger tool schema gains `audience` (enum, may abstain) + `kids_age_group`; `tag-product` writes them only when the
product's current value is NULL.

**My Style filter** (`my-style-candidates.ts`):

- adult feed: `audience IN (WOMEN, MEN)` OR (`audience IS NULL` AND not kids-by-keyword — existing `adultsWhere`).
- kids feed ("For my child"): `audience IN (BOYS, GIRLS, KIDS_UNISEX)` OR (`audience IS NULL` AND `kidsWhere`).
- KidsForm Girl → GIRLS or KIDS_UNISEX; Boy → BOYS or KIDS_UNISEX (hard filter); NULL-audience keyword rows pass.
- Age: rank boost for an exact `kids_age_group` match (smaller boost one band either side); NULL age is neutral, never excluded.
- SQL NULL trap: Prisma `NOT`/`notIn` over a NULL column drops the row; every branch is written as `audience: null` OR explicit values,
  and a test evaluates it against NULL rows via the existing `where-eval.ts` helper.

**Backfill** (`apps/api/scripts/backfill-product-audience.ts`, owner runs): dry-run by default, `--apply` to write.
Classifies rows with `audience IS NULL` from category/subtype/name keywords (reuses the shared keyword helper), only
sets a value when confident, prints counts per audience and a list of undecided rows (id, retailer, category, subtype).
Never overwrites a non-NULL value. Batches of 500 so it is resumable.

## Parts of the how decided (by owner)

- Approach A. Adult unisex = NULL. Girl/Boy hard filter, KIDS_UNISEX matches both. Age = rank boost.

## My calls (flag if you disagree)

1. Age bands follow `KidsForm`, `NEW_BORN` added, no `TEEN`.
2. No DB index on `audience`.
3. No DB CHECK tying `kids_age_group` to a kids audience; enforced in the API.
4. Tagger may abstain, so NULL stays common for ambiguous adult items.
5. One small shared mobile chip-group component, reused by add, edit, import.

## Left to the builder

Exact chip styling (reuse existing size chips), copy strings, test names, import-review row layout.

## Not verified at design time

Mobile add/edit file layout beyond grep hits. A grep for `bulk-create` under `routes/products` found nothing, so the
plan must locate the real bulk path (the task text names "bulk-create") before touching it.
