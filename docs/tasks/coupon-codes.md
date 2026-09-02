# Coupon Codes — Platform Discounts on Subscription Checkout

**Status:** 📋 Spec — not built. Design record written before implementation.

**Created:** 2026-09-02
**Owner:** platform / billing
**Related docs:** `apps/api/src/routes/billing.ts`, `docs/tasks/subscription-gst-and-monthly-pricing.md` (§59), `CLAUDE.md` → Pricing Model, `apps/web/src/app/billing/page.tsx`, `apps/mobile/app/plan-select.tsx`

---

## 1. Why

Admin needs to hand retailers a discount code (launch promo, festival offer,
sales-rep incentive) that the retailer types on the plan-select / billing screen
and that reduces what Razorpay charges for the subscription.

Requirements from the ask:
- Admin sets the code.
- Code is shared to retailers (out of band — WhatsApp / email).
- Retailer applies it on the payment / select-plan screen.

---

## 2. Constraint that drives the design

Subscriptions bill through the **Razorpay Subscriptions API** (`plan_id`,
recurring — `billing.ts:201`). You cannot pass an arbitrary reduced amount to a
subscription charge. Razorpay only discounts a subscription via an **Offer**
(`offer_id`), created in the Razorpay Dashboard.

Therefore:
- **Razorpay owns** the discount math, the per-cycle application, the GST
  recompute on the reduced amount, redemption limits, and expiry.
- **Kanchuki owns** only the mapping: human code → `offer_id`, and the input
  field.

An in-house discount engine (own percent/flat math, own redemption counting) was
rejected — it fights the subscription model and duplicates what Razorpay Offers
already enforce.

---

## 3. Admin → Integrations is NOT the store

`INTEGRATION_KEYS` is a fixed catalog (`z.enum`) — `admin-integrations.ts:62`.
Arbitrary `COUPON_<CODE>` keys can't be added without editing the catalog per
coupon. So a small dedicated table is used instead.

---

## 4. Data model

New table, migration `089_platform_coupon`:

```
platform_coupon
  code              text        primary key   -- stored uppercased, e.g. "DIWALI25"
  razorpay_offer_id text        not null      -- "offer_XXXXXXXX" from Razorpay Dashboard
  label             text        null          -- admin note, e.g. "Diwali 2026 — 25% first 3 months"
  active            boolean     not null default true
  created_at        timestamptz not null default now()
```

Deliberately absent (Razorpay Offer already enforces these — do not re-implement):
- discount percent / flat amount
- max redemptions, redeemed count
- expiry date
- per-plan restriction (add later only if a real need appears)

Prisma model + `GRANT` for the API role, same pattern as recent migrations.

---

## 5. Flow

1. **Admin creates the Offer in Razorpay Dashboard** → Offers.
   - Applicable to: Subscriptions.
   - Percentage or flat, duration (first cycle / first N cycles / forever).
   - Set max redemptions + expiry here.
   - Copy the resulting `offer_XXXX`.
2. **Admin → Coupons page** (Kanchuki admin): add row `{ code: "DIWALI25",
   razorpay_offer_id: "offer_XXXX", label: "..." }`. Toggle `active` on/off.
3. **Admin shares the string "DIWALI25"** with retailers — no build step.
4. **Retailer** enters the code in the coupon field on the billing / plan-select
   screen and picks a plan.
5. **`POST /billing/subscription`** looks the code up, resolves `offer_id`, and
   includes it in the Razorpay `/subscriptions` create body.
6. **Razorpay** applies the discount at checkout and on each discounted cycle,
   and issues the correct reduced charge.
7. **`subscription.charged` webhook** records the payment + GST invoice from the
   **actual** charged amount (see §7).

---

## 6. Touch points

### 6.1 API — `apps/api/src/routes/billing.ts`

- `CreateSubscriptionSchema` (`billing.ts:109`): add
  `coupon_code: z.string().trim().min(1).max(40).optional()`.
- In `POST /subscription`, before the Razorpay call:

  ```ts
  let offerId: string | undefined;
  if (body.data.coupon_code) {
    const c = await prisma.platformCoupon.findFirst({
      where: { code: body.data.coupon_code.toUpperCase(), active: true },
    });
    if (!c) throw validationError('Invalid or expired coupon code');
    offerId = c.razorpay_offer_id;
  }
  ```

- Razorpay `/subscriptions` body (`billing.ts:203`): add
  `...(offerId ? { offer_id: offerId } : {})` and, in `notes`,
  `...(body.data.coupon_code ? { coupon: body.data.coupon_code.toUpperCase() } : {})`.
- Audit log metadata (`billing.ts:241`): include the coupon code when present.
- Optional: persist the code on the `subscription` row — only if a column already
  exists; otherwise the `notes` + audit-log record is enough for v1.

### 6.2 API — admin route

New `apps/api/src/routes/admin/admin-coupons.ts` (mirror `admin-plans.ts` shape,
`adminAuthPreHandler`):
- `GET  /admin/coupons` — list all.
- `POST /admin/coupons` — `{ code, razorpay_offer_id, label? }`, upsert on `code`,
  store `code` uppercased.
- `PATCH /admin/coupons/:code` — `{ active }` toggle.
- `DELETE /admin/coupons/:code` — optional; toggling `active=false` is enough.

Register in the admin route index alongside the other `admin-*` route plugins.

### 6.3 Admin web — `apps/web/src/app/admin/coupons/page.tsx`

List (code · offer id · label · active toggle) + an add form. Model on
`apps/web/src/app/admin/plan-features/page.tsx`. Add a sidebar link in
`apps/web/src/app/admin/components/Sidebar.tsx`.

### 6.4 Retailer web — `apps/web/src/app/billing/page.tsx`

- One controlled `coupon` state + `<input>` in the plan-picker block
  (`page.tsx:812`).
- `choosePlan` (`page.tsx:650`): send `coupon_code: coupon || undefined` in the
  POST body.
- On `validationError` for a bad code, the existing `setError` path already
  surfaces the message.

### 6.5 Retailer mobile — `apps/mobile/app/plan-select.tsx` (optional, same field)

- `billingApi.subscribe` (`apps/mobile/src/lib/api/billing.ts:34`): second arg
  `couponCode?: string` → body `{ plan, coupon_code: couponCode }`.
- `plan-select.tsx`: a `TextInput` above the plan list, passed into
  `handleSelectPlan` → `billingApi.subscribe(plan, code)`.
- No Play-billing concern change — checkout is still the external Razorpay URL.

---

## 7. GST invoice correctness (money path — required)

Today the `subscription.charged` webhook computes GST from
`subscription.amount_inr` — the full, undiscounted plan price
(`billing.ts:734`). With a coupon the real charge is lower, so the GST invoice
would overstate base + tax.

Fix in the `subscription.activated` / `subscription.charged` branch: when a
`payment` entity is present, derive the GST base from the **actual** gross
`payment.amount` (reverse the rate), not from `subscription.amount_inr`:

```
basePaise = round(payment.amount / (1 + gst.rate))   // e.g. /1.18
```

Feed that into `computeSubscriptionGst`. This also fixes future proration and
partial-cycle charges, not just coupons. ~3 lines.

`subscription.amount_inr` stays the stored list price for display / renewal
expectations; only the invoice figures follow the actual charge.

---

## 8. Validation & edge cases

- Empty / whitespace coupon field → treated as no coupon (schema `.optional()`,
  client sends `undefined`).
- Unknown or inactive code → `400 validationError('Invalid or expired coupon
  code')`. Retailer can retry without the code.
- Code valid in Kanchuki but the Razorpay Offer is expired / exhausted →
  Razorpay rejects the `/subscriptions` create; the existing `razorpay()` helper
  throws `Razorpay <status>: <body>` and the route returns a 4xx/5xx the client
  shows. Acceptable for v1; a nicer message is a later polish.
- Plan switch flow (`plan-select.tsx:82`, cancel-then-resubscribe) — the coupon
  field is read again on the new `subscribe` call, so a switched plan can carry
  its own code.
- Codes are case-insensitive (stored + compared uppercased).

---

## 9. Out of scope (v1)

- Auto-showing / auto-applying a code without the retailer typing it.
- Per-plan or per-retailer coupon rules.
- Coupon usage analytics in the admin dashboard (Razorpay Dashboard shows
  redemptions per Offer).
- One-time add-on discounts (`/billing/addon-checkout`) — different flow; add
  only if asked.
- i18n of the coupon field label.

---

## 10. Build order

1. Migration `089_platform_coupon` + Prisma model + GRANT.
2. `billing.ts`: schema field + lookup + `offer_id` wiring + audit metadata.
3. `billing.ts`: GST-base-from-actual-charge fix (§7).
4. `admin-coupons.ts` route + register.
5. Admin web page + sidebar link.
6. Web billing coupon input + POST wiring.
7. Mobile coupon input + `billingApi.subscribe` arg (optional).
8. Update `CLAUDE.md` What's-Built index + `docs/BUILD-LOG.md`.

---

## 11. Testing

- `billing.ts` unit/route test: POST with a known active code → Razorpay body
  includes `offer_id`; unknown code → 400; no code → body has no `offer_id`.
- GST helper: gross `payment.amount` → base reverses correctly for 18% (CGST/SGST
  and IGST paths). Extend `apps/api/src/lib/gst.test.ts`.
- Manual: create a real Razorpay test-mode Offer, run a subscription checkout
  with the code, confirm the discounted charge and the invoice base/tax match
  the reduced amount.
- After billing changes run the security suite per `CLAUDE.md` instruction 8:
  `npx vitest run src/routes/security.test.ts`.
