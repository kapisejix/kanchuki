// F-021 admin ratings moderation: merged pagination, stats, flag/unflag/hide/unhide + audit + denormalised rating.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';

type Row = {
  id: string;
  rating: number;
  created_at: Date;
  is_flagged: boolean;
  is_hidden: boolean;
  product_id?: string;
  retailer_id: string;
};

const mocks = vi.hoisted(() => ({
  product: [] as unknown[],
  store: [] as unknown[],
  auditCreate: vi.fn(),
  productUpdate: vi.fn(),
  retailerUpdate: vi.fn(),
  prUpdate: vi.fn(),
  srUpdate: vi.fn(),
  prAggregate: vi.fn(),
  srAggregate: vi.fn(),
  prCount: vi.fn(),
  srCount: vi.fn(),
  wheres: {} as Record<string, unknown>,
  prFindUnique: vi.fn(),
  srFindUnique: vi.fn(),
  prGroupBy: vi.fn(),
  srGroupBy: vi.fn(),
  retailerFindMany: vi.fn(),
  purgePrDelete: vi.fn(),
  purgeSrDelete: vi.fn(),
  purgeRaw: vi.fn(),
}));

// Faithful findMany: honours orderBy desc, skip and take like Prisma does.
const fakeFindMany =
  (key: 'product' | 'store') =>
  async ({ skip = 0, take, where }: { skip?: number; take: number; where?: unknown }) => {
    mocks.wheres[key] = where;
    return (mocks[key] as Row[])
      .slice()
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
      .slice(skip, skip + take);
  };

vi.mock('@kanchuki/db', () => ({
  prisma: {
    productReview: {
      findMany: fakeFindMany('product'),
      findUnique: mocks.prFindUnique,
      groupBy: mocks.prGroupBy,
      count: mocks.prCount,
      update: mocks.prUpdate,
      aggregate: mocks.prAggregate,
    },
    storeReview: {
      findMany: fakeFindMany('store'),
      findUnique: mocks.srFindUnique,
      groupBy: mocks.srGroupBy,
      count: mocks.srCount,
      update: mocks.srUpdate,
      aggregate: mocks.srAggregate,
    },
    product: { update: mocks.productUpdate },
    retailer: { update: mocks.retailerUpdate, findMany: mocks.retailerFindMany },
    auditLog: { create: mocks.auditCreate },
  },
  getPurgePrisma: () => ({
    $executeRawUnsafe: mocks.purgeRaw,
    $transaction: async (ops: unknown[]) => Promise.all(ops),
    productReview: { delete: mocks.purgePrDelete },
    storeReview: { delete: mocks.purgeSrDelete },
  }),
}));
// Role comes from the x-role header so tests can exercise the Super Admin gate.
vi.mock('../admin-auth.js', async () => {
  const { forbidden } = await import('../../plugins/error-handler.js');
  return {
    adminAuthPreHandler: async (req: { adminRole?: string; headers: Record<string, unknown> }) => {
      req.adminRole = (req.headers['x-role'] as string | undefined) ?? 'SUPER_ADMIN';
    },
    requireSuperAdmin: (req: { adminRole?: string }) => {
      if (req.adminRole !== 'SUPER_ADMIN') throw forbidden('Super Admin only');
    },
  };
});

const { adminRatingsRoutes } = await import('./admin-ratings.js');

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(adminRatingsRoutes);
  await app.ready();
  return app;
}

const mkRow = (id: string, minutesAgo: number): Row => ({
  id,
  rating: 4,
  created_at: new Date(Date.UTC(2026, 10, 1, 12, 0, 0) - minutesAgo * 60_000),
  is_flagged: false,
  is_hidden: false,
  product_id: 'p1',
  retailer_id: 'r1',
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.product = [];
  mocks.store = [];
  mocks.prCount.mockImplementation(async () => mocks.product.length);
  mocks.srCount.mockImplementation(async () => mocks.store.length);
  mocks.auditCreate.mockResolvedValue({});
  mocks.productUpdate.mockResolvedValue({});
  mocks.retailerUpdate.mockResolvedValue({});
  mocks.prAggregate.mockResolvedValue({ _avg: { rating: 4.5 }, _count: { rating: 2 } });
  mocks.srAggregate.mockResolvedValue({ _avg: { rating: 3 }, _count: { rating: 1 } });
});

describe('GET /reviews — merged pagination (type=all)', () => {
  it('pages through 30 product + 30 store reviews with no gaps and no overlaps', async () => {
    // interleave timestamps: product = even minutes, store = odd minutes
    mocks.product = Array.from({ length: 30 }, (_, i) => mkRow(`p${i}`, i * 2));
    mocks.store = Array.from({ length: 30 }, (_, i) => mkRow(`s${i}`, i * 2 + 1));
    const app = await buildApp();

    const seen: string[] = [];
    for (const page of [1, 2, 3]) {
      const res = await app.inject({ method: 'GET', url: `/reviews?page=${page}&limit=20` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.pagination).toMatchObject({ total: 60, pages: 3 });
      seen.push(...body.data.map((r: { id: string }) => r.id));
    }
    expect(seen).toHaveLength(60);
    expect(new Set(seen).size).toBe(60);
    // global newest-first order preserved across pages
    const expected = [...mocks.product, ...mocks.store]
      .sort((a, b) => (b as Row).created_at.getTime() - (a as Row).created_at.getTime())
      .map((r) => (r as Row).id);
    expect(seen).toEqual(expected);
  });

  it('type=store only returns store rows, tagged _type', async () => {
    mocks.product = [mkRow('p0', 0)];
    mocks.store = [mkRow('s0', 1)];
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/reviews?type=store' });
    const body = res.json();
    expect(body.data.map((r: { id: string }) => r.id)).toEqual(['s0']);
    expect(body.data[0]._type).toBe('store');
    expect(body.counts).toEqual({ product: 0, store: 1 });
  });

  it('empty DB returns empty page, not an error', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/reviews' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
    expect(res.json().pagination.total).toBe(0);
  });
});

describe('GET /reviews/stats', () => {
  it('sums product + store and computes averages over non-hidden rows only', async () => {
    mocks.prCount.mockResolvedValue(5);
    mocks.srCount.mockResolvedValue(3);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/reviews/stats' });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.product_reviews).toBe(5);
    expect(d.store_reviews).toBe(3);
    expect(d.total_reviews).toBe(8);
    expect(d.avg_product_rating).toBe(4.5);
    expect(d.avg_store_rating).toBe(3);
    expect(mocks.prAggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { is_hidden: false } }),
    );
    expect(mocks.srAggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { is_hidden: false } }),
    );
  });

  it('no reviews → averages are 0, not null', async () => {
    mocks.prCount.mockResolvedValue(0);
    mocks.srCount.mockResolvedValue(0);
    mocks.prAggregate.mockResolvedValue({ _avg: { rating: null } });
    mocks.srAggregate.mockResolvedValue({ _avg: { rating: null } });
    const app = await buildApp();
    const d = (await app.inject({ method: 'GET', url: '/reviews/stats' })).json().data;
    expect(d.avg_product_rating).toBe(0);
    expect(d.avg_store_rating).toBe(0);
    expect(d.total_reviews).toBe(0);
  });
});

describe('moderation actions', () => {
  it('flag product review → sets is_flagged + audit row', async () => {
    mocks.prUpdate.mockResolvedValue({ id: 'x', rating: 2, product_id: 'p1' });
    const app = await buildApp();
    const res = await app.inject({ method: 'PATCH', url: '/reviews/product/x/flag' });
    expect(res.statusCode).toBe(200);
    expect(mocks.prUpdate).toHaveBeenCalledWith({ where: { id: 'x' }, data: { is_flagged: true } });
    expect(mocks.auditCreate.mock.calls[0]![0].data).toMatchObject({
      action: 'review_flagged',
      resource_type: 'ProductReview',
      resource_id: 'x',
    });
  });

  it('unflag store review → clears flag only (not hidden) + audit row', async () => {
    mocks.srUpdate.mockResolvedValue({ id: 'y', rating: 1, retailer_id: 'r1' });
    const app = await buildApp();
    const res = await app.inject({ method: 'PATCH', url: '/reviews/store/y/unflag' });
    expect(res.statusCode).toBe(200);
    expect(mocks.srUpdate).toHaveBeenCalledWith({ where: { id: 'y' }, data: { is_flagged: false } });
    expect(mocks.auditCreate.mock.calls[0]![0].data).toMatchObject({
      action: 'review_unflagged',
      resource_type: 'StoreReview',
    });
  });

  it('hide product review → recomputes product avg/count excluding hidden + audit', async () => {
    mocks.prUpdate.mockResolvedValue({ id: 'x', rating: 1, product_id: 'p1' });
    const app = await buildApp();
    const res = await app.inject({ method: 'PATCH', url: '/reviews/product/x/hide' });
    expect(res.statusCode).toBe(200);
    expect(mocks.prAggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { product_id: 'p1', is_hidden: false } }),
    );
    expect(mocks.productUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { avg_rating: 4.5, rating_count: 2 },
    });
    expect(mocks.auditCreate.mock.calls[0]![0].data.action).toBe('review_hidden');
  });

  it('hide store review → recomputes retailer avg/count', async () => {
    mocks.srUpdate.mockResolvedValue({ id: 'y', rating: 1, retailer_id: 'r1' });
    const app = await buildApp();
    await app.inject({ method: 'PATCH', url: '/reviews/store/y/hide' });
    expect(mocks.retailerUpdate).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { avg_rating: 3, rating_count: 1 },
    });
  });

  it('hide last review → avg falls back to 0', async () => {
    mocks.prUpdate.mockResolvedValue({ id: 'x', rating: 1, product_id: 'p1' });
    mocks.prAggregate.mockResolvedValue({ _avg: { rating: null }, _count: { rating: 0 } });
    const app = await buildApp();
    await app.inject({ method: 'PATCH', url: '/reviews/product/x/hide' });
    expect(mocks.productUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { avg_rating: 0, rating_count: 0 },
    });
  });

  it('unhide clears hidden + flagged, recomputes rating, writes audit', async () => {
    mocks.prUpdate.mockResolvedValue({ id: 'x', rating: 5, product_id: 'p1' });
    const app = await buildApp();
    const res = await app.inject({ method: 'PATCH', url: '/reviews/product/x/unhide' });
    expect(res.statusCode).toBe(200);
    expect(mocks.prUpdate).toHaveBeenCalledWith({
      where: { id: 'x' },
      data: { is_hidden: false, is_flagged: false },
    });
    expect(mocks.productUpdate).toHaveBeenCalled();
    expect(mocks.auditCreate.mock.calls[0]![0].data.action).toBe('review_unhidden');
  });

  it.each(['flag', 'unflag', 'hide', 'unhide'])(
    '%s on a missing review → 404, no audit',
    async (action) => {
      const missing = Object.assign(new Error('nf'), { code: 'P2025' });
      mocks.prUpdate.mockRejectedValue(missing);
      mocks.srUpdate.mockRejectedValue(missing);
      const app = await buildApp();
      for (const type of ['product', 'store']) {
        const res = await app.inject({ method: 'PATCH', url: `/reviews/${type}/nope/${action}` });
        expect(res.statusCode).toBe(404);
      }
      expect(mocks.auditCreate).not.toHaveBeenCalled();
    },
  );

  it('retailer_id + flagged + rating filters reach the query for both sources', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/reviews?retailer_id=r1&flagged=true&hidden=false&min_rating=2&max_rating=4',
    });
    expect(res.statusCode).toBe(200);
    const want = {
      retailer_id: 'r1',
      is_flagged: true,
      is_hidden: false,
      rating: { gte: 2, lte: 4 },
    };
    expect(mocks.wheres['product']).toEqual(want);
    expect(mocks.wheres['store']).toEqual(want);
  });

  it('GET /reviews/retailers → unique shops that have reviews, sorted by name', async () => {
    mocks.prGroupBy.mockResolvedValue([{ retailer_id: 'r1' }, { retailer_id: 'r2' }]);
    mocks.srGroupBy.mockResolvedValue([{ retailer_id: 'r2' }, { retailer_id: 'r3' }]);
    mocks.retailerFindMany.mockResolvedValue([{ id: 'r1', shop_name: 'A' }]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/reviews/retailers' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([{ id: 'r1', shop_name: 'A' }]);
    expect(mocks.retailerFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['r1', 'r2', 'r3'] } },
      select: { id: true, shop_name: true },
      orderBy: { shop_name: 'asc' },
    });
  });

  describe('DELETE /reviews/:type/:id (permanent, Super Admin)', () => {
    it('product: deletes via purge role with allow_hard_delete, recomputes avg, audits, 204', async () => {
      mocks.prFindUnique.mockResolvedValue({ id: 'x', rating: 1, product_id: 'p1' });
      mocks.purgePrDelete.mockResolvedValue({});
      const app = await buildApp();
      const res = await app.inject({ method: 'DELETE', url: '/reviews/product/x' });
      expect(res.statusCode).toBe(204);
      expect(mocks.purgeRaw).toHaveBeenCalledWith(expect.stringContaining('allow_hard_delete'));
      expect(mocks.purgePrDelete).toHaveBeenCalledWith({ where: { id: 'x' } });
      expect(mocks.productUpdate).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { avg_rating: 4.5, rating_count: 2 },
      });
      expect(mocks.auditCreate.mock.calls[0]![0].data).toMatchObject({
        action: 'review_deleted',
        resource_type: 'ProductReview',
        resource_id: 'x',
      });
    });

    it('store: deletes via purge role, recomputes retailer avg, audits, 204', async () => {
      mocks.srFindUnique.mockResolvedValue({ id: 'y', rating: 2, retailer_id: 'r1' });
      mocks.purgeSrDelete.mockResolvedValue({});
      const app = await buildApp();
      const res = await app.inject({ method: 'DELETE', url: '/reviews/store/y' });
      expect(res.statusCode).toBe(204);
      expect(mocks.purgeSrDelete).toHaveBeenCalledWith({ where: { id: 'y' } });
      expect(mocks.retailerUpdate).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { avg_rating: 3, rating_count: 1 },
      });
      expect(mocks.auditCreate.mock.calls[0]![0].data.action).toBe('review_deleted');
    });

    it('non-Super-Admin → 403, nothing deleted, no audit', async () => {
      const app = await buildApp();
      for (const role of ['ADMIN', 'SUPPORT_MANAGER']) {
        const res = await app.inject({
          method: 'DELETE',
          url: '/reviews/product/x',
          headers: { 'x-role': role },
        });
        expect(res.statusCode).toBe(403);
      }
      expect(mocks.purgePrDelete).not.toHaveBeenCalled();
      expect(mocks.auditCreate).not.toHaveBeenCalled();
    });

    it('missing review → 404, nothing deleted', async () => {
      mocks.prFindUnique.mockResolvedValue(null);
      mocks.srFindUnique.mockResolvedValue(null);
      const app = await buildApp();
      for (const type of ['product', 'store']) {
        expect((await app.inject({ method: 'DELETE', url: `/reviews/${type}/nope` })).statusCode).toBe(404);
      }
      expect(mocks.purgePrDelete).not.toHaveBeenCalled();
      expect(mocks.purgeSrDelete).not.toHaveBeenCalled();
      expect(mocks.auditCreate).not.toHaveBeenCalled();
    });
  });

  it('rejects an unknown review type', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'PATCH', url: '/reviews/bogus/x/unflag' });
    expect(res.statusCode).toBe(422); // errorHandler maps schema validation to 422
    expect(mocks.srUpdate).not.toHaveBeenCalled();
    expect(mocks.prUpdate).not.toHaveBeenCalled();
  });
});
