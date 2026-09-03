# F-034 — AI Image→Video for Social Promo (Reels / Shorts / Feed)

**Status:** 🧪 **PHASE 1 BUILT (admin test bench) — tasks 1–4 done 2026-09-03** (commits
`17fe997`, `f57479c`). **Task 6.1 admin addon-pack surface** (migration `089_resource_packs`,
CRUD API, `/admin/resource-packs` screen) built 2026-09-03 (commit `47748a4`).
**Phase 2 (retailer mobile + queue + FB/IG publish) 🔴 HARD-DEFERRED on owner decision
2026-09-03 — ADMIN-TEST-ONLY.** Tasks 5/7/8/9 must NOT start until the owner has
bench-tested the models × styles and says go.
**Created:** 2026-09-03
**Supersedes:** F-032 Phase B (§24.4 / §24.7 "Product video").
**Master spec:** `docs/PRO-REQUIREMENTS.md` §30 (decisions, economics, model table). This
file is the *build* plan — what to code, in what order, what to reuse.

**Owner workflow (same as AI Studio Shoot):**
1. Build **Phase 1** — admin test bench at `/admin/photo-cleanup-test` (a new
   "AI Promo Video" card next to the existing "AI Studio Shoot" card).
2. Owner tests every model × motion style × aspect on real product photos,
   picks the shipping set, finalises per-plan model mapping + credit-pack prices.
3. Build **Phase 2** — retailer integration on the product detail screen and the
   growth "Reels & Video" screen, reusing the finalised styles.

---

## Goal

Turn a product photo into a 5–8s moving clip (fabric sway, model turn, slow
camera push-in) for Instagram Reels / YouTube Shorts / Facebook feed. Photo in →
MP4 out, cropped to the chosen aspect, saved to the product's video gallery, one
tap to post to Facebook / Instagram.

This is **paid** — each clip is a real Fal.ai API cost (₹13–90). Metered via a new
`AI_VIDEO` quota + overage credit packs (reuses the F-010 addon machinery).

Not F-033: that is a deterministic ffmpeg Ken-Burns slideshow, no AI, no per-clip
cost. F-034 is model-generated motion.

---

## Models (Fal.ai — same `FAL_API_KEY` as F-032)

`apps/api/src/lib/fal-client.ts::runFalTask(endpoint, input, onProgress)` is
already a generic submit + queue-poll + result helper. It reads the result from
`images[]` / `image`. **Video needs a small variant** (`generateImageToVideo`)
that reads `video.url` instead and raises the poll timeout (video ≈ 60–180s vs
image ≈ 25s).

| Model | Fal endpoint (confirm live at build) | ~₹ / 5s clip | Plan tier |
|---|---|---|---|
| **Seedance** (ByteDance) | `fal-ai/bytedance/seedance/v1/lite/image-to-video` | 13–34 | Starter overage / budget |
| **WAN 2.x** (Alibaba) | `fal-ai/wan/v2.2/image-to-video` | 15–34 | Starter / Growth |
| **Kling 1.6 std** | `fal-ai/kling-video/v1.6/standard/image-to-video` | 21–30 | Growth default |
| **Kling Pro / 2.x** | `fal-ai/kling-video/v2/master/image-to-video` | 42–85 | Pro |
| **Luma Ray 2** | `fal-ai/luma-dream-machine/ray-2/image-to-video` | 40–170 | Pro / premium |

Store the per-call ₹ cost with the model config so credit-pack math stays honest
when Fal changes prices. Aspect: **9:16** (Reels/Shorts), **16:9** (YouTube
landscape), **1:1** / **4:5** (feed).

---

## Phase 1 — Admin test bench (BUILD FIRST)

Mirror the existing AI Studio Shoot bench exactly.

### Motion-style catalog — `docs/tasks/AI Motion Styles.html` (new)

Same idea and skin as `docs/tasks/AI Models and Scenes.html` (the FLUX Kontext
scene/model prompt sheet): a **static, single-file HTML catalog** — no build step,
open with `file:///`. Hardcoded JS dataset of motion-style presets, each with:

- `id`, `name`, category badge (`camera-move` / `garment-motion` / `model-action`
  / `ambient`)
- `motion_prompt` — the text pasted into the bench "Motion prompt" field
- `recommended_model` + `recommended_aspect` + `seconds`
- one-line `note` (what it looks good on — sarees vs menswear vs kidswear)

Reuse the existing file's UI wholesale: checkbox-select rows, **"Export Selected"**
→ JSON, sticky counter header, Tailwind CDN. Owner browses this file, exports or
copies the `motion_prompt`, pastes it into the bench, picks model + aspect,
generates, compares. The presets that survive testing become the `studio_styles`
VIDEO rows in Phase 2 (2a) — the HTML is the staging ground, the DB is the
shipped set. Same relationship `AI Models and Scenes.html` has to `studio_styles`
IMAGE rows today.

### 1a. API — `apps/api/src/routes/admin/admin-photo-cleanup.ts`

Add a sibling route to the existing `POST /admin/photo-cleanup/studio-shoot`:

```
POST /admin/photo-cleanup/image-to-video
body: {
  product_url: string (R2 url, uploaded via the page's uploadToR2 helper),
  model: 'seedance' | 'wan' | 'kling_std' | 'kling_pro' | 'luma',
  motion_prompt: string (free text on the bench; a curated style on the retailer side),
  aspect: '9:16' | '16:9' | '1:1' | '4:5',
  seconds: 5 | 6 | 8,
}
→ { data: { result_url: string } }   // public R2 url of the finished mp4
```

- **Synchronous** (like `/photo-cleanup/studio-shoot`) — no BullMQ, no quota, no
  `ProductVideo` row. Admin-only (`adminAuthPreHandler` already on the plugin).
- Calls the new `generateImageToVideo(productUrl, { model, motionPrompt, aspect,
  seconds })` in `apps/api/src/lib/fal-video.ts` (new file — the `fal-client.ts`
  video variant + an ffmpeg trim/crop step lifted from
  `jobs/generate-ken-burns-video.ts`).
- SSRF-safe download of the Fal result (reuse `downloadBuffer` / the studio
  `downloadCompressAndUpload` pattern), ffmpeg crop to `aspect` + trim to
  `seconds`, `uploadBuffer(R2_PATHS.photoCleanupTest('promo-<uuid>.mp4'), buf,
  'video/mp4')`, return the url.

### 1b. Web — `apps/web/src/app/admin/photo-cleanup-test/page.tsx`

New card **"AI Promo Video"** directly below the "AI Studio Shoot" card. Copy the
`runStudioShoot` handler shape:

- Reuses the page's existing **"Product photo"** dropzone + `uploadToR2()`.
- Controls: `<select>` model (5 options), `<select>` aspect, `<select>` seconds,
  `<textarea>` motion prompt (curated-style presets can seed it).
- Motion-prompt presets seeded from `docs/tasks/AI Motion Styles.html` (paste or
  the file's "Export Selected" JSON).
- "Generate promo video" button → POST → push a result row.
- Result row: input thumbnail → `<video controls loop>` of `result_url`, model +
  aspect + duration + timestamp label. Click-to-enlarge lightbox already exists —
  extend it to render `<video>` when the url ends `.mp4`.
- Session-only results array, newest first (same as `studioResults`).

**Done when:** owner can pick photo + model + style + aspect, generate, and
compare clips across all 5 models on the page.

---

## Phase 2 — Retailer integration

### 2a. Motion styles — reuse `studio_styles`

Add a `kind` column (`IMAGE` | `VIDEO`, default `IMAGE`) to the `studio_styles`
table + `admin-studio-styles.ts` CRUD + `apps/web/src/app/admin/studio-styles/page.tsx`.
VIDEO rows: `prompt` = the motion prompt, `plans` = allowed tiers, `thumbnail_url`
= a sample clip poster, `sort_order`, `label`, `description`. Per-tier **model**
mapping: a small admin table or `plan_limits`-style rows (`AI_VIDEO_MODEL` per
plan) — decided after Phase 1 testing.

### 2b. API — new route file `apps/api/src/routes/products/products-video-ai.ts`

Copy `products-studio.ts` almost verbatim:

```
GET  /products/video-styles                         → PUBLISHED VIDEO styles for this plan
POST /products/:id/videos/ai-generate               → 202 { job_id }   (checkQuota AI_VIDEO)
GET  /products/:id/videos/ai-generate/status?job_id= → processing | ready {video} | failed
GET  /products/:id/videos/ai-generate/quota          → { plan, used, limit, remaining }
```

- `checkQuota(retailerId, 'AI_VIDEO')` gates the enqueue; `incrementUsage` fires
  in the job on success (same split as STUDIO_SHOOT).
- Body: `{ style_slug, aspect }`. Model resolved server-side from the style's tier
  mapping — never client-chosen.

### 2c. Job — `apps/api/src/jobs/generate-promo-video.ts`

Copy `jobs/studio-shoot.ts` structure (re-verify ownership at execution, Redis
job-status writes on both paths, no auto-retry — each run costs credits):

1. Load product + main photo, resolve a fetchable source url (`studioSourceUrl`
   pattern).
2. `generateImageToVideo(photoUrl, { model, motionPrompt: style.prompt, aspect,
   seconds })` with `onProgress` → `setStudioJobStatus`-style Redis updates.
3. Download Fal `video.url` (SSRF-safe) → ffmpeg trim/crop to `aspect` (consts +
   `execFileAsync` + `-filter_complex` from `generate-ken-burns-video.ts`) →
   `uploadBuffer(R2_PATHS.productVideo(retailer, product, '<uuid>.mp4'), buf,
   'video/mp4')`.
4. `prisma.productVideo.create({ ..., source: 'AI_GEN', is_main: !hasVideo })`.
5. Redis status `ready` with `{ video_id, url }` **after** the row exists.
6. `incrementUsage(retailerId, 'AI_VIDEO')` + `record…Usage` for the admin AI
   usage dashboard + bump `studio_styles.usage_count`.

Run on its own BullMQ queue (`QUEUES.AI_VIDEO`) with bounded concurrency, or
reuse `STUDIO_SHOOT` if Fal's active-task cap allows.

### 2d. Quota + credit packs

- Add `AI_VIDEO` to `QuotaResourceType` (schema `enum` ~line 148).
- `plan_limits` rows: Starter 3/mo, Growth 12/mo, Pro 40/mo (admin-tunable at
  `/admin/plan-limits` — the page already renders every `QuotaResourceType`).
- Credit packs: **no new code** — `POST /billing/addon-checkout` +
  `quotaAddonPurchase` (`apps/api/src/routes/billing/billing-addons.ts`) already
  handle "buy N of resource X". Add the pack SKUs (₹599/20, ₹1,299/50, ₹1,999/50
  Pro — see §30.6) to the addon catalog config.

### 2e. Mobile

- **Hook** `apps/mobile/src/hooks/useProductAiStudio.ts` already carries the video
  query + `generateVideo` (Ken Burns) + progress/poll infra. Add an
  `aiPromoVideo` flow mirroring `handleStartStudioShoot` +
  the `pollWithBackoff` studio poll (statuses `processing|ready|failed`,
  quota/upgrade handling identical).
- **Picker modal** — new `ProductPromoVideoModal.tsx` copied from
  `src/components/product-detail/ProductStudioModal.tsx`: list `video-styles`
  (plan-filtered), aspect chips, quota line, progress view, result `<video>` +
  "Save to gallery" (`expo-media-library`, already wired in the hook) + "Post to
  Facebook / Instagram".
- **Entry points:** button on `apps/mobile/app/product/[id].tsx` (near the
  existing "AI Studio Shoot" / "Product Video" actions) and on
  `apps/mobile/app/growth/videos.tsx` ("Reels & Video Showcase") — shown when the
  product has ≥1 photo and is under the 3-video cap.

### 2f. Social post (Phase 1 scope = FB + IG)

- **Facebook:** `publishVideoPost(pageId, token, videoUrl, caption)` in
  `apps/api/src/lib/meta-graph.ts` already exists and is already used by
  `retailers-social-posts.ts` for `is_main` product videos — an `AI_GEN` video is
  just another `ProductVideo`, so this path works with no change.
- **Instagram:** the new bit — IG needs a `media` container
  (`media_type=REELS`, `video_url=`) → poll container status → `media_publish`.
  Add `publishInstagramReel()` to `meta-graph.ts` and branch in
  `retailers-social-posts.ts` when the connected account is IG.
- **YouTube = Phase 3**, not in this build. Retailer downloads the 16:9 file and
  uploads it themselves.

---

## Migration

One migration dir, e.g. `090_ai_video`:

```sql
-- enum ADD VALUE cannot run in the same tx as its use — keep this migration
-- to schema only; the plan_limits INSERT can be a second migration or a seed.
ALTER TYPE "ProductVideoSource"  ADD VALUE IF NOT EXISTS 'AI_GEN';
ALTER TYPE "QuotaResourceType"   ADD VALUE IF NOT EXISTS 'AI_VIDEO';

ALTER TABLE "studio_styles" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'IMAGE';
```

Then a follow-up migration (or admin UI) seeds `plan_limits` rows for `AI_VIDEO`
and the per-tier model mapping. **Migrations are applied from the admin dashboard
with owner approval — never from the agent** (CLAUDE.md operational policy).

Prisma schema edits: `ProductVideoSource` enum (+`AI_GEN`), `QuotaResourceType`
(+`AI_VIDEO`), `StudioStyle.kind`.

---

## Reuse map (verified 2026-09-03)

| Need | Reuse | File |
|---|---|---|
| Fal submit + poll | `runFalTask()` (+ `video.url` result variant) | `apps/api/src/lib/fal-client.ts` |
| Admin sync test route | `POST /admin/photo-cleanup/studio-shoot` shape | `apps/api/src/routes/admin/admin-photo-cleanup.ts` |
| Admin test page card | "AI Studio Shoot" card + `uploadToR2` + lightbox | `apps/web/src/app/admin/photo-cleanup-test/page.tsx` |
| Motion-style catalog HTML | clone `AI Models and Scenes.html` (rows + "Export Selected" JSON) | `docs/tasks/AI Models and Scenes.html` → new `docs/tasks/AI Motion Styles.html` |
| Curated styles CRUD | `studio_styles` + admin manager (+`kind` col) | `apps/api/src/routes/admin/admin-studio-styles.ts`, `apps/web/src/app/admin/studio-styles/page.tsx` |
| Retailer async route | `products-studio.ts` (202 + status + quota) | `apps/api/src/routes/products/products-studio.ts` |
| Job structure + Redis status | `jobs/studio-shoot.ts` | `apps/api/src/jobs/studio-shoot.ts` |
| ffmpeg trim / crop / encode | `-filter_complex`, `execFileAsync`, canvas consts | `apps/api/src/jobs/generate-ken-burns-video.ts` |
| Video row + R2 path | `ProductVideo` + `R2_PATHS.productVideo()` + `uploadBuffer(..,'video/mp4')` | `packages/db/prisma/schema.prisma:1612`, `generate-ken-burns-video.ts` |
| Quota check / increment | `checkQuota` / `incrementUsage` / `getQuotaStatus` | `apps/api/src/lib/quota.ts` |
| Credit packs | `/billing/addon-checkout` + `quotaAddonPurchase` | `apps/api/src/routes/billing/billing-addons.ts` |
| Plan-limit admin UI | renders every `QuotaResourceType` automatically | `/admin/plan-limits` |
| Mobile poll + video state | `useProductAiStudio` (`generateVideo`, `pollWithBackoff`) | `apps/mobile/src/hooks/useProductAiStudio.ts` |
| Mobile picker modal | `ProductStudioModal.tsx` | `apps/mobile/src/components/product-detail/ProductStudioModal.tsx` |
| FB video post | `publishVideoPost()` (already used for `is_main` videos) | `apps/api/src/lib/meta-graph.ts`, `retailers-social-posts.ts` |

---

## Skills / tools used for development

| Skill | Where it applies |
|---|---|
| `superpowers:brainstorming` → `superpowers:writing-plans` | before any code — lock aspect list, per-tier model map, pack SKUs |
| `ponytail:ponytail` (full) | the whole build — this feature is ~90% copied infra; no new abstractions, no new deps (Fal key + ffmpeg already in the image) |
| `ecc:fal-ai-media` | image→video endpoint shapes, queue/poll semantics, `video.url` result field, per-model params (duration, cfg, aspect) |
| `ecc:social-publisher` | IG Reels container → `media_publish` flow, FB `/videos` edge, caption limits |
| `ecc:database-migrations` + `supabase:supabase-postgres-best-practices` | `ALTER TYPE … ADD VALUE` outside a tx, `studio_styles.kind`, `plan_limits` seed |
| `superpowers:test-driven-development` | job + route tests — mirror `growth-videos.test.ts` and `admin-studio-styles.test.ts` (mock `addAiVideoJob`, assert 202 + quota gate + ownership) |
| `ecc:react-review` / `code-review` | admin page card + mobile modal before merge |
| `superpowers:verification-before-completion` | `npx tsc` clean, `npx vitest run` green, one real bench clip per model, one retailer end-to-end (generate → save → FB post) |
| `agent-skills:frontend-ui-engineering` | the admin "AI Promo Video" card + mobile `ProductPromoVideoModal` (match existing studio-shoot visual language) |

---

## Build order — TRACKING (updated 2026-09-03)

- ✅ **1. `fal-video.ts`** — `generateImageToVideo()` + `VIDEO_MODELS` (5 models,
  ₹/clip bands) + `cropTrimToAspect()`; self-check `fal-video.test.ts` (3/3, real
  ffmpeg). Commit `17fe997`.
- ✅ **2. `POST /admin/photo-cleanup/image-to-video`** (sync, admin-only) — zod body →
  Fal → ffmpeg crop/trim → R2 `promo-<uuid>.mp4` → `result_url`. Commit `17fe997`.
- ✅ **3. `docs/tasks/AI Motion Styles.html`** — 16 motion presets / 4 categories,
  Export Selected → `selected_ai_motion_styles.json`. Commit `17fe997`.
- ✅ **4. Admin "AI Promo Video" card** on `/admin/photo-cleanup-test`. Commit
  `f57479c`. **→ OWNER BENCH TEST PENDING (gate for everything below).**
- ✅ **6.1 (admin part). Admin addon-pack surface** — migration `089_resource_packs`
  + `admin-resource-packs.ts` CRUD + `/admin/resource-packs` screen (DB-driven, no
  hardcoded values; 089 APPLIED by owner 2026-09-03). Commit `47748a4`.
- 🔴 **5. `studio_styles.kind` (migration 090)** + admin manager VIDEO support +
  per-tier model map (091) — DEFERRED until bench sign-off.
- 🔴 **6. (rest)** `AI_VIDEO` quota seeds (091) + retailer-side billing switch from
  `ADDON_PRICING` const to `resource_packs` — DEFERRED.
- 🔴 **7. `products-video-ai.ts` routes + `jobs/generate-promo-video.ts` + queue** —
  DEFERRED (retailer surface).
- 🔴 **8. Mobile: hook + `ProductPromoVideoModal` + entry points** — DEFERRED
  (retailer surface; no mobile code for F-034 exists yet).
- 🔴 **9. `publishInstagramReel()` + IG branch** — DEFERRED.
- 📋 **10. Docs** — CLAUDE.md row + BUILD-LOG + PRO-REQUIREMENTS §30 + PLAN.md +
  PROGRESS updated 2026-09-03. Phase 2 execution checklist:
  `docs/tasks/image-to-video-phase2.md`.

> **Phase 2 (items 5–9) is 🔴 HARD-DEFERRED — ADMIN-TEST-ONLY (owner decision
> 2026-09-03).** Do NOT implement the retailer mobile screen until the owner has
> tested the bench properly and says go.

---

## Explicitly NOT doing (from §30.7)

- ❌ Per-clip Razorpay checkout — credit packs only.
- ❌ Free-text motion prompts for retailers — curated styles only (free text stays
  on the admin bench).
- ❌ Self-hosted video GPU — Fal API only until volume proves a box cheaper.
- ❌ In-app YouTube upload in Phase 1 — retailer uploads the file manually.
- ❌ Clips longer than ~8s — cost scales with length; these models warp
  fabric/faces the longer they run.
- ❌ Treating the clip as a catalog-accurate asset — it's a promo mood clip. The
  original photo stays the product's primary media.
