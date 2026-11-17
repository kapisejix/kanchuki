# AI Poster Styles — Owner Steps

Spec: `docs/superpowers/specs/2026-11-17-ai-poster-styles-design.md`. Merged to `main` 2026-11-17 (PR #303, merge `c36a4e6e`).

**Status: merged, migration 164 applied by owner (owner's report, date not given, section 1 read-back not confirmed), nothing run against real FLUX, no device test, no browser check of the admin editor, EAS build needed.** Nothing below is confirmed to work; this is the checklist that finds out. The agent runs none of it (no migrations, no deploys, no prod env).

## 1. Before the API deploy: apply migration 164

Order matters (RC-160 shape): code reading `design_templates.ai_prompt` deployed before the column exists 500s every whole-row query.

- [ ] Apply `packages/db/prisma/migrations/164_design_template_ai_prompt/migration.sql` by hand (history table is informational, never `prisma migrate deploy`; see DEPLOY.md).
- [ ] Read back (read-only SQL):
  ```sql
  SELECT column_name FROM information_schema.columns
   WHERE table_name = 'design_templates' AND column_name = 'ai_prompt';
  SELECT conname FROM pg_constraint
   WHERE conrelid = 'design_templates'::regclass
     AND conname IN ('design_templates_ai_prompt_len', 'design_templates_ai_prompt_one_slot');
  ```
  Expect 1 row and 2 rows.
- [ ] Only then merge to `main` (auto-deploys).
- [ ] Reminder: `AI_CUSTOM_TEMPLATE` plan feature must be ON for the test plan and `plan_limits` rows exist (CLAUDE.md row 113). Posters reuse that quota; with no feature row it is OFF.

## 2. Create a poster style (Admin -> Social Templates -> Design Library)

- [ ] New design, pick a format (4:5, 9:16, 1.91:1 or square). `product_slots` must be 1 (AI styles; the DB refuses otherwise).
- [ ] Fill **AI scene prompt** (max 600 chars). Describe the scene only, and tell it to keep a clear empty area where the text goes, e.g. "soft studio backdrop, warm festive lights, garment centred, leave the top third empty and uncluttered". Text is drawn by us afterwards; do not ask FLUX to write words.
- [ ] Add a **Rect** layer (scrim) over the text zone so text stays readable over any scene, then the text layers (headline, offer) on top of it.
- [ ] Thumbnail: generate a real example through the app (section 3), upload that image as the thumbnail. Do not use a mock-up.
- [ ] Set plans, then Publish. Hidden/Draft is invisible to retailers.

## 3. Device test (needs an EAS build; mobile changed)

Repeat per format: 4:5, 9:16, 1.91:1, square.

- [ ] Design picker shows the style with an AI marker and opens poster mode (Headline + Offer inputs).
- [ ] Generate with a real product: a real FLUX run completes and the poster appears.
- [ ] Text is exactly what was typed, including Hindi (Devanagari glyphs, no boxes).
- [ ] Text is readable over the scene (scrim works); FLUX left empty space where the text sits.
- [ ] Garment is not cropped or distorted, especially in 9:16 and 1.91:1.
- [ ] `usage_counters` for `AI_CUSTOM_TEMPLATE` went up by exactly 1.
- [ ] Forced failure (e.g. temporarily bad provider key in a non-prod env, or cancel): quota is refunded, no stuck row.
- [ ] "Report AI content" works on the result.
- [ ] The plain (non-AI) designs and the scheduler still work and the scheduler's style sheet (Your designs) does not list AI styles (they are poster-only, made from the design picker).

## Known unverified

FLUX Kontext may not leave usable empty space; 9:16 and 1.91:1 crops versus the garment; the real FLUX provider has never been called; admin editor never seen in a browser.
