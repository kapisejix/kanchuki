// F-043 Task 2 — publish tick + token health. In-memory stand-in for the three
// tables the tick touches; updateMany implements real WHERE-status CAS
// semantics so the claim race is exercised, not asserted by mock call count.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;
const NOW = new Date('2026-10-16T10:00:00Z');
const min = (n: number) => new Date(NOW.getTime() - n * 60_000);

const db = vi.hoisted(() => ({
  posts: [] as Record<string, any>[],
  plans: [] as Record<string, any>[],
  accounts: [] as Record<string, any>[],
  socialPosts: [] as Record<string, any>[],
  retailer: { plan_status: 'ACTIVE', is_suspended: false } as Record<string, any>,
  photos: [] as Record<string, any>[],
}));
const mocks = vi.hoisted(() => ({
  hasFeature: vi.fn(),
  checkQuota: vi.fn(),
  incrementUsage: vi.fn(),
  publishPhotoPost: vi.fn(),
  publishFacebookCarousel: vi.fn(),
  publishInstagramCarousel: vi.fn(),
  publishInstagramPhoto: vi.fn(),
  createPostedRowWithRetry: vi.fn(),
}));

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'plan') return matches(db.plans.find((p) => p.id === row.plan_id) ?? {}, v);
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const r = row[k] as Date | number | undefined;
      if ('lt' in v) return r != null && r < v.lt;
      if ('lte' in v) return r != null && r <= v.lte;
      if ('in' in v) return v.in.includes(row[k]);
      return true;
    }
    return row[k] === v;
  });
}
function apply(row: Row, data: Row) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && 'increment' in v) row[k] += v.increment;
    else if (v && typeof v === 'object' && 'decrement' in v) row[k] -= v.decrement;
    else row[k] = v;
  }
}

vi.mock('@kanchuki/db', () => ({
  prisma: {
    scheduledPost: {
      updateMany: vi.fn(async ({ where, data }: Row) => {
        const hit = db.posts.filter((r) => matches(r, where));
        for (const r of hit) apply(r, data);
        return { count: hit.length };
      }),
      findMany: vi.fn(async ({ where, take }: Row) =>
        db.posts.filter((r) => matches(r, where)).slice(0, take),
      ),
      findFirstOrThrow: vi.fn(async ({ where }: Row) => {
        const r = db.posts.find((p) => p.id === where.id);
        const plan = db.plans.find((p) => p.id === r?.plan_id);
        return {
          ...r,
          plan: { ...plan, account: db.accounts.find((a) => a.id === plan?.social_account_id) },
        };
      }),
    },
    postSchedulePlan: {
      updateMany: vi.fn(async ({ where, data }: Row) => {
        const { OR, ...rest } = where;
        const hit = db.plans.filter((p) => {
          if (OR) {
            const acct = db.accounts.find((a) => a.id === p.social_account_id) ?? {};
            const dead = OR.some(
              (c: Row) =>
                ('is_active' in c.account && acct.is_active === c.account.is_active) ||
                ('token_expires_at' in c.account &&
                  acct.token_expires_at != null &&
                  acct.token_expires_at <= c.account.token_expires_at.lte),
            );
            if (!dead) return false;
          }
          return matches(p, rest);
        });
        for (const p of hit) apply(p, data);
        return { count: hit.length };
      }),
    },
    retailer: { findUniqueOrThrow: vi.fn(async () => db.retailer) },
    productPhoto: { findMany: vi.fn(async () => db.photos) },
    socialPost: {
      findFirst: vi.fn(
        async ({ where }: Row) =>
          db.socialPosts.find((s) => s.client_post_id === where.client_post_id) ?? null,
      ),
    },
  },
}));
vi.mock('../lib/features.js', () => ({ hasFeature: mocks.hasFeature }));
vi.mock('../lib/quota.js', () => ({
  checkQuota: mocks.checkQuota,
  incrementUsage: mocks.incrementUsage,
}));
vi.mock('../lib/meta-graph.js', async (orig) => ({
  ...(await orig<typeof import('../lib/meta-graph.js')>()),
  publishPhotoPost: mocks.publishPhotoPost,
  publishFacebookCarousel: mocks.publishFacebookCarousel,
  publishInstagramCarousel: mocks.publishInstagramCarousel,
}));
vi.mock('../routes/retailers/retailers-social/retailers-social-helpers.js', () => ({
  publishInstagramPhoto: mocks.publishInstagramPhoto,
}));
vi.mock('../routes/retailers/retailers-social/retailers-social-fanout-rows.js', () => ({
  accountToken: () => 'tok',
  createPostedRowWithRetry: mocks.createPostedRowWithRetry,
}));

import { MetaApiError } from '../lib/meta-graph.js';
import { AppError } from '../plugins/error-handler.js';
import {
  REASON,
  classifyFailure,
  handleSchedulePublishTick,
  handleScheduleTokenHealth,
} from './scheduled-post-publish.js';

const post = (o: Row = {}): Row => ({
  id: 'sp1',
  retailer_id: 'r1',
  plan_id: 'pl1',
  status: 'READY',
  scheduled_at: min(1),
  attempts: 0,
  last_attempt_at: null,
  error: null,
  caption: 'New in',
  client_post_id: 'cp1',
  social_post_id: null,
  items: [{ product_id: 'p1', photo_id: 'ph1', position: 0 }],
  ...o,
});
const acct = (o: Row = {}): Row => ({
  id: 'a1',
  platform: 'FACEBOOK',
  platform_account_id: 'pg1',
  access_token_encrypted: 'x',
  is_active: true,
  token_expires_at: new Date(NOW.getTime() + 86_400_000),
  ...o,
});
const plan = (o: Row = {}): Row => ({
  id: 'pl1',
  retailer_id: 'r1',
  platform: 'FACEBOOK',
  status: 'ACTIVE',
  social_account_id: 'a1',
  pause_reason: null,
  ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.posts = [post()];
  db.plans = [plan()];
  db.accounts = [acct()];
  db.socialPosts = [];
  db.retailer = { plan_status: 'ACTIVE', is_suspended: false };
  db.photos = [{ id: 'ph1', product_id: 'p1', url: 'https://r2/p1.jpg', is_primary: true }];
  mocks.hasFeature.mockResolvedValue(true);
  mocks.checkQuota.mockResolvedValue(undefined);
  mocks.publishPhotoPost.mockResolvedValue({ postId: 'fb1' });
  mocks.createPostedRowWithRetry.mockResolvedValue({ post: { id: 'soc1' }, deduplicated: false });
});

describe('publish tick', () => {
  it('publishes a due post, links social_post_id, counts usage once', async () => {
    const s = await handleSchedulePublishTick(NOW);
    expect(s.posted).toBe(1);
    expect(db.posts[0]).toMatchObject({
      status: 'POSTED',
      social_post_id: 'soc1',
      attempts: 1,
      error: null,
    });
    expect(mocks.publishPhotoPost).toHaveBeenCalledWith(
      'pg1',
      'tok',
      'https://r2/p1.jpg',
      'New in',
    );
    expect(mocks.incrementUsage).toHaveBeenCalledTimes(1);
  });

  it('double claim: two overlapping ticks publish exactly once', async () => {
    const [a, b] = await Promise.all([
      handleSchedulePublishTick(NOW),
      handleSchedulePublishTick(NOW),
    ]);
    expect(mocks.publishPhotoPost).toHaveBeenCalledTimes(1);
    expect(a.posted + b.posted).toBe(1);
    expect(db.posts[0]?.attempts).toBe(1);
  });

  it('retry: unknown error goes back to READY with backoff, then posts', async () => {
    mocks.publishPhotoPost.mockRejectedValueOnce(new Error('connect ECONNRESET db.internal:5432'));
    const first = await handleSchedulePublishTick(NOW);
    expect(first.retry).toBe(1);
    expect(db.posts[0]).toMatchObject({ status: 'READY', attempts: 1, error: REASON.UNKNOWN });
    // inside the 5 min backoff → untouched
    await handleSchedulePublishTick(new Date(NOW.getTime() + 60_000));
    expect(mocks.publishPhotoPost).toHaveBeenCalledTimes(1);
    // after backoff → publishes
    await handleSchedulePublishTick(new Date(NOW.getTime() + 6 * 60_000));
    expect(db.posts[0]).toMatchObject({ status: 'POSTED', attempts: 2 });
  });

  it('gives up after 3 attempts → FAILED, no raw error stored', async () => {
    mocks.publishPhotoPost.mockRejectedValue(new Error('SECRET internal detail'));
    db.posts[0] = post({ attempts: 2, last_attempt_at: min(30) });
    await handleSchedulePublishTick(NOW);
    expect(db.posts[0]).toMatchObject({ status: 'FAILED', attempts: 3, error: REASON.UNKNOWN });
    expect(JSON.stringify(db.posts[0])).not.toContain('SECRET');
  });

  it('grace: >2h late → MISSED, never published', async () => {
    db.posts[0] = post({ scheduled_at: min(121) });
    const s = await handleSchedulePublishTick(NOW);
    expect(s.missed).toBe(1);
    expect(db.posts[0]).toMatchObject({ status: 'MISSED', error: REASON.MISSED });
    expect(mocks.publishPhotoPost).not.toHaveBeenCalled();
  });

  it('limit hit: FAILED with plan reason, nothing published or counted', async () => {
    mocks.checkQuota.mockRejectedValue(new AppError('PLAN_LIMIT_EXCEEDED', 'limit', 402));
    await handleSchedulePublishTick(NOW);
    expect(db.posts[0]).toMatchObject({ status: 'FAILED', error: REASON.PLAN });
    expect(mocks.publishPhotoPost).not.toHaveBeenCalled();
    expect(mocks.incrementUsage).not.toHaveBeenCalled();
  });

  it('feature off at publish time: FAILED with plan reason', async () => {
    mocks.hasFeature.mockResolvedValue(false);
    await handleSchedulePublishTick(NOW);
    expect(db.posts[0]).toMatchObject({ status: 'FAILED', error: REASON.PLAN });
    expect(mocks.publishPhotoPost).not.toHaveBeenCalled();
  });

  it('cancelled subscription stops the queue', async () => {
    db.retailer = { plan_status: 'CANCELLED', is_suspended: false };
    await handleSchedulePublishTick(NOW);
    expect(db.posts[0]).toMatchObject({ status: 'FAILED', error: REASON.PLAN });
  });

  it('token dead (Graph 190): FAILED, plan paused, no retry', async () => {
    mocks.publishPhotoPost.mockRejectedValue(
      new MetaApiError('Facebook rejected the photo post', 400, 'PUBLISH_FAILED', { code: 190 }),
    );
    await handleSchedulePublishTick(NOW);
    expect(db.posts[0]).toMatchObject({ status: 'FAILED', error: REASON.TOKEN });
    expect(db.plans[0]).toMatchObject({
      status: 'PAUSED',
      pause_reason: 'Paused — Facebook token expired',
    });
  });

  it('deactivated account: pauses plan without burning an attempt', async () => {
    db.accounts[0]!.is_active = false;
    await handleSchedulePublishTick(NOW);
    expect(db.posts[0]).toMatchObject({ status: 'FAILED', attempts: 0 });
    expect(db.plans[0]?.status).toBe('PAUSED');
  });

  it('partial platform failure: FB posts, IG fails independently and retries', async () => {
    db.plans.push(plan({ id: 'pl2', platform: 'INSTAGRAM', social_account_id: 'a2' }));
    db.accounts.push(
      acct({ id: 'a2', platform: 'INSTAGRAM', platform_account_id: 'ig1', token_expires_at: null }),
    );
    db.posts.push(post({ id: 'sp2', plan_id: 'pl2', client_post_id: 'cp2' }));
    mocks.publishInstagramPhoto.mockRejectedValue(
      new MetaApiError(
        'Instagram rejected the photo container',
        400,
        'INSTAGRAM_CONTAINER_FAILED',
        {
          code: 4,
        },
      ),
    );
    const s = await handleSchedulePublishTick(NOW);
    expect(s).toMatchObject({ posted: 1, retry: 1 });
    expect(db.posts.find((p) => p.id === 'sp1')?.status).toBe('POSTED');
    expect(db.posts.find((p) => p.id === 'sp2')).toMatchObject({
      status: 'READY',
      error: REASON.RATE,
    });
  });

  it('live post whose row write fails is POSTED, not retried (no double post)', async () => {
    mocks.createPostedRowWithRetry.mockRejectedValue(new Error('db blip'));
    await handleSchedulePublishTick(NOW);
    expect(db.posts[0]).toMatchObject({ status: 'POSTED', social_post_id: null });
    expect(mocks.publishPhotoPost).toHaveBeenCalledTimes(1);
  });

  it('adopts an already-live SocialPost instead of publishing again', async () => {
    db.socialPosts = [{ id: 'soc9', client_post_id: 'cp1' }];
    await handleSchedulePublishTick(NOW);
    expect(mocks.publishPhotoPost).not.toHaveBeenCalled();
    expect(db.posts[0]).toMatchObject({ status: 'POSTED', social_post_id: 'soc9' });
  });

  it('paused plan is not picked up', async () => {
    db.plans[0]!.status = 'PAUSED';
    const s = await handleSchedulePublishTick(NOW);
    expect(s.posted).toBe(0);
    expect(db.posts[0]?.status).toBe('READY');
  });
});

describe('classifyFailure', () => {
  const e = (fb: Row, code = 'PUBLISH_FAILED') => new MetaApiError('x', 400, code, fb);
  it.each([
    [e({ code: 190 }), REASON.TOKEN],
    [e({ subcode: 463 }), REASON.TOKEN],
    [e({ code: 200 }), REASON.ACCESS],
    [e({ code: 613 }), REASON.RATE],
    [e({ code: 100 }), REASON.INVALID],
    [e({ code: 100, subcode: 2207026 }), REASON.MEDIA],
    [e({ code: 36003 }), REASON.MEDIA],
    [e({ code: 9004 }), REASON.MEDIA],
    [e({}, 'ACCOUNT_NOT_FOUND'), REASON.IG_UNLINKED],
    [e({}), REASON.UNKNOWN],
    [new Error('raw'), REASON.UNKNOWN],
  ])('%#', (err, reason) => {
    expect(classifyFailure(err, 'FACEBOOK').reason).toBe(reason);
  });
});

describe('token health', () => {
  it('pauses ACTIVE plans with an expired token, leaves healthy ones', async () => {
    db.accounts[0]!.token_expires_at = min(5);
    db.plans.push(plan({ id: 'pl3', social_account_id: 'a3' }));
    db.accounts.push(acct({ id: 'a3', token_expires_at: new Date(NOW.getTime() + 9e8) }));
    const r = await handleScheduleTokenHealth(NOW);
    expect(r.paused).toBe(1);
    expect(db.plans[0]).toMatchObject({
      status: 'PAUSED',
      pause_reason: 'Paused — Facebook token expired',
    });
    expect(db.plans[1]?.status).toBe('ACTIVE');
  });
});
