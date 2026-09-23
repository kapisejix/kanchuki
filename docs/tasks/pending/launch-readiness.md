# Launch Readiness — Open Items — PENDING

> Collected 2026-09-23 from `LAUNCH-READINESS-AUDIT.md`, `PLAY-STORE-LAUNCH-CHECKLIST.md`, the 2026-09-03 launch checklist and CLAUDE.md. Items already resolved there (B-003/005/007/008/009, S-009, DLT registration, `set-gst-profile.ps1`) are left out. B-004 admin TOTP was descoped by the owner.

## Owner / account actions
- [ ] Lawyer review of the privacy + terms wording (PR #37)
- [ ] Legal review of the training-data consent copy
- [ ] Play Store: 8 screenshots, 1024×500 feature graphic, Data Safety form, submit
- [ ] Apple App Store (if/when): reviewer bypass for phone-OTP login (fixed test number + fixed OTP); Apple review will likely reject the app without one
- [ ] Set `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` in Railway
- [ ] Rotate every credential that lived in the local `.env` during dev (Anthropic, OpenAI, Supabase, R2, Redis)
- [ ] Migrations 104/105 + engine choice for the 8 MODEL studio rows (AI Studio row 75)
- [ ] **Verify migration 063 applied** (`retailers.preferred_locale`) — docs conflict: `BUILD-LOG.md` §50 says "NOT applied", `marketing/india-retailer-growth.md` says applied. No ground-truth check exists for it. 30-second check: `SELECT 1 FROM information_schema.columns WHERE table_name='retailers' AND column_name='preferred_locale';`. Same failure class as the 058 scare — if the column is missing and any retailer query selects all fields, the endpoint 500s. (`058` itself was ground-truth-checked present in the 2026-09-03 audit — no action needed there.)

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
- [ ] `apps/web/src/app/sitemap.ts` (missing; `robots.ts` exists)
- [ ] Per-page `generateMetadata` + JSON-LD on store and collection pages (verify what exists first)
- [ ] One load test against staging (`docs/SCALING.md` §5)
- [ ] Disaster-recovery runbook
- [ ] Retailer-facing retention/deletion notice for training photos
- [ ] Lock the MSG91 `verifyAccessToken` response shape: `npx tsx scripts/verify-msg91-token.ts "<widget_jwt>"`
- [ ] Before production: re-test every RC-### entry in `docs/root-cause/` (see its README)
