# AI Studio Shoot Option Matrix — Session Hand-off (refreshed 2026-10-10)

**Purpose:** resume Studio Shoot work in a fresh session with no loss.
**Main spec:** `docs/tasks/pending/studio-shoot-option-matrix.md` (final option list, 29 owner prompts in §14, Fal.ai model picker in §15).
**Companion spec:** `docs/tasks/pending/ai-photo-generation.md` (engines, pipeline, quota, bench results).
**Rule of this thread:** spec work is docs only. Ask the owner before any edit to `CLAUDE.md`.

> Replaces the 2026-09-30 round-5 hand-off. That version listed 80 slots, PS-01/02, 11 indoor styles, a pose picker, Frame/Angle/Photography Style and Mannequin/Ghost. All were removed on 2026-10-08.

---

## 1. State

| Layer | State |
|---|---|
| Option list + 29 prompts | **Final** (owner, 2026-10-08). Nothing missing. |
| Admin bench code | **Behind the spec** — see §2. |
| Retailer-facing layer (gating, detection, Quick Looks, model picker, collage) | **Not built.** Spec only. |
| Bench runs against live providers | Run 1 only (outdoor + model, 2026-09-20). Runs 2–3 pending. |

## 2. Code vs spec (synced 2026-10-10, `apps/web/src/lib/studio-effects.ts`)

- **Synced.** `PRODUCT_STYLES` = PS-03..16 with owner prompt text. `MODEL_STYLES` = MI-01/02/04/05/08/10 + MO-01..07. Retired PS-01/02 and MI-03/06/07/09/11 removed.
- Model prompts = MX-0 wrapper + scene block (+ MO-0 outdoors), built from shared consts. Person clause is still added by the pipeline.
- **Pools:** prompts hold `{{Pool}}` tokens (scene / pose / theme / PS-16 environment, presentation, styling). `resolveStylePrompt()` picks one at random. The admin bench calls it on style select (`photo-cleanup-test/page.tsx`). Server-side per-generation picks for the retailer path are **not built**.
- MI-08 theme pick sets a "Launch theme" line only; the headline list stays fixed in the prompt text.
- `tsc --noEmit` clean. **Not run against live providers** and **not committed**.

## 3. Locked decisions (do not re-ask)

- **Two sections only:** Product Only (14 styles, PS-03..16) and Model Only (6 indoor + 7 outdoor).
- **Lighting is automatic** per style and not a retailer choice. Outdoor = Daylight or Natural Light only.
- **Pose lives inside each prompt**, picked by the server from the scene's pool. No pose picker.
- **Removed:** Frame, Angle, Photography Style, Product View, Mannequin/Ghost, category-override prompts.
- **Kids (1–12): no model.** Models 13+. Teen = 13–19 (Poolside hidden). No garment-back output. Walking is toward the camera.
- **Kurti = half model only, exact length kept** (existing `isTopOnlyGarment` clause).
- **No AI text** anywhere except **MI-08 Social Commerce** (owner exception: fixed short headlines + detail panels).
- **Retailer model picker (§15), all on Fal.ai:** `Grok - Best` (default, 10 credits), `ChatGPT - Fast` (5), `Qwen - Good` (6), `Nano Banana - Best` (10). Credits = admin-test-page credits **+2**, no prices shown. Models are added from admin; a new provider (Runway ML) needs one adapter.
- Groom / Curvy skipped. Collage comes after the styles are locked: separate generation per slot, composed server-side, each slot counts as one quota generation.

## 4. Open

**Owner:**
1. Auto-lighting per style: confirm or replace (§14.2–14.4).
2. Age bands: proposed Teen 13–19 · Adult 20–39 · Mature 40–59 · Senior 60+ (not approved).
3. Side/Profile angles: moot now that Angle is removed. Close out.
4. §15.7: plan gating, whether to offer Kontext to retailers, Runway model choice, flat +2 vs percentage.
5. From `ai-photo-generation.md` §10: compression ceiling (R5), AI-completed-part disclosure (R6), engine per MODEL row, `length_cm` capture, GPT Image client.

**Engineering:**
- Bench run 2 (indoor + model) and run 3 (product only), plus the `gemini_image_pro` director A/B/C.
- Engine-per-style routing waits on those runs.

## 5. Next steps

1. Sync `studio-effects.ts` to the spec (see §2). Small change, no new features.
2. Bench run 2 and 3 using the final prompts across the four Fal models (§15.5). Score garment fidelity first.
3. Pick engine routing from the results.
4. Build the retailer layer: gating data on `studio_styles` rows, `studio_engines` table + admin CRUD, "Generate with" list, then Quick Looks, then collage.
5. Docs to update when approved: `docs/tasks/README.md`, `docs/PRO-REQUIREMENTS.md` F-032 row. `CLAUDE.md` needs explicit owner approval.

---

## 6. Paste-ready prompt for a new session

```
Resume the Kanchuki AI Studio Shoot work.

Read first:
1. E:\Kanchuki\docs\tasks\pending\studio-shoot-session-handoff.md  (state, code-vs-spec gap, locked decisions)
2. E:\Kanchuki\docs\tasks\pending\studio-shoot-option-matrix.md    (spec; §14 = final prompts, §15 = Fal.ai model picker)
3. E:\Kanchuki\docs\tasks\pending\ai-photo-generation.md           (engines, pipeline, bench results §8.1d)

State: option list and all 29 prompts are final. Admin bench code is behind the spec (handoff §2). Retailer layer is not built.

Today I want to: [tick one]
 A) sync studio-effects.ts to the final prompts;
 B) run bench runs 2/3 and choose engine routing;
 C) start the retailer layer (gating + studio_engines + "Generate with");
 D) answer open owner decisions (handoff §4).

My input:
```
