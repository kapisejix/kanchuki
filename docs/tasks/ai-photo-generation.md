# AI Photo & Video Generation — Single Source of Truth

**Created:** 2026-09-18 (merge of 5 docs)
**Scope:** F-032 (AI Studio Shoots / Kontext + Gemini), F-034 (AI image→video for social promo), the photo-cleanup bench, and the current requirement: product-set completeness + Gemini/ChatGPT-parity output quality.
**Owner of this file:** this is now the *only* spec for AI photo/video generation. The 5 files it replaces are listed in §13 and were deleted in the same change.

**Status legend used throughout**

| Mark | Meaning |
|---|---|
| ✅ | Built **and** live/verified |
| 🧪 | Built, but not verified against live providers (no run yet) — or built and unmerged |
| 🟡 | In progress right now (uncommitted) |
| 🔴 | Not built — planned / deferred |
| ⛔ | Deliberately removed or explicitly rejected — **do not rebuild without owner sign-off** |

---

## §0a — SESSION HAND-OFF (read this first in a new session)

**Updated 2026-09-18.** This file is now the single source of truth. The separate `ai-photo-quality-gap-analysis.md` was merged into it (§3B) and deleted.

### What the owner wants (the target solution)

1. A retailer uploads an **ordinary product photo** — hanger, flat-lay, mannequin, partial, often **missing pieces** (a kurta with no salwar visible, no length reference, no feet, no back).
2. Kanchuki returns a **studio-grade photo of that exact garment worn by a model** in a curated scene, at the quality **Gemini / ChatGPT give today** — exact print, colour, embroidery, length; complete outfit; believable body, pose, shadow.
3. **No prompt box for retailers.** Curated styles/commands stack (4–5 effects → one prompt). Free text stays on the admin bench.
4. **Acceptable to call Gemini / OpenAI APIs** with our own prompt/commands if our own models can't reach that quality (answered in §3B.6: yes, with a "prompt director" layer).
5. Unattended, metered, bulk-safe (500–3000 SKUs) — the reason a retailer pays us instead of using the chat apps.

### The one-paragraph finding

The gap is **not mainly resolution or `image_size`** (an earlier draft over-weighted that; it is a hygiene item, §3B.7). It is **how each model turns the product photo into a worn garment**: Gemini/ChatGPT are reasoning image models that *understand* the garment, *infer what the photo does not show* (bottom, length, back, feet, body proportions) and render the whole scene in **one** pass; our default stack is a diffusion **editor** (Kontext) inside a 2–3 pass pipeline whose prompt **tells it to "edit ONLY the background… pixel-identical"** — an instruction that contradicts "place this garment on a model" when the input has no model (§3B.1, verified in code). Add the ≤80 KB ceiling on top and the result looks nothing like theirs.

### Developed vs. to develop (detail in §0b)

| Developed ✅ / 🧪 | To develop 🔴 |
|---|---|
| **Admin bench only, 2026-09-19 (`a3f2034b`, unmeasured on live):** `SCENE_GUARD` swap for person-less photos (`input_has_person`), **prompt director** (`directStudioPrompt` — vision pass, returns final prompt + `missing_parts`), `length_cm` + `model_height_cm` → hem-landmark clause (`hemLandmarkClause`), `strict` (a chosen Gemini engine errors instead of falling back to Kontext). Retailer/job path **unchanged** — defaults keep the old prompt. Controls sit on `/admin/photo-cleanup-test`. · Product photo reaches every engine; subtype in prompt; 8 curated MODEL scenes; 6-way demographic swap; try-on → scene pipeline; bench A/B over both pipeline orders; Gemini client (Interactions API); `STUDIO_ENGINES` single list; quota/plan gate; F-034 video Phase 1 (admin) | **Prompt director** (vision step that describes the garment + what's missing and writes the final prompt) · **single-pass Gemini Pro / GPT Image 2 engines** · GPT Image client (none exists) · fix the `SCENE_GUARD` contradiction for photos with no person · garment **length/size data capture** + proportion→hem-landmark clause · set completion wiring (R1–R3, built-uncommitted `garment-parts.ts`) · raise the 80 KB ceiling for hero output · FASHN v1.6 · FLUX.2 evaluation · effects axes (camera/light) |

### Next steps, in order (nothing coded in this session — analysis only)

1. **Owner:** save the ChatGPT + Gemini + Kanchuki outputs and the **original product photo** in one folder; ask Claude to do a structured visual diff (§3B.5).
2. **Owner (bench, ~30 min):** run the same product photo through Kontext / `gemini_image` / `gemini_image_pro` with the *identical* mirror-selfie prompt; note which rows are really `engine = NULL`.
3. Decide §10 items 1, 2, 4 and the new items 9–11.
4. **Done on the admin bench 2026-09-19:** `SCENE_GUARD` fix, prompt director, single-pass Gemini Pro (already an engine), length + model-height capture. **Owner test pending** on `gemini_image_pro`: A = bare-garment ✔ / director ✘, B = ✔ / ✔, C = ✘ / ✘ (old behaviour). Needs Gemini billing (enabled) and, for Kontext/`vton_*`, Fal credit.
5. **After the bench result:** promote the winning arm to the retailer path (`studio-shoot` job + `products-studio` route; flip `inputHasPerson`/director defaults) → add `length_cm` to the product schema/form (mobile) → GPT Image engine (only if it beats Gemini) → set completion (R1–R3, blocked on the R6 disclosure decision). **Not done anywhere:** retailer-path wiring, product-row `length_cm`, GPT Image client, `garment-parts` wiring.

---

## §0 — How to read this doc

| Section | Answers |
|---|---|
| §1 | What this feature is, and what it is not |
| §2 | **What exists today** — engines, pipeline, prompt assembly, quotas, files. Start here before writing code. |
| §3 | **Why the output doesn't look like Gemini/ChatGPT yet** — decoded comparison, measured facts, parameter checklist |
| **§3B** | **Gap analysis vs Gemini/ChatGPT** — how each model class handles the product photo, what is invented, measuring length/height, prompt reverse-engineering (not possible — what is), API route, model comparison, experiment |
| §4 | **What we are working on now** (uncommitted, 2026-09-18) |
| §5 | Current requirements, R1–R8, with acceptance criteria and the one thing still blocking each |
| §6 | The effects command library → curated-preset design |
| §7 | F-034 AI Promo Video (Phase 1 built, Phase 2 deferred) + corrected migration numbers |
| §8 | Cross-cutting: quota, cost, the 80 KB ceiling, verification protocol |
| §9 | Findings from this merge — stale items, collisions, doc bugs |
| §10 | Open decisions only the owner can settle |
| §11 | Reuse map — every file this work touches |
| §12 | Verification protocol + commands |
| §13 | Provenance: what was merged, what was deleted, what survived, historical references |
| **§0b** | **Task status board — every item, done vs. left, in one place.** Read this first if you only need to know where things stand. |

---

## §0b — Task status board: what's done, what's left

**Last updated:** 2026-09-18. Section refs point at the detail.

### A. F-032 Studio Shoot — engine + photo path (image generation)

| Item | Status | Evidence | What's left |
|---|---|---|---|
| Dead `imagen-client.ts` (`imagen-3.0-generate-002`, text-to-image, never given the photo) replaced by a real Gemini native-image client | ✅ done | `gemini-image.ts`, commit `c1ca817b` | — |
| Product photo now reaches every engine (two-step: try-on → scene) | ✅ done | `generateStudioImage()`, §2.2 | — |
| `STUDIO_ENGINES` single engine list in `@kanchuki/shared` | ✅ done | `constants/index.ts:349` | — |
| Garment **subtype** injected into the prompt (was never named at all) | ✅ done | `c1ca817b`, §3.3 B | product `category`/`name` still not injected |
| 21 MODEL scenes collapsed → 8, bottomwear guard at code level | ✅ done | migration `101`, `isTopOnlyGarment()` | — |
| Migrations `101`–`105` applied in prod | ✅ done | owner-applied, §2.3 | — |
| Bench A/B over both pipeline orders, strict arms + stage-qualified errors | ✅ done | `generateStudioOrderAb()`, `POST /admin/photo-cleanup/studio-ab`, `c1ca817b` | — |
| Dead IDM-VTON helper deleted **+ regression guard** | ✅ done | `retired-tryon-guard.test.ts`, `c1ca817b` | — |
| **Engine picked per MODEL row** | 🔴 **left** | all 8 rows are `engine = NULL` → Kontext | owner selects per row in `/admin/studio-styles` (R7) |
| **First run against the live providers** | 🔴 **left** | never run from a build session | owner runs the bench (§3.3 A explains the "no change" result) |

### B. Current requirement — garment-set completeness (R1–R3, R6)

| Item | Status | Evidence | What's left |
|---|---|---|---|
| `expectedParts()` / `detectGarmentParts()` / `missingParts()` + prompt clauses | 🟡 built, **uncommitted** | `garment-parts.ts`, 23 tests, §4 | wire into the pipeline |
| Diagnostic audit tool | 🟡 built, **uncommitted**, never run with live keys | `scripts/studio-garment-audit.ts` | run it on real photos to measure how often a bottom is actually missing |
| Order decided: complete-set → try-on → scene (forced by garment-conditioning) | ✅ decided | §5 R1 | — |
| Gating decided: gate on product data (owner) | ✅ decided | §5 R1 | mapping still config-only, not yet read by the pipeline |
| R1 generate the missing salwar in the same fabric/print/colour | 🔴 left | — | build the complete-set pass **before** try-on |
| R2 visible-parts check consulted (not subtype alone) | 🟡 built, not wired | `garment-parts.ts` | call it in `generateStudioImage` |
| R3 framing precondition (full-length + hem for set products) | 🔴 left | §5 R3 | `framingClause()` exists but is not enforced |
| R6 disclosure of an AI-completed component | 🔴 **decision pending** | §5 R6 | owner picks A / B / C |

### C. Output quality (R5)

| Item | Status | Evidence | What's left |
|---|---|---|---|
| Diagnosis: 69,072 B / 1024×1024, sub-80 KB ceiling inherited from the catalog default | ✅ done | §2.5, §3.4 | — |
| 5a raise the ceiling for hero studio output | 🔴 left | — | owner picks the storage/egress trade (§8.2) |
| 5b force portrait for garment scenes | 🔴 left | — | Kontext currently inherits a square source |
| **NEW** `SCENE_GUARD` conditional on person-less input | 🔴 left | §3B.1 #1 | highest-leverage single fix |
| **NEW** Prompt director (vision → garment + missing parts + length landmark → final prompt) | 🔴 left | §3B.6 | — |
| **NEW** Single-pass `gemini_image_pro` / GPT Image 2 path + vision QA + N-sample pick | 🔴 left | §3B.6 | GPT Image client does not exist |
| **NEW** Garment `length_cm` capture + landmark clause | 🔴 left | §3B.4 | owner decision §10 #10 |
| **NEW** FASHN v1.6 / FLUX.2 evaluation | 🔴 left | §3B.7 | bench |
| 5c explicit preservation clause **including length** | 🔴 left | — | ChatGPT's prompt has it, ours doesn't |
| 5d state the grounding shadow in model scenes | 🔴 left | — | — |

### D. Effects command library (R4)

| Item | Status | Evidence | What's left |
|---|---|---|---|
| Curated scenes shipped as `studio_styles` rows (the safe form of the library) | ✅ done | §6 | — |
| 6-way demographic person swap | ✅ done | §2.3 | — |
| Camera + light as **real picker axes** instead of text baked into scenes | 🔴 left | §6 build order step 1 | do this before anything exotic |
| Conflict groups + last-wins + length cap + preservation clause last | 🔴 left | §6 | prevents `/softbox` + `/neon` averaging to mush |
| Fabric / shadow / reflective families | 🔴 left | §6 | last |

### E. Carried over from the old photo-feature checklist (R8)

| Item | Status | Evidence | What's left |
|---|---|---|---|
| Adaptive polling backoff for the studio job | ✅ done | old checklist | — |
| Progress % + ETA in Redis job status | ✅ done | old checklist | — |
| Plan gate: Growth/Pro (STARTER → 402) | ✅ done | old checklist | — |
| Local-dev fallback error handling in photo cleanup (was just a warning) | 🔴 left | §5 R8 | — |
| Per-generation provider credit/cost tracking in job metadata | 🔴 left | §5 R8 | — |
| Image size validation (<20 MB / <20 MP) before provider submit | 🔴 left | §5 R8 | — |
| Retailer-visible credit/metering display | 🔴 left | §5 R8 | — |
| Responsive product-gallery aspect (currently fixed 3:4) | 🔴 left | §5 R8 | — |
| ⛔ VTO / TryOnModal / GPU detection on V-Tone | ⛔ obsolete | torn down 2026-08-31, migration `082` | do not rebuild without sign-off |

### F. F-034 AI image→video (separate feature, §7)

| Item | Status | Evidence | What's left |
|---|---|---|---|
| Task 1 — `fal-video.ts` (5 models, `cropTrimToAspect`) | ✅ done | `17fe997` | endpoint liveness unverified |
| Task 2 — `POST /admin/photo-cleanup/image-to-video` | ✅ done | `17fe997` | — |
| Task 3 — `AI Motion Styles.html` (16 presets) | ✅ done | `17fe997` | — |
| Task 4 — admin "AI Promo Video" card | ✅ done | `f57479c` | **owner bench test = the gate for everything below** |
| Task 6.1 — admin addon packs + `089_resource_packs` (applied) | ✅ done | `47748a4` | retailer-side billing switch |
| Task 5 — `studio_styles.kind` + admin VIDEO CRUD + per-tier model map | 🔴 deferred | §7.4 | renumber migration to **≥106** first |
| Task 6 — `AI_VIDEO` quota + plan_limits seeds | 🔴 deferred | §7.4 | — |
| Task 7 — retailer routes + job + queue | 🔴 deferred | §7.4 | — |
| Task 8 — mobile modal + entry points | 🔴 deferred | §7.4 | no F-034 mobile code exists |
| Task 9 — Instagram Reels publish | 🔴 deferred | §7.4 | — |
| Task 10 — docs sweep | 🔴 deferred | §7.4 | — |

### G. Documentation

| Item | Status | Evidence | What's left |
|---|---|---|---|
| 5 scattered AI-photo docs merged into this file, sources deleted | ✅ done | §13.1 | — |
| Live pointers repointed (PLAN, PRO-REQUIREMENTS, photo-feature-audit, scene HTML) | ✅ done | §13.5 | — |
| CLAUDE.md rows 54 / 60 repointed (approved) | ✅ done | `CLAUDE.md` | — |
| Historical mentions in BUILD-LOG / PROGRESS / superpowers left intact | ✅ intentional | §13.5 | do not "fix" them |
| Stale duplicate `AI Models and Scenes.hmtl` | 🔴 left | §9 #3 | delete (owner call) |

### Summary in one line each

- **Built and live:** the image pipeline reaches the product photo; subtype in the prompt; 8-scene set; bench A/B; F-034 Phase 1 bench + admin addon packs; this doc merge.
- **Built but not yet usable:** `garment-parts.ts` + audit tool (uncommitted, not wired).
- **Waiting on the owner:** engine per row, compression ceiling, disclosure choice, F-034 bench sign-off.
- **Biggest correctness gap:** set completion (R1–R3) is designed and detected but not generating.
- **Biggest quality gap:** the 69 KB ceiling (R5 5a) — nothing else in R5 matters until it's raised.

---

## §1 — What this is, what it is not

**What it is.** A retailer points the mobile app at a product photo, picks a **curated style** (not a free-text prompt), and gets back a professional-looking image (F-032) or a 5–8 s promo clip (F-034). The image feeds the catalog; the clip feeds Instagram/Facebook.

Three hard constraints that define every design decision below:

1. **No free-text prompt box for retailers.** Unconstrained prompts → garment drift, off-brand output, and (per OpenAI/Google usage terms) the retailer becomes responsible for content-policy and rights violations in what they typed. The curated-template pattern is the shipped answer. Free text stays on the **admin bench only**.
2. **Garment fidelity beats beauty.** The output is a *product listing*, not art. A gorgeous render with the wrong print, wrong length or an invented salwar is a customer-service problem and, in the set-completion case (§5 R1), a consumer-protection one.
3. **Everything is metered.** Every generation is a real API cost, gated by the F-010 quota system (`QuotaResourceType`).

**What it is not.**

| Not this | Why | Reference |
|---|---|---|
| ⛔ Virtual Try-On (self-serve, customer-facing) | Built (CatVTON on RunPod, July 2026), debugged, then **deliberately torn down** 2026-08-31 (migration `082_remove_unwanted_features`) with an explicit "Removed" line in CLAUDE.md. Google now gives it away free inside Search/Shopping for retailers with a Merchant Center feed — not Kanchuki's model. Re-adding it reverses a recent, deliberate decision. | §9, `docs/database/no-feature-want.md` |
| ⛔ IDM-VTON / any self-hosted GPU try-on | CPU-only infra (Hetzner CX43). IDM-VTON's released weights are CC BY-NC-SA-**ND** (no derivatives) — ADR-006 blocks redistributing a fine-tune. Helper deleted 2026-09-18; `retired-tryon-guard.test.ts` fails if it reappears. | §9 |
| Not a replacement for the catalog pipeline | The image is 1 step of ~10 (tag → compress → R2 → rack/shelf → WhatsApp link → PWA catalog). A retailer using ChatGPT still does steps 2–10 by hand for every SKU, every restock. | §3 |

**Why a retailer pays us when ChatGPT/Gemini are "free":** free is *one image, manually prompted, in a chat window, for a human*. Not a queue, not a plan quota, not garment-identity preservation across 500–3000 SKUs, not auto background removal / tagging / ≤80 KB compression / R2 storage / WhatsApp collection links. Consumer chat tools measurably drift: Nano Banana identity/garment fidelity degrades after ~8–10 sequential edits and needs manual re-anchoring every 5–8 prompts — exactly the unattended-bulk failure F-001d exists to avoid.

**Cost reality (Sept 2026, per generated/edited image).** BFL is **not** overpriced once you price the API rather than the chat app:

| Provider / model | Price | Note |
|---|---|---|
| Flux Kontext Dev | ~$0.025/run | cheapest, lower fidelity |
| **Flux Kontext Pro (current default)** | **~$0.04/MP** | best price/fidelity for garment-preserving edits — **the cheapest credible option for this job** |
| Nano Banana 2 (Gemini 3.1 Flash Image) | ~$0.02–0.03/image | cheap, drifts in long batches |
| Nano Banana Pro (Gemini 3 Pro Image) | ~$0.134/image | 3×+ Flux Kontext Pro |
| GPT Image 2 | ~$0.005–0.21/image | widest range, unpredictable at high res |

**Conclusion:** add engines, keep curated styles, don't expose a prompt box. The multi-provider pattern already exists twice in this repo (F-023 provider registry; F-034 multi-model video) — extending it is additive, not a rebuild.

---

## §2 — What exists today ✅

### 2.1 Engines (`STUDIO_ENGINES`, `packages/shared/src/constants/index.ts:349`)

Seven values, by **role** in the pipeline:

| Engine value | Role | Actual model / endpoint |
|---|---|---|
| `flux_pro` | model-reference (text→image) | `fal-ai/flux-pro/v1.1` |
| `flux_schnell` | model-reference (text→image) | `fal-ai/flux/schnell` |
| `bfl_kontext` | **scene render** (image→image, garment pixels preserved) | `fal-ai/flux-pro/kontext` |
| `gemini_image` | **scene render** (Nano Banana 2) | `gemini-3.1-flash-image` |
| `gemini_image_pro` | **scene render** (Nano Banana Pro) | `gemini-3-pro-image` |
| `vton_kontext` | **try-on** (garment-conditioned) | `fal-ai/fashn/tryon/v1.5` |
| `vton_gemini` | **try-on** (garment-conditioned) | Gemini native image edit |

- Engine is a **per-row column** on `studio_styles` (`engine`), admin-editable at `/admin/studio-styles`. **`NULL` = Kontext two-step** — the conservative default.
- `flux_pro` / `flux_schnell` **cannot take the product photo** (text-to-image). They are only valid for the model-reference step; using them as the scene render loses the garment.
- Gemini client is `apps/api/src/lib/gemini-image.ts`. It **accepts image input** (native image editing, returns base64) — this is the "Nano Banana" path. Model union: `'gemini-3.1-flash-image' | 'gemini-3-pro-image'`. `gemini-2.5-flash-image` is legacy.
- Keys: **`FAL_API_KEY`** and **`GEMINI_API_KEY`**, both registered in `INTEGRATION_KEYS` (`packages/shared/src/constants/index.ts:415/435`) → rendered on Admin → Integrations → resolved by `resolveFalKey()` / `resolveGeminiKey()` via `getSecret()` (`packages/db/src/secrets.ts:63`), which reads the encrypted `integrationSetting` row and falls back to `process.env`. **Nothing needs configuring in code; pasting the key on that page is sufficient.**

### 2.2 The pipeline

`generateStudioImage()` — `apps/api/src/lib/studio-shoot.ts:733`. Two orders exist:

```
FORWARD (garment first)              REVERSED (scene first)
─────────────────────                ──────────────────────
1. model reference (if needed)       1. scene render (Kontext or Gemini)
2. try-on  (FASHN v1.5 / Gemini)     2. persist stage → fetchable URL  ← Gemini returns base64
3. scene render (Kontext / Gemini)   3. try-on  (FASHN v1.5 / Gemini)
```

- **Forward** finishes at the scene renderer's resolution. **Reversed** finishes at the try-on's **576×864** — so the reversed arm *looks softer*. That is the stage order, not a defect.
- `generateStudioOrderAb()` (`:619`) runs **both arms concurrently** and is exposed as the bench A/B (`POST /admin/photo-cleanup/studio-ab`). Both arms are **strict**: a failed stage fails that arm and names it via the `stage()` wrapper (`Try-on: …`, `Kontext scene render: …`) instead of silently falling back — a silent fallback would turn "which order is better" into a comparison of two different pipelines.
- `persistStage` is injected so the Gemini (base64) arm has a fetchable URL for the try-on step. Without it the arm fails immediately with that reason.
- `runTwoStepStudio()` returns `{ result, stages, error }` — the bench renders the intermediate images as a clickable stage strip.
- Every result **and every intermediate** is re-served from R2, because Fal and BFL result URLs expire (BFL's in ~10 minutes).

### 2.3 Prompt assembly

`buildStudioPromptContext()` builds the garment/scene text **once** so both A/B arms are byte-identical (two copies would drift invisibly — the arms would then differ by wording as well as order). What it injects today:

| Injected | Source | Status |
|---|---|---|
| Scene setting + lighting + background | `studio_styles.prompt` / `scene` column | ✅ |
| Person clause (6-way) | `demographicForCategory(category, name)` → `womens` / `mens` / `teen_girl` / `teen_boy` / `kids_girl` / `kids_boy` | ✅ |
| Colour / fabric / pattern / embellishment lock | product `primary_color`, `secondary_colors`, `fabric`, `pattern`, `embellishments` | ✅ |
| Garment **subtype** anchor | tagger output (`subtype`) | ✅ added 2026-09-18 (`c1ca817b`) |
| Top-only guard | `isTopOnlyGarment()` (`:158`) — appends "waist-up, no invented bottomwear" for kurti/blouse/tee/top/tunic/shirt | ✅ |
| Colour temperature | "neutral 5500K CRI-98" style clause | ✅ **better than ChatGPT's prompt** |
| **Garment category / name** | — | ⚠️ **still not injected** — see §3 |
| **Garment length** ("no shortening") | — | ⚠️ not explicit |
| Grounding shadow | — | ⚠️ style-row dependent |
| Missing-set completion (§5 R1) | — | 🟡 in progress |

**Where the 8 MODEL rows stand (2026-09-18):** migrations applied — `099` staff invites, `100` customer interaction, `101_studio_styles_finalized_v2` (21 collapsed → 8 MODEL scenes), `102` engine→Gemini, `103` product-hook removal fix, `104_studio_styles_model_engine_revert_kontext`, `105_studio_styles_engine_rename`. **All 8 MODEL rows are now `engine = NULL` → Kontext two-step.** Nothing flips them automatically; the owner picks per row in `/admin/studio-styles`.

The finalised MODEL set (migration `101`): Indoor Studio Softbox, Home Mirror Selfie, Golden Hour Outdoor, Catwalk Runway Motion, Editorial Close-Up, Marble Premium Luxury, **Half-Body Top Shot (Kurti/T-Shirt)**, Social Media Post Square. PRODUCT-tab rows (ghost/hanger/flatlay/mannequin, 8 rows) untouched.

### 2.4 Retailer surface, quota, and files

| Concern | Where |
|---|---|
| Retailer async generation | `apps/api/src/routes/products/products-studio.ts` (202 + status poll) |
| Job + Redis status | `apps/api/src/jobs/studio-shoot.ts`, `get/setStudioJobStatus` |
| Mobile picker | `apps/mobile/src/components/product-detail/ProductStudioModal.tsx` |
| Mobile hook | `apps/mobile/src/hooks/useProductAiStudio.ts` (`pollWithBackoff`) |
| Plan gate | Growth/Pro only (STARTER → 402). `STUDIO_SHOOT` `QuotaResourceType`, no per-retailer override — F-032 Phase A used the F-010 pattern |
| R2 output | `downloadCompressAndUpload()` (`:994`) → `R2_PATHS.photoCleanupTest(...)` / photo path |
| Admin bench | `/admin/photo-cleanup-test` (web) → `apps/api/src/routes/admin/admin-photo-cleanup.ts` |

### 2.5 Known gaps in what exists (all addressed below)

1. **The output is pre-degraded.** `downloadCompressAndUpload` calls `compressImageToTarget(raw)` **with no options** (`studio-shoot.ts:1007`) → defaults `maxBytes = 80 * 1024`, `maxDimension = 1600`, quality ladder 88 → 48 stepping 7, dimension ladder −15 % per pass (`packages/ai/src/image-compress.ts:58`). The measured output of the render under review: **1024×1024, 69,072 bytes, no EXIF/XMP.** Sub-80 KB is the platform's *catalog thumbnail* budget (BUILD-LOG §22). Fine embroidery, print detail and fabric weave are exactly what a sub-80 KB JPEG sacrifices first. **ChatGPT/Gemini hand back ~1–3 MB.** → §5 R5.
2. **Square output.** `gemini-image.ts` defaults to `3:4`, but Kontext inherits its **input's** dimensions — so the square render is square because the source photo is. Garments want portrait. → §5 R5.
3. **No visible-parts check and no set completion.** → §4, §5 R1–R3.
4. **Never run against the live providers** from a build session. Types + tests + published contracts only. The first real run is the owner's, on the bench. → §12.

---

## §3 — Why the output doesn't match Gemini/ChatGPT yet

### 3.1 What could be decoded, and what could not

| Source | What its share page exposes | Result |
|---|---|---|
| **ChatGPT** | the **full prompt** + a title | ✅ decoded |
| **Gemini** | redirects to a Google sign-in wall | ⛔ auth-walled — prompt and pixels unreadable |
| **Ours** | everything — measured on disk | ✅ 1024×1024, 69,072 B, no EXIF |

The ChatGPT prompt, verbatim:

> *"Place this garment on the model standing in a clean professional indoor studio with a seamless soft grey-beige backdrop, large softbox key light at eye level plus a subtle fill light, confident relaxed standing pose, soft natural grounding shadow. The garment's exact colour, print, embroidery, fabric texture and original length are 100% preserved — no stretching, shortening or lengthening."*

Titled **"Ivory Kurta with Indigo Floral Shawl"** — i.e. a human named the garment type in the chat, which is a form of garment-type injection our prompt was not doing at all.

**How to decode / compare in future:** a share link exposes *the prompt*, never the sampling parameters (no seed, no steps). ChatGPT's own share says *"The same prompt may produce different images."* So prompt equivalence buys the same **intent**, never the same **file**. For the image files themselves, compare: pixel dimensions, byte size, EXIF/XMP presence, colour profile, and DPI — a file with no EXIF and a suspiciously round byte budget is a pipeline output, not a camera or model original.

### 3.2 The parameter checklist — ours vs theirs

| Parameter | ChatGPT's prompt | Ours |
|---|---|---|
| Photo as image input | yes | yes (`gemini-image.ts`) |
| Backdrop named + colour | ✅ "seamless soft grey-beige" | style-row dependent |
| Key light type + position | ✅ "large softbox at eye level" | style-row dependent |
| Fill light | ✅ "subtle fill light" | style-row dependent |
| Colour temperature | ❌ not stated | ✅ **ours is better** — "neutral 5500K CRI-98" |
| Grounding shadow | ✅ "soft natural grounding shadow" | ⚠️ rarely stated |
| Pose named | ✅ "confident relaxed standing" | ✅ via demographic clause |
| Garment type named | ❌ not in prompt (in the chat title) | ✅ `subtype` (2026-09-18) |
| Explicit preservation **incl. length** | ✅ "100% preserved — no stretching, shortening or lengthening" | colour/print/embroidery/drape ✅; **length not explicit** |
| Missing-set completion | ❌ n/a (one garment) | 🔴 §5 R1 |

### 3.3 The two explanations for "it still looks wrong", both still live

**A — the engine may not be what you think.** A row with `engine = NULL` runs **Kontext**, not Gemini. That is now the state of all 8 MODEL rows *by design* (migration `104`). Verify per row in `/admin/studio-styles` before judging output quality. This is the "same pathetic result" explanation: nothing changed for that generation because the engine is the conservative default.

**B — the prompt never named the garment.** Until `c1ca817b`, no word like *salwar*, *dupatta*, *kameez* ever reached the prompt; `colorSpec` carried colour/fabric/pattern/embellishment but never `category` or `name`. The model was guessing garment cut from pixels alone. Dhoti and salwar are both loose gathered Indian trousers — visually close, and a generative model defaults to whichever is more common in its training data when the photo is ambiguous and the text gives no anchor. Same for dupatta drape ("over one shoulder, not wrapped across the neck"). **This was a real prompt gap, now partly closed by the `subtype` injection.**

**C — the scene style may contradict the request.** The render under review kept a mirror selfie and a phone in frame. That is the `home_mirror_selfie` row doing literally what its name says — not a model failure. Chatting "make it professional" while the selected row says *mirror selfie* is a contradiction the model resolves in favour of the row.

### 3.4 The ceiling nobody can prompt around

Even with perfect prompts, a **correct** completed outfit is *more* fine detail (embroidery on three pieces) delivered at **69 KB**. Fixing completeness without fixing the compression ceiling gets you a correct outfit rendered too softly to sell. §5 R5 is not cosmetic; it is a precondition for R1 being worth anything.

---

## §3B — Gap analysis vs Gemini / ChatGPT (merged 2026-09-18)

**Evidence quality — read before trusting a number.**

| Claim | Source | Trust |
|---|---|---|
| What our pipeline does, prompt wrapper, schema | Read in code this session | High |
| Our output: 1024×1024, 69,072 B, no EXIF | Measured (§2.5) | High |
| ChatGPT's prompt | Decoded from share link (§3.1) | High (prompt only, not pixels) |
| Gemini's prompt and pixels | Auth-walled | **Not seen** |
| Model capabilities / prices | Web search summaries, Sept 2026 (§3B.9) | Medium |
| **Any head-to-head quality claim** | **Nobody has run these models on one product photo in this project** | **None — §3B.8 is the experiment** |

Everything below marked *reasoned* is architectural inference until §3B.8 is run.

### 3B.1 The owner's test — same prompt, totally different results

The owner pasted the **Home Mirror Selfie** prompt from `AI Models and Scenes.html` into ChatGPT and Gemini: *"Place this garment on the model taking a casual full-length mirror selfie inside a warm, softly lit home interior … The garment's exact colour, print, embroidery, fabric texture and original length are 100% preserved."* The results differed completely from Kanchuki's BFL output. Ranked causes:

| # | Cause | Status |
|---|---|---|
| 1 | **`SCENE_GUARD` contradicts the request.** Every prompt on every engine is prefixed with *"Edit ONLY the background, setting and scene of this photograph. Keep the garment itself pixel-identical…"* (`studio-shoot.ts:232`, comment: "Prefixed to EVERY prompt on every engine"; used at `:318` and `:495`). Correct when the input already shows a model (scene swap). **Wrong for a hanger/flat-lay photo**: the model is told the person, pose and mirror are *not* to change — but there is no person. Kontext then has to obey "background only" while being asked to invent a body, a mirror and a phone. ChatGPT/Gemini received the plain *"place this garment on the model"* instruction. | ✅ **verified in code**; effect on output not yet bench-proven |
| 2 | **The prompt the owner pasted is not what our pipeline sends.** We wrap the row text with `SCENE_GUARD` + `garmentIdentityClause` + colour/fabric lock + person clause + top-only guard, and route it through 2–3 passes. | ✅ verified |
| 3 | **Different model class** — reasoning image models vs a diffusion editor (§3B.2). | reasoned |
| 4 | **Chat apps add hidden layers**: an LLM rewrites/expands your prompt, plans the composition, and applies default quality/style priors before the image model runs. The API-level "same prompt" is not the app-level "same prompt". | reasoned (industry-standard architecture; internal prompts unseen) |
| 5 | **Mirror-selfie is the hardest scene for an editor**: reflection consistency + phone + hand + full-length body from a flat garment photo. Mirror/phone scenes need world knowledge, which is where Kontext is weakest. | reasoned |
| 6 | **Sampling randomness**: even the same model on the same prompt varies; the chat apps also let a human regenerate and show the best. | known |
| 7 | **≤80 KB ceiling** flattens whatever came out (§2.5, §3.4). | ✅ measured |

**Unknown:** how exactly the owner ran the BFL/Kanchuki attempt (bench vs app, which row/engine, which input photo). Save those with the outputs (§3B.5).

### 3B.2 How each model class "calculates" the product photo and puts it on a model *(reasoned, not measured)*

| Class | Models | What it does with the product photo | What it can do when the photo lacks something |
|---|---|---|---|
| **Reasoning image model** (LLM backbone) | GPT Image 2, Nano Banana Pro / 2 | Encodes the photo into tokens **and understands it** — garment type, cut, print, drape, proportions. Plans the full scene (body, pose, framing, feet, accessories), then renders **person + garment + scene together in one pass**. The garment is *re-drawn from understanding*, not pasted. | **Infers.** Sees a kurta → knows sets usually include a salwar, knows how it hangs, roughly how long, that a model has feet/footwear/hair. Fills gaps from world knowledge. Risk: fine print can shift slightly. |
| **Diffusion editor** | FLUX.1 Kontext Pro (our default), FLUX.2 | Treats the photo as **visual context** and edits in latent space. Strong at *keeping what is in the photo*. | **Weak at adding what isn't there** — it has little garment-level reasoning, and treats long instructions more like style hints. A big domain jump (flat garment → mirror-selfie person) is where it degrades. FLUX.2 is better (10 references, more world knowledge), not the same as an LLM. |
| **Try-on model** | FASHN v1.5 / v1.6 | Segments/poses a **supplied person image**, warps the **visible** garment onto the body. | **Cannot invent** — it maps only what is visible. No salwar in the photo → no salwar out. Low resolution (576×864 / 864×1296). |

**Consequence for Kanchuki:** the "missing pieces" problem (§5 R1) is *native* to reasoning models and *foreign* to our default stack. That is the structural reason ChatGPT/Gemini look "smarter" on incomplete photos.

### 3B.3 What is in the product photo vs. what the model invents

| Element | In the retailer's photo? | Generated on the model | Risk if wrong |
|---|---|---|---|
| Garment colour / print / embroidery | Yes | Re-rendered | Wrong print/colour = returns |
| Garment **length** | Only implied (no scale) | Inferred | Kurta shown as tunic / too long |
| Fit / ease / how it hangs | Partly (hanger distorts) | Invented | Looks tighter/looser than real |
| Back, sleeves, side slits, neckline back | Usually **no** | Invented | Design detail not in real garment |
| **Bottom (salwar/churidar/palazzo)** | Often **no** | Invented (or omitted) | Shows a set the customer can't buy (§5 R6) |
| Dupatta placement | Sometimes | Invented drape | Wrong styling |
| **Body: face, skin, hair, hands, height** | **No** | Invented | Diversity/likeness, hand artefacts |
| Footwear, jewellery, bag | **No** | Invented | Customer thinks they're included |
| Lining / opacity / transparency | No | Guessed | Sheer vs opaque misrepresented |
| Fabric sheen / weight / movement | Weakly | Invented | Silk vs cotton look wrong |
| Scene, shadow, reflection, phone | No | Invented | Not a product risk unless it hides the garment |

**Product-data implication:** everything in the "invented" rows that affects a purchase decision (length, set contents, what's included) must come from **retailer data**, not the model — otherwise the image over-promises.

### 3B.4 Measuring the garment length and the model's height

**What cannot be done:** real centimetres cannot be read off an ordinary photo. A photo has no scale unless something of known size is in frame. A vision model can estimate *relative* proportions (garment length vs width, sleeve vs body) coarsely — an estimate with a wide error bar, not a measurement.

**What exists today:** nothing captures garment length. Checked the Prisma schema: the only `height` field is `ProductPhoto.height` (image pixels, `schema.prisma:577`); no garment length, size chart or measurements on products (the customer-measurements model was removed with VTO).

**What works (reasoned, not built):**

1. **Capture length as data.** Add optional `length_cm` (and optionally chest/shoulder) to the product form — retailers already know "42-inch kurta". This is also the number customers want.
2. **Fix a model height per demographic** (e.g. womens 165 cm) — we choose the model, so this is a constant, not a measurement.
3. **Convert to a body landmark and put it in the prompt.** Approximate anthropometry (fractions of standing height H): shoulder ≈ 0.82H, waist ≈ 0.60H, hip ≈ 0.52H, mid-thigh ≈ 0.39H, knee ≈ 0.285H, mid-calf ≈ 0.2H, ankle ≈ 0.04H. Hem height from floor ≈ `0.82H − garment_length`.
   *Worked example:* H = 165 cm, kurta = 105 cm (shoulder-to-hem) → hem ≈ 135 − 105 = **30 cm** from floor ≈ 0.18H → **just below the knee, mid-calf**. Prompt clause: *"hem falls at mid-calf, about 30 cm above the floor; do not shorten or lengthen."*
4. **Fallback without data:** vision estimates a landmark ("hem ≈ knee") from the photo, flagged as low-confidence and logged.
5. **Verify after generation:** a vision check that the hem in the output is at the requested landmark (reuse `runVisionAsk`) — cheap length QA.

Figures are approximate proportions, not clinical values; tune with real renders.

### 3B.5 Can the prompt be recovered from a Gemini/ChatGPT image? No — and what is possible

| Question | Answer |
|---|---|
| Can pixels be reverse-engineered into the **exact prompt**? | **No.** Generation is not invertible; many prompts give the same image, and the same prompt gives different images. Nothing I (or any tool) can do recovers the original text from pixels. |
| Is the prompt in the file's metadata? | **No.** ChatGPT images carry C2PA provenance (source/tool/date, not the prompt). Gemini images carry an invisible SynthID watermark, and C2PA on some surfaces (also not the prompt). EXIF is usually absent. Read with `exiftool` / `c2patool`. |
| Where *is* the prompt? | ChatGPT: the share link (decoded, §3.1) or your own chat. Gemini: your own signed-in chat (the share link is auth-walled) — copy it from there. The **hidden rewritten prompt** and system instructions are not exposed by either app. |
| What can Claude actually do with uploaded images? | **View them** and produce a **structured visual diff** and an **approximate descriptive prompt** ("what would generate this") — clearly a *reconstruction*, not the real prompt. Compare: garment fidelity, length, framing, pose, lighting, scene props, sharpness, what was added that the photo didn't contain. Useful for finding *what they add that we don't*. |

**How to use this:** put in one folder — (a) the **original product photo**, (b) ChatGPT output, (c) Gemini output, (d) Kanchuki output — plus the exact prompt/engine/row used for each. Then ask for the visual diff.

### 3B.6 Can we use their API with our prompt/commands to get the same results? Yes — mostly

Yes: the API serves the same model families as the apps (GPT Image 2 via OpenAI; Nano Banana Pro / 2 via the Gemini API — we already have the Gemini client). It will not be the *same file*, and a naive call will still look worse than the app, because the app's hidden layers are missing:

| App layer | Replicate by |
|---|---|
| LLM rewrites/expands the prompt, plans the composition | **Prompt director** — one `runVisionAsk` pass on the product photo that outputs: garment type, colour/print description, visible vs missing parts, estimated length landmark, and the final image prompt. (Machinery exists: `runVisionAsk`, `garment-parts.ts`.) |
| Photo passed at high fidelity | GPT Image 2: automatic. Gemini: pass the photo as an image block (client already does). Use `gemini_image_pro` for the premium tier. |
| Human regenerates until happy | **N=2–3 samples + automatic vision QA** (garment/length/parts check) → return best. Costs 2–3× per image, still cents. |
| Default quality/style tuning | Set quality/size explicitly (`quality:high` on GPT Image; Gemini `image_size` — hygiene, §3B.7). |
| Nothing to replicate | Do **not** prefix `SCENE_GUARD` when the input has no person (§3B.1 #1). |

**Recommended architecture (proposal):** curated command stack → English prompt → **prompt director** → **single-pass** call to `gemini_image_pro` (or GPT Image 2) with the original photo → vision QA → R2. Keep Kontext as the cheap Starter/fallback path. This is additive: `STUDIO_ENGINES` is already the single engine list.

Cautions (verify before building): OpenAI gates newer image models behind API-org verification — confirm access; no seed control on GPT Image; outputs carry provenance marks (C2PA / SynthID) — decide whether to preserve or strip and check disclosure rules; per-image cost ≈ ₹11–18 on the premium models vs ≈ ₹3 on Kontext — put it in plan pricing.

### 3B.7 Model comparison and ranked gaps

**Models** (documented/expected — see evidence table; costs are search-summary figures):

| Model | Class | Max/typical output | Takes the photo? | Garment fidelity (expected) | In Kanchuki? | ~Cost |
|---|---|---|---|---|---|---|
| GPT Image 2 (ChatGPT) | reasoning | to ~2K | ✔ high fidelity always | ✔ strongest instruction-following | **✖ no client** | $0.005–0.21 |
| Nano Banana Pro (`gemini-3-pro-image`) | reasoning | 1K default, 2K/4K | ✔ up to 14 refs | ✔ best-in-class, reasoning-guided | 🟡 `gemini_image_pro`, no row uses it | ~$0.134 |
| Nano Banana 2 (`gemini-3.1-flash-image`) | reasoning | 512–4K | ✔ | ◐→✔ | 🟡 `gemini_image` | ~$0.02–0.04 (1K) |
| FLUX.2 [pro]/[max] | diffusion editor | up to 4 MP, 10 refs | ✔ | ✔ BFL now recommends it over Kontext | **✖ not integrated** | ~Kontext band |
| **FLUX.1 Kontext Pro (our default)** | diffusion editor, prev-gen | inherits input size | ✔ 1 image | ◐ preserves pixels, weak at inventing | ✔ default, all 8 MODEL rows | ~$0.04/MP |
| FASHN try-on v1.5 (used) / v1.6 (available) | try-on | 576×864 / 864×1296 | ✔ garment-conditioned | ✔ visible garment only | ✔ v1.5 only | low |
| FLUX 1.1 pro / schnell | text→image | — | ✖ | ✖ invents garment | ✔ model-reference step only | low |

**Passes photo→final:** ChatGPT 1 · Gemini 1 · Kanchuki 2–3 (reference → try-on → scene) — each pass re-synthesises the print (generational loss). *(reasoned)*

**Ranked gaps (quality gained per effort):**

| # | Gap | Change | Effort |
|---|---|---|---|
| 1 | `SCENE_GUARD` contradicts placement on person-less photos | Conditional guard: scene-swap wording only when the input already has a person | S |
| 2 | No product understanding / no gap-filling layer | Prompt director (§3B.6) | M |
| 3 | Multi-pass generational loss | Single-pass reasoning-model path (`gemini_image_pro` / GPT Image 2) | M |
| 4 | Engine `NULL` → Kontext everywhere | Owner flips rows after bench (R7) | S |
| 5 | Length / set contents invented | `length_cm` capture + landmark clause + set completion (R1–R3) | M |
| 6 | 80 KB / 1024² ceiling | Explicit options on the studio hero path (§5 R5, §8.2) | S + owner cost call |
| 7 | Old editor, old try-on | FLUX.2 evaluation; FASHN v1.6 (864×1296) | S–M |
| 8 | Hygiene | Portrait aspect (Kontext accepts `aspect_ratio`, we send none); Gemini `image_size` not sent (client comment: left out to avoid an unexercised 400 — exercise once on the bench) | S |

**Where we are equal or better:** colour-temperature lock, demographic person swap, curated repeatable scenes, quota/metering, unattended bulk, no long-thread drift (each job independent), the whole catalog pipeline. Those are the business case; none of them help the single-image "looks like ChatGPT" test.

### 3B.8 The experiment that turns this into a decision

**Setup:** 12 real products from a pilot retailer (4 embroidered kurta sets, 3 printed kurtis, 3 dupatta-heavy, 2 kids), original photos only. Same scene wording (the mirror-selfie prompt **and** one studio prompt), n = 3 samples per arm.

| Arm | Engine | Isolates |
|---|---|---|
| A | Kontext two-step, current | baseline |
| B | Kontext, `SCENE_GUARD` removed for person-less input | cause #1 |
| C | Kontext, ceiling raised | compression alone |
| D | `gemini_image` single pass (+ prompt director) | reasoning model, cheap |
| E | `gemini_image_pro` single pass (+ prompt director) | reasoning model, premium |
| F/G | ChatGPT and Gemini apps, manual | the reference |

**Rate blind** (2 raters): garment print exact · colour exact · **length exact** · **all set pieces present** · shadow/grounding · anatomy · sharpness at 100 % · "would I buy from this". Log ₹/image and latency. **Decision rule:** ship the cheapest arm within 0.5 points of the best on print/length/completeness; if E beats C by >1 point on garment fidelity, adopt single-pass Pro for Growth/Pro and keep Kontext for Starter. **Cost:** ≈ 12 × 5 API arms × 3 ≈ 180 generations ≈ single-digit USD.

### 3B.9 Sources (web search, September 2026)

GPT Image 2: [OpenAI image prompting](https://developers.openai.com/api/docs/guides/image-prompting), [model page](https://developers.openai.com/api/docs/models/gpt-image-2), [ComfyUI node](https://docs.comfy.org/tutorials/partner-nodes/openai/gpt-image-2). Nano Banana: [Google blog](https://blog.google/innovation-and-ai/products/nano-banana-pro/), [image-generation docs](https://ai.google.dev/gemini-api/docs/image-generation), [3.1 Flash Image](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image). Comparisons (blogs — opinion, not benchmark): [Medium](https://medium.com/@cognidownunder/nano-banana-pro-vs-flux-2-max-vs-gpt-1-5-106c8f5de7b4), [CometAPI](https://www.cometapi.com/gpt-image-1-5-vs-nano-banana-pro-which-is-better-/), [Tigris](https://www.tigrisdata.com/blog/flux-kontext-vs-nano-banana/); benchmarks: [OpenVTON-Bench](https://arxiv.org/pdf/2601.22725), [Garments2Look](https://arxiv.org/pdf/2603.14153). FLUX.2: [BFL blog](https://bfl.ai/blog/flux-2), [BFL editing docs](https://docs.bfl.ml/kontext/kontext_image_editing), [fal FLUX.2 pro edit](https://fal.ai/models/fal-ai/flux-2-pro/edit). FASHN v1.6: [blog](https://fashn.ai/blog/fashn-v1-6-our-best-virtual-try-on-model-yet-now-at-864-x-1296-resolution), [docs](https://docs.fashn.ai/api-reference/tryon-v1-6).

**Limits:** no Gemini image was viewable; no model was run by the author; prices/limits change monthly; "expected fidelity" is inference until §3B.8 runs.

---

## §4 — What we are working on now (2026-09-18, uncommitted) 🟡

The committed work this session is `c1ca817b` (engine/photo path rebuilt, `subtype` injected, bench A/B added, IDM-VTON deleted + guarded — see §9). **On top of that, uncommitted right now:**

| File | What it is | Status |
|---|---|---|
| `apps/api/src/lib/garment-parts.ts` | The **detector and prompt clauses** the set-completeness requirement needs. `expectedParts(product)` derives what a product *should* consist of from `subtype`/`category`; `detectGarmentParts(image)` asks vision what is *actually visible* (structured JSON schema, provider failover via `runVisionAsk`); `missingParts(expected, visible)` = the gap; `partNoun()` / `setCompletenessClause()` / `framingClause()` build the prompt text. | 🟡 built, tested 23/23, uncommitted |
| `apps/api/src/lib/garment-parts.test.ts` | 23 tests, incl. the case that pins the actual complaint (a kurta-set photo with no visible salwar must report a missing bottom) and the inverse guard (a kurti sold alone must **not**). Drill-verified: stripping the "set implies a bottom" rule fails 3 tests. | 🟡 |
| `scripts/studio-garment-audit.ts` | The **diagnostic tool** — runs `expectedParts` → `detectGarmentParts` → `missingParts` against real product photos and prints what is missing, so the gap is measured rather than guessed. Needs live keys to be useful. | 🟡 |

**Deliberately not wired in yet.** Nothing calls these from the pipeline. Wiring them is a product decision (R1 gating, R5 compression, R6 disclosure) that is still open — see §10. The detector is also the cheapest way to *prove* the diagnosis before changing generation behaviour.

**What to run to diagnose:** `scripts/studio-garment-audit.ts` with `FAL_API_KEY` (or `GEMINI_API_KEY`) set and real photo URLs. Output tells you, per product, which parts the vision pass sees and therefore which products would trigger set-completion. Until that runs, the rate of "missing salwar" across a real catalog is unknown.

---

## §5 — Current requirements

### R1 — Product-set completeness 🟡 core requirement

**Requirement (owner's words):** if the photo shows a kurti/kameez but no salwar, **generate the salwar** on the model with the same fabric/design and a matching colour, so the complete product (kameez + salwar + dupatta) is shown.

**Hard technical constraint that decides the design:** the try-on step is **garment-conditioned**. FASHN v1.5 dresses a person in *the garment it was handed*. It cannot invent a garment that is not in the picture, and neither can Kontext or Gemini-as-editor credibly — they would invent one from their own training data, not from your product. Therefore the order is forced:

```
product photo
  └─ 1. COMPLETE THE SET   ← an editor pass (Gemini / Kontext), BEFORE try-on
  └─ 2. try-on             ← now handed the whole set as one image
  └─ 3. scene + effects    ← the 4–5 stacked commands
```

**Gating (owner decision: gate on product data).**
Gate on the product declaring a set. `expectedParts()` reads `subtype`/`category` and maps set-distinguishing values (Kurta Set, Salwar Suit, Churidar Set, Anarkali, Sharara…) → `{top, bottom, drape}`. Subtype taxonomy is DB-driven (F-027), so this mapping is config, not a hardcoded list.

**The two cases that must not be confused** — this is the same root cause as RC-027 one layer down (the pipeline didn't know what the garment *was*, so it couldn't know what was *missing*):

| Case | Bottom exists in the product? | Correct behaviour |
|---|---|---|
| Kurti / blouse / tee sold alone | No | **Do not invent one** — `isTopOnlyGarment()` stands |
| Kurta set / salwar suit / churidar set / anarkali | Yes, just invisible in the photo | **Complete the set** |

**Acceptance criteria**
- A product whose `subtype`/`category` is a set, and whose photo shows no visible bottom, produces output showing a bottom in the **same fabric + print + colour family + embroidery** as the kameez — never a contrasting one.
- A top-only product's output still shows no invented bottom (existing guard intact, no regression).
- The vision check (`detectGarmentParts`) is consulted; the decision is not made from the subtype alone.
- ⚠️ **Blocker:** if the physical salwar's print differs from the generated one, the customer sees a set that isn't the set they get — a product-listing problem, not a rendering problem. See R6.

### R2 — Visible-parts check 🟡 built, not wired

A vision call that answers *which of kameez / salwar / chudidar / palazzo / dupatta / blouse are visible in this photograph* → structured list. This is the "check" that did not exist before `garment-parts.ts`. Uses the existing `runVisionAsk({ images, systemPrompt, userPrompt })` path (already live for AI scene-naming and product description) → provider failover + quota attribution come for free.

**Acceptance:** for a photo of a kameez alone, the check reports `bottom: false`; for a photo showing both, `bottom: true`. Already covered by `garment-parts.test.ts`.

### R3 — Framing precondition 🔴 not built

A salwar **cannot** be visible if the crop is 3/4 or the hem is out of frame. No prompt can fix a crop. For set products, **full-length with hem (and ideally footwear) in frame becomes a hard precondition**, and `framingClause(framing)` states it in the prompt. Without this, R1 will "work" and still show nothing.

**Acceptance:** generating a set product through a half-body template either upscales the framing to full-length or refuses with a clear reason — it must not silently produce a set product with no visible bottom.

### R4 — Effects: 4–5 stacked commands merged into one prompt 🟡 partially shipped

The owner's command library (≈200–300 slash commands across catalog/pose/camera/light/motion/editorial/environment/cinematic/premium/fabric) is **already conceptually shipped** as the curated `studio_styles` rows — admin-curated rather than freeform. What is missing is the *composition* of several effects into one prompt.

**Design that works (and the failure mode to design against):**

- A registry with **conflict groups** (camera angle, light type, environment, finish) — **last-wins, and surface the conflict** to the picker.
- A **fixed expansion order**, so two prompts with the same effects compose identically: `subject → garment → pose → camera → light → environment → finish`.
- A **length cap**, and the **preservation clause kept last** so recency gives it authority.
- ⚠️ The failure mode a 300-command dictionary invites is **stacking contradictions**: `/softbox` + `/neon`, or `/fullbody` + `/closeup`, average to mush. Conflicts must be detected, not averaged.
- Note: slash commands are *our* vocabulary for the picker, **not** commands the models recognise. The expansion to English happens in `buildStudioPromptContext()`.

### R5 — Output quality ceiling 🟡 diagnosed, not fixed

| # | Change | Why |
|---|---|---|
| 5a | **Raise the ceiling for hero studio output** — pass explicit options to `compressImageToTarget()` for the studio path (e.g. `maxBytes` ≈ 400 KB–1 MB, `maxDimension` 2048) instead of inheriting the 80 KB catalog default | A hero image at 69 KB cannot show embroidery. Cost: R2 storage + egress — a real trade the owner should choose |
| 5b | **Portrait output for garments** — request 3:4/4:5 rather than inheriting a square source | Garments are tall; square crops lose hem and drape |
| 5c | **Add the explicit preservation clause including length** ("no stretching, shortening or lengthening") — the ChatGPT prompt states it, ours does not | Length is a common failure (a kurta rendered as a tunic) |
| 5d | **State the grounding shadow** in model scenes | The ChatGPT prompt does; it is what stops a subject looking pasted on |

**Acceptance:** a studio output of a detailed-embroidery product retains visible stitch/print detail at 100 % zoom, and is portrait.

### R6 — Disclosure of an AI-completed component 🔴 open decision

Plain-language version, since this was asked for: when the pipeline **invents** a salwar that isn't in the photograph, we have created a picture of a garment that the retailer may not actually possess in that exact form. If the physical salwar is a different print, the customer is shown a set they cannot buy. That is a product-listing accuracy issue (and a consumer-protection one in India), not a rendering nit.

Three options, all implementable, none decided:

| Option | Behaviour | Cost |
|---|---|---|
| **A. Gate strictly** | Only complete the set when the product data declares a bottom *and* a reference for that bottom exists (a second photo) | Safest; less magic |
| **B. Complete + record** | Generate, and record on the photo row that a component was AI-completed (visible to the retailer, not necessarily the shopper) | Middle; needs a schema/flag field |
| **C. Complete + label** | As B, plus a customer-visible indication on the catalog card | Most honest; may read as a defect to shoppers |

**Recommendation:** B for MVP — record it, don't surface it — because it makes the defect auditable without advertising it. **Owner must choose.**

### R7 — Engine verifiability 🔴 process

Before any quality judgement: confirm which engine each `studio_styles` row actually runs. All 8 MODEL rows are `engine = NULL` → Kontext as of `104`. This is the explanation for the "no change" result in §3.3 A.

### R8 — Carried over from the photo-feature tasks 🟡 triage in §9

Still valid, still not built: image-size validation (<20 MB / <20 MP) before provider submit; per-generation credit/cost tracking in job metadata; progress % + ETA on the polling endpoints; retailer-visible credit/metering display; responsive (non-fixed-3:4) product-gallery aspect.

---

## §6 — The effects command library → build design

**Families** (each family = one `studio_styles` row today; each row's `prompt`/`scene` text is the expansion):

| Family | Example commands | Rows exist? |
|---|---|---|
| Product presentation | `/catalog` `/whitebg` `/greybg` `/beigebg` `/blackbg` `/flatlay` `/ghost` `/hanger` `/folded` `/detail` `/macro` `/front` `/back` `/side` `/threequarter` `/360` | ✅ PRODUCT tab (8 rows) |
| Model / demographic | `/onmodel` `/modelmale` `/modelfemale` `/modelindian` `/modeleditorial` `/modelluxury` `/modelstreet` | ✅ 6-way `PRODUCT_DEMOGRAPHICS` |
| Pose | `/pose_standing` `/pose_walk` `/pose_relaxed` `/pose_power` `/pose_sitting` `/pose_candid` `/pose_runway` `/pose_spin` | 🟡 partial (baked into scene prompts) |
| Camera | `/lens24` `/lens35` `/lens50` `/lens85` `/telephoto` `/eyelevel` `/lowangle` `/highangle` `/topdown` `/closeup` `/fullbody` `/threequarter` `/profile` | 🔴 not a separate axis |
| Light | `/softbox` `/beautydish` `/clamshell` `/rimlight` `/backlight` `/hardlight` `/diffused` `/highkey` `/lowkey` `/goldenhour` `/windowlight` | 🟡 baked into scenes |
| Motion | `/motion` `/fabricmotion` `/wind` `/dressflow` `/walkingmotion` `/spinmotion` `/freezeaction` `/motionblur` | 🔴 (this is where F-034 video fits) |
| Environment | `/studio` `/architecture` `/rooftop` `/beach` `/desert` `/forest` `/luxuryinterior` `/industrial` `/marbleluxury` | ✅ many scene rows |
| Cinematic / finish | `/cinematic` `/filmgrain` `/35mmfilm` `/anamorphic` `/lensflare` `/lightleak` `/haze` `/fog` | 🟡 baked into scenes |
| Premium | `/quietluxury` `/oldmoney` `/minimalistluxury` `/blackluxury` `/marbleluxury` | ✅ Marble Premium Luxury row |
| Fabric / material | `/silk` `/velvet` `/denim` `/cotton` `/linen` `/knit` `/leather` `/embroidery` `/stitching` | 🔴 derived from product `fabric` where possible |
| Shadow | `/softshadow` `/longshadow` `/hardshadow` `/groundshadow` `/floating` | 🔴 R5 5d |
| Reflective | `/reflection` `/mirror` `/glass` `/wetfloor` `/prism` | 🔴 |

**Build order if this is picked up:** (1) make **camera** and **light** real axes rather than text baked into scenes — they are the two families that change the visual language without touching the garment; (2) add conflict groups + last-wins; (3) then the exotic families. Do **not** build a 300-row picker before (1) and (2) exist — a flat list of 300 is unusable and will contradict itself.

Reference sheets (static, no build step, open with `file:///`): `docs/tasks/AI Models and Scenes.html` (scene/model prompts, marked FINALIZED SET), `docs/tasks/AI Motion Styles.html` (16 motion presets for F-034).

---

## §7 — F-034: AI Image→Video for Social Promo

**Status: Phase 1 ✅ built (admin bench only). Phase 2 🔴 HARD-DEFERRED — owner decision 2026-09-03, admin-test-only.** Do not start Phase 2 until the owner bench-tests models × styles and says go.
**Supersedes** F-032 Phase B ("Product video"). **Master spec:** `docs/PRO-REQUIREMENTS.md` §30.

### 7.1 What it is

Product photo → 5–8 s clip (fabric sway, model turn, slow push-in) for Reels / Shorts / FB feed. Paid per clip (₹13–90), metered by a new `AI_VIDEO` quota + overage credit packs (reuses F-010 addon machinery). **Not F-033** — that is a deterministic ffmpeg Ken-Burns slideshow, no AI, no per-clip cost.

### 7.2 Models (Fal.ai, same `FAL_API_KEY`)

| Model | Endpoint (confirm live at build) | ~₹ / 5 s | Plan tier |
|---|---|---|---|
| Seedance (ByteDance) | `fal-ai/bytedance/seedance/v1/lite/image-to-video` | 13–34 | Starter overage / budget |
| WAN 2.x (Alibaba) | `fal-ai/wan/v2.2/image-to-video` | 15–34 | Starter / Growth |
| Kling 1.6 std | `fal-ai/kling-video/v1.6/standard/image-to-video` | 21–30 | Growth default |
| Kling Pro / 2.x | `fal-ai/kling-video/v2/master/image-to-video` | 40–85 | Pro |
| Luma Ray 2 | `fal-ai/luma-dream-machine/ray-2/image-to-video` | 40–170 | Pro / premium |

Aspects: **9:16** (Reels/Shorts), **16:9**, **1:1** / **4:5**. Store per-call ₹ with the model config so credit-pack math stays honest when Fal changes prices. `runFalTask()` needs a **video variant** reading `video.url` and a longer poll timeout (video ≈ 60–180 s vs image ≈ 25 s).

### 7.3 Phase 1 — built ✅

| Item | Status |
|---|---|
| `apps/api/src/lib/fal-video.ts` — `generateImageToVideo()` + `VIDEO_MODELS` + `cropTrimToAspect()`; self-check 3/3 with real ffmpeg | ✅ `17fe997` |
| `POST /admin/photo-cleanup/image-to-video` (sync, admin-only): zod body → Fal → ffmpeg crop/trim → R2 `promo-<uuid>.mp4` → `result_url` | ✅ `17fe997` |
| `docs/tasks/AI Motion Styles.html` — 16 presets / 4 categories, "Export Selected" → JSON | ✅ `17fe997` |
| Admin **"AI Promo Video"** card on `/admin/photo-cleanup-test` | ✅ `f57479c` → **owner bench test = the gate** |
| Admin addon-pack surface — migration `089_resource_packs` (**applied**), `admin-resource-packs.ts` CRUD, `/admin/resource-packs` screen | ✅ `47748a4` |

### 7.4 Phase 2 — deferred 🔴, tasks 5–10

| Task | Deliverable |
|---|---|
| **5** | `studio_styles.kind` (IMAGE/VIDEO) + admin VIDEO CRUD + per-tier model map (`plan_video_models`). Seed rows come from the *survivors* of the bench test. |
| **6** | `QuotaResourceType.AI_VIDEO` + `plan_limits` seeds + retailer-side billing switch from the `ADDON_PRICING` const to `resource_packs` rows. |
| **7** | `apps/api/src/routes/products/products-video-ai.ts` (202 + status + `checkQuota`) + `apps/api/src/jobs/generate-promo-video.ts` + queue wiring + tests (`growth-videos.test.ts` / `admin-studio-styles.test.ts` as the pattern). Video is paid: **no quota → no call**; `incrementUsage` on success. |
| **8** | Mobile: `useProductAiStudio.generateVideo` + `ProductPromoVideoModal` + entry points (product detail, growth "Reels & Video"). |
| **9** | `publishInstagramReel()` + IG branch (`publishVideoPost()` for FB already exists). |
| **10** | Docs sweep (CLAUDE.md row, BUILD-LOG, PRO-REQUIREMENTS §30, PLAN.md, PROGRESS). |

**Global conventions for Phase 2 (non-negotiable):**
- **No hardcoded prices / packs / limits in code.** Everything DB-backed and admin-managed (`plan_pricing` / `/admin/plan-limits` pattern). Migration seeds are starter defaults the admin owns and edits live. **Do not touch `ADDON_PRICING` in `@kanchuki/shared`.**
- **`ALTER TYPE … ADD VALUE` cannot run in the same transaction as its use** → schema-only migration, then a separate seed migration.
- Prisma `schema.prisma` edits ship with the migration SQL but only take effect once applied.
- Per-task gate: tsc (api + web) clean, new tests green.

### 7.5 ⚠️ Migration numbers in the old draft are now WRONG

The deleted `image-to-video*.md` files reserved **`090_ai_video`** and **`091_ai_video_seed`**, written 2026-09-03 when `089` was the newest. Since then `090`, `091`, `092` were taken by the social composer (carousel / post templates / client dedupe — applied in prod) and the sequence has run to **`105`**.

**If Phase 2 is picked up, renumber to the next free slots (≥ `106`).** Reusing `090_ai_video` would collide with an applied migration. The SQL content below is fine; only the numbers change.

```sql
-- schema-only migration (number TBD, ≥106)
ALTER TYPE "ProductVideoSource" ADD VALUE 'AI_GEN';
ALTER TYPE "QuotaResourceType"  ADD VALUE 'AI_VIDEO';
ALTER TABLE "studio_styles" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'IMAGE';
```

```sql
-- seed migration (separate tx — the new enum values are only usable here)
CREATE TABLE "plan_video_models" (
    "id" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "model" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plan_video_models_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "plan_video_models_plan_key" ON "plan_video_models"("plan");
INSERT INTO "plan_video_models" ("id","plan","model","updated_at") VALUES
  ('plan_video_model_starter','STARTER','seedance', now()),
  ('plan_video_model_growth', 'GROWTH', 'kling_std',now()),
  ('plan_video_model_pro',    'PRO',    'kling_pro',now());

INSERT INTO "plan_limits" ("id","plan","resource_type","limit_per_period","period","created_at","updated_at") VALUES
  ('plan_limit_ai_video_starter','STARTER','AI_VIDEO', 3,'MONTH',now(),now()),
  ('plan_limit_ai_video_growth', 'GROWTH', 'AI_VIDEO',12,'MONTH',now(),now()),
  ('plan_limit_ai_video_pro',    'PRO',    'AI_VIDEO',40,'MONTH',now(),now())
ON CONFLICT ("plan","resource_type") DO NOTHING;
```

**Apply order:** schema migration → seed migration → Prisma schema sync → verify `studio_styles.kind` + `plan_limits` + `plan_video_models` live → then flip routes on. **Owner applies from the admin dashboard; never the agent.**

### 7.6 Explicitly NOT doing (F-034)

- ❌ Per-clip Razorpay checkout — credit packs only.
- ❌ Free-text motion prompts for retailers — curated styles only (free text stays on the admin bench).
- ❌ Self-hosted video GPU — Fal API only until volume proves a box cheaper.
- ❌ In-app YouTube upload in Phase 1 — retailer uploads manually.
- ❌ Clips longer than ~8 s — cost scales with length and these models warp fabric/faces the longer they run.
- ❌ Treating the clip as a catalog-accurate asset — it is a **promo mood clip**; the original photo stays the primary media.

---

## §8 — Cross-cutting concerns

### 8.1 Quota & cost

| Resource | Gate | Pattern |
|---|---|---|
| Image studio shoot | Growth/Pro only, STARTER → 402 | `STUDIO_SHOOT` `QuotaResourceType`, F-010 pattern, no per-retailer override |
| Promo video (F-034 P2) | `AI_VIDEO` + overage credit packs | `checkQuota` (route) / `incrementUsage` (job on success) / `resource_packs` rows |
| Addon packs | admin-managed DB rows, `/admin/resource-packs` | `089_resource_packs` ✅ applied |

### 8.2 The 80 KB ceiling — the decision table

| Path | Current | Recommendation |
|---|---|---|
| Product-grid thumbnail | `<= 80 KB`, max 1600 px | keep |
| Catalog card | inherit | keep |
| **Studio hero / AI output (retailer gallery + share)** | **inherits 80 KB** | **explicit overrides: ~400 KB–1 MB, 2048 px, portrait** (R5 5a/5b) |

Changing this is a **storage + egress cost decision** for the owner, not a code preference: R2 grows roughly 5–10× per studio image.

### 8.3 Verification protocol (every change in this area)

| Gate | Command | Expected |
|---|---|---|
| API types | `cd apps/api && npx tsc --noEmit` | clean |
| Web types | `cd apps/web && npx tsc --noEmit` | clean |
| API tests | `cd apps/api && npx vitest run` | green (**1014 → 1037** after `garment-parts`) |
| Web tests | `cd apps/web && npx vitest run` | **279/279** |
| Lint | `npx biome check <changed files>` | clean / at baseline |
| Retired-model guard | included in API suite (`retired-tryon-guard.test.ts`) | passes |
| Doc test | counts in this file vs reality | must match |

**What these gates do NOT prove:** output quality. Nothing in this area has been run against the live providers from a build session. **The first real run is the owner's, on the bench.**

---

## §9 — Findings from this merge (doc bugs caught, stale items, collisions)

| # | Finding | Action |
|---|---|---|
| 1 | **Migration-number collision.** `image-to-video-phase2.md` reserved `090`/`091` for F-034; both are now applied by the social composer. Following it verbatim would collide | Corrected in §7.5 (renumber ≥106). **Old draft deleted.** |
| 2 | **`photo-feature-implementation-tasks.md` carries tasks for a removed feature** — Virtual Try-On (GPU detection on V-Tone, 24 h expiry countdown, exponential-backoff polling) and a `TryOnModal`. VTO was torn out 2026-08-31 (migration `082`) | Marked ⛔ in §1; not carried into §5 as work |
| 3 | **Stale duplicate reference sheet:** `docs/tasks/AI Models and Scenes.hmtl` (typo'd extension, 52 KB, Aug 30) alongside the live `AI Models and Scenes.html` (75 KB, Sep 18, marked FINALIZED SET) | **Flagged only** — not deleted by this doc merge (owner said `.md` files). Recommend deleting the `.hmtl` one |
| 4 | **Stale migration reference in `ai-studio-shoot-models-scenes.md`:** step 6 describes `STUDIO_TEMPLATES`/`STUDIO_MODELS` constants and a `studioTemplatesFor()` helper — all deleted from `@kanchuki/shared`, replaced by the `studio_styles` DB table + admin manager | Recorded in §2; constants are gone (step 6 confirmed done via the DB-backed catalog) |
| 5 | **`CLAUDE.md` rows 54 and 60 point at files this merge deletes** | **Gated file — needs explicit approval.** See §13.5 |
| 6 | The F-034 model endpoints are marked "confirm live at build" and none has been verified | `fal-video.ts` self-check exists; **endpoint liveness still unverified** |
| 7 | The "which engine is actually running" question had no single place to answer it | §7 R7 / `/admin/studio-styles`; all MODEL rows are `engine = NULL` → Kontext |
| 8 | **`SCENE_GUARD` ("edit ONLY the background… pixel-identical") is prefixed to every prompt on every engine** (`studio-shoot.ts:232/:318/:495`) — wrong for a person-less product photo | §3B.1 #1, §3B.7 gap #1 |
| 9 | Earlier draft of the analysis over-weighted the Gemini `image_size` gap — the owner corrected this: the real question is how each model reads the product photo and fills what's missing | Re-ranked; `image_size` is now hygiene (§3B.7 #8) |
| 10 | §1 cost table omits **FLUX.2 [pro]** (BFL recommends it over Kontext for editing) and §2.1 uses **FASHN v1.5** while **v1.6 (864×1296)** exists | Added to §3B.7; not yet evaluated on the bench |
| 11 | No GPT Image engine exists — ChatGPT's own model has no arm in our bench | §3B.6, §3B.7 |
| 12 | No garment length / size-chart data exists on products (only `ProductPhoto.width/height` in pixels) | §3B.4 |

---

## §10 — Open decisions for the owner

| # | Decision | Options | Blocking |
|---|---|---|---|
| 1 | **Compression ceiling for studio hero output** (R5 5a) | keep 80 KB / raise to ~400 KB–1 MB at 2048 px | R1's value |
| 2 | **AI-completed component disclosure** (R6) | A strict gate / B complete + record / C complete + label | R1 shipping |
| 3 | **Portrait enforcement** (R5 5b) | force 3:4 / 4:5 for garment scenes, or leave inherited | output quality |
| 4 | **Engine per MODEL row** (R7) | Kontext (default, safe) vs `gemini_image` / `gemini_image_pro` per row | the whole quality call |
| 5 | **F-034 Phase 2 go/no-go** after bench testing | 🔴 deferred since 2026-09-03 | video feature |
| 6 | **Camera + light as real picker axes** (R4 step 1) | build now vs keep baked into scenes | effects library |
| 7 | **Delete `AI Models and Scenes.hmtl`** (stale duplicate) | yes / keep | doc hygiene |
| 8 | **Google Merchant Center push** (separate future feature — gives retailers free Google-hosted try-on without Kanchuki hosting anything) | worth scoping vs not | not blocking anything |
| 9 | **Use OpenAI/Gemini APIs as the primary quality path** with a prompt director (§3B.6) | yes (Growth/Pro) + Kontext for Starter / no | the whole quality goal |
| 10 | **Capture garment `length_cm` on the product form** (§3B.4) | build / skip (vision estimate only) | length accuracy |
| 11 | **Add a GPT Image 2 engine** (needs API-org verification check) | yes / Gemini-only | parity with ChatGPT |

---

## §11 — Reuse map (verified, 2026-09-18)

| Need | Reuse | File |
|---|---|---|
| Fal submit + poll | `runFalTask()` (+ a `video.url` variant for F-034) | `apps/api/src/lib/fal-client.ts` |
| Gemini image edit (accepts photo) | `generateGeminiImage()` | `apps/api/src/lib/gemini-image.ts` |
| Studio pipeline entry | `generateStudioImage()` / `generateStudioOrderAb()` | `apps/api/src/lib/studio-shoot.ts` |
| Prompt assembly (single source) | `buildStudioPromptContext()` | `apps/api/src/lib/studio-shoot.ts` |
| Set completeness / vision parts | `expectedParts()` / `detectGarmentParts()` / `missingParts()` / `setCompletenessClause()` / `framingClause()` | `apps/api/src/lib/garment-parts.ts` 🟡 |
| Vision ask (with failover + quota) | `runVisionAsk()` | `packages/ai/src/` |
| Admin sync test routes | `POST /admin/photo-cleanup/studio-shoot`, `/studio-ab`, `/image-to-video` | `apps/api/src/routes/admin/admin-photo-cleanup.ts` |
| Admin bench UI | "AI Studio Shoot" + A/B card + "AI Promo Video" card + `uploadToR2` + lightbox | `apps/web/src/app/admin/photo-cleanup-test/page.tsx` |
| Curated styles CRUD | `studio_styles` + admin manager (+`kind` for VIDEO) | `admin-studio-styles.ts`, `apps/web/src/app/admin/studio-styles/page.tsx` |
| Retailer async route | `products-studio.ts` (202 + status + quota) | `apps/api/src/routes/products/products-studio.ts` |
| Job + Redis status | `studio-shoot.ts` job, `get/setStudioJobStatus` | `apps/api/src/jobs/studio-shoot.ts` |
| ffmpeg trim / crop / encode | `-filter_complex`, `execFileAsync`, canvas consts | `apps/api/src/jobs/generate-ken-burns-video.ts` |
| Video row + R2 path | `ProductVideo`, `R2_PATHS.productVideo()`, `uploadBuffer(..,'video/mp4')` | `packages/db/prisma/schema.prisma`, `generate-ken-burns-video.ts` |
| Quota check / increment | `checkQuota` / `incrementUsage` / `getQuotaStatus` | `apps/api/src/lib/quota.ts` |
| Credit packs | `/billing/addon-checkout`, `quotaAddonPurchase`, `resource_packs` | `apps/api/src/routes/billing/billing-addons.ts` |
| Plan-limit admin UI | renders every `QuotaResourceType` automatically | `/admin/plan-limits` |
| Mobile poll + state | `useProductAiStudio` (`generateVideo`, `pollWithBackoff`) | `apps/mobile/src/hooks/useProductAiStudio.ts` |
| Mobile picker | `ProductStudioModal.tsx` | `apps/mobile/src/components/product-detail/ProductStudioModal.tsx` |
| FB video post | `publishVideoPost()` | `apps/api/src/lib/meta-graph.ts`, `retailers-social-posts.ts` |
| Watermark overlay (server-side `sharp`, for logo/badge compositing) | F-066 Suits Designs watermark | `apps/api/src/lib/` |
| Image compression | `compressImageToTarget()` | `packages/ai/src/image-compress.ts` |

---

## §12 — Verification of this document

This doc was produced by reading all 5 source files and the live code. Facts asserted here were checked against:

- `packages/shared/src/constants/index.ts:349` (`STUDIO_ENGINES`), `:366` (`PRODUCT_DEMOGRAPHICS`), `:415/420/435` (`INTEGRATION_KEYS`)
- `apps/api/src/lib/studio-shoot.ts` (`:158` guard, `:619` A/B, `:733` entry, `:994` R2+compress)
- `apps/api/src/lib/gemini-image.ts` (`:50` model union, `:192` default model)
- `apps/api/src/lib/fal-client.ts` (endpoints `:152/:168/:207/:236/:307`)
- `apps/api/src/lib/garment-parts.ts` + `.test.ts` (23 tests, drill-verified)
- `packages/ai/src/image-compress.ts:58` (80 KB / 1600 px defaults)
- `packages/db/prisma/migrations/` (latest = `105_studio_styles_engine_rename`; `090`–`092` taken by the social composer)
- the 5 merged task docs, in full

**Counts cited here:** API **1037/1037** (was 1014 before `garment-parts`), web **279/279**, both `tsc` clean. Re-verify after any change.

---

## §13 — Provenance

### 13.1 Merged into this file (and deleted in the same change)

| Deleted file | What was salvaged into |
|---|---|
| `docs/tasks/AI-Tools-Photo-Generation-Research.md` (2026-09-18) | §1 (why pay us, cost table, engines-not-replacement), §1 VTO-research block, sources in §13.3 |
| `docs/tasks/ai-studio-shoot-models-scenes.md` (2026-08-30, finalised 2026-09-18) | §2.3 (demographic/person clause/scene tags/finalised MODEL set), §9 #4 (stale constants) |
| `docs/tasks/photo-feature-implementation-tasks.md` | §5 R8 (still-valid items), §9 #2 (VTO tasks obsolete), §1 (removed-feature note) |
| `docs/tasks/image-to-video.md` (2026-09-03) | §7 in full — models, Phase 1 evidence, Phase 2 tasks, reuse map, NOT-doing |
| `docs/tasks/ai-photo-quality-gap-analysis.md` (2026-09-18) | §3B in full (deduplicated against §1 cost, §2.5/§3.4 ceiling, §3.3 engine-NULL, §5 R5) + §0a hand-off + §9 #8–12 + §10 #9–11. Deleted after merge. |
| `docs/tasks/image-to-video-phase2.md` (2026-09-03) | §7.4 (tasks 5–10), §7.5 (migration SQL, **renumbered**), §7 global conventions, §7.6 verification gate |

### 13.2 New content added by this merge (not in any source file)

§3 (the Gemini/ChatGPT decode + parameter comparison + measured 69 KB finding), §4 (the uncommitted `garment-parts.ts` work), §5 R1–R7 (the set-completeness requirement and its gating/framing/disclosure constraints), §6 (the effects-library build design and conflict-group warning), §8.2 (the compression decision table), §9 (all findings), §10 (decisions).

### 13.3 Sources cited (from the research doc)

Gemini / Nano Banana: `ai.google.dev/gemini-api/docs/image-generation`, Google's commercial-use clarification thread, Nano Banana 2 API guides (ark-route, aimlapi), Nano Banana Pro restrictions (aifreeapi), character-consistency notes (nanobananatool). ChatGPT Images: pricing analyses (eesel, unifically), OpenAI usage policies + service terms. FLUX: `bfl.ai/pricing`, Together's Flux Kontext Pro page. VTO context: TechCrunch on Google's selfie try-on, adrianarivas.tech on Google VTO in Search, Google's studio-quality try-on post, Fstoppers on AI product photography, IDM-VTON/CatVTON explainers (Medium, opencreator).

### 13.4 Reference sheets retained (static HTML, not merged)

| File | Purpose |
|---|---|
| `docs/tasks/AI Models and Scenes.html` | Image scene/model prompt library — **FINALIZED SET** marked at the top of its `ITEMS` array. The 21 retired scenes stay in it as design reference only (no longer live in the DB). |
| `docs/tasks/AI Motion Styles.html` | F-034 motion presets — 16 across 4 categories, "Export Selected" → `selected_ai_motion_styles.json`. The staging ground for `studio_styles` VIDEO rows. |
| `docs/tasks/AI Models and Scenes.hmtl` | ⚠️ Stale typo'd duplicate (Aug 30). **Delete candidate** — see §9 #3. |

### 13.5 Historical references — read before "fixing" them

Several files mention the deleted filenames as **dated records of what happened**. Those mentions are historically accurate and were deliberately **not** rewritten (rewriting a build log is worse than a stale link):

- `docs/BUILD-LOG.md` — historical entries referencing `image-to-video.md` / `image-to-video-phase2.md` / the studio-scenes doc.
- `docs/PROGRESS.md` — session log mentions.
- **`docs/PLAN.md`** and **`docs/PRO-REQUIREMENTS.md`** — forward-looking pointers, **updated in this change** to point here (a dangling "where's the spec" link is a real defect, unlike a dated log line).
- ✅ **`CLAUDE.md` — repointed with explicit owner approval (2026-09-18).** Row 54 now points here instead of the deleted scene-expansion doc (and its stale "Built (unmerged)" status was corrected — steps 1–6 are done via the DB-backed style catalog); row 60's doc pointers were replaced and its stale `090`/`091` migration numbers corrected to "renumber ≥106". No dangling reference to a deleted file remains in this file.
