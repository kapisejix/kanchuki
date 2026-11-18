# Launch Readiness — Open Items — PENDING

> Collected 2026-09-23 from `LAUNCH-READINESS-AUDIT.md`, `PLAY-STORE-LAUNCH-CHECKLIST.md`, the 2026-09-03 launch checklist and CLAUDE.md. Items already resolved there (B-003/005/007/008/009, S-009, DLT registration, `set-gst-profile.ps1`) are left out. B-004 admin TOTP was descoped by the owner.
>
> **2026-10-25:** the open items of `../done/post-referral-cleanup-and-launch.md` (§1.3, §2, §5, §7B) were folded in here; that board is closed. Its 7B.1–7B.8 were already listed below, so only the rest is new (last section).
>
> **Re-verified against the code 2026-09-29** — items marked [x] below were found built or confirmed; the rest are still open.
>
> **2026-11-18:** prod read back (read-only SQL, below) and items built since 2026-10-25 added (last two sections). Railway env vars, Play Console and Razorpay dashboards were **not** read by the agent; those items stay as the owner last reported them.

## Verdict (2026-11-18)

Pilot: running on Railway with real retailers (20 rows). Public launch: **not ready** — blocked on legal review, Play listing, credential rotation, Sentry DSN, one full device pass on a release build, and an RC re-test (RC-041…RC-176 have unit tests only, no end-to-end pass).

## Prod read-back (2026-11-18, read-only SQL via Supabase MCP)

| Check | Result | Meaning |
|---|---|---|
| `plan_limits` STUDIO_SHOOT | STARTER 200 / GROWTH 400 / PRO 1000 | RC-103 seed done |
| `plan_limits` TRY_ON_GENERATION | 20 / 50 / 100 | seeded |
| `plan_limits` BG_REMOVAL, IMAGE_CROP | **PRO 9999 only** | METERED with no row = refused, so STARTER/GROWTH get no Pro cleanup. Owner: confirm that is intended (Pro-only feature) |
| `plan_limits` AI_CUSTOM_TEMPLATE | 100 / 200 / 300 | set |
| `plan_limits` GBP_REVIEW_REPLY | 20 / 100 / 500 | set |
| `plan_limits` AI_VIDEO | **none** | promo video refused for everyone (intended until the runbook) |
| `plan_features` VIRTUAL_TRY_ON_V2 | **ON for all 3 plans** | owner confirmed 2026-11-18: try-on is meant to be live (docs fixed). GPU keys set, 0 jobs ever run; next = runbook Parts 1–2 + first real try-on |
| `plan_features` GOOGLE_BUSINESS_PROFILE | **ON for all 3 plans** | docs say no row = OFF. Still dark in practice until Admin → GBP "API approved" and Google API access (row 109) |
| `plan_features` AI_CUSTOM_TEMPLATE | ON for all 3 plans | docs said "treated as OFF"; it is ON. No real FLUX run recorded |
| `plan_features` AI_PROMO_VIDEO | no row (OFF) | intended |
| `video_models` | 4 rows, 0 enabled | intended |
| `plan_video_models` | 0 rows | intended |
| `studio_styles` kind=VIDEO | **0 rows** | runbook step 2 must create them |
| `resource_packs` | 0 rows | no add-on packs on sale; pack GST invoices (row 116) never exercised |
| retailers with a shop pin | 16 of 20 | was 0 of 20 on 2026-11-04 (RC-163); 4 still without |
| `staff_push_devices` | 2 rows | at least two devices registered for staff push (F-046); delivery not confirmed |

## Owner / account actions
- [ ] Lawyer review of the privacy + terms wording (PR #37)
- [ ] Legal review of the training-data consent copy
- [ ] Play Store: 8 screenshots, 1024×500 feature graphic, Data Safety form, submit
- [x] Reviewer bypass for phone-OTP login — built 2026-09-24 (`REVIEW_PHONE` / `REVIEW_OTP` in `apps/api/src/routes/auth.ts`, BUILD-LOG part-5 §7A.3). Same bypass serves Play's App access form. Owner: set both vars in Railway and paste them into Play Console → App content → App access
- [ ] Set `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` in Railway
- [ ] Rotate every credential that lived in the local `.env` during dev (Anthropic, OpenAI, Supabase, R2, Redis)
- [ ] ~~Migrations 104/105~~ applied (verified 2026-10-25: no `imagen_3` engine value left) + engine choice for the MODEL studio rows (AI Studio row 75): 27 of 43 `studio_styles` rows have an engine, 16 are NULL (→ Kontext) — owner
- [x] **Verify migration 063 applied** — ✅ verified 2026-09-29 by the owner in Supabase SQL Editor (query returned 1 row; column present). Original note: docs conflict: `BUILD-LOG.md` §50 says "NOT applied", `marketing/india-retailer-growth.md` says applied. No ground-truth check exists for it. 30-second check: `SELECT 1 FROM information_schema.columns WHERE table_name='retailers' AND column_name='preferred_locale';`. Same failure class as the 058 scare — if the column is missing and any retailer query selects all fields, the endpoint 500s. (`058` itself was ground-truth-checked present in the 2026-09-03 audit — no action needed there.)

## Real-device checklist (EAS build)
- [ ] Phone OTP login + create account (real SMS)
- [ ] Onboarding → GST → plan-selection step
- [ ] Photo → AI tag → product saved; per-photo background/shadow controls
- [ ] Sizes on add/edit + customer detail page
- [ ] Customer list + preference capture
- [ ] WhatsApp collection link opened on a second phone (not on the LAN)
- [ ] Facebook connect (native SDK) end-to-end — code is done (`docs/tasks/done/social-connect-native.md`) but needs an EAS build + Meta App Dashboard redirect URI / App Mode / App Review before it works on a real phone
- [ ] AI Studio Shoot run against the live providers (`FAL_API_KEY`, `GEMINI_API_KEY` are registered in Admin → Integrations; the rebuilt pipeline has never been run live)
- [ ] Bulk onboarding (if pitching large stores)
- [ ] Account settings: profile, subscription, team, WhatsApp config
- [ ] Growth hub screens
- [ ] Facebook/Instagram connect + post on a real account (composer T-8.2)
- [ ] Accessibility pass (Reduce Motion, labels, 44px targets)
- [ ] Offline: add product in airplane mode → syncs on reconnect

## Engineering
- [ ] B-002: `DATABASE_URL_REPLICA` points at the primary — provision a real replica or stop relying on it (not needed for the pilot)
- [x] Sitemap — exists as route handlers `apps/web/src/app/sitemap/` + `apps/web/src/app/sitemap.xml/` (verified 2026-09-29; `robots.ts` also exists)
- [x] JSON-LD on store, categories, collection and product pages — built 2026-09-24 (launch §7A.1–7A.2, RC-040 XSS fix)
- [ ] One load test against staging — scripts built 2026-09-24 (`scripts/load/k6/`, runbook in `docs/SCALING.md` Load Testing); the actual run against staging is still open
- [x] Disaster-recovery runbook — built 2026-09-24 (launch §7A.4, `docs/SECURITY.md`)
- [x] Retailer-facing retention/deletion notice for training photos — built 2026-09-24 (launch §7A.6)
- [ ] Lock the MSG91 `verifyAccessToken` response shape: `npx tsx scripts/verify-msg91-token.ts "<widget_jwt>"`
- [x] Re-test every RC-### entry — 40/40 pass 2026-09-24 (launch §7A.7, BUILD-LOG part-6). RCs minted since (RC-041…RC-047) carry their own tests; re-run before the next production release
- [ ] RC re-test pass for RC-041…RC-176 (136 entries since the last full pass); each has unit tests, none re-tested end to end
- [ ] Migration history cannot rebuild a fresh DB (RC-159; production unaffected, matters for disaster recovery). Migrations are applied by hand; never run `prisma migrate deploy` (DEPLOY.md)
- [ ] Known flaky: `apps/api/src/lib/retired-tryon-guard.test.ts` fails only inside the full run

## Carried over from the post-referral board (2026-10-25)
- [ ] RazorpayX account live + `referral_payout_accounts` rows (runbook `docs/runbooks/razorpayx-referral-setup.md`). Until then the T7 payout job pays nobody — owner
- [ ] CA conversation before touching the referral TDS settings — owner
- [ ] T8 mobile "Refer & Earn" — blocked on Play Console review; leave until the owner says go
- [ ] Razorpay dashboard: subscribe the webhook to `refund.processed` (5A.4). Until then the refund handler is deployed but never fires, so the T5/T6 refund paths are unreachable in production — owner
- [ ] GST credit note for a refunded invoice (5A.3) — **deferred by owner 2026-09-24**: a refunded invoice stands as-is; needs the CA's credit-note format before any code
- [x] Deep-link `ref` param → prefill the onboarding referral code field (5B.2/5B.3) — built 2026-10-25 (`apps/mobile/src/lib/referral-capture.ts`): the root layout captures `?ref=` from any app link into SecureStore (30-day expiry), onboarding prefills an empty field only, never auto-submits, and clears it after a successful step-1 save; the server still validates. **Not device-tested** — needs an EAS build and `kanchuki://onboarding?ref=CODE` on a logged-out phone.
- [ ] Play Install Referrer read — not built: there is no Play listing yet (5B.1). Add it once the listing exists
- [ ] Keyboard-overlap pass on a real iOS device (Safari + app): AI Stylist sheet, customer-web consent modal, the 9 admin dialogs on `<Sheet>`, the 36 mobile screens on `KeyboardScreen`. Procedure: `../done/post-referral-cleanup-and-launch.md` → "7B.9 procedure"

## Built since 2026-10-25 — owner / device items (added 2026-11-18)

Each was merged with local or CI tests only. Source: CLAUDE.md What's-Built rows. Scan & Sell (F-047, row 114) is the exception: owner device-tested it 2026-11-15.

- [ ] **AI promo video (F-034, row 118)** — code complete, feature OFF. Follow `docs/runbooks/ai-promo-video-owner-steps.md` (bench → styles → models → limits → device test → launch → Meta App Review). Open decisions D6 (limits), D11 (child detection)
- [ ] **One EAS build** carrying all of the below, then test each on a device
- [ ] Staff push notifications (F-046, row 103): Firebase + `google-services.json`, FCM V1 key, AD_ID guard check, real push received
- [ ] Post scheduler (F-043, row 100): launch checklist `docs/runbooks/f-043-scheduler-launch-checklist.md`, Hindi check of built-in templates
- [ ] My Style (F-045, row 102): photo analysis never run against a real Vision model; colour-family backfill not confirmed run; occasion backfill not run
- [ ] Product stock (row 105), product audience chips (row 115), Google place-id field + setup checklist (row 108; `GOOGLE_PLACES_API_KEY` unset), AI content report button (row 110), design templates + AI posters (row 113), Google review replies / star button (row 117)
- [ ] Shop pin backfill for the 4 retailers without a pin (RC-163, dry-run first)
- [ ] Add-on packs: create packs (GST-inclusive 236/472/944), one real purchase to prove the pack GST invoice path (row 116, RC-173)
- [ ] Play Console AI-generated content declaration (row 110)
- [ ] Meta App Review (Instagram Reels + `pages_show_list` / `pages_read_engagement`)
- [ ] Google: OAuth client + `business.manage` access for GBP reviews (row 109); Places caching terms (row 117)
- [ ] Confirm the two remaining `plan_features` surprises in the read-back table (GOOGLE_BUSINESS_PROFILE, AI_CUSTOM_TEMPLATE ON); VIRTUAL_TRY_ON_V2 ON confirmed intended 2026-11-18
- [ ] Try-on first real run: RunPod endpoint alive (runbook Parts 1–2), one in-store try-on on a device, then Part 7 smoke test (`docs/runbooks/tryon-launch-owner-steps.md`)

## Suggested order (2026-11-18)

1. Rotate credentials, set Sentry DSN (security; minutes each).
2. Confirm the `plan_features` / `plan_limits` surprises above.
3. One EAS build → the real-device checklist + the built-since list.
4. RC re-test pass.
5. In parallel: lawyer review, Play listing + Data Safety + AI declaration, Meta App Review.
6. Then optional features one at a time (promo video runbook, try-on packs, GBP).
