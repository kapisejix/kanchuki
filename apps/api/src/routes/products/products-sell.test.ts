// F-047 T3: POST /v1/products/sell, one request = one bill. The prisma mock is a small in-memory
// model with real transaction rollback, so the conditional decrement, the unique-key replay guard
// and "no half-written line" are exercised for real (not asserted against mock call shapes only).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Product = {
  id: string;
  retailer_id: string;
  deleted_at: Date | null;
  price_min: number | null;
  status: string;
};
type Sale = {
  retailer_id: string;
  bill_id: string;
  product_id: string;
  size: string;
  quantity: number;
  unit_price: number | null;
  sold_by_staff_id: string | null;
};

const db = vi.hoisted(() => ({
  products: [] as Product[],
  stock: [] as { product_id: string; size: string; quantity: number }[],
  sales: [] as Sale[],
  stockWhereLog: [] as unknown[],
}));
const m = vi.hoisted(() => ({
  claim: vi.fn(),
  release: vi.fn(),
  revalidate: vi.fn(),
  syncProduct: vi.fn(),
}));

function makeTx() {
  return {
    product: {
      findFirst: async ({
        where,
      }: { where: { id: string; retailer_id: string; deleted_at: null } }) =>
        db.products.find(
          (p) => p.id === where.id && p.retailer_id === where.retailer_id && p.deleted_at === null,
        ) ?? null,
      updateMany: async ({
        where,
        data,
      }: { where: { id: string; status?: unknown }; data: { status: string } }) => {
        const p = db.products.find((x) => x.id === where.id);
        if (!p) return { count: 0 };
        const w = where.status as undefined | string | { not: string };
        if (typeof w === 'string' && p.status !== w) return { count: 0 };
        if (w && typeof w === 'object' && p.status === w.not) return { count: 0 };
        p.status = data.status;
        return { count: 1 };
      },
    },
    productStock: {
      findMany: async ({ where }: { where: { product_id: string } }) =>
        db.stock.filter((s) => s.product_id === where.product_id).map((s) => ({ ...s })),
      updateMany: async ({
        where,
        data,
      }: {
        where: { product_id: string; size: string; quantity: { gte: number } };
        data: { quantity: { decrement: number } };
      }) => {
        db.stockWhereLog.push(where);
        const row = db.stock.find(
          (s) => s.product_id === where.product_id && s.size === where.size,
        );
        if (!row || row.quantity < where.quantity.gte) return { count: 0 };
        row.quantity -= data.quantity.decrement;
        return { count: 1 };
      },
    },
    productSale: {
      create: async ({ data }: { data: Sale }) => {
        const dup = db.sales.some(
          (s) =>
            s.retailer_id === data.retailer_id &&
            s.bill_id === data.bill_id &&
            s.product_id === data.product_id &&
            s.size === data.size,
        );
        if (dup) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        db.sales.push({ ...data });
        return data;
      },
    },
  };
}

vi.mock('@kanchuki/db', () => ({
  prisma: {
    $transaction: async (fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => {
      const snap = JSON.stringify({ p: db.products, s: db.stock, l: db.sales });
      try {
        return await fn(makeTx());
      } catch (err) {
        const r = JSON.parse(snap);
        db.products.splice(0, db.products.length, ...r.p);
        db.stock.splice(0, db.stock.length, ...r.s);
        db.sales.splice(0, db.sales.length, ...r.l);
        throw err;
      }
    },
    productSale: {
      findMany: async ({ where }: { where: { retailer_id: string; bill_id: string } }) =>
        db.sales.filter((s) => s.retailer_id === where.retailer_id && s.bill_id === where.bill_id),
    },
    product: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        db.products
          .filter((p) => where.id.in.includes(p.id))
          .map((p) => ({
            id: p.id,
            status: p.status,
            stock: db.stock
              .filter((s) => s.product_id === p.id)
              .map((s) => ({ quantity: s.quantity })),
          })),
    },
  },
}));
vi.mock('../../lib/sell-idempotency.js', () => ({
  claimSellBill: m.claim,
  releaseSellBill: m.release,
}));
vi.mock('../../jobs/catalog-sync.js', () => ({ maybeEnqueueProductSync: m.syncProduct }));
vi.mock('./products-helpers.js', () => ({ revalidateCollectionsForProduct: m.revalidate }));

import { staffCanAccess } from '../../plugins/auth.js';
import { errorHandler } from '../../plugins/error-handler.js';
import { productsSellRoutes } from './products-sell.js';

const R = 'retailer_A';
const BILL = 'bill-0001';

type Who = {
  staffRole?: string | null;
  staffId?: string | null;
  catalogDelegate?: object | null;
  supportDelegate?: object | null;
};

async function sell(body: object, who: Who = {}) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.decorateRequest('staffRole', null);
  app.decorateRequest('staffId', null);
  app.decorateRequest('catalogDelegate', null);
  app.decorateRequest('supportDelegate', null);
  app.addHook('preHandler', async (request) => {
    request.retailerId = R;
    Object.assign(request, who);
  });
  await app.register(productsSellRoutes, { prefix: '/v1/products' });
  await app.ready();
  const res = await app.inject({ method: 'POST', url: '/v1/products/sell', payload: body });
  await app.close();
  return res;
}

const line = (product_id: string, size = 'FREE', quantity = 1) => ({
  product_id,
  size,
  quantity,
});

beforeEach(() => {
  vi.resetAllMocks();
  db.products.splice(
    0,
    db.products.length,
    { id: 'tracked', retailer_id: R, deleted_at: null, price_min: 150_000, status: 'AVAILABLE' },
    { id: 'sized', retailer_id: R, deleted_at: null, price_min: 90_000, status: 'AVAILABLE' },
    { id: 'plain', retailer_id: R, deleted_at: null, price_min: null, status: 'RESERVED' },
    { id: 'gone', retailer_id: R, deleted_at: new Date(), price_min: 1, status: 'AVAILABLE' },
    {
      id: 'foreign',
      retailer_id: 'retailer_B',
      deleted_at: null,
      price_min: 1,
      status: 'AVAILABLE',
    },
  );
  db.stock.splice(
    0,
    db.stock.length,
    { product_id: 'tracked', size: 'FREE', quantity: 1 },
    { product_id: 'sized', size: 'M', quantity: 1 },
    { product_id: 'sized', size: 'L', quantity: 3 },
  );
  db.sales.splice(0, db.sales.length);
  db.stockWhereLog.splice(0, db.stockWhereLog.length);
  m.claim.mockResolvedValue({ isNew: true, degradedReason: null });
  m.release.mockResolvedValue(undefined);
  m.revalidate.mockResolvedValue(undefined);
  m.syncProduct.mockResolvedValue(undefined);
});

describe('POST /products/sell', () => {
  it('decrements a tracked product, flips it to SOLD at zero, snapshots unit_price and the seller', async () => {
    const res = await sell(
      { client_bill_id: BILL, lines: [line('tracked')] },
      { staffId: 'staff_1', staffRole: 'salesperson' },
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().data.lines[0]).toMatchObject({
      product_id: 'tracked',
      ok: true,
      remaining_total: 0,
      status: 'SOLD',
    });
    expect(db.stock[0]?.quantity).toBe(0);
    expect(db.products[0]?.status).toBe('SOLD');
    expect(db.sales).toEqual([
      {
        retailer_id: R,
        bill_id: BILL,
        product_id: 'tracked',
        size: 'FREE',
        quantity: 1,
        unit_price: 150_000,
        sold_by_staff_id: 'staff_1',
      },
    ]);
  });

  it('records the owner as sold_by_staff_id null', async () => {
    await sell({ client_bill_id: BILL, lines: [line('tracked')] });
    expect(db.sales[0]?.sold_by_staff_id).toBeNull();
  });

  it('keeps a multi-size product AVAILABLE while another size has stock', async () => {
    const res = await sell({ client_bill_id: BILL, lines: [line('sized', 'M')] });
    expect(res.json().data.lines[0]).toMatchObject({
      ok: true,
      remaining_total: 3,
      status: 'AVAILABLE',
    });
    expect(db.stock.find((s) => s.size === 'M')?.quantity).toBe(0);
  });

  it('marks an untracked product SOLD (RESERVED is sellable) and stores a null unit_price', async () => {
    const res = await sell({ client_bill_id: BILL, lines: [line('plain')] });
    expect(res.json().data.lines[0]).toMatchObject({ ok: true, status: 'SOLD' });
    expect(db.products.find((p) => p.id === 'plain')?.status).toBe('SOLD');
    expect(db.sales[0]?.unit_price).toBeNull();
  });

  it('refuses an untracked product sold with a size other than FREE', async () => {
    const res = await sell({ client_bill_id: BILL, lines: [line('plain', 'M')] });
    expect(res.json().data.lines[0]).toMatchObject({ ok: false, error: 'INVALID_SIZE' });
    expect(db.sales).toHaveLength(0);
  });

  it('refuses a size the tracked product has no row for', async () => {
    const res = await sell({ client_bill_id: BILL, lines: [line('sized', 'XL')] });
    expect(res.json().data.lines[0]).toMatchObject({ ok: false, error: 'INVALID_SIZE' });
  });

  it.each(['foreign', 'gone', 'nope'])('treats %s as NOT_FOUND and writes nothing', async (id) => {
    const res = await sell({ client_bill_id: BILL, lines: [line(id)] });
    expect(res.json().data.lines[0]).toMatchObject({ ok: false, error: 'NOT_FOUND' });
    expect(db.sales).toHaveLength(0);
    expect(db.stock.map((s) => s.quantity)).toEqual([1, 1, 3]);
  });

  it('the last unit sells once: a second bill gets INSUFFICIENT_STOCK and the guard is quantity >= n', async () => {
    const a = await sell({ client_bill_id: 'bill-a', lines: [line('tracked')] });
    const b = await sell({ client_bill_id: 'bill-b', lines: [line('tracked')] });
    expect(a.json().data.lines[0].ok).toBe(true);
    expect(b.json().data.lines[0]).toMatchObject({ ok: false, error: 'INSUFFICIENT_STOCK' });
    expect(db.stock[0]?.quantity).toBe(0);
    expect(db.sales).toHaveLength(1); // the failed line's sale row was rolled back
    expect(db.stockWhereLog[0]).toMatchObject({ quantity: { gte: 1 } });
  });

  it('one stale line does not block the others', async () => {
    const res = await sell({
      client_bill_id: BILL,
      lines: [line('sized', 'M', 5), line('sized', 'L', 2), line('plain')],
    });
    const [m5, l2, plain] = res.json().data.lines;
    expect(m5).toMatchObject({ ok: false, error: 'INSUFFICIENT_STOCK' });
    expect(l2).toMatchObject({ ok: true });
    expect(plain).toMatchObject({ ok: true });
    expect(db.stock.map((s) => s.quantity)).toEqual([1, 1, 1]);
  });

  it('a replay with Redis up returns the stored result and decrements nothing', async () => {
    await sell({ client_bill_id: BILL, lines: [line('sized', 'L', 2)] });
    m.claim.mockResolvedValue({ isNew: false, degradedReason: null });
    const res = await sell({ client_bill_id: BILL, lines: [line('sized', 'L', 2)] });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ replayed: true });
    expect(res.json().data.lines[0]).toMatchObject({ product_id: 'sized', size: 'L', ok: true });
    expect(db.stock.find((s) => s.size === 'L')?.quantity).toBe(1);
  });

  it('Redis says duplicate but nothing is stored yet: 409 BILL_IN_PROGRESS, no sale', async () => {
    m.claim.mockResolvedValue({ isNew: false, degradedReason: null });
    const res = await sell({ client_bill_id: BILL, lines: [line('tracked')] });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('BILL_IN_PROGRESS');
    expect(db.stock[0]?.quantity).toBe(1);
  });

  it('with Redis down the Postgres unique key still blocks a second sale of the same bill', async () => {
    m.claim.mockResolvedValue({ isNew: true, degradedReason: 'redis-unavailable' });
    await sell({ client_bill_id: BILL, lines: [line('sized', 'L', 2)] });
    const again = await sell({ client_bill_id: BILL, lines: [line('sized', 'L', 2)] });
    expect(again.json().data.lines[0]).toMatchObject({ ok: true, replayed: true });
    expect(db.stock.find((s) => s.size === 'L')?.quantity).toBe(1);
    expect(db.sales).toHaveLength(1);
  });

  it('releases the Redis key when no line succeeded, keeps it when something sold', async () => {
    await sell({ client_bill_id: BILL, lines: [line('foreign')] });
    expect(m.release).toHaveBeenCalledWith(R, BILL);
    m.release.mockClear();
    await sell({ client_bill_id: 'bill-ok', lines: [line('plain')] });
    expect(m.release).not.toHaveBeenCalled();
  });

  it('releases the Redis key when the transaction layer throws, and surfaces the error', async () => {
    const boom = vi.spyOn(db.products, 'find').mockImplementation(() => {
      throw new Error('db down');
    });
    const res = await sell({ client_bill_id: BILL, lines: [line('tracked')] });
    boom.mockRestore();
    expect(res.statusCode).toBe(500);
    expect(m.release).toHaveBeenCalledWith(R, BILL);
  });

  it('allows a manager and a salesperson', async () => {
    const mgr = await sell(
      { client_bill_id: 'b1', lines: [line('plain')] },
      { staffRole: 'manager', staffId: 's1' },
    );
    const sp = await sell(
      { client_bill_id: 'b2', lines: [line('tracked')] },
      { staffRole: 'salesperson', staffId: 's2' },
    );
    expect([mgr.statusCode, sp.statusCode]).toEqual([200, 200]);
  });

  it.each([
    { catalogDelegate: { team_member_id: 't', ticket_id: 'k' } },
    { supportDelegate: { id: 'x' } },
  ])('refuses a delegate session with 403 before any work: %j', async (who) => {
    const res = await sell({ client_bill_id: BILL, lines: [line('tracked')] }, who);
    expect(res.statusCode).toBe(403);
    expect(m.claim).not.toHaveBeenCalled();
    expect(db.sales).toHaveLength(0);
  });

  it('accepts 100 lines and rejects 101, an empty bill and a repeated product+size', async () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => line(`p${i}`));
    expect((await sell({ client_bill_id: BILL, lines: many(100) })).statusCode).toBe(200);
    expect((await sell({ client_bill_id: BILL, lines: many(101) })).statusCode).toBe(422);
    expect((await sell({ client_bill_id: BILL, lines: [] })).statusCode).toBe(422);
    expect(
      (await sell({ client_bill_id: BILL, lines: [line('tracked'), line('tracked')] })).statusCode,
    ).toBe(422);
  });

  it('rejects a size outside the shared list and a non-positive quantity', async () => {
    expect((await sell({ client_bill_id: BILL, lines: [line('tracked', 'XXS')] })).statusCode).toBe(
      422,
    );
    expect(
      (await sell({ client_bill_id: BILL, lines: [line('tracked', 'FREE', 0)] })).statusCode,
    ).toBe(422);
  });
});

describe('who may reach the sell route', () => {
  it('salesperson and manager pass the staff allowlist; the rest of /products stays closed to salespeople', () => {
    expect(staffCanAccess('POST', '/v1/products/sell', 'salesperson')).toBe(true);
    expect(staffCanAccess('POST', '/v1/products/sell', 'manager')).toBe(true);
    expect(staffCanAccess('POST', '/v1/products', 'salesperson')).toBe(false);
    expect(staffCanAccess('DELETE', '/v1/products/sell', 'salesperson')).toBe(false);
  });
});

describe('source pins', () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'products-sell.ts'),
    'utf8',
  );
  const code = src.replace(/\/\/.*$/gm, '');

  it('uses the one status rule (applyStatusFromTotal) and does not inline it', () => {
    expect(code).toMatch(/applyStatusFromTotal\(tx,/);
    expect(code).not.toMatch(/status:\s*\{\s*not:\s*'SOLD'/);
    expect(code).not.toMatch(/status:\s*soldOut/);
  });

  it('has no owner-only gate and uses the shared delegate check', () => {
    expect(code).not.toMatch(/isRealOwner|staffRole\s*[!=]==?\s*null/);
    expect(code).toMatch(/isDelegate\(request\)/);
  });

  it('takes sizes from the shared constants, not a hand copy', () => {
    expect(code).toMatch(/STOCK_SIZES/);
    expect(code).not.toMatch(/'XXXL'/);
  });

  it('keeps the guards the race and replay tests depend on', () => {
    expect(code).toMatch(/gte:/);
    expect(code).toMatch(/P2002/);
  });
});
