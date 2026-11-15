# Production-readiness handoff (2026-11-15)

Purpose: one place for what is still open before Kanchuki is production ready, written for a fresh session.
Source: CLAUDE.md What's-Built rows and RC tracker, read 2026-11-15. **Nothing here was re-verified against live
systems on that date unless a line says so.** Trust `git log`, the RC tracker and the live dashboards over this file.
Broader audit for context: `docs/tasks/pending/launch-readiness.md`.

## Session ground rules

- Owner does merges, deploys, prod writes and migrations. Agent proposes, owner approves (CLAUDE.md Operational Control Policy).
- Deploys come from GitHub push to `main` only. Never `railway up`.
- Never open `.env` files or print connection strings.
- Rebuild shared after any shared change: `pnpm --filter @kanchuki/shared build`.
- CI lints api/shared/ai with `biome check src/`; run it on touched api files before pushing. Web tests need `NODE_OPTIONS=--no-experimental-webstorage`.
- Validation errors in this API are 422, not 400.
- Bug fix = new RC entry in `docs/root-cause/root-cause issues.md` + RC row in CLAUDE.md + RC id in the commit message.
- Docs track commits: update the CLAUDE.md index row and `docs/build-log/part-7.md` in the same session.

## Where things stand (verified 2026-11-15)

- Product audience (PR #275, `7d174fc8`) and bulk-onboard audience seeding (PR #276, `a616b300`) are merged; CI was 5/5 on both.
- Railway CLI: newest API + web deployments SUCCESS, `https://api.kanchuki.app/health` ok incl. `schema`. The deployment tied to `7d174fc8` shows REMOVED and the newest SUCCESS one records no commit hash, so **the live commit is not proven**. Check the active deployment's commit in the Railway dashboard.
- Railway MCP tool said `Unauthorized` even after `railway login` (CLI works). A Claude Code restart may fix it.
- No device or browser test of the audience feature. Mobile chips need an EAS build.

## Held until the owner tests with real data (do these first, owner pastes data)

1. **Real-model tagging results for audience.** Owner uploads/imports ~20 mixed products (kids, men, women, one "Frock suit") after an EAS build and pastes either notes ("name -> chip shown -> right/wrong") or this read-only SQL result:
   `select name, category, subtype, audience, kids_age_group from products where created_at > now() - interval '1 day' order by created_at;`
   Agent counts right/wrong and records it in `docs/build-log/part-7.md` labelled owner-reported. No invented results.
2. **Age-boost weights (0.1 exact / 0.05 adjacent).** Tune only against real "For my child" searches with age bands set. Owner reports which products come first. Change only if the order looks wrong; test red first.
3. **CLAUDE.md row 115 deploy line.** Update once the owner confirms the live commit.
4. Owner hand-fixes the one wrong "Frock suit" row in the app (code fix shipped in `cee57331`; stored label unchanged).

## A. Blocks launch confidence (owner side)

| # | Item | What is needed |
|---|---|---|
| A1 | Device/browser tests missing | Scan & Sell (F-047), product stock (137), audience chips, My Style (F-045), F-043 scheduler, F-044 enquiry inbox, F-045 PWA. Most need a fresh EAS build. Suggested first pass: the core retailer flow (add product -> AI tags -> catalog -> WhatsApp share -> customer page). |
| A2 | Staff push (F-046) never reached a phone | Confirm migration 135, Firebase + `google-services.json`, FCM V1 key, EAS rebuild, AD_ID CI guard check. Known gaps: sign-out skips unregister; stale `disabled_at` rows not pruned. |
| A3 | Plan limits seeding (RC-103) | `plan_limits` rows for `STUDIO_SHOOT`, `BG_REMOVAL`, `IMAGE_CROP` (and `TRY_ON_GENERATION` if missing) for all three plans in Admin -> Plan Limits, or those features refuse everyone. |
| A4 | Play Console AI-generated-content declaration | Open. The in-app "Report AI content" is built and merged. |
| A5 | Strix security review not running | Trial ended; the PR review bot did not run on #275/#276. Renew only if the owner wants that gate. |
| A6 | Railway deploy commit unproven | See "Where things stand". |

## B. Built but switched off (owner decision to enable)

- **F-040 CatVTON try-on:** `VIRTUAL_TRY_ON_V2` OFF. Steps in `docs/runbooks/tryon-launch-owner-steps.md`. Packs inactive until created.
- **Google Business reviews (GBP):** no `plan_features` row, API not marked approved, Google Cloud OAuth client and `business.manage` access not requested. Migrations 140-142 applied. Nothing verified against real Google.
- **AI custom designs (T5):** dark until a `plan_features` row and `plan_limits` rows for `AI_CUSTOM_TEMPLATE` exist.
- **F-036 Phase B customer web push:** VAPID keys unset, no device test.
- **F-043 post scheduler:** built through Task 5; check current branch/merge/deploy state in the CLAUDE.md row and git before assuming it is live. Launch checklist: `docs/runbooks/f-043-scheduler-launch-checklist.md`. Hindi check of built-in templates (device-test doc row 2.15) still open.
- Design starter pack seed: owner ran `seed-design-templates.ts --apply`; other designs' PUBLISHED state not confirmed.

## C. Risk and hygiene

- **RC-159 migration history cannot build a fresh DB** (009 and 015 fail; replay differs from `schema.prisma`). Matters for disaster recovery. CI guard pins the two known failures. Options (a) idempotent edits, (b) squashed baseline: still open.
- **RC-080** `content_length` required on every presign route: merge/rollout only after device test and mobile rollout.
- **F-047 open items (owner decisions, not built):** untracked one-off product can be sold twice and Undo revives it; a Redis claim stuck by an API crash keeps a queued bill up to 24 h with no alert; a salesperson may undo any bill. Residuals: queued bills carry no retailer id; reused `client_bill_id` with different lines answers the old lines; undo has no stock-cap clamp; sell/undo rate limit keys on IP; status-queue read-modify-write not serialised; offline lookup only finds SKUs the catalog already cached; no real concurrency test.
- **Sentry:** confirm the DSN is set in Railway (RC-113 alerts need it). Optional `SCHEMA_DRIFT_BLOCKS_HEALTH=1` is not set.
- **k6 load tests** (launch readiness 7A.5) exist; no recorded run against staging.
- RC-163: shop-pin backfill not run (prod had 0 retailers with coordinates when last read).
- Product audience residuals: bulk-onboard has no review rows (audience comes from the AI tags / keyword guess, no chips); untagged products hidden by the strict "Find similar" gate (RC-167, 0.6 untuned).

## D. Post-launch by design (do not start now)

- F-035 Kanchuki-managed WhatsApp sending (Meta Tech Provider + Embedded Signup).
- Hindi/regional UI (i18n P2 parked).
- F-022 auto-post to Google Business Profile (blocked on Google API access).
- Pre-Loved (F-041) and F-040 beyond the flag.

## Suggested order for the next session

1. Owner: EAS build + core retailer flow device pass -> paste findings; agent fixes red-first (new RC each).
2. Owner pastes audience tagging results -> agent records them; tune age weights only if order is wrong.
3. Seed plan limits (A3) and confirm deploy commit (A6).
4. Push notifications setup (A2), then decide which "switched off" items (section B) to enable.
5. Hygiene (section C) by value: RC-159 option choice, F-047 owner decisions, Sentry DSN, k6 run.
