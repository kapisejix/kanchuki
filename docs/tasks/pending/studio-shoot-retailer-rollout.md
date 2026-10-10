# AI Studio Shoot — Retailer Rollout of the Option Matrix (F-032)

**Status:** 🟨 Code built 2026-10-10; migration 123 applied by owner (27 rows, all `DRAFT`, invisible to retailers). Remaining: 2.4, 2.5, 2.7, 3.8 (legend below).
**Legend:** ✅ done · ⏸ deliberately deferred · ⏳ blocked · 👤 owner action.

**Built (uncommitted until the branch lands):** shared `studio-styles.ts` + `studio-gating.ts` (+ tests); API job token resolution (`metadata.studio.picks`), POST gating 422, `GET /studio-styles?product_id=` + `meta`; mobile picker gating + Indoor/Outdoor groups; migration `123_studio_styles_option_matrix` (+ `scripts/gen-studio-option-matrix-seed.mjs`, check in `scripts/check-pending-migrations.ts`).
**Decisions logged:** 3.2 gating as shared constants, not schema columns. 2.4 NOT in migration 123 — hiding legacy rows before the new ones are published would empty every picker; do it after 2.7. 3.5 enforced at the retailer route only; `PERSON_CLAUSE.kids_*` stays for the admin bench. Semi-stitched counts as stitched (keeps PS-03/04).
**Spec of record:** `studio-shoot-option-matrix.md` (§2 lists, §4–§6 gating, §14 prompts). This doc is only the build task list.
**Starting point:** all 27 prompts live in `apps/web/src/lib/studio-effects.ts` and run on the admin test page (`/admin/photo-cleanup-test`) only. The retailer path already works from the DB catalog (`studio_styles` → `GET /v1/products/studio-styles` → `ProductStudioModal.tsx`, Product/Model tabs, `audience` filter) — the gap is getting these prompts and the gating into it.

---

## Step 2 — Get the 27 prompts into the retailer path

| # | Task | Where | Notes |
|---|------|-------|-------|
| 2.1 ✅ | Move `PRODUCT_STYLES`, `MODEL_STYLES`, `PROTECT`, `MX0`, `outdoor()`, `resolveStylePrompt` to shared | `apps/web/src/lib/studio-effects.ts` → `packages/shared/src/studio-styles.ts` | API cannot import from `apps/web`. Re-point admin page + tests. One source for web and API. |
| 2.2 ✅ | Resolve `{{Pool}}` tokens server-side, one pick per generation | `apps/api/src/lib/studio-shoot.ts` (`buildStudioPrompt`) | DB prompts keep the tokens. Persist the picked values in the photo's `metadata.studio` (reproducible, bench-able). |
| 2.3 ✅ | Migration seeding 27 rows into `studio_styles` | `packages/db/prisma/migrations/123_studio_styles_option_matrix` | Fully expand `${PROTECT}` / `${MX0}` / `outdoor()`. Set `tab`, `slug`, `label`, `sort_order`, `plans`; `status = DRAFT`. |
| 2.4 ⏸ | Retire old catalog rows | same migration | Set `DRAFT`, never delete (`usage_count`, existing photos reference them). |
| 2.5 ⏳ | Engine per row | same migration | **Blocked on bench run 2** (`ai-photo-generation.md` §8.1d/e). Until then `engine = NULL` (default cascade). |
| 2.6 ✅ | Test: all 27 rows resolve with no `{{…}}` left and no empty prompt | `apps/api` vitest | One assertion over the full set. |
| 2.7 👤 | Owner publishes rows one at a time after a real-photo bench | Admin → Studio Styles | `DRAFT` → `PUBLISHED`. |

⚠ **Migration is human-approved and applied only from the admin dashboard** (CLAUDE.md Operational Control Policy). Check `docs/database/DATABASE.md` before writing it.

## Step 3 — Gating + retailer UI

| # | Task | Where | Notes |
|---|------|-------|-------|
| 3.1 ✅ | `productProfile()` → `{ modelAllowed, bottoms, unstitched, kids, hasDupatta, topOnly }` | `packages/shared` next to `demographicForCategory` | Reuse `TOP_ONLY_RE`; inputs: category, subtype, `product_type`, name. Used by API and mobile. |
| 3.2 ✅ | Style gating rules: PS-03/04 stitched-only; teen → no MO-06 Poolside | shared constants (not schema) | ~6 lines. Move to `studio_styles` columns only if admin needs to edit them. |
| 3.3 ✅ | `GET /products/studio-styles?product_id=` returns allowed styles + `model_available` | `apps/api/src/routes/products/products-studio.ts` | Bottoms / unstitched / kids → no MODEL tab. |
| 3.4 ✅ | Enforce the same hard rules on `POST …/studio-shoot` (422) | `products-studio.ts` | A stale client must not reach a kids+model or unstitched+body-form generation. |
| 3.5 ✅ | Kids never route to a model prompt | `PERSON_CLAUSE.kids_*` in `studio-shoot.ts` | Model Type = women / men / teen girl / teen boy only. |
| 3.6 ✅ | Mobile: pass `product_id`, hide Models tab when `model_available = false`, show one-line reason | `apps/mobile/src/components/product-detail/ProductStudioModal.tsx`, `src/lib/api/products.ts` | |
| 3.7 ✅ | Mobile: group Model styles into Indoor / Outdoor | same modal | `environment` from slug prefix (MI-/MO-) or a catalog field. |
| 3.8 👤 | Thumbnails for the 27 styles | admin upload (`thumbnail_url`) | Content task, not code. |
| 3.9 ✅ | Table-driven gating test (§5 table → allowed set per product type) | `apps/api` vitest | |

## Out of scope here

- AI model picker (§15, Fal.ai Grok/ChatGPT/Qwen/Nano Banana, +2 credits) — own spec, open questions in matrix §12.
- Quick Looks presets, collage (§10), "What is this?" confidence fallback.

## Order

2.1 → 2.2 → 2.6 → 3.1/3.2 → 3.4/3.5 → 2.3/2.4 (**needs owner approval**) → 3.3 → 3.6/3.7 → real-photo bench → 2.7.

## Open

- 3.2: constants vs schema columns — recommendation: constants.
- Engine routing (2.5) waits on bench run 2.
