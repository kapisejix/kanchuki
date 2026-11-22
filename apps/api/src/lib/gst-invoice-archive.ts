// GST invoices must outlive the account they belong to (7 years, DATABASE.md Data
// Retention Policy). The source rows are hard-deleted with the retailer and hold no
// buyer details of their own, so every delete path copies them here first, in the
// same transaction. Migration 169 makes the table append-only.

import type { DateRange, SumRow } from './addon-gst-report.js';

export type InvoiceSource = 'subscription_payments' | 'quota_addon_purchases';

const PAID_AT: Record<InvoiceSource, string> = {
  subscription_payments: 'paid_at',
  quota_addon_purchases: 'completed_at',
};

/**
 * INSERT that archives every numbered invoice of the retailers matched by
 * `retailerFilter` (SQL after `retailer_id`, e.g. `= $1`).
 *
 * No ON CONFLICT on purpose: a clash must abort the delete, never lose an invoice.
 * invoice_r2_key is NOT NULL, so an invoice with no PDF aborts it too.
 */
export function archiveInvoicesSql(source: InvoiceSource, retailerFilter: string): string {
  return `INSERT INTO gst_invoice_archive (
      source_table, source_id, source_status, invoice_number, invoice_date,
      amount_inr, amount_excluding_gst, gst_amount, gst_rate,
      cgst_amount, sgst_amount, igst_amount, place_of_supply, sac_code,
      buyer_name, buyer_gstin, buyer_address,
      invoice_r2_key, razorpay_payment_id, razorpay_order_id
    )
    SELECT
      '${source}', s.id, s.status::text, s.gst_invoice_number, COALESCE(s.${PAID_AT[source]}, s.created_at),
      s.amount_inr, s.amount_excluding_gst, s.gst_amount, s.gst_rate,
      s.cgst_amount, s.sgst_amount, s.igst_amount, s.place_of_supply, s.sac_code,
      r.shop_name, r.gstin,
      NULLIF(concat_ws(', ', r.address_line1, r.address_line2, r.city, r.state, r.pincode), ''),
      s.invoice_r2_key, s.razorpay_payment_id, s.razorpay_order_id
    FROM ${source} s
    JOIN retailers r ON r.id = s.retailer_id
    WHERE s.gst_invoice_number IS NOT NULL AND s.retailer_id ${retailerFilter};`;
}

// ── Report helpers ────────────────────────────────────────────────
// A row is either live or archived (moved in one transaction), so adding the two
// never double counts. Archived rows carry no retailer id and always have a number.

export const includeArchive = (o: { retailerId?: string; invoiced?: boolean }) =>
  !o.retailerId && o.invoiced !== false;

/** Paid invoices only: a refunded one must not count as a sale. */
export function archiveWhere(o: { range?: DateRange }) {
  return {
    source_status: { in: ['success', 'COMPLETED'] },
    ...(o.range ? { invoice_date: o.range } : {}),
  };
}

export const EMPTY_ARCHIVE_SUM: SumRow = { _sum: null, _count: 0 };

export const archiveKind = (sourceTable: string) =>
  sourceTable === 'subscription_payments' ? ('subscription' as const) : ('addon' as const);
