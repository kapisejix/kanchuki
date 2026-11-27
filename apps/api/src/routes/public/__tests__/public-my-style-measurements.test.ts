// F-045 spec step 2: POST /my-style/measurements saves self-entered centimetres on the
// signed-in shopper's own account. Shopper-only data: no session, no write; bad values are 422.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';

const m = vi.hoisted(() => ({
  session: vi.fn(),
  update: vi.fn(),
  consentFind: vi.fn(),
  consentCreate: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    customerAccount: { update: m.update },
    consentEvent: { findFirst: m.consentFind, create: m.consentCreate },
  },
}));
vi.mock('@kanchuki/ai', () => ({ hasConfiguredVisionProvider: vi.fn(), deleteObject: vi.fn() }));
vi.mock('../passport/passport-helpers.js', () => ({ getPassportSession: m.session }));
vi.mock('../../../jobs/index.js', () => ({ addMyStyleAnalyzeJob: vi.fn() }));
vi.mock('../../../lib/quota.js', () => ({
  checkCustomerQuota: vi.fn(),
  reserveCustomerJobQuota: vi.fn(),
  refundCustomerJobQuota: vi.fn(),
}));

import { STYLE_PROFILE_CLEARED } from '../../../lib/my-style-consent.js';
import { publicMyStyleAnalyzeRoutes } from '../public-my-style-analyze.js';

beforeEach(() => {
  vi.resetAllMocks();
  m.session.mockResolvedValue({ customer_account_id: 'ca_1' });
  m.update.mockResolvedValue({});
  m.consentCreate.mockResolvedValue({});
  // Default: a live grant exists, so the original tests keep exercising the save itself.
  m.consentFind.mockResolvedValue({ kind: 'MY_STYLE_BODY_CONSENTED' });
});

async function post(body: unknown, url = '/v1/public/my-style/measurements') {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(publicMyStyleAnalyzeRoutes, { prefix: '/v1/public/my-style' });
  await app.ready();
  return app.inject({
    method: 'POST',
    url,
    payload: body as object,
  });
}

describe('POST /my-style/measurements', () => {
  it("saves the given centimetres on the caller's own account and stamps the time", async () => {
    const res = await post({ height_cm: 163, bust_cm: 88, waist_cm: 72, hip_cm: 96 });
    expect(res.statusCode).toBe(200);
    const arg = m.update.mock.calls[0]![0];
    expect(arg.where).toEqual({ id: 'ca_1' });
    expect(arg.data).toMatchObject({ height_cm: 163, bust_cm: 88, waist_cm: 72, hip_cm: 96 });
    expect(arg.data.measurements_at).toBeInstanceOf(Date);
    expect(res.json().data.measurements).toMatchObject({ height_cm: 163, hip_cm: 96 });
  });

  it('changes only the fields sent, and null clears one', async () => {
    await post({ waist_cm: null });
    const data = m.update.mock.calls[0]![0].data;
    expect(data.waist_cm).toBeNull();
    expect(data).not.toHaveProperty('height_cm');
  });

  it.each([
    ['height below range', { height_cm: 99 }],
    ['height above range', { height_cm: 221 }],
    ['bust above range', { bust_cm: 161 }],
    ['not a whole number', { hip_cm: 96.5 }],
    ['a string', { waist_cm: '72' }],
    ['an unknown field (weight is never stored)', { weight_kg: 60 }],
    ['an empty body', {}],
  ])('rejects %s with 422 and writes nothing', async (_n, body) => {
    const res = await post(body);
    expect(res.statusCode).toBe(422);
    expect(m.update).not.toHaveBeenCalled();
  });

  it('saves a usual size alone without stamping measurements_at', async () => {
    const res = await post({ usual_size: 'M' });
    expect(res.statusCode).toBe(200);
    expect(m.update.mock.calls[0]![0].data).toEqual({ usual_size: 'M' });
  });

  it('usual_size: null alone clears it (counts as a sent field)', async () => {
    const res = await post({ usual_size: null });
    expect(res.statusCode).toBe(200);
    expect(m.update.mock.calls[0]![0].data).toEqual({ usual_size: null });
  });

  it.each(['5XL', 'FREE', 'm'])(
    'rejects usual_size %s with 422 and writes nothing',
    async (size) => {
      const res = await post({ usual_size: size });
      expect(res.statusCode).toBe(422);
      expect(m.update).not.toHaveBeenCalled();
    },
  );

  it('erasure and "Clear my data" also null the usual size', () => {
    expect(STYLE_PROFILE_CLEARED).toHaveProperty('usual_size', null);
  });

  it('401 without a session and writes nothing', async () => {
    m.session.mockResolvedValue(null);
    const res = await post({ height_cm: 163 });
    expect(res.statusCode).toBe(401);
    expect(m.update).not.toHaveBeenCalled();
  });

  it('is never cached', async () => {
    const res = await post({ height_cm: 163 });
    expect(res.headers['cache-control']).toBe('private, no-store');
  });
});

// Separate consent step: measurements are body data, so they have their own notice, version and
// grant/withdraw events, independent of the photo consent.
describe('measurements consent', () => {
  const BODY_VERSION = 'mystyle-body-1.1';

  it('refuses to save with no live consent and no consent_version, and writes nothing', async () => {
    m.consentFind.mockResolvedValue(null);
    const res = await post({ height_cm: 163 });
    expect(res.statusCode).toBe(422);
    expect(m.update).not.toHaveBeenCalled();
    expect(m.consentCreate).not.toHaveBeenCalled();
  });

  it('refuses a stale or made-up consent_version', async () => {
    m.consentFind.mockResolvedValue(null);
    const res = await post({ height_cm: 163, consent_version: 'mystyle-body-0.1' });
    expect(res.statusCode).toBe(422);
    expect(m.update).not.toHaveBeenCalled();
  });

  it('records the grant for the CURRENT version, then saves', async () => {
    m.consentFind.mockResolvedValue(null);
    const res = await post({ height_cm: 163, consent_version: BODY_VERSION });
    expect(res.statusCode).toBe(200);
    expect(m.consentCreate.mock.calls[0]![0].data).toMatchObject({
      customer_account_id: 'ca_1',
      kind: 'MY_STYLE_BODY_CONSENTED',
      notice_version: BODY_VERSION,
    });
    expect(m.update).toHaveBeenCalledTimes(1);
    // the version is consent plumbing, never a measurement column
    expect(m.update.mock.calls[0]![0].data).not.toHaveProperty('consent_version');
  });

  it('a live grant is remembered: no version needed, no second event', async () => {
    const res = await post({ bust_cm: 88 });
    expect(res.statusCode).toBe(200);
    expect(m.consentCreate).not.toHaveBeenCalled();
  });

  it('is independent of the photo consent: a live PHOTO grant does not unlock measurements', async () => {
    m.consentFind.mockImplementation(async (arg: { where: { kind: { in: string[] } } }) =>
      arg.where.kind.in.includes('MY_STYLE_PHOTO_CONSENTED')
        ? { kind: 'MY_STYLE_PHOTO_CONSENTED' }
        : null,
    );
    const res = await post({ height_cm: 163 });
    expect(res.statusCode).toBe(422);
    expect(m.update).not.toHaveBeenCalled();
  });

  it('POST /measurements/withdraw logs the withdrawal and nulls every measurement column', async () => {
    const res = await post({}, '/v1/public/my-style/measurements/withdraw');
    expect(res.statusCode).toBe(200);
    expect(res.json().data.ok).toBe(true);
    expect(m.consentCreate.mock.calls[0]![0].data.kind).toBe('MY_STYLE_BODY_CONSENT_WITHDRAWN');
    expect(m.update.mock.calls[0]![0].data).toEqual({
      height_cm: null,
      bust_cm: null,
      waist_cm: null,
      hip_cm: null,
      measurements_at: null,
      usual_size: null,
    });
  });

  it('a usual size alone still needs the body consent', async () => {
    m.consentFind.mockResolvedValue(null);
    const res = await post({ usual_size: 'M' });
    expect(res.statusCode).toBe(422);
    expect(m.update).not.toHaveBeenCalled();
  });

  it('withdraw needs a session', async () => {
    m.session.mockResolvedValue(null);
    const res = await post({}, '/v1/public/my-style/measurements/withdraw');
    expect(res.statusCode).toBe(401);
    expect(m.consentCreate).not.toHaveBeenCalled();
  });
});
