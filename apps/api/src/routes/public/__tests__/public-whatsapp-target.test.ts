// F-044 / E5 — every customer WhatsApp enquiry goes to the store's verified
// `whatsapp_number` (the shared Business number staff run on linked devices),
// falling back to the login `phone` when none is set. The API resolves it once,
// so the public payloads keep exposing ONE number under the same `phone` key —
// never the login phone AND the WhatsApp number side by side.
import { buildWhatsAppEnquiryLink } from '@kanchuki/shared';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';
import { publicCollectionsRoutes } from '../public-collections.js';
import { enquiryPhone } from '../public-helpers.js';
import { publicRetailersCatalogRoutes } from '../public-retailers/public-retailers-catalog.js';

const db = vi.hoisted(() => ({
  collectionFindFirst: vi.fn(),
  collectionUpdate: vi.fn(),
  retailerFindFirst: vi.fn(),
  productFindMany: vi.fn(),
  productCount: vi.fn(),
  cpFindMany: vi.fn(),
  cpCount: vi.fn(),
  enquiryCreate: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    collection: { findFirst: db.collectionFindFirst, update: db.collectionUpdate },
    retailer: { findFirst: db.retailerFindFirst },
    product: { findMany: db.productFindMany, count: db.productCount },
    collectionProduct: { findMany: db.cpFindMany, count: db.cpCount },
    collectionEnquiry: { create: db.enquiryCreate },
  },
  Prisma: {},
  withRetry: async (fn: () => Promise<unknown>) => fn(),
}));

vi.mock('../../../lib/public-cache.js', () => ({
  withPublicCache: async (_key: string, fn: () => Promise<unknown>) => fn(),
}));
// F-046: the enquire route enqueues a team push; this file is about the WhatsApp target.
vi.mock('../../../jobs/enquiry-push.js', () => ({ addEnquiryPushJob: vi.fn() }));

const LOGIN = '9876543210';
const BUSINESS = '9123456789';

const retailerRow = (whatsapp_number: string | null) => ({
  id: 'ret_1',
  shop_name: 'Shop',
  city: 'Ludhiana',
  phone: LOGIN,
  whatsapp_number,
  logo_url: null,
  banner_url: null,
  is_suspended: false,
  public_slug: 'shop',
  latitude: null,
  longitude: null,
});

// Keys the payload exposed BEFORE E5 — the fix must not add any.
const COLLECTION_RETAILER_KEYS = [
  'banner_url',
  'city',
  'id',
  'is_suspended',
  'latitude',
  'logo_url',
  'longitude',
  'phone',
  'public_slug',
  'shop_name',
];
const CATALOG_RETAILER_KEYS = [
  'banner_url',
  'city',
  'id',
  'logo_url',
  'phone',
  'public_slug',
  'shop_name',
];

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(publicCollectionsRoutes, { prefix: '/v1/public' });
  await app.register(publicRetailersCatalogRoutes, { prefix: '/v1/public' });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.collectionUpdate.mockResolvedValue({});
  db.enquiryCreate.mockResolvedValue({ id: 'enq_1' });
  db.productFindMany.mockResolvedValue([]);
  db.productCount.mockResolvedValue(0);
  db.cpFindMany.mockResolvedValue([]);
  db.cpCount.mockResolvedValue(0);
});

// RC-067: the country code used to be added by a `startsWith('91')` check, so a
// 10-digit mobile that itself starts with 91 lost it. Length decides now.
describe('buildWhatsAppEnquiryLink (RC-067)', () => {
  it.each(['9123456789', '+919123456789', '919123456789', '09123456789', '91234 56789'])(
    '%s → wa.me/919123456789',
    (input) => {
      expect(buildWhatsAppEnquiryLink(input, 'hi')).toBe('https://wa.me/919123456789?text=hi');
    },
  );
  it('ordinary number unchanged', () => {
    expect(buildWhatsAppEnquiryLink('+91 98765 43210', 'hi')).toBe(
      'https://wa.me/919876543210?text=hi',
    );
  });
});

describe('enquiryPhone', () => {
  it('prefers whatsapp_number, falls back to phone when null or empty', () => {
    expect(enquiryPhone({ phone: LOGIN, whatsapp_number: BUSINESS })).toBe(BUSINESS);
    expect(enquiryPhone({ phone: LOGIN, whatsapp_number: null })).toBe(LOGIN);
    expect(enquiryPhone({ phone: LOGIN, whatsapp_number: '' })).toBe(LOGIN);
  });
});

describe.each([
  ['whatsapp_number set', BUSINESS, BUSINESS],
  ['whatsapp_number empty', null, LOGIN],
])('E5 WhatsApp target — %s', (_label, whatsapp, expected) => {
  it('enquire route opens wa.me on the resolved number', async () => {
    db.collectionFindFirst.mockResolvedValue({
      id: 'col_1',
      retailer_id: 'ret_1',
      title: 'Festive',
      retailer: { shop_name: 'Shop', phone: LOGIN, whatsapp_number: whatsapp },
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/public/collections/abc/enquire',
      payload: { message: 'hi' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.whatsapp_url).toBe(`https://wa.me/91${expected}?text=hi`);
    expect(db.collectionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          retailer: { select: { shop_name: true, phone: true, whatsapp_number: true } },
        }),
      }),
    );
    await app.close();
  });

  it('collection payload: phone = resolved number, no new keys', async () => {
    db.collectionFindFirst.mockResolvedValue({
      id: 'col_1',
      title: 'Festive',
      description: null,
      expires_at: null,
      retailer: retailerRow(whatsapp),
    });
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/public/collections/abc' });
    expect(res.statusCode).toBe(200);
    const retailer = res.json().data.retailer;
    expect(retailer.phone).toBe(expected);
    expect(Object.keys(retailer).sort()).toEqual(COLLECTION_RETAILER_KEYS);
    await app.close();
  });

  it.each([
    ['all products', '/v1/public/retailers/shop/products'],
    ['new arrivals', '/v1/public/retailers/shop/categories/new-arrivals'],
  ])('store %s payload: phone = resolved number, no new keys', async (_n, url) => {
    db.retailerFindFirst.mockResolvedValue(retailerRow(whatsapp));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(200);
    const retailer = res.json().data.retailer;
    expect(retailer.phone).toBe(expected);
    expect(Object.keys(retailer).sort()).toEqual(CATALOG_RETAILER_KEYS);
    await app.close();
  });

  it('suspended store payload also carries only the resolved number', async () => {
    db.retailerFindFirst.mockResolvedValue({ ...retailerRow(whatsapp), is_suspended: true });
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/public/retailers/shop/products' });
    const retailer = res.json().data.retailer;
    expect(retailer.phone).toBe(expected);
    expect(retailer).not.toHaveProperty('whatsapp_number');
    await app.close();
  });
});
