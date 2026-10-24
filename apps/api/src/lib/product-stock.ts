// Per-size product stock (docs/tasks/pending/product-stock-quantity.md).
// A product with no product_stock rows is "not tracked" and behaves as before.
// Rows are never deleted (RC-049): dropping a size writes quantity 0.
import { prisma } from '@kanchuki/db';
import { SIZE_OPTIONS } from '@kanchuki/shared';
import { z } from 'zod';

export const FREE_SIZE = 'FREE';
export const STOCK_SIZES = [...SIZE_OPTIONS, FREE_SIZE] as const;
export const MAX_STOCK_QUANTITY = 99_999;

export const StockInputSchema = z
  .array(
    z.object({
      size: z.enum(STOCK_SIZES),
      quantity: z.number().int().min(0).max(MAX_STOCK_QUANTITY),
    }),
  )
  .max(STOCK_SIZES.length)
  .refine((rows) => new Set(rows.map((r) => r.size)).size === rows.length, 'Duplicate size');

export type StockInput = z.infer<typeof StockInputSchema>;

/** New products start with 1 unit per selected size (FREE when unsized); the retailer edits later. */
export function defaultStock(sizes: readonly string[] | undefined): StockInput {
  const list = (sizes ?? []).filter((s): s is (typeof SIZE_OPTIONS)[number] =>
    (SIZE_OPTIONS as readonly string[]).includes(s),
  );
  return (list.length ? list : [FREE_SIZE]).map((size) => ({ size, quantity: 1 })) as StockInput;
}

type StockRow = { size: string; quantity: number };

/** null = not tracked (no rows). */
export function totalQuantity(stock: readonly StockRow[] | undefined): number | null {
  return stock?.length ? stock.reduce((n, r) => n + r.quantity, 0) : null;
}

/**
 * Replace-semantics write: sizes in `rows` are upserted, tracked sizes missing from
 * `rows` go to 0. Then products.status follows the total (0 -> SOLD, >0 on SOLD ->
 * AVAILABLE). Returns the new total.
 */
export async function writeStock(
  productId: string,
  retailerId: string,
  rows: StockInput,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const sizes = rows.map((r) => r.size);
    await tx.productStock.updateMany({
      where: { product_id: productId, size: { notIn: sizes } },
      data: { quantity: 0 },
    });
    for (const { size, quantity } of rows) {
      await tx.productStock.upsert({
        where: { product_id_size: { product_id: productId, size } },
        create: { product_id: productId, retailer_id: retailerId, size, quantity },
        update: { quantity },
      });
    }
    const all = await tx.productStock.findMany({
      where: { product_id: productId },
      select: { quantity: true },
    });
    const total = all.reduce((n, r) => n + r.quantity, 0);
    await tx.product.updateMany({
      where:
        total === 0
          ? { id: productId, status: { not: 'SOLD' } }
          : { id: productId, status: 'SOLD' },
      data: { status: total === 0 ? 'SOLD' : 'AVAILABLE' },
    });
    return total;
  });
}

/** "Mark sold": zero every tracked size. No-op for untracked products. */
export async function zeroStock(productId: string): Promise<void> {
  await prisma.productStock.updateMany({ where: { product_id: productId }, data: { quantity: 0 } });
}
