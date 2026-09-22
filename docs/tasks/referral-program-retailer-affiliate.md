# Retailer Affiliate / Referral Program — Research + Implementation Plan

**Status:** 🟨 **T1–T4 ✅ BUILT 2026-09-22 (migrations `109`/`110`/`111` not applied); T5–T10 🔴 NOT STARTED.** The T3 naming blocker is **resolved** — see §0. **No affiliate link earns anything yet**: T4 records a conversion at signup, but nothing qualifies it (T5), computes a commission (T6) or pays it (T7) — and the `?ref=` cookie capture is deliberately not built (see §0 T4). Originally "research only, nothing built". Answering: "how does GoHighLevel's referral program work, and how do we build something similar for Kanchuki so retailers can earn money referring other retailers?"
**Date:** 2026-09-22
**Related:** `docs/INDIA-RETAILER-GROWTH.md` (retailer-facing referral engine — removed 2026-08-31 teardown, different feature: that was Kanchuki retailer → their own customers; this doc is Kanchuki retailer → other retailers, an affiliate/reseller layer), `docs/PRO-REQUIREMENTS.md`

---

## 0. Build status (2026-09-22)

Detail: `docs/BUILD-LOG.md` §2026-09-22 · tables `docs/DATABASE.md` → "Retailer referral / affiliate program" · requirements `docs/PRO-REQUIREMENTS.md` §35. **`apps/mobile` and customer web were not touched across T1–T4** (Play Console review in flight) — T3's shareable-link capture point is the existing `/for-retailers` page and T4's capture rides `PUT /v1/retailers/me`'s existing `referral_code` field, so no mobile build is needed to ship the code itself.

| Task | Status | Note |
|---|---|---|
| T1 — Schema + migration | ✅ Built | `109_referral_program` — **not applied** (admin dashboard) |
| T2 — Admin settings screen + API | ✅ Built | `GET`/`PUT /v1/admin/referral-settings` + `/admin/referral-settings` |
| T3 — Code + link generation | ✅ Built | `GET /v1/retailers/me/referral-code` + `lib/referral-codes.ts`. Blocker resolved — see below |
| T4 — Signup wiring | ✅ Built | `lib/referral-conversions.ts` + capture hooked into `PUT /v1/retailers/me`. **Zero `apps/mobile` changes** |
| T5–T10 | 🔴 Not started | Nothing pays out yet — see the status line above |

**The one open schema question was decided before migrating** (§6, §7 T1): **singleton** `referral_settings` row, not plan-scoped. Also decided: `ON DELETE RESTRICT` on the three retailer FKs, and payouts are never deleted (status only). §6 records these as owner decisions.

**T3 blocker — RESOLVED 2026-09-22, and it was worse than the blueprint.** The duplicate `generateReferralCode()` was the least of it. Grepping the live flows found that the collision is not theoretical:

1. **`?ref=` is already used by F-018.** `apps/web/src/app/survey/SurveyForm.tsx` shares `https://kanchuki.com/for-retailers?ref={staffCode}` on WhatsApp today. One query param already carries the staff namespace, and this feature's codes would arrive through the same one — so the two namespaces meet at a single entry point, which is why they must be told apart by shape rather than by which code path read them.
2. **The spec's proposed `/join?ref=…` link would have 404'd every referral.** `apps/web/src/app/join/page.tsx` is the **staff-invite bridge** (`?token=…`) and calls `notFound()` when the token is absent.
3. `generateReferralCode()` existed **twice** — live for F-018 in `team-helpers.ts`, and as an orphan in `growth-helpers.ts` whose `KAN-XXXXXX` shape this feature wanted.

**Resolution (built):** the affiliate namespace is `KAN-XXXXXX` from an ambiguity-free alphabet; the F-018 namespace is `[0-9A-Z]{6}` from base36 and **can never contain a hyphen**, so "contains a hyphen" separates them — one classifier, one param, one landing (`/for-retailers`, the page F-018 links already use), **no second link-shortener and no second route**. Two halves make it hold: the generator's shape (pinned by a source contract) and a guard reserving the hyphen in the hand-editable F-018 field. The orphan was relocated to `lib/referral-codes.ts` rather than re-invented. Falsification found the guard's first version was too weak — it checked only for a hyphen, so relaxing the pattern to `-?` let `KAN7F3QMP` into the staff field while classification sent it to the affiliate ledger; the guard now refuses the hyphen-dropped shape too, and a test pins it. Full reasoning: `apps/api/src/lib/referral-codes.ts` header.

**Two bugs found during this build, neither of them the feature** (both in `docs/root-cause/root-cause issues.md`): **RC-029** — RC-028's promotions-delete fix moved the delete to the `kanchuki_purge` role but never granted it, so the delete still failed; fixed by migration `110`. **RC-030** — 7 tables declare a bare `retailer_id` with no FK and were never purged, so a deleted retailer's rows survived; **fixed this session** (owner decision) — all seven swept in both jobs, six grants added, plus a schema-driven completeness test so the list can no longer go stale silently. Then the four RLS-protected tables among them *still* deleted nothing, and that turned out to be repo-wide: **23 of the 32** purge-path tables have RLS enabled and **no policy in the schema named `kanchuki_app`/`kanchuki_purge`**, so the whole path worked only through `pg_class_ownercheck` (the purge role is a member of each table's owning role) — an undocumented accident of which role ran which migration. Fixed by migration `111_backend_role_rls_policies`, a `FOR ALL` policy per table the path touches (**not `FOR DELETE`**: the sweeps all `SELECT` before they delete, so a `DELETE`-only policy would have legalized the delete while every batch stayed empty) + a static guard that re-derives the required set from the schema and an opt-in live test that executes both the failure and the fix. **Migrations 109/110/111 are not applied** (owner action, admin dashboard).

**T4 — signup wiring, and the three things research changed about it.** The capture is `lib/referral-conversions.ts`, hooked into the **existing** `PUT /v1/retailers/me` — which is the whole reason this task needed no mobile change:

1. **The capture point already shipped.** That route's `referral_code` field is F-018's self-serve salesperson code and it **already resolves** against `TeamMember` today. So an affiliate code typed into the existing "Referral Code (Optional)" field has been *arriving at the API and being silently dropped* since F-018 landed. T4 adds a second, shape-decided destination for a value that already travels.
2. **The `?ref=` cookie path has nowhere to land, so it was NOT built.** The spec's T4 sketches capturing `?ref=` into a cookie at signup — but there is **no retailer signup/onboarding form on the web** (every `shop_name` match is an admin or shopper page), so the link's CTA leaves for the app. Building the cookie would have shipped a hook with no consumer that reads it — RC-025's exact shape, and the same one this spec already avoided once at T3. The mechanism that completes *today* is manual code entry; the cookie is a post-launch follow-up **only if** a web signup ever exists.
3. **`FLAT_DISCOUNT` was removed from the settings.** It was selectable from T2's day one, and nothing in the repo discounts a Razorpay charge or a GST invoice, so choosing it would have stored a term that never reaches the store — RC-027's shape, one layer up (a config value the code silently drops). **Owner decision 2026-09-22: narrow the settings to what the code honours.** The API now refuses it with a message naming the reason, the admin screen no longer offers it but still *renders* a legacy row holding it, and a schema-derived test fails if the PostgreSQL enum grows a member that is neither implemented nor listed as unimplemented.

**Four guards, each for a different way the program could pay the wrong person:** shape decides the ledger (never lookup order — a staff code is left to F-018 and the affiliate table is never queried for it); self-referral refused by phone/GSTIN or identity; **one attribution, and staff wins** (owner decision 2026-09-22 — a shop a marketing agent already onboarded never also becomes an affiliate conversion); and `referred_id`'s UNIQUE constraint as the idempotency gate, with the referred-side bonus applied **inside the same transaction** as the row that earned it, so neither a conversion without its bonus nor a bonus twice is reachable.

**Two things T4 could not build as specified, stated rather than approximated:** the self-referral guard's third check is **impossible** — the spec asks for "same GSTIN/phone/**bank account**" and `Retailer` has no bank-account column, so it checks phone and GSTIN and says so. And **no affiliate link earns anything yet**: T4 writes a `pending` row and nothing else consumes it until T5.

**A defect in T4 found and fixed before it was committed** — recorded as **RC-032** because it is the same class as RC-027: the route comment promised "a referral problem never fails the profile save" while `applyReferralCapture` **throws** on a database error by design, with no catch at the route boundary. Since migrations 109/110/111 are applied by hand from the admin dashboard and the code deploys from a push, there was a window in which **any retailer typing a referral code during onboarding would have got a 500 and been blocked from finishing**. The fix keeps both halves of the requirement: the route catches, logs the underlying error, and reports `CAPTURE_FAILED` as data — non-fatal, and not silent either.

**§11 checklist: rows checked at T2.** RC-025 (routes registered in both the barrel and `admin.ts`, verified by grep, not by file existence), RC-026 (the PUT checks status explicitly; `fetch` does not throw on non-2xx), RC-027 (enum-like settings validated server-side against the exact set the code branches on — a `'CASHBACK'` bonus is rejected, not stored and ignored), RC-003/RC-009 (the real API error is surfaced, not a constant), RC-010 (only changed fields are sent, and the API diffs again). **§11 rows checked at T3:** RC-025 (the module is registered in **both** the barrel and `retailers.ts`, asserted by a source test — a passing route test would not have caught the missing aggregator call), RC-003/RC-009 (the real error is rethrown, asserted on the error object rather than the response body, because a 500 is deliberately sanitised for the client), RC-027 (the config the code does not understand is rejected, not stored: classification is by shape and never falls through), and the RC-007/RC-013 question — "grep for lingering references before reusing similar naming" — answered by the `?ref=` / `/join` findings in §0. Rows for T4–T9 remain to be checked as those tasks land. **§11 rows checked at T4:** RC-025 — no new route was added (the capture rides an existing one), and the `?ref=` hook was *not* built precisely because no consumer exists yet; RC-027 — the enum-like bonus setting is validated against the exact set the code branches on, and a schema-derived guard makes an unhandled enum member impossible to add quietly (falsified: adding `CREDIT_NOTE` to the enum fails the guard, naming it); RC-001/RC-003/RC-009 — every refusal is a **named status**, not a boolean and not a constant string, so a caller reports *why* rather than "failed"; RC-010 — the capture is additive and never rewrites the fields the profile route already diffs; RC-007/RC-013 ("grep the live flows before reusing similar naming") — answered a second time by the `referral_code` finding above, which is what showed the field was already spoken for.

---

## 1. How GoHighLevel's affiliate program actually works

GoHighLevel (GHL) is the closest analog: B2B SaaS, subscription pricing, sold partly through word-of-mouth in a niche community (agencies/marketers). Their model:

**Commission structure**
- **40% recurring commission**, lifetime of the customer, on every paid plan tier (GHL has ₹/$97, $297, $497-equivalent tiers).
- **2-tier program**: if your referral becomes an affiliate and refers someone else, you get a **5% second-tier override** on their referrals too — this is what makes GHL affiliates recruit other affiliates, not just customers.
- No cap on earnings, no minimum audience/follower requirement to apply.
- **$50 minimum payout threshold**, paid **monthly** via PayPal or direct deposit.

**Mechanics**
- Attribution: **last-click, 90-day cookie window**.
- A referral only "qualifies" for commission after **45 days in good standing** (paid, not refunded/churned) — stops people gaming free trials.
- Tracking + payouts run on **third-party infra**, not built in-house: FirstPromoter for referral link tracking/attribution, Tipalti for payout/tax handling. GHL didn't build this themselves.
- Affiliates get a dashboard: clicks, signups, MRR generated, commission owed, marketing assets (swipe copy, banners, demo videos) to reduce friction to promote.

**Why it works for GHL specifically:** the product IS a marketing tool used by marketers/agencies — the buyer persona and the promoter persona are the same person. That's the core insight to steal or adapt, not the commission %.

---

## 2. Does this map to Kanchuki?

Partially — important differences from GHL:

| | GoHighLevel | Kanchuki |
|---|---|---|
| Buyer | Marketing agencies, digital-savvy | Offline clothing retailers, often first-time SaaS users |
| Who'd refer | Any affiliate (doesn't have to be a customer) | Realistically: existing retailers, who know other retailers locally |
| Trust channel | Blogs, YouTube, cold affiliate marketing | **Word of mouth in local retailer/market networks, WhatsApp groups, market associations** |
| Ticket size | $97–$497/mo | ₹4,999–₹14,999/mo |
| Payout rail | PayPal/US bank (Tipalti) | **UPI/IMPS via RazorpayX** — already the payment stack (`docs/TECH-STACK.md`) |

**Implication:** Kanchuki's version should look less like an open "affiliate marketing" program (random bloggers driving traffic) and more like a **retailer-to-retailer referral program** — closer to how Dropbox/PayPal/Uber grew (existing user refers a peer they actually know) than how GHL's affiliate army works (strangers promoting for cash). The India retail world runs on **market associations, wholesaler networks, and WhatsApp groups per city/cloth-market** (e.g. Surat textile market, Karol Bagh) — that's the real distribution channel, not SEO/YouTube affiliates.

That said, GHL's **2-tier + recurring** structure is worth copying almost exactly — it's proven and it fits a recurring-subscription SaaS.

---

## 3. Other referral/affiliate models worth knowing (quick comparisons)

- **Dropbox** — not cash, storage-for-storage. Both sides get reward. Classic dual-sided incentive, drove huge viral growth. Doesn't map well to Kanchuki (no "storage" equivalent) but the **dual-sided reward** principle (both referrer AND referred retailer get something, e.g. 1 free month each) converts far better than one-sided cash alone — 2026 SaaS research confirms dual-sided programs consistently outperform single-sided.
- **Notion** — ~50% commission, first year only (not lifetime). Simpler to reason about margin-wise than "forever."
- **ConvertKit** — 30% recurring, **lifetime** of subscription (like GHL).
- **Razorpay itself** — runs a **Partner Program** (referral partners get a payout per merchant they bring who transacts) — worth studying since Kanchuki already has a Razorpay relationship; could even ask Razorpay how their partner ops team structures payouts.
- **Industry commission bands (2026 data):** MarTech/sales-tool SaaS pays 25–35% recurring; infra/devtools pays lower, 15–20%. Kanchuki is a vertical SaaS with high perceived value to the referred retailer (they can literally see it work in a neighbor's shop) — **30% recurring, 12 months, no second tier initially** is a defensible starting point; add second-tier later if it's working.
- **Off-the-shelf software** (don't build tracking from scratch): FirstPromoter (~$49/mo, plugs into Stripe/Razorpay-style billing, bulk payouts, standalone), Rewardful (similar, cheaper end), PartnerStack (enterprise, marketplace of 116k+ B2B partners, opaque pricing, overkill until Kanchuki has real partner-program scale). **Reward logic should fire off verified paid invoices, not signups/trials** — this is the single most-repeated 2026 best practice, exactly what GHL's "45 days good standing" rule enforces.

---

## 4. Recommended design for Kanchuki

### 4.1 Who can refer
- **Phase 1:** only existing paying retailers (not open to the public). Reduces fraud risk, matches the "retailer knows retailer" distribution channel, and avoids needing KYC/anti-fraud infra for random public affiliates on day one.
- **Phase 2 (later):** open an "Ambassador"/partner tier for non-retailer promoters (local IT/POS vendors, market association leaders, tailoring-supply salesmen) once Phase 1 proves the mechanic.

### 4.2 Commission structure — locked values, but stored as data, not code

- **30% of the referred retailer's subscription, recurring, for 12 months.** Locked (2026-09-22).
- **Qualification rule** (steal GHL's 45-day gate): commission accrues only after the referred retailer's subscription has been active and paid (not trial, not refunded) for **30 days**.
- **Dual-sided bonus:** referred retailer gets **1 free month** (or ₹X off) on signup via a referral link/code.
- **No second tier.** Locked (2026-09-22) — no GHL-style 5% override.
- **Payout:** monthly, **₹500 minimum threshold** (not yet confirmed), via **RazorpayX Payouts API** (UPI/IMPS).

**Hard rule for the build: none of the above numbers get hardcoded in code.** Every one of them — commission %, duration months, qualify-days, bonus amount, payout minimum, second-tier on/off + %, payout cadence — lives in an admin-editable settings table (same shape as `plan_pricing` §49 and the `resource_packs` §2026-09-03 pattern already in this repo). Admin changes it from `/admin/referral-settings`, no redeploy. Code reads the current row; nothing about "30%" or "12 months" appears as a literal in application code. This also future-proofs tier 2 — the schema should carry a `second_tier_enabled` / `second_tier_pct` field from day one even though it's off, so turning it on later is an admin toggle, not a migration.

### 4.3 Attribution mechanics
- Each retailer gets a **shareable referral link/code** (e.g. `kanchuki.app/join?ref=STORE_SLUG`), generated automatically (same pattern as the existing Store QR / store-slug system, F-030/§30 already shipped) — reuse that infra, don't build new link-shortening.
- **Last-touch attribution, 30-day cookie/local-storage window** (shorter than GHL's 90 — India retail sales cycle from "heard about it" to "signed up" is short since it's driven by an in-person conversation, not a nurture funnel).
- Referral code also enterable manually at onboarding (WhatsApp-shared codes get typed in, not always clicked — offline retail context, assume low click-through-link reliability).

### 4.4 Fraud/abuse guardrails (learned from Kanchuki's own incident history)
- No self-referral (same GSTIN/phone/bank account as referrer = block).
- Commission clawback if referred retailer refunds/churns inside the 30-day qualification window.
- Admin visibility: reuse the existing **Admin Commission Tracker** (§42, already built — 3% platform commission pool + expense ledger) as the pattern/precedent for how commission math + admin dashboard should look; this would be a second, parallel ledger (retailer-earned, not platform-earned).
- Given RC-004/RC-028 history (DELETE-revoked purge client pattern for guardrailed tables), any new referral/commission tables must go through the same purge-client pattern from day one, not bolt it on later.

### 4.5 Build plan (rough shape, not scoped/estimated yet)
1. Schema: `ReferralCode` (1:1 per retailer, auto-generated), `ReferralConversion` (referrer_id, referred_id, status: pending/qualified/paid/clawed_back, qualifies_at date), reuse `plan_pricing` for commission-base amount.
2. Onboarding: capture `?ref=` param or manual code entry, write pending `ReferralConversion` row, apply referred-side bonus (free month) at signup.
3. Nightly cron: promote `pending` → `qualified` once referred retailer's 30-day paid-and-active condition is met; roll up owed commission.
4. Monthly payout job → RazorpayX Payouts API, batch, ₹500 threshold, webhook-confirmed.
5. Retailer-facing screen: "Refer & Earn" in the mobile app — link/code, share-to-WhatsApp button (reuse F-031's WhatsApp share pattern), running earnings total, payout history.
6. Admin screen: referral leaderboard, pending/qualified/paid totals, manual override/clawback tool.

**Do NOT build custom attribution/fraud tracking from scratch if Phase 1 traction is uncertain** — FirstPromoter-style tooling exists cheap ($49/mo) specifically because tracking edge cases (cookie loss, multi-device, refund clawback) are a known hard problem. Worth a build-vs-buy call once real volume is expected; for an initial Phase-1 pilot with a handful of retailers, the DB-driven approach above is fine and keeps everything in Kanchuki's own stack/RazorpayX rail (India-specific payout, no PayPal dependency GHL relies on).

---

## 5. Other promotion ideas for Kanchuki (beyond referral $$)

- **Market-association tie-ins:** many Indian cloth markets have a formal retailer association/committee. A bulk-deal or sponsorship with one association (demo day, group discount) reaches dozens of retailers in one relationship — higher leverage than per-retailer referral in dense markets like Surat, Karol Bagh, Chandni Chowk.
- **Wholesaler/supplier channel:** retailers' fabric/garment wholesalers already touch hundreds of shops. A wholesaler referral tier (different economics — maybe a flat bonus, not recurring %, since wholesalers aren't retailers) could out-scale retailer-to-retailer referral.
- **"Bring a shop" in-app nudge:** surface the referral CTA at moments retailers are already delighted — right after a successful WhatsApp collection send, or after hitting a milestone (50 products uploaded, first enquiry converted) — mirrors the existing "install prompt at moment of value" pattern already used for the customer PWA (§73, F-036 install CTA fires at "just verified a visit").
- **Case-study / video testimonials:** short before/after videos (old paper-catalog shop → WhatsApp Commerce shop) shared in retailer WhatsApp groups — cheap, high-trust, matches how this buyer actually makes decisions (peer proof, not ads).
- **Sales staff commission mirrors retailer commission:** since Kanchuki already has F-018 Sales Referral Attribution (internal team) — worth checking that internal-team commission logic isn't duplicated by this retailer-facing one; keep the two ledgers separate but consistent in shape.

---

## 6. Decisions (owner, 2026-09-22)

1. **Commission: 30% recurring, 12 months.** Locked.
2. **Second tier: none.** Locked — no GHL-style 5% override for now.
3. Payout minimum/cadence — ₹500/monthly still just a suggestion, not confirmed.
4. Phase 1 audience — existing retailers only, still just a suggestion, not confirmed.
5. **Build vs buy: build in-house.** Locked.

### 6.1 Build vs buy — why in-house won

FirstPromoter/Rewardful/PartnerStack are all built around **Stripe/Paddle/Chargebee** billing webhooks. Kanchuki bills through **Razorpay**, which none of them integrate with natively — so even paying for one of these tools still means hand-building the webhook bridge that turns a Razorpay payment event into a qualified conversion. That erases most of the "buy = ship faster" argument.

In-house also reuses infra Kanchuki already has, rather than duplicating it inside a 3rd-party tool's data model:
- **RazorpayX Payouts API** for commission payout (UPI/IMPS) — no PayPal detour GHL relies on.
- **Store QR/slug system** (§30) for referral link generation.
- **Admin Commission Tracker** (§42) as the ledger/dashboard pattern to copy.
- **F-031 WhatsApp share** flow for "share your referral code."
- Referral/PII data stays inside Kanchuki's own DB — avoids a DPDP data-residency question a 3rd-party US-based SaaS tool would raise.

At Phase 1 pilot volume (a handful of retailers), the fraud/edge-case tracking that justifies FirstPromoter's $49/mo at scale (multi-device attribution, cookie loss, high-volume fraud detection) isn't the bottleneck yet. Revisit buy-side only if the program scales to hundreds of active referrers and a nightly cron + admin screen stops being enough.

---

## 7. Task Breakdown (build task-by-task — do not batch these, ship and verify one at a time)

**Governing rule for every task below: nothing hardcoded.** Any number that could plausibly change (commission %, duration, qualify-days, bonus amount, payout minimum, second-tier flag/%, cron cadence) is a column on `ReferralSettings`, editable from `/admin/referral-settings`, read at call time. If a task's own description below doesn't explicitly say "read from settings," that's still the rule — flag it if a future implementer forgets.

### T1 — Schema + migration — ✅ BUILT 2026-09-22 (migration `109`, **not applied**)
- `ReferralSettings` (singleton row, or plan-scoped if commission should vary by plan tier — decide before migrating): `commission_pct`, `duration_months`, `qualify_days`, `referred_bonus_type` (`free_month` / `flat_discount`), `referred_bonus_value`, `second_tier_enabled` (bool, default false), `second_tier_pct` (nullable), `payout_min_amount`, `payout_cadence` (`monthly` default), all admin-editable, all with sane defaults matching §4.2's locked values but **not code constants**.
- `ReferralCode` — 1:1 per retailer, auto-generated on first request (reuse store-slug generation pattern, §30).
- `ReferralConversion` — `referrer_id`, `referred_id`, `status` (`pending` / `qualified` / `paid` / `clawed_back`), `qualifies_at`, `commission_base_amount`, `commission_accrued`, timestamps.
- `ReferralPayout` — batch payout records, RazorpayX payout id, status, webhook-confirmed flag.
- Follow the purge-client / DELETE-revoked pattern (RC-004, RC-028, SECURITY §19) for any guardrailed table here from day one.

### T2 — Admin settings screen + API — ✅ BUILT 2026-09-22
- `/admin/referral-settings` — CRUD on the `ReferralSettings` row(s). This is the screen that makes T1's "no hardcode" rule real — build it before or alongside any consuming logic, not after.
- Validate ranges server-side (e.g. commission_pct 0–100) so admin can't put the ledger in an impossible state.

### T3 — Referral code + link generation — ✅ BUILT 2026-09-22
- Retailer API: fetch/create own `ReferralCode`. → `GET /v1/retailers/me/referral-code`, fetch-or-mint, idempotent (a re-mint would break links already shared), reconciling a concurrent first request to the winner's code instead of minting a second one.
- Reuse Store QR/slug infra (§30) for the shareable link — don't build a second link-shortener. → **Reused the pattern, not the slug.** The slug is *mutable* (the §30 store-URL rename sync), so attribution stored against it would break on rename; the code is its own immutable identifier. `link` is **built, never stored** — derived from `WEB_URL` + the code — so changing the base URL or landing path does not rewrite every retailer's row.
- Support both link-click (`?ref=`) and manual code entry at onboarding. → `classifyReferralCode()` decides by shape alone (see §0): resolution order must never pick the ledger. The actual capture + write is T4.
- **Not built, deliberately:** any endpoint that resolves a typed code to a shop. That is a code-enumeration oracle — 456,976 candidates is minutes of requests and the answer is a list of who is in the program. Resolution returns only as part of T4's server-side signup write.
- Files: `apps/api/src/lib/referral-codes.ts` (+27 tests), `apps/api/src/routes/retailers/retailers-referral.ts` (+8 tests), `apps/api/src/routes/team/team-members.ts` (namespace guard +2 tests), and the orphaned `growth-helpers.ts` helpers relocated.

### T4 — Signup wiring
- Onboarding flow captures `?ref=`/manual code → writes `pending` `ReferralConversion`.
- Applies referred-side bonus per `ReferralSettings.referred_bonus_*` (not a hardcoded "1 free month").
- Guardrail: block self-referral (same GSTIN/phone/bank account as referrer).

### T5 — Qualification cron
- Nightly job: `pending` → `qualified` once referred retailer has been paid+active for `ReferralSettings.qualify_days` (currently 30, but read from settings, not literal `30`).
- Clawback path: referred retailer refunds/churns inside the qualify window → conversion → `clawed_back`, no commission accrues.

### T6 — Commission calc + ledger
- Compute owed commission off `ReferralSettings.commission_pct` × `duration_months`, per conversion, monthly rollup.
- Ledger pattern copied from Admin Commission Tracker (§42) — parallel table, not the same rows (that one's platform-earned, this is retailer-earned).

### T7 — Payout job
- RazorpayX Payouts API integration, batch monthly (or `ReferralSettings.payout_cadence`), `ReferralSettings.payout_min_amount` threshold, idempotency keys, webhook-confirmed status update.

### T8 — Retailer-facing mobile screen
- "Refer & Earn" screen: code/link display, WhatsApp share button (reuse F-031 share pattern), running earnings total, payout history, qualification status per referral.

### T9 — Admin monitoring
- Referral leaderboard, pending/qualified/paid totals, manual override/clawback tool, export.

### T10 — Tests + docs
- Unit tests on commission calc (edge cases: mid-cycle plan change, refund inside window, clawback math).
- Security test pass (financial calc + payout endpoints) per CLAUDE.md rule 8/9 conventions.
- Run the full **§11 Regression / Root-Cause Checklist** below before marking this feature done — every RC-### this repo has already paid for, checked against the new code.
- Update CLAUDE.md What's-Built index row, `docs/BUILD-LOG.md` entry, `docs/PRO-REQUIREMENTS.md` in the same session the feature ships (CLAUDE.md rule 10).

---

## 8. Skills to invoke during development (in rough order of use)

- **`superpowers:brainstorming`** — before touching code on T1, to pressure-test the `ReferralSettings` schema shape (singleton vs. plan-scoped) before it's migrated.
- **`superpowers:writing-plans`** — turn this doc's Task Breakdown into a formal written plan before execution; this doc is the spec, the plan is the execution sequence.
- **`superpowers:executing-plans`** / **`superpowers:subagent-driven-development`** — run the T1–T10 sequence with review checkpoints between tasks (matches "task by task, don't batch").
- **`superpowers:test-driven-development`** — for T6 (commission calc) and T7 (payout) especially — money math needs tests written first.
- **`ecc:database-migrations`** / **`ecc:postgres-patterns`** / **`ecc:prisma-patterns`** — T1 schema + migration, follow existing repo migration numbering/conventions.
- **`ecc:database-reviewer`** agent — review the T1 migration before applying (schema design, indexes, RLS) — same review step every prior migration in this repo has gotten.
- **`ecc:api-design`** — T2/T3/T7 route design consistency with existing `/v1/...` and `/admin/...` conventions.
- **`ecc:security-review`** / **`agent-skills:security-and-hardening`** — T7 payout endpoint + T4 self-referral guardrail, before merge.
- **`code-review`** skill (`/code-review`) — run on the branch before merge, per repo norm.
- **`superpowers:verification-before-completion`** — before marking any task done, confirm it actually works (live-verify pattern this project's build log always does, not just "tests pass").

---

## 9. Next task (not detailed yet — separate session): Coupon Code feature

Owner wants a **Coupon Code** system next, after the referral program ships. Not scoped here — just flagged so it isn't lost. When picked up:
- Same **dynamic/admin-configurable rule applies**: codes, discount type (%/flat), validity window, usage limits, plan-tier eligibility all admin-managed from a dashboard screen, nothing hardcoded.
- Likely shares infrastructure with this referral program (a "code" already means something in this doc — referral codes vs. coupon codes need a clear naming/schema split, or a unified `PromoCode` table with a `kind` discriminator — worth a brainstorming pass before building either one further, given they'll likely collide in the onboarding/checkout flow).
- Full spec, schema, and task breakdown for this to be written in a future session, same format as this doc.

---

## 10. Kickoff prompt — paste this in a new session to start T1

```
Read docs/tasks/referral-program-retailer-affiliate.md in full — that's the spec.
Start Task T1 (Schema + migration) from its §7 Task Breakdown only. Do not start
any other task in this session.

Before writing the migration: use the superpowers:brainstorming skill to settle
the one open schema question in T1 — whether ReferralSettings is a singleton row
or plan-scoped (varies by plan tier) — then superpowers:writing-plans to turn T1
into a concrete plan, then implement.

Hard constraint carried over from the spec: nothing about commission %, duration,
qualify-days, bonus amount, payout minimum, or the second-tier flag/% may be a
hardcoded literal anywhere in application code. All of it lives in the
ReferralSettings table, admin-editable, read at call time. Second tier ships
disabled (second_tier_enabled = false) but the column exists now.

Follow this repo's existing migration numbering convention and the purge-client /
DELETE-revoked pattern (see RC-004, RC-028, SECURITY.md §19) for any table that
needs hard-delete protection. Use ecc:database-migrations / ecc:postgres-patterns
/ ecc:prisma-patterns while building the migration, and get it reviewed via the
ecc:database-reviewer agent before applying.

Do not touch T2 onward. Do not add the coupon-code feature — that's out of scope,
tracked separately in §9 of the same doc for a later session.

After T1 is done and reviewed, stop and report back rather than continuing to T2.
```

---

## 11. Regression / Root-Cause Checklist — run once coding is complete

Every RC-### this repo has already paid for (`docs/root-cause/root-cause issues.md`, CLAUDE.md Root-Cause Tracker), checked against the referral program code before it ships. Directly-applicable ones are **not optional**; the rest are one-line sanity checks that take seconds and have bitten this repo before.

| RC-ID | Root cause (one line) | Check against referral program code |
|---|---|---|
| RC-028 | Purge-revoked DELETE routed through main client, not purge client | Any hard-delete (deactivate referral code, remove settings row, clawback record) uses the purge client, not `kanchuki_app` |
| RC-004 | Same pattern — category DELETE | Same check, T1/T9 admin delete/override endpoints |
| RC-025 | A route existed client + API + DB, but the **proxy route between them was never wired** — silently never worked | Verify every new endpoint (referral events, settings PUT, payout trigger) is actually registered in `index.ts`/admin barrel — grep for the route string, don't just trust the file exists |
| RC-026 | Proxy route missing a verb from its allowlist; `fetch` doesn't throw on non-2xx so the `catch` never fires; failure was silent | T2 admin settings PUT and T8 mobile preference calls must explicitly check `res.ok`/status, not rely on `catch` |
| RC-027 | A DB-driven config string (`engine`) was never validated against what the code actually does with it; unrecognized values silently fell through | `ReferralSettings.referred_bonus_type`, `payout_cadence`, and any other enum-like column must be validated server-side against a known set — reject or default loudly, never silently no-op |
| RC-008 | Server field names (`cgst`) didn't match what mobile read (`estimated_cgst`) — stale wire contract | Confirm `ReferralConversion`/`ReferralPayout` field names match exactly between API response and mobile client — write this down once, don't let it drift |
| RC-003 | Mobile catch block replaced real `ApiError` with a hardcoded fallback string | T8 Refer & Earn screen and T2 admin settings screen must surface the real API error, not a generic "Something went wrong" |
| RC-009 | Same pattern — team-member add | Same check, any admin-side referral mutation |
| RC-010 | Re-sending an unchanged strict-validated field (GSTIN) on every save caused spurious 422s | T2 admin settings save should only send changed fields, or the validation must tolerate resubmission of unchanged values |
| RC-011 | Outbound `fetch` (Razorpay) had no server-side timeout; client's shorter abort fired first → misleading "server not running" error | T7 RazorpayX Payouts API call needs an explicit server-side timeout shorter than any client abort, with a real error message on timeout |
| RC-015 | OTP double-send: guarded only by React state, not a sync ref, so keyboard-submit + tap both fired | Any submit-once action (claim code, apply referral at onboarding, trigger manual payout) needs a ref-guard, not just state, against double-submit |
| RC-007 | Screen dereferenced a field the 2026-08-31 teardown had already dropped | The **old** "Referral Program Engine" (retailer→customer, different feature) was removed in that teardown — grep for any lingering reference to its old field/table names before reusing similar naming for this feature |
| RC-012 | Kept-screen entry points still pointed at teardown-deleted destinations | Confirm no leftover nav/button routes into the old removed referral feature before wiring the new "Refer & Earn" screen in the same nav area |
| RC-013 | Orphaned methods/dead modal survived a teardown, unreachable but still shipping | Grep the API client and mobile app for orphaned `referral`/`affiliate` methods left over from the old removed feature before adding new ones with similar names |
| RC-014 | `navigator.share()` `AbortError` on share-sheet dismissal went uncaught → logged as a real error | T8's WhatsApp/native share button (reusing F-031's share pattern) must catch `AbortError` specifically, not just let it bubble |
| RC-023 | A UI default state (`linkType: 'none'`, reset on every change) buried a feature most users never found | Whatever screen/toggle surfaces the referral code/link on first use should default to visible, not hidden behind an extra tap |
| RC-022 | An optional param the function already supported (`pictureUrl`) was never actually passed by the caller | If the referral share message reuses `publishLinkPost`-style helpers, confirm the link/preview param is actually threaded through, not left at its default empty value |
| RC-017 | `useEffect` depending on a freshly-constructed array/object reference reset UI state on every render, including the user's own interaction | If T8's screen has any tabbed/list state driven by a derived array, memoize it — don't let a re-render silently undo the retailer's own tap |
| RC-024 | An e2e test passed on a cache-warm first paint, hiding a real client-fetch race | If T9's admin leaderboard uses any cached/revalidated fetch, don't assert against a cache-warm state in tests — assert the real cold-path too |
| RC-019 | An offline/network-mocked e2e assertion didn't match how the browser/service worker actually behaves, flaky | Any e2e for the payout/webhook flow should assert against real request/response shape, not a mocked layer that diverges from production behavior |
| RC-001, RC-002 | Free-text/LLM-shaped external data trusted without validating shape; exact-match logic that never actually matched | Not directly applicable (no LLM parsing in this feature) — general reminder if any future NLP/matching logic touches referral data, validate shapes defensively |
| RC-005, RC-006, RC-016, RC-018, RC-020, RC-021 | Product-detail nav bug, sheet-unmount nav bug, FB logout bug, FB re-login regression, OTP double-render, duplicate OTP send | Not applicable to this feature's surface area — listed for completeness per the "all root causes" ask, no action needed unless the build touches OTP/FB/product-sheet code paths |

### Lint / CI gates (run these, not just the table above)
- `pnpm lint` (Biome) — must be clean; CI's `quality` gate has failed on this before (§63, PR #25) over a single formatter violation.
- `pnpm tsc` / `pnpm typecheck` — clean across `apps/api`, `apps/web`, `apps/mobile` (whichever this feature touches).
- `pnpm test` — full suite green, not just the new referral test files.
- `npx vitest run src/routes/security.test.ts` — required if T7 (payout) or any endpoint touches auth/checkout-adjacent logic (CLAUDE.md rule 8).
- `npx vitest run src/routes/admin.login.test.ts` — required since T2/T9 add new admin routes (CLAUDE.md rule 9).
- Grep-proof check (RC-012/RC-013 style): confirm zero references to the old removed referral engine's field/route names remain anywhere in the new code's diff.
