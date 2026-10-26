/**
 * H4-3 / RC-098: reviews are keyed on the passport session account, never on a
 * body-supplied phone. Reviews must not touch the retailer CRM (Customer).
 */
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';
import { publicReviewsRoutes } from './public-reviews.js';

const m = vi.hoisted(() => ({
  session: vi.fn(),
  productFind: vi.fn(),
  retailerFind: vi.fn(),
  retailerUpdate: vi.fn(),
  productUpdate: vi.fn(),
  prUpsert: vi.fn(),
  srUpsert: vi.fn(),
  prAgg: vi.fn(),
  srAgg: vi.fn(),
  prFindMany: vi.fn(),
  prFindUnique: vi.fn(),
  srFindUnique: vi.fn(),
  prCount: vi.fn(),
  srCount: vi.fn(),
  customerAny: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    product: { findUnique: m.productFind, update: m.productUpdate },
    retailer: { findUnique: m.retailerFind, update: m.retailerUpdate },
    productReview: {
      upsert: m.prUpsert,
      aggregate: m.prAgg,
      findMany: m.prFindMany,
      findUnique: m.prFindUnique,
      count: m.prCount,
    },
    storeReview: {
      upsert: m.srUpsert,
      aggregate: m.srAgg,
      findUnique: m.srFindUnique,
      count: m.srCount,
    },
    customer: { upsert: m.customerAny, update: m.customerAny, create: m.customerAny },
  },
}));
// Real cookie parsing (passportCookieId) so the limiter key is the one production uses.
vi.mock('./passport/passport-helpers.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./passport/passport-helpers.js')>()),
  getPassportSession: m.session,
}));

const SESSION = {
  customer_account_id: 'ca_1',
  customer_account: { id: 'ca_1', name: 'Asha', phone: '+919000000000', deleted_at: null },
};
const RETAILER = {
  id: 'ret1',
  google_place_id: 'PLACE',
  phone: '9111111111',
  whatsapp_number: null,
};
const REVIEW_ROW = {
  id: 'r1',
  rating: 5,
  comment: null,
  display_name: 'Asha',
  created_at: new Date(),
};

async function buildApp(withLimit = false) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  if (withLimit) await app.register(rateLimit, { max: 1000, timeWindow: 60_000 });
  await app.register(publicReviewsRoutes, { prefix: '/v1/public' });
  await app.ready();
  return app;
}

async function post(
  url: string,
  payload: object,
  app?: Awaited<ReturnType<typeof buildApp>>,
  cookie = 'x=1',
) {
  const a = app ?? (await buildApp());
  return a.inject({ method: 'POST', url: `/v1/public${url}`, payload, headers: { cookie } });
}

beforeEach(() => {
  vi.resetAllMocks();
  m.session.mockResolvedValue(SESSION);
  m.productFind.mockResolvedValue({ id: 'p1', retailer_id: 'ret1' });
  m.retailerFind.mockResolvedValue(RETAILER);
  m.prFindUnique.mockResolvedValue(null);
  m.srFindUnique.mockResolvedValue(null);
  m.prCount.mockResolvedValue(0);
  m.srCount.mockResolvedValue(0);
  m.prUpsert.mockResolvedValue(REVIEW_ROW);
  m.srUpsert.mockResolvedValue(REVIEW_ROW);
  m.prAgg.mockResolvedValue({ _avg: { rating: 5 }, _count: { rating: 1 } });
  m.srAgg.mockResolvedValue({ _avg: { rating: 5 }, _count: { rating: 1 } });
});

const ROUTES = [
  ['/reviews/product', { product_id: 'p1', rating: 5 }, 'prUpsert', 'prFindUnique'],
  ['/reviews/store', { retailer_id: 'ret1', rating: 5 }, 'srUpsert', 'srFindUnique'],
] as const;

describe.each(ROUTES)('POST %s', (url, base, upsertKey, findKey) => {
  it('401 NO_SESSION without a passport session, writes nothing', async () => {
    m.session.mockResolvedValue(null);
    const res = await post(url, { ...base, phone: '9000000001' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('NO_SESSION');
    expect(m[upsertKey]).not.toHaveBeenCalled();
  });

  it('ignores a body phone / customer_account_id: identity is the session account', async () => {
    const res = await post(url, {
      ...base,
      phone: '9000000001',
      customer_account_id: 'victim',
      name: 'Hacker',
    });
    expect(res.statusCode).toBe(201);
    const arg = m[upsertKey].mock.calls[0]?.[0];
    expect(JSON.stringify(arg.where)).toContain('ca_1');
    expect(JSON.stringify(arg)).not.toContain('victim');
    expect(JSON.stringify(arg)).not.toContain('9000000001');
  });

  it('never touches the retailer CRM Customer table', async () => {
    await post(url, { ...base, display_name: 'Someone' });
    expect(m.customerAny).not.toHaveBeenCalled();
  });

  it('upserts on the account so a shopper edits only their own review', async () => {
    await post(url, base);
    expect(m[upsertKey]).toHaveBeenCalledTimes(1);
  });

  it('selects explicit fields so customer_account_id is never echoed', async () => {
    await post(url, base);
    const sel = m[upsertKey].mock.calls[0]?.[0].select;
    expect(sel).toBeDefined();
    expect(sel.customer_account_id).toBeUndefined();
  });

  it('11th request in a minute is 429', async () => {
    const app = await buildApp(true);
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await post(url, base, app)).statusCode);
    await app.close();
    expect(codes.slice(0, 10).every((c) => c === 201)).toBe(true);
    expect(codes[10]).toBe(429);
  });

  it('rate limit is per session: another cookie has its own bucket', async () => {
    const app = await buildApp(true);
    const a: number[] = [];
    for (let i = 0; i < 10; i++) {
      a.push((await post(url, base, app, 'kanchuki_passport=A')).statusCode);
    }
    const b = (await post(url, base, app, 'kanchuki_passport=B')).statusCode;
    const a11 = (await post(url, base, app, 'kanchuki_passport=A')).statusCode;
    await app.close();
    expect(a.every((c) => c === 201)).toBe(true);
    expect(b).toBe(201);
    expect(a11).toBe(429);
  });

  it('duplicate session cookies are keyed on the one getPassportSession authenticates (last wins)', async () => {
    const app = await buildApp(true);
    const codes: number[] = [];
    // A fresh throwaway FIRST cookie every request must not buy a fresh bucket.
    for (let i = 0; i < 11; i++) {
      const cookie = `kanchuki_passport=junk${i}; kanchuki_passport=A`;
      codes.push((await post(url, base, app, cookie)).statusCode);
    }
    await app.close();
    expect(codes.slice(0, 10).every((c) => c === 201)).toBe(true);
    expect(codes[10]).toBe(429);
  });

  it('429 DAILY_REVIEW_LIMIT at 20 new reviews in 24 h (product + store combined)', async () => {
    m.prCount.mockResolvedValue(12);
    m.srCount.mockResolvedValue(8);
    const res = await post(url, base);
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('DAILY_REVIEW_LIMIT');
    expect(m[upsertKey]).not.toHaveBeenCalled();
  });

  it('19 in 24 h is still allowed', async () => {
    m.prCount.mockResolvedValue(11);
    m.srCount.mockResolvedValue(8);
    expect((await post(url, base)).statusCode).toBe(201);
  });

  it('editing an existing review works at the cap', async () => {
    m.prCount.mockResolvedValue(20);
    m[findKey].mockResolvedValue({ id: 'r1' });
    expect((await post(url, base)).statusCode).toBe(201);
  });

  it('403 OWN_STORE_REVIEW when the account phone is the retailer phone', async () => {
    m.retailerFind.mockResolvedValue({ ...RETAILER, phone: '9000000000' });
    const res = await post(url, base);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('OWN_STORE_REVIEW');
    expect(m[upsertKey]).not.toHaveBeenCalled();
  });

  it('403 OWN_STORE_REVIEW when it matches whatsapp_number', async () => {
    m.retailerFind.mockResolvedValue({ ...RETAILER, whatsapp_number: '+91 90000 00000' });
    expect((await post(url, base)).statusCode).toBe(403);
    expect(m[upsertKey]).not.toHaveBeenCalled();
  });

  it('offers the Google link for ANY rating when the store has a place id', async () => {
    const res5 = await post(url, { ...base, rating: 5 });
    const res2 = await post(url, { ...base, rating: 2 });
    for (const r of [res5, res2]) {
      expect(r.json().routing.action).toBe('google_review');
      expect(r.json().routing.url).toContain('placeid=PLACE');
    }
    expect(res2.json().routing.feedback_message).toBeTruthy();
    expect(res5.json().routing.feedback_message).toBeUndefined();
  });

  it('no Google link without a place id', async () => {
    m.retailerFind.mockResolvedValue({ ...RETAILER, google_place_id: null });
    const res = await post(url, base);
    expect(res.json().routing.url).toBeUndefined();
  });
});

describe('GET /reviews/product/:id', () => {
  it('shows display_name, falling back to the legacy customer name', async () => {
    const row = { rating: 4, comment: null, created_at: new Date() };
    m.prFindMany.mockResolvedValue([
      { id: 'a', ...row, display_name: 'Asha', customer: null },
      { id: 'b', ...row, display_name: null, customer: { name: 'Old' } },
      { id: 'c', ...row, display_name: null, customer: null },
    ]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/public/reviews/product/p1' });
    expect(res.json().data.map((r: { customer_name: string }) => r.customer_name)).toEqual([
      'Asha',
      'Old',
      '',
    ]);
  });
});
