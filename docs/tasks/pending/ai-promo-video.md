# F-034 Phase 2 — AI Promo Video + Instagram Reels publishing — PENDING
> Drafted 2026-11-17. **Not approved to build until the owner says "go" per task** (CLAUDE.md Operational Control Policy: diffs are proposed, owner approves, owner applies migrations).
> Extends `ai-photo-generation.md` §7 (F-034 Phase 1, admin bench only). §7 stays the history; **this file is the buildable Phase 2 plan.** Where they disagree, this file wins (§7.2 endpoints and §7.4 task list are stale — see §3).
> Owner-only Meta App Review steps live in `docs/runbooks/meta-app-review-instagram.md`. Nothing in this file requires App Review to *start*, but real retailers cannot publish to Instagram until it passes (§9).

## 1. Goal

A retailer opens a product, taps **Make promo video**, picks a curated motion style, and ~1–3 minutes later gets a 5–8 s clip of that product. The clip lives on the product (`product_videos`) and is picked in the existing social Composer like any other media. **Instagram Reels publishing is part of this work** — today an Instagram target silently posts the photo instead of a video (`retailers-social-fanout.ts:457-471`).

It is a **promo mood clip**, not a catalog-accurate asset. The original photo stays the primary media. Do not market it as "exact garment".

## 2. Where it fits in the app (confirmed in code 2026-11-17)

| Piece | Today | Change |
|---|---|---|
| Product detail `apps/mobile/app/product/[id].tsx` | Has `ProductStudioModal` (AI Studio Shoot) and a Ken Burns "Product Video" action via `useProductAiStudio` | Add **Make promo video** beside them (T7b) |
| Storage | `product_videos` (`source`: `UPLOAD`, `KEN_BURNS`), cap 3/product, `is_main` | New `source = AI_GEN` |
| Composer `apps/mobile/app/social/create.tsx` | Already loads `photos[]` + `videos[]`, defaults to main video for a single product, accepts `video_id` deep link | **No change** for picking. Optional "Post to social" shortcut from the result (T7b) |
| Facebook publish | `publishVideoPost()` works | Add AI disclosure only if Meta has an equivalent (§9, unverified) |
| Instagram publish | `publishInstagramCarousel()` + photo helper; video falls back to photo | New `publishInstagramReel()` (T1, T2) |
| Customer web `/c/[slug]` | `ProductGallery`, `ProductDetailSheet`, `SharedProductPage` already render videos | Verify AI clips play; small polish only (T7c) |
| Admin web | `/admin/studio-styles`, `/admin/plan-limits`, `/admin/plan-features`, `/admin/ai-usage`, bench card on `/admin/photo-cleanup-test` | Extend, do not add a parallel system (T6) |
| **Google Business Profile** | Reviews only (dark). Auto-posting is F-022, parked | **Out of scope.** Needs F-022 first |
| Scheduler F-043 | Image carousels only | Out of scope |

Flow:

```
product detail ──tap──▶ ProductVideoModal (pick style + aspect)
   │ POST /v1/products/:id/promo-video   → 202 {job_id}   (quota reserved at enqueue)
   ▼
BullMQ studio queue ─▶ job: Fal image→video ─▶ ssrf-safe download (size-capped)
   ─▶ ffmpeg crop/trim to aspect ─▶ R2 (staged key) ─▶ product_videos row (AI_GEN)
   ▼
GET status poll ─▶ ready ─▶ result card: Post to social · Set as main · Keep · Report AI content
   ▼
Composer ─▶ FB: publishVideoPost  ·  IG: publishInstagramReel (is_ai_generated=true)
```

## 3. Re-verified facts (2026-11-17) — supersede §7.2 of `ai-photo-generation.md`

Read from fal.ai model pages and the Meta changelog on 2026-11-17. **Re-verify again at T4 build time**; Fal moves fast.

**Fal endpoints and price (USD, ₹ ≈ $×88, a guide only):**

| Model | Endpoint | Price | 5 s ≈ ₹ | State |
|---|---|---|---|---|
| Seedance lite | `fal-ai/bytedance/seedance/v1/lite/image-to-video` | — | — | **Deprecated**, re-routes to Seedance 1.0 Pro Fast |
| Kling 2.1 std | `fal-ai/kling-video/v2.1/standard/image-to-video` | — | — | **Deprecated** |
| Wan 2.2 A14B | `fal-ai/wan/v2.2-a14b/image-to-video` | $0.04/0.06/0.08 per s at 480/580/720p | 18/26/35 | Live, **removal 2027-01-04** |
| Kling 2.5 Turbo Pro | `fal-ai/kling-video/v2.5-turbo/pro/image-to-video` | $0.07 per s | 31 | Live (pricing page) |
| Kling 2.6 Pro | `fal-ai/kling-video/v2.6/pro/image-to-video` | $0.07 per s | 31 | Live (pricing page) |
| Kling v3 std/pro, O3 | `fal-ai/kling-video/v3/{standard,pro}/image-to-video`, `.../o3/...` | $0.14 per s | 62 | Live (pricing page) |
| Seedance 1.0 Pro Fast | `fal-ai/bytedance/seedance/v1/pro/fast/image-to-video` | $1 / 1M tokens | not computable | Live; tokens per clip unknown, **measure at T4** |
| Seedance 2.0 Fast / Mini | `bytedance/seedance-2.0/{fast,mini}/image-to-video` | $0.0112 / $0.007 per 1k tokens | not computable | Live; **measure at T4** |
| Luma Ray 2 | `fal-ai/luma-dream-machine/ray-2/image-to-video` | ~$0.50 / 5 s at 540p | 44 | Page exists, liveness unconfirmed |

Unchecked: Kling 1.6 and Kling v2 master (assume dead — the existing `fal-video.ts` `VIDEO_MODELS` table uses both), durations and 9:16 support per model, Wan 2.5/3.0, Seedance 1.5/2.5, and the "H3 Max" model Fal suggests as Wan's replacement. Fal documents `https://fal.ai/models/<endpoint-id>/llms.txt` as the live price source.

**Instagram / Meta:**

- Reel = container with `media_type=REELS` + public HTTPS `video_url`, poll `status_code` until `FINISHED`, then publish. Same publish quota as feed posts (`/{ig-user-id}/content_publishing_limit`).
- **`is_ai_generated=true`** on the container applies Meta's "AI info" label (Meta Instagram Platform changelog, 2026-06-22). Works with both Facebook Login and Instagram Login.
- Meta requires AI labelling of photorealistic generated video. Third-party sources only on the policy details and on any reach effect — treat reach claims as unverified; promise retailers nothing.
- Reel file specs (container, codec, duration, aspect, size) came from a third-party blog (MP4/MOV, H.264, AAC, ≤90 s). **Confirm in Meta's IG User Media reference at T1.** Our clips are 5–8 s, far inside any limit.
- Our app uses **Facebook Login**: `instagram_basic` + `instagram_content_publish` (`apps/mobile/src/lib/facebook-auth.ts:27-35`). Reels is expected to use the same permission (unverified — check the dashboard).
- **Owner reported 2026-11-17:** app is in Development mode; `instagram_basic`, `instagram_content_publish`, `pages_manage_posts` were **rejected** and need resubmission; business verification is done; Instagram image posts work (role accounts only). So everything below can be built and tested, but real retailers cannot use Instagram until App Review passes.

## 4. Decisions

Assumed defaults where the owner has not decided. **Mark each ✔ when the owner confirms.**

| # | Decision | Default | State |
|---|---|---|---|
| D1 | Curated styles only, no free-text prompt for retailers (free text stays on the admin bench) | yes | carried from §7.6 |
| D2 | Clip length 5 s, hard cap 8 s | 5 s | proposed |
| D3 | Aspect chips: 9:16 (default), 4:5, 1:1. No 16:9 | yes | proposed |
| D4 | AI clips share the existing **3 videos per product** cap | yes (simplest, no new cap) | ✔ owner accepted 2026-11-17 ("all do") — revisit if Ken Burns users hit the cap |
| D5 | Source photo = the photo currently shown on product detail (lets a retailer chain Studio Shoot → video) | yes | proposed |
| D6 | Quota = new METERED `AI_VIDEO` resource, plan limits by admin (doc draft: Starter 3 / Growth 12 / Pro 40 per month) | numbers are owner's, no code default | **open** (numbers) |
| D7 | Model per plan tier is admin-managed in a DB table, never in code | yes | carried from §7.4 |
| D8 | Customer storefront shows **no** "AI-generated" chip on the clip. The Instagram label is applied via the API. | no chip | ✔ owner accepted 2026-11-17 ("all do"); Instagram gets the label via the API |
| D9 | Free Ken Burns clip stays; it also publishes as a Reel (T2 works for it first) | yes | proposed |
| D10 | Delivery push when the clip is ready | none in v1; in-app poll while foreground, clip appears in the gallery on return | proposed (F-046 push is not device-tested) |
| D11 | **Kids' products get product-only clips: no person in the video, no child's photo** (owner, 2026-11-17: "kids video … without kid pics something different which is not violate privacy policy"). Implementation: for kids audience/categories only VIDEO styles tagged person-free are offered, and the source photo must not contain a child — enforce by style list, plus a warning in the picker. How to *detect* a child in a photo is **not decided**; until it is, kids products may only use styles flagged `no_person`. | ✔ decision, implementation open | owner decision recorded |

## 5. Data model (T3 — owner applies, never the agent)

Next free migration is **165** (164 is the newest in `packages/db/prisma/migrations`). Old numbers in §7.5 of the earlier doc are void.

- **165_ai_video_schema** (schema-only; `ALTER TYPE … ADD VALUE` cannot share a transaction with its use):
  `ProductVideoSource += AI_GEN`, `QuotaResourceType += AI_VIDEO`, `studio_styles.kind TEXT NOT NULL DEFAULT 'IMAGE'`, plus the columns a VIDEO style needs (`motion_prompt`, `default_aspect`, `duration_sec`), and `product_videos` columns `style_slug`, `model_key`, `ai_generated BOOLEAN`.
- **166_ai_video_seed** (separate transaction): `plan_video_models` (`plan` unique, `model_key`, `updated_at`), a `video_models` table (`model_key`, `endpoint`, `label`, `price_usd_per_second`, `enabled`) that **replaces the hardcoded `VIDEO_MODELS` table in `fal-video.ts`**, starter `studio_styles` VIDEO rows from the bench survivors. **No `plan_limits` rows are seeded** — `AI_VIDEO` is METERED (RC-103), so no row = limit 0 = feature refuses until the owner sets limits in Admin → Plan Limits. That is the safe default.
- **T2b adds to migration 165:** `SocialPostStatus += PROCESSING` (so a Reel still being processed by Instagram has a truthful row). Also `studio_styles.no_person BOOLEAN NOT NULL DEFAULT false` for the kids rule (D11).
- Prisma schema edit ships with the SQL but takes effect only once applied.
- Add **RLS** policies for any new retailer-scoped table (`kanchuki-rls-convention`): `plan_video_models` and `video_models` are platform-level, not retailer-scoped — check `docs/DATABASE.md` for the platform-table convention before writing.
- **Grants:** `kanchuki_app` has DELETE revoked platform-wide (RC-049/RC-162). Admin CRUD on `video_models` must not rely on DELETE: retire with `enabled = false`.
- Update `docs/DATABASE.md` in the same change.
- Verify with the Supabase MCP read-only (`kanchuki-supabase-project`): columns exist, enum values present, **before** any route that reads them ships (RC-160: code deployed before its migration 500s whole-row queries; the boot-time schema check will alert but not save you).

## 6. API (T5)

New file `apps/api/src/routes/products/products-video-ai.ts`, registered beside `products-studio*`.

- `POST /v1/products/:id/promo-video` → body `{ photo_id, style_slug, aspect }` (zod). Order matters:
  1. Delegate guard: `isDelegate()` → 403 first (RC-142). Owner and staff only, same as studio shoot.
  2. Plan feature gate `AI_PROMO_VIDEO` via `hasFeature()` → `featureUnavailable`.
  3. Ownership: product and photo belong to `request.retailerId` and are not deleted. Photo URL comes from our own R2 key, never from the client.
  4. 3-video cap (D4).
  5. `reserveJobQuota` keyed by `job_id` for `AI_VIDEO` — **reserve at enqueue, refund in the job's `finally`** (RC-102 / RC-155 pattern; do **not** use the older "check at route, increment on success" from §7.4). A failed clip must not count. Confirm the exact helper name and signature in `lib/quota.ts` before coding; the name here is from CLAUDE.md's RC-102 row.
  6. Enqueue on the studio queue; 202 `{ job_id }`.
  7. Per-route rate limit (RC-079 shape, e.g. 6/min) — Fal calls cost money.
- `GET /v1/products/:id/promo-video/:jobId` → `{ status: processing|ready|failed, progress?, etaMs?, video_id?, url?, error? }`. Resolve by job id, scoped to the retailer (RC-063: status routes must resolve the same ids POST accepts).
- `GET /v1/products/promo-video/styles?productId=` → plan-filtered VIDEO styles + `meta.quota` + `meta.model_unavailable_reason` (reuse the studio-styles pattern and the kids/unstitched gating if it applies — see §9; a kids clip is a policy question).
- **Job** `apps/api/src/jobs/generate-promo-video.ts`:
  - Fal call through the DB `video_models` row for the retailer's plan; polling window 60–180 s; hard timeout; `fetchWithTimeout` (RC-110/118).
  - **Download the result with `ssrfSafeFetch` + `readCappedBuffer`**, a byte cap (e.g. 50 MB, `MAX_VIDEO_BYTES`) and a content-type sniff — the Fal URL is third-party output, treat it as untrusted (RC-148/149/150).
  - ffmpeg crop/trim to the aspect via `cropTrimToAspect`; if the model returns no audio track, **add a silent AAC track** only if the Reel spec check at T1 says Instagram needs one.
  - Upload to a **staged** key (`stagingKey(...)`), then `verifyUpload` before the row is created; row `source = AI_GEN`, `ai_generated = true`.
  - `finally`: refund the reservation on any failure; write `ai_usage_logs` via the existing meter with the model's real USD cost (admin spend alert, RC-081).
  - On final failure: `reportJobFailure` (RC-113). Never log `job.data` or the photo URL.
- A hung job must not hold quota forever — the hourly `quota-reservation-sweep` already covers `quota_reservations`; confirm `AI_VIDEO` rows are swept.
- `AI_PROMO_VIDEO` and `AI_VIDEO` must be added to **both** the Admin → Plan Features allowlist **and** the grid (the `AI_CUSTOM_TEMPLATE` toggle was unreachable until both were fixed, PR #296/#297).
- Classify every new admin route in one of the three tiers in `packages/shared/src/constants/admin-access.ts` (RC-034 / RC-161). Do not hand-write a fourth list.

## 7. Tasks

Each task: one PR, tests red first (`superpowers:test-driven-development`), `pnpm --filter @kanchuki/api typecheck` + `tsc` (web, mobile) + biome clean + the new tests green. **CI minutes are exhausted (memory 2026-11-14): run tests/tsc/biome locally before every push.** Owner applies migrations and Meta dashboard steps. Mark each `⬜ → ✅` here and add the row to `docs/BUILD-LOG.md` when it lands.

| # | Task | Skills to load | Gate | State |
|---|---|---|---|---|
| **T0** | **Meta App Review resubmission** (owner): rejection text per permission, screencast, reviewer notes — `docs/runbooks/meta-app-review-instagram.md`. Not code. Parallel with everything else. | — | Advanced Access shows approved for `instagram_basic`, `instagram_content_publish`, `pages_manage_posts` | ⬜ owner |
| **T1** | `publishInstagramReel()` in `apps/api/src/lib/meta-graph.ts`: container (`REELS`, `video_url`, `caption`, `is_ai_generated`, `share_to_feed`), poll to `FINISHED` with timeout, publish, permalink fail-open (never fabricate). Confirm Reel specs from Meta's reference first. Unit tests with a fake Graph (success, `ERROR` status, timeout, quota-exceeded error mapping). | `agent-skills:source-driven-development`, `superpowers:test-driven-development`, `ecc:api-design` | tests + `typecheck`; **real publish to a role-account test profile** | ✅ code 2026-11-17, **merged 2026-11-17 (PR #309, merge `4b21b3c8`)**, local tests only (CI minutes exhausted): `publishInstagramReel` + 14 tests (red first), 5 guards falsified, `tsc`/biome clean. **Not proven:** no real Graph call; Reel specs and the `is_ai_generated` label unverified against Meta. Timeout now has its own code `INSTAGRAM_CONTAINER_TIMEOUT` + a retailer-safe message (also applies to photo/carousel timeouts) |
| **T2** | Fanout: an Instagram target with a video item calls `publishInstagramReel` instead of falling back to a photo (`retailers-social-fanout.ts:457-471`); `ai_generated` videos always send `is_ai_generated=true`; recorded media snapshot says what went out; carousel-with-video stays banned. Update the "IG photo helper is photo-only" comment. Tests: single video → Reel call; photo path unchanged; AI flag propagation; no silent substitution. Works for **existing Ken Burns clips** first, so the Reel path is testable and demo-able with no AI generation. | `agent-skills:incremental-implementation`, `ecc:silent-failure-hunter` | tests; manual: Ken Burns clip → test IG profile as a Reel | ✅ **T2a** code 2026-11-17, **merged 2026-11-17 (PR #309, merge `4b21b3c8`)**: an Instagram video item posts as a Reel; **no photo fallback** (a failed Reel is a FAILED row with the curated message); AI source (`AI_GEN`) always sends the label; in-request wait capped at **10 × 3 s = 30 s** (mobile publish times out at 60 s, targets publish sequentially). API suite 246 files / 3296 tests green, 4 route guards falsified. **Behaviour change:** products whose main video is a Ken Burns clip now go to Instagram as a Reel by default (they used to post the primary photo). **Not proven:** no real Instagram Reel published; real processing time unmeasured (30 s may be too short — if Reels often time out, raise it only together with T2b) |
| **T2b** | **Finish a slow Reel in the background.** Needs a `PROCESSING` post status: `SocialPostStatus += PROCESSING` (add to migration 165, owner applies), split `publishInstagramReel` into create-container + finish-and-publish so the container id survives a timeout, a BullMQ job that polls and publishes then flips the row to POSTED/FAILED, and mobile post-history/composer copy for "posting…". Until T2b a Reel that is not ready in 30 s is a FAILED "try again" row; it is never double-posted. Do after T3. | `agent-skills:incremental-implementation`, `ecc:database-migrations`, `superpowers:test-driven-development` | tests + migration applied + role-account test with a deliberately slow clip | ⬜ |
| **T3** | Migrations 165 + 166 + Prisma + `docs/DATABASE.md` (§5). **Owner applies.** Read back with Supabase MCP. | `ecc:database-migrations`, `ecc:database-reviewer`, `ecc:postgres-patterns` | owner confirms applied; read-back shows columns/enums | ✅ **Merged 2026-11-17 (PR #310, merge `6a8fb0e8`)**; 165 + 166 applied in prod by owner, read back 2026-11-17 via Supabase MCP (enums, columns, tables, RLS, grants, 4 seed rows all `enabled=false`, 0 `plan_video_models` rows). Migration-replay guard not run (Docker off). |
| **T4** | Replace the hardcoded `VIDEO_MODELS` in `apps/api/src/lib/fal-video.ts` with DB-backed `video_models` + `plan_video_models`; delete dead endpoints; **re-verify live endpoints and measure Seedance tokens/clip and per-clip cost with the admin bench**; show price source in admin. No ₹ in code. | `agent-skills:source-driven-development`, `ecc:cost-aware-llm-pipeline` | bench run per model on 3 real saree/suit photos; costs recorded here | 🟨 **Code built 2026-11-17** (branch `feat/f-034-t4-video-models`, rebased on main after #309/#310 merged; not pushed): `fal-video.ts` reads `video_models` (bench: any row; `videoModelForPlan()`: plan row + `enabled`), old 5-model table and all ₹ removed; per-family Fal input from each llms.txt (Kling 2.6 `start_image_url` + `generate_audio:false`, Wan `num_frames` @16 fps, Seedance `720p` + 4:5→3:4); `clipCost()` from DB price, Seedance tokens = h·w·fps·s/1024 measured from the raw clip; **migration 167** `price_usd_per_million_tokens` (Seedance 1.00), applied in prod by owner 2026-11-17 and read back via Supabase MCP (Seedance 1.0000, others NULL, all still disabled); bench lists models + price source via `GET /admin/photo-cleanup/video-models` and shows $ + tokens per run. API 252 files / 3429 tests, api + web tsc clean, biome clean on API files. **Open:** owner bench run (4 models × 3 photos) and costs not recorded; no real Fal call made |
| **T5** | Routes + job (§6). Quota reserve/refund, delegate guard, SSRF-safe download, staged upload, rate limit, `reportJobFailure`. Tests mirror `growth-videos.test.ts` / the studio-shoot tests: no quota → no Fal call; refund on every failure path; foreign product/photo 404; delegate 403; cap 3; status route ids. | `superpowers:test-driven-development`, `agent-skills:security-and-hardening`, `ecc:security-reviewer`, `ecc:backend-patterns` | tests; falsify each guard (delete it, see a test fail) | ⬜ |
| **T6** | Admin web: VIDEO styles tab/filter on `/admin/studio-styles`, per-plan model + enable on a card (reuse, not a new system), `AI_VIDEO` row guidance on `/admin/plan-limits`, `AI_PROMO_VIDEO` toggle on `/admin/plan-features`, spend visible on `/admin/ai-usage`. Follows the admin theme (PR #297); no hardcoded colours. | `impeccable` (brief in §8.2), `agent-skills:frontend-ui-engineering`, `web-design-guidelines`, `ecc:react-patterns` | tsc + browser check by owner | ⬜ |
| **T7a** | **Design pass, no code**: the mobile screens in §8.1, reviewed with `impeccable critique` + `hallmark`, **owner approves before T7b**. | `impeccable`, `ui-ux-pro-max`, `hallmark`, `emil-design-eng` | owner approval | ⬜ |
| **T7b** | Mobile build: `ProductVideoModal`, hook methods in `useProductAiStudio` (start/poll/reset), entry button, result card, "Post to social" shortcut, `ReportAiContent feature="AI Promo Video"`, shopper-safe errors via `apiMessage` (RC-117/122). Animation and a11y passes. **Needs an EAS build; device test required.** | `vercel-react-native-skills`, `apple-design`, `improve-animations`, `animation-vocabulary`, `impeccable polish`, `agent-skills:frontend-ui-engineering` | mobile tests + tsc + device test on the new build | ⬜ |
| **T7c** | Customer web: confirm `ProductGallery` / `ProductDetailSheet` / `SharedProductPage` play AI clips (muted, `playsInline`, poster, no autoplay-with-sound). Polish only. Playwright e2e stays green. | `web-perf`, `agent-skills:browser-testing-with-devtools` | e2e green (customer suite) + 360 px screenshot | ⬜ |
| **T8** | Docs sweep: CLAUDE.md index row #60 and BUILD-LOG, `docs/PRO-REQUIREMENTS.md` §30, `docs/PLAN.md`, `docs/tasks/README.md`, `ai-photo-generation.md` §7 pointer, `docs/DATABASE.md`. **CLAUDE.md edits only touch the What's-Built row + RC rows** (policy). One RC entry per shipped bug. | `agent-skills:documentation-and-adrs` | `git log` vs doc status match (CLAUDE.md rule 10) | ⬜ |

Suggested order: **T0 (owner, now) ∥ T1 → T2 → T3 → T4 → T5 → T6 → T7a → T7b → T7c → T8.** T1+T2 deliver value on their own (existing Ken Burns clips become Reels) and give the App Review screencast a real video flow.

Review before merge for each PR: `agent-skills:code-review-and-quality` / `ecc:typescript-reviewer`; T5 also `agent-skills:security-auditor`.

## 8. Design brief

> Produced with `impeccable shape` under the owner's instruction "use default design" (2026-11-17). There is no `PRODUCT.md` in the repo, so the incumbent implementation is the visual authority (`docs/DESIGN.md`, the shared `COLORS` module in `packages/shared/src/colors.ts`, the Black & Gold Elegance repaint, `tailwind.config.*`). This brief extends the existing world; it does not restyle anything. The skill's discovery interview was skipped because the owner pre-answered with "default"; assumptions are the §4 decisions. Run `/impeccable init` later if the owner wants `PRODUCT.md` captured.

### 8.1 Mobile — retailer app (visitor mode: **Operate**)

**Job and audience.** A shopkeeper, often one-handed, with a product open, wants a short clip to post on Instagram/Facebook. Success = clip generated and posted without typing a prompt or understanding models.

**Principle.** Make it feel like AI Studio Shoot: same entry, same modal pattern, same quota language. A retailer who has used Studio Shoot should need no explanation.

**Entry.** A **Make promo video** action next to the existing Studio / Product Video actions on product detail (props wired near `[id].tsx:330`). Disabled with a reason if the product has no photo. Shows the remaining videos for the month (language is **per video**, not credits — one number a shopkeeper understands).

**`ProductVideoModal`** — mirrors `ProductStudioModal` and reuses `AnimatedPressable`, `GradientButton`, `ReportAiContent`, `useSafeAreaInsets` for the bottom inset:

1. **Picker.** Title "Make a promo video". Quota chip top-right (same colour logic as the studio chip: normal / low / limit reached). Aspect chips `9:16 · 4:5 · 1:1` with 9:16 preselected, labelled for the use ("Reels", "Feed", "Square"). A vertical list of motion styles: name, one-line description, `5 s`, no preview video in v1 (a looping thumbnail is an admin-upload follow-up; do not block v1 on it). One style preselected (derived selection, **not** an auto-select effect — RC-017). Big primary button **Generate video**, always above the safe-area inset.
2. **Honest wait state (60–180 s).** The Ken Burns hook fakes a 3 s progress bar; **do not copy that** for a 1–3 minute job. Show an indeterminate state, a plain "Usually 1–3 minutes", and "You can close this — the clip appears in the product gallery when it's ready." Real server progress only if the status route returns it. Reduce Motion: static state, no looping animation. Do not use a determinate percentage that stalls at 95%.
3. **Failed.** Reason from the server through `apiMessage`, **Try again** (not for limit/upgrade), **Close**. Limit reached = "AI Studio limit reached"-style upgrade copy; no retry button.
4. **Ready.** The clip playing muted on loop (reuse the existing video slide component), then actions in this order: **Post to social** (primary — the retailer's real goal), **Set as main video**, **Keep in gallery**, **Report this AI content**. Show a one-line note: "AI-generated promo clip — your original photo stays the main photo." This is the honesty line, not a legal wall.
5. **No quota / plan.** Same empty/upgrade copy pattern as Studio. Never a dead button.

**Craft.** Use the existing tokens (`ink`, `sand`, brand gold via `COLORS`), the radius and button spec already pending in `docs/tasks/pending/button-styles.md` (radius 24, no cut-off labels), Lucide icons with `strokeWidth: 1.5`. Press feedback through `AnimatedPressable`. One focal moment: the clip appearing. Touch targets ≥ 44 pt, accessibility labels and roles on every control, `accessibilityState` on disabled items, Reduce Motion honoured. Devanagari labels run ~30% longer: no fixed-width chips, labels wrap, never truncate the primary action. English first; there is no i18n infra (see `multi-language-i18n.md`).

**Constraints.** v1 has no text input, so no keyboard handling is needed (RC-042/116 guards apply only if one is added). Polling through `pollWithBackoff` with a longer ceiling than studio shoot (≥ 4 min). Offline: the Generate button is disabled with an "Internet needed" reason. Photos only through our R2 URLs.

**Anti-goals.** No prompt text box. No model names shown to the retailer. No auto-posting. No fake progress. No "AI magic" language.

### 8.2 Admin web (visitor mode: **Operate**)

- **Studio styles page:** add a `Kind` filter (Image / Video). A VIDEO row has name, slug, motion prompt (textarea), default aspect, duration, plan visibility, enabled. Reuse the existing table/edit-form pattern on `/admin/studio-styles`. Prompt text is admin-authored; render it as text only (RC-077, no HTML).
- **Models card:** per plan one selected model with its live USD/s and a computed ₹/clip **labelled "estimate"** with the rate used; models flagged "deprecated by Fal" or "removal date" are visible, not hidden. Enable/disable, no delete.
- **Plan limits / features / usage:** reuse the three existing pages; add copy next to the `AI_VIDEO` row: "No row = feature is off (metered)". The owner must see that state, because an empty limit silently disables the feature.
- Style: the admin theme tokens (PR #297); tables, not cards-in-cards; disable actions confirm. Read-only for roles without access per the tier file.
- **Bench stays** (`/admin/photo-cleanup-test` "AI Promo Video" card) — it is how a model/style gets approved before an admin turns it on for a plan.

### 8.3 Customer web (visitor mode: **Experience**)

The clip is one more slide in the existing gallery; **the interface recedes**. Muted, `playsInline`, loop, poster frame from the main photo so layout never jumps, `preload="metadata"`. No sound, no autoplay audio, no new chrome. Must not slow first paint on 3G (CLAUDE.md "load fast on 3G"): the video is lazy, the photo shows first. No "AI" chip on the storefront by default (decision D8 — owner/legal). If D8 flips to "label it", it is a single small caption in the existing caption slot, not a badge on the video.

## 9. Compliance, security, and risk

- **AI disclosure:** `is_ai_generated=true` on every `AI_GEN` Instagram publish, no setting to turn it off. Facebook: look for an equivalent parameter at T1; if none, nothing to send, record that here.
- **Google Play AI-Generated Content policy:** in-app "Report this AI content" on the result (`ReportAiContent`, reports table already exists, migration 148 applied; admin queue `/admin/ai-content-reports`).
- **Kids and sensitive products (D11, decided 2026-11-17):** kids' products may get video only as **person-free, product-only clips** — no child in the video, no child's photo as input. Gate by a `no_person` flag on VIDEO styles (admin-set) and the existing studio-shoot kids/unstitched/bottoms gating. Open: how to detect a child in a *source photo* (a photo with a child on it must not be sent to Fal at all) — needs a decision before T5.
- **Photos are sensitive** (SECURITY.md): the clip may contain a person if the source photo does. I have not read Fal's data-retention terms; confirm them and update the retailer photo-retention notice (launch readiness §7A.6) before launch. **Not verified.**
- **Cost abuse:** METERED quota with no default row, per-route rate limit, per-job USD logged to `ai_usage_logs`, hourly spend alert (RC-081) already counts it once the meter writes.
- **SSRF / upload:** Fal's output URL is untrusted — `ssrfSafeFetch`, byte cap, content sniff, staged key, `verifyUpload`, duration sanity via ffprobe before the row exists.
- **Concurrency:** one retailer double-tapping Generate must not start two jobs for one reservation: a `startingRef` guard in the modal (RC-015/132/135 shape) **and** server-side reservation keyed by job id.
- **Meta rate limits and account state:** map Graph errors (token expired, not a Business/Creator account, publishing limit) to plain-language retailer messages, never raw Graph text.
- **Risks:** Fal deprecates models fast (three of five in the old doc are gone or going) → model table is DB-driven and the bench re-verifies; quality varies on fabric/hands/faces → curated styles and "promo mood clip" framing; Meta App Review may reject again → the Reel path fails with a clear message for non-role accounts instead of posting a photo.

## 10. Test plan

- **API unit/integration** per task above; every guard falsified (delete the guard, one test must fail) — the repo's standard.
- **Contract test** that the status route resolves exactly the ids the POST returns (RC-063).
- **Source-pin** that no file calls Fal/Graph with a bare `fetch` (the RC-118 guard already covers it; keep it green).
- **Meta:** a real Reel publish to a role-account test profile, with the label verified visible on Instagram — record the result here; local fakes alone do not prove it.
- **Mobile:** tests for the modal states + hook, then a **device pass on the new EAS build**: picker → wait → ready → post to Instagram test account; airplane mode; Reduce Motion on; a Devanagari-length label check; low-quota and limit-reached banners.
- **Customer web:** playback e2e on the existing customer suite + a 360 px screenshot.
- **Owner acceptance:** 3 real products × 2 styles, judged by the owner before any plan limit is set above 0.

## 11. Open items (owner)

1. T0 — Meta App Review resubmission (runbook).
2. D4, D6 numbers, D8, kids-gating decision (§4, §9).
3. Apply migrations 165 and 166 (T3).
4. Set `AI_VIDEO` rows in Admin → Plan Limits and the `AI_PROMO_VIDEO` plan feature **only after** the acceptance test.
5. Confirm Fal data-retention terms.
6. EAS build for T7b; device test.
7. Bench sign-off on models × styles (the original F-034 gate, deferred since 2026-09-03).

## 12. Not doing

Free-text prompts for retailers · per-clip Razorpay checkout (limits + addon packs via `resource_packs`, same as other AI features) · clips over ~8 s · self-hosted video GPU · YouTube upload · treating the clip as a catalog-accurate asset · Google Business Profile posting (F-022) · scheduler video posts · a "push when ready" notification in v1.
