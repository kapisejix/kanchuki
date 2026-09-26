// F-039 T7 — the try-on route. Covers the two things the spec calls
// security-critical: the launch gate is a server-side 404 (not a 403 that
// confirms the route exists), and the wearer's photo is never handed to a
// persisting store. Also covers dual identity + dual quota, and the status poll.
//
// The RunPod call itself is not exercised here — it is mocked at the @kanchuki/ai
// boundary, so CI never burns a GPU minute.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, errorHandler, planLimitExceeded } from '../plugins/error-handler.js';
import { productsTryOnRoutes } from './products/products-tryon.js';

const {
  mockProductFindFirst,
  mockJobCreate,
  mockJobUpdate,
  mockJobFindFirst,
  mockAddTryOnJob,
  mockHasFeature,
  mockCheckQuota,
  mockCheckCustomerQuota,
  mockPutTryOnPhoto,
  mockDiscardTryOnPhoto,
  mockGetPassportSession,
  mockIsCatVtonConfigured,
  mockIsUnsupportedTryOnCategory,
  mockGetDownloadPresignedUrl,
} = vi.hoisted(() => ({
  mockProductFindFirst: vi.fn(),
  mockJobCreate: vi.fn(),
  mockJobUpdate: vi.fn(),
  mockJobFindFirst: vi.fn(),
  mockAddTryOnJob: vi.fn(),
  mockHasFeature: vi.fn(),
  mockCheckQuota: vi.fn(),
  mockCheckCustomerQuota: vi.fn(),
  mockPutTryOnPhoto: vi.fn(),
  mockDiscardTryOnPhoto: vi.fn(),
  mockGetPassportSession: vi.fn(),
  mockIsCatVtonConfigured: vi.fn(),
  mockIsUnsupportedTryOnCategory: vi.fn(),
  mockGetDownloadPresignedUrl: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    product: { findFirst: mockProductFindFirst },
    tryOnJob: { create: mockJobCreate, update: mockJobUpdate, findFirst: mockJobFindFirst },
  },
}));

vi.mock('../jobs/index.js', () => ({ addTryOnJob: mockAddTryOnJob }));

vi.mock('../lib/features.js', () => ({ hasFeature: mockHasFeature }));

vi.mock('../lib/quota.js', () => ({
  checkQuota: mockCheckQuota,
  checkCustomerQuota: mockCheckCustomerQuota,
}));

vi.mock('../lib/tryon-photo-store.js', () => ({
  putTryOnPhoto: mockPutTryOnPhoto,
  discardTryOnPhoto: mockDiscardTryOnPhoto,
}));

// NB: relative to THIS file (routes/), which is one level above the route's
// own `../public/...` specifier.
vi.mock('./public/passport/passport-helpers.js', () => ({
  getPassportSession: mockGetPassportSession,
}));

vi.mock('@kanchuki/ai', () => ({
  isCatVtonConfigured: mockIsCatVtonConfigured,
  isUnsupportedTryOnCategory: mockIsUnsupportedTryOnCategory,
  getDownloadPresignedUrl: mockGetDownloadPresignedUrl,
}));

const RETAILER_ID = 'retailer_1';
const CUSTOMER_ID = 'acct_1';
const BOUNDARY = 'kanchuki-test-boundary';

const PRODUCT = {
  id: 'p1',
  retailer_id: RETAILER_ID,
  category: 'Kurti',
  photos: [{ url: 'https://r2.example/garment.jpg', r2_key: 'garments/p1.jpg' }],
};

function photoPayload(bytes = Buffer.from('fake-jpeg-bytes'), contentType = 'image/jpeg') {
  const head = Buffer.from(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="photo"; filename="c.jpg"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${BOUNDARY}--\r\n`);
  return Buffer.concat([head, bytes, tail]);
}

function multipartHeaders() {
  return { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` };
}

async function buildApp(opts: { retailerId?: string } = {}) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('preHandler', async (request) => {
    request.retailerId = opts.retailerId ?? '';
  });
  await app.register(productsTryOnRoutes, { prefix: '/v1/products' });
  await app.ready();
  return app;
}

function post(app: Awaited<ReturnType<typeof buildApp>>, cookie?: string) {
  return app.inject({
    method: 'POST',
    url: '/v1/products/p1/try-on',
    headers: { ...multipartHeaders(), ...(cookie ? { cookie } : {}) },
    payload: photoPayload(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPassportSession.mockResolvedValue(null);
  mockHasFeature.mockResolvedValue(true);
  mockIsCatVtonConfigured.mockResolvedValue(true);
  mockIsUnsupportedTryOnCategory.mockReturnValue(false);
  mockProductFindFirst.mockResolvedValue(PRODUCT);
  mockCheckQuota.mockResolvedValue(undefined);
  mockCheckCustomerQuota.mockResolvedValue(undefined);
  mockPutTryOnPhoto.mockReturnValue(true);
  mockJobCreate.mockResolvedValue({});
  mockJobUpdate.mockResolvedValue({});
  mockAddTryOnJob.mockResolvedValue(undefined);
});

describe('POST /products/:id/try-on', () => {
  it('404 when the plan does not have VIRTUAL_TRY_ON_V2 — the launch gate', async () => {
    mockHasFeature.mockResolvedValue(false);
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await post(app);

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
    // Nothing past the gate ran — no config, quota, photo store or enqueue.
    expect(mockIsCatVtonConfigured).not.toHaveBeenCalled();
    expect(mockCheckQuota).not.toHaveBeenCalled();
    expect(mockPutTryOnPhoto).not.toHaveBeenCalled();
    expect(mockAddTryOnJob).not.toHaveBeenCalled();
    await app.close();
  });

  it('202 + job_id for a retailer with the feature enabled', async () => {
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await post(app);

    expect(res.statusCode).toBe(202);
    expect(res.json().data.status).toBe('processing');
    expect(typeof res.json().data.job_id).toBe('string');
    expect(mockJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          retailer_id: RETAILER_ID,
          customer_account_id: null,
          product_id: 'p1',
          status: 'PENDING',
        }),
      }),
    );
    expect(mockPutTryOnPhoto).toHaveBeenCalledTimes(1);
    expect(mockAddTryOnJob).toHaveBeenCalledWith(
      expect.objectContaining({
        retailer_id: RETAILER_ID,
        customer_account_id: null,
        product_id: 'p1',
      }),
    );
    await app.close();
  });

  it('the job payload never carries image bytes', async () => {
    const app = await buildApp({ retailerId: RETAILER_ID });
    await post(app);

    const payload = mockAddTryOnJob.mock.calls[0]?.[0] as Record<string, unknown>;
    // Nothing serialisable to Redis may hold the photo — only ids. The bytes
    // travel through the in-process store instead.
    expect(Object.keys(payload).sort()).toEqual([
      'customer_account_id',
      'job_id',
      'product_id',
      'retailer_id',
    ]);
    expect(JSON.stringify(payload)).not.toContain(Buffer.from('fake-jpeg-bytes').toString('base64'));
    await app.close();
  });

  it('503 when the try-on engine is not configured (before any quota spend)', async () => {
    mockIsCatVtonConfigured.mockResolvedValue(false);
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await post(app);

    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('SERVICE_UNAVAILABLE');
    expect(mockCheckQuota).not.toHaveBeenCalled();
    expect(mockAddTryOnJob).not.toHaveBeenCalled();
    await app.close();
  });

  it('422 for an unsupported garment category', async () => {
    mockIsUnsupportedTryOnCategory.mockReturnValue(true);
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await post(app);

    expect(res.statusCode).toBe(422);
    expect(mockAddTryOnJob).not.toHaveBeenCalled();
    await app.close();
  });

  it('402 PLAN_LIMIT_EXCEEDED when the retailer cap is used up', async () => {
    mockCheckQuota.mockRejectedValue(planLimitExceeded('try on generation'));
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await post(app);

    expect(res.statusCode).toBe(402);
    expect(res.json().error.code).toBe('PLAN_LIMIT_EXCEEDED');
    expect(mockAddTryOnJob).not.toHaveBeenCalled();
    await app.close();
  });

  it('a customer hits the customer cap even when the retailer is under theirs', async () => {
    mockGetPassportSession.mockResolvedValue({ customer_account_id: CUSTOMER_ID });
    mockCheckCustomerQuota.mockRejectedValue(
      new AppError('CUSTOMER_LIMIT_EXCEEDED', "You've reached your limit for try on generation.", 402),
    );
    const app = await buildApp(); // no bearer → customer path
    const res = await post(app, `kanchuki_passport=sess_1`);

    expect(res.statusCode).toBe(402);
    expect(res.json().error.code).toBe('CUSTOMER_LIMIT_EXCEEDED');
    expect(mockCheckQuota).toHaveBeenCalledWith(RETAILER_ID, 'TRY_ON_GENERATION');
    expect(mockCheckCustomerQuota).toHaveBeenCalledWith(CUSTOMER_ID, 'TRY_ON_GENERATION');
    expect(mockAddTryOnJob).not.toHaveBeenCalled();
    await app.close();
  });

  it('a passport-logged-in shopper spends both counters, retailer resolved from the product', async () => {
    mockGetPassportSession.mockResolvedValue({ customer_account_id: CUSTOMER_ID });
    const app = await buildApp();
    const res = await post(app, `kanchuki_passport=sess_1`);

    expect(res.statusCode).toBe(202);
    expect(mockCheckQuota).toHaveBeenCalledWith(RETAILER_ID, 'TRY_ON_GENERATION');
    expect(mockAddTryOnJob).toHaveBeenCalledWith(
      expect.objectContaining({ retailer_id: RETAILER_ID, customer_account_id: CUSTOMER_ID }),
    );
    await app.close();
  });

  it('401 when there is no bearer and no passport session', async () => {
    const app = await buildApp();
    const res = await post(app);

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
    expect(mockAddTryOnJob).not.toHaveBeenCalled();
    await app.close();
  });

  it('422 when the body is not multipart', async () => {
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/p1/try-on',
      payload: {},
    });

    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('503 and drops the photo when the store is full', async () => {
    mockPutTryOnPhoto.mockReturnValue(false);
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await post(app);

    expect(res.statusCode).toBe(503);
    expect(mockAddTryOnJob).not.toHaveBeenCalled();
    expect(mockJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
    await app.close();
  });

  it('discards the stashed photo when the enqueue itself fails', async () => {
    mockAddTryOnJob.mockRejectedValue(new Error('redis down'));
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await post(app);

    expect(res.statusCode).toBe(500);
    expect(mockDiscardTryOnPhoto).toHaveBeenCalledTimes(1);
    await app.close();
  });
});

describe('GET /products/:id/try-on/status', () => {
  it('ready + presigned url when the job completed', async () => {
    mockJobFindFirst.mockResolvedValue({
      status: 'COMPLETED',
      result_url: 'tryon-results/tryon_1/result.jpg',
      failure_reason: null,
    });
    mockGetDownloadPresignedUrl.mockResolvedValue('https://r2.example/signed');
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/products/p1/try-on/status?job_id=tryon_1',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ status: 'ready', url: 'https://r2.example/signed' });
    // Scoped to the caller's store.
    expect(mockJobFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ retailer_id: RETAILER_ID, product_id: 'p1' }),
      }),
    );
    await app.close();
  });

  it('failed + reason when the job failed', async () => {
    mockJobFindFirst.mockResolvedValue({
      status: 'FAILED',
      result_url: null,
      failure_reason: 'Product not found.',
    });
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/products/p1/try-on/status?job_id=tryon_1',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ status: 'failed', error: 'Product not found.' });
    await app.close();
  });

  it('processing while pending', async () => {
    mockJobFindFirst.mockResolvedValue({ status: 'PENDING', result_url: null, failure_reason: null });
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/products/p1/try-on/status?job_id=tryon_1',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('processing');
    await app.close();
  });

  it('a shopper polls their own job, scoped by customer_account_id', async () => {
    mockGetPassportSession.mockResolvedValue({ customer_account_id: CUSTOMER_ID });
    mockJobFindFirst.mockResolvedValue({ status: 'PENDING', result_url: null, failure_reason: null });
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/products/p1/try-on/status?job_id=tryon_1',
      headers: { cookie: 'kanchuki_passport=sess_1' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockJobFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ customer_account_id: CUSTOMER_ID }),
      }),
    );
    await app.close();
  });

  it('422 without job_id', async () => {
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await app.inject({ method: 'GET', url: '/v1/products/p1/try-on/status' });

    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('404 when the job belongs to someone else / does not exist', async () => {
    mockJobFindFirst.mockResolvedValue(null);
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/products/p1/try-on/status?job_id=tryon_other',
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
