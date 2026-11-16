// F-045 spec step 2: POST /my-style/measurements saves self-entered centimetres on the
// signed-in shopper's own account. Shopper-only data: no session, no write; bad values are 422.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';

const m = vi.hoisted(() => ({ session: vi.fn(), update: vi.fn() }));

vi.mock('@kanchuki/db', () => ({ prisma: { customerAccount: { update: m.update } } }));
vi.mock('@kanchuki/ai', () => ({ hasConfiguredVisionProvider: vi.fn(), deleteObject: vi.fn() }));
vi.mock('../passport/passport-helpers.js', () => ({ getPassportSession: m.session }));
vi.mock('../../../jobs/index.js', () => ({ addMyStyleAnalyzeJob: vi.fn() }));
vi.mock('../../../lib/quota.js', () => ({
  checkCustomerQuota: vi.fn(),
  reserveCustomerJobQuota: vi.fn(),
  refundCustomerJobQuota: vi.fn(),
}));

import { publicMyStyleAnalyzeRoutes } from '../public-my-style-analyze.js';

beforeEach(() => {
  vi.resetAllMocks();
  m.session.mockResolvedValue({ customer_account_id: 'ca_1' });
  m.update.mockResolvedValue({});
});

async function post(body: unknown) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(publicMyStyleAnalyzeRoutes, { prefix: '/v1/public/my-style' });
  await app.ready();
  return app.inject({
    method: 'POST',
    url: '/v1/public/my-style/measurements',
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
