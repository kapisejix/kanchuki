# Kanchuki — Build Log (part 7)

> Continuation of [`../BUILD-LOG.md`](../BUILD-LOG.md) — started 2026-10-22 because part 6 passed the 150k-char doc limit. Same format: newest entries appended at the bottom.

---

## 2026-10-22 - Payment link signature 4-part only, exact subscription charge check

**Branch:** `fix/payment-verify-strict` (stacked on `fix/security-hardening-2` / PR #143, which touches the same billing helpers). Hardening, not a bug fix: no RC. No migration, no client change.

| Piece | Detail |
|---|---|
| `verifyPaymentLinkSignature` | Accepts only Razorpay's documented form, HMAC over `link_id\|reference_id\|status\|payment_id` with `status === 'paid'`. The 2-part `link_id\|payment_id` form is gone: Razorpay never signed it (it was this repo's own guess in `7446671a`), and it has the same shape and key secret as a Standard Checkout order signature (`order_id\|payment_id`), so an order signature could pass as a payment-link one. A missing status is now a reject. |
| Callers | `GET /billing/addon-callback` and `GET /public/catalog-upload-tickets/:id/payment-callback` make one call each instead of the 4-part-then-2-part fallback. No client code calls either route, only Razorpay's redirect. |
| Webhook amount | `subscription.charged` activates only when the captured INR amount is exactly `computeSubscriptionGst(base).gross` (base + 18% GST), not `>= base`. A base-only or wrong-plan charge used to activate and write a GST invoice whose base/GST split did not match the money taken. A refused **captured** payment now raises a Sentry alert (`area: billing-webhook`); before, it was a log line only, the RC-071 shape. |
| Subscribe guard | `POST /billing/subscription` fetches the Razorpay plan and refuses with 503 `PLAN_PRICE_MISMATCH` (+ Sentry) when its fixed amount is not `plan_pricing` base + GST. Without this, an admin price edit with no new Razorpay plan would charge new subscribers and then have the exact webhook check refuse them. One extra Razorpay GET per subscribe. |
| `admin-plans` | `setup-plans` computes the plan gross with the same `computeSubscriptionGst` helper instead of `Math.round(base * 1.18)`, so plan creation, subscribe guard and webhook share one formula. The plan-pricing PUT comment says a price change needs `setup-plans` + new plan ids. |
| Tests | billing signatures +3 (tampering, 2-part rejected with and without status, empty-key forgery on 4-part), webhook refusal table +2 (base-only, overpaid by 1 paisa), subscribe guard +2 (stale plan amount → 503 and no Razorpay subscription; matching amount → created). Add-on callback tests now sign the 4-part form. Full API suite (run in folder chunks, low memory): 164 files, 2305 passed, 5 skipped, 0 failed; `tsc --noEmit` clean; biome clean on the 9 changed files. `lib/my-style-analysis.test.ts` failed once on an ioredis connect `AggregateError` and passed on rerun (flaky, unrelated). |
| Owner action | After any `plan_pricing` edit: Admin → setup-plans, then set the new `RAZORPAY_PLAN_*_MONTHLY` ids, or that plan's subscribe returns 503. Before #142 the callbacks accepted only the 2-part form, so any real payment-link callback would have returned 401; if add-ons or catalog uploads were ever paid through a link in prod, check those rows for missing credit. |
| Not verified | Nothing run against live Razorpay. The catalog-upload payment-callback has no route-level test (the signature rule is covered by the helper unit test). |
