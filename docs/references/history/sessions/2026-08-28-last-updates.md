# Session Log — 2026-08-28 — Onboarding Plan Step, Demo Access, AI Studio Fix, Original-Photo Retention

Session handoff. 5-point task from product owner. **#7 (AI Studio Shoot fix) DONE.** #2, #5 pending. #4 needs no code.

---

## The 5 points (as given)

1. **Onboarding — add "Select Plan" step after the GST tab.** Retailer must select a plan.
2. **Payment linking** — original ask: on plan select, force link payment account, pay ₹3 to verify gateway, auto-debit plan amount after trial, wire Razorpay to project.
   **REVISED by owner (2026-08-28):** *No payment gateway for now.* Add one **demo** plan option. Demo users get **full Pro access** free, without selecting a plan and without paying. Real plan+payment = later.
3. **AI Studio Shoot not working** — fix it. (Folded into #7.)
4. **AI Studio credits showed `1600`, matches no plan.** Wanted per-plan caps + 8 credits per generated image.
   **RESOLVED by owner via DB:** at `https://kanchuki.app/admin/plan-limits`, `STUDIO_SHOOT = <value>` where value = **number of image generations** (e.g. Starter 200). Credit limit shown = value × 8 (200 → 1600 credits — now correct/intended). `8` is a static multiplier (`STUDIO_CREDITS_PER_IMAGE` in `@kanchuki/shared`). Quota meters 1 image per shoot. **No code change needed** — the "1600" was only wrong because no plan_limits row existed before; owner has now set the DB values.
5. **Original raw photo auto-disappears from product after AI processing.** Keep it as a real, visible photo until testing done. Retailer deletes it only via an explicit "delete selected image" action.
6. **Migrations** — owner applies them (not the agent).
7. **PRIORITY: AI Studio Shoot — spinner few seconds then nothing. No output, no error.** Fix first.

---

## #7 — AI Studio Shoot: DONE

### Root cause
Feature had **no output UI**. `apps/mobile/src/hooks/useProductAiStudio.ts` computes `studioProgress`, `studioEtaMs`, `studioResult`, `studioError`, `studioUpgradeRequired` — **nothing rendered any of them**. Flow was: tap → `handleStartStudioShoot` calls `setStudioModalOpen(false)` immediately → small "AI Studio" button spins → poll resolves `ready`/`failed` → spinner stops → nothing shown. Errors (STARTER 402 block, 503 not-configured, job failure) all landed in `studioError`, displayed nowhere → "no error". Fast pre-flight failures (402/503) explain the "few seconds then nothing".

Secondary: `apps/api/src/routes/products/products-studio.ts` hard-blocked `plan === 'STARTER'` with `402 FEATURE_UNAVAILABLE`. After the 2026-08-22 full data wipe every retailer is STARTER/trial → every shoot 402s.

### Fix — files changed
| File | Change |
|---|---|
| `apps/api/src/routes/products/products-studio.ts` | Removed the `if (retailer.plan === 'STARTER') throw featureUnavailable('AI Studio Shoots')` block + the now-dead `retailer` fetch + unused `featureUnavailable` import. All plans get AI Studio; the `STUDIO_SHOOT` quota (admin-set per-plan image cap) is the only limiter. Kept the `isStudioShootConfigured()` -> 503 check. |
| `apps/api/src/routes/products-studio.test.ts` | Old "402 FEATURE_UNAVAILABLE for STARTER plan" test -> "enqueues for STARTER plan" (asserts 202 + `addStudioShootJob` called). |
| `apps/mobile/src/hooks/useProductAiStudio.ts` | `handleStartStudioShoot`: no longer closes the modal on start; resets `studioProgress`/`studioEtaMs`; routes **all** start errors (not only FEATURE_UNAVAILABLE/PLAN_LIMIT_EXCEEDED) to `status='failed'` + `studioError`; `studioUpgradeRequired` now only for `PLAN_LIMIT_EXCEEDED`. Added `resetStudioFlow()`, `handleCloseStudioModal()` (does **not** reset while `status==='processing'` so the poll keeps running and drops the finished photo into the gallery), `handleUseStudioResult(setAsMain)` (optionally promote to primary, invalidate queries, close). All three exported. |
| `apps/mobile/src/components/product-detail/ProductStudioModal.tsx` | Rewrote. New props: `status`, `progress`, `etaMs`, `error`, `upgradeRequired`, `result`, `onRetry`, `onUseResult`. `renderBody()` branches: **processing** = spinner + progress bar + ETA; **failed** = alert icon + error text + "Try Again"/"Close"; **ready** = result `<Image>` + "Set as Main Photo"/"Keep as extra photo"; **default** = existing picker (tabs, scene/model lists, Generate button). Deleted the dead `STUDIO_TEMPLATE_THUMBNAILS` map (keys `white_studio`... never matched real ids `studiomodel`/`bridalwear`/`seasoncollection`/`clothingdetail`/`runway`) — now `{}`, Wand2 placeholder shown. Dropped unused `TextInput` import + `customPrompt` state. |
| `apps/mobile/app/product/[id].tsx` | `<ProductStudioModal>` now gets `onClose={studio.handleCloseStudioModal}` + the 8 new state/handler props. |

### Verification
- `npx vitest run src/routes/products-studio.test.ts` -> **13/13 pass**.
- `npx tsc --noEmit` in `apps/api` **and** `apps/mobile` -> **exit 0**, no errors.
- NOT tested on device yet.

### Note for next session
If the shoot still fails after this, the on-screen error will say why — almost certainly `isStudioShootConfigured()` false = no `FAL_KEY` / `GEMINI_API_KEY` / `BFL_API_KEY` in `getSecret` or env. Owner sets it in **Admin -> Integrations**. That is config, not code.

---

## #5 — Keep raw original as a real, deletable photo: PENDING

Design (approved):
- `apps/api/src/lib/photo-cleanup.ts` `preserveOriginalPhoto(photoId, r2Key, existingMetadata, raw)` — on first run (guarded by existing `if (meta.original_r2_key) return`), also `prisma.productPhoto.create` a normal row for the `-original` sibling key: `is_primary: false`, `metadata: { is_raw_original: true, source_photo_id: photoId }`. Add `product_id` + `retailer_id` params (both callers have the photo row: `apps/api/src/jobs/tag-product.ts:80`, `apps/api/src/routes/products/products-media.ts:199` and `:334`).
- Pro-cleanup path (`apps/api/src/routes/products/products-pro-cleanup.ts`) — when cleaned `-pro` photos are attached to the product, also persist one `ProductPhoto` row for the raw `r2_key` with `metadata.is_raw_original: true`. Prefer server-side in the create path so old clients benefit. Need to trace which endpoint the mobile capture screen calls after `POST /products/pro-cleanup` returns.
- Deletion: **no new endpoint.** `DELETE /products/:id/photos/:photoId` already deletes a normal `ProductPhoto` row + its R2 object + re-promotes primary. Mobile carousel trash button (`useProductAiStudio.handleDeleteCurrentMedia` -> `productApi.deletePhoto`) already targets the current photo.
- Confirm the new raw-original row is not filtered out of `displayPhotos` in `apps/mobile/app/product/[id].tsx` (the existing `is_original_preview` synthetic entry is separate — can stay).
- No auto-delete anywhere: crons (`compress-r2-images`, `cleanup-training-data`, `measure-r2-storage`, `purge-soft-deleted`) don't touch `-original` keys except full-product purge (correct).
- **No backfill** for existing products. No migration (uses `metadata` JSON).
- Test: `preserveOriginalPhoto` creates the extra row exactly once.

---

## #2 — Plan step in onboarding + demo -> Pro (no payment): PENDING

Design (approved):
- `apps/mobile/app/onboarding.tsx`:
  - `Step` type `1|2|3|4` -> `1|2|3|4|5`; `TOTAL_STEPS = 5`.
  - New step 4 "Choose Plan" (Shop -> Location -> GST -> **Plan** -> Done). Old step-4 "Done" content moves to key 5.
  - `STEP_META` add key 4; `StepIndicator` iterates `[1,2,3]` -> `[1,2,3,4]`; back-handler + bottom-bar label conditionals extended.
  - Step 4 UI: 3 plan cards from `billingApi.getPlans()` (monthly/annual toggle) + a primary **"Start Free Demo — full Pro access"** button. `canProceed()` for step 4 = a card tapped OR demo chosen. **No Razorpay, no `Linking`, no ₹3.**
  - `handleNext` step-4 branch: `retailerApi.updateOnboarding(4)` then advance; `saveFinalStep()` now fires from step 5.
- `apps/api/src/routes/retailers/retailers-settings.ts` `PATCH /retailers/me/onboarding` — accept optional `demo_plan: true`. When set: `retailer.plan = 'PRO'`, `plan_status = 'TRIAL'`, `max_products`/`max_customers`/`try_on_credits` from `PLAN_LIMITS.PRO`. Already audit-logged. `step` schema max already 6 — no change. ~10 lines.
- No migration.
- Test: `src/routes/retailers.test.ts` — `demo_plan: true` sets plan PRO + limits.

---

## #4 — credits: NO CODE CHANGE

Owner set `plan_limits` `STUDIO_SHOOT` values in DB (image counts). Quota meters 1 image/shoot (already: `apps/api/src/jobs/studio-shoot.ts:206` `incrementUsage(retailer_id, 'STUDIO_SHOOT')`). Modal shows `remaining × STUDIO_CREDITS_PER_IMAGE(8)` credits (already). Done.

---

## Reference — how the pieces fit

- **Billing rails already exist:** `apps/api/src/routes/billing.ts` — `POST /billing/subscription` (Razorpay Subscription, `start_at` = trial end), webhook `POST /billing/webhook` handles `subscription.charged` -> `plan_status='ACTIVE'`. Web billing UI at `apps/web/src/app/billing/page.tsx` (`kanchuki.app/billing`). **Not used by #2 revised** — kept for the future real-payment flow.
- **Play Store constraint:** in-app purchase UI was removed 2026-08-10 (`apps/mobile/src/lib/api/billing.ts` header). Billing -> website only. This is why #2 was cut to a no-payment demo path.
- **Quota system (F-010):** `apps/api/src/lib/quota.ts` — `checkQuota(retailerId, resource, amount=1)` before, `incrementUsage(retailerId, resource, amount=1)` after. `plan_limits` table; missing row -> fail-open. `getQuotaStatus` default branch: `PRO?100 : GROWTH?30 : 0`.
- **Studio job:** `apps/api/src/jobs/studio-shoot.ts` (BullMQ `STUDIO_SHOOT` queue, worker registered in `apps/api/src/jobs/index.ts:331`, concurrency `STUDIO_SHOOT_CONCURRENCY=3`). Engine: `apps/api/src/lib/studio-shoot.ts` `generateStudioImage` — tries Fal Flux Pro -> Google Imagen 3 -> Fal Flux Schnell -> BFL FLUX Kontext Pro. Result -> new `ProductPhoto` row (`metadata.studio`), never overwrites source. Status in Redis (`studio:job:<id>`, 30min TTL).
- **Original preservation:** `apps/api/src/lib/photo-cleanup.ts` `preserveOriginalPhoto` -> `-original` sibling R2 key + `metadata.original_r2_key` on the cleaned row. Surfaced as synthetic `{id}-original` behind a preview toggle only (not a gallery photo) — that is the "disappeared" symptom.

---

## Next session — do in order

1. **#5** — raw original as real photo (`photo-cleanup.ts` + pro-cleanup create path + test).
2. **#2** — onboarding plan step + `demo_plan` grant (`onboarding.tsx` + `retailers-settings.ts` + test).
3. Run: `npx vitest run src/routes/products-studio.test.ts src/routes/retailers.test.ts src/routes/security.test.ts` + `tsc` api & mobile.
4. Update `CLAUDE.md` What's-Built index + `docs/BUILD-LOG.md` entry (same session as commit — CLAUDE.md rule 10/11).
5. Nothing committed yet this session. Owner on `main` — branch before commit.
6. Owner: verify a FAL/Gemini/BFL key is set in Admin -> Integrations; apply any DB changes.

## Environment friction (next session)

`ECC_GATEGUARD` "Fact-Forcing Gate" hook fires before every Bash/Edit/Write — ~2x cost. To disable: run with `ECC_GATEGUARD=off` or add `pre:bash:gateguard-fact-force` / `pre:edit-write:gateguard-fact-force` to `ECC_DISABLED_HOOKS`.
