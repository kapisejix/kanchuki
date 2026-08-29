/**
 * Query-time product flags shared across routes.
 *
 * Extracted 2026-08-04 (F-024) — the third copy of the 30-day
 * new-arrival check was about to be added to public.ts alongside the
 * existing copies in products.ts and search.ts (rule-of-three trigger).
 * "Sale" is the same shape: derived from stored price fields, never
 * AI-tagged (a photo can't reveal stock age or discount status).
 */

export const NEW_ARRIVAL_DAYS = 21;

export function isNewArrival(createdAt: Date | string): boolean {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - NEW_ARRIVAL_DAYS);
  return new Date(createdAt) >= cutoff;
}

/** "On sale" = has an MRP and sells below it. Both in paise. */
export function isOnSale(p: { mrp: number | null; price_min: number | null }): boolean {
  return p.mrp !== null && p.price_min !== null && p.mrp > p.price_min;
}
