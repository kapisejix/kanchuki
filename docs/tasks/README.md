# Tasks — Work Board

Where work lives: **`pending/` = open**, **`done/` = built** (kept as the design record + how it actually works).

**How to use this board:** a task file is the spec. The status here is a *pointer*, not proof — when a doc and the code disagree, the code wins. See `../root-cause/README.md` before starting work in a feature area.

---

## Pending

| Task | File | Status | Blocker / decision needed |
|---|---|---|---|
| AI photo & video generation — F-032 phase B (video), F-034 retailer phase, engine rebuild | `pending/ai-photo-generation.md` | 🟡 Mixed — F-032 phase A ✅ built; bench run 1 ✅ 2026-09-20; runs 2–3 not run (checklist §8.1e); retailer-path wiring not built | Bench runs 2–3 (owner), engine per MODEL row, compression ceiling, R6 disclosure. |
| AI fit/style recommendation — research notes (feeds F-039) | `pending/ai-fit-recommendation-research.md` | 🔬 Research only (2026-09-25) — nothing built, nothing decided | Superseded in practice by `style-match-lite.md`; fold in or archive |
| Railway cost & memory improvements | `pending/improvments-railway.md` | 🟡 Partly done — API 1.34 → 0.14 GB after bg-removal removal (#49/#50); API sleep off | 24 h memory recheck + web/Postgres/docs items; owner decisions |
| Post-referral cleanup + launch batch | `pending/post-referral-cleanup-and-launch.md` | 🟡 Mostly done — branch/migration sections stale (superseded 2026-09-28) | Re-read open `[ ]` items; fold remainder into `launch-readiness.md` |
| AI credit / limit / billing model | `pending/ai-credit-billing-model.md` | 🟡 Design; admin addon-pack half built (migration `089`, `/admin/resource-packs`) | §8 decisions; retailer-side credit consumption/limits unbuilt |
| Coupon codes on subscription checkout | `pending/coupon-codes.md` | 📋 Spec — not built | Product sign-off |
| Customer engagement + admin behavior analytics (F-037) | `pending/customer-engagement-analytics.md` | 🟡 Phases 1–3 ✅ built; Phase 4 partly built (retailer aggregate view + engagement items 1, 2, 4, 5, 6, 8 built; item 7 at product-card level; item 9 infinite scroll reverted to Prev/Next pager 2026-09-29; 24-month raw-event prune built 2026-09-29) | Store-level rating on `/stores` (owner decision); PR #41 merged 2026-09-29 |
| Customer PWA push notifications + home-screen icon (F-036) | `pending/customer-pwa-push-notifications.md` | 🟡 Phase A ✅ built (2026-09-17); B–D not started | VAPID/web-push + service-worker handler; iOS requires install-before-push |
| Ghost mannequin AI generation (F-001e) | `pending/ghost-mannequin.md` | 🔴 Planned, P2 — not built | **Snappyit has no public API**; a local LaMa version exists but is reachable only from the admin photo-cleanup bench |
| Google Business Profile auto-post (F-022) | `pending/google-business-profile-autopost.md` | ⏸ **On hold** | Blocked on Google API access. **Do not start without an explicit go-ahead.** |
| Launch readiness | `pending/launch-readiness.md` | 🟡 Open items | Mostly owner/account actions + 3 pre-launch verifications |
| i18n + dynamic-content audit (no-hardcoded-values program) | `pending/i18n-and-dynamic-content-audit.md` | 📋 Audit — awaiting owner approval (2026-09-29) | §5 open questions; Phase B starts only after approval |
| Multi-language i18n (roadmap M) | `pending/multi-language-i18n.md` | 🟡 Partial — AI translate ✅; UI i18n not started | Migration `063` applied state **unverified**; there is no i18n infrastructure to build on |
| Pre-Loved — customer resale / rental / family gifting of used clothes (F-041) | `pending/how-customer-earn-from-this-platform.md` (spec + research merged) | 🔴 Idea — not approved (2026-09-29) | Owner decisions §13 D-1…D-7; legal review (intermediary, GST, DPDP) before P1; recommend no-code P0 pilot first |
| Prorated mid-cycle plan switch (Model B) | `pending/plan-switch-prorated.md` | 🔴 Planned — Model A is what shipped | Product sign-off (formula in the file) |
| Social publishing phase 3/4 — IG Reels scheduling, catalog broadcast analytics | `pending/social-publishing-phase-3.md` | 🔴 Planned | Phases 1–2 + composer are built; only these extensions remain |
| Social Post Scheduler — daily FB/IG carousel plans, in-app status card, admin-limited (F-043) | `pending/post-scheduler.md` | 🟨 Tasks 1–5 built and on `main` (Task 1 #79, Task 2 #80, Tasks 3–5 landed via stacked #83 — #81/#82 were closed unmerged but their code is in #83); not device-tested | Owner: Meta App Review checklist §9; confirm migrations 128/129 applied; device test; `docs/runbooks/f-043-scheduler-launch-checklist.md` |
| Retailer support tickets + feedback loop (retailer raises ticket, staff/retailer/customer feedback → admin report) — F-number unassigned | `pending/support-and-feedback-loop.md` | 🔴 Review only — not approved (2026-10-15) | Owner answers §5 (ticket vs consent steps, customer feedback in MVP?, report format); builds on `support-session-access.md` (migration 127 + switch still owner-side) |
| Screenshot audit 2026-10-15 — 11 device screens: price ×100 in AI Stylist, fake-success Marketplace Sync, stale privacy page, design inconsistency, docs≠app | `pending/screenshot-audit-2026-10-15.md` | 🟨 Phase 1 merged 2026-10-16 (PR #85; S-01/02/03/04/05/09, X-1; RC-055…RC-061, CLAUDE.md RC rows present) | Owner: build + upload v7 (Phase 2 prep on `release/v7`), inputs I-1…I-5 (A.6) |
| Enquiry basket → team inbox + in-store try-on, Releases 1–2 (F-044) | `pending/enquiry-basket-team-inbox-and-instore-tryon.md` | 🟨 Release 1 merged to main 2026-10-17 (PRs #95–#100, `4124e2ef`); **Release 2 merged 2026-10-17 (PR #103, `2343e492`)** — E8 in-store try-on session, E11 GPU-usage logging + admin report, E12 try-on top-up packs, RC-068. Device test pending; try-on flag OFF (§11.7) | Migrations 130 and 131 applied in prod 2026-10-17. Owner: create the 3 inactive packs, EAS rebuild (keep-awake), enable `VIRTUAL_TRY_ON_V2` after F-040 gates, device pass. Release 3 real push = F-046, merged 2026-10-19 (PRs #137, #138), built, not device-tested (see `pending/staff-push-notifications.md`). Not built: E9 (needs F-035) |
| Style Match Lite / AI fit-style recommendation (F-039) | `pending/style-match-lite.md` | 🔴 Planned — not approved | Owner sign-off on §7 D-1/D-2 (scope + consent overhead) |
| CatVTON-on-RunPod try-on, admin-gated launch + dual quota (F-040) | `pending/catvton-runpod-tryon-launch.md` | 🟨 Built, flag OFF — build done, launch owner-side (2026-09-26) | T0–T7 ✅ 2026-09-26 — endpoint + image alive; schema + dual quota built (migrations **118/119/120 applied** 2026-09-26); route + job built (server-side 404 gate, dual identity via Bearer or passport cookie, wearer photo handed over in-process so it never reaches R2/DB/**Redis**); consent gate + withdrawal + deletion sweep (`RC-044`); on-device + customer-web UI. **Before it works live:** re-point the RunPod template tag, set `workersMax > 0` (owner's RunPod key), set the Admin → Integrations secrets, confirm the `/privacy` notice is **deployed** (still the Sep 24 revision live), then flip `VIRTUAL_TRY_ON_V2`. Owner checklist: `../runbooks/tryon-launch-owner-steps.md`. Renumbered from "F-039 Phase 2" → F-040 |
| Homepage product browse — "New arrivals near you" (F-042, proposed) | `pending/homepage-product-browse.md` | 🔴 Idea — not approved (2026-09-30) | Gates G-1…G-3 (≥10 active shops, consistent photos, retailer reaction); owner decisions §8 |
| Kanchuki-managed WhatsApp sending (F-035) | `pending/whatsapp-managed-sending.md` | 🔴 Planned — post-launch | Meta Business Verification + App Review (4–8 weeks); design locked to Model A (per-retailer WABA) |
| Railway cost & memory — background-removal removal, API memory 1.34 → 0.14 GB, admin Server Memory card | `pending/improvments-railway.md` | ✅ Culprit found + fixed + deployed (#49, #50, 2026-10-10); 24 h confirmation open | 24 h RSS recheck; 3 Postgres services on hold (owner review, back up first); stale `CLAUDE.md` index rows #31/#33/#35/#53 need owner approval to edit |
| Storefront soft-404 — unknown paths (e.g. `/.git/config`) return HTTP 200 with the "not found" page | `pending/storefront-soft-404.md` | 🔴 Planned, low priority (2026-10-10) — no data exposure | Local repro of `loading.tsx` flush-before-`notFound()`; code change in `apps/web` needs owner approval |

## Done

| Feature | File | Shipped |
|---|---|---|
| A/B testing for collections (roadmap S) | `done/ab-testing-variant-links.md` | 2026-08-18 |
| Campaign analytics — seasonal (roadmap R) | `done/campaign-analytics-seasonal.md` | 2026-08-18 |
| Dead code cleanup — orphaned Fashion DNA config key + Lookbook/Festival Background client bindings | `done/dead-code-cleanup.md` | 2026-09-28 |
| Product & store ratings (F-021) | `done/ratings-reviews.md` | 2026-08-20 |
| `return_to` post-login redirect + `/login` route | `done/return-to-post-login-redirect.md` | 2026-09-17 |
| Indian size & fit (roadmap N) — ⚠️ size-chart engine later removed | `done/size-fit.md` | 2026-08-18 |
| Social connect via the native Facebook SDK | `done/social-connect-native.md` | code shipped; real-device check in `pending/launch-readiness.md` |
| Social create-post composer (migrations `090`–`092`) | `done/social-create-post-composer.md` | 2026-09-04 |
| Staff-assisted catalog upload (F-019/F-020) | `done/staff-assisted-catalog-upload.md` | 2026-07-28 |
| Tokenized staff invites (migration `099`) | `done/staff-invite-tokens.md` | 2026-09-09 |
| Monthly-only pricing + GST engine + invoice PDF (migrations `086`–`088`) | `done/subscription-gst-and-monthly-pricing.md` | 2026-09-01 |
| Suits Designs showcase (migrations `093`–`096`) | `done/suits-designs.md` | 2026-09-07 |
| Retailer team members + access control (migration `098`) | `done/team-member-access-control.md` | 2026-09-09 |
| WhatsApp native catalog sync, Phase II (migrations `060`–`062`) | `done/whatsapp-catalog-sync.md` | 2026-08-18 |
| Storefront soft-404 — unknown store → real 404 (+ scanner-probe middleware) | `done/storefront-soft-404.md` | 2026-10-10 |
| Docs reorganization (phases 1–8; phase 9 KEEP/DELETE list moved here with the file) | `done/reorganize-files-folders-structure.md` | 2026-09-25 |
| Studio Shoot option matrix (F-032) — shared styles + product-aware gating + mobile picker, migration `123` (27 rows `DRAFT`). Admin-only remainder: publish rows, engine per row, retire legacy rows, thumbnails | `done/studio-shoot-option-matrix.md` (+ `done/studio-shoot-retailer-rollout.md`, `done/studio-shoot-session-handoff.md`) | 2026-10-10 |
