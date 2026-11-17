# AI Poster Styles — design

**Date:** 2026-11-17 · **Status:** DRAFT, awaiting owner approval · **Builds on:** T5 AI Custom Designs, admin Design Library (`docs/tasks/pending/admin-social-design-templates.md` §4–5)

## 1. Intent and why

Owner tested T5 (AI Custom Designs) on a real build on 2026-11-17: it works end to end but only swaps the background scene around the garment. Owner wants a finished poster with layout, text and effects.

Owner's idea, in their words: admin writes the prompt once and it acts like a template; the retailer only picks a product and types the text; the AI makes the poster. Same pattern as AI Studio Shoot (`studio_styles`).

## 2. Goals

- Admin creates **poster styles**: a scene prompt plus a text layout, set once, reused by every retailer.
- Retailer flow: pick style → pick product → type headline/offer → get a finished poster.
- All text on the poster is **exact** (prices, offers, shop name, Hindi) because our renderer draws it, never the model.
- Reuse the existing Design Library (editor, picker, plan gating, formats, thumbnails) and the T5 job, quota and report flow.

## 3. Non-goals

- Letting the model draw any text (headline, price, Hindi). Not tested on this engine; deferred (approach C below).
- A new admin editor. The Design Library editor is extended, not replaced.
- Video, multi-product carousels, or per-retailer free-prompt changes.

## 4. Anti-goals (failure even if it "works")

- A wrong price or garbled word on a public post.
- The garment cropped badly by the format crop.
- Text unreadable on a bright part of the scene.
- A second quota, a second admin screen, or a second plan-gating path to maintain.

## 5. Constraints (from the code, read 2026-11-17)

- `renderDesign` already takes a `background: Buffer` plus layers (`text`, `image`) and cover-crops the background to the format. An AI scene can be passed straight in as `background`.
- `DesignSpec` has only `text` and `image` layers. There is no rectangle/gradient layer, so text over a busy scene has no scrim today.
- `design_templates` already holds `format`, `spec`, `status`, `plans`, `occasion`, `thumbnail_key`, `product_slots`.
- T5's job (`apps/api/src/jobs/ai-custom-design.ts`) already reserves/refunds the `AI_CUSTOM_TEMPLATE` slot and writes `ai_custom_designs`.
- `buildDesignPrompt` forbids drawn text. That stays.
- Rule: nothing runs against prod DB/env by me. Migrations are applied by the owner.

## 6. Approaches considered

| | How | Trade-off |
|---|---|---|
| A. Model draws everything | Prompt contains the text | Simplest, but digits and Hindi are unreliable. Rejected. |
| **B. Model draws scene, code draws text (chosen)** | Style = scene prompt + text layout. Scene becomes `background`, `renderDesign` prints text | Exact text; needs empty space and a scrim; crop risk |
| C. B plus optional model-drawn headline | Per-style switch | More flexible, untested on this engine. Later, if a bench test shows it works. |

Owner chose B on 2026-11-17.

## 7. Design

### 7.1 Data: one column on `design_templates`

Add `ai_prompt TEXT NULL` (max 600 chars, CHECK in the migration). **Null = today's template** (static background art). **Set = AI poster style**: the background is generated per product instead of stored. Everything else on the row (format, spec, plans, status, thumbnail, occasion) works unchanged.

Why a column and not a new table: the editor, picker, plan filter, publish flow and thumbnails already exist for this row. Smallest change that gives owner's flow. My call.

### 7.2 Admin

Design Library editor gets one field, **"AI scene prompt"**. Filled = AI poster style. The prompt guidance shown under the field: describe setting and mood; ask for empty space where the text layers sit (e.g. "leave the top third plain"). The wrapper (§7.4) is appended by code, admin cannot remove it.

The live preview keeps using the static sample background; the thumbnail is uploaded by the admin as today (a real generated example is the better thumbnail).

### 7.3 New layer type: `rect` (scrim)

Add a closed `rect` layer to `design-template.ts` / `parseDesignSpec` / `renderDesign`: `x, y, w, h`, `color #RRGGBB`, `opacity 0–1`, validated inside the canvas like other layers. Used as a dark/light band behind text so it stays readable on any scene. Without it, text on a generated scene is a coin flip. My call: needed for the anti-goal "unreadable text".

### 7.4 Job

`ai-custom-design` job gains a branch for AI poster styles:

1. Load the template row (published, plan allowed, `ai_prompt` set) — re-checked in the job (queue is a trust boundary).
2. Prompt = existing wrapper (keep garment exact, no drawn text) + the admin's `ai_prompt` + the retailer's product facts. The retailer's typed text is **never** put in the model prompt.
3. Generate the scene with the existing FLUX Kontext path (`generateStudioImage`).
4. `renderDesign({ format: template.format, spec: template.spec, background: scene, shop, custom: { custom_text, offer_text }, products: [{ texts, image: null }] })` — the garment is already in the scene, so no `product_image` layer is drawn.
5. Same upload, READY row, quota SPENT, usage record, failure refund as T5 today.

### 7.5 Route and mobile

- `POST /me/ai-designs` accepts `{ product_id, template_id, custom_text?, offer_text? }` for the poster path. The existing free-prompt body stays working (kept as the "Custom" option). Same gates, same atomic reserve, same poll route.
- Text length stays capped by `DESIGN_CUSTOM_MAX_LEN` (80) and sanitised by the existing renderer rules.
- Mobile: the design picker shows AI poster styles with an "AI" tag; choosing one asks for product + headline/offer and shows the same pending/ready screen as `ai-design.tsx`, including **Report AI content**.

### 7.6 Quota and plans

Unchanged: one poster = one FLUX call = one `AI_CUSTOM_TEMPLATE` slot (100/200/300). Plan gating per style through `design_templates.plans` plus the existing `AI_CUSTOM_TEMPLATE` plan feature.

## 8. Decisions I made (owner can overrule)

1. Column on `design_templates`, not a new table (§7.1).
2. New `rect` layer for scrims (§7.3).
3. Free-prompt T5 path stays as "Custom"; poster styles become the main path.
4. Garment stays centered in the scene prompt wrapper so the format crop (4:5 and 9:16 from a model output) does not cut it. Unverified: needs bench runs per format.
5. No builder subagent review; I read it back myself.

## 9. Risks and unknowns (not verified)

- Whether FLUX Kontext reliably leaves empty space when asked. Needs a few real runs per style.
- Crop of the generated scene to 9:16 and 1.91:1 may cut the garment.
- Hindi and long text fit rely on the existing renderer (owner confirmed Hindi glyphs render in a design preview on Railway, 2026-11-14).
- Cost per poster equals one FLUX call, same as T5 today.

## 10. What's left to the builder

Exact migration SQL (owner applies), `rect` rendering details, editor UI placement of the new field, mobile picker layout, tests (spec validation for `rect`, job branch with mocked model, route gates, source pins), docs and RC entries per CLAUDE.md rules.

## 11. Verification before "done"

Owner device test per style and format: real FLUX run, text exact, readable over the scene, garment not cropped, quota +1, forced-failure refund, report button. Nothing is claimed working until owner pastes real results.
