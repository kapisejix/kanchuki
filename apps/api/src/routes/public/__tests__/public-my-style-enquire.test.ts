// F-045 PR-5a — POST /v1/public/my-style/enquire: one cross-store shortlist group (one store's
// picks) becomes ONE F-044 inbox row. Signed-in only; only products of that store; never a
// fabricated success when there is no collection to attach the row to.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';
import { publicMyStyleRoutes } from '../public-my-style.js';

const {
  mockSession,
  mockRetailer,
  mockCollection,
  mockProducts,
  mockCreate,
  mockUpdate,
  mockPush,
} = vi.hoisted(() => ({
  mockSession: vi.fn(),
  mockRetailer: vi.fn(),
  mockCollection: vi.fn(),
  mockProducts: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockPush: vi.fn(),
}));

vi.mock('../../../jobs/enquiry-push.js', () => ({ addEnquiryPushJob: mockPush }));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findFirst: mockRetailer },
    collection: { findFirst: mockCollection, update: mockUpdate },
    product: { findMany: mockProducts },
    collectionEnquiry: { create: mockCreate },
  },
  Prisma: {},
}));
vi.mock('../passport/passport-helpers.js', () => ({ getPassportSession: mockSession }));

const RETAILER = {
  id: 'ret_1',
  shop_name: 'Shop',
  phone: '9876543210',
  whatsapp_number: '9123456789',
};

function storeProducts(...ids: string[]) {
  mockProducts.mockImplementation(
    async ({ where }: { where: { id: { in: string[] }; retailer_id: string } }) =>
      where.retailer_id === RETAILER.id
        ? where.id.in
            .filter((i) => ids.includes(i))
            .map((id) => ({ id, name: `Name of ${id}`, price_min: 150000 }))
        : [],
  );
}

async function post(payload: unknown) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(publicMyStyleRoutes, { prefix: '/v1/public/my-style' });
  const res = await app.inject({
    method: 'POST',
    url: '/v1/public/my-style/enquire',
    payload: payload as object,
  });
  await app.close();
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ customer_account_id: 'acc_1', customer_account: {} });
  mockRetailer.mockResolvedValue(RETAILER);
  mockCollection.mockResolvedValue({ id: 'col_1', title: 'Festive' });
  mockCreate.mockResolvedValue({ id: 'enq_1' });
  mockUpdate.mockResolvedValue({});
  mockPush.mockResolvedValue(undefined);
  storeProducts('a', 'b');
});

describe('POST /v1/public/my-style/enquire — team push (F-046)', () => {
  it('enqueues one push with the enquiry id and item count only', async () => {
    const res = await post({ retailer_slug: 's', product_ids: ['a', 'b'] });
    expect(res.statusCode).toBe(200);
    expect(mockPush).toHaveBeenCalledWith({
      retailer_id: 'ret_1',
      enquiry_id: 'enq_1',
      item_count: 2,
    });
  });

  it('a failed enqueue never fails the saved enquiry', async () => {
    mockPush.mockRejectedValue(new Error('redis down'));
    const res = await post({ retailer_slug: 's', product_ids: ['a'] });
    expect(res.statusCode).toBe(200);
  });

  it('no collection to attach the row to → nothing recorded, nothing pushed', async () => {
    mockCollection.mockResolvedValue(null);
    const res = await post({ retailer_slug: 's', product_ids: ['a'] });
    expect(res.statusCode).toBe(200);
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('POST /v1/public/my-style/enquire', () => {
  it('no session → 401, nothing read or written', async () => {
    mockSession.mockResolvedValue(null);
    const res = await post({ retailer_slug: 's', product_ids: ['a'] });
    expect(res.statusCode).toBe(401);
    expect(mockRetailer).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('stores one row with every pick, bumps the count, returns the shop WhatsApp link', async () => {
    const res = await post({ retailer_slug: 's', product_ids: ['a', 'b', 'a'] });
    expect(res.statusCode).toBe(200);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        collection_id: 'col_1',
        retailer_id: 'ret_1',
        product_id: 'a',
        product_ids: ['a', 'b'],
      }),
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'col_1' },
      data: { enquiry_count: { increment: 1 } },
    });
    const { whatsapp_url, recorded } = res.json().data;
    expect(recorded).toBe(true);
    expect(whatsapp_url).toContain('wa.me/919123456789'); // whatsapp_number wins (E5)
    const text = decodeURIComponent(whatsapp_url.split('?text=')[1]);
    expect(text).toContain('Name of a');
    expect(text).not.toMatch(/• a\b/);
  });

  it('a product of another store → 422, nothing written', async () => {
    const res = await post({ retailer_slug: 's', product_ids: ['a', 'foreign'] });
    expect(res.statusCode).toBe(422);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ retailer_id: 'ret_1', deleted_at: null }),
      }),
    );
  });

  it('unknown or suspended store → 404 (lookup filters suspended/deleted)', async () => {
    mockRetailer.mockResolvedValue(null);
    const res = await post({ retailer_slug: 'nope', product_ids: ['a'] });
    expect(res.statusCode).toBe(404);
    expect(mockRetailer).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          public_slug: 'nope',
          is_suspended: false,
          deleted_at: null,
        }),
      }),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('store with no active collection → link still returned, recorded:false, no row', async () => {
    mockCollection.mockResolvedValue(null);
    const res = await post({ retailer_slug: 's', product_ids: ['a'] });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.recorded).toBe(false);
    expect(res.json().data.whatsapp_url).toContain('wa.me/');
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects empty, >20, and unknown keys', async () => {
    expect((await post({ retailer_slug: 's', product_ids: [] })).statusCode).toBe(422);
    const many = Array.from({ length: 21 }, (_, i) => `p${i}`);
    expect((await post({ retailer_slug: 's', product_ids: many })).statusCode).toBe(422);
    expect((await post({ retailer_slug: 's', product_ids: ['a'], x: 1 })).statusCode).toBe(422);
  });
});
