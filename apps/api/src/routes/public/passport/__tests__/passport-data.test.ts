/**
 * RC-099: POST /passport/delete must anonymise the account's reviews too (DPDP erasure):
 * the FK SET NULL only fires on a hard delete.
 */
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../../plugins/error-handler.js';
import { passportDataRoutes } from '../passport-data.js';

const m = vi.hoisted(() => ({
  session: vi.fn(),
  consent: vi.fn(),
  accountUpdate: vi.fn(),
  pushUpdateMany: vi.fn(),
  sessionUpdateMany: vi.fn(),
  prUpdateMany: vi.fn(),
  srUpdateMany: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    consentEvent: { create: m.consent },
    customerAccount: { update: m.accountUpdate },
    customerPushSubscription: { updateMany: m.pushUpdateMany },
    passportSession: { updateMany: m.sessionUpdateMany },
    productReview: { updateMany: m.prUpdateMany },
    storeReview: { updateMany: m.srUpdateMany },
  },
}));
vi.mock('../passport-helpers.js', () => ({
  getPassportSession: m.session,
  COOKIE_NAME: 'kanchuki_passport',
  COOKIE_DOMAIN: 'kanchuki.app',
  COOKIE_SECURE: false,
  CURRENT_NOTICE_VERSION: 'v1',
}));

beforeEach(() => {
  vi.resetAllMocks();
  m.session.mockResolvedValue({ customer_account_id: 'ca_1' });
});

async function del() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(passportDataRoutes, { prefix: '/v1/public/passport' });
  await app.ready();
  return app.inject({
    method: 'POST',
    url: '/v1/public/passport/delete',
    headers: { cookie: 'kanchuki_passport=s1' },
  });
}

describe('POST /passport/delete — reviews', () => {
  it('clears display_name, comment and the account link on BOTH review tables, only for this account', async () => {
    const res = await del();
    expect(res.statusCode).toBe(200);
    const expected = {
      where: { customer_account_id: 'ca_1' },
      data: { display_name: null, comment: null, customer_account_id: null },
    };
    expect(m.prUpdateMany).toHaveBeenCalledWith(expected);
    expect(m.srUpdateMany).toHaveBeenCalledWith(expected);
  });

  it('401 without a session and touches no review', async () => {
    m.session.mockResolvedValue(null);
    expect((await del()).statusCode).toBe(401);
    expect(m.prUpdateMany).not.toHaveBeenCalled();
    expect(m.srUpdateMany).not.toHaveBeenCalled();
  });
});
