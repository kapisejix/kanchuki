# 2026-09-03 — PR #23 CI Green-Up + Pre-Launch Checklist

**Branch:** `chore/api-lint-rules`
**PR:** [#23 — fix(api): green the biome lint (quality CI)](https://github.com/kapisejix/kanchuki/pull/23) — `chore/api-lint-rules` → `main`, **OPEN**
**Session:** https://claude.ai/code/session_01V4icsaoFTuWENaHA3mtFj2

---

## 1. Executive summary

PR #23 started as "make `pnpm lint` (biome) pass in the `quality` CI job". Once
lint went green, the `quality` job kept failing — **because `main`'s CI had been
red for weeks and every failure after the lint step was hidden behind it.** Each
fix uncovered the next one:

```
lint (biome)        ✅ fixed on branch before this session (commit 4034073)
  └─ check-route-size.sh      ❌ → ✅ fixed (commit 1ddc149)
       └─ check-v1-fetch-guard.sh   ❌ → ✅ fixed (commit 1ddc149)
            └─ pnpm test / @kanchuki/db   ❌ → ✅ fixed (commit 053d66e)
            └─ pnpm test / @kanchuki/mobile snapshots   ❌ → ✅ fixed (commit 053d66e)
            └─ pnpm test / @kanchuki/api purge mock   ❌ → ✅ fixed (commit 053d66e)
                 └─ pnpm test / @kanchuki/ai (detector, r2)   ❌ → ✅ fixed + committed (99401fa, §4)
```

**None of these were caused by PR #23's scope.** They are pre-existing breakage
on `main` that the biome-lint fix simply let CI reach.

---

## 2. CI state right now

Last run on the branch: **[run 33717317185](https://github.com/kapisejix/kanchuki/actions/runs/33717317185)** (commit `053d66e`)

| Job | Result | Notes |
|-----|--------|-------|
| `unit-web` | ✅ SUCCESS | Green on every run this session. No action. |
| `quality` | ❌ FAILURE | Failed at `pnpm test` → `@kanchuki/ai` (`src/detector.test.ts`, `src/r2.test.ts`). **Fix is written and verified locally, not committed yet** — see §4. |
| `build` | ⊘ SKIPPED | Gated behind `quality`. Will run once `quality` is green. **Never verified green this cycle.** |
| `e2e-web` | ⊘ SKIPPED | Same — gated behind `quality`. **Never verified green this cycle.** |

`main`'s own CI is also red (fails at `pnpm lint`). Merging PR #23 is what turns
`main` green again.

**Update 2026-09-03 (after local verification):** the `@kanchuki/ai` failure is
fixed by `packages/ai/vitest.config.ts`, committed `99401fa` (§4) and pushed —
the table above predates that push. The quality-equivalent suite is green locally
(§5). `build` + `e2e-web` remain unproven this cycle; they run once `quality` is
green on the new head.

---

## 3. What was fixed this session

### 3.1 `check-route-size.sh` — 5 route files over the 800-line limit (commit `1ddc149`)

`billing.ts` (871), `growth/growth-campaigns.ts` (941), `public/passport.ts`
(924), `public/public-retailers.ts` (875), `retailers/retailers-social.ts` (889).
All were already >800 on `main` before the biome-format pass — they grew over
many feature commits.

**Fix:** grandfather allowlist in the script. Each of the 5 is pinned to its
**current** length as a hard ceiling. Any NEW route file over 800 still fails;
these 5 can't grow one line more.

**Follow-up (not blocking launch):** actually split the 5 files into domain
modules and delete their allowlist lines. Separate PR.

### 3.2 `check-v1-fetch-guard.sh` — 3 false positives (commit `1ddc149`)

`apps/web/src/app/social/connect/page.tsx` and `.../callback/page.tsx` called
`apiFetch('/v1/...')`. The calls are **safe** (the `apiFetch` helper prepends
`API_URL`), but the guard's regex can't see through the helper.

**Fix:** moved the 3 call sites to the guard-blessed `` `${API_URL}/v1/...` ``
idiom; `apiFetch` now takes a full URL instead of a path. Behaviour identical.

### 3.3 `@kanchuki/db` unit tests — `DATABASE_URL is not set` (commit `053d66e`)

`packages/db/src/client.ts` builds the Prisma client **at module import time**
and throws if `DATABASE_URL` is unset. The `quality` job sets no `DATABASE_URL`
(only `VAULT_DATABASE_URL`).

**Fix:** new `packages/db/vitest.config.ts` with a throwaway `DATABASE_URL`
(`postgresql://ci:ci@localhost:5432/ci_db_unused`). Tests mock Prisma and never
connect — mirrors the existing `VAULT_DATABASE_URL` dummy in `ci.yml`.

### 3.4 `@kanchuki/mobile` — stale `ProductCard` snapshots (commit `053d66e`)

Snapshots last regenerated 2026-08-03; `ProductCard.tsx` changed 2026-08-28
(commit `1af9c6e`, "Discovery luxury design" — `sand`→`lavender`, rounded
corners, press animation removed). 7 snapshot tests mismatched.

**Fix:** regenerated (`vitest -u`). Diff is cosmetic tokens only.

### 3.5 `@kanchuki/api` — `purge-retailer-now.test.ts` mock gap (commit `053d66e`)

`purge-retailer-now.ts` imports `{ getPurgePrisma, prisma }` from `@kanchuki/db`
(uses `prisma` only for the `db === prisma` reference guard in
`assertPurgeRole()`). The test's `vi.mock('@kanchuki/db')` only exported
`getPurgePrisma` → vitest threw `No "prisma" export is defined on the mock`.

**Fix:** added a sentinel `prisma: { __sentinel: 'primary' }` to the mock
factory. `getPurgePrisma()` still returns a distinct object, so the guard stays
correct.

### 3.6 `@kanchuki/ai` — `detector.test.ts` / `r2.test.ts` transitively import `@kanchuki/db` ✅ **FIXED (commit 99401fa, §4)**

Same root cause as §3.3, one level removed: `packages/ai` modules re-export
through a barrel that pulls `@kanchuki/db` → `client.ts` throws at load.

**Fix:** `packages/ai/vitest.config.ts` with the same throwaway `DATABASE_URL`.
Verified with `DATABASE_URL` unset: per-file 6/6, plus a forced uncached full
package run — 9 files / 71 tests pass (§5).

---

## 4. Committed + pushed on this branch ✅ (commit 99401fa)

```
packages/ai/vitest.config.ts                                        (NEW — commit 99401fa)
docs/tasks/2026-09-03-ci-pr23-and-launch-checklist.md               (NEW — this file, verification results)
```

**Done:**

1. ✅ `git add packages/ai/vitest.config.ts` → committed `99401fa` (message below) → pushed to `origin/chore/api-lint-rules`.
2. ✅ Full local re-run before pushing: `env -u DATABASE_URL pnpm test` → green (§5).
3. ⏳ Watch [Actions](https://github.com/kapisejix/kanchuki/actions?query=branch%3Achore%2Fapi-lint-rules) — `quality`, then `build` + `e2e-web` (never green this cycle yet).
4. If `build` or `e2e-web` fail, those are the **next** hidden layers — same pattern, keep going.

Commit message used:

```
test(ci): let @kanchuki/ai tests load @kanchuki/db without DATABASE_URL

detector.test.ts / r2.test.ts transitively import @kanchuki/db via the
package barrel; client.ts builds the Prisma client at import time and
throws without DATABASE_URL (the quality job sets none). Add
packages/ai/vitest.config.ts with a throwaway DATABASE_URL — same fix as
packages/db/vitest.config.ts (053d66e).

Verified with DATABASE_URL unset: pnpm test full run green (9/9 tasks),
plus a forced uncached @kanchuki/ai run — 9 files, 71 tests pass.
```

---

## 5. Local verification already done (with `DATABASE_URL` unset, to mimic CI)

| Check | Result |
|-------|--------|
| `bash scripts/check-route-size.sh` | ✅ pass |
| `bash scripts/check-v1-fetch-guard.sh` | ✅ pass |
| `bash scripts/check-delete-guard.sh` | ✅ pass |
| `bash scripts/check-secrets-guard.sh --all` | ✅ pass |
| `pnpm typecheck` | ✅ 9/9 packages |
| `pnpm test` (before the ai fix) | ❌ `@kanchuki/ai` only |
| `pnpm test` (after the ai fix, per-file) | ✅ ai detector+r2 6/6 |
| **`pnpm test` full run after ai fix** | ✅ green — `env -u DATABASE_URL pnpm test` exit 0, 9/9 tasks (6 turbo-cached; @kanchuki/api ran fresh: 55 files / 706 tests). Forced uncached `turbo test --filter=@kanchuki/ai --force`: 9 files / 71 tests pass. |

`pnpm lint` fails **locally only** — Windows `core.autocrlf=true` gives every
file CRLF and biome's formatter wants LF. On CI (Linux, LF checkout) it passes;
proven by the PR run getting past the lint step. `biome lint` (rules only, no
formatter) is clean locally too.

---

## 6. Merge PR #23 → main

Once `quality` + `build` + `e2e-web` + `unit-web` are all green on the branch:

```
gh pr view 23 --json statusCheckRollup      # confirm all four green
gh pr merge 23 --squash --delete-branch      # or --merge, match repo convention
```

After merge, confirm `main`'s CI run goes green (it will be the first green
`main` in weeks). No deploy is triggered by this PR directly — Railway
auto-deploys `main` on push, so **the API + web services will redeploy from the
merge commit.** Nothing in PR #23 changes runtime behaviour (lint config, a CI
guard script, 3 test-only config/mock files, 2 web files using an equivalent URL
form), so the redeploy is safe — but watch the Railway deploy logs once.

---

## 7. `.apk` vs `.aab` — what to build and test

**Short answer: you test on an `.apk`, you submit an `.aab`.**

| Purpose | Artifact | How |
|---------|----------|-----|
| Dev / QA / sideload on your own phone | `.apk` | `eas build --platform android --profile preview` (already configured — `preview` profile in `apps/mobile/eas.json` sets `buildType: "apk"`, `distribution: "internal"`). Install the APK directly. |
| Play Store submission | `.aab` | `eas build --platform android --profile production` (the `production` profile builds an AAB — EAS default when no `buildType` is set). Then `eas submit --platform android --profile production`, or upload the `.aab` in Play Console. |
| Final pre-launch smoke test | Play **Internal testing** track | Upload the production `.aab` to Play Console → Internal testing → add your email as a tester → install **through the Play Store link**. This is the only way to test the exact bytes Play ships (Play re-signs and splits the AAB into per-device APKs). |

**You cannot upload an `.apk` to the Play Store for a new app** — Play requires
AAB. The APK is purely for your own device testing.

### Why a real build (not Expo Go) is mandatory before launch

Per `CLAUDE.md` (MSG91 OTP section): the **MSG91 native OTP widget module does
not run in Expo Go**. `EXPO_PUBLIC_MSG91_WIDGET_ID` / `_TOKEN_AUTH` are wired
into both the `preview` and `production` profiles in `eas.json`. You must test
send / verify / invisible-mode OTP on a real **EAS build** (APK is fine for
this), on a real phone.

### Mobile test checklist (on the `preview` APK, real device)

- [ ] Phone-OTP login **and** create-account (segmented toggle) — real SMS
      arrives (needs MSG91 DLT sender-ID registered — see §8, may still be pending)
- [ ] Onboarding → GST step → **mandatory plan-selection step 4** (Demo / Starter
      / Growth / Pro) → Done. Demo picks full Pro, no payment.
- [ ] Photo → AI auto-tag → product saved (raw photo default, auto-clean OFF)
- [ ] Per-photo Background / Shadow controls on product detail
- [ ] Product sizes (S–XXXL) on add/edit, shown on customer detail page
- [ ] Customer list + preference capture
- [ ] WhatsApp collection-link generate + open on a second phone
- [ ] Bulk onboarding (rack/shelf batch capture) if pitching large stores
- [ ] Account settings: profile edit/delete, subscription, team, WhatsApp config
- [ ] Growth hub: campaigns, promotions, suppliers, inventory alerts, AI search,
      AI campaign assistant, campaign analytics
- [ ] Social connect (Facebook Page) — the web callback page this PR touched;
      confirm the OAuth round-trip still completes
- [ ] Reduce Motion / accessibility labels / 44px touch targets (audit was done,
      re-spot-check)
- [ ] Offline: add a product with airplane mode on → syncs when back online

---

## 8. What still needs fixing before launch (not PR #23)

Source: `docs/LAUNCH-READINESS-AUDIT.md` (§0b closed four items on 2026-09-03).
**These are operational hardening, mostly config, not code.**

### 8.1 Secrets / infra — 🔴 open

| ID | Item | Action |
|----|------|--------|
| B-003 | `ADMIN_PASSWORD_HASH` still in legacy HMAC format | Run `npx tsx scripts/generate-admin-hash.ts '<password>' --totp` yourself, set the printed hash in Railway (API service). |
| B-004 | Admin TOTP (2FA) not enabled — `ADMIN_TOTP_SECRET` unset | Same command's `--totp` output gives a QR-scannable URI. Set the secret, scan into an authenticator. |
| B-002 | `DATABASE_URL_REPLICA` points at the **primary** DB, not a real read replica | Provision a Supabase read replica, point the var at it. Admin ad-hoc SQL console (SECURITY §13) currently reads from primary. Lower priority than B-003/004 for a small pilot. |

✅ Already resolved + verified live 2026-09-03 (§0b): `COOKIE_SECRET`,
`VAULT_DATABASE_URL` (B-005), `DATABASE_URL` on `kanchuki_app.*` non-superuser
role (B-007), `TEAM_JWT_SECRET` (B-008), `REVALIDATION_SECRET` on **both** API +
web (B-009), real `RAZORPAY_WEBHOOK_SECRET` (S-009).

### 8.2 Database migrations — ⚠️ verify with owner before launch

Per `CLAUDE.md` feature index. **Migrations run only from the admin dashboard
with approval — never from a local machine.** Confirm each is applied in prod:

| Migration | What | Status per docs |
|-----------|------|-----------------|
| 086 → 087 → 088 | Monthly-only pricing + GST engine; **088** creates `platform_gst_profile` (never created by any earlier migration) | "to apply" — then run `scripts/set-gst-profile.ps1` (operator one-shot) |
| 083 | `GRANT DELETE on product_photos` (photo-delete permission fix) | shipped in PR #16 (merged) — verify grant is live |
| 082 | Feature teardown (24+ tables, 17 enums) | `chore/remove-unwanted-features` — verify applied |
| 069 | `DesignReference` (unstitched design gallery) | verify |
| 058 | `customers.usual_size` | **MUST be applied pre-launch (audit 2026-09-03).** Not growth-only: the teardown removed only the size-chart engine, but `customers.usual_size` is still on the `Customer` model, so **every select-all `prisma.customer` query 500s if the column is missing**. Confirmed select-all sites (no `select` clause): `routes/customers.ts` — **the entire core customer CRUD**, all 8 calls (POST dedupe `findFirst` L41, GET list L84, GET `/:id` L116, PUT `findFirst` L128, DELETE `findFirst` L167) → retailer "Customer list + preference capture" (Phase-0 MVP) dies; `routes/growth/growth-sizes.ts` L19 (`POST /v1/growth/customers/:id/recommended-size`, growth-gated); `routes/collections.ts` L48 + L254; `admin-retailers-management.ts` L266 (admin customer edit). Immune (explicit `select`/count/updateMany): growth-campaigns ×5, public lead-capture upsert (select id/name), public-reviews upsert, passport `updateMany`, stats/profile counts, admin list/detail. **Evidence of applied state:** PROGRESS.md 2026-08-18 prod audit = 055–057 applied, **058 NOT applied ("column missing")** — same day 060–062 went in, proving application is manual/batched and can skip (no later offline verification exists; PROGRESS ends 08-21 with 069 still pending). INDIA-RETAILER-GROWTH.md/N-SIZE-FIT-GAPS.md "applied" claims are unverified status headers (N-SIZE-FIT-GAPS internally contradicts itself at line 79 "❌ not applied"). **Owner check (30s):** open the retailer app customer list (renders = column exists, because that endpoint has been select-all since the growth client shipped 08-17) or run `SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='usual_size';` — do NOT trust `_prisma_migrations` (055–058 batch was applied via SQL Editor out-of-band). If absent: apply `058_customer_usual_size/migration.sql` (plain nullable `ALTER TABLE customers ADD COLUMN usual_size TEXT` — no backfill, safe any time) before launch. |

Action: owner runs `list_migrations` (or admin dashboard migration view) against
prod and diffs against `packages/db/prisma/migrations/`.

### 8.3 Rate limiter — ✅ **FIXED (commit `d4f7f99a`, 2026-08-11)** — no longer a blocker

The §0a bypass is closed — verified in current code, not assumed
(`apps/api/src/index.ts:128-137`): the global `@fastify/rate-limit` now keys on
`request.ip` only. The client-supplied `x-retailer-id` key generator is gone
(the comment at the call site documents why), so no route can bypass by rotating
that header. Supporting layers, all confirmed present:

- **Admin login brute-force:** per-route `max: 5 / 15 min` override
  (`routes/admin.ts:59-62`), now genuinely per-IP.
- **OTP SMS-bomb / brute-force:** per-phone 60s send cooldown (SET NX) + max 5
  verify attempts with an atomic GETDEL lock (`lib/msg91-otp.ts`), shared by
  `/v1/auth/otp/*` and the passport step-up flow.
- **Real client IP behind the proxy:** `trustProxy` is on in production
  (`index.ts:63-65`), so `request.ip` is not Railway's internal 10.x LB address.

No code change needed for launch on this item.

### 8.4 MSG91 SMS delivery — account-side, may still be pending

Per `CLAUDE.md`: code is correct and live. Real API-path SMS delivery was blocked
on **DLT sender-ID registration** (TRAI requirement, 2–7 working days). Confirm
the sender ID is now DLT-registered, or OTP SMS won't arrive on the API path.
The MSG91 *widget* flow (mobile EAS build) bypasses this.

### 8.5 Play Store listing — owner tasks

`docs/PLAY-STORE-LISTING.md` has paste-ready copy. Still owner-only:
- 8 screenshots (shot-list + routes in the doc)
- 1024×500 feature graphic
- Play Console app entry + Data Safety form (declares Location — optional
  store-pin re-added in `b4270e4`)
- Upload production `.aab` to Internal testing

### 8.6 Marketing prose — ✅ done 2026-09-03

VTO / "Fashion DNA matching" / showroom claims scrubbed from `pricing`,
`for-retailers`, `how-it-works`, `MarketingSections.tsx` (`1675f28`). DPDP
passport notice URL fixed to `kanchuki.app/privacy` (`182c5bf`).

---

## 9. Remaining "do this next" list (owner)

1. ✅ **Done** — `packages/ai/vitest.config.ts` committed `99401fa` (§4 message) and pushed to `origin/chore/api-lint-rules`.
2. ✅ **Done** — full `env -u DATABASE_URL pnpm test` green locally before pushing (§5).
3. ⏳ **[CI]** Watch the new run: `quality` green → then `build` + `e2e-web` (unproven this cycle). Fix any new hidden layer the same way.
4. **[merge]** All 4 checks green → `gh pr merge 23 --squash --delete-branch`. Confirm `main` CI goes green. Watch the Railway auto-deploy once.
5. **[secrets]** B-003 + B-004: run `scripts/generate-admin-hash.ts '<pw>' --totp`, set `ADMIN_PASSWORD_HASH` + `ADMIN_TOTP_SECRET` in Railway.
6. **[db]** Verify migrations 086/087/088 applied in prod + run `scripts/set-gst-profile.ps1`. Diff prod migrations vs repo.
7. ✅ **Done** — the admin-login / OTP rate-limiter bypass (§0a) has been fixed since 2026-08-11 (`d4f7f99a`); verified in code, no longer a blocker (§8.3).
8. **[mobile]** `eas build --profile preview` → APK → real-device test checklist (§7). Confirm MSG91 OTP send/verify works (DLT registered?).
9. **[mobile]** `eas build --profile production` → `.aab` → Play Console Internal testing → smoke test through the Play link.
10. **[store]** Screenshots + feature graphic + Data Safety form + submit.
11. **[infra, lower pri]** B-002 real read replica.

---

## 10. Files changed by PR #23 (full list, after §4 commit)

```
biome.json                                            # base commit — lint rule downgrade
scripts/check-route-size.sh                           # grandfather allowlist
apps/web/src/app/social/connect/page.tsx              # apiFetch full-URL
apps/web/src/app/social/connect/callback/page.tsx     # apiFetch full-URL
packages/db/vitest.config.ts                          # NEW — dummy DATABASE_URL
packages/ai/vitest.config.ts                          # NEW — dummy DATABASE_URL (commit 99401fa)
docs/tasks/2026-09-03-ci-pr23-and-launch-checklist.md # NEW — this file (commit alongside 99401fa)
apps/api/src/jobs/purge-retailer-now.test.ts          # mock: add prisma sentinel
apps/mobile/src/components/__snapshots__/ProductCard.test.tsx.snap   # regenerated
+ the ~60 src/ files from the base biome-format/lint commits already on the branch
```

No production runtime code changed by this session's commits — CI script, test
configs, test mock, and 2 web files switched to an equivalent absolute-URL form.

---

## 11. Task tracker — current branch work + pre-launch owner items

> Added 2026-09-03 (after §3.1's follow-up "split the 5 files" was started on
> this branch). Statuses are live — ticked off as each lands. **T1–T5 are
> agent-doable; T6+ are owner-only** (prod/account access).

### T1 — Finish the 5-file route-module split (§3.1 follow-up, on this branch)

| Task | Status |
|------|--------|
| Split `billing.ts` → `billing/` (4 modules + helpers) | ✅ done, verified (tsc clean, 38/38 tests, allowlist entry dropped) — **uncommitted** |
| Split `growth/growth-campaigns.ts` → `growth-campaigns/` (4 modules + helpers) | ✅ done, verified (tsc clean, 16/16 growth tests, allowlist entry dropped) — **uncommitted** |
| Split `public/passport.ts` → `passport/` (7 modules + helpers) | ✅ done, verified (tsc clean, 45/45 passport tests, allowlist entry dropped) — **uncommitted** |
| Split `public/public-retailers.ts` → `public-retailers/` (4 modules) | ✅ done, verified (tsc clean, 52/52 public tests, allowlist entry dropped) — **uncommitted** |
| Split `retailers/retailers-social.ts` → `retailers-social/` | ✅ done (barrel + connect/accounts/posts + helpers, 4 modules), verified (api tsc clean, vitest 55 files/706 tests, biome lint exit 0 — only baseline warn rules) — **uncommitted** |
| Drop the last allowlist entry (`retailers-social.ts`, 889) from `check-route-size.sh` | ✅ done — allowlist removed entirely; guard comment now says it's empty |
| Delete scratch slicer `scripts/_tmp-split-route-modules.cjs` | ✅ done — no `scripts/_tmp*` files remain |

### T2 — Verify the split (guard + typecheck + tests), commit + push

| Task | Status |
|------|--------|
| `bash scripts/check-route-size.sh` → no grandfather lines left | ✅ exit 0 — no file over 800 lines, allowlist empty |
| `apps/api` tsc + vitest full run + biome on new modules | ✅ tsc clean; vitest 55 files / 706 tests pass; biome lint exit 0 on the 5 split dirs + barrels (39 warnings, all baseline `warn` rules) |
| Commit (split modules, spec fixes, doc) + push to `chore/api-lint-rules` | ⬜ awaiting go-ahead — everything above is **uncommitted** |

### T3 — Land the e2e-web spec fixes (hidden layer after `build` went green)

| Task | Status |
|------|--------|
| `admin-commission.spec.ts` — frozen clock (spec asserted "August 2026", page defaults to current month) | ✅ fixed — **uncommitted** |
| `admin-navigation.spec.ts` — sidebar redesigned to hover-groups; spec still expected flat links + stale "Plans" group epilogue | ✅ fixed (hover-gutter nudge, keyboard-activation, 15s heading waits) — **uncommitted** |
| `admin-navigation.spec.ts` — second hidden failure: `/v1/admin/plan-pricing` (fetched alongside plan-limits) hit the mock catch-all → `{ data: {} }` → page threw `pricingData is not iterable` → "Admin page crashed" | ✅ fixed — added `respond([])` mock for `/admin/plan-pricing` (page now renders; was a consistent 1.3m failure before) — **uncommitted** |
| Run `apps/web` admin e2e suite green locally (was flaky under cold `next dev` compiles) | ✅ stable — double-run of both admin specs: 6/6 passed, run 1 (1.4m) + run 2 (1.0m); nav spec itself 24.4s / 26.8s / 19.5s across runs |

### T4 — Watch CI to full green on the pushed head

| Task | Status |
|------|--------|
| `quality` job | ✅ green (run 33719613755) |
| `build` job (first green this cycle) | ✅ green (run 33719613755) |
| `unit-web` job | ✅ green (run 33719613755) |
| `e2e-web` job → re-run after T3's spec fixes | ✅ **GREEN — run 33734134223, first e2e-web green this cycle.** Path: run 33730252219 failed its first ever execution (customer suite, never run before) on stale locators: (1) "Festive Edit" asserted as a heading but the Discovery redesign renders it as a `<p>` summary line; (2) "Selected (N)" sticky bar removed (heart flip is the feedback); (3) size chips left the bottom sheet (now on SharedProductPage) — sheet probes switched to its "Enquire Now" CTA. Fixed in `c3adf21` + verified `pnpm test:e2e:all` = admin 6/6 + customer 3/3; dead-export one-liner rode along in `668a36a`. All four checks green on `668a36a`. |

### T5 — Merge PR #23 (owner go-ahead)

| Task | Status |
|------|--------|
| All 4 checks green → `gh pr merge 23` | ⬜ |
| Confirm `main` CI green + watch Railway auto-deploy once | ⬜ |

### T6 — Secrets / infra (owner-only; see §8.1)

- [ ] B-003 + B-004: `npx tsx scripts/generate-admin-hash.ts '<pw>' --totp` → set `ADMIN_PASSWORD_HASH` + `ADMIN_TOTP_SECRET` in Railway (API service)
- [ ] B-002 (low pri): real Supabase read replica → point `DATABASE_URL_REPLICA` at it

### T7 — Prod DB migrations (owner-only; see §8.2)

- [ ] Run the 058 ground-truth check (`SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='usual_size';` or open the retailer customer list) → apply `058_customer_usual_size/migration.sql` if absent
- [ ] Verify 069 / 082 / 083 applied in prod
- [ ] Apply 086 → 087 → 088 (088 creates `platform_gst_profile`) + run `scripts/set-gst-profile.ps1`

### T8 — MSG91 / mobile / store (owner-only; see §8.4, §8.5, §7)

- [ ] Confirm MSG91 DLT sender-ID registration (API-path OTP SMS)
- [ ] `eas build --profile preview` → APK → real-device checklist (§7) — incl. MSG91 widget OTP + social-connect round-trip
- [ ] `eas build --profile production` → `.aab` → Play Console Internal testing → smoke test
- [ ] Play Store: 8 screenshots + 1024×500 feature graphic + Data Safety form + submit
