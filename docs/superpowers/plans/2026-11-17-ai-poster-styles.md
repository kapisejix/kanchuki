# AI Poster Styles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-authored AI poster styles: retailer picks a style, a product and types a headline/offer; the AI draws the scene, our renderer prints the exact text on top.

**Architecture:** A poster style is a `design_templates` row with a new nullable `ai_prompt` column. The T5 job (`ai-custom-design`) gains a branch: generate the scene with the existing FLUX Kontext path, then pass it as the `background` of the existing `renderDesign`. One new `rect` spec layer gives text a scrim. Plain `/render` and the scheduler never see AI styles.

**Tech Stack:** TypeScript, Fastify, Prisma/Postgres (SQL migration applied by the owner), sharp, BullMQ, Next.js admin, Expo/React Native, vitest.

**Spec:** `docs/superpowers/specs/2026-11-17-ai-poster-styles-design.md` (approved 2026-11-17). Read it before starting.

## Global Constraints

- **Never** run migrations, touch prod DB/env or deploy. The owner applies SQL and sets Railway env vars. Use plain `npx` / `pnpm` (rtk is not installed).
- Work on a new branch off `main`: `feat/ai-poster-styles`. Do not merge without the owner's say-so.
- The retailer's typed text is **never** put in the model prompt. The model never draws text, digits, prices or logos (`buildDesignPrompt` rule stays).
- Text fields are capped at `DESIGN_CUSTOM_MAX_LEN` (80). Admin `ai_prompt` max 600 chars.
- AI styles: `product_slots` must be 1 and the quota is `AI_CUSTOM_TEMPLATE` (one FLUX call = one slot), reserved atomically before enqueue, refunded in the job's `finally` unless the row reached READY.
- The admin's `ai_prompt` text is never sent to a retailer client (`GET /me/designs` returns only `ai: boolean`).
- Owner-only routes stay owner-only (`isRealOwner`). Draft / hidden / wrong-plan styles look exactly like missing ones (404).
- Run before every commit: the touched package's vitest files and `tsc --noEmit` (`pnpm --filter @kanchuki/api typecheck`, same for `@kanchuki/shared`, `@kanchuki/ai`, mobile, web). Run biome on touched files.
- CLAUDE.md rule 10: update docs in the same session. RC entry only if a bug is found while building.

## Review Focus

1. An AI style rendered by the **plain** `/me/designs/:id/render` or the **scheduler** would print text on a white page (no background). Expected: both treat it as missing.
2. A template edited (ai_prompt removed, unpublished, plan changed) between enqueue and job run. Expected: job marks the row FAILED and refunds, no FLUX call.
3. Scene succeeds but the text render throws. Expected: row FAILED, slot refunded, no half-written READY row.
4. Retailer text containing `<`, `&`, quotes, very long or Hindi text. Expected: renderer escapes it, nothing reaches the model prompt, 81+ chars rejected by the route.
5. `rect` layer outside the canvas, bad colour, opacity outside 0–1. Expected: `parseDesignSpec` rejects it with a layer-numbered message.

---

### Task 1: `rect` layer in the shared spec

**Files:**
- Modify: `packages/shared/src/design-template.ts`
- Test: `packages/shared/src/design-template.test.ts` (add; create if absent next to the file)

**Interfaces:**
- Produces: `interface DesignRectLayer { type: 'rect'; x: number; y: number; w: number; h: number; color: string; opacity: number }`; `DesignLayer` becomes `DesignTextLayer | DesignImageLayer | DesignRectLayer`; `parseDesignSpec` accepts and rebuilds `rect` layers.

- [ ] **Step 1: Failing tests** in the shared test file: `accepts a rect layer and rebuilds only known fields`, `rejects rect outside the canvas` (x+w > canvas width), `rejects rect with bad colour`, `rejects opacity 1.5 and -0.1`, `rejects rect w or h below 8`. Use `PORTRAIT_4_5` (1080×1350).
- [ ] **Step 2:** Run `pnpm --filter @kanchuki/shared exec vitest run design-template` — expect FAIL.
- [ ] **Step 3:** Implement in `parseDesignSpec`: new branch for `l.type === 'rect'` before the text branch. Same coordinate rules as the image layer (`x`,`y` inside canvas, `x+w`/`y+h` inside), colour `HEX`, opacity finite number 0–1, w/h ≥ 8. Extend the `Raw` interface with `opacity?: unknown`. Update the "type must be text or image" error to include rect. The rebuilt layer carries only `type,x,y,w,h,color,opacity`.
- [ ] **Step 4:** Run the tests and `pnpm --filter @kanchuki/shared typecheck` — expect PASS. Then run `pnpm -r typecheck` once: the `DesignLayer` union change may break exhaustive switches in `apps/web` (editor) and `packages/ai`; note each failure for Tasks 2 and 9.
- [ ] **Step 5:** Commit `feat(shared): rect scrim layer in design spec`.

### Task 2: Render `rect` layers

**Files:**
- Modify: `packages/ai/src/design-render.ts`
- Test: `packages/ai/src/design-render.test.ts` (add)

**Interfaces:**
- Consumes: `DesignRectLayer` from Task 1.
- Produces: `renderDesign` draws rects in layer order (a rect added before a text layer sits under it).

- [ ] **Step 1: Failing test** `rect layer darkens the pixels under it and text stays on top`: render a white-background spec with a black `rect` at opacity 0.5 over a region; assert the sampled pixel there is ~gray (not white) and a pixel outside is white; second case rect + text layer order yields text pixels lighter than the band when text colour is white. Use `sharp(...).raw()` to sample.
- [ ] **Step 2:** Run `pnpm --filter @kanchuki/ai exec vitest run design-render` — expect FAIL.
- [ ] **Step 3:** In the layer loop add a `rect` branch that appends `<rect x y width height fill="#RRGGBB" fill-opacity="n"/>` to `pendingText` (SVG fragment, same flush logic, so order is kept).
- [ ] **Step 4:** Run tests + `pnpm --filter @kanchuki/ai typecheck` — PASS.
- [ ] **Step 5:** Commit `feat(ai): render rect scrim layers`.

### Task 3: Migration + Prisma model

**Files:**
- Create: `packages/db/prisma/migrations/164_design_template_ai_prompt/migration.sql`
- Modify: `packages/db/prisma/schema.prisma` (`DesignTemplate`), `docs/DATABASE.md`

**Interfaces:**
- Produces: `design_templates.ai_prompt TEXT NULL`, `DesignTemplate.ai_prompt: string | null`.

- [ ] **Step 1:** Write the SQL with the repo's header-comment style (see `163_addon_gst_invoice`): `ALTER TABLE design_templates ADD COLUMN ai_prompt TEXT; ALTER TABLE design_templates ADD CONSTRAINT design_templates_ai_prompt_len CHECK (ai_prompt IS NULL OR char_length(ai_prompt) BETWEEN 1 AND 600);` plus a second CHECK that an AI style holds one product: `CHECK (ai_prompt IS NULL OR product_slots = 1)`. Rollback SQL in a comment. No new GRANT needed (table-level grants already cover new columns); say so in the header.
- [ ] **Step 2:** Add `ai_prompt String?` to the model with a comment. Run `pnpm --filter @kanchuki/db exec prisma generate` (generate only, never `migrate`).
- [ ] **Step 3:** Update `docs/DATABASE.md` `design_templates` section.
- [ ] **Step 4:** Commit `feat(db): design_templates.ai_prompt (migration 164, owner applies)`. **Tell the owner to apply 164 before the API deploy** (RC-160 shape: code reading a missing column 500s).

### Task 4: Admin API accepts `ai_prompt`

**Files:**
- Modify: `apps/api/src/routes/admin/admin-design-templates.ts`
- Test: `apps/api/src/routes/admin/admin-design-templates.test.ts`

**Interfaces:**
- Consumes: Task 3 column. Produces: create/update accept `ai_prompt: string | null`; DTO returns it (admin sees the text).

- [ ] **Step 1: Failing tests:** `create stores ai_prompt`, `rejects ai_prompt over 600 chars`, `rejects ai_prompt with product_slots 2` (validation error), `update can clear ai_prompt with null`, `blank string becomes null`.
- [ ] **Step 2:** Run `pnpm --filter @kanchuki/api exec vitest run src/routes/admin/admin-design-templates` — FAIL.
- [ ] **Step 3:** Add `Fields.ai_prompt = z.string().trim().max(600).nullable()` (map `''` to null), optional in Create/Update; write it in `create` and the update loop; in `put`, compute effective `ai_prompt` and `product_slots` together and throw `validationError('An AI poster holds one product', 'product_slots')` when prompt is set and slots ≠ 1 (same pattern as the format/slots/spec re-validation).
- [ ] **Step 4:** Tests + typecheck PASS.
- [ ] **Step 5:** Commit `feat(admin): ai_prompt on design templates`.

### Task 5: Keep AI styles out of plain render and the scheduler

**Files:**
- Modify: `apps/api/src/lib/design-post-render.ts`, `apps/api/src/routes/retailers/retailers-social/retailers-social-designs.ts`
- Test: `apps/api/src/lib/design-post-render.test.ts`, `apps/api/src/routes/retailers/retailers-social/retailers-social-designs.test.ts`

**Interfaces:**
- Produces: `findPublishedDesign` now excludes `ai_prompt != null` (so `/render` and the scheduler, its only callers, treat AI styles as missing); new `findPublishedAiPoster(designId: string, plan: Plan)` returns the PUBLISHED, plan-allowed row whose `ai_prompt` is set; `GET /me/designs` rows gain `ai: boolean` and never include `ai_prompt`.

- [ ] **Step 1: Failing tests:** `findPublishedDesign returns null for an AI style`; `findPublishedAiPoster returns it only when published and plan allowed`; `/me/designs returns ai:true for an AI row and no ai_prompt key`; `/render on an AI style id answers 404`.
- [ ] **Step 2:** Run both test files — FAIL.
- [ ] **Step 3:** Implement: add `ai_prompt: null` to the `findPublishedDesign` where; add `findPublishedAiPoster` with `ai_prompt: { not: null }`; in the list route select `ai_prompt` then map to `ai: ai_prompt !== null`, dropping the text (pattern already used for `thumbnail_key`).
- [ ] **Step 4:** Tests + typecheck PASS.
- [ ] **Step 5:** Commit `fix(designs): AI styles never render through the plain path`.

### Task 6: Poster prompt builder + render-over-scene helper

**Files:**
- Modify: `apps/api/src/lib/ai-custom-design.ts`, `apps/api/src/lib/design-post-render.ts`
- Test: `apps/api/src/lib/ai-custom-design.test.ts`, `apps/api/src/lib/design-post-render.test.ts`

**Interfaces:**
- Produces: `buildPosterPrompt(adminPrompt: string): string`; `renderDesignJpeg` args gain optional `backgroundOverride?: Buffer` and `omitProductImages?: boolean`. When `backgroundOverride` is set it is used instead of downloading `design.background_key`; when `omitProductImages` is true every product's `image` is `null` and the "every product needs a photo" check is skipped.

- [ ] **Step 1: Failing tests:** `buildPosterPrompt contains the no-text rule, the keep-garment rule, a centered-garment instruction and the admin prompt`; `buildPosterPrompt takes no retailer text parameter` (signature has one param); `renderDesignJpeg uses backgroundOverride and skips product photos` (mock `downloadBuffer`/`renderDesign`, assert `background` is the override and `products[0].image` is null, `downloadBuffer` not called for photos).
- [ ] **Step 2:** Run the two files — FAIL.
- [ ] **Step 3:** Implement. `buildPosterPrompt` = the lines of `buildDesignPrompt` with the admin text as the scene brief plus: "Keep the garment centered with margin on all sides so a later crop does not cut it." Do not duplicate wording: factor the shared fixed sentences into one constant used by both builders.
- [ ] **Step 4:** Tests + typecheck PASS.
- [ ] **Step 5:** Commit `feat(api): poster prompt builder and render-over-scene`.

### Task 7: Route accepts a poster request

**Files:**
- Modify: `apps/api/src/routes/retailers/retailers-social/retailers-social-ai-designs.ts`, `apps/api/src/jobs/ai-custom-design.ts` (the `AiCustomDesignJobData` type only)
- Test: `apps/api/src/routes/retailers/retailers-social/retailers-social-ai-designs.test.ts`

**Interfaces:**
- Produces: `POST /me/ai-designs` body is a union: existing `{ product_id, prompt, format, overlay }` **or** poster `{ product_id, template_id, custom_text?, offer_text? }` (`custom_text`/`offer_text` ≤ 80). Poster path 202 `{ id, status: 'PENDING' }`. `AiCustomDesignJobData` gains `template_id?: string; custom_text?: string; offer_text?: string`. The `ai_custom_designs.prompt` column stores `Poster: <template name>` for poster rows (no migration; my call).

- [ ] **Step 1: Failing tests:** `poster request enqueues a job with template_id and the typed text`; `draft/hidden/wrong-plan template_id -> 404 and no quota reserved`; `non-AI template_id -> 404`; `text over 80 chars -> validation error`; `manager/delegate -> 403`; `quota exhausted -> 402 and no row`; `enqueue failure refunds the slot`; `free-prompt body still works unchanged`.
- [ ] **Step 2:** Run the file — FAIL.
- [ ] **Step 3:** Implement: parse with a zod union (poster schema first, keyed on `template_id`). Poster branch runs the same gate order (owner, feature `AI_CUSTOM_TEMPLATE`, provider configured), then `findPublishedAiPoster(template_id, plan)` else `notFound('Design')`, then product + photo ownership, `checkQuota`, `reserveJobQuota`, create row, enqueue; the same try/catch refund. Share the post-gate code with the free-prompt branch rather than copying it.
- [ ] **Step 4:** Tests + typecheck PASS.
- [ ] **Step 5:** Commit `feat(api): AI poster request on /me/ai-designs`.

### Task 8: Job poster branch

**Files:**
- Modify: `apps/api/src/jobs/ai-custom-design.ts`
- Test: `apps/api/src/jobs/ai-custom-design.test.ts`

**Interfaces:**
- Consumes: `findPublishedAiPoster`, `buildPosterPrompt`, `renderDesignJpeg` (Tasks 5–6), `AiCustomDesignJobData.template_id`.
- Produces: when `template_id` is set the job generates the scene, renders text over it, uploads to `retailers/<id>/designs/<hex>.jpg`, sets READY, marks the slot SPENT; every other exit refunds.

- [ ] **Step 1: Failing tests** (mock the model and renderer like the existing job tests): `poster job: scene then render with backgroundOverride, row READY, slot spent`; `template unpublished or ai_prompt cleared before run -> FAILED, refunded, model not called`; `render throws after scene -> FAILED, refunded, error rethrown`; `typed text is not in the prompt passed to generateStudioImage`; `free-prompt job unchanged`.
- [ ] **Step 2:** Run the file — FAIL.
- [ ] **Step 3:** Implement the branch at the top of `handleAiCustomDesign` after the photo check: re-resolve the template with `findPublishedAiPoster(template_id, plan)` (load the retailer's plan), build the prompt with `buildPosterPrompt(template.ai_prompt)`, call `generateStudioImage` with the existing product context, then `downloadCompressAndUpload(payload, key, isBase64, { compress: POSTER_BUDGET, transform: (raw) => renderDesignJpeg({ retailerId, design: template, productIds: [product_id], custom: { custom_text, offer_text }, backgroundOverride: raw, omitProductImages: true }) })`. Reuse the existing READY/`spent`/`finally` refund block; do not copy it.
- [ ] **Step 4:** Tests + typecheck PASS.
- [ ] **Step 5:** Commit `feat(jobs): AI poster generation branch`.

### Task 9: Admin editor — AI scene prompt field and rect layer

**Files:**
- Modify: `apps/web/src/app/admin/design-templates/DesignLibrary.tsx` (743 lines — read the layer editor and draft/patch types first)
- Test: the existing web test for this page if present, else a small component test beside it

**Interfaces:**
- Consumes: admin API `ai_prompt` (Task 4), `DesignRectLayer` (Task 1).
- Produces: a textarea "AI scene prompt" under the occasion field (max 600, guidance text: describe setting/mood and ask for empty space where the text sits; the system adds the no-text and keep-garment rules itself); an "AI" badge in the list; forcing `product_slots = 1` and a note when the prompt is filled; `rect` layers addable/editable (x, y, w, h, colour, opacity) wherever text/image layers are.

- [ ] **Step 1: Failing test:** typing a prompt sends `ai_prompt` in the save payload; clearing it sends `null`; the list shows the AI badge; a rect layer round-trips through the editor.
- [ ] **Step 2:** Run `pnpm --filter @kanchuki/web exec vitest run design-templates` — FAIL (and fix any exhaustive-switch type errors noted in Task 1 step 4).
- [ ] **Step 3:** Implement following the file's existing `Field` + `patch` pattern.
- [ ] **Step 4:** Tests + `pnpm --filter @kanchuki/web typecheck` PASS.
- [ ] **Step 5:** Commit `feat(admin-web): AI scene prompt + rect layer in the Design Library`.

### Task 10: Mobile — AI styles in the design picker

**Files:**
- Modify: `apps/mobile/src/lib/api/designs.ts`, `apps/mobile/app/social/design.tsx`, `apps/mobile/app/social/ai-design.tsx`
- Test: `apps/mobile/app/social/ai-design.test.tsx` (add or extend), `design.test.tsx` if present

**Interfaces:**
- Produces: `DesignTemplateRow.ai: boolean`; `aiDesignsApi.create` body type accepts the poster shape `{ product_id; template_id; custom_text?; offer_text? }`; `ai-design.tsx` reads an optional `template_id` route param: when present it hides the prompt/format/overlay sections, shows Headline + Offer inputs (80 max), and sends the poster body; `design.tsx` shows an "AI" tag on AI styles and tapping one pushes `/social/ai-design?template_id=<id>` instead of selecting it for plain render.

- [ ] **Step 1: Failing tests:** `design picker routes an AI style to ai-design with template_id`; `ai-design with template_id sends the poster body and not prompt/format/overlay`; `poster mode still shows Report AI content and Post this design on READY`; `plain designs still render as before`.
- [ ] **Step 2:** Run `pnpm --filter @kanchuki/mobile exec jest app/social` (or the repo's mobile test command) — FAIL.
- [ ] **Step 3:** Implement; reuse the existing poll/READY UI in `ai-design.tsx`, do not copy it into `design.tsx`.
- [ ] **Step 4:** Tests + `pnpm --filter @kanchuki/mobile typecheck` PASS. Note in the commit that this needs an EAS build.
- [ ] **Step 5:** Commit `feat(mobile): AI poster styles in the design picker`.

### Task 11: Docs and owner checklist

**Files:**
- Modify: `CLAUDE.md` (row 113 status line only), `docs/BUILD-LOG.md` / `docs/build-log/part-7.md`, `docs/PRO-REQUIREMENTS.md` §44, `docs/PLAN.md`, `docs/tasks/pending/admin-social-design-templates.md` (add the poster-styles section), `docs/DATABASE.md` (if not done in Task 3)
- Create: `docs/runbooks/ai-poster-styles-owner-steps.md`

- [ ] **Step 1:** Write the runbook for the owner: apply migration 164 before the API deploy; how to create a poster style in the Design Library (scene prompt wording with empty-space instruction, `rect` scrim over the text zone, thumbnail from a real generated example, plans, publish); the device test per format (4:5, 9:16, 1.91:1, square): real FLUX run, text exact incl. Hindi, readable over the scene, garment not cropped, `usage_counters` +1, forced-failure refund, Report AI content.
- [ ] **Step 2:** Update the status docs: built on branch, **not** merged, migration 164 unapplied, nothing run against real FLUX, no device test, EAS build needed. Do not claim anything works.
- [ ] **Step 3:** Commit `docs: AI poster styles status + owner runbook`; open a PR (docs and code together) and report the checks. **Ask before merging.**

## Self-review

- **Spec coverage:** data column §7.1 → T3/T4; admin field §7.2 → T9; `rect` §7.3 → T1/T2; job §7.4 → T6/T8; route + mobile §7.5 → T7/T10; quota/plans §7.6 → T7 (reuse); decisions §8 → T3 (column), T1 (rect), T7 (free prompt kept), T6 (centered garment); verification §11 → T11 runbook.
- **Names consistent:** `findPublishedAiPoster`, `buildPosterPrompt`, `backgroundOverride`, `omitProductImages`, `template_id`, `ai` flag are used with the same spelling in every task.
- **Proportion:** each task names signatures, test names and assertions; no function bodies are given except where the spec fixes them.
- **Open risk not in any task by design:** whether FLUX Kontext leaves empty space and how 9:16 / 1.91:1 crops treat the garment. Only real runs answer it (T11 device test).
