import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';

// H2-1: campaign `product_ids` and A/B `ab_variants[].product_ids` come from the client.
// syncVariantCollections links them into a HIDDEN collection under the caller's store, so
// another store's products would show up on the caller's public collection page.
// The fake product table answers like Postgres would: it honours `retailer_id` and
// `deleted_at` only if the query asks for them.
const m = vi.hoisted(() => {
  const products: Record<string, { retailer_id: string; deleted_at: Date | null }> = {
    'p-own': { retailer_id: 'r1', deleted_at: null },
    'p-own2': { retailer_id: 'r1', deleted_at: null },
    'p-gone': { retailer_id: 'r1', deleted_at: new Date(0) },
    'p-foreign': { retailer_id: 'r2', deleted_at: null },
  };
  return {
    products,
    productFindMany: vi.fn(
      async (args: {
        where: { id: { in: string[] }; retailer_id?: string; deleted_at?: null };
      }) =>
        args.where.id.in
          .filter((id) => {
            const p = products[id];
            if (!p) return false;
            if (args.where.retailer_id !== undefined && p.retailer_id !== args.where.retailer_id)
              return false;
            if (args.where.deleted_at === null && p.deleted_at !== null) return false;
            return true;
          })
          .map((id) => ({ id })),
    ),
    campaignCreate: vi.fn(),
    campaignUpdate: vi.fn(),
    campaignFind: vi.fn(),
    collectionCreate: vi.fn(),
    collectionFindUnique: vi.fn(),
    collectionUpdate: vi.fn(),
    cpDeleteMany: vi.fn(),
    cpCreateMany: vi.fn(),
    hasFeature: vi.fn(),
  };
});

vi.mock('@kanchuki/db', () => ({
  Prisma: { JsonNull: 'JsonNull' },
  getPurgePrisma: vi.fn(),
  prisma: {
    product: { findMany: m.productFindMany },
    campaign: { create: m.campaignCreate, update: m.campaignUpdate, findFirst: m.campaignFind },
    collection: {
      create: m.collectionCreate,
      findUnique: m.collectionFindUnique,
      update: m.collectionUpdate,
    },
    collectionProduct: { deleteMany: m.cpDeleteMany, createMany: m.cpCreateMany },
  },
}));
vi.mock('../../../lib/features.js', () => ({ hasFeature: m.hasFeature }));

const { growthCampaignCrudRoutes } = await import('./growth-campaigns-crud.js');

async function build() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('onRequest', async (req) => {
    (req as unknown as Record<string, unknown>).retailerId = 'r1';
  });
  await app.register(growthCampaignCrudRoutes, { prefix: '/v1/growth' });
  return app;
}

const campaignRow = {
  id: 'camp1',
  type: 'AB_TEST',
  status: 'DRAFT',
  name: 'Diwali',
  festival_name: null,
  sent_count: 0,
  opened_count: 0,
  schedule_at: null,
  sent_at: null,
  message_template: 'Hi',
  product_ids: [] as string[],
  ab_variants: null,
  variant_a_collection_id: null,
  variant_b_collection_id: null,
};

const variants = (a: string[], b: string[]) => [
  { label: 'A', message_template: 'a', send_pct: 50, product_ids: a },
  { label: 'B', message_template: 'b', send_pct: 50, product_ids: b },
];
const createBody = (extra: Record<string, unknown>) => ({
  type: 'AB_TEST',
  name: 'Diwali',
  message_template: 'Hi',
  audience: { all: true },
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.hasFeature.mockResolvedValue(true);
  m.campaignCreate.mockResolvedValue(campaignRow);
  m.campaignUpdate.mockResolvedValue(campaignRow);
  m.campaignFind.mockResolvedValue(campaignRow);
  m.collectionCreate.mockResolvedValue({ id: 'col1' });
});

/** True if any HIDDEN collection or collection_products write carried this product id. */
function wroteProduct(id: string): boolean {
  const created = m.collectionCreate.mock.calls.some((c) =>
    JSON.stringify(c[0].data.products).includes(id),
  );
  const synced = m.cpCreateMany.mock.calls.some((c) => JSON.stringify(c[0].data).includes(id));
  return created || synced;
}

describe('POST /v1/growth/campaigns: product ownership (H2-1)', () => {
  it('links the caller’s own products into the variant collections', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/growth/campaigns',
      payload: createBody({ ab_variants: variants(['p-own'], ['p-own2']) }),
    });
    expect(res.statusCode).toBe(201);
    expect(wroteProduct('p-own')).toBe(true);
    expect(wroteProduct('p-own2')).toBe(true);
  });

  it('refuses another store’s product in an A/B variant and writes nothing', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/growth/campaigns',
      payload: createBody({ ab_variants: variants(['p-foreign'], ['p-own']) }),
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect(m.campaignCreate).not.toHaveBeenCalled();
    expect(wroteProduct('p-foreign')).toBe(false);
  });

  it('refuses another store’s product in the campaign product_ids', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/growth/campaigns',
      payload: createBody({ type: 'PROMOTION', product_ids: ['p-own', 'p-foreign'] }),
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect(m.campaignCreate).not.toHaveBeenCalled();
  });

  it('refuses a soft-deleted product of the caller’s own store', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/growth/campaigns',
      payload: createBody({ ab_variants: variants(['p-gone'], ['p-own']) }),
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(wroteProduct('p-gone')).toBe(false);
  });
});

describe('PUT /v1/growth/campaigns/:id: product ownership (H2-1)', () => {
  it('refuses another store’s product in an A/B variant before any write', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/growth/campaigns/camp1',
      payload: { ab_variants: variants(['p-foreign'], ['p-own']) },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect(m.campaignUpdate).not.toHaveBeenCalled();
    expect(wroteProduct('p-foreign')).toBe(false);
  });

  it('refuses another store’s product in the campaign product_ids', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/growth/campaigns/camp1',
      payload: { product_ids: ['p-foreign'] },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(m.campaignUpdate).not.toHaveBeenCalled();
  });

  it('accepts the caller’s own products on update', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/growth/campaigns/camp1',
      payload: { ab_variants: variants(['p-own'], ['p-own2']) },
    });
    expect(res.statusCode).toBe(200);
    expect(wroteProduct('p-own')).toBe(true);
  });
});
