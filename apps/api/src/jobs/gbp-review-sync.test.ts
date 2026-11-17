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
vi.mock('../instrument.js', () => ({ Sentry: { captureMessage: vi.fn() } }));
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
