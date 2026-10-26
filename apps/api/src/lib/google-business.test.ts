/**
 * Google Business Profile client (Part B2): every failure is a typed GbpError, reads retry on
 * 5xx but writes never do, and there is no way to create a review.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ secrets: {} as Record<string, string | undefined> }));

vi.mock('@kanchuki/db', () => ({
  getSecret: async (k: string) => m.secrets[k],
  encryptSecret: (v: string) => `enc(${v})`,
  maskSecret: () => '••••',
  invalidateSecret: vi.fn(),
  prisma: { integrationSetting: { upsert: vi.fn() } },
}));

import * as gbp from './google-business.js';

type FetchCall = { url: string; method: string; body?: string };
let calls: FetchCall[];

function stubFetch(handler: (c: FetchCall) => { status: number; body: unknown }) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = { url, method: init?.method ?? 'GET', body: init?.body?.toString() };
      calls.push(call);
      const r = handler(call);
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
    }),
  );
}

const TOKEN_OK = { status: 200, body: { access_token: 'at', expires_in: 3600 } };
const isToken = (c: FetchCall) => c.url.includes('oauth2.googleapis.com/token');

beforeEach(() => {
  gbp.__resetGbpTokenCache();
  m.secrets = {
    GOOGLE_GBP_CLIENT_ID: 'cid',
    GOOGLE_GBP_CLIENT_SECRET: 'sec',
    GOOGLE_GBP_REDIRECT_URI: 'https://x/admin/gbp',
    GBP_REFRESH_TOKEN: 'rt',
  };
});
afterEach(() => vi.unstubAllGlobals());

const expectCode = async (p: Promise<unknown>, code: string) => {
  const err = await p.then(
    () => null,
    (e) => e,
  );
  expect(err).toBeInstanceOf(gbp.GbpError);
  expect((err as gbp.GbpError).code).toBe(code);
};

describe('listReviews', () => {
  it('maps stars, replies and dates; skips malformed rows instead of inventing data', async () => {
    stubFetch((c) =>
      isToken(c)
        ? TOKEN_OK
        : {
            status: 200,
            body: {
              averageRating: 4.5,
              totalReviewCount: 12,
              reviews: [
                {
                  reviewId: 'r1',
                  reviewer: { displayName: 'Asha' },
                  starRating: 'FIVE',
                  comment: 'Lovely',
                  createTime: '2026-10-01T10:00:00Z',
                  updateTime: '2026-10-02T10:00:00Z',
                  reviewReply: { comment: 'Thanks', updateTime: '2026-10-03T10:00:00Z' },
                },
                { reviewId: 'bad', starRating: 'SIX', createTime: 'x', updateTime: 'y' },
                { starRating: 'ONE', createTime: 'x', updateTime: 'y' },
              ],
            },
          },
    );
    const res = await gbp.listReviews('acc1', 'loc1');
    expect(res.averageRating).toBe(4.5);
    expect(res.reviews).toHaveLength(1);
    expect(res.reviews[0]).toMatchObject({
      reviewId: 'r1',
      reviewerName: 'Asha',
      starRating: 5,
      replyComment: 'Thanks',
    });
    expect(calls.find((c) => !isToken(c))?.url).toContain(
      '/v4/accounts/acc1/locations/loc1/reviews',
    );
  });
});

describe('error classification', () => {
  const failWith = (status: number, errBody: unknown) =>
    stubFetch((c) => (isToken(c) ? TOKEN_OK : { status, body: errBody }));

  it('quota 0 / API disabled → NOT_APPROVED', async () => {
    failWith(429, { error: { status: 'RESOURCE_EXHAUSTED' } });
    await expectCode(gbp.listReviews('a', 'l'), 'NOT_APPROVED');
    failWith(403, { error: { status: 'SERVICE_DISABLED' } });
    gbp.__resetGbpTokenCache();
    await expectCode(gbp.listReviews('a', 'l'), 'NOT_APPROVED');
  });

  it('permission denied / not found on a location → NEEDS_ACCESS', async () => {
    failWith(403, { error: { status: 'PERMISSION_DENIED' } });
    await expectCode(gbp.listReviews('a', 'l'), 'NEEDS_ACCESS');
    failWith(404, {});
    await expectCode(gbp.listReviews('a', 'l'), 'NEEDS_ACCESS');
  });

  it('invalid_grant on refresh → TOKEN_REVOKED', async () => {
    stubFetch(() => ({ status: 400, body: { error: 'invalid_grant' } }));
    await expectCode(gbp.listReviews('a', 'l'), 'TOKEN_REVOKED');
  });

  it('no stored refresh token → NOT_CONNECTED', async () => {
    m.secrets.GBP_REFRESH_TOKEN = undefined;
    stubFetch(() => TOKEN_OK);
    await expectCode(gbp.listReviews('a', 'l'), 'NOT_CONNECTED');
  });

  it('a GET retries a 5xx once; a PUT never does', async () => {
    failWith(500, {});
    await expectCode(gbp.listReviews('a', 'l'), 'UNAVAILABLE');
    expect(calls.filter((c) => !isToken(c))).toHaveLength(2);

    failWith(500, {});
    await expectCode(gbp.replyToReview('a', 'l', 'r1', 'Thanks'), 'UNAVAILABLE');
    expect(calls.filter((c) => !isToken(c) && c.method === 'PUT')).toHaveLength(1);
  });

  it('a network failure is UNAVAILABLE, never an empty result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    await expectCode(gbp.listReviews('a', 'l'), 'UNAVAILABLE');
  });
});

describe('replyToReview', () => {
  it('PUTs the reply and returns what Google confirmed', async () => {
    stubFetch((c) =>
      isToken(c)
        ? TOKEN_OK
        : { status: 200, body: { comment: 'Thanks!', updateTime: '2026-10-05T00:00:00Z' } },
    );
    const res = await gbp.replyToReview('a', 'l', 'r1', 'Thanks!');
    expect(res.comment).toBe('Thanks!');
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.url).toContain('/reviews/r1/reply');
    expect(JSON.parse(put?.body ?? '{}')).toEqual({ comment: 'Thanks!' });
  });

  it('a 2xx without the reply echoed back is NOT success', async () => {
    stubFetch((c) => (isToken(c) ? TOKEN_OK : { status: 200, body: {} }));
    await expectCode(gbp.replyToReview('a', 'l', 'r1', 'Thanks!'), 'UNAVAILABLE');
  });
});

describe('never creates a review for anyone', () => {
  it('exports no review-creating function and issues no POST to a reviews URL', async () => {
    const names = Object.keys(gbp);
    expect(names.filter((n) => /(create|post|submit|write|add)\w*review/i.test(n))).toEqual([]);

    stubFetch((c) =>
      isToken(c)
        ? TOKEN_OK
        : c.url.includes('/accounts?')
          ? { status: 200, body: { accounts: [] } }
          : { status: 200, body: { reviews: [], comment: 'ok' } },
    );
    await gbp.listReviews('a', 'l');
    await gbp.replyToReview('a', 'l', 'r', 'ok');
    await gbp.listLocations();
    expect(calls.filter((c) => c.method === 'POST' && c.url.includes('/reviews'))).toEqual([]);
  });
});
