# Decision sheets — billing (prorated switch, coupons, AI credits)

**Written:** 2026-10-24 · **For:** owner · **Status:** 📋 Waiting for your answers. Nothing here is built or changed.
**Specs behind each sheet:** `plan-switch-prorated.md`, `coupon-codes.md`, `ai-credit-billing-model.md` (all in this folder).

## Facts that apply to all three (read-only checks, 2026-10-24)

- **`subscriptions` has 0 rows.** Nobody has ever paid. 19 retailers exist (pilot). So there is no billing data to migrate and no customer who is hurt by waiting.
- **Prices (`plan_pricing`, ex-GST):** Starter ₹4,999 · Growth ₹9,999 · Pro ₹14,999. Retailer pays base + 18% GST.
- **Current switching = Model A** (new plan starts at next cycle, no proration). It is built and works.
- **Money-path guard (RC-076)** in `billing-webhook.ts:174-191`: a `subscription.charged` payment is **ignored, not activated** unless it is captured, INR and `payment.amount >= subscription.amount_inr` (the base price). GST is computed from the stored base (`billing-webhook.ts:199-203`), not from what was charged. This matters for sheets 1 and 2.
- **Plan limits now (`plan_limits`):** Studio shoots/month 200 / 400 / 1000 · try-ons/month 20 / 50 / 100 · AI tagging (lifetime) 575 / 2,300 / 9,999 · products (lifetime) 500 / 2,000 / 5,000.

---

## Sheet 1 — Prorated mid-cycle plan switch (Model B)

**The question:** when a retailer upgrades (e.g. Starter → Growth) mid-month, should the new plan start **now** with a prorated charge, or keep today's behaviour (new plan starts at the next renewal)?

**What Model B would do** (spec formula): amount due now = (new price − old price) × remaining days ÷ cycle days, plus 18% GST. Example in the spec: Starter → Growth on day 20 of 30 = ₹1,666.67 + GST today, full Growth price at the next renewal.

**Facts that change the picture**

1. **Razorpay can do the proration itself.** `PATCH /subscriptions/:id` with `schedule_change_at: "now"` swaps the plan; for upgrades Razorpay raises an invoice for the difference and charges it, and **if that charge fails the subscription is not updated**. The difference must be at least ₹0.50, and proration only applies when the change is immediate. ([Razorpay: update a subscription](https://razorpay.com/docs/api/payments/subscriptions/subscriptions/update-subscription))
2. **UPI is unresolved, and your pricing is "UPI first".** I could not confirm from Razorpay's docs whether a UPI AutoPay mandate allows a prorated mid-cycle plan change. One third-party FAQ says plan switching allows cards only; Razorpay's marketing page says subscriptions work with all major UPI apps and says nothing on proration. **This needs a Razorpay test-mode run or a support answer before anyone writes code.** ([Razorpay subscriptions](https://razorpay.com/subscriptions/), third-party: [Quintype FAQ](https://developers.quintype.com/subtype/FAQ/how-switch-works-with-razorpay.html), date unknown.)
3. **The webhook would reject the prorated charge.** The difference charge is smaller than the new plan's base price, so the RC-076 guard (`payment.amount < subscription.amount_inr`) would log "failed verification — not activating" and skip the invoice. The GST invoice would also be computed on the full plan price instead of the amount actually charged. Model B therefore needs a webhook change on the money path, plus the DB `plan` and `plan_expires_at` set on the switch, plus a GST invoice for a partial amount.
4. Downgrades stay on Model A either way (no refund path exists or is planned).

**Options**

| | What | Cost | Risk |
|---|---|---|---|
| A. Keep Model A | Nothing to build. Upgraders wait for the next renewal. | 0 | A retailer who wants Pro features now cannot get them without cancelling. With 0 paid subscriptions this is theoretical. |
| B. Model B for upgrades only, after a test-mode spike | 0.5-day Razorpay test-mode check (UPI + card), then ~2 days: switch call, webhook guard change, partial-amount GST invoice, tests, security suite. | ~2.5 days | Touches the payment webhook (RC-076, RC-071 shapes). Needs your money-logic sign-off on the formula and on rounding. |
| C. Manual upgrade by admin | Admin grants the higher plan and the retailer pays the difference by a one-off payment link. | ~0.5 day | Manual work per upgrade; no new webhook logic. |

**Recommendation: A for now, revisit after the first 10 paying retailers.** There is no revenue at risk today, the UPI question could make Model B card-only, and the webhook change is the kind of edit that has already produced two payment bugs (RC-071, RC-076). If upgrades turn out to be common, do B, and start with the test-mode spike.

**Your answer:** ☐ A  ☐ B (start the spike)  ☐ C   Notes: ______

---

## Sheet 2 — Coupon codes on subscription checkout

**The question:** do you want coupon codes before launch, and if yes, what kind?

**Design already decided in the spec:** Razorpay owns the discount (an **Offer** you create in the Razorpay Dashboard, which cannot be created via API); Kanchuki only maps `code → offer_id` in a small table and sends `offer_id` when creating the subscription. ([Razorpay: create subscription offers](https://razorpay.com/docs/payments/subscriptions/offers/create/))

**Facts that change the picture**

1. **The spec predates RC-076 and would break with it.** The spec only fixes the GST base ("derive from `payment.amount`"). But the guard in `billing-webhook.ts:178` ignores any charge below the base price. A 25%-off coupon charges `0.75 × 1.18 = 0.885` of base, which is **below base, so the retailer pays, nothing activates and no invoice is made.** Only discounts up to about 15% slip through the guard, and those would still get an invoice on the wrong amount. A coupon build must change the guard to compare against the expected charge after the offer, not the list price.
2. **Migration number in the spec is stale.** It says `089_platform_coupon`; 089 is taken (`resource_packs`). The next free number is **138**.
3. **Unverified:** how many billing cycles an Offer's discount covers, and whether an Offer can be redeemed on a UPI AutoPay mandate. The Razorpay pages I found did not show the redemption-type details. Check in the Dashboard before promising "first 3 months free".
4. **You already have a trial.** The subscription code has a TRIAL status. A coupon is only needed if you want a discount on top of, or instead of, the trial.

**Options**

| | What | Cost |
|---|---|---|
| A. No coupons at launch | Use the trial. Revisit when you run a festival or sales-rep promotion. | 0 |
| B. Build coupons as specced, with the guard fix | Table (migration 138) + billing route + webhook guard/GST change + admin page + web/mobile input + tests + a Razorpay test-mode Offer run. | ~2 days. Payment-path change. |
| C. No code: send discounted payment links by hand | Admin creates a Razorpay payment link for the reduced first payment. | 0, manual |

**Recommendation: A.** With 0 paying retailers and a trial in place, a coupon has nothing to discount yet. When you do want one, build B and start with the webhook guard change, because that is the part that silently takes money without activating the plan.

**Your answer:** ☐ A  ☐ B  ☐ C   If B: discount type (percent / flat) ______, how many cycles ______, who gets codes (sales reps / festival) ______

---

## Sheet 3 — AI credit / limit / billing model

**The question:** do we build the pricing-and-credits system (editable per-API prices, top-up packs, margin dashboard) now, and as per-resource counters or one credit wallet?

**What is already built:** per-plan monthly/lifetime limits, per-retailer overrides, usage counters, a 429 block when over limit, an admin-editable top-up pack table (`resource_packs`, **currently empty**), AI provider table with weights, per-call usage log (`ai_usage_logs`), and a daily AI-spend alert (RC-081). See the spec §2.

**Real numbers from prod (`ai_usage_logs`, 676 rows)**

- 368 tagging calls on gpt-4o-mini (2 credits each = 736), 24 colour-detect calls.
- At least 190 Studio shoots on `flux-kontext-pro` (BFL) across the 13 most-used styles (I read only the top 15 usage groups, so the total is higher). Logged at 1 credit each; the "8 credits per image" in the app is display only.

**Worst-case platform cost if a retailer uses every limit** (cost figures are the spec's: Studio ≈ ₹3.5/image, try-on ≈ ₹4, tagging ≈ ₹0.33/image on Claude; gpt-4o-mini is cheaper):

| Plan | Price | Studio | Try-on | Tagging | Worst-case cost | Share of price |
|---|---|---|---|---|---|---|
| Starter | ₹4,999 | 200 × 3.5 = ₹700 | 20 × 4 = ₹80 | 575 × 0.33 = ₹190 (lifetime) | ≈ ₹970 | ≈ 19% |
| Growth | ₹9,999 | 400 × 3.5 = ₹1,400 | 50 × 4 = ₹200 | 2,300 × 0.33 = ₹760 (lifetime) | ≈ ₹2,360 | ≈ 24% |
| Pro | ₹14,999 | 1,000 × 3.5 = ₹3,500 | 100 × 4 = ₹400 | 9,999 × 0.33 = ₹3,300 (lifetime) | ≈ ₹7,200 | ≈ 48% (tagging is lifetime, so spread over months it is far lower) |

The existing limits already cap the worst case. Studio is the main cost driver. These are estimates from the spec's unit costs, not invoices.

**Your 8 blocking questions, with my recommended defaults**

| # | Question | Recommended |
|---|---|---|
| 1 | One wallet or per-feature buckets | **Per-feature (Model A).** ~90% built; the wallet is a rewrite (+2–3 days). The "DB is empty" argument for B is weaker now that 19 pilot retailers exist. |
| 2 | ₹1,000 pack = 80 credits or 80 images | Decide when you create the first pack. Price it per image: ₹1,000 / 80 images = ₹12.5 per image against ≈ ₹3.5 cost. |
| 3 | Limit units: images or credits | **Images/actions.** It is what retailers understand. |
| 4 | gpt-4o-mini billing: flat or per token | **Flat per call for the limit, and log tokens for margin.** |
| 5 | Separate limits for colour/item/tagging | **One AI-tagging bucket.** Colour auto-fill and item detect were removed on 2026-10-10, so this is mostly moot. |
| 6 | At zero credits | **Hard block + "buy more" screen** once packs exist. |
| 7 | Vendor cost input | **Flat ₹ per unit, edited by hand.** FX conversion adds moving parts for no gain. |
| 8 | Migrate hardcoded packs | **Leave them; only make AI packs editable** until a retailer actually asks to buy more. |

**Options**

| | What | Cost |
|---|---|---|
| A. Do nothing now | Existing limits cap cost; RC-081 alerts on spend. | 0 |
| B. Visibility only | AI Usage page: per-retailer grid, limit used %, estimated ₹ cost (client-side rollup). | ~0.5 day, no migration |
| C. Full Model A build | Pricing table, Studio charged by DB price, margin card, retailer "credits left + buy". | 5–6 days |

**Recommendation: B now, C when a retailer hits a limit and asks to buy more.** B shows you who is spending what with half a day of work and no payment code. C only earns its cost once someone wants to pay for more than the plan includes. Create one or two real packs in Admin → Resource Packs first; that half is already built.

**Your answer:** ☐ A  ☐ B  ☐ C   Overrides to the defaults above: ______

---

## What each answer unlocks

- Sheet 1 = B or C starts a Razorpay test-mode spike (needs your test keys, which I won't handle) and a payment-path change.
- Sheet 2 = B starts with the webhook guard change; needs a test-mode Offer you create in the Dashboard.
- Sheet 3 = B is a half-day task I can start immediately.

Sources used: Razorpay docs linked above; code facts from `billing-webhook.ts`, `billing-subscription.ts`, and read-only queries on `plan_pricing`, `plan_limits`, `ai_usage_logs`, `subscriptions`, `resource_packs`.
