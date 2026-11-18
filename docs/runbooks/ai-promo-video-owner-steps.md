# AI Promo Video (F-034 Phase 2) — Owner Steps

Spec: `docs/tasks/pending/ai-promo-video.md` (§7 tasks, §11 owner items). Code merged to `main` 2026-11-17 → 2026-11-18 (PRs #309–#317, #319–#321).

**Status: all code merged, feature OFF.** Migrations 165–168 applied in prod and read back. All 4 `video_models` rows `enabled = false`, no `plan_video_models` rows, no `AI_VIDEO` `plan_limits` rows, no `AI_PROMO_VIDEO` `plan_features` row. Nothing has called Fal or Instagram for real; ₹ per clip unmeasured.

Order matters. `AI_VIDEO` is METERED: with no `plan_limits` row the server refuses everyone (RC-103), so turning the plan feature on early shows a dead button, not free clips. Do the steps top to bottom.

## 1. Bench sign-off (Admin → Photo Cleanup Test → AI Promo Video)

The original F-034 gate, deferred since 2026-09-03. The bench can run any `video_models` row, enabled or not.

- [ ] Run each of the 4 models (Seedance / WAN / Kling std / Kling Pro) on 3–4 real product photos: one suit on a model, one flat-lay, one saree, one kids product.
- [ ] Note per model: does the garment stay true (colour, print, border)? Any warped hands/faces? Time to finish?
- [ ] Note the real USD cost per 5 s clip (Admin → AI Usage shows `cost_usd` per call). Convert to ₹; this sets the plan-limit numbers in step 4.
- [ ] Pick the model per plan (cheapest acceptable for Starter, best for Pro is fine).
- [ ] Confirm Fal data-retention terms for uploaded product photos (spec §11.5). Write the answer in the spec.

## 2. Video styles (Admin → Studio Styles → VIDEO)

- [ ] Create the retailer-facing styles (D1: curated only, no free text). Default aspect 9:16 (D3), 5 s (D2).
- [ ] At least **one style with `no_person` ticked**. Kids, unstitched and bottoms-only products only see `no_person` styles (D11); with none published those products get an empty picker.
- [ ] Set each style PUBLISHED. Read back:
  ```sql
  SELECT name, status, no_person FROM studio_styles WHERE kind = 'VIDEO';
  ```
  Expect ≥1 PUBLISHED row, ≥1 with `no_person = true`.

## 3. Video models per plan (Admin → Studio Styles → Promo video models; Super Admin only)

- [ ] Enable the model(s) chosen in step 1.
- [ ] Assign one model per plan you will launch on.
- [ ] Read back:
  ```sql
  SELECT model_key, enabled FROM video_models;
  SELECT plan, model_key FROM plan_video_models;
  ```

## 4. Decision D6 — clip limits (do not save yet)

- [ ] Decide clips per month per plan. Doc draft: Starter 3 / Growth 12 / Pro 40. Check against the step 1 ₹ per clip and the plan price.
- [ ] Optional: top-up packs in Admin → Resource Packs (type "AI Video (promo clips)"), GST-inclusive price.
- Save the limits in step 6, after the acceptance test.

## 5. Acceptance test on one plan

- [ ] EAS build of `apps/mobile` (T7b: "AI Video" pill + `ProductVideoModal` exist only in a new build).
- [ ] Use a test retailer on one plan. For that plan only:
  - Admin → Plan Limits: `AI_VIDEO` = a small number (e.g. 2).
  - Admin → Plan Features: "AI Promo Videos" ON.
- [ ] On the device: product detail → AI Video → pick style → wait screen shows elapsed time → clip appears in the product gallery.
- [ ] Tap AI Video again on the same product while one is running: expect "A video is already being made for this product. Try again when it is ready." (RC-176).
- [ ] A kids product shows only `no_person` styles.
- [ ] 4th video on one product refused (3-video cap, D4).
- [ ] Limit reached → refused with the quota message; Admin → AI Usage shows the spend in USD.
- [ ] Customer web on a phone: the clip plays muted after the photos, poster = main photo (T7c).
- [ ] Post to social → Facebook works. Instagram Reel needs step 7.
- [ ] Watch Sentry for `generate-promo-video` failures during the test.

## 6. Launch

- [ ] Plan Limits: `AI_VIDEO` per plan = step 4 numbers.
- [ ] Plan Features: "AI Promo Videos" ON per plan.
- [ ] Read back:
  ```sql
  SELECT plan, limit_per_period, period FROM plan_limits WHERE resource_type = 'AI_VIDEO';
  SELECT plan, enabled FROM plan_features WHERE feature_key = 'AI_PROMO_VIDEO';
  ```
- [ ] Every plan with the feature ON must also have a `plan_video_models` row and an `AI_VIDEO` limit, or its retailers see no pill / a refusal.

## 7. Instagram Reels (T0)

- [ ] Meta App Review resubmission per `docs/runbooks/meta-app-review-instagram.md`. Until approved, Instagram Reel posts fail; making the clip and Facebook posting are unaffected.
- [ ] After approval: post one AI clip as a Reel and check the "AI info" label shows on Instagram (D8).

## Open decisions (spec §4)

- **D6** limit numbers (step 4).
- **D11** how to detect a child in a photo: not decided. Until it is, kids products are limited to `no_person` styles; enough to launch.
- **D2, D3, D5, D9, D10** are "proposed"; the built defaults match them. Confirm to mark ✔.

## Known limits

- An API crash while a clip is claimed blocks another AI clip on that product until the Redis claim expires.
- Promo jobs queued on the old studio queue before PR #321 deployed are orphaned (feature was off, none expected).
- The status-change flow is only tested with fake Redis.
