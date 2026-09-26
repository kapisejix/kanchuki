# Tasks — Work Board

Where work lives: **`pending/` = open**, **`done/` = built** (kept as the design record + how it actually works).

**How to use this board:** a task file is the spec. The status here is a *pointer*, not proof — when a doc and the code disagree, the code wins. See `../root-cause/README.md` before starting work in a feature area.

---

## Pending

| Task | File | Status | Blocker / decision needed |
|---|---|---|---|
| AI photo & video generation — F-032 phase B (video), F-034 retailer phase, engine rebuild | `pending/ai-photo-generation.md` | 🟡 Mixed — F-032 phase A ✅ built; the rest not built; the garment-conditioned rebuild is 🧪 built but unmerged | Migrations `104`/`105` + which engine the 8 MODEL `studio_styles` rows get (owner). Rebuilt pipeline has never been run against live providers. |
| AI credit / limit / billing model | `pending/ai-credit-billing-model.md` | 🟡 Design; admin addon-pack half built (migration `089`, `/admin/resource-packs`) | §8 decisions; retailer-side credit consumption/limits unbuilt |
| Coupon codes on subscription checkout | `pending/coupon-codes.md` | 📋 Spec — not built | Product sign-off |
| Customer engagement + admin behavior analytics (F-037) | `pending/customer-engagement-analytics.md` | 🟡 Phase 1 ✅ built (migration `100`); phases 2–4 not started | Nightly aggregation job + admin dashboard need building |
| Customer PWA push notifications + home-screen icon (F-036) | `pending/customer-pwa-push-notifications.md` | 🟡 Phase A ✅ built (2026-09-17); B–D not started | VAPID/web-push + service-worker handler; iOS requires install-before-push |
| Ghost mannequin AI generation (F-001e) | `pending/ghost-mannequin.md` | 🔴 Planned, P2 — not built | **Snappyit has no public API**; a local LaMa version exists but is reachable only from the admin photo-cleanup bench |
| Google Business Profile auto-post (F-022) | `pending/google-business-profile-autopost.md` | ⏸ **On hold** | Blocked on Google API access. **Do not start without an explicit go-ahead.** |
| Launch readiness | `pending/launch-readiness.md` | 🟡 Open items | Mostly owner/account actions + 3 pre-launch verifications |
| Multi-language i18n (roadmap M) | `pending/multi-language-i18n.md` | 🟡 Partial — AI translate ✅; UI i18n not started | Migration `063` applied state **unverified**; there is no i18n infrastructure to build on |
| Prorated mid-cycle plan switch (Model B) | `pending/plan-switch-prorated.md` | 🔴 Planned — Model A is what shipped | Product sign-off (formula in the file) |
| Social publishing phase 3/4 — IG Reels scheduling, catalog broadcast analytics | `pending/social-publishing-phase-3.md` | 🔴 Planned | Phases 1–2 + composer are built; only these extensions remain |
| Style Match Lite / AI fit-style recommendation (F-039) | `pending/style-match-lite.md` | 🔴 Planned — not approved | Owner sign-off on §7 D-1/D-2 (scope + consent overhead) |
| Kanchuki-managed WhatsApp sending (F-035) | `pending/whatsapp-managed-sending.md` | 🔴 Planned — post-launch | Meta Business Verification + App Review (4–8 weeks); design locked to Model A (per-retailer WABA) |
| **This reorganization** | `pending/../reorganize-files-folders-structure.md` | 🟡 Phases 1–8 done; phase 9 awaits deletion approval | Owner approves the KEEP/DELETE list |

## Done

| Feature | File | Shipped |
|---|---|---|
| A/B testing for collections (roadmap S) | `done/ab-testing-variant-links.md` | 2026-08-18 |
| Campaign analytics — seasonal (roadmap R) | `done/campaign-analytics-seasonal.md` | 2026-08-18 |
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
