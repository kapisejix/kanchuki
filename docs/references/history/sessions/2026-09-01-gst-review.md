> **RESOLVED 2026-09-02** — all 10 findings fixed. See `docs/BUILD-LOG.md` §59.1.
> H1/M1/M2: webhook rewritten to an interactive txn, idempotent on `razorpay_payment_id`,
> invoice number allocated inside the txn, gated on `charged`+payment. M3:
> `allocateInvoiceNumber` → `INSERT … ON CONFLICT … RETURNING`. H3: random-UUID R2 key
> (`invoice_r2_key`, migration 087) + 300s presigned download URLs. M4: job throws +
> daily `backfill-gst-invoices` cron. M5: `place_of_supply` = `"27-Maharashtra"`. L1:
> shared `jobs/queue.ts`. L2: pdf meta one-line layout. Watermark: none exists.

# Code Review Report — 2026-09-01

**Scope reviewed:** `git diff` vs `origin/main` (merge-base `91144cb`) — working tree clean, HEAD == `origin/main`.
Effective target: commit **`91144cb` — feat(billing): monthly-only pricing + GST invoice engine**.
**Extra sweeps requested:** watermark-removal code, dead code, modularity/encapsulation/simplicity across the codebase.
**Review lens:** correctness, reuse, simplification, efficiency, best-practice.

---

## 1. Executive Summary

The GST invoice engine is functionally coherent but has **three classes of defect that undermine its stated goal (a gap-free, legally-conforming GST invoice sequence):**

1. **Invoice-number allocation is not transactionally tied to payment-row creation** — rollbacks and duplicate webhooks permanently burn numbers and create gaps.
2. **Wrong-tax-head risk** — intra/inter-state GST is decided from free-text `retailer.state`, so common inputs (`MH`, `Bombay`, trailing space) silently produce IGST for same-state buyers.
3. **Invoice PDFs are on a guessable public R2 key with no signed URL** — cross-retailer tax-invoice enumeration (GSTIN, legal name, address, amounts).

No watermark-removal code exists anywhere in the tree (see §5). Dead-code footprint is small and listed in §6.

**Severity roll-up**

| Severity | Count | Area |
|----------|-------|------|
| High     | 3     | invoice-number transactionality, GST tax-head resolution, public PDF URL |
| Medium   | 5     | webhook idempotency, activation burns numbers, FY-row race, silent job return, place_of_supply format |
| Low      | 2     | duplicate Redis/Queue singletons, PDF meta layout |

---

## 2. High-Severity Findings

### H1 — Invoice number allocated & committed outside the payment `$transaction`
**File:** `apps/api/src/routes/billing.ts:731`

`allocateInvoiceNumber()` runs its **own** transaction and increments `gst_invoice_sequences.last_number` **before** the main `prisma.$transaction([...])` that writes the `SubscriptionPayment` row.

**Failure scenario:** `subscription.charged` fires → `allocateInvoiceNumber()` bumps the sequence to N → the main `$transaction` then throws (DB blip, unique violation on `razorpay_payment_id`, …) and rolls back → number N has no payment row. Razorpay retries → N+1 allocated, same failure. The `KAN/26-27/NNNNNN` sequence — whose entire reason to exist is gap-free numbering — now has holes.

**Fix:** allocate the number **inside** the same transaction that creates the payment row, after the row insert succeeds. If allocation must stay separate, only bump on confirmed row creation and reconcile on failure.

---

### H2 — Intra/inter-state GST decided from free-text `retailer.state`
**File:** `apps/api/src/routes/billing.ts:777`

`resolveStateCode()` matches only full state names in `STATE_CODE_MAP` (exact or case-insensitive). `retailer.state` is unconstrained user input.

**Failure scenario:** a Maharashtra retailer who typed `MH` / `Maharashtra ` (trailing space) / a misspelling → `resolveStateCode()` returns `null` → `computeSubscriptionGst()` treats the sale as inter-state → invoice issued with **IGST instead of CGST+SGST** for a same-state buyer. Wrong tax head on a GST invoice; blocks the retailer's input-tax-credit claim.

**Fix:** constrain `retailer.state` at write time to a canonical picklist (2-digit code or exact enum), or normalise aggressively (`trim`, uppercase, alias map `MH`/`Bombay`→`Maharashtra`) and **hard-fail invoice generation** when the code can't be resolved rather than defaulting to IGST.

---

### H3 — Invoice PDFs at a predictable public R2 key, "presigned" routes just echo the public URL
**File:** `apps/api/src/jobs/generate-gst-invoice.ts:115`

`handleGenerateGstInvoice` uploads to
`R2_PATHS.gstInvoice(retailerId, invoiceNo)` = `invoices/subscription/<retailerId>/KAN/26-27/000123.pdf`
and stores `publicUrl(r2Key)` in `invoice_pdf_url`.
`GET /me/invoices/:id/pdf` and `GET /admin/invoices/:retailer_id/:id/pdf` return that raw URL — the docstring says "presigned" but **there is no signing or expiry**.

**Failure scenario:** invoice numbers are sequential and retailer IDs are exposed elsewhere in the API → retailer A fetches retailer B's tax invoice PDF (GSTIN, legal name, registered address, amounts) with no auth.

**Fix:** non-guessable object key (UUID component) **and** short-lived signed URL generated per download request; never persist a public URL for a tax document.

---

## 3. Medium-Severity Findings

### M1 — `subscriptionPayment.create` (not `upsert`) on a unique `razorpay_payment_id`
**File:** `apps/api/src/routes/billing.ts:748`

Razorpay redelivers `subscription.charged` as routine at-least-once behaviour. The duplicate hits the `@unique razorpay_payment_id` constraint → whole `$transaction` throws → 500 to Razorpay → another retry, and each retry first calls `allocateInvoiceNumber()` (H1), so the sequence keeps advancing while no row is ever written.

**Fix:** `upsert` keyed on `razorpay_payment_id`; allocate the invoice number **only** in the create branch.

---

### M2 — `allocateInvoiceNumber()` runs for `subscription.activated` events that never create a payment row
**File:** `apps/api/src/routes/billing.ts:714`

`case 'subscription.activated'` falls through into the shared block. `allocateInvoiceNumber()` is called before the `$transaction` regardless of event type, but `SubscriptionPayment.create` is gated on `event.event === 'subscription.charged' && event.payload.payment`. Every `subscription.activated` delivery (Razorpay sends it separately from `charged`) burns an invoice number with no invoice → guaranteed, non-edge-case gaps.

**Fix:** gate allocation on `charged` + `payment` present, same condition as the row insert.

---

### M3 — `SELECT … FOR UPDATE` locks nothing when the FY row doesn't exist yet
**File:** `apps/api/src/lib/gst-invoice-number.ts:35`

First invoice of a new financial year, two concurrent webhooks: both run `SELECT … WHERE financial_year = $fy FOR UPDATE` → zero rows, no lock → both `INSERT … VALUES ($fy, 1)`. One commits; the other fails with a PK violation on `gst_invoice_sequences_pkey` → its `$transaction` throws → that charge gets no invoice number. The header comment claims "concurrent webhooks can't collide."

**Fix:** single statement —
```sql
INSERT INTO gst_invoice_sequences (financial_year, last_number)
VALUES ($fy, 1)
ON CONFLICT (financial_year)
DO UPDATE SET last_number = gst_invoice_sequences.last_number + 1
RETURNING last_number;
```

---

### M4 — Job returns silently when platform GST profile or retailer row is missing
**File:** `apps/api/src/jobs/generate-gst-invoice.ts:78`

If `PlatformGstProfile` `'singleton'` isn't configured yet (or the retailer lookup misses) the job does `console.error(...)` then `return`. BullMQ marks the job **succeeded**, so the `attempts: 3` / backoff retry policy never engages and nothing re-enqueues. Any `subscription.charged` that landed before the admin filled in the GST profile permanently has `invoice_pdf_url = null` with no backfill path — a GST-compliance gap.

**Fix:** `throw` so the job retries; add a reconciliation job that sweeps `SubscriptionPayment` rows with null `invoice_pdf_url` for the pre-config window.

---

### M5 — `place_of_supply` written as the state name, not the 2-digit code
**File:** `apps/api/src/routes/billing.ts:779`

`place_of_supply: retailer?.state ?? null` stores e.g. `Maharashtra`. `schema.prisma` documents the column as `// buyer state code`, the `gst.ts` contract expects the code, and GST format requires `27-Maharashtra`. `resolveStateCode` already computed the code a few lines up — store that. Any aggregation grouping by `place_of_supply` expecting a numeric code mis-buckets; the printed invoice is non-conforming.

---

## 4. Low-Severity Findings

### L1 — Duplicate Redis connection + duplicate `Queue` object
**File:** `apps/api/src/jobs/generate-gst-invoice.ts:15`

`jobs/index.ts` already exposes `getRedis()` (single shared ioredis, `maxRetriesPerRequest: null`) and `getMaintenanceQueue()` for `QUEUES.MAINTENANCE`; every other producer (`addTaggingJob`, `addCatalogSyncJob`, …) lives there. `generate-gst-invoice.ts` instead keeps its own `invoiceRedis` + `invoiceQueue` module singletons → the API process holds a second Redis connection and a second `Queue` bound to the same queue, with divergent config and a producer that doesn't live with its siblings.

**Fix:** import `getRedis()` / `getMaintenanceQueue()`; move the producer into `jobs/index.ts`.

---

### L2 — Invoice-meta block renders every label and value on separate lines
**File:** `apps/api/src/lib/gst-invoice-pdf.ts:150`

```
doc.font('Helvetica-Bold').text('Invoice No:', left)      // advances doc.y
doc.font('Helvetica').text(input.invoiceNumber, left + 70) // writes on the NEXT line
```
Same for Date and Place of Supply. `const metaY = doc.y` is captured and never used. Result: a customer-facing legal document prints the meta section as six stacked, indented lines instead of three aligned label/value rows.

**Fix:** pass `{ continued: true }` on the label or write both with an explicit shared `y` (`metaY`).

---

## 5. Watermark Removal — Nothing to Remove

Full-tree sweep found **no watermark-removal code**. Two adjacent things surfaced:

- **`KanchukiBrandBar`** — a brand-bar component that is **already disabled** (not rendered). It is a branding element, not a watermark stripper. Leave or delete per product call; no functional impact either way.
- **Stale generated Prisma client under `apps/mobile/node_modules`** still carries `annual_paise` / `billing_period` (dropped in migration 085). This is a build artifact, not source — `prisma generate` regenerates it. Not a code defect.

If "watermark remove" meant something specific (e.g. on generated catalog / AI-studio images), it is not present in this codebase and would need a fresh spec.

---

## 6. Dead Code / Simplicity

| Item | Location | Action |
|------|----------|--------|
| `metaY` captured, never referenced | `apps/api/src/lib/gst-invoice-pdf.ts:150` | remove or use (see L2) |
| Stale Prisma client with dropped fields | `apps/mobile/node_modules/.prisma` | `prisma generate` / add to CI regen step |
| Disabled `KanchukiBrandBar` | web components | delete if product-confirmed dead |
| Duplicate Redis/Queue singletons | `apps/api/src/jobs/generate-gst-invoice.ts:15` | collapse into shared `jobs/index.ts` accessors (L1) |

No large dead modules, no orphaned route files, no unreachable branches found in the reviewed diff. The `chore/remove-unwanted-features` teardown (migration 082) already cleared the big dead-feature surface.

---

## 7. Modularity / Encapsulation / Class Design

Codebase is function-module oriented (Fastify route modules + `lib/*` helpers + `jobs/*`), not class-heavy — appropriate for the stack. Observations specific to the billing engine:

- **Good:** GST math is isolated in `computeSubscriptionGst()` / `gst.ts`; invoice numbering is isolated in `gst-invoice-number.ts`; PDF rendering in `gst-invoice-pdf.ts`. Clear single-responsibility split.
- **Leak:** the webhook handler in `billing.ts` reaches across three concerns in one block (event routing, number allocation, payment persistence) without a transaction boundary that spans them — this is the root of H1/M1/M2. Encapsulate "record a paid charge" as one function that owns the transaction and returns `{ payment, invoiceNumber }`.
- **Leak:** state-code resolution logic lives inline in `billing.ts` but is a domain rule that belongs next to `STATE_CODE_MAP` in `gst.ts`, with a single normalisation entry point reused by both the invoice path and any future retailer-onboarding validation.
- **Duplication:** infra singletons re-created in the job file (L1) instead of imported.

---

## 8. Optimization / Efficiency

- **H1/M1 retry storm:** the `create`-not-`upsert` + pre-transaction allocation combination turns every duplicate webhook into a 500 + Razorpay retry loop, each iteration doing a DB write to the sequence table. Fixing M1 (upsert) removes the storm.
- **L1:** second Redis connection per API process — small but free to eliminate.
- PDF generation is synchronous pdfkit in a BullMQ worker — fine at current volume; no change needed.
- No N+1 query patterns spotted in the reviewed diff.

---

## 9. Recommended Fix Order

1. **H1 + M1 + M2 together** — one refactor: a `recordPaidCharge()` function that runs number allocation + `upsert` in a single `$transaction`, gated on `charged` + `payment`. Removes the gap source and the retry storm.
2. **M3** — swap the FY-row select/insert for `INSERT … ON CONFLICT … RETURNING`.
3. **H3** — signed URLs + non-guessable keys for invoice PDFs.
4. **H2 + M5** — move state resolution into `gst.ts`, normalise input, hard-fail on unresolved code, store the code in `place_of_supply`.
5. **M4** — `throw` instead of silent `return`; add reconciliation sweep.
6. **L1, L2** — cleanup.

---

## 10. Test Gaps to Close Alongside Fixes

- Concurrent `subscription.charged` webhooks → exactly one payment row, contiguous invoice numbers, no gap.
- Duplicate `subscription.charged` (same `razorpay_payment_id`) → idempotent, no number burned.
- `subscription.activated` alone → no invoice number allocated.
- Same-state retailer with `state = "MH"` / `"Maharashtra "` → CGST+SGST, not IGST.
- First invoice of a new financial year under concurrency → no PK violation.
- Invoice PDF download by a non-owning retailer → 403.
- `subscription.charged` before GST profile configured → job retries, later backfills.

Per `CLAUDE.md` §8: run `npx vitest run src/routes/security.test.ts` after the H3 / auth-surface change.
