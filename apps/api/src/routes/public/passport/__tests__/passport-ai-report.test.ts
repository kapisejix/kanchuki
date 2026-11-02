// POST /v1/public/passport/ai-report — verified-session only, identity from the session,
// closed feature list, per-account daily cap, text only.
import { createHash } from 'node:crypto';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../../plugins/error-handler.js';
import { passportAiReportRoutes } from '../passport-ai-report.js';

const m = vi.hoisted(() => ({
  sessionFind: vi.fn(),
  sessionUpdate: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    passportSession: { findUnique: m.sessionFind, update: m.sessionUpdate },
    aiContentReport: { count: m.count, create: m.create },
  },
  Prisma: {},
}));

const COOKIE = 'kanchuki_passport=sess_a';
const OK = { feature: 'AI Stylist', description: 'It showed something offensive' };

beforeEach(() => {
  vi.clearAllMocks();
  m.sessionFind.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === createHash('sha256').update('sess_a').digest('hex')
      ? {
          id: 'sess_a',
          customer_account_id: 'acct_a',
          revoked_at: null,
          expires_at: new Date(Date.now() + 86_400_000),
          customer_account: { id: 'acct_a', deleted_at: null },
        }
      : null,
  );
  m.sessionUpdate.mockResolvedValue({});
  m.count.mockResolvedValue(0);
  m.create.mockResolvedValue({ id: 'rep_1' });
});

function post(payload: unknown, cookie?: string) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.register(passportAiReportRoutes, { prefix: '/v1/public/passport' });
  return app.inject({
    method: 'POST',
    url: '/v1/public/passport/ai-report',
    payload: payload as object,
    headers: cookie ? { cookie } : {},
  });
}

describe('POST /passport/ai-report', () => {
  it('201 without a session stores an anonymous report (AI Stylist has no sign-in)', async () => {
    const res = await post(OK);
    expect(res.statusCode).toBe(201);
    expect(m.create.mock.calls[0]?.[0].data.customer_account_id).toBeNull();
  });

  it('anonymous reports are capped per hour as one class', async () => {
    m.count.mockResolvedValue(100);
    const res = await post(OK);
    expect(res.statusCode).toBe(429);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.count.mock.calls[0]?.[0].where.customer_account_id).toBeNull();
  });

  it('201 stores the report under the session account, ignoring any body identity', async () => {
    const res = await post(
      { ...OK, content_ref: 'store-slug', customer_account_id: 'acct_evil' },
      COOKIE,
    );
    expect(res.statusCode).toBe(201);
    expect(m.create).toHaveBeenCalledWith({
      data: {
        customer_account_id: 'acct_a',
        feature: 'AI Stylist',
        content_ref: 'store-slug',
        description: 'It showed something offensive',
      },
      select: { id: true },
    });
  });

  it('400 for an unknown feature label', async () => {
    const res = await post({ ...OK, feature: 'Anything I like' }, COOKIE);
    expect(res.statusCode).toBe(400);
    expect(m.create).not.toHaveBeenCalled();
  });

  it('400 for a too-short description', async () => {
    const res = await post({ ...OK, description: 'bad' }, COOKIE);
    expect(res.statusCode).toBe(400);
  });

  it('429 once the account has 20 reports in 24 h', async () => {
    m.count.mockResolvedValue(20);
    const res = await post(OK, COOKIE);
    expect(res.statusCode).toBe(429);
    expect(m.create).not.toHaveBeenCalled();
  });
});
