# Plan Switching Model B — Prorated Immediate Switch — PENDING
> Extracted 2026-09-23 from `docs/PRO-REQUIREMENTS.md` (lines 901–921). Pending — not built.

**Model A — switch takes effect next cycle, no proration (current, built 2026-09-05).** A retailer can change plans anytime; the current plan and its full features/billing continue until the current paid period ends, then the new plan starts and bills at full price from that point. No partial refund, no partial charge, no day-by-day math.

Implementation (`apps/api/src/routes/billing/billing-subscription.ts`): `POST /billing/cancel` cancels the old Razorpay subscription at its own period end (Razorpay's default — not immediate). `POST /billing/subscription` (the new plan) floors its Razorpay `start_at` at the **prior subscription's `current_period_end`**, not just the trial-end/now floor — this is the fix for a double-billing bug where the new subscription used to start almost immediately while the old one was still billing out its paid period. Mobile (`plan-select.tsx`) drives this by calling cancel() then subscribe() when a live (TRIAL or ACTIVE) subscription already exists.

**Model B — prorated immediate switch (🔴 Planned, not started).** For a retailer who wants the new plan's features *right now* instead of waiting for renewal — mainly useful for upgrades (Starter→Growth→Pro), not downgrades (no cash refunds planned).

Formula:
```
remaining_days   = (current_period_end − now) in days
period_length    = (current_period_end − current_period_start) in days
unused_credit    = old_plan_price × (remaining_days / period_length)
new_plan_partial = new_plan_price × (remaining_days / period_length)
amount_due_now   = new_plan_partial − unused_credit
```
Example: Starter (₹4,999) → Growth (₹9,999), 30-day cycle, switching on day 20 (10 days remain): unused_credit = ₹1,666.33, new_plan_partial = ₹3,333.00, amount_due_now = ₹1,666.67 (+18% GST), charged today; the following renewal bills full Growth price on the original cycle date.

Build note: use Razorpay's native **"Update Subscription"** endpoint (`PATCH /subscriptions/:id` with `schedule_change_at: 'now'`) to swap the plan on the existing subscription — Razorpay computes and charges/credits the proration itself. Do **not** implement this as cancel+recreate (that's the Model A pattern and lacks proration semantics). Keep downgrades on Model A even if Model B ships for upgrades — no refund path exists or is planned.

---

