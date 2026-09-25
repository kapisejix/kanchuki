# Docs Re-organization — Execution Plan (hand-off for a new session)

**Status:** ✅ Done — Phases 1–8 + the after-delete work executed 2026-09-23 (`6fcfbe2a`, PR #39). Phase 9 (shrink PRO-REQUIREMENTS/PLAN) done 2026-09-24. The DELETE tables below keep the **pre-move** paths on purpose — they are the record of what was removed.
**Branch:** `docs/reorganize` (created from `origin/main` 2026-09-23). Work ONLY on this branch → one PR. Never merge it yourself.
**Owner decisions (final, 2026-09-23 — do not re-ask):**
1. Separate `docs/reorganize` PR (not #37/#38).
2. One history log only → `BUILD-LOG.md`. `PROGRESS.md` is frozen into history.
3. AI Studio images must NOT be in git. Organize them in `docs/ai-studio/` and gitignore the images (HTML + .md stay tracked).
4. CLAUDE.md: update the **Project File Index** only — new paths + a one-line description each. Add the root-cause rule (Phase 6). No other CLAUDE.md content change.
5. Keep folders: `content`, `marketing`, `database`, `design`, `customers`, `ai-studio` (= photos), `tasks` (`pending/` + `done/`), `root-cause`, `references` (holds guides, research, adrs, history). Goal: few files in `docs/` root.
6. **Do NOT delete any old file/folder.** Copy/organize only. At the end, deliver a KEEP / DELETE list (Phase 8) — the owner decides and approves deletion later.

**Hard safety rules:** app is under Play Store review — no app behaviour change. No merge, no deploy, no DB writes. `docs/PLAY-STORE-RELEASES.md` never moves (CI gate `scripts/check-android-version-code.mjs` reads it). Script path edits (Phase 7) happen only after deletion is approved.

---

## Target structure

```
docs/
├── README.md                 index + rules (Phase 5)
├── PRO-REQUIREMENTS.md       main — shrink later (Phase 9, after deletion approval)
├── PLAN.md                   main — shrink later (Phase 9)
├── TECH-STACK.md  API.md  SECURITY.md (§12-18 untouched)  SCALING.md  DEPLOY.md
├── BUILD-LOG.md              the ONE history log, append-only
├── PLAY-STORE-RELEASES.md    stays at root (CI)
├── tasks/
│   ├── README.md             task board (pending + done), Phase 5
│   ├── reorganize-files-folders-structure.md   this file
│   ├── pending/              open work, one file per feature/task
│   └── done/                 specs of built features
├── content/                  website copy (unchanged, code comments reference it)
├── marketing/                marketing-sales-enablement.md (13 files merged), india-retailer-growth.md, hyperlocal-marketing-ideas.md
├── database/                 DATABASE.md, db-structure-report-2026-08-22.md
├── design/                   DESIGN.md, emil-design.md, design-review-2026-08-20.md, screens/*.jpg
├── customers/                customer-profile.md, shopper-passport-identity.md
├── ai-studio/                README, 4 HTML catalogs, ghost-mannequin research, chatgpt-style-commands.md, history/, images (gitignored)
├── root-cause/               root-cause issues.md + README (pre-production regression checklist)
└── references/
    ├── guides/               infra, hosting, meta-fb login, play-store listing/checklist, ai-prompting (was MEMORY.md), skills-and-mcp, deepseek
    ├── research/             final-research, phase-1 assistant, platform blueprint, international, feature-ideas, survey html
    ├── design-inspiration/   marketing-landing, mobile-ui-ux
    ├── adrs/                 ADR-006
    └── history/              frozen: reports/, sessions/ (incl. PROGRESS.md), superseded/, executed-plans/
```

---

## Phase 1 — Copy into new structure ✅ MOSTLY DONE (verify, don't redo)

Already copied (originals untouched) — verify each exists with `ls`:

| New path | Source |
|---|---|
| tasks/pending/ai-photo-generation.md | tasks/ai-photo-generation.md |
| tasks/pending/ai-credit-billing-model.md | tasks/api-rate-limit.md |
| tasks/pending/coupon-codes.md | tasks/coupon-codes.md |
| tasks/pending/customer-pwa-push-notifications.md | tasks/customer-pwa-store-list-and-push-notifications.md |
| tasks/pending/customer-engagement-analytics.md | tasks/customer-engagement-and-admin-behavior-analytics.md |
| tasks/pending/whatsapp-managed-sending.md | tasks/whatsapp-embedded-signup-managed-sending.md |
| tasks/pending/multi-language-i18n.md | tasks/M-MULTI-LANGUAGE-AI-GAPS.md |
| tasks/pending/ghost-mannequin.md | extracted PRO-REQUIREMENTS F-001e (lines 182–203) |
| tasks/pending/plan-switch-prorated.md | extracted PRO-REQUIREMENTS "Mid-cycle Plan Switching" (901–921) |
| tasks/pending/ratings-reviews.md | extracted PRO-REQUIREMENTS §10.12 F-021 |
| tasks/pending/google-business-profile-autopost.md | extracted PRO-REQUIREMENTS §10.13 F-022 (ON HOLD) |
| tasks/pending/social-publishing-phase-3.md | extracted PRO-REQUIREMENTS §23.5 |
| tasks/pending/launch-readiness.md | NEW — open items from launch audit + checklists |
| tasks/done/suits-designs.md, social-create-post-composer.md, staff-invite-tokens.md, team-member-access-control.md, subscription-gst-and-monthly-pricing.md, return-to-post-login-redirect.md | tasks/ (same names) |
| tasks/done/whatsapp-catalog-sync.md | tasks/PHASE-II-WHATSAPP-CATALOG-BREAKDOWN.md |
| tasks/done/size-fit.md / campaign-analytics-seasonal.md / ab-testing-variant-links.md | tasks/N-… / R-… / S-… |
| tasks/done/staff-assisted-catalog-upload.md | staff-retailer.md |
| tasks/done/social-connect-native.md | social-connect-native.md |
| database/DATABASE.md, database/db-structure-report-2026-08-22.md | DATABASE.md, database/database-22-August.md |
| design/DESIGN.md, design/design-review-2026-08-20.md, design/screens/*.jpg (8) | DESIGN.md, design/these-changes.md, design/*.jpg |
| customers/customer-profile.md, customers/shopper-passport-identity.md | customer/* |
| marketing/hyperlocal-marketing-ideas.md, marketing/india-retailer-growth.md | customer/marketing-ideas.md, INDIA-RETAILER-GROWTH.md |
| marketing/marketing-sales-enablement.md | 13 marketing/*.md concatenated (894 lines, sources marked) |
| ai-studio/*.html (4), effect-photos/, models/, photoshoots/{backgrounds,models,style-output,samples}/ | tasks/*.html, tasks/effect-photos, tasks/models, photoshoots/** |
| ai-studio/chatgpt-style-commands.md, ghost-mannequin-research.{md,html}, history/* (6) | photoshoots/ChatGPT-style.md, photo-feature/* |
| references/design-inspiration/*, adrs/*, research/* (6), guides/* (8) | references/*, adrs/*, root research docs, root guides, tasks/deepseek-thinking-mode.md |
| references/history/reports/* (9), sessions/* (7 incl. PROGRESS.md), superseded/catvton-training.md, executed-plans/ | root reports, dated tasks/ logs, TRAINING.md, superpowers/ |

**Remaining in Phase 1:** ✅ DONE 2026-09-23
- [x] `ai-studio/` HTML relative paths — verified, all resolve from the new folder:
  - `AI Studio Effects.html` — `effect-photos/${path}.jpg` → 8/8 `effect-photos/models/*` + 23/23 `effect-photos/products/*` present; `effect-photos/previews/` empty **by design** (bench-generated later; the page renders a "no photo yet" placeholder, never a fake).
  - `AI Models and Scenes.html` — `models/*.png` → 6/6 present in `ai-studio/models/` (was `docs/tasks/models/`).
  - `AI Motion Styles.html` — images are external Unsplash URLs, no local dependency.
  - `ghost-mannequin-research.html` — no image refs.
  - `AI Cost Comparison.html` — loads a **sibling** `bench-results.js`, which `scripts/save-bench.mjs` generates (absent until a bench run → the results section renders empty). Its own prose still names the OLD paths (`docs/tasks/effect-photos/preview/`, `docs/tasks/bench-results.js`) → already on the Phase 8 after-delete sed list. **No action now.**
- [x] Coverage check (md5 of every old tracked file vs every new-tree file): **247 old files, 229 new**. All 25 non-matching are accounted for, so **nothing was missed and no genuine gap exists**:
  - 9 root main docs stay at `docs/` root (`API`, `BUILD-LOG`, `DEPLOY`, `PLAN`, `PLAY-STORE-RELEASES`, `PRO-REQUIREMENTS`, `SCALING`, `SECURITY`, `TECH-STACK`) — intentional.
  - `root-cause/root-cause issues.md` stays in place — intentional.
  - 13 `marketing/*.md` stubs → merged into `marketing/marketing-sales-enablement.md` (all 13 confirmed present as marked sections; the 14th, `WIRING-AUDIT-2026-08-20.md`, is byte-identical to `references/history/reports/2026-08-20-marketing-wiring-audit.md`) — intentional.
  - `tasks/AI Models and Scenes.hmtl` — the known typo duplicate — intentional.
  - `design/emil-design.md` — **already at its target path** (`design/` was its home and stays its home); it never needed a copy. So `design/` holds DESIGN.md + emil-design.md + design-review-2026-08-20.md + screens/ (8 jpg) as specified.

## Phase 2 — Gitignore AI Studio images ✅ DONE
- [x] Added to root `.gitignore` (lines 105–110): `docs/ai-studio/**/*.jpg`, `*.jpeg`, `*.png`, `*.webp`, and `docs/ai-studio/**/out/` — with a comment explaining they are local-only. Note this also ignores the 6 `ai-studio/models/*.png` tiles and the `photoshoots/**` sets, per the owner decision that **no** AI Studio image is committed.
- [x] Verified: `git check-ignore -v` matches all three sampled paths, and `git status --untracked-files=all docs/ai-studio` now lists **only** HTML + `.md` (no images). Old tracked images (`docs/photoshoots/`, `docs/tasks/effect-photos/`, `docs/tasks/models/`) are untouched and stay until deletion approval (then `git rm`).

## Phase 3 — Review every tasks/ file: status correct? ✅ DONE
Checked all 13 `pending/` + 13 `done/` files against code and `git log`. **One was misfiled; the rest were correctly placed but 6 had stale or missing status headers.**
- [x] **MOVED:** `pending/ratings-reviews.md` → `done/ratings-reviews.md`. F-021 is **fully built**: migration `072_product_store_ratings`, `ProductReview`/`StoreReview` models, retailer API + admin API + public API (all three registered), mobile moderation screen `app/growth/ratings.tsx` (linked from the Growth Hub), admin page `/admin/ratings`, and customer-web `ReviewList`/`StarPicker`. Its extraction header said "PENDING (post-launch)" — that came from the old PLAN "post-MVP" note, not from the build state. Residual (surfacing ratings in the newer PWA personalisation surfaces) is tracked in `customer-engagement-analytics.md`, not as a gap here.
- [x] **`customer-pwa-push-notifications.md`** — header claimed "research & roadmap only, no code started". **Phase A is built** (2026-09-17: `/my-stores`, install CTA, `start_url`, the `/login`+`return_to` work, `/stores` entry point). Rewrote the header: Phase A ✅, Phases B–D 🔴. Stays in `pending/`.
- [x] **`ai-credit-billing-model.md`** — "design only — no code written" was too strong: the **admin addon-pack half is live** (migration `089_resource_packs` applied, CRUD API, `/admin/resource-packs`). Retitled to "design only + admin half built". Stays in `pending/`.
- [x] **`ai-photo-generation.md`** — had no single `**Status:**` line (only a legend), so it was unreadable at a glance. Added one: F-032 A ✅, F-032 B / F-034 retailer 🔴, garment-conditioned rebuild 🧪 built, owner actions (migrations `104`/`105` + engine choice) open. Stays in `pending/`.
- [x] **`customer-engagement-analytics.md`** — normalised to "Phase 1 ✅ built (migration `100`) / Phases 2–4 🔴 not started". Stays in `pending/`.
- [x] **`multi-language-i18n.md`** — normalised to "🟡 partial — pending", and flagged that migration `063`'s applied state is **contradicted across docs** (see Phase 4 #3). Stays in `pending/`.
- [x] **`done/social-connect-native.md`** — normalised: code is done; the real-device/Meta-dashboard verification is carried in `launch-readiness.md` rather than left ambiguous here.
- [x] Confirmed-correct as-is: `coupon-codes` (📋 spec), `ghost-mannequin` (🔴 P2), `google-business-profile-autopost` (⏸ on hold), `plan-switch-prorated` (🔴), `social-publishing-phase-3` (🔴), `whatsapp-managed-sending` (🔴 post-launch), `launch-readiness` (🟡 open), and all 12 other `done/` files.
- [x] `launch-readiness.md` gained 3 items found during this pass: verify migration `063`, the Facebook-native connect real-device check, and the first live-provider AI Studio run.

## Phase 4 — Settle doc conflicts (read-only checks, then fix the NEW copy) ✅ DONE
| # | Conflict | Check |
|---|---|---|
| 1 | Partner Network built vs "schema broken" (CLAUDE #47 vs PLAN.md) | `npx prisma validate`, grep `PARTNER_NETWORK`, `apps/mobile/app/growth/partners.tsx` |
| 2 | Migration 058 applied? (CLAUDE #44 "NOT applied" vs size-fit.md "applied") | `_prisma_migrations` via Supabase MCP (read-only SELECT) |
| 3 | Migration 063 applied? | same |
| 4 | PLAN Phase 1 = Fashion DNA + VTO — removed 2026-08-31 | fix in Phase 9 |
| 5 | PRO-REQ describes VTO/Fashion DNA/checkout as live | fix in Phase 9 |
| 6 | Marketing "100% done" vs "0 wired" | grep apps/mobile + apps/web for each feature's screen; record real status at top of marketing-sales-enablement.md |
| 7 | india-retailer-growth.md lists referrals/bookings/size-recommend as built — removed | mark removed in the new copy |

### Phase 4 results (all 7 settled — code-checked 2026-09-23) ✅ DONE

| # | Verdict | Evidence |
|---|---|---|
| 1 | **Partner Network is REMOVED, not built.** And there is no "broken schema" — `npx prisma validate` returns **valid**. The 2026-08-31 teardown (migration `082`) dropped `partners`/`partner_referrals`/`partner_events`, the `PartnerType`/`CommissionType`/`PartnerReferralStatus` enums, its plan rows, `retailers-partners/`, `admin-partners.ts`, web `admin/partners/` and `growth/partners.tsx`. The dead `PlanFeatureKey.PARTNER_NETWORK` value is **intentionally retained** (migration `082`'s own closing note). CLAUDE.md rows 46/47 still say "✅ Built" — **stale, reported in Phase 8, not edited** (CLAUDE content needs owner approval). | `npx prisma validate` ✅ valid; `grep PARTNER_NETWORK` → only the enum value in `schema.prisma`; `ls apps/mobile/app/growth/` → no `partners.tsx`; migration `082` lines 1–4, 49, 66–68 |
| 2 | **Migration 058 IS APPLIED.** CLAUDE row 44's "NOT applied" is stale. Ground-truth check already on record: the 2026-09-03 launch audit returned a row from `information_schema.columns` for `customers.usual_size`. `done/size-fit.md` ("058 applied") was right. | `references/history/sessions/2026-09-03-ci-and-launch-checklist.md` line 404: *"**058** — ground-truth check returned a row → `customers.usual_size` exists; no action needed"* |
| 3 | **UNRESOLVED — could not verify, no DB access from this session.** `BUILD-LOG.md` §50 says "migration 063 **NOT** applied"; `marketing/india-retailer-growth.md` says 063 applied and verified; `M-MULTI-LANGUAGE-AI-GAPS.md` says not yet applied. No ground-truth check exists for 063 (unlike 058). **Owner must run:** `SELECT 1 FROM information_schema.columns WHERE table_name='retailers' AND column_name='preferred_locale';`. Same failure class as 058 — a missing column 500s any select-all retailer query. Flagged in `pending/launch-readiness.md` + corrected in the growth doc. | Two docs say no, one says yes, zero ground truth |
| 4 | Confirmed stale: `PLAN.md` Phase 1 still lists Fashion DNA + VTO, both removed 2026-08-31. **Deferred to Phase 9** as planned. | PLAN.md line 35 area + teardown doc |
| 5 | Confirmed stale: `PRO-REQUIREMENTS.md` describes VTO / Fashion DNA / checkout as live. **Deferred to Phase 9.** | Same |
| 6 | **The merged marketing doc had 7 wrong statuses** (all inherited from the 2026-08-20 "not wired" audit). Real status: **BUILT** — Local Discovery, AI Social Templates, Aggregator Sync, Direct Social Publishing, GMB, FB Local Awareness Ads, Google Local Service Ads, GST Reports. **REMOVED** — Smart Incentive Engine, Festival Backgrounds, Lookbook Generator, Partner Network. Added a code-checked status table at the top of `marketing-sales-enablement.md` **and** corrected all 7 per-feature `**Status:**` lines. Also: the `services/*` orphan stubs the audit referenced no longer exist (only `fashion-vtone`, `photo-cleanup`, `training` remain). | `routes/public/near-me.ts`; `SocialTemplate`/`PostTemplate`/`ChannelSync` models; migrations `070`/`091`; `retailers-integrations.ts` (gmb/fb-ads/google-ads routes); `growth/integrations/*.tsx`; `growth/{aggregators,gst}.tsx`; admin pages `social-templates`/`post-templates`/`aggregators`/`discovery`/`integrations` |
| 7 | Fixed in the new copy: `india-retailer-growth.md` body sections **C (Referrals)**, **K (Suppliers)** and **L (Bookings)** still read "✅ Built" — now ❌ REMOVED 2026-08-31 with the built-then-deleted history kept. **N (Size & Fit)** corrected to ⚠️ PARTLY REMOVED (size-chart engine gone; usual-size capture + plus sizes stay). The top status line's "060–063 applied" claim corrected to 060–062 verified + 063 unverified. | migration `082` drops `referrals`/`referral_credits`/`suppliers`/`supplier_transactions`/`bookings`/`size_charts`/`size_chart_rows`; `database/no-feature-want.md` §Cluster E |

CLAUDE.md content fixes = **ask owner first** — collected in the Phase 8 report.

## Phase 5 — Index files (short) ✅ DONE
- [x] `docs/README.md` — folder map (one line per main file/folder) + the 7 documentation rules + a note that old paths still exist pending deletion approval. Includes the ⚠️ **never move `PLAY-STORE-RELEASES.md`** warning next to the CI gate.
- [x] `docs/tasks/README.md` — board table (`task | file | status | blocker/decision needed`): 12 pending rows then 13 done rows, plus a pointer to this plan file.
- [x] `docs/ai-studio/README.md` — what each HTML catalog is, every image folder, the "images are gitignored / `previews/` is empty on purpose, never a fake" rule, and the three scripts that read/write the folder with their **current → future** paths.
- [x] `docs/references/README.md` — one line per subfolder + a currency column (`history/` = never current truth).

## Phase 6 — Root-cause folder as pre-production test source ✅ DONE
- [x] `docs/root-cause/README.md` written: (a) **the rules** — read the tracker for the area before editing; one `RC-###` per ROOT CAUSE not per symptom; all five parts required (Component/Commit/Symptom/Root cause/Fix/Proof); add the CLAUDE row + cite the RC in the commit; (b) **the pre-production regression checklist** — all 27 shipped RCs (RC-001…RC-027), each with a one-line "how to re-test" and its real test file where one exists.
- [x] Every named test file was verified to exist on disk in this session. Only correction: RC-002's test is at `apps/api/src/routes/growth/growth-ai-campaign.test.ts` (not `routes/`).
- [x] Marked the rows a green CI run **cannot** prove as **Manual** — they need a real device/browser: RC-015 (double-tap OTP), RC-016 (FB disconnect/reconnect), RC-018 (one-tap FB continue), RC-020 (Android autofill OTP), RC-021 (one SMS, one sender), RC-023 (composer link default), plus the first live-provider AI Studio run on RC-027.
- [x] Recorded the **known-residual, deliberately-not-fixed** items so nobody "repairs" them by mistake (RC-019's removed assertion, RC-025's `ip_hash` residual, RC-018's not-a-code-defect note).
- [x] **Missing RC IDs — found RC-028 … RC-038 (eleven), not just RC-038.** All are referenced in commit messages and **none is an entry in the tracker**. All eleven live on **unmerged branches** — RC-028…RC-037 on `chore/remove-text-to-image-studio-engines` (the retailer-affiliate/referrals program T1–T9 + purge/RLS fixes, 2026-09-22/23) and RC-038 on `fix/e2e-customer-my-stores` (`91ae9916`, the 204→503 proxy bug). `git merge-base --is-ancestor <sha> origin/main` returns false for all of them, and `git log origin/main | grep -c 'RC-02[89]|RC-03[0-8]'` = **0**. By the folder's own rule ("every bug **that ships**") they are correctly absent — so the README lists them in a table with branch + commit and the instruction: **add them when those branches merge, and never renumber them** (the IDs are already spoken for in commit messages).

## Phase 7 — CLAUDE.md (owner approved: paths + short descriptions only) ✅ DONE
- [x] Replaced the **Project File Index** table (lines ~336–352) with the new structure — 20 rows, one per main file/folder, one-line description each. New paths are used everywhere (`docs/README.md`, `docs/DEPLOY.md`, `docs/tasks/`, `docs/root-cause/`, `docs/ai-studio/`, `docs/marketing/`, `docs/database/`, `docs/design/`, `docs/customers/`, `docs/content/`, `docs/references/`).
- [x] Added the required rule line on the `docs/root-cause/` row: *"check before any development edit; re-test every RC before production"*.
- [x] Retained the ⚠️ **never move `docs/PLAY-STORE-RELEASES.md`** warning (CI gate reads that exact path).
- [x] **No other CLAUDE.md section touched** — not the What's-Built feature index, not the RC table, not the Operational Control Policy. Feature-index rows still pointing at old paths (and the stale rows found in Phase 4) are deliberately left for the deletion phase (sed) + an owner decision.

## Phase 8 — Deliver KEEP / DELETE list (then STOP) ✅ DONE — commit `150a1352`, pushed, draft PR #39
Write it as a section at the bottom of this file, and summarise in chat:
- **KEEP:** every new-tree path, one-line summary each (what it holds, size, status).
- **DELETE (after approval):** every old path now duplicated, with its new location. Includes the 2 true duplicates: `AI Fashion Sales Assistant - Phase 1.txt` (= `.md`), `tasks/AI Models and Scenes.hmtl` (old copy of `.html`), and old folders `customer/ database/database-22-August.md marketing/<13 stubs> new-updates/ photo-feature/ photoshoots/ references/*.md superpowers/ survey/ adrs/` + old root files + old `tasks/*` files.
- **After-delete work list** (not done now): `git rm` old paths; sed old paths in ~70 code comments + ≈527 doc cross-links + CLAUDE.md feature rows; update `scripts/save-bench.mjs` (→ `docs/ai-studio/bench-results.*`) and `scripts/studio-shoot-demo.mjs` (`OUT_DIR` → `docs/ai-studio/photoshoots/out`); `git grep` proves zero stale paths; run `pnpm lint` + `node scripts/check-android-version-code.mjs`.
- Commit (docs-only, message references this file), push `docs/reorganize`, open a **draft** PR. Do not merge.

## Phase 9 — Shrink PRO-REQUIREMENTS + PLAN ✅ DONE 2026-09-24
- [x] `PRO-REQUIREMENTS.md` 2,957 → 255 lines: scope, users, a feature-status index (every F-### → status → `tasks/` spec or archive §), NFRs, GST, pricing, data, integrations. VTO / Fashion DNA / checkout / orders now shown as ❌ removed (Phase 4 #5).
- [x] `PLAN.md` 359 → 108 lines: phase status table, post-launch "Next" list linking `tasks/pending/`, scaling, milestones, risks, budget. Old Phase 1 (VTO + Fashion DNA) and checkout plan dropped (Phase 4 #4).
- [x] "Nothing deleted without a home": both originals preserved byte-for-byte in `references/history/superseded/{PRO-REQUIREMENTS,PLAN}-full-2026-09-24.md`. Chosen over splitting ~30 built-feature specs into `tasks/done/` — built features already have BUILD-LOG entries, and ~100 existing "PRO-REQUIREMENTS §N / F-xxx" citations (incl. immutable migration SQL comments) keep resolving through the index rows + the archive without being rewritten.

Original scope:
Shrink `PRO-REQUIREMENTS.md` (≤400 lines: scope + feature status table linking `tasks/`) and `PLAN.md` (≤150 lines, removed features dropped). Detail goes to `tasks/done/` or `tasks/pending/`; nothing deleted without a home.

---

## Phase 8 — KEEP / DELETE list ✅ (this is the decision you asked for)

**How this was produced (reproducible):** take the *pre-session* file list with `git ls-tree -r --name-only a0fafafe -- docs` — `a0fafafe` is `origin/main`'s tip, i.e. the tree before any of this session's work — then md5 each of those files and match the hashes against every file now on disk under `docs/`. It must be run **after** the commit so the new tree is on disk to match against; running `git ls-files` instead would be wrong, because it picks up the newly-added files and contaminates both sides of the comparison.

**Result: 247 old docs files (excluding `docs/content/`) — 214 have a byte-identical copy at a new path, 33 do not.** Those 33 are each individually accounted for below, and the tally is exact:

| Why no identical copy | Count | Files |
|---|---|---|
| **Deliberately kept in place** — these *are* the new tree; they never moved, so there is nothing to copy | **11** | the 9 root docs (`API`, `BUILD-LOG`, `DEPLOY`, `PLAN`, `PLAY-STORE-RELEASES`, `PRO-REQUIREMENTS`, `SCALING`, `SECURITY`, `TECH-STACK`) + `design/emil-design.md` + `root-cause/root-cause issues.md` |
| **Moved and edited on the way** | **3** | `Retailer → Customer AI Fashion Commerce Platform.md` → `references/research/platform-architecture-blueprint.md` (retitled); `INDIA-RETAILER-GROWTH.md` → `marketing/india-retailer-growth.md`; `social-connect-native.md` → `tasks/done/social-connect-native.md` |
| **Marketing stubs MERGED into one file** (content concatenated with `<!-- source: … -->` markers, so no single stub survives byte-for-byte) | **13** | `IMPLEMENTATION-STATUS`, `aggregator-marketplace-sync`, `ai-driven-social-media-templates`, `automated-festival-background-library`, `automated-lookbook-generator`, `direct-social-publishing`, `facebook-local-awareness-ads`, `google-local-service-ads`, `google-my-business`, `local-discovery-engine`, `marketing-sales-enablement-overview`, `partner-network-manager`, `smart-incentive-engine` |
| **Task files edited this session** (status headers corrected) | **5** | `ai-photo-generation`, `api-rate-limit`, `customer-engagement-and-admin-behavior-analytics`, `customer-pwa-store-list-and-push-notifications`, `M-MULTI-LANGUAGE-AI-GAPS` |
| **Superseded by a correctly-spelled copy** | **1** | `tasks/AI Models and Scenes.hmtl` (typo'd extension) → `ai-studio/AI Models and Scenes.html` |
| | **33** | ✓ sums exactly |

**Nothing was missed, and nothing is unaccounted for.** The 214 identical ones are the safe deletions — taking them out cannot lose anything.

> **Note on image paths:** the `docs/ai-studio/**` image copies are now gitignored, so they no longer appear in `git status` — which is exactly why they show as "unmatched" in a hash pass. **The files are on disk** (148 files under `docs/ai-studio/`: 14 tracked + 134 gitignored images). `git rm` will still work on the old tracked ones because they are already in the index.

---

### ✅ KEEP — the new tree (100 tracked docs files + 134 gitignored images)

**Root — main docs (12, all stay exactly where they are)**

| Path | Holds | Status |
|---|---|---|
| `docs/README.md` | **NEW** — folder map + the 7 documentation rules | ✅ new this session |
| `docs/PRO-REQUIREMENTS.md` | Product requirements, user stories, acceptance criteria | keep — shrink in Phase 9 |
| `docs/PLAN.md` | Phase-by-phase roadmap | keep — shrink in Phase 9 |
| `docs/BUILD-LOG.md` | The only history log, append-only | keep |
| `docs/TECH-STACK.md` · `docs/API.md` · `docs/SECURITY.md` · `docs/SCALING.md` · `docs/DEPLOY.md` | Locked stack · API contracts · security model (§12–18 gated) · scaling plan · deploy flow | keep |
| `docs/PLAY-STORE-RELEASES.md` | versionCode/release history | ⚠️ **never move** — CI gate reads this exact path |

**Folders**

| Path | Holds | Size / status |
|---|---|---|
| `docs/tasks/README.md` | **NEW** — the work board (12 pending + 13 done rows) | ✅ new |
| `docs/tasks/pending/` | 12 open specs — ai-photo-generation, ai-credit-billing-model, coupon-codes, customer-engagement-analytics, customer-pwa-push-notifications, ghost-mannequin, google-business-profile-autopost, launch-readiness, multi-language-i18n, plan-switch-prorated, social-publishing-phase-3, whatsapp-managed-sending | 12 files, 0.20 MB, statuses corrected this session |
| `docs/tasks/done/` | 13 built-feature specs (incl. ratings-reviews moved here this session) | 13 files, 0.24 MB |
| `docs/tasks/reorganize-files-folders-structure.md` | this plan | — |
| `docs/root-cause/README.md` | **NEW** — the RC rules + the 27-RC pre-production regression checklist + the RC-028…RC-038 gap table | ✅ new |
| `docs/root-cause/root-cause issues.md` | The RC tracker itself (RC-001…RC-027) | unchanged, stays in place |
| `docs/ai-studio/README.md` | **NEW** — what each HTML/image folder is, the images-are-local rule, the 3 scripts that read it | ✅ new |
| `docs/ai-studio/` (HTML + md) | `AI Cost Comparison`, `AI Models and Scenes`, `AI Motion Styles`, `AI Studio Effects` (HTML) + `chatgpt-style-commands.md` + `ghost-mannequin-research.{html,md}` + `history/` (6 frozen pre-merge docs) | 14 tracked |
| `docs/ai-studio/` (images) | `effect-photos/{models 8, products 23, previews 0 (empty by design)}`, `models/` 6 PNG, `photoshoots/{backgrounds 25, models 14, samples 15, style-output 46}` | **134 images, gitignored** |
| `docs/marketing/` | `marketing-sales-enablement.md` (13 files merged, 894 lines + the new verified-status table), `india-retailer-growth.md`, `hyperlocal-marketing-ideas.md` | 3 files, 0.11 MB |
| `docs/database/` | `DATABASE.md` (schema/indexes/relationships) + `db-structure-report-2026-08-22.md` | 2 files |
| `docs/design/` | `DESIGN.md`, `design-review-2026-08-20.md`, `emil-design.md` (already home) + `screens/` (8 UI jpgs) | 1.34 MB |
| `docs/customers/` | `customer-profile.md` + `shopper-passport-identity.md` | 2 files |
| `docs/content/` | Website copy | **untouched** — code comments reference these paths |
| `docs/references/README.md` | **NEW** — one line per subfolder + a currency column | ✅ new |
| `docs/references/guides/` | infra-setup, hosting-and-app-store, meta-facebook-login-setup, play-store-listing, play-store-launch-checklist, ai-prompting (was `MEMORY.md`), skills-and-mcp, deepseek-thinking-mode | 8 files |
| `docs/references/research/` | final-research, ai-fashion-sales-assistant-phase-1, platform-architecture-blueprint (was `Retailer → Customer…`), international-expansion, feature-ideas-2026-07-30, retailer-pain-point-survey.html | 6 files |
| `docs/references/design-inspiration/` | marketing-landing, mobile-ui-ux | 2 files |
| `docs/references/adrs/` | ADR-006 (defer 3D parametric VTO — now moot, feature removed) | 1 file |
| `docs/references/history/` | **FROZEN** — `reports/` 9, `sessions/` 7 (incl. retired `PROGRESS.md`), `superseded/catvton-training.md`, `executed-plans/` 5 | 22 files, 0.67 MB |

**This session also edited (not merely copied):** `docs/marketing/marketing-sales-enablement.md` (added the code-checked status table + corrected 7 wrong per-feature statuses), `docs/marketing/india-retailer-growth.md` (marked 4 removed features + the 063 caveat), 6 task files (status headers), `docs/tasks/pending/launch-readiness.md` (+3 items), `CLAUDE.md` (Project File Index only), `.gitignore`, and this plan file.

---

### ❌ DELETE (after your approval)

**Everything below has its content preserved at the new location shown.** No file is deleted now.

**1. True duplicates — nothing new is lost at all (2)**

| Old path | Why | Successor |
|---|---|---|
| `docs/AI Fashion Sales Assistant - Phase 1.txt` | byte-identical to the `.md` right beside it | `docs/references/research/ai-fashion-sales-assistant-phase-1.md` |
| `docs/tasks/AI Models and Scenes.hmtl` | typo'd filename, superseded copy | `docs/ai-studio/AI Models and Scenes.html` |

**2. Old `docs/` root files — byte-identical copies exist (22)**

| Old path | New location |
|---|---|
| `docs/20-August-changes.md` | `docs/references/history/reports/2026-08-20-remaining-work.md` |
| `docs/26-night-report.md` | `docs/references/history/reports/2026-07-26-night-report.md` |
| `docs/AI Fashion Sales Assistant - Phase 1.md` | `docs/references/research/ai-fashion-sales-assistant-phase-1.md` |
| `docs/DATABASE.md` | `docs/database/DATABASE.md` |
| `docs/DESIGN.md` | `docs/design/DESIGN.md` |
| `docs/HOSTING-AND-APP-STORE-GUIDE.md` | `docs/references/guides/hosting-and-app-store.md` |
| `docs/INFRA-SETUP.md` | `docs/references/guides/infra-setup.md` |
| `docs/INTERNATIONAL-EXPANSION.md` | `docs/references/research/international-expansion.md` |
| `docs/LAUNCH-READINESS-AUDIT.md` | `docs/references/history/reports/launch-readiness-audit.md` |
| `docs/MEMORY.md` | `docs/references/guides/ai-prompting.md` |
| `docs/META-FACEBOOK-LOGIN-SETUP.md` | `docs/references/guides/meta-facebook-login-setup.md` |
| `docs/OTP-issue.md` | `docs/references/history/reports/2026-08-22-otp-issue.md` |
| `docs/PLAY-STORE-LAUNCH-CHECKLIST.md` | `docs/references/guides/play-store-launch-checklist.md` |
| `docs/PLAY-STORE-LISTING.md` | `docs/references/guides/play-store-listing.md` |
| `docs/PROGRESS.md` | `docs/references/history/sessions/PROGRESS.md` (frozen) |
| `docs/Retailer → Customer AI Fashion Commerce Platform.md` | `docs/references/research/platform-architecture-blueprint.md` |
| `docs/SKILLS-AND-MCP.md` | `docs/references/guides/skills-and-mcp.md` |
| `docs/TRAINING.md` | `docs/references/history/superseded/catvton-training.md` |
| `docs/final-research.md` | `docs/references/research/final-research.md` |
| `docs/omp-review.md` | `docs/references/history/reports/2026-07-27-omp-review.md` |
| `docs/staff-retailer.md` | `docs/tasks/done/staff-assisted-catalog-upload.md` |
| `docs/INDIA-RETAILER-GROWTH.md` | `docs/marketing/india-retailer-growth.md` (copy **edited** this session — hash differs) |
| `docs/social-connect-native.md` | `docs/tasks/done/social-connect-native.md` (copy **edited**) |

**3. Old root folders — all files duplicated into the new tree, so the folders empty out (1 + 3 + 2 + 11 + 1 + 7 + 5 + 1 + 1)**

| Old folder | Files | New location |
|---|---|---|
| `docs/adrs/` | 1 — `ADR-006-defer-3d-parametric-vto.md` | `docs/references/adrs/` (same name) |
| `docs/customer/` | 3 — `customer-profile-req.md`, `customer-qr-identity-solution.md`, `marketing-ideas.md` | `docs/customers/customer-profile.md`, `docs/customers/shopper-passport-identity.md`, `docs/marketing/hyperlocal-marketing-ideas.md` |
| `docs/database/` | 2 — `database-22-August.md`, `no-feature-want.md` | `docs/database/db-structure-report-2026-08-22.md`, `docs/references/history/reports/2026-08-31-feature-teardown-spec.md` (⚠️ **`docs/database/DATABASE.md` in this folder is the NEW file — do not delete the folder blindly**) |
| `docs/design/` | 11 — `AI Studio Styles.jpg`, `Catalog.jpg`, `Collections List.jpg`, `Dashboard.jpg`, `Growth Engine.jpg`, `New Collection.jpg`, `OnBoarding.jpg`, `Single Product Detailed.jpg`, `design-work.md`, `feature-ideas-2026-07-30.md`, `these-changes.md` | `docs/design/screens/` (8 jpgs), `docs/references/history/reports/2026-07-31-design-work.md`, `docs/references/research/feature-ideas-2026-07-30.md`, `docs/design/design-review-2026-08-20.md` (⚠️ **`docs/design/DESIGN.md` + `emil-design.md` + `design-review-*.md` + `screens/` are NEW — keep the folder**) |
| `docs/marketing/` | 14 — `WIRING-AUDIT-2026-08-20.md` → `docs/references/history/reports/2026-08-20-marketing-wiring-audit.md`; **plus the 13 feature stubs whose content was merged (not copied byte-for-byte) into one file:** `IMPLEMENTATION-STATUS.md`, `aggregator-marketplace-sync.md`, `ai-driven-social-media-templates.md`, `automated-festival-background-library.md`, `automated-lookbook-generator.md`, `direct-social-publishing.md`, `facebook-local-awareness-ads.md`, `google-local-service-ads.md`, `google-my-business.md`, `local-discovery-engine.md`, `marketing-sales-enablement-overview.md`, `partner-network-manager.md`, `smart-incentive-engine.md` → all inside `docs/marketing/marketing-sales-enablement.md` (each stub has a `<!-- source: … -->` marker) | ⚠️ **`docs/marketing/` is a KEEP folder** — `marketing-sales-enablement.md`, `india-retailer-growth.md`, `hyperlocal-marketing-ideas.md` live here. Delete only the 14 listed names. |
| `docs/new-updates/` | 1 — `new-updates-23-08-26.md` | `docs/references/history/reports/2026-08-23-pre-launch-fixes.md` (folder empties) |
| `docs/photo-feature/` | 7 — 5 files merged into the AI Studio spec, 2 (the ghost-mannequin pair) copied | `docs/ai-studio/ghost-mannequin-research.{md,html}` + `docs/ai-studio/history/` (all 7 names mapped in the hash check; folder empties) |
| `docs/superpowers/` | 5 — 3 plans, 2 specs | `docs/references/history/executed-plans/{plans,specs}/` (folder empties) |
| `docs/survey/` | 1 — `retailer-pain-point.html` | `docs/references/research/retailer-pain-point-survey.html` (folder empties) |
| `docs/references/` | 2 — `marketing-landing.md`, `mobile-ui-ux.md` | `docs/references/design-inspiration/` (⚠️ **the folder is a KEEP** — `README.md`, `guides/`, `research/`, `adrs/`, `design-inspiration/`, `history/` live in it) |

**4. Old `docs/tasks/` files (23 byte-identical + 5 moved-with-edits)**

Byte-identical, safe to delete: `2026-09-01.md` → `history/sessions/2026-09-01-gst-review.md` · `2026-09-03-ci-pr23-and-launch-checklist.md` → `…/2026-09-03-ci-and-launch-checklist.md` · `2026-09-11-otp-fb-aistudio-lint-session.md` → `…/2026-09-11-otp-fb-aistudio-lint.md` · `AI Cost Comparison.html` → `ai-studio/AI Cost Comparison.html` · `AI Models and Scenes.html` → `ai-studio/…` · `AI Motion Styles.html` → `ai-studio/…` · `AI Studio Effects.html` → `ai-studio/…` · `N-SIZE-FIT-GAPS.md` → `tasks/done/size-fit.md` · `PHASE-II-WHATSAPP-CATALOG-BREAKDOWN.md` → `tasks/done/whatsapp-catalog-sync.md` · `R-CAMPAIGN-ANALYTICS-SEASONAL.md` → `tasks/done/campaign-analytics-seasonal.md` · `S-AB-TESTING-VARIANT-LINKS.md` → `tasks/done/ab-testing-variant-links.md` · `chatgpt-style-commands.md`… (full set verified by hash — 23 in total, including `changes-03-09-2026.md`, `coupon-codes.md`, `customer-engagement-and-admin-behavior-analytics.md`, `deepseek-thinking-mode.md`, `last-updates.md`, `return-to-post-login-redirect.md`, `social-create-post-composer.md`, `staff-invite-tokens.md`, `subscription-gst-and-monthly-pricing.md`, `suits-designs.md`, `team-member-access-control.md`, `versioncode-5-changes.md`, `whatsapp-embedded-signup-managed-sending.md`).

Moved **with edits this session** (hash differs — content superseded by the corrected copy): `ai-photo-generation.md`, `api-rate-limit.md`, `customer-engagement-and-admin-behavior-analytics.md`, `customer-pwa-store-list-and-push-notifications.md`, `M-MULTI-LANGUAGE-AI-GAPS.md`.

⚠️ **`docs/tasks/` is a KEEP folder** (`README.md`, `pending/`, `done/`, this plan). Delete only the individual old files named above.

**5. Old image sets now living (gitignored) under `docs/ai-studio/` (134 files)**

| Old location | Count | New location |
|---|---|---|
| `docs/photoshoots/Style Output/*.jpg` | 42 | `docs/ai-studio/photoshoots/style-output/` |
| `docs/photoshoots/background/*` | 25 | `docs/ai-studio/photoshoots/backgrounds/` |
| `docs/photoshoots/*.jpg\|png` (samples, `Style Output/` excluded) | 16 | `docs/ai-studio/photoshoots/samples/` |
| `docs/photoshoots/models/*` | 14 | `docs/ai-studio/photoshoots/models/` |
| `docs/tasks/effect-photos/products/*` | 23 | `docs/ai-studio/effect-photos/products/` |
| `docs/tasks/effect-photos/models/*` | 8 | `docs/ai-studio/effect-photos/models/` |
| `docs/tasks/models/*.png` | 6 | `docs/ai-studio/models/` |
| **Total** | **134** | — |

**This is a clean 1:1**: the old AI-Studio image set is exactly 134 files and the new tree holds exactly 134 — verified by `git ls-tree -r a0fafafe -- docs | grep -iE '\.(jpg\|jpeg\|png\|webp\|gif)$'` grouped by folder. (An earlier draft of this table said 137; the authoritative per-folder split above is the measured one.) These are the **only** images being moved — the remaining old images are the 8 `docs/design/*.jpg` UI screenshots, whose copies live in `docs/design/screens/`.

**6. The 2 files that MUST NOT be deleted (deliberately unmoved)**

- `docs/design/emil-design.md` — `design/` was already its home; it never needed a copy.
- `docs/root-cause/root-cause issues.md` — stays in place (the new README sits beside it).

---

### 🛠 After-delete work list ✅ EXECUTED 2026-09-23

**Result: 236 files removed, 0 unresolved.** Each was re-proven immediately before deletion — the delete list refuses to build if any old file has no successor (that guard fired once, on a `git ls-tree` quoting bug, and was fixed rather than bypassed). 11 files were kept in place and never touched.

1. `git rm -r` the paths in sections 1–5 above. **Verify each folder still has its KEEP files** before removing a folder (`docs/design/`, `docs/database/`, `docs/marketing/`, `docs/references/`, `docs/tasks/` all remain). — **DONE**, via a verified delete list rather than hand-picked paths. `docs/design/`, `docs/database/`, `docs/marketing/`, `docs/references/` and `docs/tasks/` all survived with their KEEP files; the emptied folders (`photoshoots/`, `photo-feature/`, `superpowers/`, `survey/`, `new-updates/`, `adrs/`, `customer/`, `tasks/models/`, `tasks/effect-photos/`) were removed.
2. **Rewrite the old paths in code comments and doc cross-links.** — **DONE: 406 references across 120 files**, from a mapping built per-file (explicit rename table first, then CRLF-normalised hash match), never guessed. **235 files mapped, 0 unmapped, 0 ambiguous.** Ran longest-path-first so no short path could eat a longer one's prefix, and the frozen `references/history/` tree was excluded by design. Non-`docs/` files touched were almost all comment-only; `apps/mobile/app.json`'s edit is inside its `"//"` key, so nothing functional changed.

   **One deliberate exclusion:** `packages/db/prisma/migrations/*/migration.sql` was rewritten and then **reverted**. Prisma records a checksum per applied migration and will refuse to run the next `migrate deploy` if one was edited — including a comment-only edit. A stale path inside an immutable migration's comment costs nothing; a blocked production migration costs a lot. Those SQL comments keep the old paths on purpose. `schema.prisma` was **not** excluded (it is not checksummed) and its comments were updated.
3. **Fix the three scripts** (currently pointing at old paths): `scripts/save-bench.mjs` lines 10–12 + 109 → `docs/ai-studio/` (`effect-photos/previews/`, `bench-results.json`, `bench-results.js`) — this also fixes `AI Cost Comparison.html`'s `bench-results.js` load; `scripts/studio-shoot-demo.mjs` lines 15/24/34 → `docs/ai-studio/photoshoots/`; `scripts/batch-clean-photos.py` line 23 comment → `docs/ai-studio/ghost-mannequin-research.md`.
4. **Fix the CLAUDE.md feature-index rows** that link old paths (the row-73/74/75 F-036/F-037/AI-studio links), plus the **stale statuses found in Phase 4** (needs your approval — see the chat summary).
5. **Prove it:** `git grep -nE 'docs/(photoshoots|photo-feature|superpowers|survey|new-updates|adrs|customer/|MEMORY\.md|PROGRESS\.md|final-research\.md|INDIA-RETAILER-GROWTH\.md|DATABASE\.md|DESIGN\.md)'` → expect **zero** hits outside `references/history/`; then `pnpm lint` + `node scripts/check-android-version-code.mjs` (the CI gate that reads `PLAY-STORE-RELEASES.md`).
6. Only then: `docs/tasks/README.md` + `docs/README.md` "old paths" paragraphs get deleted (they describe a state that no longer exists).

---

### 🚩 Phase 8 — CLAUDE.md items needing your decision (NOT edited)

Per the owner rule, no CLAUDE.md content outside the Project File Index was touched. These rows are **stale** and are yours to approve:

| Row | Says | Reality (verified 2026-09-23) |
|---|---|---|
| #44 | migration `058` "NOT applied" | **Applied** — ground-truth check recorded 2026-09-03 |
| #46 / #47 | Marketing features + Partner Network "✅ Built" | Partner Network, Smart Incentive Engine, Festival Backgrounds, Lookbook Generator are **REMOVED** (migration `082`) |
| #73 | F-036 "Phase A ✅ Built" | correct, but `/login` + `return_to` + `/stores` entry point are described there as "now consumed"/"built" — matches; no change needed |
| #75 | AI Studio "🧪 Built (**unmerged**)" | **Merged** — `c1ca817b`, `5d5ae44`, `d67484d` are all ancestors of `origin/main`, and migrations `101`–`105` exist on disk. What actually remains open is only the **owner actions** (apply `104`/`105`, choose the engine for the 8 MODEL rows) |
| #9 | F-022 "Blocked on Google API access" | correct for the *auto*-post; note the retailer-side GMB integration **is** built (bring-your-own-key) |
