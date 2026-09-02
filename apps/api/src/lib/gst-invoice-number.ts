// ─── GST Invoice Number Allocator ──────────────────────────────────
// Gap-free per-financial-year counter. Single atomic
// `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` — safe under concurrent
// webhooks (the conflicting row is locked for the UPDATE; no separate
// SELECT ... FOR UPDATE that would miss a not-yet-existing FY row and let
// two callers both INSERT).
// Accepts an optional transaction client so the caller can allocate the
// number in the SAME transaction that writes the payment row — a
// rolled-back payment then also rolls back the number (no burned gap).
// Format: KAN/YY-YY/NNNNNN (e.g. KAN/26-27/000123)

import { type Prisma, prisma } from '@kanchuki/db';

/** Minimum surface we need — real client or an interactive-txn client. */
type Db = Pick<typeof prisma, '$queryRaw'> | Prisma.TransactionClient;

/**
 * Get the Indian financial year string for a given date.
 * FY runs April 1 → March 31. E.g. Sep 2026 → "26-27", Mar 2027 → "26-27".
 */
export function getFinancialYear(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed (0=Jan, 3=Apr)
  // FY starts in April: Apr–Dec = current year, Jan–Mar = previous year
  const fyStart = month >= 3 ? year : year - 1;
  const fyEnd = fyStart + 1;
  // Short format: last 2 digits
  return `${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`;
}

/**
 * Allocate the next gap-free invoice number for the current financial year.
 *
 * @param prefix - Invoice prefix, e.g. "KAN"
 * @param now - Current date (injectable for testing)
 * @param db - Optional Prisma transaction client. Pass the outer `tx` so the
 *             allocation commits/rolls back together with the payment row.
 * @returns Formatted invoice number, e.g. "KAN/26-27/000123"
 */
export async function allocateInvoiceNumber(
  prefix = 'KAN',
  now: Date = new Date(),
  db: Db = prisma,
): Promise<string> {
  const fy = getFinancialYear(now);

  // Atomic upsert-and-increment. First insert → last_number = 1; every
  // subsequent hit takes the ON CONFLICT branch, which locks the existing
  // row and bumps it. No lost updates, no PK-violation race on the first
  // invoice of a new FY.
  const rows = await db.$queryRaw<{ last_number: number }[]>`
    INSERT INTO gst_invoice_sequences (financial_year, last_number, updated_at)
    VALUES (${fy}, 1, now())
    ON CONFLICT (financial_year)
    DO UPDATE SET last_number = gst_invoice_sequences.last_number + 1, updated_at = now()
    RETURNING last_number
  `;

  const nextNumber = rows[0]?.last_number ?? 1;
  return `${prefix}/${fy}/${String(nextNumber).padStart(6, '0')}`;
}
