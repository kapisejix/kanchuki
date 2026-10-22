// F-044 / E1 — POST /v1/public/collections/:slug/enquire stores EVERY product
// the customer sent (not just the first), only ever products of THIS store, and
// names them (not ids) in the WhatsApp text.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';
import { publicCollectionsRoutes } from '../public-collections.js';

const {
  mockCollectionFindFirst,
  mockCollectionUpdate,
  mockProductFindMany,
  mockEnquiryCreate,
  mockPush,
  mockRetailerFindFirst,
} = vi.hoisted(() => ({
  mockCollectionFindFirst: vi.fn(),
  mockCollectionUpdate: vi.fn(),
  mockProductFindMany: vi.fn(),
  mockEnquiryCreate: vi.fn(),
  mockPush: vi.fn(),
  mockRetailerFindFirst: vi.fn(),
}));

vi.mock('../../../jobs/enquiry-push.js', () => ({ addEnquiryPushJob: mockPush }));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    collection: { findFirst: mockCollectionFindFirst, update: mockCollectionUpdate },
    product: { findMany: mockProductFindMany },
    collectionEnquiry: { create: mockEnquiryCreate },
    retailer: { findFirst: mockRetailerFindFirst },
  },
  Prisma: {},
  withRetry: async (fn: () => Promise<unknown>) => fn(),
}));

vi.mock('../../../lib/public-cache.js', () => ({
  withPublicCache: async (_key: string, fn: () => Promise<unknown>) => fn(),
}));

const RETAILER_ID = 'ret_1';

/** Stands in for the DB: returns only the ids that belong to this store. */
function storeProducts(...ids: string[]) {
  mockProductFindMany.mockImplementation(
    async ({ where }: { where: { id: { in: string[] }; retailer_id: string } }) =>
      where.retailer_id === RETAILER_ID
        ? where.id.in
            .filter((id) => ids.includes(id))
            .map((id) => ({ id, name: `Name of ${id}`, price_min: 150000 }))
        : [],
  );
}

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(publicCollectionsRoutes, { prefix: '/v1/public' });
  await app.ready();
  return app;
}

function enquire(app: Awaited<ReturnType<typeof buildApp>>, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/v1/public/collections/abc/enquire', payload });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCollectionFindFirst.mockResolvedValue({
    id: 'col_1',
    retailer_id: RETAILER_ID,
    title: 'Festive',
    retailer: { shop_name: 'Shop', phone: '9876543210' },
  });
  mockCollectionUpdate.mockResolvedValue({});
  mockEnquiryCreate.mockResolvedValue({ id: 'enq_1' });
  mockPush.mockResolvedValue(undefined);
});

describe('POST /v1/public/collections/:slug/enquire — team push (F-046)', () => {
  it('enqueues one push with the enquiry id and item count only', async () => {
    storeProducts('a', 'b');
    const res = await enquire(await buildApp(), { product_ids: ['a', 'b'] });
    expect(res.statusCode).toBe(200);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      retailer_id: RETAILER_ID,
      enquiry_id: 'enq_1',
      item_count: 2,
    });
  });

  it('a failed enqueue never fails the saved enquiry', async () => {
    storeProducts('a');
    mockPush.mockRejectedValue(new Error('redis down'));
    const res = await enquire(await buildApp(), { product_ids: ['a'] });
    expect(res.statusCode).toBe(200);
    expect(mockEnquiryCreate).toHaveBeenCalledTimes(1);
  });

  it('a rejected request (foreign product) enqueues nothing', async () => {
    storeProducts('a');
    const res = await enquire(await buildApp(), { product_ids: ['zzz'] });
    expect(res.statusCode).toBe(422);
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('POST /v1/public/collections/:slug/enquire — basket (E1)', () => {
  it('saves all 4 ids, product_id = first', async () => {
    storeProducts('a', 'b', 'c', 'd');
    const app = await buildApp();
    const res = await enquire(app, { product_ids: ['a', 'b', 'c', 'd'] });

    expect(res.statusCode).toBe(200);
    expect(mockEnquiryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ product_id: 'a', product_ids: ['a', 'b', 'c', 'd'] }),
    });
    await app.close();
  });

  it('a product of another store (or deleted) → 422 and nothing is written', async () => {
    storeProducts('a');
    const app = await buildApp();
    const res = await enquire(app, { product_ids: ['a', 'foreign'] });

    expect(res.statusCode).toBe(422);
    expect(mockEnquiryCreate).not.toHaveBeenCalled();
    expect(mockCollectionUpdate).not.toHaveBeenCalled();
    // The lookup is scoped to the collection's own retailer.
    expect(mockProductFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ retailer_id: RETAILER_ID, deleted_at: null }),
      }),
    );
    await app.close();
  });

  it('the WhatsApp text names the products, not their ids', async () => {
    storeProducts('a', 'b');
    const app = await buildApp();
    const res = await enquire(app, { product_ids: ['a', 'b'] });

    const text = decodeURIComponent(res.json().data.whatsapp_url.split('?text=')[1]);
    expect(text).toContain('Name of a');
    expect(text).toContain('Name of b');
    expect(text).not.toMatch(/• a\b/);
    await app.close();
  });

  it('each line carries the SKU after the price and the product link under it', async () => {
    mockProductFindMany.mockResolvedValue([
      { id: 'a', name: 'Kurti', price_min: 80000, sku: 'KUR-1' },
    ]);
    mockCollectionFindFirst.mockResolvedValue({
      id: 'col_1',
      retailer_id: RETAILER_ID,
      title: 'Festive',
      retailer: { shop_name: 'Shop', phone: '9876543210', public_slug: 'shop-x1' },
    });
    const app = await buildApp();
    const res = await enquire(app, { product_ids: ['a'] });

    const text = decodeURIComponent(res.json().data.whatsapp_url.split('?text=')[1]);
    expect(text).toMatch(/• Kurti - ₹800\/- \(SKU: KUR-1\)\n {2}\S*\/shop-x1\/abc\/product\/a\n/);
    await app.close();
  });

  it('20 products ok; 21 (product_id + 20 others) → 422', async () => {
    const twenty = Array.from({ length: 20 }, (_, i) => `p${i}`);
    storeProducts('extra', ...twenty);
    const app = await buildApp();

    expect((await enquire(app, { product_ids: twenty })).statusCode).toBe(200);
    const res = await enquire(app, { product_id: 'extra', product_ids: twenty });
    expect(res.statusCode).toBe(422);
    expect(mockEnquiryCreate).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('an old client sending only product_id still works', async () => {
    storeProducts('a');
    const app = await buildApp();
    const res = await enquire(app, { product_id: 'a' });

    expect(res.statusCode).toBe(200);
    expect(mockEnquiryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ product_id: 'a', product_ids: ['a'] }),
    });
    await app.close();
  });

  it('dedupes [a, a, b] → [a, b], product_id first', async () => {
    storeProducts('a', 'b');
    const app = await buildApp();
    const res = await enquire(app, { product_id: 'b', product_ids: ['a', 'a', 'b'] });

    expect(res.statusCode).toBe(200);
    expect(mockEnquiryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ product_id: 'b', product_ids: ['b', 'a'] }),
    });
    await app.close();
  });

  it('no products at all still records the enquiry (general question)', async () => {
    const app = await buildApp();
    const res = await enquire(app, { message: 'Do you have more?' });

    expect(res.statusCode).toBe(200);
    expect(mockProductFindMany).not.toHaveBeenCalled();
    expect(mockEnquiryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ product_id: null, product_ids: [] }),
    });
    await app.close();
  });
});

// Category / full-catalog pages post a pseudo-slug (`cat-{id}`, `all-{store}`) that has no
// collection row; the store proxy adds `store` so the enquiry still lands in the inbox.
describe('POST /v1/public/collections/:slug/enquire — pseudo-slug pages', () => {
  const post = (app: Awaited<ReturnType<typeof buildApp>>, slug: string, payload: object) =>
    app.inject({ method: 'POST', url: `/v1/public/collections/${slug}/enquire`, payload });

  beforeEach(() => {
    storeProducts('a');
    mockRetailerFindFirst.mockResolvedValue({
      id: RETAILER_ID,
      shop_name: 'Shop',
      phone: '9876543210',
      public_slug: 'meera',
    });
    // No collection matches the pseudo-slug; the store's oldest live one is col_old.
    mockCollectionFindFirst.mockImplementation(async ({ where }: { where: { slug?: string } }) =>
      where.slug ? null : { id: 'col_old' },
    );
  });

  it('records against the store oldest collection and names the SKU', async () => {
    mockProductFindMany.mockResolvedValue([
      { id: 'a', name: 'Kurti', price_min: 150000, sku: 'KUR-1' },
    ]);
    const res = await post(await buildApp(), 'cat-xyz', { product_ids: ['a'], store: 'meera' });
    expect(res.statusCode).toBe(200);
    expect(mockRetailerFindFirst.mock.calls[0]![0].where.public_slug).toBe('meera');
    expect(mockEnquiryCreate.mock.calls[0]![0].data).toMatchObject({
      collection_id: 'col_old',
      retailer_id: RETAILER_ID,
      product_ids: ['a'],
    });
    expect(decodeURIComponent(res.json().data.whatsapp_url)).toContain('SKU: KUR-1');
  });

  it('still returns the link, with no inbox row, when the store has no collection', async () => {
    mockCollectionFindFirst.mockResolvedValue(null);
    const res = await post(await buildApp(), 'all-meera', { product_ids: ['a'], store: 'meera' });
    expect(res.statusCode).toBe(200);
    expect(mockEnquiryCreate).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('404s a pseudo-slug without a store, and never resolves a store for a real slug', async () => {
    const app = await buildApp();
    expect((await post(app, 'cat-xyz', { product_ids: ['a'] })).statusCode).toBe(404);
    expect((await post(app, 'festive', { product_ids: ['a'], store: 'meera' })).statusCode).toBe(
      404,
    );
    expect(mockRetailerFindFirst).not.toHaveBeenCalled();
  });
});
