// ─── GST Invoice Number Allocator ──────────────────────────────────
// Gap-free per-financial-year counter using a Prisma interactive txn
// (SELECT ... FOR UPDATE) so concurrent webhooks can't collide.
// Format: KAN/YY-YY/NNNNNN (e.g. KAN/26-27/000123)

import { prisma } from '@kanchuki/db';

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
 * Uses a Prisma interactive transaction with SELECT ... FOR UPDATE to
 * prevent two concurrent webhooks from getting the same number.
 *
 * @param prefix - Invoice prefix, e.g. "KAN"
 * @param now - Current date (injectable for testing)
 * @returns Formatted invoice number, e.g. "KAN/26-27/000123"
 */
export async function allocateInvoiceNumber(
  prefix: string = 'KAN',
  now: Date = new Date(),
): Promise<string> {
  const fy = getFinancialYear(now);

  const result = await prisma.$transaction(async (tx) => {
    // Lock the row for this FY — concurrent transactions wait
    const row = await tx.$queryRaw<{ financial_year: string; last_number: number }[]>`
      SELECT financial_year, last_number
      FROM gst_invoice_sequences
      WHERE financial_year = ${fy}
      FOR UPDATE
    `;

    let nextNumber: number;

    if (row.length === 0) {
      // First invoice this FY — create the row and start at 1
      await tx.$executeRaw`
        INSERT INTO gst_invoice_sequences (financial_year, last_number)
        VALUES (${fy}, 1)
      `;
      nextNumber = 1;
    } else {
      // Increment the counter
      nextNumber = row[0]!.last_number + 1;
      await tx.$executeRaw`
        UPDATE gst_invoice_sequences
        SET last_number = ${nextNumber}, updated_at = now()
        WHERE financial_year = ${fy}
      `;
    }

    return nextNumber;
  });

  // Format: prefix/FY/zero-padded to 6 digits
  return `${prefix}/${fy}/${String(result).padStart(6, '0')}`;
}
