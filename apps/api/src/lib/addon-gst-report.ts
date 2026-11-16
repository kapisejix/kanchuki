// Add-on / try-on pack purchases are invoiced from quota_addon_purchases, not
// subscription_payments (so referral + commission readers never see them). The GST
// reports and invoice lists read both; these helpers keep that merge in one place.
//
// Date basis: subscriptions filter on created_at (unchanged); add-ons on completed_at
// (the paid date, which is when the supply happened).

export type DateRange = { gte: Date; lt: Date } | undefined;

/** COMPLETED add-on purchases, optionally one retailer / date range / invoiced-or-not. */
export function addonWhere(o: { retailerId?: string; range?: DateRange; invoiced?: boolean }) {
  return {
    status: 'COMPLETED' as const,
    ...(o.retailerId ? { retailer_id: o.retailerId } : {}),
    ...(o.range ? { completed_at: o.range } : {}),
    ...(o.invoiced === undefined ? {} : { gst_invoice_number: o.invoiced ? { not: null } : null }),
  };
}

export const GST_SUM_SELECT = {
  amount_excluding_gst: true,
  gst_amount: true,
  amount_inr: true,
  cgst_amount: true,
  sgst_amount: true,
  igst_amount: true,
} as const;

type Sum = Partial<Record<keyof typeof GST_SUM_SELECT, number | null>>;
export interface SumRow {
  _sum: Sum | null;
  _count: number;
}

/** Add two aggregate results (null-safe). */
export function mergeSums(a: SumRow, b: SumRow): SumRow {
  const out: Record<string, number> = {};
  for (const k of Object.keys(GST_SUM_SELECT)) {
    const key = k as keyof Sum;
    out[k] = (a._sum?.[key] ?? 0) + (b._sum?.[key] ?? 0);
  }
  return { _sum: out as Sum, _count: a._count + b._count };
}

/**
 * Merge two per-retailer groupBy results into one row per retailer, biggest GST first.
 * Callers fetch a generous slice from each source (not just `limit`): a retailer in the
 * combined top N can be outside either source's own top N.
 */
export function mergeByRetailer(
  subs: (SumRow & { retailer_id: string })[],
  addons: (SumRow & { retailer_id: string })[],
): (SumRow & { retailer_id: string })[] {
  const map = new Map<string, SumRow & { retailer_id: string }>();
  for (const r of [...subs, ...addons]) {
    const prev = map.get(r.retailer_id);
    const merged = prev ? mergeSums(prev, r) : { _sum: r._sum, _count: r._count };
    map.set(r.retailer_id, { retailer_id: r.retailer_id, ...merged });
  }
  return [...map.values()].sort((a, b) => (b._sum?.gst_amount ?? 0) - (a._sum?.gst_amount ?? 0));
}

/** Newest first; a missing date sorts last. */
export function byDateDesc<T>(dateOf: (x: T) => Date | null | undefined) {
  return (a: T, b: T) => (dateOf(b)?.getTime() ?? 0) - (dateOf(a)?.getTime() ?? 0);
}

interface AddonInvoiceSource {
  completed_at: Date | null;
  [k: string]: unknown;
}

/** Select for add-on rows shown in invoice lists. */
export const ADDON_INVOICE_SELECT = {
  id: true,
  retailer_id: true,
  amount_inr: true,
  amount_excluding_gst: true,
  gst_amount: true,
  gst_rate: true,
  cgst_amount: true,
  sgst_amount: true,
  igst_amount: true,
  gst_invoice_number: true,
  invoice_generated_at: true,
  completed_at: true,
  place_of_supply: true,
} as const;

/** An add-on purchase in the same shape as a subscription invoice row, tagged `kind`. */
export function addonInvoiceRow<T extends AddonInvoiceSource>(p: T) {
  const { completed_at, ...rest } = p;
  return { ...rest, paid_at: completed_at, status: 'success', kind: 'addon' as const };
}
