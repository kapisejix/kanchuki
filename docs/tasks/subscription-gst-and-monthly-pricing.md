# Subscription Billing — Monthly-Only Pricing + GST Engine & Invoice PDF

**Status:** ✅ Built — commit `91144cb` (2026-09-01), hardened 2026-09-02 after code
review (`docs/tasks/2026-09-01.md`, 10 findings fixed — see `docs/BUILD-LOG.md`
§59 + §59.1). Migrations `086` + `087` to be applied from the admin dashboard.
This file is kept as the design record; the sections below are the spec as
written before the build, not a live to-do list.

**Created:** 2026-09-01
**Owner:** platform / billing
**Related docs:** `docs/INDIA-RETAILER-GROWTH.md` §I, `docs/PRO-REQUIREMENTS.md` §5 (GST Compliance) + §F-304, `apps/api/src/routes/billing.ts`, `CLAUDE.md` → Pricing Model

---

## 1. Why

Two coupled changes to how Kanchuki charges retailers for their SaaS plan:

1. **Drop annual billing.** Only monthly plans going forward. Removes a whole
   axis (`billing_period`) from billing code, the Razorpay plan matrix, and every
   pricing surface.
2. **Make plan price GST-exclusive + issue GST invoices.** Today the ₹ figures
   are treated as GST-inclusive ("Prices include GST" copy) but nothing computes
   or records the GST split, and no GST invoice PDF is produced for the retailer.
   India law: every B2B SaaS charge to a GST-registered retailer needs a
   tax invoice with the seller GSTIN, buyer GSTIN, CGST/SGST or IGST split, SAC
   code, and a gap-free invoice number series.

After this work:
- Plan price stored in the DB (`plan_pricing`) is the **base, ex-GST** amount.
- Retailer is charged **base + 18% GST**.
- Every successful charge records the tax split and generates a GST invoice PDF.
- Pricing everywhere is driven by the DB, not the hard-coded `PLAN_PRICING`
  constant or `CLAUDE.md`.

---

## 2. Scope

### Part A — Monthly-only pricing, DB-driven

- Remove `annual` / `billing_period` / yearly toggle from API, web, mobile,
  marketing.
- `plan_pricing` table (admin-editable) becomes the single source of truth for
  the base price. `PLAN_PRICING` in `packages/shared` stays only as a
  last-resort fallback (or is deleted — decide in brainstorm).
- `CLAUDE.md` pricing table updated: monthly only, base ex-GST, marked
  "indicative — source of truth is Admin → Plan Limits & Pricing".
- Razorpay: keep the **3 monthly** plans, delete/ignore the 3 annual ones. The
  monthly plan `item.amount` must equal **base + 18% GST** (gross), because
  Razorpay charges a fixed amount and does not add tax.

### Part B — GST split storage (#2) + GST invoice PDF (#3)

- On `subscription.charged` (and any one-time charge that needs an invoice),
  compute `{ base, cgst, sgst, igst, gst_total }` and persist it.
- Generate a GST-compliant invoice PDF, store in R2, expose a download URL to
  the retailer (billing page) and admin.
- Invoice number series: gap-free, per financial year, e.g. `KAN/26-27/000123`.
- Seller (Kanchuki) GST identity becomes configurable (new admin settings or
  env) — legal name, GSTIN, registered address, state code.

---

## 3. Current State (verified 2026-09-01)

### Pricing / billing

| Thing | Where | Note |
|---|---|---|
| Hard-coded prices | `packages/shared/src/constants/index.ts` → `PLAN_PRICING` | has `monthly` + `annual` per tier |
| DB pricing table | `packages/db/prisma/schema.prisma` → `model PlanPricing` | `monthly_paise`, `annual_paise`; admin-editable via `PUT /admin/plan-pricing` |
| Price resolver | `apps/api/src/routes/billing.ts` → `getPlanPricing()` | DB row → else `PLAN_PRICING` fallback |
| Razorpay plan IDs | `apps/api/src/routes/billing.ts` → `RAZORPAY_PLAN_IDS` | reads 6 env vars `RAZORPAY_PLAN_<TIER>_<PERIOD>`; **not** admin-configurable |
| Auto-create plans | `POST /admin/billing/setup-plans` (`admin-plans.ts`) | creates all 6 in Razorpay, prints env snippet |
| Subscription create | `POST /billing/subscription` (`billing.ts`) | takes `billing_period`, `total_count` 120 (monthly) / 10 (annual), `periodEnd()` |
| Yearly UI touchpoints (grep `annual\|billing_period\|yearly`) | `apps/web/src/app/billing/page.tsx` + `billing/lib.ts`, `apps/web/src/app/pricing/page.tsx` + `PricingTable.tsx`, `apps/web/src/app/sections/MarketingSections.tsx`, `apps/web/src/app/terms/page.tsx`, `apps/web/src/lib/sitemap.ts`, `apps/web/src/app/admin/plan-limits/page.tsx`, `apps/web/src/app/admin/billing/page.tsx`, `apps/mobile/app/plan-select.tsx`, `apps/mobile/src/lib/api/billing.ts`, `apps/api/src/routes/public/public-misc.ts`, `apps/api/src/routes/admin/admin-plans.ts` | full list — each needs the annual path removed |

### GST — what already exists (do NOT rebuild)

| Thing | Where | State |
|---|---|---|
| Payment tax columns | `schema.prisma` → `model SubscriptionPayment` | `amount_excluding_gst Int?`, `gst_amount Int?`, `gst_invoice_number String?` **already present, never populated** |
| Retailer-facing GST report routes | `apps/api/src/routes/growth/growth-gst.ts` | reads `SubscriptionPayment.gst_amount` / `gst_invoice_number`; estimates CGST/SGST as `gst/2`, IGST 0 |
| Admin GST report dashboard | `apps/api/src/routes/admin/admin-gst.ts` (Phase 8) | monthly breakdown, per-retailer summary — all off the same columns |
| Admin GST report page | `apps/web/src/app/admin/reports/gst/page.tsx` | consumes the admin route |
| PDF library | `apps/api/package.json` → `pdfkit@^0.15.0` + `apps/api/src/types/pdfkit.d.ts` | installed, ready |
| Invoices endpoint | `GET /billing/invoices` (`billing.ts`) | returns `SubscriptionPayment` rows; no PDF |

### GST — what is missing

- Nothing computes or writes `amount_excluding_gst` / `gst_amount` /
  `gst_invoice_number` — the webhook `subscription.charged` branch in
  `billing.ts` creates a bare `SubscriptionPayment`.
- No real CGST/SGST/IGST split stored (reports guess `gst/2`). No
  `place_of_supply`.
- No invoice-number sequence / no `GstInvoiceSequence` table.
- No PDF generation, no R2 upload, no download route.
- No Kanchuki seller GST identity anywhere (no `COMPANY_GSTIN` etc.).
- F-304's `computeGst()` (5%/12% apparel HSN) was for **retailer→customer
  orders**, which were removed in the feature teardown. Not reusable here —
  subscriptions are a **service** (SAC 998314, flat 18%), not goods.

---

## 4. Decisions Locked (by owner, 2026-09-01)

1. **Monthly only.** No annual plans, no toggle.
2. **`plan_pricing` (admin dashboard) is the source of truth** for the base
   price. `CLAUDE.md` numbers are indicative only.
3. **Stored price is the base, ex-GST.** Retailer pays `base + 18%`.
4. **GST rate: 18% flat**, SAC **998314** (Information technology software
   services / SaaS). Confirm SAC with the CA before go-live.
5. Razorpay monthly plan `item.amount` = **gross** = `round(base * 1.18)`.
6. Keep the 3 existing monthly Razorpay plans; retire the 3 annual ones.

### Open questions for the brainstorm (resolve before writing the plan)

- **A.** Do the base numbers stay ₹999 / ₹2,499 / ₹4,999 (so retailer now pays
  ₹1,178.82 / ₹2,948.82 / ₹5,898.82), or are the bases adjusted so the gross
  lands on a round number the marketing site can show? This changes the
  Razorpay plan amounts and every price label.
- **B.** Retailer has **no GSTIN** (not registered): still charge 18%? (Yes —
  GST is on the supply, not the buyer's status.) Invoice shows buyer GSTIN as
  "Unregistered". Confirm.
- **C.** Place of supply / intra vs inter-state: derive from
  `Retailer.state` vs Kanchuki's registered state code. Need Kanchuki's
  registered state fixed in config. What is it?
- **D.** Existing live subscriptions (if any) on annual plans — migrate to
  monthly at renewal, or grandfather? (Check `subscriptions` table for
  `billing_period = 'annual'` rows first.)
- **E.** Invoice number format + series reset cadence (per FY `KAN/YY-YY/NNNNNN`
  is the common choice).
- **F.** `PLAN_PRICING` constant — delete entirely, or keep as a typed fallback
  for a cold DB?
- **G.** Do we also need a **credit note** flow for refunds/cancellations, or is
  that out of scope for v1?

---

## 5. GST Calculation Spec

All amounts in **paise** (integers). One helper, one place — put it in
`apps/api/src/lib/gst.ts` and unit-test it hard.

```
GST_RATE = 0.18
SAC_CODE = "998314"

computeSubscriptionGst({ basePaise, buyerStateCode, sellerStateCode }):
  gstTotal = round(basePaise * GST_RATE)
  gross    = basePaise + gstTotal
  if buyerStateCode && buyerStateCode === sellerStateCode:
     cgst = round(gstTotal / 2)
     sgst = gstTotal - cgst          // put the rounding remainder on SGST
     igst = 0
  else:
     cgst = 0
     sgst = 0
     igst = gstTotal
  return { basePaise, gstTotal, gross, cgst, sgst, igst, rate: GST_RATE, sac: SAC_CODE }
```

Rules:
- **Always compute from `base`**, never divide a gross by 1.18 (float drift).
- Rounding: `Math.round` to the nearest paise; the CGST/SGST split remainder
  goes to SGST so `cgst + sgst === gstTotal` exactly.
- `buyerStateCode` unknown (no address/GSTIN) → treat as **inter-state → IGST**
  (safer default; confirm with CA).
- Store the resolved split on the payment row so reports stop guessing.

Worked example (base ₹999 = 99900 paise, intra-state):
`gstTotal = 17982`, `gross = 117882`, `cgst = 8991`, `sgst = 8991`.

---

## 6. Data Model Changes

Migration (Prisma). Numbering continues from the latest in
`packages/db/prisma/migrations/` (last applied was `083`).

### `SubscriptionPayment` — extend

Already has `amount_excluding_gst`, `gst_amount`, `gst_invoice_number`. Add:

| Column | Type | Note |
|---|---|---|
| `gst_rate` | `Decimal @db.Decimal(4,4)` or `Int` (basis points) | 0.1800 |
| `cgst_amount` | `Int?` | paise |
| `sgst_amount` | `Int?` | paise |
| `igst_amount` | `Int?` | paise |
| `place_of_supply` | `String?` | buyer state code / name |
| `sac_code` | `String?` | "998314" |
| `invoice_pdf_url` | `String?` | R2 key/URL |
| `invoice_generated_at` | `DateTime?` | |

(`amount_inr` stays = the **gross** actually charged. `amount_excluding_gst` =
base. `gst_amount` = `cgst+sgst` or `igst`.)

### New `GstInvoiceSequence`

Gap-free per-FY counter. One row per financial year, incremented in a
transaction (`SELECT ... FOR UPDATE` / Prisma interactive txn) so two
concurrent webhooks can't collide.

| Column | Type |
|---|---|
| `financial_year` | `String @id` — e.g. `"26-27"` |
| `last_number` | `Int` |
| `updated_at` | `DateTime @updatedAt` |

### Seller identity — config, not schema

New keys in the **admin integration/settings vault** (`INTEGRATION_KEYS` in
`packages/shared`, category e.g. `BILLING`) **or** a small `PlatformGstProfile`
singleton table:
`COMPANY_LEGAL_NAME`, `COMPANY_GSTIN`, `COMPANY_ADDRESS`,
`COMPANY_STATE_CODE`, `COMPANY_PAN`, `INVOICE_PREFIX` (`KAN`).
Decide table vs vault in the brainstorm (vault = consistent with existing
secret handling; table = easier to render/edit as a form).

---

## 7. Task Breakdown

> Each task: branch, TDD where logic exists, typecheck, run the named tests,
> update docs in the **same** commit (CLAUDE.md rule 10 + 11).

### Part A — Monthly-only + DB pricing

- **A1.** Remove `annual` from `PLAN_PRICING` (or delete the constant per Q-F);
  drop `annual_paise` from `PlanPricing` model + migration; update
  `getPlanPricing()`.
- **A2.** `billing.ts`: drop `billing_period` from `CreateSubscriptionSchema`,
  `RAZORPAY_PLAN_IDS` (3 entries not 6), `periodEnd()`, `total_count` logic,
  `subscription.billing_period` writes. `POST /admin/billing/setup-plans`:
  create 3 monthly plans at **gross** (`base * 1.18`).
- **A3.** `schema.prisma` `Subscription.billing_period` — keep column for
  history but stop writing `annual`; or drop (check existing rows first, Q-D).
- **A4.** Web: `billing/page.tsx` + `billing/lib.ts` — remove Monthly/Annual
  toggle, annual price labels, savings %. `pricing/page.tsx` +
  `PricingTable.tsx`, `MarketingSections.tsx`, `terms/page.tsx`,
  `admin/plan-limits/page.tsx` (annual column), `admin/billing/page.tsx`,
  `sitemap.ts`.
- **A5.** Mobile: `app/plan-select.tsx`, `src/lib/api/billing.ts` — remove
  annual.
- **A6.** `public-misc.ts` and any public pricing JSON — monthly only.
- **A7.** Docs: `CLAUDE.md` Pricing Model table (monthly only, base ex-GST,
  "source of truth = admin dashboard"), `docs/PLAN.md`,
  `docs/PRO-REQUIREMENTS.md`, `docs/INDIA-RETAILER-GROWTH.md`.

### Part B — GST engine + invoice PDF

- **B1.** `apps/api/src/lib/gst.ts` — `computeSubscriptionGst()` per §5.
  Unit tests: intra vs inter-state, rounding remainder, zero/edge, large amount.
- **B2.** Migration — extend `SubscriptionPayment` (§6), add
  `GstInvoiceSequence`, add seller-profile table if chosen.
- **B3.** Seller GST profile — admin route (`GET/PUT /admin/gst-profile`) +
  admin page (form) OR vault keys + reuse integrations page. Validate GSTIN
  format (15 chars, state code prefix).
- **B4.** Invoice-number allocator — `apps/api/src/lib/gst-invoice-number.ts`,
  Prisma interactive transaction, `KAN/<FY>/<zero-padded>`. Concurrency test.
- **B5.** `billing.ts` webhook `subscription.charged`: after creating the
  `SubscriptionPayment`, call `computeSubscriptionGst()` with
  `Retailer.state` + seller state, write all tax columns + allocate invoice
  number. Idempotent on `razorpay_payment_id` (unique already) — don't
  double-allocate on webhook retry.
- **B6.** PDF builder — `apps/api/src/lib/gst-invoice-pdf.ts` using `pdfkit`.
  Layout: seller block (name, GSTIN, address, state), buyer block (shop name,
  GSTIN or "Unregistered", address, state), invoice no + date, line item
  (plan name, SAC 998314, base), CGST/SGST or IGST rows, total in figures +
  words, "Reverse charge: No", place of supply. Return a Buffer.
- **B7.** R2 upload — reuse the existing R2 client / `R2_PATHS`; key like
  `invoices/subscription/<retailerId>/<invoiceNo>.pdf`; save URL to
  `invoice_pdf_url`. Generate synchronously in the webhook, or enqueue a job
  (BullMQ pattern already in repo `apps/api/src/jobs/`) — prefer a job so a PDF
  failure never 500s the webhook.
- **B8.** Download routes — `GET /billing/invoices/:id/pdf` (retailer, own rows
  only) and `GET /admin/gst/invoices/:id/pdf`. Stream from R2 or redirect to a
  signed URL.
- **B9.** Wire real numbers into the existing reports — `growth-gst.ts` and
  `admin-gst.ts` stop estimating `gst/2`, read `cgst_amount` / `sgst_amount` /
  `igst_amount`. `admin/reports/gst/page.tsx` shows the invoice-no column +
  download link.
- **B10.** Retailer billing page (`apps/web/src/app/billing/page.tsx`) — add an
  "Invoices" list with download buttons; show the GST breakdown on the plan
  cards ("₹999 + 18% GST = ₹1,178.82/mo").
- **B11.** Backfill (optional) — for any existing `SubscriptionPayment` rows,
  compute + store the split and generate PDFs. One-off script in `scripts/`.
- **B12.** Docs — `docs/BUILD-LOG.md` entry, flip
  `docs/INDIA-RETAILER-GROWTH.md` §I to describe subscription GST (currently
  describes the removed order GST), `docs/PRO-REQUIREMENTS.md` §5 acceptance
  criteria, `CLAUDE.md` What's-Built index row.

### Ops / rollout (owner, not code)

- Recreate/verify the **3 monthly** Razorpay plans with `item.amount` = gross.
- Delete or ignore the 3 annual Razorpay plans.
- Set `RAZORPAY_PLAN_STARTER_MONTHLY` / `_GROWTH_MONTHLY` / `_PRO_MONTHLY`
  (Railway env, or via the admin integrations vault if that wiring lands first
  — see the separate Razorpay-plan-ID note).
- Fill the Kanchuki seller GST profile in admin.
- Confirm SAC 998314 + place-of-supply logic with the CA.
- Register the Razorpay webhook URL (`/v1/billing/webhook`) with events
  `subscription.charged` etc. + `RAZORPAY_WEBHOOK_SECRET`.

---

## 8. Skills & Subagents To Use

| Phase | Skill / agent | Why |
|---|---|---|
| Before anything | `superpowers:brainstorming` | resolve §4 open questions, lock the design, produce the spec |
| After brainstorm | `superpowers:writing-plans` | turn this + brainstorm output into a step-by-step implementation plan |
| Executing the plan | `superpowers:executing-plans` or `superpowers:subagent-driven-development` | checkpointed execution |
| GST math (B1), invoice number (B4) | `superpowers:test-driven-development` | pure logic, money path — tests first |
| Migration (A1, A3, B2) | `ecc:database-migrations` + `ecc:prisma-patterns` | safe Prisma migration authoring |
| Migration review | `ecc:database-reviewer` (agent) | catches unsafe DDL, missing indexes |
| API routes (B3, B5, B8) | `ecc:backend-patterns` / `ecc:api-design` | Fastify route conventions |
| Web changes (A4, B9, B10) | `ecc:react-patterns`, `frontend-design:frontend-design` | consistent UI |
| Mobile (A5) | `ecc:react-patterns` (RN) | |
| Every code change | `ecc:typescript-reviewer` (agent) | MUST per CLAUDE.md for TS/JS |
| Before merge | `code-review` (`/code-review`) then `ecc:security-reviewer` (agent) | money + PII (GSTIN) path |
| Docs pass | `ecc:update-docs` | keep CLAUDE.md / BUILD-LOG in sync |

Repo rules to respect (from `CLAUDE.md`):
- Present diffs, get approval before applying.
- Never run `railway up` / migrations against prod — migration applied from the
  admin dashboard with approval.
- After auth/checkout-ish changes: `npx vitest run src/routes/security.test.ts`.
- After billing changes: `npx vitest run src/routes/billing.test.ts`.
- Update `CLAUDE.md` index + `BUILD-LOG.md` + `PLAN.md` + `PRO-REQUIREMENTS.md`
  in the same session a feature commit lands.

---

## 9. Testing Checklist

- `apps/api` unit: `gst.ts` (all branches), invoice-number allocator
  (concurrent), webhook idempotency (replayed `subscription.charged` →
  one invoice, one number).
- `npx vitest run src/routes/billing.test.ts` — update for monthly-only shape,
  add GST assertions on the charged-webhook path.
- `npx vitest run src/routes/security.test.ts` — invoice PDF routes must be
  auth-scoped (retailer can't fetch another retailer's invoice).
- Web: pricing pages render monthly-only, no `annual` string, GST line shows.
- `pnpm --filter @kanchuki/api tsc` + `pnpm --filter web typecheck` clean.
- Manual: test-mode Razorpay subscription → charge → row has base/cgst/sgst/
  igst, invoice number allocated, PDF in R2, retailer can download.

---

## 10. Non-Goals (v1)

- Credit notes / refund invoices (Q-G — revisit).
- e-Invoice / IRN / GSTN portal push (only needed above the turnover
  threshold).
- Multi-currency (INR only, per `CLAUDE.md`).
- Retailer→customer order GST (that was F-304, orders removed).
- TDS / TCS handling.

---

## Starter Prompt (paste into a fresh session)

```
Read docs/tasks/subscription-gst-and-monthly-pricing.md in full, then
docs/INDIA-RETAILER-GROWTH.md §I and docs/PRO-REQUIREMENTS.md §5.

We are doing two coupled billing changes:
  A) Remove annual/yearly plans — monthly only — and make plan_pricing (the
     admin dashboard table) the single source of truth for the BASE price.
  B) Treat the stored price as GST-EXCLUSIVE: charge retailer base + 18% GST
     (SAC 998314), record the CGST/SGST/IGST split on each SubscriptionPayment,
     and generate a GST-compliant invoice PDF (pdfkit is already installed).

Start with superpowers:brainstorming. Resolve the "Open questions for the
brainstorm" in §4 of the task doc with me one at a time (especially: do the
base prices stay 999/2499/4999 or get adjusted; Kanchuki's registered GST
state; what to do with any existing annual subscriptions). Then use
superpowers:writing-plans to produce the implementation plan from the task
doc's §7 breakdown. Do NOT write code until the plan is approved.

Constraints: follow CLAUDE.md operational policy — present diffs for approval,
no railway up, no prod migrations (admin dashboard applies them), update
CLAUDE.md + BUILD-LOG.md + PLAN.md + PRO-REQUIREMENTS.md in the same session as
any feature commit. Money + GSTIN path: TDD the GST math and invoice-number
allocator, and run /code-review + the security-reviewer agent before merge.
```
