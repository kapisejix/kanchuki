// F-036 Phase B — new-arrivals push job + the endpoint allowlist (SSRF guard).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  groupBy: vi.fn(),
  retailerFind: vi.fn(),
  subsFind: vi.fn(),
  subsUpdateMany: vi.fn(),
  send: vi.fn(),
  setVapid: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    product: { groupBy: mocks.groupBy },
    retailer: { findUnique: mocks.retailerFind },
    customerPushSubscription: { findMany: mocks.subsFind, updateMany: mocks.subsUpdateMany },
  },
}));
vi.mock('web-push', () => ({
  default: { sendNotification: mocks.send, setVapidDetails: mocks.setVapid },
}));
vi.mock('./queue.js', () => ({
  getRedis: () => ({ incr: mocks.incr, expire: mocks.expire }),
}));

import { handleNewArrivalsPush, isAllowedPushEndpoint } from './customer-push.js';

const SUB = { endpoint: 'https://fcm.googleapis.com/fcm/send/a', p256dh: 'p', auth: 'x' };
const DEAD = { endpoint: 'https://fcm.googleapis.com/fcm/send/dead', p256dh: 'p', auth: 'x' };

describe('isAllowedPushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QH-abc',
  ])('accepts %s', (u) => expect(isAllowedPushEndpoint(u)).toBe(true));

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc', // not https
    'https://fcm.googleapis.com:8443/x', // explicit port
    'https://evilfcm.googleapis.com.attacker.io/x', // suffix trick
    'https://169.254.169.254/latest/meta-data', // metadata SSRF
    'https://localhost/x',
    'not a url',
  ])('rejects %s', (u) => expect(isAllowedPushEndpoint(u)).toBe(false));
});

describe('handleNewArrivalsPush', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
    mocks.groupBy.mockResolvedValue([{ retailer_id: 'r1', _count: { _all: 3 } }]);
    mocks.retailerFind.mockResolvedValue({
      shop_name: 'Meena Bazaar',
      public_slug: 'meena-bazaar',
      is_suspended: false,
      deleted_at: null,
    });
    mocks.subsFind.mockResolvedValue([SUB]);
    mocks.incr.mockResolvedValue(1);
    mocks.send.mockResolvedValue({});
  });

  it('is a no-op without VAPID keys', async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    const r = await handleNewArrivalsPush();
    expect(r.skipped).toBe('no_vapid');
    expect(mocks.groupBy).not.toHaveBeenCalled();
  });

  it('sends a count-only payload to unmuted visitors of the store', async () => {
    const r = await handleNewArrivalsPush();
    expect(r).toMatchObject({ stores: 1, sent: 1 });
    // Recipient filter: active sub, its subscribing session still live (logout stops
    // that device), live account, visited THIS store and not muted.
    expect(mocks.subsFind.mock.calls[0]?.[0].where).toEqual({
      disabled_at: null,
      passport_session: { revoked_at: null, expires_at: { gt: expect.any(Date) } },
      customer_account: {
        deleted_at: null,
        store_visits: { some: { retailer_id: 'r1', is_muted: false } },
      },
    });
    const payload = JSON.parse(mocks.send.mock.calls[0]?.[1]);
    expect(payload).toEqual({
      title: 'Meena Bazaar',
      body: '3 new items added',
      url: '/meena-bazaar',
      tag: 'arrivals-r1',
    });
  });

  it('stops at 2 sends per store per week', async () => {
    mocks.incr.mockResolvedValue(3);
    const r = await handleNewArrivalsPush();
    expect(r.capped).toBe(1);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not spend a cap slot on a store with no subscribers', async () => {
    mocks.subsFind.mockResolvedValue([]);
    await handleNewArrivalsPush();
    expect(mocks.incr).not.toHaveBeenCalled();
  });

  it('skips suspended stores and stores with no storefront', async () => {
    mocks.retailerFind.mockResolvedValueOnce({
      shop_name: 'S',
      public_slug: 's',
      is_suspended: true,
      deleted_at: null,
    });
    await handleNewArrivalsPush();
    mocks.retailerFind.mockResolvedValueOnce({
      shop_name: 'S',
      public_slug: null,
      is_suspended: false,
      deleted_at: null,
    });
    await handleNewArrivalsPush();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('soft-disables 410 subscriptions and keeps transient failures', async () => {
    const flaky = { ...SUB, endpoint: 'https://fcm.googleapis.com/fcm/send/flaky' };
    mocks.subsFind.mockResolvedValue([SUB, DEAD, flaky]);
    mocks.send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }))
      .mockRejectedValueOnce(Object.assign(new Error('busy'), { statusCode: 503 }));
    const r = await handleNewArrivalsPush();
    expect(r).toMatchObject({ sent: 1, disabled: 1 });
    expect(mocks.subsUpdateMany).toHaveBeenCalledWith({
      where: { endpoint: { in: [DEAD.endpoint] }, disabled_at: null },
      data: { disabled_at: expect.any(Date) },
    });
  });
});
