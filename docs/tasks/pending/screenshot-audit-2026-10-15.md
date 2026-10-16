# Screenshot Audit — 2026-10-15 (11 screens: retailer mobile app + customer web PWA)

**Status: 🟨 Phase 1 merged 2026-10-16 (PR #85, `fc27fa00`, RC-055…RC-061). Phase 2 prep on `release/v7` (v7 = `main`, R8 deferred to v8) — build + upload owner-side. Phases 0, 3–7 open.** Owner uploaded 11 device screenshots and
said: most issues are (a) **design inconsistency** and (b) **work documented as built that does not
show up in the real app**. Owner will explain the exact issues per screen in a follow-up session;
this doc is the reviewer's independent first pass so that discussion starts from evidence.

---

# ★ PART A — CONCLUSION, SOLUTION, MASTER TRACKER (read this first)

Everything below Part A (§0–§12) is the evidence. Part A is the decision document: what is wrong,
why, the exact fix, in what order, who does it, and how we know it is done. Every finding ID in the
evidence appears in the Master Tracker (A.4), so nothing is lost.

## A.1 Verdict

The owner's two complaints are both **true**, and they have **six concrete root causes**. None of them
is "the code was never written". Most built work exists on `main` and is deployed to web/API/admin.
It does not reach the owner's eyes because:

| # | Root cause | Share of the problem | Evidence |
|---|---|---|---|
| **R1** | **Android app on the phone is an old binary.** No OTA (`expo-updates` absent). Last Play build is v6 (~2026-09-29). **10 mobile commits since then are not in any installed app.** | Largest — explains most "built in docs, not in app" | §10.1 G-1, §12.3 |
| **R2** | **Built features are switched off or unapplied by design** (migration 127, support-session switch, `VIRTUAL_TRY_ON_V2`, 27 Studio styles all `DRAFT`, Meta dashboard config) | Large | §10.2, §11.6 C, §12.5 |
| **R3** | **Placeholders shipped as if real** — Marketplace Sync writes CONNECTED with no job; Google Business Profile token screen for an unbuilt feature; Instagram auto-publish ON with nothing connected; AI Stylist fallback silent | Medium, but most damaging to trust | S-02, S-04, S-09, S-03 |
| **R4** | **Real code bugs** — AI Stylist prices ×100 (paise shown as rupees); post preview empty | Small, high visibility | S-01, S-05 |
| **R5** | **No shared UI primitives** — every screen hand-builds header/button/price/icons → inconsistency | Explains the whole "design consistency" complaint | C-01…C-09 |
| **R6** | **Docs maintained by hand** → 11 contradictions (duplicate files, stale rows, removed features still "built") | Explains why docs look more done than the app | D-1…D-11 |

**Corrected earlier hypothesis:** production web is **not** stale (G-2 refuted; deployed `47a78d9a` vs
`main` `99943fae`, docs-only gap). The "Sept 8" privacy date on the phone was a cached copy.

## A.2 The solution — 7 phases, exact steps

Owner = you (dashboards, approvals, devices). Dev = engineering session. Each step has an acceptance
test; a step is done only when its test passes.

### Phase 0 — Establish truth (Day 1, ~30 min, Owner)
| Step | Action | Accept when |
|---|---|---|
| 0.1 | On the test phone: Settings → Apps → Kanchuki → version/build. Write it here. | Build number recorded; if ≤ v6, every M-row after 09-29 is "not installed", not "not built" |
| 0.2 | Open `kanchuki.app/privacy` in incognito | Shows "September 26, 2026" → cache theory confirmed |
| 0.3 | `railway login` (`! railway login`) so Railway can be read directly | Railway service SHA = `47a78d9a` or later |
| 0.4 | Admin → AI Providers: check stylist provider key/quota; Railway API logs for stylist errors | Cause of S-03 fallback named |
| 0.5 | Open 3 products on the customer site, wait for the nightly rollup (or check `RetailerEngagementDaily`), reload Customer Engagement | Non-zero → S-06 closed; still zero → beacon/job bug |

### Phase 1 — Honesty + money fixes (Day 1–2, Dev) — one PR, one RC per root cause
| Step | Fix | File | Accept when |
|---|---|---|---|
| 1.1 | **S-01** render `formatPrice(rec.price)` instead of raw `toLocaleString`; grep all `₹${…toLocaleString` / `price_min` renders and route through `formatPrice` | `apps/web/src/app/c/[slug]/components/AIStylist.tsx:257` | Stylist shows ₹2,100/- for Red Printed Kurta Set; unit test pins it |
| 1.2 | **S-02** sync endpoint stops writing `CONNECTED`; returns `501 not_available`; Growth → Marketplace Sync shows "Coming soon" (or route hidden) | `apps/api/src/routes/retailers/retailers-aggregators.ts:276–307`, `apps/mobile/app/growth/aggregators.tsx` | No path sets CONNECTED without a real sync; test asserts it |
| 1.3 | **S-04** hide GBP screen until F-022 is real (feature flag / remove entry point) | `apps/mobile/app/growth/integrations/gmb.tsx` + its entry in settings/growth | Retailer cannot reach a token-paste form |
| 1.4 | **S-09** auto-publish toggle disabled + OFF until an IG account is connected | Instagram integration screen | Toggle not switchable without connection |
| 1.5 | **S-03** fallback logs a warning + Sentry event + admin-visible counter; canned rationale removed or labelled "Popular in this store" | `apps/api/src/routes/public/public-stylist.ts` | Fallback is visible to ops, not disguised as AI |
| 1.6 | Prove the sandbox "simulated connected" branch is unreachable in prod (env guard + test) | `apps/api/src/routes/retailers/retailers-social/retailers-social-connect.ts:76` | Test fails if prod env can return simulated state |
| 1.7 | **S-05** preview renders the first selected photo and the selected account's name | Create Post composer | Preview matches what Meta receives |
| 1.8 | Root-cause entries + CLAUDE.md RC rows (owner approval for CLAUDE.md) | `docs/root-cause/root-cause issues.md` | RC-055+ minted — ☑ RC-055…RC-061 in tracker 2026-10-16; CLAUDE.md rows pending owner |

### Phase 2 — Ship the app (Day 2–3, Dev + Owner)
| Step | Action | Accept when |
|---|---|---|
| 2.1 | Build **v7** per `docs/PLAY-STORE-RELEASES.md` "Next release" checklist (versionCode 7, pre-submit checklist). **R8 deferred to v8 — owner 2026-10-16.** Pre-build checks ☑ 2026-10-16 | AAB built from current `main`, row logged |
| 2.2 | Install v7 on the test phone (internal testing track) | Phone build = v7 |
| 2.3 | Re-take the 11 screenshots — script in **A.8** | Each S-row re-classified fixed / still open |
| 2.4 | **Decision (Owner):** add `expo-updates` for OTA JS updates so future JS fixes reach phones without a store build | ☑ **Yes — owner 2026-10-16.** Dev adds `expo-updates` in v8 (with R8) |

### Phase 3 — Un-gate what is built (Owner, Week 1)
| Step | Action | Unlocks |
|---|---|---|
| 3.1 | Apply migration **127**; Admin → Support Sessions switch ON | Staff support sessions (L-02) |
| 3.2 | Publish Studio styles (27 `DRAFT` rows) + choose engine for 8 MODEL rows | AI Studio matrix in app (L-13) |
| 3.3 | F-040: RunPod template tag, `workersMax > 0`, Admin → Integrations secrets, flip `VIRTUAL_TRY_ON_V2` | Try-on (L-18) |
| 3.4 | Meta: key hashes, Live mode, App Review (`pages_show_list`, `pages_read_engagement`), F-043 launch checklist | FB/IG connect + scheduler publishing (L-01, L-04) |
| 3.5 | RazorpayX live + payout accounts; Razorpay webhook `refund.processed` | Referral payouts, refunds |
| 3.6 | Reconcile `_prisma_migrations` for 063, 104–115; verify 093–096 and 122 applied | Admin migration runner accurate |

### Phase 4 — Design system (Week 2, Dev)
| Step | Action | Fixes |
|---|---|---|
| 4.1 | **Owner decides palette** (navy+plum as shipped, or Black & Gold as documented) | C-01, D-10 |
| 4.2 | Build 6 primitives: `ScreenHeader`, `Button` (primary/secondary/destructive/disabled, single-line labels), `PriceText` (wraps `formatPrice`), `Icon` (lucide only), `StatTile` (2×2 on phones), `EmptyState` | C-02, C-03, C-04, C-06, C-09 |
| 4.3 | Migrate screens B, C, F, G, H, I, J (mobile) and A, K, E (web) to the primitives | S-06, S-08, S-10, S-11, S-12 |
| 4.4 | One type scale; remove stray serif or adopt it everywhere incl. privacy | C-05, S-07 styling |
| 4.5 | Remove duplicate controls (one share / like / filter); one FAB with bottom padding | C-08, S-10 |
| 4.6 | CI guards: no `toLocaleString` next to `₹`, no emoji in icon slots, no screen-local header; Playwright 390×844 visual snapshots | Prevents regression |

### Phase 5 — Fake / hard-coded data audit (Week 2, Dev + Owner)
| Step | Action | Accept when |
|---|---|---|
| 5.1 | Log in as a **brand-new retailer** on v7; screenshot every screen | Any number / "Connected" / sample item on an empty account is logged as a defect |
| 5.2 | Run the §9.1 grep list across `apps/api`, `apps/mobile`, `apps/web` | Every hit triaged (real / test-only / fix) |
| 5.3 | Poison-value test (`ZZZ-TEST-123`, ₹7,777) across catalog, stylist, share, WhatsApp text, post preview, engagement | All surfaces show identical name + price |
| 5.4 | Write the **screen → endpoint → table** map for the top 15 screens | Every on-screen value traced to a request |
| 5.5 | "Honest status" rule in code review: Connected only with a persisted row **and** a verify call | Added to PR checklist |

### Phase 6 — Docs become trustworthy (Week 2, Dev; CLAUDE.md edits need Owner approval)
| Step | Action | Fixes |
|---|---|---|
| 6.1 | Delete `tasks/pending/storefront-soft-404.md` (built copy lives in `done/`) | D-1 |
| 6.2 | Move `tasks/referral-program-retailer-affiliate.md` → `tasks/done/` (or pending if T8 counted) + board row | D-2 |
| 6.3 | Fix `studio-shoot-option-matrix.md` header/location; `catvton-…` header to "Built, flag OFF" | D-3, D-8 |
| 6.4 | CLAUDE.md: row 100 (F-043 deployed), duplicate row 75, rows #22/#33 (removed tools), F-022 vs GBP screen, palette line | D-4, D-5, D-6, D-7, D-10 |
| 6.5 | PLAY-STORE-RELEASES snapshot refresh; rename root-cause files without spaces (update links) | D-9, D-11 |
| 6.6 | Rule: a ✅ requires a row in the screen→endpoint map with a "last verified on device/build #" date | Stops future drift |

### Phase 7 — New work, in priority order (Week 3+)
| Priority | Item | Spec |
|---|---|---|
| 1 | Retailer support tickets + feedback loop (8-step build order) | §12.10, `support-and-feedback-loop.md` |
| 2 | Launch owner actions (lawyer review, Play listing, Sentry DSN, credential rotation, MSG91 token lock, real-device pass) | §11.6 E, `launch-readiness.md` |
| 3 | Referral residue: Install-Referrer prefill (5B.2/5B.3), T8 Refer & Earn after Play review | `post-referral-cleanup-and-launch.md` |
| 4 | F-036 push B–D, F-042 remaining spec, F-037 store-level rating decision | pending specs |
| 5 | Not-started features awaiting approval: F-022, F-035, F-039, F-041, F-001e, coupons, plan-switch B, F-031 P3/4, F-034 retailer video, i18n Phase B, AI credit engine | §11.2 |

## A.3 Timeline at a glance

| When | Phases | Outcome |
|---|---|---|
| Day 1 | 0 + start 1 | Truth established; money bug fixed |
| Day 2–3 | 1 + 2 | Honest integrations; v7 on phone; screenshots re-taken |
| Week 1 | 3 | Built features visible (support sessions, Studio, try-on, scheduler) |
| Week 2 | 4 + 5 + 6 | Consistent design; no fake data; docs match app |
| Week 3+ | 7 | New features on a trustworthy base |

## A.4 Master tracker — every ID in this file

Status key: ☐ open · ◐ in progress · ☑ done. Owner: **O** owner, **D** dev. Phase = A.2 phase.

| ID | Item | Type | Surface | Owner | Phase | Status |
|---|---|---|---|---|---|---|
| G-1 | Phone runs old binary (v6); no OTA | Deploy | M | O+D | 0, 2 | ◐ phone = `1.0.0 (6)` confirmed 2026-10-16; v7 prep on `release/v7`; ☑ when phone shows build 7 (A.8 P-1); OTA in v8 |
| G-2 | Web stale? → **refuted** (cache) | Deploy | W | — | 0.2 | ☑ |
| S-01 | AI Stylist price ×100 | Bug | W | D | 1.1 | ☑ `872067f2` RC-055 |
| S-02 | Marketplace Sync fakes CONNECTED | Fake data | M+API | D | 1.2 | ☑ `48e7795e` RC-056 |
| S-03 | Stylist silent fallback, canned rationale | Honesty | W+API | D+O | 0.4, 1.5 | ◐ 1.5 ☑ `5364c0ad` RC-059; cause (0.4) owner |
| S-04 | GBP token-paste screen for unbuilt F-022 | Fake feature | M | D | 1.3 | ☑ `e547e726` RC-057 |
| S-05 | Create Post preview empty / wrong name | Bug | M | D | 1.7 | ☑ `54c298c7` RC-061 (device re-check on v7) |
| S-06 | Engagement all zeros + label wrap | Bug? + design | M | O+D | 0.5, 4.3 | ◐ UI ☑ `8cd712ee` (2×2 tiles, zero-state guidance); zeros-vs-beacon still owner step 0.5 |
| S-07 | Privacy unbranded; stale copy cached on phone | Design + cache | W | D | 4.4 | ☑ `2f6a9fa2` (SW legal-pages rule, no 3 s timeout; logo header on privacy/terms/account-deletion) |
| S-08 | Product sheet hero cropped, duplicates | Design | W | D | 4.3, 4.5 | ⏸ skipped by owner 2026-10-16 (label already "Share Product" `fddc0116`; top share/heart duplicate + hero crop remain, hero crop not reproducible from source) |
| S-09 | IG auto-publish ON without connection | Honesty | M | D | 1.4 | ☑ `9f6fca7f` RC-058 (switch removed, not disabled) |
| S-10 | Catalog home: truncation, FAB overlap, dup filter, serif | Design | W | D | 4.3, 4.5 | ☑ `83fc70c1` (store name wraps, one filter icon, sans heading, non-personal "From this store" hidden, FAB brand gradient; FAB overlap is floating-by-design, unchanged) |
| S-11 | Product edit header style, raw photo, keyboard | Design | M | D+O | 4.3 | ☑ `af5ecc72` (ScreenHeader + scroll bottom padding/tap-persist; raw photo = owner decision, untouched) |
| S-12 | Product detail: ₹521 record, truncation, button style | Design + data | M | D+O | 4.3, 5.3 | ◐ `48378512` (design names wrap, shared price format, fake header heart removed); ₹521 record = owner data check |
| C-01 | Palette ≠ docs | Design | All | O | 4.1 | ☐ |
| C-02 | 3+ header styles | Design | M | D | 4.2 | ☑ `af5ecc72` + `8223a612` (`ScreenHeader`; 12 bare-chevron screens converted, 43 chip-style screens left as-is) |
| C-03 | Emoji as icons | Design | M/W | D | 4.2 | ☑ `bba77016` (templates, marketplace tiles, ✦ Styled, 👗/🗂️ placeholders → lucide; ✓ glyphs in checkboxes and emoji in user-facing message text left) |
| C-04 | Truncated buttons, washed disabled state | Design | M/W | D | 4.2 | ☐ |
| C-05 | Serif/sans mix | Design | W | D | 4.4 | ☐ |
| C-06 | Three price formats | Design + bug | M/W | D | 1.1, 4.2 | ◐ stylist ☑ `872067f2`; mobile inline paise→₹ strings → `formatPaiseShort`/`formatPrice` ☑ `48378512` `f6a7a7c7`; no PriceText component (shared formatters suffice) |
| C-07 | Docs ✅ ≠ app | Process | Docs | D+O | 5, 6 | ☐ |
| C-08 | Duplicate controls | Design | W | D | 4.5 | ☐ |
| C-09 | Empty states without guidance | Design | M | D | 4.2 | ☑ `8cd712ee` (Engagement was the only unguided one; list tabs already guide + CTA; no EmptyState primitive built) |
| X-1 | Sandbox "simulated connected" branch must be unreachable in prod | Honesty | API | D | 1.6 | ☑ `32d7cc4b` RC-060 (branch deleted) |
| X-2 | PWA service worker may pin legal pages | Bug? | W | D | 0.2, 4.4 | ☐ |
| D-1 | `storefront-soft-404.md` in pending + done | Docs | — | D | 6.1 | ☐ |
| D-2 | Referral spec unfiled, not on board | Docs | — | D | 6.2 | ☐ |
| D-3 | Option-matrix spec in done/ with "Spec" header | Docs | — | D | 6.3 | ☐ |
| D-4 | CLAUDE.md row 100 F-043 "not deployed" (stale) | Docs | — | O approve | 6.4 | ☐ |
| D-5 | CLAUDE.md duplicate row 75 | Docs | — | O approve | 6.4 | ☐ |
| D-6 | CLAUDE.md lists removed rotate/crop/bg tools as built | Docs | — | O approve | 6.4 | ☐ |
| D-7 | F-022 "Planned" but GBP screen ships | Docs + app | M | D | 1.3, 6.4 | ◐ screen hidden `e547e726`; CLAUDE.md 6.4 owner |
| D-8 | CatVTON header "Planned" vs built | Docs | — | D | 6.3 | ☐ |
| D-9 | PLAY-STORE-RELEASES stale snapshot | Docs | — | D | 6.5 | ☐ |
| D-10 | Palette in CLAUDE.md vs app | Docs | — | O | 4.1, 6.4 | ☐ |
| D-11 | Root-cause filenames with spaces | Docs | — | D | 6.5 | ☐ |
| L-01 | F-043 scheduler (code on main; not in v6; Meta review) | Gated | M/A/API | O+D | 2, 3.4 | ◐ app side carried in v7 (`f53942a5`, `29e81f4f`, `3c3b1137`); A.8 N-2; Meta review 3.4 |
| L-02 | Support sessions (migr 127, switch OFF) | Gated | M/A/API | O | 3.1 | ☐ |
| L-03 | FB carousel fix (after v6) | Ship | M/W/API | D | 2 | ◐ carried in v7 (`ecea0383`); A.8 N-1 |
| L-04 | IG guidance fix (after v6) | Ship | M/API | D | 2 | ◐ carried in v7 (`8b1cf41b`); A.8 H |
| L-05 | FB `pages_read_engagement` | Meta | M/API | O | 3.4 | ☐ |
| L-06 | F-042 homepage grid — browser verify | Verify | W | O | 0 | ☐ |
| L-07 | Feed thresholds + fallback | Live | API | — | — | ☑ |
| L-08 | Soft-404 | Live | W | — | — | ☑ |
| L-09 | Nearby store cards | Verify | W | O | 0 | ☐ |
| L-10 | #55 batch — manual test pass | Verify | M/W/A | O | 2.3 | ☐ |
| L-11 | Dead integrations removed (after v6) | Ship | M | D | 2 | ◐ carried in v7 (`c8562a5e`); A.8 N-4 |
| L-12 | WhatsApp API screen fix (after v6) | Ship | M | D | 2 | ◐ carried in v7 (`c76fba2c`, `b6af02f7`); A.8 N-3 |
| L-13 | Studio option matrix (27 rows DRAFT) | Gated | M/W/API | O | 3.2 | ☐ |
| L-14 | Admin studio bench | Live | A | — | — | ☑ |
| L-15 | Photo tools removed (docs still say built) | Docs | M | D | 6.4 | ☐ |
| L-16 | Admin memory card | Live | A | — | — | ☑ |
| L-17 | F-037 engagement (zeros on phone) | Verify | M/W/A | O+D | 0.5 | ☐ |
| L-18 | F-040 try-on (flag OFF) | Gated | M/W/A | O | 3.3 | ☐ |
| L-19 | Stylist filter fix (price bug separate) | Live | W | — | 1.1 | ☑ `872067f2` |
| L-20 | RC-041/042/043 | Live | M/W/A | — | — | ☑ |
| L-21 | `?ref=` capture | Verify | W | O | 0 | ☐ |
| L-22 | k6 run on staging (scripts built) | Ops | API | O | 7 | ☐ |
| L-23 | Dead-code sweep | Live | — | — | — | ☑ |
| T-1 | Retailer support tickets + Help & Support screen | Feature | M/API | D | 7 | ◐ built 2026-10-16 (API + `settings/help-support`), not deployed / device-tested |
| T-2 | Staff general-ticket list | Feature | M | D | 7 | ◐ built 2026-10-16 (`staff/tickets.tsx`), not device-tested |
| T-3 | `FeedbackEntry` + retailer/staff/customer capture + admin report | Feature | All | D (migr: O) | 7 | ☐ |
| E-1 | Lawyer review privacy/terms/consent copy | Launch | — | O | 7 | ☐ |
| E-2 | Play listing assets + Data Safety | Launch | — | O | 7 | ☐ |
| E-3 | `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Launch | — | O | 7 | ☐ |
| E-4 | Rotate dev credentials | Launch | — | O | 7 | ☐ |
| E-5 | MSG91 `verifyAccessToken` shape lock | Launch | API | D | 7 | ☐ |
| E-6 | Real-device pass (OTP, onboarding, photo→tag, sizes, customers, WhatsApp off-LAN, FB/IG, a11y, offline) | Launch | M | O | 2.3, 7 | ☐ |
| E-7 | B-002 read replica | Launch | API | O | 7 | ☐ |
| E-8 | RazorpayX live; webhook `refund.processed`; `_prisma_migrations` reconcile | Launch | API | O | 3.5, 3.6 | ☐ |
| F-* | Not-started features (F-022, F-035, F-039, F-041, F-001e, coupons, plan-switch B, F-031 P3/4, F-034, F-036 B–D, i18n B, AI credit engine, T8) | Backlog | — | O approve | 7 | ☐ |

## A.5 Definition of done — "the app matches the docs"

1. Test phone runs a build from current `main` (v7+), recorded in `PLAY-STORE-RELEASES.md`.
2. No screen shows Connected / synced / AI output that the backend did not actually produce.
3. Same product shows the same name and price on every surface (poison-value test passes).
4. Every mobile and web screen uses the 6 primitives; CI guards are green.
5. Every ✅ in CLAUDE.md / PRO-REQUIREMENTS has a screen→endpoint map row with a verified date and build number.
6. A.4 has no ☐ in Phases 0–6.

---

## A.6 Inputs still missing (cannot be read from the repo)

| # | Missing | Why I can't get it | Who / how | Fill in here |
|---|---|---|---|---|
| I-1 | App version + build number on the test phone | Lives on the device | Owner: Settings → Apps → Kanchuki | `1.0.0 (6)` — 2026-10-16 |
| I-2 | Railway service's deployed SHA (web + API) | Railway MCP returned *Unauthorized* | Owner: `! railway login` in the session, then Dev reads it | ______ |
| I-3 | Live flag / switch / migration state (127, `VIRTUAL_TRY_ON_V2`, Support Sessions switch, Studio rows `DRAFT`, 093–096, 122) | Policy: agent never reads prod DB | Owner: Admin panel (Feature flags, Support Sessions, Studio Styles, migration runner) | ______ |
| I-4 | Stylist provider status (key / quota / errors) | Admin + Railway logs | Owner: Admin → AI Providers; Dev reads logs after I-2 | ______ |
| I-5 | `/privacy` in incognito shows Sep 26? | Device/browser cache | Owner | ______ |

## A.7 How to start the next session

Copy-paste this as the first message of a new Claude Code session in `E:\Kanchuki`:

```
Read docs/tasks/pending/screenshot-audit-2026-10-15.md — Part A only (A.1–A.7).
That is the approved plan; do not re-audit or re-derive it.

Inputs (A.6):
- I-1 phone build: <fill>
- I-5 privacy incognito date: <fill>
- I-3 flags/migrations: <fill or "not checked">

Start Phase 1 (A.2). Do steps 1.1 → 1.7 in order, one commit each,
on a new branch fix/audit-phase-1. For each step:
1. read the named file first, 2. make the smallest fix, 3. add/adjust a test,
4. run the API/web/mobile tests + typecheck for the touched package,
5. tick the matching row in A.4 (☐ → ☑) with the commit SHA.
Mint RC-055+ in docs/root-cause/root-cause issues.md for each root cause.
Do not edit CLAUDE.md, run migrations, or deploy — list those for me at the end.
Stop after Phase 1 and report: what changed, test output, what is left.
```

**Before that session (Owner, 10 min):** fill I-1, I-5, and if possible I-3. If I-1 shows build ≤ v6,
Phase 2 (build v7) goes right after Phase 1. Run `! railway login` at the start of the session if you
want I-2 and I-4 read.

## A.8 v7 device re-test script (Phase 2 step 2.3 — Owner fills Result)

Phone: the test phone, v7 installed from the Internal testing track. Log in as the demo retailer
that has products. Result: ✅ pass · ❌ fail (one-line note + screenshot) · — not run.
R8 was deferred to v8, so R-1…R-8 are a plain regression smoke on v7; re-run them on the v8 (R8) build.

**0. Preconditions**

| # | Check | Expect | Result |
|---|---|---|---|
| P-1 | Settings → Apps → Kanchuki | Version `1.0.0`, build **7** → then G-1 goes ☑ | |
| P-2 | Migration 127 applied (Admin migration runner) | Applied — else Settings → Kanchuki support access is a silent empty list and every app-open 500s (PLAY-STORE-RELEASES v7 §A) | |

**1. The 11 audit screens — re-take each screenshot, re-classify its S-row**

| Screen | Where | Steps | Expect | Closes | Result |
|---|---|---|---|---|---|
| A | Web — customer product sheet | Open any product from the store link | (Phase 4 — expected still open) hero cropped / duplicate controls | S-08 | |
| B | App → Settings | Look for "Marketplace Sync" | Entry gone; nothing in the app shows a marketplace as Connected | S-02 | |
| C | App → Growth → Integrations | Look for Google Business Profile | No GBP card; subtitle reads "Facebook, Instagram & WhatsApp"; no token-paste form reachable | S-04 | |
| D | Web — store → AI Stylist | Ask for an outfit | Prices equal the catalog (₹2,100/-, not ₹2,10,000); if AI is down, cards show **no** ✨ rationale line | S-01, S-03 | |
| E | Web — `/privacy` in incognito | Open | Dated September 26, 2026 (styling = Phase 4) | S-07 copy, I-5 | |
| F | App → Social → Create Post | Pick 1 product with a photo, pick an account | Preview shows the photo **and** the account / page name — not "Your store", not a grey box | S-05 | |
| G | App → Customer Engagement | Open | Numbers, or a clear empty state | S-06 (needs Phase 0.5) | |
| H | App → Growth → Integrations → Instagram | Open with no IG connected | No auto-publish switch; plain "not shared" guidance | S-09, L-04 | |
| I | App → product → Edit | Open, tap a lower field | (Phase 4) note header style + keyboard overlap | S-11 | |
| J | App → product detail | Scroll to bottom | (Phase 4) note price format vs web | S-12 | |
| K | Web — store catalog home | Scroll to the end | (Phase 4) note FAB overlap / truncation | S-10 | |

**2. Smoke — the flows R8 breaks (run on v7 now, again on v8)**

| # | Flow | Steps | Expect | Result |
|---|---|---|---|---|
| R-1 | OTP login | Log out → phone → OTP | Exactly one SMS; lands on home | |
| R-2 | Camera / photo add | Add product → camera → shoot → save | Photo saved; AI tags fill in | |
| R-3 | Facebook connect | Settings → Social → Connect Facebook | FB sheet opens; returns with page name, or a readable red error — never a silent loop | |
| R-4 | Gallery save | AI Studio result or store QR → Save to gallery | Image appears in the phone gallery | |
| R-5 | Sentry crash | Trigger the error path you use for testing | Event in Sentry with a readable stack | |
| R-6 | Create Post preview | = screen F | Photo + page name | |
| R-7 | Integrations | Growth → Integrations | No GBP, no Marketplace Sync, no YouTube / X / Pinterest | |
| R-8 | Instagram screen | = screen H | No auto-publish switch | |

**3. Also new in v7 (since v6)**

| # | Item | Expect | Closes | Result |
|---|---|---|---|---|
| N-1 | FB carousel post (2+ products) | All photos posted, not text only | L-03 | |
| N-2 | Home / Growth scheduler banner, Social → Schedule | Screen opens; status card renders (publishing still needs Meta review, 3.4) | L-01 (app side) | |
| N-3 | Settings → WhatsApp API | Save errors shown; no fake credentials | L-12 | |
| N-4 | Growth → Integrations | No YouTube / X / Pinterest | L-11 | |

---

# PART B — EVIDENCE (findings, ledger, inventory, full 20-day record)

**How each finding was produced (so nothing is overstated)**

| Tag | Meaning |
|---|---|
| **[CODE]** | Seen in the screenshot **and** confirmed in source (file:line given) |
| **[VISUAL]** | Seen in the screenshot only. Plausible cause stated, **not** verified in code |
| **[DOC≠APP]** | Docs/CLAUDE.md say built, screenshot or code shows otherwise |

Severity: **P0** wrong data/money or fake success shown to users · **P1** broken/misleading feature ·
**P2** inconsistency/polish.

Screenshot IDs are the time-stamp suffix of the file name (`shared image - 2026-10-15T21xxxx`).

| ID | File time | Screen | App |
|---|---|---|---|
| A | 205923 | Product detail bottom sheet | Customer web |
| B | 205929 | Marketplace Sync → Connect Marketplace | Retailer mobile |
| C | 205934 | Google Business Profile | Retailer mobile |
| D | 205939 | AI Stylist sheet | Customer web |
| E | 205943 | Privacy Policy page | Web (browser) |
| F | 205948 | Create post (steps 6–7: Post to / Preview) | Retailer mobile |
| G | 210000 | Customer Engagement | Retailer mobile |
| H | 210020 | Instagram Integration | Retailer mobile |
| I | 210041 | Product Details (edit, keyboard open) | Retailer mobile |
| J | 210047 | Product Details (scrolled: More Ladies Suit / Suits Designs / Availability) | Retailer mobile |
| K | 210053 | Store catalog home | Customer web |

---

## 1. P0 — wrong data or fake success

### S-01 · AI Stylist shows prices 100× too high — [CODE] (screen D vs A, J, K)

| Product | Product detail / catalog | AI Stylist |
|---|---|---|
| Red Printed Kurta Set | ₹2,100/- | **₹2,10,000** |
| Grey Cotton Kurti with Sequin | ₹900/- | **₹90,000** |
| Bottle Green Embroidered Saree | — | **₹90,000** |

**Cause:** prices are stored in **paise**. `AIStylist.tsx:257` renders `rec.price.toLocaleString('en-IN')` with
a literal `₹` — no ÷100. Every other surface uses `formatPrice()` (`packages/shared/src/utils/index.ts`,
test pins `formatPrice(210000) === '₹2,100/-'`). The API sends raw `price_min` (`public-stylist.ts:302,397`).
Retailer-facing money bug visible to customers. Fix is one call to `formatPrice` — but check every other
place that prints `price_min`/`price_max` with `toLocaleString` (see C-06).

### S-02 · Marketplace Sync pretends to sync — [CODE][DOC≠APP] (screen B)

`retailers-aggregators.ts:276–307` — the sync endpoint's own comment: *"Placeholder: in production this
would queue a BullMQ job… For now, mark status as CONNECTED"*, then immediately writes
`status: 'CONNECTED', last_synced_at: now`. **No job, no marketplace call exists** (`apps/api/src/jobs`
has no aggregator/channel-sync job). The retailer sees "Connected" and a sync time for something that
never ran. Same failure class as RC-051 (fake-success `.catch`), which was fixed for YouTube/X/Pinterest
but not here. Needs: either real integration or remove/label "Coming soon" and stop writing CONNECTED.

Also on this screen **[VISUAL]**:
- "Glroad" looks like a misspelling of **GlowRoad**.
- 📦 emoji is used for both Glroad and Amazon; all marketplace icons are emoji, not the app's icon set.
- It asks the retailer for an "API key / API secret / Seller ID". Amazon, Flipkart and Meesho seller
  integrations do not work this way for small sellers — **assumption, verify before building**.
- Disabled **CONNECT …** button text is truncated and the gradient is washed out (see C-04).

---

## 2. P1 — broken or misleading features

### S-03 · AI Stylist is running its fallback, not AI — [VISUAL] + commit `47a78d9a` (screen D)

- Banner: *"AI stylist is temporarily busy. Showing top picks."*
- All four cards carry the **identical** rationale *"A great pick from Radha Clothing Store's collection."*
  — the canned fallback string, so the "AI" part never ran.
- Query box placeholder is a wedding query, but results are generic.
- *Grey Cotton Kurti with Sequin* is a collared **shirt** on a hanger — category/name vs photo mismatch
  (AI tag quality, **[VISUAL]**).

Needs: why the provider call fails (key/quota/timeout) — check Admin → AI Providers and API logs. The
fallback (`47a78d9a fix(api): fall back to catalog when recommendation signals fail`) is correct
behaviour but is masking a real failure with no alert.

### S-04 · Google Business Profile asks retailers to paste OAuth tokens — [DOC≠APP] (screen C)

Fields: Account ID, Location ID, **Access token, Refresh token**. A shop owner cannot produce these;
the link is "How to get GMB API credentials". CLAUDE.md lists **F-022 Auto-Post to Google Business
Profile as "Planned (blocked on Google API access)"** while a connect screen with a Save button ships.
Contrast screen H (Instagram) which says "No technical IDs… 1 click". Two integration screens, two
opposite UX promises. Decide: hide until F-022 is real, or build OAuth. Button label **SAVE & C…**
truncated, and a 💾 emoji is used as an icon.

### S-05 · Create Post preview shows an empty grey box — [VISUAL] (screen F)

- Preview image area is a blank grey rectangle; the caption (AI text about a Peach Embroidered Suit)
  has no photo above it. Retailer is one tap from **PUBLISH NOW** with no visual confirmation.
- Header reads "Your store" although the target is the Facebook Page **"Kanchuki.App"** (step 6) —
  preview doesn't use the selected account's name/avatar.
- Caption ends in a literal "…" and a "Your store page" link chip — unclear if the link is real text
  or a placeholder.
- Related history: RC-022 / RC-023 (post went out without photo/link). Verify whether the preview
  mirrors what Meta actually receives.

### S-06 · Customer Engagement is all zeros — [VISUAL] (screen G)

- Views 0, Searches 0, Favorites 0, Enquiries 0, "No data yet", "0 viewed → 0% → 0%" while the same
  store is visibly being browsed (screen K shows 3 saved, 13 items, AI Stylist used).
- Either events are not reaching the store's analytics, or this retailer has no traffic in the window.
  RC-045 (passport proxy dropped fire-and-forget beacons) is the nearest known cause — **needs a
  live check**: open a product on the customer site, then reload this screen.
- Labels wrap mid-word: **SEARCHE/S, FAVORITE/S, ENQUIRIE/S** — four equal columns too narrow for the
  font size (P2, **[VISUAL]**).
- Empty state is four "No data" blocks — no explanation or first-action hint.

### S-07 · Privacy page is stale and unbranded — [CODE] (screen E)

- Live page prints **"Last updated: September 8, 2026"**. Source
  (`apps/web/src/app/privacy/page.tsx:18`) says **"September 26, 2026"** → **corrected 2026-10-15:** live
  `/privacy` now prints Sep 26, so prod web is current; the Sep 8 on the phone was a stale cached
  copy (PWA service worker / browser cache — see §10.1a). This is the exact item flagged in the F-040 launch checklist ("confirm /privacy is
  deployed"). Privacy disclosure is a Play Store gate.
- Renders in raw browser defaults: default serif, no site header/logo, underlined purple "← Back to
  Kanchuki", no max-width reading column. Looks like a different site from the catalog (screen K).

### S-08 · Customer product sheet layout — [VISUAL] (screen A)

- Hero image is cropped to a ~80 px strip at the top of the sheet; the back arrow and ✕ buttons sit on
  it and the **"2 Photos" badge is covered by ✕**. The sheet opens scrolled/undersized, so the
  product photo — the main thing — is barely visible.
- Product Info shows only Name / Fabric / Type. No **sizes** row although sizes (S–XXXL) are documented
  as shown on this page — verify whether this product simply has none selected.
- Actions duplicated: share icon top **and** "Share it with friends"; heart top **and** "I like this".
  Heart colours differ (outline purple vs filled orange).
- "Share it with friends" icon touches the button's left border; label wraps onto two lines.
- Price format `₹2,100/-` here but `₹2,000` (no `/-`) in screen J (C-06).

### S-09 · Instagram Integration screen — [VISUAL][DOC≠APP] (screen H)

- Auto-publish toggle is **ON while no account is connected** — a setting that cannot take effect.
- 📸 emoji tile instead of the app's icon set; marketing copy ("Direct App-to-App Single Sign-On",
  "Ken Burns") is jargon for a shop owner.
- Known owner-side blocker: Meta dashboard config (memory: `social-connect-native-debug-2026-09-04`).
  Screen can't be judged "working" until that is done.

---

## 3. P2 — consistency and polish

### S-10 · Customer catalog home (screen K) — [VISUAL]

- Store name truncated: "RADHA CLOTHING STORE · CH…".
- **Two filter icons** (header and inside search) doing the same job.
- Floating AI-stylist button overlaps the third product card ("Peach E…") and sits just above the
  bottom bar.
- Category and Size chips scroll under a thick **dark progress bar** that looks like a bug, not a
  scroll indicator.
- Heading "From this store" is **serif**; everything else is sans.
- Bottom bar: "Enquire" is green while Catalog/Saved are navy/purple.
- "All (13)" vs "Ladies Suit (8) + Kurti (3)" = 11; third chip is off-screen — verify it sums to 13.
- "From this store — More available styles" on the store's own page repeats the grid below it.

### S-11 · Retailer product edit (screen I) — [VISUAL]

- Header pattern: bare back chevron + centred title + gradient **SAVE** pill. Other screens (B, C, G,
  H, J) use a **circled back chip** + left-aligned title. Three header styles in this sample alone.
- The product photo is a raw snap in a garden (raw-photo default, 2026-08-29 decision). Against the
  "AI catalog builder" promise this reads unprofessional — owner decision, not a bug.
- Price field shows `2000` with `₹` only in the label; STORE LOCATION field is partly hidden by the
  keyboard (RC-042 area — verify it scrolls into view on focus).

### S-12 · Retailer product detail, lower half (screen J) — [VISUAL]

- "More Ladies Suit": a **₹521 Maroon** item between ₹2,000 and ₹2,100 — data entry typo or price
  parsing; check the record.
- "Suits Designs" tile titles truncate ("Green Blouse - C…", "Olive Green Ku…") and tiles are
  multi-design collages.
- "Ask for Review" is a black-outlined rounded rectangle — a different button style from every other
  CTA (filled gradient / lilac outline).
- Availability chips include **"Not Sure"**; chips run under the faded bottom edge / nav bar.
- Heart (favourite) in the header of the retailer's **own** product view — meaning unclear.

---

## 4. Cross-cutting patterns (the "consistency" theme)

| ID | Pattern | Seen in |
|---|---|---|
| C-01 | **Palette ≠ documented palette.** Screens are navy + plum/magenta gradients. CLAUDE.md index says "Black & Gold Elegance" (#14) then "Colabs-inspired palette" (#25). Whichever is canonical, docs and app disagree. Not verified in the `COLORS` module — open item. | all |
| C-02 | **3+ header styles** (circled back + left title / bare chevron + centred title + action pill / browser chrome only). | B, C, G, H, I, J |
| C-03 | **Emoji as icons** (📸 📦 💾 🛍 ✨) next to lucide icons. | B, C, H, D |
| C-04 | **Truncated primary buttons/titles** ("CONNECT …", "SAVE & C…", "CH…", "Green Blouse - C…"). Disabled state is a washed gradient with clipped label. | B, C, J, K |
| C-05 | **Typography mix:** serif headings on customer web catalog, raw serif on privacy, sans elsewhere. | E, K |
| C-06 | **Three price formats:** `₹2,100/-`, `₹2,000`, `₹2,10,000` (bug S-01). `formatPrice`/`formatCompactPrice` exist; not every surface uses them. | A, D, J, K |
| C-07 | **Built-in-docs ≠ built-in-app.** Placeholder backends marked ✅ (S-02), screens for planned features (S-04), toggles with nothing behind them (S-09). Same pattern as memory `kanchuki-marketing-services-unwired-2026-08-20`. Needs a **status audit of every ✅ row** (CLAUDE.md index + `docs/PRO-REQUIREMENTS.md`) against a click-through. | B, C, H |
| C-08 | **Duplicate controls** on one screen (two share, two like, two filter). | A, K |
| C-09 | **Empty/zero states with no guidance.** | G |

---

## 5. What I would do next (proposal — not started)

1. **Fix S-01 now** (one-line `formatPrice`, + grep other `toLocaleString` price sites). Smallest, clearest bug.
2. **Stop the fake success** (S-02, S-09): make the sync endpoint return a real "not available" or hide
   the screen; unwire the Instagram toggle until connected.
3. **Check why the stylist falls back** (S-03) and **why privacy is stale** (S-07) — both are deploy/
   config questions, not code.
4. **Design-consistency pass** as one tracked task: one header component, one button disabled state,
   one price formatter, one icon set, one type scale. Decide C-01 palette first.
5. **Status audit** of every ✅ claim (C-07) — click-through each retailer screen on device, then
   correct CLAUDE.md/PRO-REQUIREMENTS (CLAUDE.md edit needs owner approval).

## 6. Open questions for the owner session

1. Which of these are bugs you already knew vs new?
2. Palette: navy + plum is the intended brand now, or should it be Black & Gold per the docs?
3. Marketplace Sync and Google Business Profile — hide until real, or build?
4. Raw product photos (S-11) — keep as default, or re-enable auto-clean?
5. Is the stylist fallback expected in this environment (AI key not set) or a regression?
6. Which screens beyond these 11 are you most worried about?

## 7. Limits of this audit

- 11 still images; no interaction, no logs, no network traces.
- Source checks covered only S-01, S-02, S-07 and a partial look at C/G. Everything tagged
  **[VISUAL]** is a hypothesis until reproduced on device.
- No test data in prod DB (wiped 2026-08-22), so "0 engagement" may be genuine for this retailer.
- Findings are not RC entries yet; an `RC-###` is minted when a fix lands (CLAUDE.md rule).

---

## 8. How to improve the design (method, for the next session)

Do it as **one consistency pass with shared primitives**, not 11 screen-by-screen patches — each
inconsistency above exists because every screen hand-rolled its own header/button/price.

| Step | What | Why (from this audit) |
|---|---|---|
| 1 | **Decide the palette once** (C-01) and make `COLORS` / theme tokens the only colour source. Delete raw hex in screens. | App is navy+plum; docs say Black & Gold. Nobody can fix "consistency" against two targets. |
| 2 | **One `<ScreenHeader>`** (circled back chip, left title, optional right action). Replace the 3 header styles. | C-02, S-11 |
| 3 | **One button set:** primary (gradient), secondary (lilac outline), destructive, disabled. Labels `numberOfLines={1}` with `adjustsFontSizeToFit`, never clipped mid-word; shorter copy ("Save", "Connect"). | C-04, S-02, S-04 |
| 4 | **One icon set (lucide).** Ban emoji-as-icon; allow emoji only inside user-written text. | C-03 |
| 5 | **One money formatter.** Lint rule/grep gate: no `toLocaleString` next to `₹`; only `formatPrice` / `formatCompactPrice`. | S-01, C-06 |
| 6 | **One type scale** (e.g. 5 sizes, one sans). Remove serif headings on customer web or make serif the deliberate display face everywhere (privacy page included). | C-05, S-07 |
| 7 | **Responsive stat tiles:** 2×2 grid at phone width instead of 4 columns. | S-06 |
| 8 | **Remove duplicates:** keep one share, one like, one filter entry per screen. | C-08 |
| 9 | **Real empty / error / loading states** — say *why* it is empty and the one action to fix it; never show a fake "Connected". | C-09, S-02, S-05 |
| 10 | **Floating UI budget:** one FAB; it must not cover cards — add bottom padding equal to FAB size. | S-10 |
| 11 | **Product sheet:** hero image at ≥ 45% of sheet height, controls over the image never over badges. | S-08 |

**Process to keep it from drifting:** a `docs/DESIGN.md` "components" table listing the 6 shared
primitives; PR rule — a new screen may not define its own header/button; an e2e/Playwright
screenshot of each key screen at 390×844 compared against the previous run (visual regression).

## 9. How to find fake entries and hard-coded text (what is not coming from DB/API)

**Principle:** a screen is only honest if every number, label state and list on it can be traced to a
DB row or API response. Hunt in three layers, cheapest first.

### 9.1 Static scan (minutes) — grep for the tells

Run from repo root; each hit is a *candidate*, then read the line.

| Looking for | Pattern (ripgrep) | Where |
|---|---|---|
| Placeholders / simulated success | `[Pp]laceholder:\|simulate\|for now,\|not yet wired\|coming soon\|TODO` | `apps/api/src`, `apps/mobile/{app,src}`, `apps/web/src` |
| Fabricated "connected/ok" | `connected: true\|configured: true\|status: 'CONNECTED'` | same |
| Errors swallowed into fake data | `\.catch\(\(\) *=> *\(\{\|catch *{ *return` and `?? \[\]` / `?? 0` on API data | mobile `src/lib/api*` |
| Hard-coded lists in UI | arrays of literal objects in `.tsx` (`const ITEMS = [ {` with names/prices) | `app/**`, `src/components/**` |
| Static numbers shown as stats | `"\d+\+? (retailers\|stores\|products)"` in JSX / marketing sections | `apps/web/src/app/sections` |
| Enum lists duplicated from DB | literal category/style/fabric arrays (F-024/F-027 moved these to DB) | mobile + web |
| Dev/sandbox branches reachable in prod | `NODE_ENV !== 'production'`, `sandbox`, `dev mode` | `apps/api/src` |

**Already found by this audit's quick scan (API only):**

| File:line | What it is | Risk |
|---|---|---|
| `retailers-aggregators.ts:276–299` | "Placeholder… simulate success" — sync writes CONNECTED with no job | **Shown to retailer as real** (S-02) |
| `retailers-social-connect.ts:76` | "Return simulated connected state for dev / sandbox mode" | Must be proven unreachable in prod (RC-051 family) |
| `public-stylist.ts` rationale fallback string | canned "A great pick from {store}'s collection." | Looks like AI output but is not (S-03) |
| `auth.ts:541–553` | dummy-number / App-Review OTP bypass | Intentional (§7A.3) — confirm it is env-gated |

Mobile `app/**` and `src/**` returned **no** hits for the obvious keywords (`mock`, `dummy`,
`lorem`, `fake`) — so hard-coding there is more likely *literal copy and lists*, which keyword grep
cannot find. Use 9.2.

### 9.2 Runtime trace (the reliable method) — "change the data, see if the screen changes"

1. **Mutation test per screen.** Change one value at the source (DB row / API response) and reload.
   Screen unchanged → it is hard-coded or cached. Do this for the top 15 screens.
2. **Network-tab diff.** Open the screen with Playwright (`browser_network_requests`) or Expo web
   devtools. For every number/list on screen, name the request that carried it. **No request = literal
   in code.** Write the screen → endpoint → field map in a table (this doubles as living API doc).
3. **Empty-database run.** Test accounts are wiped (2026-08-22). Log in as a brand-new retailer: every
   screen that still shows numbers, "Connected", sample products or names is fake. This is the
   cheapest fake-data detector available and needs no code.
4. **Poison-value test.** Seed one product named `ZZZ-TEST-123` priced ₹7,777. Search every surface
   (catalog, stylist, share, WhatsApp text, Create Post preview, engagement). Any surface that
   shows a *different* name/price is reading another source (found S-01 this way).
5. **Offline / API-down test.** Kill the API: screens must show an error, not stale or invented
   data. Anything that still renders "Connected/0 errors" is swallowing failures.
6. **Cross-surface parity.** Same product on retailer app, customer web, stylist, WhatsApp share:
   price, name, availability must match to the paisa (script it; Playwright + one API fixture).

### 9.3 Make it permanent (so it can't regress)

| Guard | What it enforces |
|---|---|
| ESLint/ripgrep CI rule | fail build on `toLocaleString` next to `₹`, on emoji in icon positions, on `connected: true` literals outside tests |
| **Contract tests** | each retailer screen's data hook has a test that asserts the field it renders comes from the API mock (not a constant) |
| **"Honest status" rule** | an integration may only show Connected if a persisted row *and* a successful verify call exist; "Coming soon" otherwise |
| **Feature-status audit** | one table: screen → endpoint → DB table → *last verified date*. A ✅ in CLAUDE.md/PRO-REQUIREMENTS requires a row here |
| Seed-free staging | staging DB starts empty; nightly Playwright run on a new retailer must show only empty states |

**Suggested order for next session:** 9.2 step 3 (new-retailer empty run) → 9.1 greps → fix S-01/S-02/S-07
→ §8 steps 1–5 → write the screen→endpoint map.

---

## 10. Change ledger — last ~20 days (2026-09-24 → 2026-10-15) and where each one actually lives

**Source:** `git log --since=2026-09-24 --no-merges` on `main` = **86 commits**; surface columns come
from the file paths each commit touched (`apps/mobile` = M, `apps/web` outside `/admin` = W,
`apps/web/src/app/admin` = A, `apps/api` + `packages/db` = API/DB).

**Read the ✅ correctly:** ✅ = *code for that surface is on `main`*. It is **not** proof the feature is
deployed, applied, flagged on, or in the APK you hold. Merged ≠ deployed ≠ in the app.

### 10.1 Why "done in docs, not in the app" is happening — two deploy gaps (verify first)

| # | Gap | Evidence | What to check |
|---|---|---|---|
| G-1 | **Mobile: no OTA path.** `apps/mobile` has no `expo-updates`; every mobile change needs a new binary. Latest logged Play build is **v6 (submitted ~2026-09-29)**; v7 is only *reserved* (`app.json versionCode: 7`, checklist unticked). **10 mobile commits landed after 2026-09-29** and cannot be in v6: `c76fba2c`, `f1148360`, `be8c48c1`, `b6af02f7`, `c8562a5e`, `ecea0383`, `0503c851`, `f53942a5`, `3c3b1137`, `8b1cf41b`. | `git log --since=2026-09-29 -- apps/mobile`; `docs/PLAY-STORE-RELEASES.md` | On the test phone: Settings/About app version + build number; compare to the v6 row's commit SHA. If it's v6 or older, every row marked "after v6" below is invisible by construction. |
| G-2 | ~~**Web: production looks older than `main`.**~~ **REFUTED 2026-10-15 — see §10.1a.** Live `/privacy` shows *"September 8, 2026"*; `privacy/page.tsx:18` on `main` says *"September 26, 2026"* (last changed `361cd2ec`, 2026-09-26). So prod web predates at least that commit. This is RC-047's failure mode — a failed/never-triggered build reported as success. | screenshot E vs source | Railway → web service → deployments: latest SUCCESS deploy's commit SHA vs `main` HEAD `99943fae`. Check the live HTML for the build SHA. |

**G-2 is refuted (§10.1a): web + API are deployed at `47a78d9a`, one docs-only commit behind `main`.**
So W / A / API rows below *are* live unless a flag or migration gates them. **G-1 (mobile binary) is
still open and is now the main explanation** for "built in docs, not in the app".

### 10.1a G-2 check result (2026-10-15, ~16:20 UTC)

| Check | Result |
|---|---|
| `main` HEAD / `origin/main` | `99943fae` (docs-only: Railway memory + soft-404 task notes) |
| Latest production deployment record (GitHub deployments API, env `kanchuki-prod / production`) | `47a78d9a` created 12:41 UTC, status **success** at 12:46 UTC |
| Commits between deployed SHA and `main` | **1**, `99943fae`, docs only (3 files under `docs/tasks/pending`) — nothing user-facing undeployed |
| Deploy records for the other 7 latest commits | all present on Oct 14–15 (`ecea0383`, `0503c851`, `f53942a5`, `29e81f4f`, `3c3b1137`, `8b1cf41b`, `2e6814c2`) |
| Live `https://kanchuki.app/privacy` fetched now | prints **"Last updated: September 26, 2026"** = source on `main` |

**So screenshot E ("September 8") is not an old deploy.** It was a stale copy on the phone. Likely:
the customer PWA service worker (`apps/web/public/sw.js`) or browser cache serving the old page
(response also carries `Cache-Control: s-maxage=60, stale-while-revalidate`, `x-nextjs-cache: STALE`).
**Verify:** hard-reload or open in incognito; if it flips to Sep 26 it was cache. If the PWA SW can
pin legal pages for days, that is itself a defect (a stale privacy notice is a Play Store gate).

**Limits of this check:** Railway MCP returned *Unauthorized* (needs `railway login`), so I could not
read the Railway service's own deployed SHA. The result rests on GitHub deployment records plus the
live page content. RC-047 says deployment records can mislead; the live page matching `main` is the
independent confirmation. The deployment's final status was `inactive` (superseded), consistent
with a newer record not shown; the Sep 26 content proves the build is at least `361cd2ec`.

### 10.2 Ledger

Columns: **M** mobile · **W** customer web/PWA · **A** admin panel · **API/DB**. `—` = no code
change on that surface (either not needed or **missing** — see Verify). Dates = commit date.

| # | Feature / fix | Date | Commits | M | W | A | API/DB | Known state / gate | Verify (what you should be able to do) |
|---|---|---|---|---|---|---|---|---|---|
| L-01 | **F-043 Social Post Scheduler** — plan builder, calendar, publish tick, token health, hardening | 10-15 | `f53942a5` (T1), `29e81f4f` (T2), `3c3b1137` (T5, "stacked on #82") | ✅ | — | ✅ (limits) | ✅ migr **128/129 applied** | T3 UI + T4 templates were separate branches (`feat/f-043-scheduler-ui`, `…-templates`); confirm they are inside #83. Not device-tested; after v6 | M: Growth → scheduler status card + plan form. A: plan limits keys. API: publish tick job running |
| L-02 | **Kanchuki-staff support sessions** (retailer-approved, scoped, 24 h) | 10-15 | `0503c851` | ✅ | — | ✅ Support Sessions page | ✅ migr **127 NOT applied**, switch OFF | Not live by design; not device-tested; after v6 | A: Admin → Support Sessions exists. M: Settings → Support sessions. Needs 127 + switch |
| L-03 | **FB carousel fix** — text-only post + empty collection preview | 10-14 | `ecea0383` | ✅ | ✅ | — | ✅ | After v6 | M: Create post → collection carousel preview shows photos (⚠ screenshot F preview still empty) |
| L-04 | **IG "not shared" guidance**; stop fabricating OAuth code/state | 10-15 | `8b1cf41b` | ✅ | — | — | ✅ | After v6; Meta dashboard config still owner-side | M: IG connect failure shows clear text |
| L-05 | FB App Review `pages_read_engagement` feature | 09-25 | `997362d9` | ✅ | — | — | ✅ | Likely in v6; App Review is Meta-side | — |
| L-06 | **F-042 Homepage category-wise grid** + View more → `/category/[name]` | 10-14 | `20552205`, `c398dc75`, `3af24c58` | — | ✅ | — | ✅ | "Not browser-verified" (CLAUDE.md #99); self-hides < 6 products / 3 shops | W: homepage rows. Pilot thresholds lowered in `2e6814c2` (2 products / 1 shop) |
| L-07 | Category-feed pilot thresholds; recommendation fallback to catalog | 10-15 | `2e6814c2`, `47a78d9a` | — | — | — | ✅ | `47a78d9a` is why the stylist shows "top picks" (S-03) | W: stylist/homepage degrade, not blank |
| L-08 | **Soft-404 → real 404** (unknown stores, legacy `/c/{slug}`, scanner probes) | 10-10 | `4fab6a6b`, `b4124615`, `3abc2f73` | — | ✅ | — | — | Web only | W: `/c/does-not-exist` returns HTTP 404 |
| L-09 | **Nearby store cards** on `/stores` + homepage | 10-10 | `51628b0e` | — | ✅ | — | ✅ | — | W: `/stores` nearby section |
| L-10 | **#55 batch** — 9 mobile/admin fixes, DELETE-permission audit, WhatsApp Cloud API config (real PATCH/DELETE, hub "Connected"), RLS `design_references` | 10-10 | `b6af02f7`, `52897e5e` (mig 126), `aaaee1df`, `6081643e` (RC-049…054), `ad00f8f8` | ✅ | ✅ | ✅ | ✅ migr 124–126 applied by owner | "manual test pass pending"; after v6 | M: WhatsApp API config saves + hub shows Connected; A: sidebar flyout (RC-052); W: Prev/Next scroll reset (RC-053); status-bar icons (RC-054) |
| L-11 | **Dead integrations removed** (YouTube / X / Pinterest screens, fake-success `.catch`) | 10-10 | `c8562a5e` | ✅ | — | — | — | After v6. **Marketplace Sync, GBP, IG screens were left** — see S-02/S-04/S-09 | M: those 3 screens are gone from Growth |
| L-12 | WhatsApp API screen — billing notice, no fake credentials, surface save errors | 10-01 | `c76fba2c` | ✅ | — | — | — | After v6 | M: save error visible |
| L-13 | **Studio Shoot option matrix (F-032)** — shared styles, server pools, product gating, mobile picker | 10-10 | `be8c48c1`, `c41f0b25` | ✅ | ✅ | — | ✅ migr | After v6 | M: AI Studio style picker lists matrix styles |
| L-14 | Admin **studio bench**: Product Only PS-01…16, Model Only MI/MO, photography-style picker | 09-30 → 10-10 | `904a0a15`, `d21d6ce9`, `ed14b002`, `371d1027`, `f6561d4b`, `51daafb7`, `adb96a18`, `1220c8b5` | — | ✅ | ✅ | ✅ | Internal tool, owner testing prompts | A: Studio bench dropdowns |
| L-15 | **Removed**: background removal, rotate, crop, ranking, duplicate detect, colour auto-fill | 10-10 | `f1148360` | ✅ (removed) | — | — | ✅ (removed) | **DOC≠APP:** CLAUDE.md #33 "F-029 Photo Rotate", #22 compressor/crop still read as built. Memory: API RAM 1.34→0.14 GB | M: no rotate/crop/bg-removal controls (matches "raw photo" screen I) |
| L-16 | **Admin server-memory card** (live RSS/heap + 24 h history) | 10-10 | `59f9fa59` | — | — | ✅ | ✅ | — | A: dashboard memory card |
| L-17 | **F-037 engagement** — nightly rollup, admin dashboard + drill-down, retailer view, storefront social-proof chips | 09-28 → 09-29 | `f29e388a` (mig 121), `4a5cb825`, `d77f357b`, `ef594f46`, `d7a08b9b` | ✅ | ✅ | ✅ | ✅ | Retailer screen is **screenshot G (all zeros)** → check rollup job ran + RC-045 beacon | M: Growth → Customer Engagement; A: engagement dashboard; W: chips on cards |
| L-18 | **F-040 CatVTON try-on** — route, job, consent gate, dual quota, deletion sweep | 09-26 | `93b72534`, `21c91145`, `361cd2ec`, `7268c9ad` (RC-045) | ✅ | ✅ | ✅ | ✅ migr 118–120 | **Flag `VIRTUAL_TRY_ON_V2` OFF**; owner RunPod/secrets steps open → invisible by design | W/M: try-on entry hidden until flag ON |
| L-19 | AI Stylist category/age/gender filter bug + catalog-derived suggestions | 09-25 | `6d18a5be` | — | ✅ | — | ✅ | **Screenshot D still shows wrong prices (S-01) and fallback (S-03)** | W: stylist query returns matching category |
| L-20 | RC-041 deep links one module; RC-042 keyboard-inset primitive; RC-043 one app identity | 09-25 | `019057d0`, `6b0f98e7`, `998cc0e1` | ✅ | ✅ | ✅ | ✅ | Likely in v6 | M: keyboard no longer hides fields (screenshot I partial) |
| L-21 | Referral `?ref=` capture on `/for-retailers` | 09-25 | `21aa866f` | — | ✅ | — | — | Needs deployed web (G-2) | W: `/for-retailers?ref=X` stores code |
| L-22 | k6 load tests; pre-prod RC re-test (40/40) | 09-24 | `9c562890`, `d284826a` | — | — | — | ✅ | Tooling/docs | — |
| L-23 | Dead-code sweep (fashion_dna config, Lookbook/Festival bindings) | 09-28 | `9e2ad556` | ✅ | — | ✅ | ✅ | — | — |
| L-24 | Docs/CI/tracker only (RC-044…054 records, BUILD-LOG split, board sync, CI GHCR, lint) | 09-24 → 10-15 | ~35 commits | — | — | — | — | No product impact | — |

### 10.3 Cross-check against the screenshots (§1–§4)

| Screenshot | Related ledger row | Reading |
|---|---|---|
| D — stylist prices ×100 + fallback | L-07, L-19 | Fix `6d18a5be` fixed *filtering*, not price rendering; `47a78d9a` *added* the fallback. Real bug (S-01) regardless of deploy |
| B — Marketplace Sync | L-11 | Cleanup commit skipped this screen — still fake (S-02) |
| C — Google Business Profile | — | No ledger entry: F-022 is **Planned**; screen exists with no backing build (S-04) |
| E — privacy "Sept 8" | L-18 (`361cd2ec`) | Deployed web is behind `main` → G-2 |
| F — empty post preview | L-03 | `ecea0383` claims carousel preview fix; screenshot shows empty preview → either old build (G-1) or not fixed |
| G — engagement zeros | L-17 | Built; check job + beacon (RC-045) before calling it broken |
| H — Instagram | L-04 | Guidance text fix is after v6; screen on phone may be pre-fix |
| I — product edit, raw photo | L-15 | Consistent with removal of crop/bg tools |
| K — homepage/catalog | L-06, L-08, L-09 | Customer web changes only visible if G-2 clear |

### 10.4 Tracking checklist (tick as you verify; one box per surface)

Use per row L-01…L-23: `☐ M on device (build #…)  ☐ W on kanchuki.app  ☐ A on admin  ☐ API/DB applied`.
Do **G-1 and G-2 first** (two checks, 10 minutes) — they decide how many of the other ☐ are even
testable.

### 10.5 Limits of this ledger

- Built from commit subjects and touched paths; I did not open every diff, so "what it does" is the
  commit's own claim.
- Pre-2026-09-24 work (e.g. F-036, F-038 referral, Suits Designs) is outside the 20-day window.
- Whether a migration is applied or a flag is on is taken from CLAUDE.md/spec text dated 2026-10-15,
  not from querying the database (policy: no prod DB access).

---

## 11. Consolidated documentation map — every `.md` under `docs/` (79 files, scanned 2026-10-15)

**Scan method:** title + `Status` line + checklist counts + last-commit date for each file; board coverage
checked against `docs/tasks/README.md`; compared with the 86-commit ledger (§10) and CLAUDE.md.
Large specs (PRO-REQUIREMENTS 334 KB, ai-photo-generation 108 KB, PLAN 118 KB…) were **not read end to
end** — their status lines, headings and checklists were. Treat their detail as "as the file claims".

### 11.1 Inventory

| Folder | Files | Role |
|---|---|---|
| `docs/` (root) | 13 | Reference: PRO-REQUIREMENTS, PLAN, BUILD-LOG (index), API, DATABASE, DEPLOY, DESIGN, MARKETING, SCALING, SECURITY, TECH-STACK, PLAY-STORE-RELEASES, README |
| `docs/build-log/` | 6 | BUILD-LOG parts 1–6 (chronological; part-6 is current, 121 KB) |
| `docs/tasks/pending/` | 25 | Open work (24 + this audit) |
| `docs/tasks/done/` | 19 | Built specs |
| `docs/tasks/` | 2 | `README.md` board + `referral-program-retailer-affiliate.md` (**unfiled**, see §11.5) |
| `docs/root-cause/` | 3 | Tracker `root-cause issues.md` (+ part-2 for RC-030 and older), `README.md` |
| `docs/runbooks/` | 3 | Owner runbooks: F-043 launch, RazorpayX referral, F-040 try-on |
| `docs/ai-studio/` | 3 + 5 history | AI photo/video research (bench images gitignored) |

### 11.2 `tasks/pending/` — what is left (25)

| File | Feature | Status in file | Open items | Next gate |
|---|---|---|---|---|
| `launch-readiness.md` | Launch checklist | 🟡 re-verified 2026-09-29 | **23 open / 7 done** | Owner/account actions + real-device pass |
| `post-referral-cleanup-and-launch.md` | Referral follow-ups, admin access, refunds, `?ref=`, lists→DB | board; §0 stale | **19 open / 30 done** | 1.1 migration-runner reconcile, 2.2 RazorpayX live, 5A.4 webhook `refund.processed`, 5B.2/5B.3 Install Referrer prefill |
| `post-scheduler.md` | **F-043 Social Post Scheduler** | 🟨 T1–T5 built | 8 open | T3 UI + T4 templates + T5 on branches → confirm merged (#83 stacked), device test, Meta App Review (runbook) |
| `support-session-access.md` | Kanchuki-staff support sessions | 🟨 built, **not live** | — | Apply migr **127**, switch ON, device test |
| `support-and-feedback-loop.md` | Retailer ticket + feedback loop | 🔴 review only (this session) | — | Owner §5 decisions |
| `screenshot-audit-2026-10-15.md` | This audit | 🔴 findings only | S-01…S-12 | Owner walkthrough |
| `catvton-runpod-tryon-launch.md` | **F-040 CatVTON try-on** | 🔴 header says "Planned"; index says **built, flag OFF** | — | RunPod `workersMax>0`, secrets, `/privacy` live (✅ now), flip `VIRTUAL_TRY_ON_V2` |
| `ai-photo-generation.md` | F-032 / F-034 AI photo+video (single source) | 🟡 mixed: Phase A + bench ✅; **Phase B video + F-034 retailer 🔴** | — | Live provider run; engine choice for 8 MODEL rows |
| `ai-credit-billing-model.md` | AI credit/limit/billing model | 🟡 design; addon-pack admin half live (migr 089) | — | Decisions §8 |
| `customer-engagement-analytics.md` | **F-037** | Phases 1–3 ✅; Phase 4 partial | store-level `/stores` rating pending owner | Owner decision; check engagement zeros (S-06) |
| `customer-pwa-push-notifications.md` | **F-036** | Phase A ✅; **B–D 🔴** | — | Push (web-push), visited-store list B–D |
| `homepage-product-browse.md` | **F-042** | §2b grid ✅ 2026-10-14; rest idea | gates G-1…G-3 open | Browser verification |
| `whatsapp-managed-sending.md` | **F-035** | 🔴 planned, post-launch | 7 open | Meta Tech Provider + Embedded Signup |
| `how-customer-earn-from-this-platform.md` | **F-041 Pre-Loved** | 🔴 idea, not approved | D-1…D-7 | Legal review; no-code P0 pilot |
| `style-match-lite.md` | **F-039** | 🔴 planned, not approved | D-1/D-2 | Owner sign-off |
| `ai-fit-recommendation-research.md` | Fit research | 🔬 research only | — | Feeds F-039 |
| `google-business-profile-autopost.md` | **F-022** | 🔴 on hold, "do not start" | — | Google API access. **UI screen exists anyway (S-04)** |
| `ghost-mannequin.md` | **F-001e** | Planned; Snappyit worker paused 2026-08-02 | — | Owner go-ahead |
| `coupon-codes.md` | Subscription coupons | 📋 spec, not built | — | Owner approval |
| `plan-switch-prorated.md` | Plan switch Model B | 🔴 planned (Model A shipped) | — | Product sign-off |
| `multi-language-i18n.md` | Task M multi-language | 🟡 partial | 5 open | Native mic, PWA toggle, retailer UI toggle |
| `i18n-and-dynamic-content-audit.md` | i18n Phase A audit | 📋 audit; **parked** (memory 2026-09-29) | — | Phase B only after approval |
| `social-publishing-phase-3.md` | F-031 Phase 3/4 | 🔴 planned | — | IG Reels scheduling, broadcast analytics |
| `improvments-railway.md` | Railway cost/memory | ✅ culprit fixed 2026-10-10; 24 h confirm + owner decisions open | §8 | Recheck RAM, web/Postgres |
| `storefront-soft-404.md` | Soft-404 | 🔴 "Planned, not started" — **stale: built 2026-10-10** | — | Delete (duplicate of `done/`) |

### 11.3 `tasks/done/` — built specs (19) and their residue

| File | Status in file | Residue / caveat |
|---|---|---|
| `social-create-post-composer.md` | ✅ Phases 0–9 (2026-09-04) | Preview-empty report S-05 → re-test |
| `social-connect-native.md` | ✅ code shipped | **Needs EAS build + Meta dashboard** before real-device |
| `suits-designs.md` | ✅ built 2026-09-07 | migrations 093–096 "prod apply pending (owner)" — verify applied |
| `subscription-gst-and-monthly-pricing.md` | ✅ built + live | — |
| `staff-invite-tokens.md` / `team-member-access-control.md` / `staff-assisted-catalog-upload.md` | ✅ | `staff-assisted…` is the base for support sessions |
| `whatsapp-catalog-sync.md` | ✅ 63/63, migr 060–062 applied | Real Meta sync not re-verified since |
| `ab-testing-variant-links.md`, `campaign-analytics-seasonal.md`, `size-fit.md`, `ratings-reviews.md` | ✅ built 2026-08-18/20 | — |
| `return-to-post-login-redirect.md` | ✅ fixed 2026-09-17 | — |
| `dead-code-cleanup.md` | ✅ 2026-09-28 | — |
| `reorganize-files-folders-structure.md` | ✅ docs reorg done | Paths in it are pre-move on purpose |
| `storefront-soft-404.md` | ✅ built 2026-10-10 | Duplicated in `pending/` |
| `studio-shoot-option-matrix.md` | filed in `done/` but header **"🟡 Spec"** | Status/location mismatch |
| `studio-shoot-retailer-rollout.md` | 🟨 code built; **migr 123 applied, 27 rows all `DRAFT`** → invisible to retailers; open 2.4, 2.5, 2.7, 3.8 | Explains "matrix not visible in app" (L-13) |
| `studio-shoot-session-handoff.md` | hand-off | — |

### 11.4 Reference docs (root) — freshness

| File | Last commit | Note |
|---|---|---|
| `PRO-REQUIREMENTS.md` (334 KB) | 10-15 | Master feature index; §40 = F-043 |
| `BUILD-LOG.md` + `build-log/part-1…6` | 10-10 / 10-15 | Append-only; part-6 live |
| `PLAN.md` (118 KB) | 10-10 | Roadmap; "Status: planning doc" |
| `DATABASE.md` | 10-15 | Current (migration 127–129 noted) |
| `SECURITY.md` | 09-26 | Header status says try-on "code complete, not live" |
| `DEPLOY.md` | 09-25 | Meta/Play operator runbook |
| `DESIGN.md` (90 KB) | 09-25 | Claims tokens "live in apps/web and apps/mobile" (see C-01 palette) |
| `MARKETING.md` (128 KB) | 09-25 | Self-declares **7 stale statuses** corrected 2026-09-23 |
| `PLAY-STORE-RELEASES.md` | 09-29 | "Status snapshot: 2026-09-12" still in body; **v7 checklist open** (R8 etc.) |
| `API.md`, `SCALING.md`, `TECH-STACK.md` | 09-25/26 | Not touched in 20-day window |
| `root-cause/` tracker | 09-29 | RC-001…RC-054 in CLAUDE.md |

### 11.5 Documentation conflicts found (fix in a docs pass)

| # | Conflict | Where |
|---|---|---|
| D-1 | **`storefront-soft-404.md` exists in both `pending/` (Planned) and `done/` (Built)** — two files, opposite status | tasks/ |
| D-2 | `referral-program-retailer-affiliate.md` sits at `tasks/` root, **not on the board, not in done/pending**, although T1–T7+T9 are built | tasks/ |
| D-3 | `studio-shoot-option-matrix.md` lives in `done/` with header "🟡 Spec" | tasks/done |
| D-4 | CLAUDE.md index row **100 (F-043)** says Tasks 2–5 "branch … not deployed"; git shows `29e81f4f` (#80) and `3c3b1137` (#83) on `main` and deployed 10-15 | CLAUDE.md |
| D-5 | CLAUDE.md index has **two rows numbered 75** with opposite status (✅ merged / 🧪 unmerged) | CLAUDE.md |
| D-6 | CLAUDE.md still lists F-029 photo rotate (#33), crop/compressor (#22), bg-picker as built; `f1148360` (10-10) **removed** rotate/crop/bg-removal | CLAUDE.md |
| D-7 | CLAUDE.md #67 / F-022 "Planned" but a GBP connect screen ships (S-04) | CLAUDE.md vs app |
| D-8 | `catvton-runpod-tryon-launch.md` header "🔴 Planned" vs index "🟨 Built, flag OFF" | tasks/pending |
| D-9 | `PLAY-STORE-RELEASES.md` body still carries a "2026-09-12" status snapshot | root |
| D-10 | Palette: CLAUDE.md "Black & Gold Elegance" / "Colabs" vs app navy + plum (C-01) | CLAUDE.md vs app |
| D-11 | `root-cause/` filenames contain spaces/parentheses (`root-cause issues (part 2, RC-030 and older).md`) — breaks naive tooling (it broke my first scan) | root-cause/ |

### 11.6 Master "left to do" list (everything still open, de-duplicated)

**A. Verify first (unknown = cheapest wins)**
1. Phone build number vs v6 (G-1); web is current (G-2 refuted).
2. Hard-reload `/privacy` (stale-copy theory); inspect service worker caching of legal pages.
3. Engagement job + beacon (S-06); stylist provider failure (S-03).

**B. Bugs / honesty fixes from this audit** — S-01 stylist price ×100 · S-02 Marketplace Sync fake ·
S-04 GBP token screen · S-05 empty post preview · S-08 product sheet · S-09 IG toggle · design pass §8.

**C. Built but not live (owner/ops gate)** — support sessions (migr 127 + switch) · F-040 try-on (flag +
RunPod + secrets) · F-043 T3/T4 device test + Meta App Review · F-042 browser check · Studio matrix
(27 rows `DRAFT` → publish, engine for 8 MODEL rows) · migrations 093–096 verify · `_prisma_migrations`
reconcile (063, 104–115) · RazorpayX live + webhook `refund.processed`.

**D. Mobile release** — build **v7** (R8 shrink/obfuscate, Play pre-submit checklist) so §10 rows after
v6 reach users; record v6 outcome.

**E. Launch owner actions (23 open)** — lawyer review (privacy/terms/consent copy) · Play listing assets +
Data Safety · `SENTRY_DSN` · rotate dev credentials · MSG91 `verifyAccessToken` lock · replica B-002 ·
k6 run on staging · real-device pass (OTP, onboarding→GST→plan, photo→tag→save, sizes, customers,
WhatsApp link off-LAN, FB/IG, accessibility, offline).

**F. Not started / on hold** — F-022 GBP · F-035 managed WhatsApp · F-039 Style Match Lite · F-041
Pre-Loved · F-001e ghost mannequin · F-034 retailer video + F-032 Phase B · coupon codes · plan-switch
Model B · F-031 Phase 3/4 · F-036 push B–D · i18n Phase B · AI credit/billing engine · T8 Refer &
Earn · `?ref=` Install-Referrer prefill (5B.2/5B.3).

**G. Docs hygiene** — D-1…D-11 above; CLAUDE.md edits need owner approval.

### 11.7 Comparison summary — code vs docs vs app

| Layer | State |
|---|---|
| **Code on `main`** | Ahead of the binary; web/API/admin deployed at `47a78d9a` (§10.1a) |
| **Android binary** | v6 (~09-29); 10 later mobile commits unshipped; v7 not built |
| **Docs** | Mostly accurate on *feature* status but with 11 specific conflicts (§11.5) and over-credit on integrations (S-02, S-04) |
| **Gated by design** | Support sessions, try-on, scheduler publish, Studio styles (DRAFT), IG connect (Meta) |
| **Net reading** | "Done in docs, not in app" = **(1) old binary** + **(2) gated rows** + **(3) a few placeholders marked ✅** — not mass fabrication. Fix order: v7 build → un-gate → honesty fixes |

---

## 12. Full 20-day record — 2026-09-24 → 2026-10-15 (source: `git log` + `gh pr list` on `main`)

**Why this section exists:** §10 grouped the window into 24 feature rows. This section is the
**complete, un-grouped record** — every commit, every merged PR, every migration, every RC minted —
so each point can be ticked off against mobile / web / admin. Surface key: **M** mobile ·
**W** customer web · **A** admin panel (`apps/web/src/app/admin`) · **API** · **DB** (schema/migration) ·
**docs**. Rows with no surface letter touched only CI / config / repo files.

### 12.1 Totals

| Metric | Value |
|---|---|
| Window | 2026-09-24 → 2026-10-15 (22 days) |
| Non-merge commits on `main` | **86** (kapisejix 44, Sandeep 42; 2 merge commits) |
| Merged PRs | **44** (#37 → #84) |
| Open PRs at time of scan | **0** |
| Migrations added | **12** (118–129) |
| Root-cause entries minted | RC-044 → RC-054 (11) + RC-037…043 documented 09-25 |
| Commits touching mobile | 19 (10 after the v6 build) |
| Commits touching only docs/CI | ~35 |

### 12.2 Day-by-day

| Date | What happened |
|---|---|
| 09-24 | Launch readiness §7A closed: storefront SEO + JSON-LD (RC-040 XSS fix), Apple review OTP bypass, DR runbook, retailer photo-retention notice, k6 load scripts, **40/40 RC re-test pass** |
| 09-25 | F-038 referral program (T1–T9) merged (#37); docs tree reorganized (#39); **RC-041 deep links, RC-042 keyboard-inset primitive, RC-043 one app identity**; `?ref=` capture on `/for-retailers`; FB `pages_read_engagement`; AI Stylist category/age/gender filter fix |
| 09-26 | **F-040 CatVTON try-on** built (RunPod worker, gated route + job, consent gate, dual quota, deletion sweep; migrations 118–120); RC-044, RC-045; F-039 Style Match spec; docs split under size limit |
| 09-27 / 09-28 | RC-046 tracker derivation; **F-037 engagement Phases 2–4** (nightly rollup, admin dashboard, retailer view, social-proof chips; migrations 121/122); dead-code removal; suite-wide test budget; RC-047 minted |
| 09-29 | F-037 storefront engagement (#41); Play **v6 logged, versionCode 7 reserved**; web build incident (see §12.8) |
| 09-30 → 10-02 | Studio bench: Product Only PS-01…16, Model Only MI/MO, photography-style picker; WhatsApp API screen fix |
| **10-10** | Heaviest day: **#49** remove bg-removal/rotate/crop/ranking/dup-detect/colour-fill; **#50** admin memory card; **#54** Studio option matrix (F-032); **#55** 9-point batch + delete-permission audit + WhatsApp Cloud API config; **#58** RLS `design_references`; **#59/#64/#65** soft-404; **#60** dead integrations removed; **#63** nearby stores; RC-049…054 |
| 10-11 | Review follow-ups for #49–#65 (#70) |
| 10-14 | **F-042** homepage category grid (#72, #73); FB carousel fix (#76); FB/staff fixes |
| 10-15 | **Support sessions** (#77); **F-043 scheduler** T1/T2/T5 (#79, #80, #83) with T3 UI + T4 templates in tree; IG not-shared guidance (#84); category-feed pilot thresholds (#75); recommendation fallback (#42) |

### 12.3 Every commit (86) — newest first

| SHA | Date | Author | Surfaces | Files | Lines | Subject |
|---|---|---|---|---|---|---|
| 99943fae | 2026-10-15 | Sandeep | docs | 3 | +78/−23 | docs(tasks): Railway memory culprit resolved + queue storefront soft-404 (#51) |
| 47a78d9a | 2026-10-15 | Sandeep | API  | 2 | +83/−52 | fix(api): fall back to catalog when recommendation signals fail (#42) |
| 2e6814c2 | 2026-10-15 | Sandeep | API  | 2 | +16/−8 | fix(api): lower category-feed thresholds for pilot (2 products / 1 shop) (#75) |
| 8b1cf41b | 2026-10-15 | Sandeep | M API  | 2 | +6/−4 | fix(social): clearer Instagram not-shared guidance; stop fabricating OAuth code/state (#84) |
| 3c3b1137 | 2026-10-15 | Sandeep | M API docs | 31 | +3410/−16 | feat(social): F-043 scheduler task 5 — hardening + launch checklist (stacked on #82) (#83) |
| 29e81f4f | 2026-10-15 | Sandeep | API docs | 9 | +814/−12 | feat(social): F-043 scheduler task 2 — publish tick + token health (#80) |
| f53942a5 | 2026-10-15 | Sandeep | M A API DB docs | 22 | +1851/−8 | feat(social): F-043 scheduler task 1 — schema, plan builder, calendar API, admin keys, manager routes (#79) |
| 591ddc93 | 2026-10-15 | Sandeep | docs | 5 | +251/−2 | docs: F-043 social post scheduler spec (approved) + fix CLAUDE.md row 46 (#78) |
| 0503c851 | 2026-10-15 | Sandeep | M A API DB docs | 29 | +1848/−19 | feat: Kanchuki-staff support sessions (retailer-approved, scoped, 24h) (#77) |
| ecea0383 | 2026-10-14 | Sandeep | M W API docs | 20 | +528/−25 | fix(social): FB carousel posted text only + empty collection-carousel preview (#76) |
| ea087f95 | 2026-10-14 | Sandeep | docs | 3 | +12/−1 | docs: record F-042 homepage category grid (index, build log, spec status) (#74) |
| c398dc75 | 2026-10-14 | Sandeep | W API  | 5 | +264/−50 | feat(web,api): homepage category grid + View more -> /category/[name] (#73) |
| 20552205 | 2026-10-14 | Sandeep | W API  | 9 | +453/−1 | feat(web,api): homepage category-wise product rows (F-042) (#72) |
| 3af24c58 | 2026-10-14 | Sandeep | docs | 1 | +25/−0 | docs(tasks): add category-wise layout to F-042 homepage product browse (#71) |
| ad00f8f8 | 2026-10-11 | Sandeep | W API docs | 45 | +63/−52 | fix: review follow-ups for #49-#65 (SET LOCAL, URL encoding, orphans, caps) (#70) |
| e7777ab6 | 2026-10-10 | Sandeep | docs | 7 | +7/−5 | docs(tasks): move Studio Shoot option matrix to done (#69) |
| 9a231120 | 2026-10-10 | Sandeep | docs | 1 | +5/−2 | docs(tasks): sync board rows with pending/done folders (#68) |
| e485c09d | 2026-10-10 | Sandeep | docs | 28 | +0/−0 | chore(docs): drop stale effect-photos bench images from docs/tasks (#67) |
| 62ae1310 | 2026-10-10 | Sandeep | docs | 2 | +79/−0 | docs(tasks): add F-042 homepage product browse spec + board row (#66) |
| b4124615 | 2026-10-10 | Sandeep | W  | 4 | +68/−54 | fix(web): real 404 for unknown legacy /c/{slug} (soft-404) (#65) |
| 4fab6a6b | 2026-10-10 | Sandeep | W docs | 5 | +76/−18 | fix(web): real 404 for unknown stores (soft-404 root cause) (#64) |
| 51628b0e | 2026-10-10 | Sandeep | W API docs | 18 | +1192/−163 | feat: nearby store cards on /stores + homepage; F-041 Pre-Loved spec (#63) |
| a6e3e65c | 2026-10-10 | Sandeep | docs | 2 | +4/−4 | docs: flip index row 98 to Built; fill merge SHAs in #55-batch log (#62) |
| fc3eb4ee | 2026-10-10 | Sandeep | docs | 3 | +20/−1 | docs: BUILD-LOG + CLAUDE.md index rows for the #55 batch (#55-#60) (#61) |
| c8562a5e | 2026-10-10 | Sandeep | M  | 6 | +3/−974 | chore(mobile): drop unreachable YouTube/X/Pinterest screens and fake-success integration fallbacks (#60) |
| 3abc2f73 | 2026-10-10 | Sandeep | W docs | 3 | +69/−0 | fix(web): 404 scanner probes at middleware (soft-404, Sentry noise) (#59) |
| 52897e5e | 2026-10-10 | Sandeep | DB  | 1 | +53/−0 | feat(db): RLS on design_references (migration 126) (#58) |
| aaaee1df | 2026-10-10 | Sandeep | API docs | 2 | +195/−2 | test(api): DELETE-grant + retailer-purge-list guards (RC-049, RC-050) (#57) |
| 6081643e | 2026-10-10 | Sandeep | docs | 2 | +70/−1 | docs(rc): add RC-049..RC-054 (root-cause entries for #55) (#56) |
| b6af02f7 | 2026-10-10 | Sandeep | M W A API DB  | 14 | +264/−255 | fix: mobile/admin 9-point batch + delete-permission audit + WhatsApp Cloud API config (#55) |
| be8c48c1 | 2026-10-10 | Sandeep | M W API DB docs | 19 | +1587/−451 | feat(studio): option-matrix rollout — shared styles, server pools, product gating, mobile picker (F-032) (#54) |
| c41f0b25 | 2026-10-10 | Sandeep | docs | 2 | +13/−2 | docs: sync Studio Shoot status in tasks/README and PRO-REQUIREMENTS (§24.14) (#53) |
| 1220c8b5 | 2026-10-10 | Sandeep | W A docs | 5 | +1236/−61 | feat(web): final owner prompts on the studio bench (PS-03..16, MI/MO) + run 2/3 checklist (#52) |
| 59f9fa59 | 2026-10-10 | Sandeep | A API docs | 10 | +392/−0 | feat(admin): server memory card — live API RSS/heap/native + 24 h history (#50) |
| f1148360 | 2026-10-10 | Sandeep | M API DB docs | 30 | +187/−2195 | chore: remove background removal, rotate, crop, ranking, duplicate detect, colour auto-fill (#49) |
| adb96a18 | 2026-10-02 | kapisejix | W A  | 2 | +69/−0 | feat(web): Model Only styles MI-01..11 / MO-01..07 dropdown on admin studio bench |
| c76fba2c | 2026-10-01 | Sandeep | M  | 2 | +13/−5 | fix(mobile): WhatsApp API screen — billing notice, no fake credentials, surface save errors (#48) |
| 51daafb7 | 2026-10-01 | Sandeep | W  | 1 | +13/−0 | feat(web): add Product Only styles PS-05..15 to admin bench dropdown (#47) |
| f6561d4b | 2026-10-01 | Sandeep | A  | 1 | +11/−5 | feat(web): hide garment-identity / length / cost-note blocks in Product Only mode (#46) |
| 371d1027 | 2026-10-01 | Sandeep | A  | 1 | +36/−5 | feat(web): bench "Product Only" checkbox — send the custom prompt raw (#45) |
| ed14b002 | 2026-10-01 | Sandeep | W A API  | 3 | +36/−10 | fix: PS-04 prompt — headless torso dress form (#44) |
| d21d6ce9 | 2026-10-01 | Sandeep | W A API  | 3 | +75/−2 | feat(web,api): Product Only styles PS-01..04 on the admin studio bench (#43) |
| 904a0a15 | 2026-09-30 | kapisejix | W A  | 3 | +71/−5 | feat(web): photography-style picker on the admin studio bench |
| eba264a7 | 2026-09-30 | kapisejix | docs | 6 | +66/−68 | docs(ai-studio): fix bench-results paths + stale "not run live" status |
| ef594f46 | 2026-09-29 | Sandeep | M W API docs | 58 | +3089/−233 | F-037 storefront engagement + Play release bookkeeping (v6 logged, versionCode 7 reserved) (#41) |
| bb24d6e5 | 2026-09-28 | kapisejix | docs | 2 | +25/−2 | docs: mint RC-047 for the deploy-gate root cause + correct the 122 status |
| d7a08b9b | 2026-09-28 | kapisejix | A  | 1 | +1/−1 | fix(web): escape-free wording in the engagement dashboard |
| aac12cce | 2026-09-28 | kapisejix | API docs | 3 | +45/−1 | test(api): suite-wide test budget replaces the per-file timeout patches |
| 709da8ca | 2026-09-28 | kapisejix |  | 1 | +1/−1 | docs: F-037 CLAUDE.md index row — §2 row 5 shipped (owner approved) |
| e1bf6e65 | 2026-09-28 | kapisejix | DB  | 1 | +4/−4 | fix(db): correct RetailerEngagementDaily's rollup JSON comments |
| d77f357b | 2026-09-28 | kapisejix | W API docs | 13 | +1082/−8 | feat(engagement): F-037 §2 row 5 — real social-proof chips on the storefront |
| af65a65f | 2026-09-28 | kapisejix |  | 1 | +1/−1 | docs: F-037 CLAUDE.md index row — Phase 3 built, Phase 4 partial (owner approved) |
| 4a5cb825 | 2026-09-28 | kapisejix | M A API DB docs | 21 | +1353/−137 | feat(engagement): admin dashboard + audited drill-down + retailer view (F-037 Phase 3+4) |
| a3b08ca9 | 2026-09-28 | kapisejix | docs | 2 | +2/−2 | docs: record migration 121 applied + F-037 index row (owner approved) |
| f29e388a | 2026-09-28 | kapisejix | API DB docs | 8 | +620/−4 | feat(engagement): nightly aggregation job (F-037 Phase 2) |
| d7497731 | 2026-09-28 | kapisejix | docs | 5 | +28/−248 | test(referral): run purge-rls-live.test.ts for real (board §2.1) |
| 9e2ad556 | 2026-09-28 | kapisejix | M A API docs | 5 | +82/−185 | chore: remove orphaned dead code (fashion_dna config, Lookbook/Festival Background bindings) |
| a90ad39e | 2026-09-28 | kapisejix | docs | 1 | +18/−7 | docs(tryon): record T8 progress — pushed to main, regression re-verified |
| f0c22a03 | 2026-09-27 | kapisejix | docs | 5 | +154/−5 | docs(root-cause): derive the tracker's owed list instead of hand-writing it (RC-046) |
| 710e02b4 | 2026-09-26 | kapisejix | M W A API DB docs | 52 | +104/−76 | docs: give the CatVTON try-on its own number (F-040) |
| 7268c9ad | 2026-09-26 | kapisejix | W docs | 9 | +161/−14 | fix(web): pass a null body through for a null-body upstream status (RC-045) |
| 361cd2ec | 2026-09-26 | kapisejix | M W A API DB docs | 52 | +5065/−115 | feat(tryon): F-039 Phase 2 — consent gate, dual quota, deletion sweep (RC-044) |
| 518d1bee | 2026-09-26 | kapisejix |  | 1 | +2/−2 | ci(tryon): restore GHCR_PAT credential for the image push |
| 5668d327 | 2026-09-26 | kapisejix |  | 1 | +5/−2 | ci(tryon): authenticate GHCR with the built-in token |
| 21c91145 | 2026-09-26 | kapisejix | API DB docs | 27 | +2656/−28 | feat(tryon): F-039 Phase 2 — gated try-on route, job, schema + dual quota |
| 93b72534 | 2026-09-26 | kapisejix | docs | 9 | +722/−2 | feat(tryon): restore RunPod CatVTON worker + admin-manageable RunPod keys |
| f69c03cb | 2026-09-26 | kapisejix | docs | 4 | +299/−0 | docs: F-039 Phase 2 spec — CatVTON-on-RunPod, admin-gated launch + dual quota |
| 3ccc5973 | 2026-09-26 | kapisejix | docs | 5 | +435/−0 | docs: F-039 Style Match Lite spec + readymade-only VTO cost addendum |
| 6143775f | 2026-09-26 | kapisejix |  | 2 | +2/−2 | fix(shared): doc-table-guard ESM import ext + noUncheckedIndexedAccess |
| e3ad6f95 | 2026-09-26 | kapisejix | docs | 11 | +4260/−4203 | docs: split BUILD-LOG.md and root-cause issues.md under 150k-char limit |
| cd75c135 | 2026-09-26 | kapisejix |  | 1 | +100/−100 | docs: condense CLAUDE.md What's-Built/RC tables under 150k-char limit |
| 6d18a5be | 2026-09-25 | kapisejix | W API  | 5 | +391/−57 | fix(customer-web): AI Stylist category/age/gender filter bug + catalog-derived suggestions |
| a9cfed78 | 2026-09-25 | kapisejix | docs | 8 | +260/−8 | test(shared): wire the doc-table cell-count scan in as a real test (§8.4) |
| 3f827890 | 2026-09-25 | kapisejix | docs | 5 | +47/−19 | docs: RC-037 tracker row, board §8.1-8.3, escape unescaped table pipes |
| 96aaff84 | 2026-09-25 | kapisejix | docs | 5 | +172/−11 | docs: RC-041 / RC-042 / RC-043 records, and the tracker's duplicate rows |
| 998cc0e1 | 2026-09-25 | kapisejix | M API  | 20 | +756/−108 | feat(shared): RC-043 — one app identity for all three apps, one comment-stripper for the guards |
| 6b0f98e7 | 2026-09-25 | kapisejix | M W A  | 57 | +1902/−254 | refactor(ui): RC-042 — one keyboard-inset primitive per platform |
| 019057d0 | 2026-09-25 | kapisejix | W  | 6 | +194/−4 | fix(web): RC-041 — build every web deep link from one shared module |
| b805344c | 2026-09-25 | kapisejix |  | 1 | +1/−2 | docs: fix stale WhatsApp per-conversation pricing in CLAUDE.md |
| afe2f6a2 | 2026-09-25 | kapisejix | API  | 4 | +40/−14 | chore: fix biome import-sort lint errors from earlier session edits |
| 93c07efc | 2026-09-25 | kapisejix | M W API docs | 115 | +12563/−26607 | docs: consolidate docs/ into lean top-level files |
| 247ff075 | 2026-09-25 | kapisejix |  | 1 | +3/−0 | chore: ignore docs/ai-studio/ scratch session notes |
| 997362d9 | 2026-09-25 | kapisejix | M API  | 5 | +107/−1 | feat(social): real pages_read_engagement feature for FB App Review |
| 21aa866f | 2026-09-25 | kapisejix | W docs | 7 | +170/−16 | feat(web): referral ?ref= capture on /for-retailers, scope reduced (§5B.1) |
| 9c562890 | 2026-09-24 | kapisejix | API docs | 9 | +1414/−1 | feat(load): k6 load-test scripts against staging + guard + runbook (§7A.5) |
| d284826a | 2026-09-24 | kapisejix | docs | 3 | +80/−2 | docs: pre-production re-test of every RC-### (§7A.7) — 40/40 pass |

### 12.4 Every merged PR (44)

| PR | Merged | Branch | Title |
|---|---|---|---|
| #37 | 2026-09-25 | `chore/remove-text-to-image-studio-engines` | feat: F-038 referral program (T1–T9) + studio bench + DPDP notice update |
| #39 | 2026-09-25 | `docs/reorganize` | docs: reorganize the docs tree (structure + old paths removed) |
| #41 | 2026-09-29 | `kapisejix/feat/f037-storefront-engagement` | F-037 storefront engagement + Play release bookkeeping (v6 logged, versionCode 7 reserved) |
| #42 | 2026-10-15 | `fix/recs-fallback` | fix(api): fall back to catalog when recommendation signals fail |
| #43 | 2026-10-01 | `feat/studio-product-styles-ps01-04` | feat: Product Only styles PS-01..04 on admin studio bench |
| #44 | 2026-10-01 | `fix/ps04-headless-dress-form` | fix: PS-04 prompt — headless torso dress form |
| #45 | 2026-10-01 | `feat/bench-raw-product-prompt` | feat: bench Product Only checkbox — send custom prompt raw |
| #46 | 2026-10-01 | `feat/bench-hide-garment-fields` | feat: hide unused bench fields in Product Only mode |
| #47 | 2026-10-01 | `feat/product-styles-ps05-15` | feat(web): Product Only styles PS-05..15 in admin bench dropdown |
| #48 | 2026-10-01 | `fix/whatsapp-api-screen-billing-notice` | fix(mobile): WhatsApp API screen — billing notice, no fake credentials, surface save errors |
| #49 | 2026-10-10 | `chore/remove-background-removal` | chore: remove background removal, rotate, crop, ranking, duplicate detect, colour auto-fill |
| #50 | 2026-10-10 | `feat/admin-memory-card` | feat(admin): server memory card (live API RSS/heap/native + 24 h history) |
| #51 | 2026-10-15 | `docs/railway-memory-resolved` | docs(tasks): Railway memory culprit resolved + queue storefront soft-404 |
| #52 | 2026-10-10 | `feat/studio-final-prompts` | feat(web): final owner prompts on the studio bench (PS-03..16, MI/MO) |
| #53 | 2026-10-10 | `docs/studio-shoot-doc-sync` | docs: sync Studio Shoot status (tasks/README + PRO-REQUIREMENTS §24.14) |
| #54 | 2026-10-10 | `feat/studio-shoot-option-matrix` | feat(studio): option-matrix rollout — shared styles, server pools, product gating, mobile picker (F-032) |
| #55 | 2026-10-10 | `fix/mobile-admin-batch-2026-10-10` | fix: mobile/admin 9-point batch + delete-permission audit + WhatsApp Cloud API config |
| #56 | 2026-10-10 | `docs/rc-049-054` | docs(rc): add RC-049..RC-054 (root-cause entries for #55) |
| #57 | 2026-10-10 | `chore/db-delete-guards` | test(api): DELETE-grant + retailer-purge-list guards (RC-049, RC-050) |
| #58 | 2026-10-10 | `chore/design-references-rls` | feat(db): RLS on design_references (migration 126) |
| #59 | 2026-10-10 | `fix/storefront-soft-404` | fix(web): 404 scanner probes at middleware (soft-404) |
| #60 | 2026-10-10 | `chore/growth-integrations-cleanup` | chore(mobile): remove dead integrations screens + fake-success fallbacks |
| #61 | 2026-10-10 | `docs/55-batch-buildlog` | docs: BUILD-LOG + index rows for #55 batch |
| #62 | 2026-10-10 | `docs/row-98-built` | docs: row 98 -> Built, merge SHAs for #55 batch |
| #63 | 2026-10-10 | `feat/nearby-stores-f041-spec` | feat: nearby store cards on /stores + homepage; F-041 Pre-Loved spec |
| #64 | 2026-10-10 | `fix/storefront-soft-404` | fix(web): real 404 for unknown stores (soft-404) |
| #65 | 2026-10-10 | `fix/legacy-collection-soft-404` | fix(web): real 404 for unknown legacy /c/{slug} |
| #66 | 2026-10-10 | `docs/homepage-product-browse` | docs(tasks): F-042 homepage product browse spec |
| #67 | 2026-10-10 | `chore/remove-stale-effect-photos` | chore(docs): drop stale effect-photos bench images |
| #68 | 2026-10-10 | `docs/tasks-board-sync` | docs(tasks): sync board rows with pending/done folders |
| #69 | 2026-10-10 | `docs/studio-shoot-to-done` | docs(tasks): move Studio Shoot option matrix to done |
| #70 | 2026-10-10 | `fix/review-followups-pr49-65` | fix: review follow-ups for #49-#65 (SET LOCAL, URL encoding, orphans, caps) |
| #71 | 2026-10-14 | `docs/f-042-category-wise-layout` | docs(tasks): add category-wise layout to F-042 homepage product browse |
| #72 | 2026-10-14 | `feat/homepage-category-feed` | feat(web,api): homepage category-wise product rows (F-042) |
| #73 | 2026-10-14 | `feat/category-grid-view-more` | feat(web,api): homepage category grid + View more page (F-042 stage 3) |
| #74 | 2026-10-14 | `docs/f042-category-grid` | docs: record F-042 homepage category grid |
| #75 | 2026-10-15 | `fix/feed-pilot-thresholds` | fix(api): lower category-feed thresholds for pilot |
| #76 | 2026-10-14 | `fix/fb-carousel-media-and-preview` | fix(social): FB carousel posted text only + empty collection-carousel preview |
| #77 | 2026-10-15 | `feat/support-session-grants-schema` | feat: Kanchuki-staff support sessions (retailer-approved, scoped, 24h) |
| #78 | 2026-10-15 | `docs/f-043-post-scheduler-spec` | docs: F-043 social post scheduler spec + fix CLAUDE.md row 46 |
| #79 | 2026-10-15 | `feat/f-043-schema-plan-builder` | feat(social): F-043 scheduler Task 1 — schema, plan builder, calendar API, admin keys, manager routes |
| #80 | 2026-10-15 | `feat/f-043-publish-tick` | feat(social): F-043 scheduler task 2 — publish tick + token health |
| #83 | 2026-10-15 | `feat/f-043-hardening` | feat(social): F-043 scheduler task 5 — hardening + launch checklist (stacked on #82) |
| #84 | 2026-10-15 | `fix/ig-connect-guidance` | fix(social): clearer Instagram not-shared guidance; no fabricated OAuth code |

### 12.5 Migrations added in the window

| # | Name | Date | Purpose | Applied? (per repo docs, not DB-verified) |
|---|---|---|---|---|
| 118 | `try_on_v2_enum_values` | 09-26 | F-040 enums | ✅ applied 2026-09-26 |
| 119 | `try_on_v2_tables` | 09-26 | F-040 tables + dual quota | ✅ applied 2026-09-26 |
| 120 | `try_on_consent` | 09-26 | F-040 consent | ✅ applied 2026-09-26 |
| 121 | `engagement_aggregates` | 09-28 | F-037 nightly rollups | ✅ applied 2026-09-28 (`a3b08ca9`) |
| 122 | `engagement_top_favorited` | 09-28 | F-037 top-favorited | status "corrected" in BUILD-LOG 2026-09-29 (RC-047 entry) — **verify** |
| 123 | `studio_styles_option_matrix` | 10-10 | F-032 matrix, 27 rows | ✅ applied by owner; **all rows `DRAFT`** |
| 124 | `campaigns_purge_grant` | 10-10 | DELETE grant (RC-049) | ✅ applied by owner |
| 125 | `app_role_delete_grants` | 10-10 | DELETE grants `kanchuki_app`/`kanchuki_purge` | ✅ applied by owner |
| 126 | `design_references_rls` | 10-10 | RLS | ✅ applied by owner |
| 127 | `support_session_grants` | 10-15 | support-session consent grants | ❌ **NOT applied** (switch OFF) |
| 128 | `scheduler_enums` | 10-15 | F-043 enums | ✅ applied in prod |
| 129 | `post_scheduler` | 10-15 | F-043 plans/posts | ✅ applied in prod |

### 12.6 Root-cause entries in the window

| RC | Root cause (one line) | Fixed in |
|---|---|---|
| RC-037 | Mocks returned the object they stored, so three payout bugs were invisible | 09-25 docs/tests |
| RC-038 | A status value with a documented meaning and no producer | — |
| RC-039 | A test outlived its own fixture | — |
| RC-040 | `JSON.stringify` used as an HTML escaper → stored XSS in JSON-LD | 09-24 |
| RC-041 | Package name hand-duplicated across files, nothing pinned them | `019057d0` |
| RC-042 | Keyboard inset was a per-screen convention nobody applied | `6b0f98e7` |
| RC-043 | Eleven copies of one test helper, two broken, none tested | `998cc0e1` |
| RC-044 | Withdrawn try-on image deleted by two best-effort paths with no durable record/retry | `361cd2ec` |
| RC-045 | Proxy rebuilt null-body statuses (204/205/304) with a body → fire-and-forget beacons failed silently | `7268c9ad` |
| RC-046 | "Owed" list hand-written, never re-derived | `f0c22a03` |
| RC-047 | Deploy pipeline had no "new revision is live" signal; failed build reported as success | `bb24d6e5` |
| RC-048 | A fix stranded on an unmerged PR + unstubbed fetches kept the customer suite red | 09-29 |
| RC-049 | App DB role has DELETE revoked; ~19 routes/jobs still deleted through it → 42501 | #55 |
| RC-050 | `hardDeleteRetailer()` table list missed 5 RESTRICT-FK children | #55 |
| RC-051 | Integration screens "connected" to routes that never existed; `.catch` turned 404 into Verified | #55/#60 |
| RC-052 | Admin sidebar flyout 8 px off its trigger, no viewport clamp | #55 |
| RC-053 | Prev/Next replaced the grid but never reset scroll offset | #55 |
| RC-054 | No `StatusBar` style declared → white icons on white | #55 |

### 12.7 BUILD-LOG part-6 entries for the window (24)

| Date | Entry |
|---|---|
| 09-24 | Pre-production re-test of every RC (40/40) · k6 load scripts |
| 09-25 | `?ref=` capture · keyboard-inset primitives (RC-042) · deep links (RC-041) · app identity + comment-stripper (RC-043) · manifest stops repeating identity |
| 09-28 | `purge-rls-live.test.ts` run for real · F-037 Phase 2 nightly aggregation · F-037 §2 recommendations (recently viewed, related, size filter, videos) · store-local "Picked for you" |
| 09-29 | F-037 Phase 3+4 · social-proof chips (+ follow-ups) · test-infra budget · **web-build incident** · RC-047 · 24-month raw-event prune · storefront pager Prev/Next (RC-048) |
| 10-10 | #55 batch |
| 10-14 | F-042 homepage grid (#71–#73) |
| 10-15/16 | F-043 Task 1 · Task 2 publish tick · Task 3 mobile UI + status endpoint · Task 4 image templates · Task 5 hardening + launch checklist |

### 12.8 Incident in the window that explains "merged but not live"

**2026-09-29 — web build Railway rejected: one unescaped apostrophe, and a pipeline that reports success
on a red build** (BUILD-LOG part-6; fix `d7a08b9b`; root cause RC-047). Between the offending commit
and the fix, `main` was ahead of production while CI looked green. The same failure mode applies any
time a deploy record says "success". This is why §10.1a cross-checks the **live page content**, not
only the deploy record.

### 12.9 Corrections to earlier sections of this file

| Earlier claim | Correction (verified in tree) |
|---|---|
| §10 L-01: "T3 UI + T4 templates … confirm they are inside #83" | **Confirmed in tree:** `apps/mobile/app/social/schedule/{index,new,[id]}.tsx`, `SchedulerBanner.tsx`, `apps/mobile/src/lib/api/schedule.ts`, `packages/ai/src/schedule-templates.ts`, `apps/api/src/lib/schedule-render.ts` are on `main`. Scheduler UI **exists in code**; it is absent from the v6 binary |
| D-4: CLAUDE.md row 100 says branches "not deployed" | Confirmed stale — all five tasks' code is on `main` and deployed 10-15 |
| §0 conversation log stopped at #5 | Continued in §12.11 |

### 12.10 `support-and-feedback-loop.md` — findings merged here (so this file is self-contained)

| Area | Finding |
|---|---|
| Retailer ticket | **No retailer endpoint or screen creates a general `SupportTicket`.** `supportTicket.create` is called only by staff (`team-tickets.ts:174`), catalog-upload (`retailers-catalog-upload.ts:68`) and staff-started sessions (`team-support-sessions.ts:137`). "Report a Problem" (Settings → Actions, `settings/index.tsx:1589`) writes a `BugReport`, not a ticket |
| Retailer ↔ staff access | Support-session approve/revoke UI exists (`settings/support-sessions.tsx`, `SupportSessionPrompt.tsx`) but is staff-initiated and **not live** (migr 127, switch OFF) |
| Staff side | `staff/index.tsx` shows ticket stats; `staff/catalog-tickets.tsx` lists **only** `CATALOG_UPLOAD`; no general-ticket list |
| Feedback sources | Staff discovery survey (web page → `AuditLog` `RetailerSurvey`, admin list only, no aggregation) · `BugReport` (admin list + counts) · `StoreReview`/`ProductReview` (retailer sees own; no cross-retailer admin view) |
| Missing | Retailer in-app feedback/NPS · staff mobile feedback capture · customer "tell Kanchuki" · structured `FeedbackEntry` table · admin report/CSV |
| Proposed build order | 1 retailer `POST/GET /me/tickets` + Help & Support screen · 2 staff general-ticket list · 3 `FeedbackEntry` migration + capture endpoints · 4 staff + retailer feedback screens · 5 admin `/admin/feedback` + CSV · 6 customer-web "Tell Kanchuki" · 7 backfill survey rows · 8 AI theme summary job |
| What each side wants (research-derived, no live data) | **Retailer:** faster entry, being found online, WhatsApp without chaos, CRM/follow-up, less staff time, festival promotion. **Customer:** no-app browse, filter by colour/fabric/price/size, favourite + enquire in one tap, trust signals, restock notify |
| Owner decisions | ticket vs consent as two steps? · customer feedback in MVP? · report format · survey in staff app or web? · F-number |

### 12.11 Conversation log — continued from §0

| # | Owner asked | Answer / outcome |
|---|---|---|
| 6 | Upload 11 screenshots; find all issues, document in detail | §1–§7: S-01…S-12, C-01…C-09; verified S-01/S-02/S-07 in code |
| 7 | How to improve design; how to find fake/hard-coded data | §8 design method; §9 three-layer detection (grep → runtime trace → permanent guards) |
| 8 | List last 15–20 days of development and whether it reached mobile/web/admin | §10 ledger (24 grouped rows) + §10.1 gaps G-1/G-2 |
| 9 | Check Railway web deploy SHA vs `main` | §10.1a: deployed `47a78d9a`, `main` `99943fae` (docs-only); live privacy matches `main`; G-2 refuted; Railway MCP unauthorized |
| 10 | Compare everything + all `.md` under docs/tasks/pending/done | §11 inventory + status + conflicts D-1…D-11 + master left-to-do |
| 11 | "Everything mentioned in this file?" → no; add the missing, all 20-day records, no suggestions | This §12 |

### 12.12 Still not in this file (stated plainly)

- Contents of the large specs beyond status/checklists (PRO-REQUIREMENTS, ai-photo-generation, catvton, PLAN, MARKETING, DEPLOY, SECURITY, DESIGN) and BUILD-LOG parts 1–5 (pre-window).
- Per-commit diffs (what each commit changed line by line) — only file counts and +/− totals.
- Live DB / flag / Railway-service state (policy: no prod access; Railway MCP unauthorized).
- Pre-2026-09-24 history.
