/**
 * Audit #5: the 6-hourly job walks every page and, when the walk was provably complete, removes
 * rows Google no longer returns. DELETE is revoked for the app role (RC-049), so the delete goes
 * through the purge client and is conditioned on the link still being the one that was synced.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  findMany: vi.fn(),
  syncLink: vi.fn(),
  purgeExec: vi.fn(),
  hasFeature: vi.fn(),
  getSetting: vi.fn(),
  approved: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: { gbpLink: { findMany: m.findMany } },
  getPurgePrisma: () => ({ $executeRawUnsafe: m.purgeExec }),
}));
vi.mock('../instrument.js', () => ({ Sentry: { captureMessage: vi.fn(), captureException: vi.fn() } }));
vi.mock('../lib/features.js', () => ({ hasFeature: m.hasFeature }));
vi.mock('../lib/gbp-sync.js', () => ({ syncLink: m.syncLink, FULL_WALK_PAGES: 40 }));
vi.mock('../lib/google-business.js', () => ({
  GBP_KEYS: { refreshToken: 'GBP_REFRESH_TOKEN' },
  getGbpSetting: m.getSetting,
  gbpApiApproved: m.approved,
}));

import { handleGbpReviewSync } from './gbp-review-sync.js';

const LINK = { id: 'l1', retailer_id: 'r1', gbp_account_id: 'a1', gbp_location_id: 'loc1' };
const SINCE = new Date('2026-11-17T10:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  m.getSetting.mockResolvedValue('rt');
  m.approved.mockResolvedValue(true);
  m.hasFeature.mockResolvedValue(true);
  m.findMany.mockResolvedValue([LINK]);
  m.purgeExec.mockResolvedValue(0);
});

const vanishCalls = () =>
  m.purgeExec.mock.calls.filter((c) => String(c[0]).includes('synced_at < $4'));

describe('handleGbpReviewSync: vanished reviews', () => {
  it('walks with the full page budget, not the on-demand one', async () => {
    m.syncLink.mockResolvedValue({ ok: true, synced: 0 });
    await handleGbpReviewSync();
    expect(m.syncLink).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1' }), {
      maxPages: 40,
    });
  });

  it('after a complete walk deletes this link rows that were not touched since the walk began', async () => {
    m.syncLink.mockResolvedValue({ ok: true, synced: 3, complete: { since: SINCE } });
    await handleGbpReviewSync();
    const calls = vanishCalls();
    expect(calls).toHaveLength(1);
    const [sql, ...params] = calls[0] as [string, ...unknown[]];
    expect(params).toEqual(['l1', 'a1', 'loc1', SINCE]);
    // still the same link: not unlinked, not re-pointed, while we waited
    expect(sql).toContain("l.status IN ('LINKED', 'NEEDS_ACCESS')");
    expect(sql).toContain('l.gbp_account_id = $2');
    expect(sql).toContain('l.gbp_location_id = $3');
  });

  it('an incomplete walk deletes nothing', async () => {
    m.syncLink.mockResolvedValue({ ok: true, synced: 3 });
    await handleGbpReviewSync();
    expect(vanishCalls()).toHaveLength(0);
  });

  it('a failed sync deletes nothing', async () => {
    m.syncLink.mockResolvedValue({ ok: false, code: 'UNAVAILABLE' });
    await handleGbpReviewSync();
    expect(vanishCalls()).toHaveLength(0);
  });
});

/** Audit minor A: a Google outage must not walk all 500 links, and one throw must not end the run. */
describe('handleGbpReviewSync: outage and thrown errors', () => {
  const links = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ ...LINK, id: `l${i}`, retailer_id: `r${i}` }));

  it('stops after 5 consecutive UNAVAILABLE results instead of walking every link', async () => {
    m.findMany.mockResolvedValue(links(8));
    m.syncLink.mockResolvedValue({ ok: false, code: 'UNAVAILABLE' });
    const res = await handleGbpReviewSync();
    expect(m.syncLink).toHaveBeenCalledTimes(5);
    expect(res).toMatchObject({ failed: 5, stoppedEarly: true });
  });

  it('a success in between resets the consecutive count', async () => {
    m.findMany.mockResolvedValue(links(7));
    const down = { ok: false, code: 'UNAVAILABLE' };
    m.syncLink
      .mockResolvedValueOnce(down)
      .mockResolvedValueOnce(down)
      .mockResolvedValueOnce(down)
      .mockResolvedValueOnce(down)
      .mockResolvedValueOnce({ ok: true, synced: 1 })
      .mockResolvedValueOnce(down)
      .mockResolvedValueOnce(down);
    const res = await handleGbpReviewSync();
    expect(m.syncLink).toHaveBeenCalledTimes(7);
    expect(res).toMatchObject({ synced: 1, failed: 6, stoppedEarly: false });
  });

  it('a thrown error fails that link only: the rest still sync and the purge still runs', async () => {
    m.findMany.mockResolvedValue(links(2));
    m.syncLink
      .mockRejectedValueOnce(new Error('db hiccup'))
      .mockResolvedValueOnce({ ok: true, synced: 2 });
    const res = await handleGbpReviewSync();
    expect(res).toMatchObject({ synced: 2, failed: 1, stoppedEarly: false });
    expect(
      m.purgeExec.mock.calls.some((c) => String(c[0]).includes("status = 'UNLINKED'")),
    ).toBe(true);
  });
});
