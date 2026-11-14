// F-047 T4: POST /v1/products/sell/:billId/undo. Same in-memory prisma model as the sell test
// (real transaction rollback), so the claim-by-updateMany, stock restore and status follow-up are
// exercised for real, not asserted against mock call shapes only.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Product = { id: string; retailer_id: string; status: string };
type Sale = {
  id: string;
  retailer_id: string;
  bill_id: string;
  product_id: string;
  size: string;
  quantity: number;
  undone_at: Date | null;
  undone_by_staff_id?: string | null;
  created_at: Date;
};

const db = vi.hoisted(() => ({
  products: [] as Product[],
  stock: [] as { product_id: string; size: string; quantity: number }[],
  sales: [] as Sale[],
  // Lines another request already claimed between our read and our claim.
  stealClaimFor: new Set<string>(),
}));
const m = vi.hoisted(() => ({ revalidate: vi.fn(), syncProduct: vi.fn() }));

function makeTx() {
  return {
    productSale: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; undone_at: null };
        data: { undone_at: Date; undone_by_staff_id?: string | null };
      }) => {
        if (db.stealClaimFor.has(where.id)) return { count: 0 };
        const s = db.sales.find((x) => x.id === where.id);
        if (!s || s.undone_at !== null) return { count: 0 };
        s.undone_at = data.undone_at;
        s.undone_by_staff_id = data.undone_by_staff_id;
        return { count: 1 };
      },
    },
    productStock: {
      findMany: async ({ where }: { where: { product_id: string } }) =>
        db.stock.filter((s) => s.product_id === where.product_id).map((s) => ({ ...s })),
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { product_id_size: { product_id: string; size: string } };
        create: { product_id: string; size: string; quantity: number };
        update: { quantity: { increment: number } };
      }) => {
        const { product_id, size } = where.product_id_size;
        const row = db.stock.find((s) => s.product_id === product_id && s.size === size);
        if (row) row.quantity += update.quantity.increment;
        else db.stock.push({ ...create });
      },
    },
    product: {
      findFirst: async ({ where }: { where: { id: string } }) => {
        const p = db.products.find((x) => x.id === where.id);
        return p ? { status: p.status } : null;
      },
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
        db.sales.splice(
          0,
          db.sales.length,
          ...r.l.map((s: Sale) => ({
            ...s,
            undone_at: s.undone_at ? new Date(s.undone_at) : null,
            created_at: new Date(s.created_at),
          })),
        );
        throw err;
      }
    },
    productSale: {
      findMany: async ({ where }: { where: { retailer_id: string; bill_id: string } }) =>
        db.sales.filter((s) => s.retailer_id === where.retailer_id && s.bill_id === where.bill_id),
    },
  },
}));
vi.mock('../../jobs/catalog-sync.js', () => ({ maybeEnqueueProductSync: m.syncProduct }));
vi.mock('../../lib/sell-idempotency.js', () => ({
  claimSellBill: vi.fn(),
  releaseSellBill: vi.fn(),
}));
vi.mock('./products-helpers.js', () => ({ revalidateCollectionsForProduct: m.revalidate }));

import { staffCanAccess } from '../../plugins/auth.js';
import { errorHandler } from '../../plugins/error-handler.js';
import { productsSellRoutes } from './products-sell.js';

const R = 'retailer_A';
const BILL = 'bill-0001';
const MIN = 60_000;

type Who = {
  staffRole?: string | null;
  staffId?: string | null;
  catalogDelegate?: object | null;
  supportDelegate?: object | null;
};

async function undo(billId = BILL, who: Who = {}, retailerId = R) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.decorateRequest('staffRole', null);
  app.decorateRequest('staffId', null);
  app.decorateRequest('catalogDelegate', null);
  app.decorateRequest('supportDelegate', null);
  app.addHook('preHandler', async (request) => {
    request.retailerId = retailerId;
    Object.assign(request, who);
  });
  await app.register(productsSellRoutes, { prefix: '/v1/products' });
  await app.ready();
  const res = await app.inject({ method: 'POST', url: `/v1/products/sell/${billId}/undo` });
  await app.close();
  return res;
}

let n = 0;
function addSale(over: Partial<Sale> & Pick<Sale, 'product_id' | 'size'>): Sale {
  const s: Sale = {
    id: `sale_${++n}`,
    retailer_id: R,
    bill_id: BILL,
    quantity: 1,
    undone_at: null,
    created_at: new Date(Date.now() - 2 * MIN),
    ...over,
  };
  db.sales.push(s);
  return s;
}

beforeEach(() => {
  vi.resetAllMocks();
  n = 0;
  db.products.splice(
    0,
    db.products.length,
    { id: 'tracked', retailer_id: R, status: 'SOLD' }, // sold its last piece
    { id: 'sized', retailer_id: R, status: 'AVAILABLE' },
    { id: 'plain', retailer_id: R, status: 'SOLD' }, // untracked, marked SOLD by the sale
  );
  db.stock.splice(
    0,
    db.stock.length,
    { product_id: 'tracked', size: 'FREE', quantity: 0 },
    { product_id: 'sized', size: 'M', quantity: 0 },
    { product_id: 'sized', size: 'L', quantity: 1 },
  );
  db.sales.splice(0, db.sales.length);
  db.stealClaimFor.clear();
  m.revalidate.mockResolvedValue(undefined);
  m.syncProduct.mockResolvedValue(undefined);
});

describe('POST /products/sell/:billId/undo', () => {
  it('restores per-size stock from the sale rows and puts a SOLD product back to AVAILABLE', async () => {
    addSale({ product_id: 'tracked', size: 'FREE' });
    addSale({ product_id: 'sized', size: 'M', quantity: 2 });

    const res = await undo();
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.undone).toBe(true);
    expect(body.lines).toEqual(
      expect.arrayContaining([
        {
          product_id: 'tracked',
          size: 'FREE',
          restored_quantity: 1,
          remaining_total: 1,
          status: 'AVAILABLE',
        },
        {
          product_id: 'sized',
          size: 'M',
          restored_quantity: 2,
          remaining_total: 3,
          status: 'AVAILABLE',
        },
      ]),
    );
    expect(db.stock.find((s) => s.product_id === 'tracked')?.quantity).toBe(1);
    expect(db.stock.find((s) => s.product_id === 'sized' && s.size === 'M')?.quantity).toBe(2);
    expect(db.stock.find((s) => s.product_id === 'sized' && s.size === 'L')?.quantity).toBe(1);
    expect(db.products.find((p) => p.id === 'tracked')?.status).toBe('AVAILABLE');
    expect(db.sales.every((s) => s.undone_at instanceof Date)).toBe(true);
  });

  it('an untracked product comes back to AVAILABLE, but only if it is still SOLD', async () => {
    addSale({ product_id: 'plain', size: 'FREE' });
    const res = await undo();
    expect(res.statusCode).toBe(200);
    expect(res.json().data.lines[0]).toMatchObject({
      product_id: 'plain',
      remaining_total: null,
      status: 'AVAILABLE',
    });
    expect(db.products.find((p) => p.id === 'plain')?.status).toBe('AVAILABLE');

    // The retailer set it to RESERVED by hand after the sale: undo must not stomp that.
    db.sales.splice(0, db.sales.length);
    addSale({ bill_id: 'bill-0002', product_id: 'plain', size: 'FREE' });
    db.products.find((p) => p.id === 'plain')!.status = 'RESERVED';
    const again = await undo('bill-0002');
    expect(again.statusCode).toBe(200);
    expect(db.products.find((p) => p.id === 'plain')?.status).toBe('RESERVED');
  });

  it('a second undo is a no-op, even after the 10 minutes', async () => {
    addSale({ product_id: 'tracked', size: 'FREE', created_at: new Date(Date.now() - 30 * MIN) });
    db.sales[0]!.undone_at = new Date();
    const res = await undo();
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ bill_id: BILL, undone: false, lines: [] });
    expect(db.stock.find((s) => s.product_id === 'tracked')?.quantity).toBe(0);
  });

  it('records which staff member undid the bill on every row it claimed', async () => {
    addSale({ product_id: 'tracked', size: 'FREE' });
    addSale({ product_id: 'sized', size: 'M' });
    const res = await undo(BILL, { staffRole: 'salesperson', staffId: 'staff_9' });
    expect(res.statusCode).toBe(200);
    expect(db.sales.map((s) => s.undone_by_staff_id)).toEqual(['staff_9', 'staff_9']);
  });

  it('records null when the owner undid it (NULL = owner, like sold_by_staff_id)', async () => {
    addSale({ product_id: 'tracked', size: 'FREE' });
    const res = await undo();
    expect(res.statusCode).toBe(200);
    expect(db.sales[0]!.undone_by_staff_id).toBeNull();
  });

  it('a second undo by someone else does not overwrite the first actor', async () => {
    addSale({ product_id: 'tracked', size: 'FREE' });
    await undo(BILL, { staffRole: 'manager', staffId: 'first' });
    await undo(BILL, { staffRole: 'salesperson', staffId: 'second' });
    expect(db.sales[0]!.undone_by_staff_id).toBe('first');
  });

  it('two undos in a row restore the stock once', async () => {
    addSale({ product_id: 'tracked', size: 'FREE' });
    await undo();
    await undo();
    expect(db.stock.find((s) => s.product_id === 'tracked')?.quantity).toBe(1);
  });

  it('a line claimed by a concurrent undo is skipped: stock is not restored twice', async () => {
    const s = addSale({ product_id: 'tracked', size: 'FREE' });
    db.stealClaimFor.add(s.id);
    const res = await undo();
    expect(res.statusCode).toBe(200);
    expect(res.json().data.lines).toEqual([]);
    expect(db.stock.find((x) => x.product_id === 'tracked')?.quantity).toBe(0);
  });

  it('refuses after 10 minutes with UNDO_WINDOW_EXPIRED and changes nothing', async () => {
    addSale({ product_id: 'tracked', size: 'FREE', created_at: new Date(Date.now() - 11 * MIN) });
    const res = await undo();
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('UNDO_WINDOW_EXPIRED');
    expect(db.stock.find((s) => s.product_id === 'tracked')?.quantity).toBe(0);
    expect(db.sales[0]?.undone_at).toBeNull();
  });

  it("another retailer's bill and an unknown bill are not found", async () => {
    addSale({ product_id: 'tracked', size: 'FREE' });
    expect((await undo(BILL, {}, 'retailer_B')).statusCode).toBe(404);
    expect((await undo('no-such-bill')).statusCode).toBe(404);
    expect(db.stock.find((s) => s.product_id === 'tracked')?.quantity).toBe(0);
  });

  it('refuses catalog-upload and support delegates', async () => {
    addSale({ product_id: 'tracked', size: 'FREE' });
    expect((await undo(BILL, { catalogDelegate: {} })).statusCode).toBe(403);
    expect((await undo(BILL, { supportDelegate: {} })).statusCode).toBe(403);
    expect(db.stock.find((s) => s.product_id === 'tracked')?.quantity).toBe(0);
  });

  it('allows a manager and a salesperson, whoever sold the bill', async () => {
    addSale({ product_id: 'tracked', size: 'FREE' });
    expect((await undo(BILL, { staffRole: 'manager', staffId: 's1' })).statusCode).toBe(200);
    db.sales[0]!.undone_at = null;
    db.stock.find((s) => s.product_id === 'tracked')!.quantity = 0;
    expect((await undo(BILL, { staffRole: 'salesperson', staffId: 's2' })).statusCode).toBe(200);
  });

  it('puts stock back on a size row that no longer exists instead of dropping it', async () => {
    addSale({ product_id: 'sized', size: 'XL', quantity: 2 });
    const res = await undo();
    expect(res.statusCode).toBe(200);
    expect(db.stock.find((s) => s.product_id === 'sized' && s.size === 'XL')?.quantity).toBe(2);
  });
});

describe('who may reach the undo route', () => {
  it('salesperson and manager pass the staff allowlist; nothing else widens', () => {
    const path = '/v1/products/sell/:billId/undo';
    expect(staffCanAccess('POST', path, 'salesperson')).toBe(true);
    expect(staffCanAccess('POST', path, 'manager')).toBe(true);
    expect(staffCanAccess('DELETE', path, 'salesperson')).toBe(false);
    expect(staffCanAccess('POST', '/v1/products/:id/undo', 'salesperson')).toBe(false);
  });
});

describe('source pins', () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'products-sell.ts'),
    'utf8',
  );
  const undoSrc = src.slice(src.indexOf('async function undoLine'), src.indexOf('export const'));
  const routeSrc = src.slice(src.indexOf('/sell/:billId/undo'));

  it('undo uses the one status rule and does not inline it', () => {
    expect(undoSrc).toContain('applyStatusFromTotal(tx');
    expect(undoSrc).not.toMatch(/total\s*===\s*0/);
    expect(undoSrc).not.toMatch(/status:\s*total/);
  });

  it('claims each line by undone_at null and restores in the same transaction', () => {
    expect(undoSrc).toMatch(/undone_at:\s*null/);
    expect(undoSrc).toContain('$transaction');
    expect(undoSrc).toContain('increment');
  });

  it('keeps the delegate gate and the retailer filter, and never deletes a sale row', () => {
    expect(src).toContain('/sell/:billId/undo');
    expect(routeSrc).toContain('isDelegate(request)');
    expect(routeSrc).toContain('retailer_id: retailerId');
    expect(src).not.toMatch(/productSale\.delete/);
  });
});
