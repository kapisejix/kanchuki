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
    failWith(429, {
      error: {
        status: 'RESOURCE_EXHAUSTED',
        details: [{ reason: 'RATE_LIMIT_EXCEEDED', metadata: { quota_limit_value: '0' } }],
      },
    });
    await expectCode(gbp.listReviews('a', 'l'), 'NOT_APPROVED');
    failWith(429, {
      error: { status: 'RESOURCE_EXHAUSTED', message: "Quota exceeded for limit 'x' limit 0" },
    });
    await expectCode(gbp.listReviews('a', 'l'), 'NOT_APPROVED');
    failWith(403, { error: { status: 'SERVICE_DISABLED' } });
    await expectCode(gbp.listReviews('a', 'l'), 'NOT_APPROVED');
  });

  it('API disabled reported as PERMISSION_DENIED + details reason → NOT_APPROVED, not NEEDS_ACCESS', async () => {
    failWith(403, {
      error: { status: 'PERMISSION_DENIED', details: [{ reason: 'SERVICE_DISABLED' }] },
    });
    await expectCode(gbp.listReviews('a', 'l'), 'NOT_APPROVED');
    failWith(403, {
      error: { status: 'PERMISSION_DENIED', errors: [{ reason: 'SERVICE_DISABLED' }] },
    });
    await expectCode(gbp.listReviews('a', 'l'), 'NOT_APPROVED');
  });

  it('an ordinary per-minute 429 is a transient outage, not "not approved"', async () => {
    failWith(429, {
      error: {
        status: 'RESOURCE_EXHAUSTED',
        message: 'Quota exceeded for requests per minute',
        details: [{ metadata: { quota_limit_value: '300' } }],
      },
    });
    await expectCode(gbp.listReviews('a', 'l'), 'UNAVAILABLE');
    failWith(429, {});
    await expectCode(gbp.listReviews('a', 'l'), 'UNAVAILABLE');
  });

  it('a token missing the business.manage scope is a platform problem, not a lost location', async () => {
    failWith(403, {
      error: {
        status: 'PERMISSION_DENIED',
        details: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }],
      },
    });
    await expectCode(gbp.listReviews('a', 'l'), 'TOKEN_REVOKED');
  });

  it('permission denied on a location → NEEDS_ACCESS; a missing resource → NOT_FOUND', async () => {
    failWith(403, { error: { status: 'PERMISSION_DENIED' } });
    await expectCode(gbp.listReviews('a', 'l'), 'NEEDS_ACCESS');
    failWith(404, {});
    await expectCode(gbp.listReviews('a', 'l'), 'NOT_FOUND');
    failWith(404, { error: { status: 'NOT_FOUND' } });
    await expectCode(gbp.replyToReview('a', 'l', 'gone', 'Thanks'), 'NOT_FOUND');
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

// Audit #4: accounts were read once with pageSize=20 and never paged, and every picker open and
// every link re-walked all accounts and locations against Google's low per-minute quota.
describe('listLocations', () => {
  const locBody = (name: string) => ({ locations: [{ name: `locations/${name}`, title: name }] });
  const handler = (c: FetchCall) => {
    if (isToken(c)) return TOKEN_OK;
    if (c.url.includes('/accounts?') && !c.url.includes('pageToken=t2')) {
      return { status: 200, body: { accounts: [{ name: 'accounts/1' }], nextPageToken: 't2' } };
    }
    if (c.url.includes('/accounts?')) {
      return { status: 200, body: { accounts: [{ name: 'accounts/2' }] } };
    }
    return { status: 200, body: locBody(c.url.includes('accounts/1/') ? 'locA' : 'locB') };
  };
  const googleCalls = () => calls.filter((c) => !isToken(c)).length;

  it('follows the accounts page token instead of stopping at the first page', async () => {
    stubFetch(handler);
    const out = await gbp.listLocations();
    expect(out.map((l) => `${l.account}/${l.location}`)).toEqual(['1/locA', '2/locB']);
  });

  it('a second call inside five minutes is served from memory, no Google call', async () => {
    stubFetch(handler);
    await gbp.listLocations();
    const before = googleCalls();
    await gbp.listLocations();
    expect(googleCalls()).toBe(before);
  });

  it('refetches once the five minutes are up', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      stubFetch(handler);
      await gbp.listLocations();
      const before = googleCalls();
      vi.setSystemTime(Date.now() + 5 * 60_000 + 1);
      await gbp.listLocations();
      expect(googleCalls()).toBeGreaterThan(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failure is not cached: the next call asks Google again', async () => {
    stubFetch((c) => (isToken(c) ? TOKEN_OK : { status: 403, body: {} }));
    await gbp.listLocations().catch(() => {});
    stubFetch(handler);
    const out = await gbp.listLocations();
    expect(out).toHaveLength(2);
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

/**
 * Audit minor C: concurrent callers each POSTed to Google's token endpoint, and a late 401 from an
 * OLD token wiped a token another request had just refreshed, forcing yet another refresh.
 */
describe('access token refresh (audit minor C)', () => {
  type Pending = { bearer: string; resolve: (r: { status: number; body: unknown }) => void };
  let pending: Pending[];
  let tokenPosts: number;

  beforeEach(() => {
    pending = [];
    tokenPosts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes('oauth2.googleapis.com/token')) {
          tokenPosts++;
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ access_token: `at_${tokenPosts}`, expires_in: 3600 }),
          });
        }
        const bearer = String((init?.headers as Record<string, string>).Authorization);
        return new Promise((res) =>
          pending.push({
            bearer,
            resolve: (r) =>
              res({
                ok: r.status >= 200 && r.status < 300,
                status: r.status,
                json: async () => r.body,
              }),
          }),
        );
      }),
    );
  });

  it('three concurrent callers share one token refresh', async () => {
    const all = [gbp.listReviews('a', 'l'), gbp.listReviews('a', 'l'), gbp.listReviews('a', 'l')];
    await vi.waitFor(() => expect(pending).toHaveLength(3));
    expect(tokenPosts).toBe(1);
    for (const p of pending) p.resolve({ status: 200, body: { reviews: [] } });
    await Promise.all(all);
  });

  it('a late 401 from an old token does not wipe the fresh token', async () => {
    const a = gbp.listReviews('a', 'l').catch(() => undefined);
    const b = gbp.listReviews('a', 'l').catch(() => undefined);
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    expect(pending.map((p) => p.bearer)).toEqual(['Bearer at_1', 'Bearer at_1']);

    pending[0]?.resolve({ status: 401, body: {} }); // A: legitimately clears at_1
    await a;
    const c = gbp.listReviews('a', 'l'); // refreshes to at_2
    await vi.waitFor(() => expect(pending).toHaveLength(3));
    expect(pending[2]?.bearer).toBe('Bearer at_2');

    pending[1]?.resolve({ status: 401, body: {} }); // B: late 401, still holding at_1
    await b;
    const d = gbp.listReviews('a', 'l'); // must reuse at_2, no third refresh
    await vi.waitFor(() => expect(pending).toHaveLength(4));
    expect(pending[3]?.bearer).toBe('Bearer at_2');
    expect(tokenPosts).toBe(2);

    pending[2]?.resolve({ status: 200, body: { reviews: [] } });
    pending[3]?.resolve({ status: 200, body: { reviews: [] } });
    await Promise.all([c, d]);
  });
});

describe('connected email (audit minor B)', () => {
  it('a cleared (empty) stored email is "no email", so no wrong Manager address is shown', async () => {
    m.secrets.GBP_CONNECTED_EMAIL = '';
    m.secrets.GBP_MANAGER_EMAIL = undefined;
    expect(await gbp.gbpConnectedEmail()).toBeNull();
    expect(await gbp.gbpManagerEmail()).toBeNull();
  });
});
