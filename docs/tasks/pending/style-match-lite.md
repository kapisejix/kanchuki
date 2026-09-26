# F-039 — Style Match Lite (AI Fit/Style Recommendation, MID tier)

**Status:** 🔴 **Planned — not started, not yet approved by owner.** Research written
2026-09-25 (`docs/tasks/pending/ai-fit-recommendation-research.md`), scoped into this
spec 2026-09-26 on owner request. **Needs an explicit go-ahead before any code.**
**Owner decision needed first:** see §7 Open Decisions — this spec cannot start
without D-1 and D-2 answered.

**Related:**
- `docs/tasks/pending/ai-fit-recommendation-research.md` — the three-tier research
  this spec formalizes (LOW / MID / HIGH). This spec builds **MID only**.
- `apps/api/src/routes/public/public-stylist.ts` — AI Stylist v1 (Claude-powered
  outfit recommendation from free text). The reinforcement/rationale layer this
  feature extends.
- `apps/web/src/app/c/[slug]/components/StyleQuiz.tsx` — existing 5-question style
  quiz UI. **Currently writes to `localStorage` only** — not wired to any backend
  field (see §2, this is a real gap, not just a reuse point).
- `packages/db/prisma/schema.prisma:2438` `CustomerAccount` — Shopper Passport
  cross-store identity, already has `pref_colors/pref_styles/pref_fabrics/
  pref_occasions/usual_size` fields, settable at `/my-profile`.
- `docs/SECURITY.md` §3b/§3c — the "photos not used to train AI, purged in 15 days"
  promise (row 87 CLAUDE.md, DPDP notice). Any new photo-upload path must honor
  this and go through the same consent pattern as `ConsentEvent`.
- CLAUDE.md "What's Built" index — add the F-039 row when this ships.
- `docs/BUILD-LOG.md` — append the build table when this ships.

Legend: **S** = < 1 h, one file · **M** = 1–3 files · **L** = cross-cutting /
migration / needs product sign-off.

---

## 1. Goal

Customer browses 3–5 items, can't decide, buys 0–2. Nudge them toward a confident
pick using two cheap, already-partly-built signals:

1. **Style quiz** (occasion/region/budget/fabric/color) — exists as UI, needs
   backend wiring.
2. **Optional selfie → skin-tone read** (Claude Vision, one call, no image stored)
   — narrows color/fabric picks and gives a stated reason.

Output is **text + badge only** — "This shade suits your skin tone", "Good pick for
wedding season" — never a rendered garment-on-body image. Full virtual try-on (HIGH
tier) stays rejected; see `ai-fit-recommendation-research.md` §HIGH and the §8
"Not doing" list below.

---

## 2. Current state (what exists today — verified against code, not docs)

| Piece | Where | Notes |
|---|---|---|
| Style quiz UI | `StyleQuiz.tsx` | 5 questions, multi-select, **saves to `localStorage.kanchuki_quiz_{storeSlug}` only**. Never POSTs anywhere. Per-store key means the same shopper's answers don't follow them to a different retailer, and are lost on a new device/browser. |
| Cross-store preference storage | `CustomerAccount.pref_colors/pref_styles/pref_fabrics/pref_occasions` | Exists, settable via `/my-profile`, but **nothing writes to it from the quiz** — this is the wiring gap F-039 must close. |
| AI Stylist v1 | `public-stylist.ts` `POST /public/stylist` | Free-text query → Claude picks 3–6 products from the retailer's tagged catalog + one-line rationale per pick. Anonymous (no login), no quiz/preference input today — the extension point for surfacing Style Match Lite's picks. |
| Skin tone / body shape | — | **Does not exist anywhere in the schema.** No `Customer` or `CustomerAccount` field, no vision call for it. New in this spec. |
| Consent pattern | `ConsentEvent` model (`kind`, `notice_version`, `ip_hash`) | Reuse for a new `SELFIE_MATCH_CONSENTED` kind — same shape as `PASSPORT_CREATED` etc. |
| Vision-call pattern | Claude Vision product tagging (CLAUDE.md "AI Agent Memory" §1) | Reuse the tool-definition + strict-enum approach so a stray "ignore instructions" written on a T-shirt can't hijack the output — same defense already documented for product photos. |
| Quota gating | `QuotaResourceType` enum (`packages/db/prisma/schema.prisma:153`) — currently `PRODUCT_UPLOAD, AI_TAGGING_CALL, IMAGE_CROP, BG_REMOVAL, API_REQUEST, STUDIO_SHOOT, SHOWCASE_DESIGNS` | Add `STYLE_MATCH_CALL`. Per-customer call, but billed against the **retailer's** plan tier since retailers pay, not customers. |

**Key point:** the research doc's LOW tier said "reuse existing style quiz" — that
undersells the gap. The quiz component **exists but is disconnected**. F-039's
first real task is wiring it to `CustomerAccount`, which the LOW tier alone
already requires.

---

## 3. Scope — MID tier only

### 3.1 Quiz wiring (closes the LOW-tier gap, prerequisite for MID)

- `StyleQuiz.tsx` POSTs completed answers to a new endpoint instead of
  `localStorage` alone (keep localStorage as an offline/anonymous fallback for a
  shopper not logged into Shopper Passport).
- New route `PATCH /v1/public/passport/style-quiz` (customer-web proxy pattern,
  same shape as the existing `/api/passport/preferences` proxy fixed in RC-026) —
  maps quiz answer keys → `CustomerAccount.pref_occasions/pref_styles/
  pref_fabrics/pref_colors`. `budget` answer → `budget_min/budget_max`.
- No login → no `CustomerAccount` row to write to. Quiz still saves to
  `localStorage` and degrades to session-only personalization (§3.3).

### 3.2 Selfie skin-tone match

- New screen/sheet on customer web: "See what suits you" (entry point: product
  detail page + AI Stylist chat, both already customer-facing surfaces).
- Camera/file upload → **one Claude Vision call**, tool-use with a strict enum
  (never free text) returning:
  - `skin_undertone`: `warm | cool | neutral`
  - `depth`: `fair | medium | deep` (loosely: how much a color needs to contrast
    to read as flattering — not a literal skin-color label stored or shown
    anywhere, avoids the sensitivity of storing/displaying a "skin color" value)
  - `confidence_notes`: string, same pattern as product-tagging's field
- **The photo itself is never persisted** — no R2 upload, no DB row for the image.
  It exists in request memory for the single Claude API call and is discarded.
  This is the DPDP-safe design: the existing "not used to train AI, purged in 15
  days" promise is about photos that *are* stored (product photos); a selfie that
  is never stored needs no retention clock at all, and is a stronger privacy
  posture than what SECURITY.md already documents.
- Result (`skin_undertone` + `depth` only, never the photo) is stored on
  `CustomerAccount.skin_undertone` / `CustomerAccount.skin_depth` (new nullable
  columns) so the match doesn't re-ask on every visit. Anonymous/no-login flow:
  result held in `sessionStorage` only, cleared on tab close.

### 3.3 Narrowing + reinforcement

- Feed `pref_*` + `skin_undertone`/`skin_depth` (when present) into
  `public-stylist.ts` as additional pre-filter/ranking signal, same place the
  existing `PRODUCT_TYPE_SYNONYMS`/`OCCASION_SYNONYMS`/color-pairing logic
  already lives (`COMPLEMENTARY_COLORS` table, line 17 — extend, don't replace).
- Cap the customer's own shortlist (whatever they've already favorited/viewed on
  this visit) down to **3 curated picks**, not more — Hick's Law lever from the
  research doc's LOW tier, cheap to add, applies regardless of MID adoption.
- Rationale line pattern: `"{color} suits your {undertone} tone" ` /
  `"good pick for {occasion}"` — reuse the existing `rationale` field the Claude
  prompt in `public-stylist.ts` already produces per recommendation; extend the
  prompt to reference undertone/depth when present.
- Social-proof badges ("bestseller", "N people viewed today") — needs a view/
  favorite-count read already available via `CustomerInteraction`/
  `CustomerRecentlyViewed` (F-036/F-037 tables) — no new schema.

---

## 4. Schema changes

```prisma
// CustomerAccount — new nullable columns, additive migration
skin_undertone String? // 'warm' | 'cool' | 'neutral'
skin_depth     String? // 'fair' | 'medium' | 'deep'
skin_match_at  DateTime? // when the selfie call last ran — re-prompt after N months if null-stale
```

```prisma
enum QuotaResourceType {
  PRODUCT_UPLOAD
  AI_TAGGING_CALL
  TRY_ON // @deprecated
  IMAGE_CROP
  BG_REMOVAL
  API_REQUEST
  STUDIO_SHOOT
  SHOWCASE_DESIGNS
  STYLE_MATCH_CALL // new — F-039
}
```

`ConsentEvent.kind` gains `SELFIE_MATCH_CONSENTED` (string field, no enum change
needed — same pattern as existing kinds).

No new table. No image storage. No `Customer` (per-retailer) changes — skin match
lives on `CustomerAccount` because it's a shopper attribute, not a per-store one.

---

## 5. API surface (new)

| Route | Method | Purpose |
|---|---|---|
| `/v1/public/passport/style-quiz` | `PATCH` | Write quiz answers to `CustomerAccount.pref_*` (§3.1). Requires passport session, same auth as existing `/api/passport/preferences`. |
| `/v1/public/passport/skin-match` | `POST` | Accepts one image (multipart, same size/MIME validation as product upload), calls Claude Vision once, returns `{ skin_undertone, skin_depth }`, writes to `CustomerAccount`, **never touches R2**. Quota-gated on `STYLE_MATCH_CALL` against the retailer whose storefront triggered it. |
| `POST /public/stylist` (existing) | — | Extended to accept optional `skin_undertone`/`skin_depth`/passport-derived `pref_*` in the request, or read them server-side when a passport session cookie is present. |

---

## 6. Acceptance criteria

- Completing the style quiz while logged into Shopper Passport persists to
  `CustomerAccount.pref_*` and survives a new device login (proves the wiring gap
  is closed, not just papered over with more localStorage).
- Anonymous shopper (no passport) still gets a working quiz — `localStorage`
  fallback, scoped per-store as today, no regression.
- Selfie upload → skin-tone result returned in one round trip, no image byte ever
  reaches R2 or a DB row (verified: grep the diff for any `r2` / photo-persistence
  call in the new route — there should be none).
- AI Stylist recommendations visibly change when a skin-tone result exists
  (different top pick or rationale mentioning "tone") vs. the same query without
  one — a simple before/after test case, not just code review.
- Per-retailer `STYLE_MATCH_CALL` quota enforced same as existing `STUDIO_SHOOT` /
  `AI_TAGGING_CALL` pattern — hard stop + remaining count surfaced.
- Consent screen shown before first selfie call, `ConsentEvent` row written,
  declining still lets quiz-only personalization work.

---

## 7. Open decisions (owner must answer before build starts)

- **D-1 — Scope as a real spec or keep exploring?** This doc *is* the "scope it"
  answer to that research-doc open question. Confirms MID tier, not LOW-only or
  HIGH.
- **D-2 — Is the DPDP/consent overhead worth it for this customer base?** The
  no-persistence design in §3.2 is the cheapest version of "worth it" available —
  no retention policy needed because nothing is retained. If the owner wants even
  less friction, LOW tier alone (quiz wiring + 3-pick narrowing + badges, no
  selfie/vision call at all) ships without D-2 mattering.
- **D-3 — Revisit HIGH/VTO?** Out of scope here regardless — carried over from the
  research doc, still unanswered, still not blocking this spec.
- **D-4 — Success metric?** Recommend tying to the existing MVP metric (≥15%
  enquiry-to-order conversion) — track quiz-completed / skin-match-completed
  cohorts against that number rather than inventing a new metric.

---

## 8. Not doing (F-039)

Photoreal virtual try-on / garment-on-body render (this is the removed VTO
feature, HIGH tier, rejected by default per the research doc — reopening needs a
fresh brainstorm + budget sign-off, not silent rebuild). Storing or displaying the
selfie image anywhere. Body-shape/height-based **size** recommendation (that's
the separately-removed size-recommendation feature — this spec only touches
color/style, not fit/size). Cross-session skin-tone re-analysis on every visit
(cached on `CustomerAccount`, re-run only if stale or the shopper explicitly
retakes it).

---

## 9. Readymade-only VTO — re-scoped HIGH-tier option (still owner-gated)

Full VTO stays rejected for the catalog as a whole (§8) because most of it is
unstitched/semi-stitched — no fixed shape exists pre-tailoring. Scoping strictly
to `Product.product_type = 'Readymade'` removes that specific objection: a
readymade garment (T-shirt, pants, kurti, readymade suit/sherwani, gown) has a
fixed shape, which is exactly what pose-conditioned VTO models are built for.
This does **not** reopen VTO by default — it narrows the objection, it doesn't
clear D-3 (§7). Recorded here so the next owner conversation has real numbers
instead of a flat no.

### 9.1 Cost per try-on (real numbers, checked 2026-09-26)

| Path | Cost/try-on | Notes |
|---|---|---|
| Managed API — FASHN AI | $0.075 on-demand (~₹6.6), ~$0.049 (~₹4.3) at volume commitment | No GPU ops, pay-per-call, quoted price not an estimate. |
| Self-hosted — CatVTON on RunPod (already built once — see 9.2) | ~$0.035/image compute (~₹3) | Cheapest raw number of any path here. Excludes dev/ops time and the accuracy issue that got it removed. |

At 500 try-ons/month across a store, managed-API cost lands around
₹2,000–3,500/month per retailer using it — needs the same `QuotaResourceType`
gating pattern as `STUDIO_SHOOT`, and margin math against plan pricing before
offering it uncapped.

### 9.2 CatVTON on RunPod — prior build, confirmed working, then removed

Kanchuki already built and deployed this once. RunPod serverless endpoint
(`pnvchif9f4bcom`), 8 root causes fixed across debugging sessions in July 2026,
**confirmed end-to-end 2026-07-11**: a `runsync` job completed in 45.9s
(`executionTime: 45884ms`), result verified round-tripping correctly through
`packages/ai/src/tryon.ts` into R2 storage. At RunPod A100 serverless pricing
(~$2.72/hr), 45.9s of compute ≈ **$0.0345/image (~₹3)** — the cheapest number in
this table.

**Removed 2026-08-31 anyway** — not because compute was expensive, but for two
reasons that don't automatically go away with a readymade-only scope:

- **Accuracy:** the shipped bug was unhandled multi-piece garments (a
  ready-to-wear set with a visible blouse + skirt + dupatta, or a sherwani set),
  not background removal (that was ruled out). Readymade categories still
  include multi-piece sets — re-scoping to "Readymade" doesn't by itself dodge
  this; it needs a fresh accuracy pass against readymade-specific test images
  before any re-adoption claim.
- **Ops cost, not GPU cost:** the debugging sessions themselves burned real
  cost and time — one session alone hit $15.96 in assistant usage across two
  ~16-minute Docker rebuild cycles, cold starts, and dashboard-only log access
  (RunPod's API has no stdout). That recurring ops tax is the actual argument
  against self-hosting, not the $0.035/image compute figure.

### 9.3 Still gated

Neither path clears D-3 (§7) on its own. If the owner wants to reopen VTO
specifically for readymade categories: pick managed (FASHN, ~₹6.6/try-on, zero
ops) over self-hosted (~₹3/try-on, real ops tax + unresolved multi-piece
accuracy bug) unless volume alone justifies re-absorbing that ops cost. Either
way this is a fresh scoped decision, not a silent revival of the removed
feature.

### 9.4 D-3 answered (2026-09-26) — build self-hosted, launch gated

Owner chose self-hosted CatVTON-on-RunPod (the ~₹3/try-on path) and gave the
go-ahead to build it now, admin-gated behind a feature flag until explicit
launch, with a separate admin-editable quota for retailers (example: 100/mo)
and phone-OTP customers (example: 3–5/mo). Full task-by-task build spec:
**`docs/tasks/pending/catvton-runpod-tryon-launch.md`**.

---

## 10. Effort estimate

| Piece | Effort |
|---|---|
| Quiz wiring (§3.1) | S–M — one new route, one component edit |
| Migration (§4) | S — 3 additive nullable columns + 1 enum value |
| Selfie route + Claude Vision call (§3.2) | M — new route, tool-use schema, quota check |
| Stylist prompt extension (§3.3) | S — extend existing prompt string + one new filter input |
| Consent UI (§3.2) | S — reuse existing consent-sheet pattern from Shopper Passport onboarding |
| Admin quota row for `STYLE_MATCH_CALL` | S — same `plan_limits` admin UI, new resource row |

Total: low-effort relative to HIGH tier — days, not weeks, matching the research
doc's original LOW/MID cost framing.
