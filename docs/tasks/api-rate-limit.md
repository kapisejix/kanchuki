# API Credit / Limit / Billing Model — Design Review

**Status:** Design only — no code written. Awaiting decisions (see §8).
**Date:** 2026-08-28
**Context:** Follow-on to the AI Studio credit work (`STUDIO_CREDITS_PER_IMAGE = 8`, mobile display only). Goal: admin-configurable per-API credit limits, vendor cost vs. retail price, free allowance per plan, paid top-up packs, per-retailer usage tracking.

Related admin pages:
- `https://kanchuki.app/admin/ai-usage`
- `https://kanchuki.app/admin/plan-limits`
- `https://kanchuki.app/admin/ai-providers`

---

## 1. The model, stated precisely

Two credit currencies:

| Currency | Who holds it | Example rate |
|---|---|---|
| **Vendor credits** (BFL credits, OpenAI $) | Platform, with the vendor | 1 Studio image = **4 BFL credits** ≈ $0.04 ≈ ₹3.5 (dashboard: $9.24 = 924 credits → 1 BFL credit = $0.01) |
| **Kanchuki credits** | Retailer, with the platform | 1 Studio image = **8 Kanchuki credits** |

Per paid API / resource, admin wants to save:

| Setting | Studio example | gpt-4o-mini example |
|---|---|---|
| Vendor + key | BFL / `BFL_API_KEY` | OpenAI-compat / `OPENAI_API_KEY` |
| Vendor cost per unit | 4 BFL credits / image | per-call or per-token |
| **Retail price per unit** | 8 Kanchuki credits / image | 1 Kanchuki credit / tag |
| Unit label | "image" | "tag" |
| **Free allowance per plan** | Starter 200, Growth ?, Pro ? | Starter ?, Growth ?, Pro ? |
| **Top-up packs** (after allowance) | ₹1,000 → 80 credits | ₹? → ? |
| Behaviour at zero | block / warn | block / warn |

Starter math: 200 images free ≈ costs platform 200 × ₹3.5 ≈ **₹700–800**; retailer "spends" 200 × 8 = 1,600 Kanchuki credits bundled with plan; past that they buy packs.

---

## 2. How much already exists

| Need | In code today | Gap |
|---|---|---|
| Free allowance per (plan, resource) | `plan_limits` table + **Admin → Plan Limits** | Raw number; no unit / credits-per-unit concept |
| Per-retailer per-month usage counter | `usage_counters` (retailer × resource × period_start); auto-resets per calendar month | Missing `STUDIO_SHOOT` in some lists |
| Per-retailer override of allowance | `retailer_limit_overrides` + form on **Admin → Retailers → [retailer]** | Form omits `STUDIO_SHOOT` + finer AI actions |
| Buy more after allowance | `quota_addon_purchases` + Razorpay (`POST /billing/purchase-addon`) | Packs are hardcoded const (`ADDON_PRICING` in `@kanchuki/shared`); no admin editing; no `STUDIO_SHOOT` pack |
| "Expensive model costs more" weight | `ai_provider_configs.credits_per_call` + **Admin → AI Providers** | Applied only to `AI_TAGGING_CALL`; not Studio / color / detect |
| Per-retailer × model × resource usage log | `ai_usage_logs` (`retailer_id, provider_type, model_name, resource_type, credits_used`) + **Admin → AI Usage** | Display only; nothing reads it to cap; no ₹ cost / margin |
| Vendor account balance ($9.24 / 924 credits panel) | — | Does not exist |
| Retailer-facing "credits left" | `GET /retailers/me/usage` (per resource) + mobile limits screen | Missing `STUDIO_SHOOT`; no unified number |

**Bottom line:** enforcement machinery (allowance → counter → block → buy pack) is built and working for 6 resources. Missing: pricing/credits config **as editable data**, applying it to **Studio + AI sub-calls**, **margin/cost visibility**, **retailer-side display**.

### Enforcement flow today

- `checkQuota(retailer, resource, amount)` → resolve effective limit: **retailer override → plan limit → fail-open (unlimited)** → compare `used + amount` vs limit → throw 429 if over.
- `incrementUsage(retailer, resource, amount)` bumps `usage_counters` on success.
- `QuotaResourceType` enum: `PRODUCT_UPLOAD, AI_TAGGING_CALL, TRY_ON, IMAGE_CROP, BG_REMOVAL, API_REQUEST, STUDIO_SHOOT`.
- Studio: gate `checkQuota(retailer,'STUDIO_SHOOT')` amount 1; meter `incrementUsage(retailer,'STUDIO_SHOOT')` +1 (the 8× is NOT applied server-side).
- `ai_usage_logs.resource_type` is a **free string** (`AI_TAGGING_CALL`, `AI_ITEM_DETECT`, `AI_COLOR_DETECT`, `STUDIO_SHOOT_WEDDING_ELEGANT`, …), not the enum.

---

## 3. Architecture decision: per-resource buckets vs. one wallet

### Model A — per-resource counters (already built)

Each resource has its own allowance + own top-up. Retailer sees `Studio: 40 left · AI tags: 380 left · Try-ons: 12 left`. `checkQuota` already does this.

- **Add:** DB `resource_pricing` table (vendor cost, retail-credits-per-unit, unit label, per-plan free allowance, top-up packs, at-zero behaviour) — replaces `ADDON_PRICING` const, extends `plan_limits`.
- **Wire:** Studio charges its retail weight (`incrementUsage(retailer,'STUDIO_SHOOT', 8)`, or keep counter in "images" and store 8 separately — see Q3).
- **Reuses:** every existing table, route, test, Razorpay pack flow, retailer limits screen.
- **Effort:** ~5–6 days.

### Model B — one "Kanchuki credit" wallet

Retailer has one balance. Plan grants X credits/month. Every action debits its `retail_credits_per_call` (Studio 8, tag 1, color 0.5…). One top-up product. `1,240 credits left` everywhere.

- **Add:** `retailer_credit_wallet` + `credit_ledger` tables. `checkQuota`/`incrementUsage` → `debitCredits(retailer, amount, reason)`.
- **Rework:** gate + ~25 call sites + mobile screens + addon flow.
- Nicer UX, cleaner mental model, one number.
- **Effort:** ~7–9 days.

**Recommendation: Model A.** ~90% built and tested. Model B is the better product but a rewrite. DB is currently wiped clean (zero retailers) → rewrite has near-zero *migration* cost right now; that's the one argument for doing B now.

---

## 4. Tracking gpt-4o-mini per retailer

**Already tracked.** Every served call writes an `ai_usage_logs` row: `retailer_id`, `provider_type = OPENAI_COMPAT`, `model_name = gpt-4o-mini`, `resource_type`, `credits_used`. `Admin → AI Usage` groups by `[retailer, provider, model, resource]`.

Two billing granularities:

1. **Flat per call** (exists) — admin sets "1 gpt-4o-mini tag = 1 credit". Predictable. Needs the weight applied.
2. **Per token** (true cost) — OpenAI + Anthropic return `input_tokens`/`output_tokens`; failover engine (`packages/ai`) would pass those into `ai_usage_logs`, then `credits_used = ceil(in·rate_in + out·rate_out)`. Accurate margin; tagging varies a lot (1-item photo vs 12-item rack). More moving parts.

**Recommendation:** flat per-call for retailer-facing quota; **also log token counts** for the margin dashboard.

Note: `color-detect` and `item-detect` today are NOT metered separately — they ride `AI_TAGGING_CALL`. A distinct gpt-4o-mini limit means promoting those to their own resource types.

---

## 5. Task #1 — AI Usage page: retailer grid + drill-down

Current page: flat table, one row per `(retailer × provider × model × resource)`, sorted by credits.

Endpoint `GET /admin/ai-usage` **already** returns every group **and** accepts `?retailer_id=`.

- **Lazy (no backend change):** page fetches all groups once → rolls up by `retailer_id` in browser → grid `{retailer, plan, total calls, total credits, # models, est. ₹ cost}`. Click row → expand to that retailer's rows (already in memory) or route to filtered view.
- **When data grows (>~500 retailers):** add `GET /admin/ai-usage/retailers` doing the rollup server-side; keep existing endpoint for drill-down.

**Add while there:** `limit / remaining / % consumed` columns (join `plan_limits` + `usage_counters`), `est. vendor ₹`, `est. retail ₹ billed`, `margin`. Date-range filter already in API.

---

## 6. Admin pages after the build

| Page | Change |
|---|---|
| **Plan Limits** (exists) | each `(plan × resource)` row carries free allowance in a named unit; link to pricing |
| **API Pricing** (new — or tab on Plan Limits) | per resource: vendor, key, **vendor cost/unit**, **retail credits/unit**, unit label, **top-up packs (₹→units)**, at-zero behaviour. Replaces hardcoded `ADDON_PRICING` const with DB table + CRUD |
| **AI Providers** (exists) | `BFL` becomes a real row; its `credits_per_call` = vendor cost; Studio reads it instead of hardcoded 8 |
| **AI Usage** (exists) | retailer grid + drill-down + cost/margin columns (§5) |
| **AI Spend / Margin** (new) | per resource per month: units served, vendor ₹, retail ₹ billed, addon ₹ collected, **margin**. Optional vendor-balance panel (BFL manual, others via API) |
| **Retailer detail** (exists) | override form gains `STUDIO_SHOOT` + new AI resources |

---

## 7. Effort — Model A path

| Item | Est. |
|---|---|
| #1 AI Usage retailer grid + drill (client rollup) | ~0.5 d |
| `resource_pricing` DB table + admin API CRUD | ~0.5 d |
| API Pricing admin page | ~1 d |
| Wire Studio + tagging to charge DB-driven retail credits/unit | ~0.5 d |
| Add `STUDIO_SHOOT` + `AI_COLOR_DETECT`/`AI_ITEM_DETECT` to enum; meter them; add to override / me-usage / addon lists | ~1 d |
| Retailer-facing "credits left + buy" for Studio (mobile, reuses addon flow) | ~0.5–1 d |
| AI Spend / margin card | ~1 d |
| **≈ total** | **~5–6 days** |

Model B (wallet) instead of pricing-table + per-resource rows: **+2–3 days**.

---

## 8. Open questions (blocking)

1. **One wallet or per-feature buckets?** Single "1,240 credits" pool every AI action draws from, OR separate counters (`Studio 40 / Tags 380 / Try-on 12`) with separate top-ups? → Model A vs B.
2. **The ₹1,000 → 80 pack:** 80 *Kanchuki credits* (= 10 Studio images at 8 each = ₹100/image, ~28× the ₹3.5 cost) or 80 *images*?
3. **Plan Limit units:** "200" for Starter Studio = 200 *images* or 200 *credits*? (Prefer: page in images/actions, store credits-per-unit separately.)
4. **gpt-4o-mini billing:** flat "1 credit per tag call" or true per-token cost (needs engine change)?
5. **Separate limits** for color-detect vs item-detect vs full tagging, or one "AI tagging" bucket for all gpt-4o-mini calls?
6. **At zero credits:** hard block + "buy more" screen, allow + bill overage later, or allow + alert admin only?
7. **Vendor cost input:** vendor-native units (BFL credits, OpenAI $) + manual FX rate, or flat ₹ per unit?
8. **Existing hardcoded packs** (products, tags, try-on, crop, bg-removal) — migrate into the new admin-editable table too, or leave and make only the AI ones configurable?
