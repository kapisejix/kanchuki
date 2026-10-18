# F-045 — My Style: customer photo → cross-store suggestions (customer web only)

**Status (2026-10-18):** 🟨 **PR-1..PR-7 merged; PR-8 (admin + retailer ranking note) built on `feat/f-045-admin`, migration 134 owner-applies.** **PR-9 find-similar built on `feat/f-045-find-similar` (no migration), not merged.** **PR-10a (Festival / Occasion / Trending tabs, RC-070) built on `feat/f-045-tabs`, not merged, no migration.** PR-10b complete-the-look, PR-11 try-on hand-off (gated) not started. **AI occasion tagging re-added** on `feat/ai-occasion-tagging` (ranking input for `occasions`; new uploads tagged, backfill built but not run, no migration), a prerequisite for the PR-10 Occasion tab. Detail per PR: `docs/build-log/part-6.md`.
**Filed:** 2026-10-17. **Surface:** customer web PWA (`apps/web`) only. **Not** the retailer mobile app, **not** the retailer dashboard.
**Related:**
- `docs/tasks/pending/style-match-lite.md` (F-039) — this spec **supersedes F-039 MID** and absorbs its quiz wiring (§3.1) and no-store selfie call (§3.2). F-039 stays as the research record.
- `docs/tasks/pending/catvton-runpod-tryon-launch.md` (F-040) and `docs/tasks/pending/enquiry-basket-team-inbox-and-instore-tryon.md` (F-044) — see §2.2: **customer-side try-on is switched OFF** (`CUSTOMER_TRY_ON_ENABLED = false`, E6). My Style does not depend on it.
- `docs/tasks/pending/customer-engagement-analytics.md` (F-037), `docs/tasks/pending/homepage-product-browse.md` (F-042).
- `docs/SECURITY.md` §3b/§3c (photo promise), DPDP notice, `docs/root-cause/root-cause issues.md` (RC list in §8).

Legend: **S** < 1 h · **M** 1–3 files · **L** cross-cutting / migration.

---

## 0. Owner decisions (answered 2026-10-17)

| # | Decision |
|---|---|
| D1 | **Kanchuki pays** for AI calls for now. Per-customer limits are admin-editable later (`customer_resource_limits`). A purchase-linked reward is **not** built (no verified-purchase signal exists; see D6). |
| D2 | **Best-match-first**, distance second. Customer can switch sort: **Best match · Nearest · Price**. |
| D3 | **Both** photo inputs in v1: selfie/full-body *and* "find similar" from a screenshot/photo of a garment. |
| D4 | **Kids:** the parent fills a form or describes the need in AI Stylist. **No photos of children**, ever. |
| D5 | Page name **My Style**, route `/my-style`. |
| D6 | **No online purchase for the next 3–5 months.** "Buy" means **Enquire** (enquiry → WhatsApp → store). Online purchase is planned **later**, once customers trust retailers and the flow is stable. Design must not block it (§5); nothing for it is built. |

---

## 1. Goal and non-goals

**Goal.** A signed-in customer gets a personal page that turns *a photo of themselves* (or a garment they like, or just a short form) into a ranked list of in-stock articles from **many stores**, and can shortlist and **enquire** with each store. It is the cross-store, personal counterpart of the per-store AI Stylist.

**Non-goals (explicit):**
- Online checkout, cart payments, wallets, purchase rewards (D6). Checkout stays removed (teardown 2026-08-31).
- Photoreal try-on for customers (OFF per E6; §2.2). A hand-off hook is specified (PR-11) but **gated and not built**.
- Size or measurement **inferred from a photo** (excluded by F-039 §8). Size comes from `CustomerAccount.usual_size` / the form.
- Any photo of a minor. Any stored selfie.
- Retailer-facing UI. Retailers get a one-line explainer of how ranking works (PR-8), nothing else.
- Paid ranking / pay-to-rank. Ranking is never for sale.

---

## 2. Verified current state (code read 2026-10-17)

### 2.1 Reusable

| Need | Where | Notes |
|---|---|---|
| Authenticated shopper shell + login redirect | `apps/web/src/app/(shopper)/layout.tsx` | Header nav today: `My Profile`, `My Stores`. Any page under `(shopper)/` gets the passport guard and `return_to` for free. |
| Capture + consent UI pattern | `apps/web/src/app/c/[slug]/components/TryOnSheet.tsx` | Consent step first, file input not rendered until accepted, 401 → sign-in step, job + poll. Copy comes from `@kanchuki/shared` (`tryon-consent.ts`). |
| Wearer-photo-never-stored precedent | `packages/ai/src/tryon.ts` header | Photo sent inline, never persisted. Same rule for My Style. |
| Customer quota (admin-editable) | `apps/api/src/lib/quota.ts` `checkCustomerQuota` / `incrementCustomerUsage`; tables `customer_resource_limits`, `customer_usage_counters` | Add one resource; no new quota system. |
| Cross-store discovery | `routes/public/near-me.ts` (`getBoundingBox`, `haversineDistance`), `discover-stores.ts`, `category-feed` in `public-products.ts` | Reuse the geo helpers and the "public storefront only" filter. |
| Product attributes | `Product`: `category, subtype, primary_color, fabrics, styles, occasions, sizes[], price_min (paise), is_unstitched, avg_rating` | Match on these. |
| Semantic search | `ProductEmbedding` (pgvector 1536), `jobs/embedding-backfill.ts`, `jobs/generate-embedding.ts`, `public-search.ts` | Used for find-similar (PR-9). Verify prod rows exist before relying on it. |
| Per-store ranking logic | `public-recommendations.ts` (`scoreCandidate`), `public-stylist.ts` (`COMPLEMENTARY_COLORS`) | Pattern to copy; both are **single-store** and take a `slug`. |
| Festival data | `Festival` model (`schema.prisma:2161`) + admin festival calendar | Festival tab reads it. |
| Consent audit | `ConsentEvent` (`kind`, `notice_version`, `ip_hash`) | New kind `MY_STYLE_PHOTO_CONSENTED`. |
| Enquiry | `POST /v1/public/collections/:slug/enquire`, F-044 E1/E2 (all `product_ids` stored) | Per store. |

### 2.2 Conflicts and gaps found (these change the plan)

1. **Customer try-on is OFF on purpose** (F-044 E6: `CUSTOMER_TRY_ON_ENABLED = false`, customer routes 404). The earlier idea "after try-on, suggest related items" therefore **cannot ship now**. My Style must work with no try-on. The try-on hand-off is **PR-11, gated** on the owner flipping that constant and F-040 launching.
2. **Enquiry is per store.** One `POST …/collections/:slug/enquire` per retailer. A cross-store shortlist must be grouped by store and sent as N enquiries (PR-5). Not verified: whether the wishlist/basket UI already groups by store across slugs. Check in PR-5 before building.
3. **No colour-family normaliser.** `primary_color` is free text ("Mustard", "Wine", "Peacock Blue"). A palette can only match a *family*. New: `Product.color_family` + alias table (PR-2). Without it, palette fit is unscorable.
4. **No skin/undertone fields** anywhere; **quiz writes to `localStorage` only** (F-039 §2) — wiring gap, closed in PR-3.
5. **AI-call rule:** CLAUDE.md says never call Claude synchronously in a request handler. Analysis is a BullMQ job + poll (same shape as try-on). Text rerank may be a bounded sync call only if it already follows the stylist's precedent; default to job.
6. **DELETE is revoked** for `kanchuki_app` platform-wide (RC-049). New tables use `is_active` flags, never hard delete. Clearing a customer's style profile is an `UPDATE … = NULL`, not a delete.
7. **Not verified:** `ProductEmbedding` row coverage in prod; whether a per-retailer "delivers" flag exists (not needed now, D6).

---

## 3. Product spec

### 3.1 Entry points (menu)

| # | Entry | File | Change |
|---|---|---|---|
| 1 | Shopper header nav (main) | `(shopper)/layout.tsx` ~l.87 | Add `My Style`, first in the nav, same active-state style. |
| 2 | Store storefront bottom bar | `c/[slug]/components/CollectionView.tsx` (catalog/wishlist links ~l.558) | Add `My Style` button. |
| 3 | AI Stylist panel footer | stylist UI under `c/[slug]/components` | "Search all stores in My Style" (passes parsed text filters). |
| 4 | Store directory hero | `app/stores/page.tsx` / `StoresDirectory.tsx` | Card "Find what suits you". |
| 5 | For Customers page | `app/for-customers/page.tsx` | Feature section + CTA. |
| 6 | After try-on result | `TryOnSheet.tsx` | **Not now** (E6). PR-11, gated. |
| — | Do **not** add to retailer marketing `Navbar` (`components/site/Chrome.tsx`). | | |

Not signed in → `(shopper)` guard sends to `/login?return_to=/my-style`. The no-login teaser (quiz-only, `sessionStorage`) is **out of v1**.

### 3.2 Page layout

```
/my-style
├─ Start cards:  [Selfie / full body] [Find similar] [Quick quiz] [For my daughter]
├─ My Palette card (after analysis): colours that suit · colours to avoid · retake · clear my data
├─ Controls:  Sort  Best match | Nearest | Price     Filters  occasion · festival · budget · size · within X km
└─ Tabs:  For you · Festival · Occasion · Complete the look · Trending
     card → ProductDetailSheet → ♥ shortlist / Enquire (grouped by store)
Footer of results: "Enquire at N stores" sticky bar
```

Card copy is honest: price in ₹ (paise→₹, RC-055), store name + distance, a one-line reason ("Wine suits your warm tone" **only** when produced by the rule or model; if the fallback ran, show no reason — RC-059), button **Enquire**. No "Buy now".

### 3.3 Inputs

| Input | What the system reads | Stored |
|---|---|---|
| Selfie / full body | `undertone` (warm/cool/neutral), `depth` (fair/medium/deep), `frame` (petite/average/tall/curvy) | Enums on `CustomerAccount`. **Photo never stored.** |
| Find similar (screenshot/photo of a garment) | Garment descriptor in our existing tagging taxonomy (category, subtype, colour, fabric, pattern, embellishment, occasion) | Descriptor held for the session; image never stored. |
| Quick quiz | occasion/region/budget/fabric/colour (existing `StyleQuiz` questions) | `CustomerAccount.pref_*`, `budget_*` |
| Kids form (D4) | child's age band, gender, occasion, budget, comfort notes | Session only; optional "save for later". **No photo path exists in this flow.** |
| AI Stylist text | free text → filters | Not stored beyond the existing stylist behaviour |

### 3.4 Ranking (D2)

Candidates: `AVAILABLE`, `deleted_at IS NULL`, retailer not suspended and has `public_slug`, within radius (geolocation → else account city → else nationwide with a notice), size ∈ `sizes[]` if given, price ≤ budget, demographic/category matches.

`score = 0.45·fit + 0.20·trend + 0.15·rating + 0.10·freshness + 0.10·proximity`
- `fit` = palette family match (good +, avoid −) + occasion/festival tag + quiz prefs + (find-similar) embedding similarity.
- `trend` = active row in `style_trends` matching the product.
- **Sort = Best match** → by `score`, tiebreak distance. **Nearest** → distance, tiebreak score. **Price** → price, tiebreak score.
- **Diversity cap (best-match only):** max 3 items per store within the first 12. Prevents one large store swamping the feed. Never sold, never boosted by plan.
- Weights are constants in `packages/shared` with unit tests; admin-editable later (not v1).
- Optional AI rationale: one Claude call over the top ~30, cached in Redis by `hash(profile+filters)`. If it fails or credentials are missing, return results **without** rationale and a `rationale_source: "none"` field — never canned text (RC-059), never a fabricated success (RC-060).

### 3.5 Enquiry (D6)

Shortlist is grouped by store. "Enquire at N stores" sends **one** F-044 enquiry per store (all that store's picks in one POST), then opens that store's WhatsApp. Copy says "Ask the store", "Check availability". Nothing promises delivery or online payment.

---

## 4. Architecture

```
Browser (/my-style)
  ├─ multipart photo ─▶ web proxy /api/passport/my-style/analyze ─▶ API POST /v1/public/my-style/analyze
  │                      (consent_version required; passport cookie required; quota checked)
  │                         └─ BullMQ job `my-style-analyze` ─▶ Claude Vision (tool-use, strict enums) ─▶ result in Redis (TTL 15 min)
  ├─ poll ─▶ GET  …/analyze/:jobId ─▶ {status, profile?}      ← profile persisted to CustomerAccount on success
  ├─ feed ─▶ POST …/my-style/feed   ─▶ rank (SQL candidates + TS scoring) ─▶ optional rationale
  └─ shortlist/enquire ─▶ existing F-044 per-store enquiry
```

### 4.1 Data model (migration `132_…` or next free — verify at branch time; **owner applies**, policy)

```prisma
// additive only
model Product            { color_family String?  @@index([color_family]) }
model CustomerAccount    { skin_undertone String? skin_depth String? body_frame String?
                           style_profile_at DateTime? }          // photo itself never stored
enum QuotaResourceType   { STYLE_ANALYSIS }                       // + seed row in customer_resource_limits (default 3 / month)

model ColorFamily        { id name aliases String[] is_active }   // admin: "Mustard","Haldi" → "yellow"
model StylePalette       { id undertone depth good_families String[] avoid_families String[] version is_active }
model StyleTrend         { id label kind match_keywords String[] boost Float starts_at ends_at is_active }
```
- `ConsentEvent.kind` gains `MY_STYLE_PHOTO_CONSENTED` (string, no enum).
- **No hard deletes** (RC-049): admin "remove" = `is_active=false`.
- **RLS** on every new table per the repo's RLS convention (config tables: read via app role, write via admin path). Document in `docs/DATABASE.md`.
- Seed `style_palettes` (India-calibrated, 9 rows = 3 undertones × 3 depths) and `color_families` in the migration, so the feed works before any admin edit. Seed content is reviewed by the owner before apply.

### 4.2 API surface (new, all under `/v1/public/my-style`)

| Route | Purpose | Guard |
|---|---|---|
| `POST /analyze` | multipart photo, `consent_version`, `mode=selfie\|garment` → `{job_id}` | passport session, `checkCustomerQuota(STYLE_ANALYSIS)`, image size/MIME validation (reuse product-upload validator) |
| `GET /analyze/:jobId` | poll | passport session, job owner only |
| `POST /feed` | filters + sort → ranked cards | passport session; `Cache-Control: private, no-store` |
| `POST /profile/clear` | null the style columns (UPDATE, never DELETE) | passport session |
| `PATCH /v1/public/passport/style-quiz` | quiz → `pref_*` | passport session |

Web proxies under `apps/web/src/app/api/passport/…`: **add every new path and method to the passport-proxy allowlist** (RC-026) and handle null-body statuses (RC-045).

### 4.3 Privacy and consent
- Consent screen before the file input exists (TryOnSheet pattern); `consent_version` mandatory; `ConsentEvent` row.
- Photo: request memory → job (inline bytes, in-process stash like try-on) → discarded. No R2, no DB, no logs of bytes. Grep the diff for R2/photo-persistence calls (acceptance).
- Output shown as "your palette", never a skin-colour label.
- Children: the kids flow has no upload control at all; consent says "Adults only"; API rejects `mode=selfie` if the account is known to be a minor.
- "Clear my data" always visible. Mention in the privacy page.
- Quota blocks abuse; additionally rate-limit per phone/IP (reuse API rate limiter).

---

## 5. Online purchase later (no code now)

Keep three seams so D6 can be added without a rewrite — **do not build them speculatively**:
1. All card actions go through one `StyleCardActions` component (today: Shortlist + Enquire). A future "Buy" is one more action.
2. Prices stay in **paise** end to end.
3. The cross-store shortlist is a per-store grouped structure (needed for enquiries anyway); a future cart reuses it.

No `cart`, `order`, `payment` code, tables, or copy in F-045.

---

## 6. Task breakdown with PR map

Branching: stacked PRs off `main`, branch prefix `feat/f-045-*`, each PR ≤ ~400 changed lines where possible, tests included in the same PR. Owner merges; **no deploys or migrations by the agent** (CLAUDE.md policy). PR numbers are assigned by GitHub on creation — record them in `docs/BUILD-LOG.md` when opened.

### Phase 0 — no photo (proves demand, cheapest)

| PR | Branch | Tasks | Effort |
|---|---|---|---|
| **PR-0** | `docs/f-045-my-style-spec` | This spec + PRO-REQUIREMENTS §42 + tasks index row. (CLAUDE.md row only after owner approves.) | S |
| **PR-1** | `feat/f-045-schema` | **T1** migration (§4.1) + Prisma + seed palettes/families; `docs/DATABASE.md`; RLS. **Owner applies the migration.** | M |
| **PR-2** | `feat/f-045-color-family` | **T2** `normalizeColorFamily()` in `packages/shared` (alias table + keyword fallback; unmapped → `null`); **T3** set `color_family` in `jobs/tag-product.ts`; **T4** `jobs/color-family-backfill.ts` (copy `embedding-backfill` shape; **cron must not use `repeat.limit`** — RC-062); **T5** admin alias CRUD (`is_active` toggle). | M |
| **PR-3** | `feat/f-045-feed-api` | **T6** ranking engine `lib/my-style-rank.ts` (+ weights in shared); **T7** `POST /my-style/feed`; **T8** `PATCH /passport/style-quiz` (closes F-039 §3.1); **T9** `StyleQuiz.tsx` posts to it with `localStorage` fallback. | L |
| **PR-4** | `feat/f-045-web-shell` | **T10** `(shopper)/my-style/page.tsx` + feed UI + sort + filters + kids form; **T11** all nav entries (§3.1 #1–#5); **T12** web proxies + allowlist. | L |
| **PR-5** | `feat/f-045-multistore-enquiry` | **T13** grouped shortlist → N per-store F-044 enquiries; sticky "Enquire at N stores" bar; verify existing basket behaviour first. | M |

### Phase 1 — photo analysis

| PR | Branch | Tasks | Effort |
|---|---|---|---|
| **PR-6** | `feat/f-045-analyze-api` | **T14** `jobs/my-style-analyze.ts` (Claude Vision, tool-use, strict enums, injection-safe); **T15** `POST /analyze` + poll + `profile/clear`; quota + consent + `ConsentEvent`; **T16** `CUSTOMER_STYLE_ANALYSIS` kill-switch constant (default ON) for fast disable. | L |
| **PR-7** | `feat/f-045-analyze-ui` | **T17** capture sheet (copy of TryOnSheet flow), palette card, retake, "clear my data"; keyboard/safe-area via the shared `<Sheet>` (RC-042). | M |
| **PR-8** | `feat/f-045-admin` | **T18** admin: palettes, trends, colour aliases, customer quota row, usage cost view; **classify the new admin routes in the single access list** (RC-034); **T19** retailer-facing "how My Style ranks stores" help text. | M |

### Phase 2 — more inputs

| PR | Branch | Tasks | Effort |
|---|---|---|---|
| **PR-9** | `feat/f-045-find-similar` | **T20** garment-descriptor mode in the analyze job; **T21** embed descriptor → pgvector top-K → feed; fall back to attribute match when embeddings are missing. | M |
| **PR-10** | `feat/f-045-complete-look` | **T22** anchor product → complementary categories (dupatta/bottom/jewellery) from nearby stores; **T23** Festival + Trending tabs on `Festival` / `style_trends`. | M |

### Phase 3 — gated (do not start)

| PR | Branch | Tasks | Gate |
|---|---|---|---|
| **PR-11** | `feat/f-045-tryon-handoff` | **T24** "See what goes with this" after a customer try-on result | Owner flips `CUSTOMER_TRY_ON_ENABLED` **and** F-040 launches. Until then: not started. |
| **PR-12** | `docs/f-045-closeout` | **T25** BUILD-LOG, PRO-REQUIREMENTS status, CLAUDE.md index row (**owner approval required**), RC entries if bugs were found. | After each phase |

Dependency order: PR-1 → PR-2 → PR-3 → PR-4 → PR-5; PR-6 needs PR-1 + PR-3; PR-7 needs PR-4 + PR-6; PR-8 can run parallel to PR-6; PR-9/10 need PR-3; PR-11 needs the gate.

---

## 7. Testing plan (per PR; "written first" = TDD)

| Level | What | Tooling |
|---|---|---|
| Unit | `normalizeColorFamily` (aliases, case, multi-word, unmapped → null, "Peacock Blue"); rank engine (palette good/avoid, diversity cap, sort modes, tie-breaks, price in paise); weights sum to 1 | `vitest`, `packages/shared`, `apps/api` |
| API integration | `/feed`: suspended retailer excluded, deleted product excluded, non-`AVAILABLE` excluded, no-slug retailer excluded, radius/city/nationwide fallbacks, `no-store` header, 401 without passport. `/analyze`: 401, 402 `CUSTOMER_LIMIT_EXCEEDED`, 400 missing `consent_version`, bad MIME/oversize, job-owner isolation, **kill-switch → 404**, **missing AI key → 503, never a fake success** (RC-060) | `vitest` with Prisma/Redis fakes whose stores copy, not alias (RC-037) |
| Privacy | Static test that the analyze path imports no `uploadBuffer`/R2 helper and writes no photo bytes (like the try-on guard); `profile/clear` nulls columns | `vitest` |
| Security | `npx vitest run src/routes/security.test.ts`; prompt-injection fixture (text on garment saying "ignore instructions") → output still valid enums; IDOR on poll route; rate limit | `owasp-top-10-testing`, `api-security-testing` skills |
| AI regression | Golden set of **consented/synthetic** portraits across light/medium/olive/deep tones, kept **out of the repo**; bench HTML like `docs/ai-studio/`; assert enum stability and no systematic bias toward "fair"/"cool". Vision mocked in CI | `ecc:ai-regression-testing` |
| Web unit | `StyleQuiz` posts when logged in, falls back to `localStorage` when 401; kids form has **no** file input; sort toggle; "Enquire" label (no "Buy"); no history double-pop in the sheet (RC-065/RC-006); Prev/Next resets scroll (RC-053) | `vitest` + Testing Library |
| E2E | Playwright with **stubbed API** (RC-048): login redirect → `/my-style`; quiz-only feed; selfie happy path (stub job); quota-exceeded copy; multi-store enquire opens N WhatsApp links; offline fallback | `ecc:e2e-testing`, `playwright` |
| Manual device | Android Chrome + iOS Safari: camera permission, front camera, large HEIC, slow 3G poll, keyboard over bottom bar | checklist in PR description |
| Pre-prod | Re-test every relevant RC (§8) per `docs/root-cause/README.md` | owner checklist |

Per-PR gates: `pnpm --filter @kanchuki/api typecheck`, API + web tests, `rtk lint`, no new `any`. Failing tests are reported, not hidden.

---

## 8. Root-cause lessons that apply (check before each PR)

| RC | Rule for this feature |
|---|---|
| RC-026 / RC-045 | New passport proxy paths **and** methods in the allowlist; null-body statuses handled. |
| RC-049 | No hard deletes; use `is_active` / UPDATE; if a delete is truly needed, ship the GRANT migration with it. |
| RC-034 | New admin routes classified in the single admin access list, not a hand-written copy. |
| RC-055 | Money is paise; format once, in one helper. |
| RC-059 / RC-060 | Fallback ≠ AI; label it. Missing credentials ⇒ fail loudly, never `connected/ok`. |
| RC-062 | Cron/repeat jobs: no `repeat.limit: 1`. |
| RC-015 / RC-014 | Sync-ref guard on submit handlers; catch `AbortError`. |
| RC-042 / RC-065 / RC-006 | Use shared `<Sheet>`; one history pop; no `history.back()` surprises. |
| RC-041 | Deep links (`return_to`) built by the shared module only. |
| RC-053 | Reset scroll on page change in the feed pager. |
| RC-048 | E2E must stub storefront fetches. |
| RC-037 | Test doubles must not share object identity with stored values. |

---

## 9. Skills and agents to use (by activity)

| Activity | Skills / agents |
|---|---|
| Planning each PR | `superpowers:writing-plans`, `superpowers:brainstorming` (UI copy only), `ecc:plan`, agent `Plan` |
| Build (TDD loop) | `superpowers:test-driven-development`, `agent-skills:incremental-implementation`, `superpowers:subagent-driven-development` for independent tasks, `ponytail:ponytail` (no abstraction beyond the three seams in §5) |
| Schema/migrations | `ecc:database-migrations`, `ecc:postgres-patterns`, `ecc:prisma-patterns`, agent `ecc:database-reviewer` (RLS, indexes, no hard delete) |
| API | `ecc:api-design`, `ecc:backend-patterns`, `ecc:redis-patterns` (cache keys + TTL), `ecc:error-handling` |
| AI pipeline | `claude-api` (Vision + tool-use), `ecc:cost-aware-llm-pipeline` (caps, caching, ₹/call), `ecc:regex-vs-llm-structured-text` (rules for colour families, LLM only for pixels and rationale), `ecc:recsys-pipeline-architect` (candidate → score → diversify) |
| Web UI | `vercel-react-best-practices`, `ecc:react-patterns`, `ecc:nextjs-turbopack`, `ecc:frontend-patterns`, `ecc:frontend-a11y`, `ecc:accessibility`, `web-design-guidelines`, `impeccable` + `emil-design-eng` (polish, motion), `ui-ux-pro-max` (layout), `apple-design` (mobile web) |
| Security/privacy | `ecc:security-review`, `owasp-top-10-testing`, `api-security-testing`, agents `ecc:security-reviewer`, `agent-skills:security-auditor` |
| Review | `ecc:code-review`, `superpowers:requesting-code-review`, agents `ecc:typescript-reviewer`, `ecc:react-reviewer`, `ecc:silent-failure-hunter` (fallbacks), `ecc:pr-test-analyzer` |
| Testing | `ecc:e2e-testing` + agent `ecc:e2e-runner`, `ecc:react-testing`, `ecc:ai-regression-testing`, agent `ecc:tdd-guide` |
| Bugs | `superpowers:systematic-debugging`, `agent-skills:debugging-and-error-recovery` |
| Finish | `superpowers:verification-before-completion`, `superpowers:finishing-a-development-branch`, `ecc:update-docs` |

Process rules from CLAUDE.md: check `docs/PRO-REQUIREMENTS.md` before building, `docs/database/DATABASE.md` before schema work, `docs/SECURITY.md` before photo handling, and `docs/root-cause/` before any edit. Show the diff and wait for approval before applying code changes. Update docs in the same session as each merge.

---

## 10. Rollout, config and metrics

- **Flags:** `CUSTOMER_STYLE_ANALYSIS` constant (kill-switch, PR-6); feed itself has no flag but **self-hides** when the area has fewer than 6 products or 3 stores (same rule as F-042).
- **Admin-editable now:** per-customer monthly `STYLE_ANALYSIS` limit (default **3**), palettes, colour aliases, trends. **Later:** ranking weights, purchase reward (D1/D6).
- **Cost:** about ₹0.33 per Vision image plus one cached rerank. Alert if daily cost passes a threshold (reuse `ai_usage_log`, add operation `my_style_analyze`).
- **Metrics (tied to the MVP enquiry-to-order goal):** My Style sessions, analyses completed, feed → shortlist rate, shortlist → enquiry rate, enquiries per store, analysis cost per enquiry. Events through the existing F-037 engagement pipeline; no new analytics system.
- **Retailer fairness:** diversity cap; no pay-to-rank; help text in PR-8.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Tone read is wrong on olive/deep skin | Golden-set test; show "suggestion", allow manual palette override; retake. |
| Stale `AVAILABLE` stock destroys trust | Card says "Check availability"; enquiry is the only action. |
| Few stores near a user | Nationwide fallback with notice; self-hide thresholds. |
| Face photos are sensitive (DPDP) | No storage, consent version, clear-data control, adults only. |
| Cost creep | Admin quota, kill-switch, Redis cache, cost alert. |
| Scope creep into checkout | D6 + §5: seams only, no code. |
| Colour normaliser misses regional names | Admin alias table; unmapped products simply aren't palette-scored. |

---

## 12. Owner checklist

1. Say **"go"** to start PR-1 (and which docs to touch: this spec + PRO-REQUIREMENTS §42 are written; **CLAUDE.md index row waits for your approval**).
2. Review the seed palettes/colour families before the PR-1 migration is applied.
3. Apply migration PR-1 yourself (admin dashboard path); then deploy via GitHub push only.
4. Provide consented sample portraits (or approve synthetic ones) for the AI regression set.
5. Decide when (if ever) to flip `CUSTOMER_TRY_ON_ENABLED` — this is what unlocks PR-11.
6. Revisit online purchase after 3–5 months of enquiry data (D6).
