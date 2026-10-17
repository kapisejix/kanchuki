// F-040 T7 — the try-on route. Covers the three things the spec calls
// security-critical: the launch gate is a server-side 404 (not a 403 that
// confirms the route exists), the wearer's photo is never handed to a
// persisting store, and the consent gate is server-side (the generated image is
// a stored photo of a real person, so the route — not the UI — is what refuses
// a request that carries no permission). Also covers dual identity + dual
// quota, and the status poll.
//
// The RunPod call itself is not exercised here — it is mocked at the @kanchuki/ai
// boundary, so CI never burns a GPU minute.
import { TRY_ON_CONSENT } from '@kanchuki/shared';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, errorHandler, planLimitExceeded } from '../plugins/error-handler.js';
import { productsTryOnRoutes } from './products/products-tryon.js';

const {
  mockProductFindFirst,
  mockJobCreate,
  mockJobUpdate,
  mockJobFindFirst,
  mockJobCount,
  mockJobFindMany,
  mockJobUpdateMany,
  mockDeleteObject,
  mockGetQuotaStatus,
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
  mockHasLiveTryOnConsent,
  mockRecordTryOnConsent,
  flags,
} = vi.hoisted(() => ({
  // E6: the customer path is shipped OFF. The existing customer-path tests run
  // with it ON (reset in beforeEach); the E6 block below turns it off.
  flags: { customerTryOn: true },
  mockProductFindFirst: vi.fn(),
  mockJobCreate: vi.fn(),
  mockJobUpdate: vi.fn(),
  mockJobFindFirst: vi.fn(),
  mockJobCount: vi.fn(),
  mockJobFindMany: vi.fn(),
  mockJobUpdateMany: vi.fn(),
  mockDeleteObject: vi.fn(),
  mockGetQuotaStatus: vi.fn(),
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
  mockHasLiveTryOnConsent: vi.fn(),
  mockRecordTryOnConsent: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    product: { findFirst: mockProductFindFirst },
    tryOnJob: {
      create: mockJobCreate,
      update: mockJobUpdate,
      findFirst: mockJobFindFirst,
      count: mockJobCount,
      findMany: mockJobFindMany,
      updateMany: mockJobUpdateMany,
    },
  },
}));

vi.mock('../jobs/index.js', () => ({ addTryOnJob: mockAddTryOnJob }));

vi.mock('../lib/features.js', () => ({
  hasFeature: mockHasFeature,
  get CUSTOMER_TRY_ON_ENABLED() {
    return flags.customerTryOn;
  },
}));

vi.mock('../lib/quota.js', () => ({
  checkQuota: mockCheckQuota,
  checkCustomerQuota: mockCheckCustomerQuota,
  getQuotaStatus: mockGetQuotaStatus,
}));

vi.mock('../lib/tryon-photo-store.js', () => ({
  putTryOnPhoto: mockPutTryOnPhoto,
  discardTryOnPhoto: mockDiscardTryOnPhoto,
}));

// Mocked at the lib boundary, not stubbed inside the route, so the route test
// asserts "a granted shopper is not asked again" against the real predicate
// name rather than a stubbed boolean. The predicate's own event-ordering logic
// is tested in lib/tryon-consent.test.ts.
vi.mock('../lib/tryon-consent.js', () => ({
  hasLiveTryOnConsent: mockHasLiveTryOnConsent,
  recordTryOnConsent: mockRecordTryOnConsent,
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
  deleteObject: mockDeleteObject,
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

async function buildApp(
  opts: {
    retailerId?: string;
    staffRole?: string | null;
    delegate?: 'catalog' | 'support';
  } = {},
) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.decorateRequest('staffRole', null);
  app.decorateRequest('catalogDelegate', null);
  app.decorateRequest('supportDelegate', null);
  app.addHook('preHandler', async (request) => {
    request.retailerId = opts.retailerId ?? '';
    request.staffRole = opts.staffRole ?? null;
    // Delegates keep staffRole = null (auth.ts), same as a real owner.
    if (opts.delegate === 'catalog') {
      request.catalogDelegate = { team_member_id: 'tm_1', ticket_id: 'tk_1' };
    }
    if (opts.delegate === 'support') {
      request.supportDelegate = {
        team_member_id: 'tm_1',
        ticket_id: 'tk_1',
        grant_id: 'g_1',
        scope: 'READ',
      } as never;
    }
  });
  await app.register(productsTryOnRoutes, { prefix: '/v1/products' });
  await app.ready();
  return app;
}

/**
 * POST with a valid consent acknowledgement by default — which is what a real
 * client does, and what every non-consent test here is implicitly about. Pass
 * `consentVersion: null` for "sent none" and a string for "sent that one", so
 * the gate's own tests read as deliberate rather than as a broken helper.
 * The version comes from the real constant, so a bump that the route accepts
 * cannot diverge from what this file sends.
 */
function post(
  app: Awaited<ReturnType<typeof buildApp>>,
  cookie?: string,
  opts: { consentVersion?: string | null } = {},
) {
  const version = opts.consentVersion === undefined ? TRY_ON_CONSENT.version : opts.consentVersion;
  const query = version === null ? '' : `?consent_version=${encodeURIComponent(version)}`;
  return app.inject({
    method: 'POST',
    url: `/v1/products/p1/try-on${query}`,
    headers: { ...multipartHeaders(), ...(cookie ? { cookie } : {}) },
    payload: photoPayload(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  flags.customerTryOn = true;
  mockGetPassportSession.mockResolvedValue(null);
  mockHasFeature.mockResolvedValue(true);
  mockIsCatVtonConfigured.mockResolvedValue(true);
  mockIsUnsupportedTryOnCategory.mockReturnValue(false);
  mockProductFindFirst.mockResolvedValue(PRODUCT);
  mockCheckQuota.mockResolvedValue(undefined);
  mockCheckCustomerQuota.mockResolvedValue(undefined);
  mockJobCount.mockResolvedValue(0);
  mockJobFindMany.mockResolvedValue([]);
  mockJobUpdateMany.mockResolvedValue({ count: 1 });
  mockDeleteObject.mockResolvedValue(undefined);
  mockGetQuotaStatus.mockResolvedValue({
    used: 1,
    limit: 3,
    remaining: 2,
    period: 'MONTH',
    unlimited: false,
  });
  mockPutTryOnPhoto.mockReturnValue(true);
  mockJobCreate.mockResolvedValue({});
  mockJobUpdate.mockResolvedValue({});
  mockAddTryOnJob.mockResolvedValue(undefined);
  // Default: no remembered grant, so the client's acknowledgement is what
  // carries the request. Tests for "already granted" set this true.
  mockHasLiveTryOnConsent.mockResolvedValue(false);
  mockRecordTryOnConsent.mockResolvedValue(undefined);
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
    expect(JSON.stringify(payload)).not.toContain(
      Buffer.from('fake-jpeg-bytes').toString('base64'),
    );
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

  // ─── Consent gate (T6) ────────────────────────────────────────

  it('422 with no consent acknowledgement, and nothing is spent or enqueued', async () => {
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await post(app, undefined, { consentVersion: null });

    expect(res.statusCode).toBe(422);
    expect(res.json().error.field).toBe('consent_version');
    expect(mockAddTryOnJob).not.toHaveBeenCalled();
    expect(mockPutTryOnPhoto).not.toHaveBeenCalled();
    // Consent is checked BEFORE quota on purpose: a request that will be
    // refused must not read as "spent a credit".
    expect(mockCheckQuota).not.toHaveBeenCalled();
    await app.close();
  });

  it('422 when the acknowledgement names a superseded notice version', async () => {
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await post(app, undefined, { consentVersion: 'tryon-0.9' });

    // Recording a version the person never saw would make the stored consent
    // record a false statement, so a stale string is refused rather than
    // upgraded silently.
    expect(res.statusCode).toBe(422);
    expect(mockAddTryOnJob).not.toHaveBeenCalled();
    await app.close();
  });

  it('in-store: the job row carries IN_STORE consent and no ConsentEvent is written', async () => {
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await post(app);

    expect(res.statusCode).toBe(202);
    expect(mockJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          consent_method: 'IN_STORE',
          consent_notice_version: TRY_ON_CONSENT.version,
          consent_at: expect.any(Date),
        }),
      }),
    );
    // A walk-in has no account, so ConsentEvent — whose customer_account_id is
    // NOT NULL — structurally cannot hold this case. The job row is the record.
    expect(mockRecordTryOnConsent).not.toHaveBeenCalled();
    expect(mockHasLiveTryOnConsent).not.toHaveBeenCalled();
    await app.close();
  });

  it('a shopper with a live grant is not asked again — no version, still 202', async () => {
    mockGetPassportSession.mockResolvedValue({ customer_account_id: CUSTOMER_ID });
    mockHasLiveTryOnConsent.mockResolvedValue(true);
    const app = await buildApp();
    const res = await post(app, 'kanchuki_passport=sess_1', { consentVersion: null });

    expect(res.statusCode).toBe(202);
    expect(mockHasLiveTryOnConsent).toHaveBeenCalledWith(CUSTOMER_ID);
    expect(mockRecordTryOnConsent).not.toHaveBeenCalled();
    expect(mockJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consent_method: 'PASSPORT' }) }),
    );
    await app.close();
  });

  it('a first-time shopper grants: ConsentEvent written, job marked PASSPORT', async () => {
    mockGetPassportSession.mockResolvedValue({ customer_account_id: CUSTOMER_ID });
    const app = await buildApp();
    const res = await post(app, 'kanchuki_passport=sess_1');

    expect(res.statusCode).toBe(202);
    expect(mockRecordTryOnConsent).toHaveBeenCalledWith(
      CUSTOMER_ID,
      RETAILER_ID,
      expect.objectContaining({ ip: expect.anything() }),
    );
    expect(mockJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consent_method: 'PASSPORT' }) }),
    );
    await app.close();
  });

  it('a shopper who withdrew is asked again (the predicate reports no live grant)', async () => {
    mockGetPassportSession.mockResolvedValue({ customer_account_id: CUSTOMER_ID });
    // This is exactly what hasLiveTryOnConsent() returns once the latest event
    // is TRY_ON_CONSENT_WITHDRAWN — the lib's own ordering test covers that.
    mockHasLiveTryOnConsent.mockResolvedValue(false);
    const app = await buildApp();
    const res = await post(app, 'kanchuki_passport=sess_1', { consentVersion: null });

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
      new AppError(
        'CUSTOMER_LIMIT_EXCEEDED',
        "You've reached your limit for try on generation.",
        402,
      ),
    );
    const app = await buildApp(); // no bearer → customer path
    const res = await post(app, 'kanchuki_passport=sess_1');

    expect(res.statusCode).toBe(402);
    expect(res.json().error.code).toBe('CUSTOMER_LIMIT_EXCEEDED');
    expect(mockCheckQuota).toHaveBeenCalledWith(RETAILER_ID, 'TRY_ON_GENERATION', 1);
    expect(mockCheckCustomerQuota).toHaveBeenCalledWith(CUSTOMER_ID, 'TRY_ON_GENERATION');
    expect(mockAddTryOnJob).not.toHaveBeenCalled();
    await app.close();
  });

  it('a passport-logged-in shopper spends both counters, retailer resolved from the product', async () => {
    mockGetPassportSession.mockResolvedValue({ customer_account_id: CUSTOMER_ID });
    const app = await buildApp();
    const res = await post(app, 'kanchuki_passport=sess_1');

    expect(res.statusCode).toBe(202);
    expect(mockCheckQuota).toHaveBeenCalledWith(RETAILER_ID, 'TRY_ON_GENERATION', 1);
    expect(mockAddTryOnJob).toHaveBeenCalledWith(
      expect.objectContaining({ retailer_id: RETAILER_ID, customer_account_id: CUSTOMER_ID }),
    );
    await app.close();
  });

  // ─── F-044 R2 T1 ──────────────────────────────────────────────

  it('Bearer + passport cookie: still IN_STORE, no customer, customer quota untouched', async () => {
    mockGetPassportSession.mockResolvedValue({ customer_account_id: CUSTOMER_ID });
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await post(app, 'kanchuki_passport=sess_1');

    expect(res.statusCode).toBe(202);
    expect(mockJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ customer_account_id: null, consent_method: 'IN_STORE' }),
      }),
    );
    expect(mockCheckCustomerQuota).not.toHaveBeenCalled();
    expect(mockRecordTryOnConsent).not.toHaveBeenCalled();
    expect(mockAddTryOnJob).toHaveBeenCalledWith(
      expect.objectContaining({ customer_account_id: null }),
    );
    await app.close();
  });

  it('quota check counts recent PENDING jobs (10 min window): limit 3, used 1', async () => {
    // Mirror checkQuota's real arithmetic: used(1) + amount > limit(3) → 402.
    mockCheckQuota.mockImplementation(async (_r: string, _t: string, amount = 1) => {
      if (1 + amount > 3) throw planLimitExceeded('try on generation');
    });
    const app = await buildApp({ retailerId: RETAILER_ID });

    mockJobCount.mockResolvedValue(1);
    const ok = await post(app);
    expect(ok.statusCode).toBe(202);
    expect(mockCheckQuota).toHaveBeenLastCalledWith(RETAILER_ID, 'TRY_ON_GENERATION', 2);
    const where = mockJobCount.mock.calls[0]?.[0].where;
    expect(where).toMatchObject({ retailer_id: RETAILER_ID, status: 'PENDING' });
    const age = Date.now() - (where.created_at.gte as Date).getTime();
    expect(age).toBeGreaterThan(9 * 60_000);
    expect(age).toBeLessThan(11 * 60_000);

    mockJobCount.mockResolvedValue(2);
    const over = await post(app);
    expect(over.statusCode).toBe(402);
    expect(over.json().error.code).toBe('PLAN_LIMIT_EXCEEDED');
    await app.close();
  });
});

describe('GET /products/try-on/quota', () => {
  const get = (app: Awaited<ReturnType<typeof buildApp>>) =>
    app.inject({ method: 'GET', url: '/v1/products/try-on/quota' });

  it('owner: remaining numbers only', async () => {
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await get(app);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ used: 1, limit: 3, remaining: 2, unlimited: false });
    expect(mockGetQuotaStatus).toHaveBeenCalledWith(RETAILER_ID, 'TRY_ON_GENERATION');
    await app.close();
  });

  it('manager is allowed', async () => {
    const app = await buildApp({ retailerId: RETAILER_ID, staffRole: 'manager' });
    expect((await get(app)).statusCode).toBe(200);
    await app.close();
  });

  it('salesperson is 403 (owner rule: salesperson 403 on try-on routes)', async () => {
    const app = await buildApp({ retailerId: RETAILER_ID, staffRole: 'salesperson' });
    const res = await get(app);
    expect(res.statusCode).toBe(403);
    expect(mockGetQuotaStatus).not.toHaveBeenCalled();
    await app.close();
  });

  it('404 for a cookie-only shopper', async () => {
    mockGetPassportSession.mockResolvedValue({ customer_account_id: CUSTOMER_ID });
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/products/try-on/quota',
      headers: { cookie: 'kanchuki_passport=sess_1' },
    });
    expect(res.statusCode).toBe(404);
    expect(mockGetQuotaStatus).not.toHaveBeenCalled();
    await app.close();
  });

  it('404 when VIRTUAL_TRY_ON_V2 is off', async () => {
    mockHasFeature.mockResolvedValue(false);
    const app = await buildApp({ retailerId: RETAILER_ID });
    expect((await get(app)).statusCode).toBe(404);
    expect(mockGetQuotaStatus).not.toHaveBeenCalled();
    await app.close();
  });

  it.each(['catalog', 'support'] as const)('%s delegate is 403, quota never read', async (d) => {
    const app = await buildApp({ retailerId: RETAILER_ID, delegate: d });
    const res = await get(app);
    expect(res.statusCode).toBe(403);
    expect(mockGetQuotaStatus).not.toHaveBeenCalled();
    await app.close();
  });

  it('salesperson + flag off is 404, not 403 (route stays invisible)', async () => {
    mockHasFeature.mockResolvedValue(false);
    const app = await buildApp({ retailerId: RETAILER_ID, staffRole: 'salesperson' });
    expect((await get(app)).statusCode).toBe(404);
    await app.close();
  });

  // Route-order test deleted (T1 fix 3): the static and :id routes have
  // different literal segments, so it could not fail.
});

// RC-068 — every Bearer try-on route is owner + manager only. Delegates
// (catalog-upload, support session) have staffRole = null like an owner, so the
// role alone cannot tell them apart; one helper refuses them on all four routes.
describe('RC-068 — try-on routes refuse delegates and salesperson', () => {
  const routes = {
    'quota GET': (app: Awaited<ReturnType<typeof buildApp>>) =>
      app.inject({ method: 'GET', url: '/v1/products/try-on/quota' }),
    'discard POST': (app: Awaited<ReturnType<typeof buildApp>>) =>
      app.inject({
        method: 'POST',
        url: '/v1/products/try-on/discard',
        payload: { job_ids: ['j1'] },
      }),
    'try-on POST': (app: Awaited<ReturnType<typeof buildApp>>) => post(app),
    'status GET': (app: Awaited<ReturnType<typeof buildApp>>) =>
      app.inject({ method: 'GET', url: '/v1/products/p1/try-on/status?job_id=j1' }),
  };
  const names = Object.keys(routes) as (keyof typeof routes)[];

  beforeEach(() => {
    mockJobFindFirst.mockResolvedValue({
      status: 'FAILED',
      result_url: null,
      failure_reason: 'x',
      consent_withdrawn_at: null,
    });
  });

  for (const name of names) {
    describe(name, () => {
      it.each(['catalog', 'support'] as const)('%s delegate is 403 and touches nothing', async (d) => {
        const app = await buildApp({ retailerId: RETAILER_ID, delegate: d });
        expect((await routes[name](app)).statusCode).toBe(403);
        expect(mockProductFindFirst).not.toHaveBeenCalled();
        expect(mockJobFindFirst).not.toHaveBeenCalled();
        expect(mockJobCreate).not.toHaveBeenCalled();
        expect(mockGetQuotaStatus).not.toHaveBeenCalled();
        await app.close();
      });

      it.each(['catalog', 'support'] as const)('%s delegate + flag off is 404 (before 403)', async (d) => {
        mockHasFeature.mockResolvedValue(false);
        const app = await buildApp({ retailerId: RETAILER_ID, delegate: d });
        expect((await routes[name](app)).statusCode).toBe(404);
        await app.close();
      });

      it('owner and manager pass the role gate', async () => {
        for (const staffRole of [null, 'manager']) {
          const app = await buildApp({ retailerId: RETAILER_ID, staffRole });
          const status = (await routes[name](app)).statusCode;
          expect([403, 404]).not.toContain(status);
          await app.close();
        }
      });
    });
  }

  it.each(['quota GET', 'discard POST', 'status GET'] as const)(
    'salesperson is 403 on %s',
    async (name) => {
      const app = await buildApp({ retailerId: RETAILER_ID, staffRole: 'salesperson' });
      expect((await routes[name](app)).statusCode).toBe(403);
      await app.close();
    },
  );

  it('salesperson is 403 on POST try-on too', async () => {
    const app = await buildApp({ retailerId: RETAILER_ID, staffRole: 'salesperson' });
    expect((await routes['try-on POST'](app)).statusCode).toBe(403);
    await app.close();
  });
});

describe('POST /products/try-on/discard (F-044 R2 T2)', () => {
  const discard = (
    app: Awaited<ReturnType<typeof buildApp>>,
    body: unknown = { job_ids: ['j1'] },
  ) => app.inject({ method: 'POST', url: '/v1/products/try-on/discard', payload: body as never });

  it('deletes own-retailer in-store results and clears only the pointer', async () => {
    mockJobFindMany.mockResolvedValue([
      { id: 'j1', result_url: 'k/j1.jpg' },
      { id: 'j2', result_url: 'k/j2.jpg' },
    ]);
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await discard(app, { job_ids: ['j1', 'j2', 'foreign'] });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ discarded: 2, failed: 0, skipped: 1 });
    // Scoped to caller's retailer + in-store (passport jobs have an account id).
    expect(mockJobFindMany.mock.calls[0]?.[0].where).toEqual({
      id: { in: ['j1', 'j2', 'foreign'] },
      retailer_id: RETAILER_ID,
      customer_account_id: null,
      result_url: { not: null },
    });
    expect(mockDeleteObject.mock.calls.map((c) => c[0])).toEqual(['k/j1.jpg', 'k/j2.jpg']);
    expect(mockJobUpdateMany).toHaveBeenCalledWith({
      where: { id: 'j1', result_url: 'k/j1.jpg' },
      data: { result_url: null },
    });
    await app.close();
  });

  it('foreign / passport / unknown ids are ignored: discarded 0, not a 404', async () => {
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await discard(app);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ discarded: 0, failed: 0, skipped: 1 });
    expect(mockDeleteObject).not.toHaveBeenCalled();
    await app.close();
  });

  it('an R2 failure keeps the key (and does not abort the batch)', async () => {
    mockJobFindMany.mockResolvedValue([
      { id: 'j1', result_url: 'k/j1.jpg' },
      { id: 'j2', result_url: 'k/j2.jpg' },
    ]);
    mockDeleteObject.mockRejectedValueOnce(new Error('R2 down'));
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await discard(app, { job_ids: ['j1', 'j2'] });
    expect(res.json().data).toEqual({ discarded: 1, failed: 1, skipped: 0 });
    expect(mockJobUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockJobUpdateMany.mock.calls[0]?.[0].where.id).toBe('j2');
    await app.close();
  });

  it('updateMany rejecting counts as failed, not discarded', async () => {
    mockJobFindMany.mockResolvedValue([
      { id: 'j1', result_url: 'k/j1.jpg' },
      { id: 'j2', result_url: 'k/j2.jpg' },
    ]);
    mockJobUpdateMany.mockRejectedValueOnce(new Error('db down'));
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await discard(app, { job_ids: ['j1', 'j2'] });
    expect(res.json().data).toEqual({ discarded: 1, failed: 1, skipped: 0 });
    await app.close();
  });

  it('updateMany count 0 (raced) is not counted as discarded', async () => {
    mockJobFindMany.mockResolvedValue([{ id: 'j1', result_url: 'k/j1.jpg' }]);
    mockJobUpdateMany.mockResolvedValue({ count: 0 });
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await discard(app);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ discarded: 0, failed: 0, skipped: 0 });
    await app.close();
  });

  it('a requested id the scoped lookup did not return (e.g. still PENDING) is skipped', async () => {
    mockJobFindMany.mockResolvedValue([{ id: 'j1', result_url: 'k/j1.jpg' }]);
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await discard(app, { job_ids: ['j1', 'pending_job'] });
    expect(res.json().data).toEqual({ discarded: 1, failed: 0, skipped: 1 });
    await app.close();
  });

  it('every attempted discard failing is a 502', async () => {
    mockJobFindMany.mockResolvedValue([{ id: 'j1', result_url: 'k/j1.jpg' }]);
    mockDeleteObject.mockRejectedValue(new Error('R2 down'));
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await discard(app);
    expect(res.statusCode).toBe(502);
    await app.close();
  });

  it('manager is allowed', async () => {
    const app = await buildApp({ retailerId: RETAILER_ID, staffRole: 'manager' });
    expect((await discard(app)).statusCode).toBe(200);
    await app.close();
  });

  it('salesperson is 403', async () => {
    const app = await buildApp({ retailerId: RETAILER_ID, staffRole: 'salesperson' });
    expect((await discard(app)).statusCode).toBe(403);
    expect(mockJobFindMany).not.toHaveBeenCalled();
    await app.close();
  });

  it.each(['catalog', 'support'] as const)('%s delegate is 403', async (d) => {
    const app = await buildApp({ retailerId: RETAILER_ID, delegate: d });
    expect((await discard(app)).statusCode).toBe(403);
    expect(mockJobFindMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('404 when VIRTUAL_TRY_ON_V2 is off (even for salesperson)', async () => {
    mockHasFeature.mockResolvedValue(false);
    const app = await buildApp({ retailerId: RETAILER_ID, staffRole: 'salesperson' });
    expect((await discard(app)).statusCode).toBe(404);
    await app.close();
  });

  it('404 for a cookie-only shopper', async () => {
    mockGetPassportSession.mockResolvedValue({ customer_account_id: CUSTOMER_ID });
    const app = await buildApp();
    expect((await discard(app)).statusCode).toBe(404);
    expect(mockJobFindMany).not.toHaveBeenCalled();
    await app.close();
  });

  it.each([
    {},
    { job_ids: 'j1' },
    { job_ids: [1] },
    { job_ids: Array.from({ length: 11 }, (_, i) => `j${i}`) },
  ])('bad body %# is 422', async (body) => {
    const app = await buildApp({ retailerId: RETAILER_ID });
    expect((await discard(app, body)).statusCode).toBe(422);
    await app.close();
  });

  it('status reports discarded for a completed job whose result was discarded', async () => {
    mockJobFindFirst.mockResolvedValue({
      status: 'COMPLETED',
      result_url: null,
      failure_reason: null,
      consent_withdrawn_at: null,
    });
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/products/p1/try-on/status?job_id=j1',
    });
    expect(res.json().data).toEqual({ status: 'discarded' });
    await app.close();
  });
});

describe('POST /products/:id/try-on (request validity)', () => {

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
    // A valid consent version, deliberately: consent is checked BEFORE the
    // multipart check, so without one this would pass on the wrong arm and stop
    // covering the body-shape validation it is named for.
    const res = await app.inject({
      method: 'POST',
      url: `/v1/products/p1/try-on?consent_version=${encodeURIComponent(TRY_ON_CONSENT.version)}`,
      payload: {},
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error.field).toBe('photo');
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

  it('withdrawn when the shopper took their consent back, never processing', async () => {
    // COMPLETED with a null result_url is what a withdrawal leaves behind. The
    // COMPLETED arm needs both halves, so without the withdrawn check first
    // this fell through to `processing` and a poller waited forever for an
    // image that had been deliberately deleted.
    mockJobFindFirst.mockResolvedValue({
      status: 'COMPLETED',
      result_url: null,
      failure_reason: null,
      consent_withdrawn_at: new Date(),
    });
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/products/p1/try-on/status?job_id=tryon_1',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ status: 'withdrawn' });
    expect(mockGetDownloadPresignedUrl).not.toHaveBeenCalled();
    await app.close();
  });

  it('processing while pending', async () => {
    mockJobFindFirst.mockResolvedValue({
      status: 'PENDING',
      result_url: null,
      failure_reason: null,
    });
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
    mockJobFindFirst.mockResolvedValue({
      status: 'PENDING',
      result_url: null,
      failure_reason: null,
    });
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

describe('E6 — customer try-on switched off (CUSTOMER_TRY_ON_ENABLED = false)', () => {
  beforeEach(() => {
    flags.customerTryOn = false;
  });

  it('ships OFF — the real constant, not the mock', async () => {
    const actual = await vi.importActual<typeof import('../lib/features.js')>('../lib/features.js');
    expect(actual.CUSTOMER_TRY_ON_ENABLED).toBe(false);
  });

  it('cookie-only POST is 404 and nothing is looked up, spent or enqueued', async () => {
    mockGetPassportSession.mockResolvedValue({ customer_account_id: CUSTOMER_ID });
    const app = await buildApp();
    const res = await post(app, 'kanchuki_passport=sess_1');

    expect(res.statusCode).toBe(404);
    expect(mockProductFindFirst).not.toHaveBeenCalled();
    expect(mockCheckQuota).not.toHaveBeenCalled();
    expect(mockAddTryOnJob).not.toHaveBeenCalled();
    await app.close();
  });

  it('anonymous POST is 404 too — the route stays invisible', async () => {
    const app = await buildApp();
    const res = await post(app);

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('cookie-only status poll is 404 and no job is read', async () => {
    mockGetPassportSession.mockResolvedValue({ customer_account_id: CUSTOMER_ID });
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/products/p1/try-on/status?job_id=tryon_1',
      headers: { cookie: 'kanchuki_passport=sess_1' },
    });

    expect(res.statusCode).toBe(404);
    expect(mockJobFindFirst).not.toHaveBeenCalled();
    await app.close();
  });

  it('in-store (Bearer retailer/manager) POST and status are unchanged', async () => {
    const app = await buildApp({ retailerId: RETAILER_ID });
    const res = await post(app);
    expect(res.statusCode).toBe(202);

    mockJobFindFirst.mockResolvedValue({
      status: 'PENDING',
      result_url: null,
      failure_reason: null,
    });
    const status = await app.inject({
      method: 'GET',
      url: '/v1/products/p1/try-on/status?job_id=tryon_1',
    });
    expect(status.statusCode).toBe(200);
    expect(status.json().data.status).toBe('processing');
    await app.close();
  });
});
