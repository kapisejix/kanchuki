// F-047 T3: POST /v1/products/sell. One request = one bill (up to 100 lines), applied line by
// line. Each (product, size) line is its own transaction: sale row, conditional decrement, status
// follow-up. A stale line fails alone with a code; it never blocks the others and never leaves a
// half-written line. Spec: docs/tasks/pending/scan-billing-sell-screen.md §5/§7.
import { prisma } from '@kanchuki/db';
import { FREE_SIZE, MAX_STOCK_QUANTITY } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { maybeEnqueueProductSync } from '../../jobs/catalog-sync.js';
import { STOCK_SIZES, applyStatusFromTotal } from '../../lib/product-stock.js';
import { claimSellBill, releaseSellBill } from '../../lib/sell-idempotency.js';
import { isDelegate } from '../../plugins/auth.js';
import { AppError, forbidden, validationError } from '../../plugins/error-handler.js';
import { revalidateCollectionsForProduct } from './products-helpers.js';

const SellSchema = z
  .object({
    client_bill_id: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/),
    lines: z
      .array(
        z.object({
          product_id: z.string().min(1).max(64),
          size: z.enum(STOCK_SIZES),
          quantity: z.number().int().min(1).max(MAX_STOCK_QUANTITY),
        }),
      )
      .min(1)
      .max(100),
  })
  .refine(
    ({ lines }) => new Set(lines.map((l) => `${l.product_id}|${l.size}`)).size === lines.length,
    'Repeated product and size: send one line with the total quantity',
  );

type Line = z.infer<typeof SellSchema>['lines'][number];

interface LineResult {
  product_id: string;
  size: string;
  ok: boolean;
  remaining_total?: number | null;
  status?: string;
  error?: string;
  replayed?: true;
}

class LineFailure extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'INVALID_SIZE' | 'INSUFFICIENT_STOCK') {
    super(code);
  }
}

const isUniqueViolation = (err: unknown) => (err as { code?: string } | null)?.code === 'P2002';

/** Current total and status per product (null total = stock not tracked). */
async function currentState(productIds: string[]) {
  const rows = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, status: true, stock: { select: { quantity: true } } },
  });
  return new Map(
    rows.map((p) => [
      p.id,
      {
        status: p.status as string,
        remaining_total: p.stock.length ? p.stock.reduce((n, s) => n + s.quantity, 0) : null,
      },
    ]),
  );
}

async function sellLine(
  retailerId: string,
  billId: string,
  staffId: string | null,
  line: Line,
): Promise<LineResult> {
  const { product_id, size, quantity } = line;
  const base = { product_id, size };
  try {
    return await prisma.$transaction(async (tx) => {
      // Ownership + soft-delete in one filter: a foreign or deleted id is just "not found" (RC-139).
      const product = await tx.product.findFirst({
        where: { id: product_id, retailer_id: retailerId, deleted_at: null },
        select: { id: true, price_min: true, status: true },
      });
      if (!product) throw new LineFailure('NOT_FOUND');

      const rows = await tx.productStock.findMany({
        where: { product_id },
        select: { size: true, quantity: true },
      });
      const tracked = rows.length > 0;
      if (tracked ? !rows.some((r) => r.size === size) : size !== FREE_SIZE) {
        throw new LineFailure('INVALID_SIZE');
      }

      // Unique (retailer_id, bill_id, product_id, size): a replayed line hits P2002 here, before
      // any decrement. unit_price is the price_min snapshot (paise), not editable in v1.
      await tx.productSale.create({
        data: {
          retailer_id: retailerId,
          bill_id: billId,
          product_id,
          size,
          quantity,
          unit_price: product.price_min,
          sold_by_staff_id: staffId,
        },
      });

      if (!tracked) {
        // Untracked product: one sale marks it sold, as the status route does.
        await tx.product.updateMany({ where: { id: product_id }, data: { status: 'SOLD' } });
        return { ...base, ok: true, remaining_total: null, status: 'SOLD' };
      }

      // The atomic guard: two counters selling the last piece, exactly one update matches.
      const { count } = await tx.productStock.updateMany({
        where: { product_id, size, quantity: { gte: quantity } },
        data: { quantity: { decrement: quantity } },
      });
      if (count === 0) throw new LineFailure('INSUFFICIENT_STOCK'); // rolls the sale row back too

      const total = await applyStatusFromTotal(tx, product_id);
      const status =
        total === 0 ? 'SOLD' : product.status === 'SOLD' ? 'AVAILABLE' : product.status;
      return { ...base, ok: true, remaining_total: total, status: status as string };
    });
  } catch (err) {
    if (err instanceof LineFailure) return { ...base, ok: false, error: err.code };
    if (isUniqueViolation(err)) {
      const state = (await currentState([product_id])).get(product_id);
      return { ...base, ok: true, replayed: true, ...state };
    }
    throw err;
  }
}

export const productsSellRoutes: FastifyPluginAsync = async (server) => {
  server.post(
    '/sell',
    { config: { rateLimit: { max: 30, timeWindow: 60_000 } } },
    async (request) => {
      // Owner, manager and salesperson sell at the counter (no owner-only gate). The delegate
      // allowlists grant the whole /v1/products prefix, so refuse delegates here (RC-142).
      if (isDelegate(request)) throw forbidden('Not allowed for this session');

      const body = SellSchema.safeParse(request.body);
      if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid bill');
      const { client_bill_id: billId, lines } = body.data;
      const retailerId = request.retailerId;

      const claim = await claimSellBill(retailerId, billId);
      if (!claim.isNew) {
        // Replay: answer from what the first request stored.
        const prior = await prisma.productSale.findMany({
          where: { retailer_id: retailerId, bill_id: billId },
        });
        if (!prior.length) {
          throw new AppError('BILL_IN_PROGRESS', 'This bill is still being processed', 409);
        }
        const state = await currentState([...new Set(prior.map((s) => s.product_id))]);
        return {
          data: {
            bill_id: billId,
            replayed: true,
            lines: prior.map((s) => ({
              product_id: s.product_id,
              size: s.size,
              ok: true,
              replayed: true,
              ...state.get(s.product_id),
            })),
          },
        };
      }

      const results: LineResult[] = [];
      try {
        for (const line of lines) {
          results.push(await sellLine(retailerId, billId, request.staffId, line));
        }
      } catch (err) {
        await releaseSellBill(retailerId, billId);
        throw err;
      }

      // Nothing sold: free the key so the retailer can fix the bill and retry it.
      if (!results.some((r) => r.ok)) await releaseSellBill(retailerId, billId);

      // Same follow-ups as the status route, per touched product, fire-and-forget.
      for (const id of new Set(
        results.filter((r) => r.ok && !r.replayed).map((r) => r.product_id),
      )) {
        void revalidateCollectionsForProduct(id);
        maybeEnqueueProductSync(retailerId, id).catch(() => {
          // Non-critical: the next manual Sync Now reconciles.
        });
      }

      return { data: { bill_id: billId, replayed: false, lines: results } };
    },
  );
};
