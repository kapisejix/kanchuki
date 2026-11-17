/**
 * syncLink must not write once the link has been unlinked or re-pointed while Google was
 * answering (security review of 007c8767, finding 1).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  count: vi.fn(),
  updateMany: vi.fn(),
  upsert: vi.fn(),
  listReviews: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    gbpLink: { count: m.count, updateMany: m.updateMany },
    gbpReview: { upsert: m.upsert },
  },
}));
vi.mock('./google-business.js', () => ({
  GbpError: class GbpError extends Error {
    constructor(
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
  listReviews: m.listReviews,
}));

import { syncLink } from './gbp-sync.js';

const link = { id: 'l1', retailer_id: 'r1', gbp_account_id: 'a1', gbp_location_id: 'loc1' };
const page = {
  reviews: [
    {
      reviewId: 'g1',
      reviewerName: 'A',
      starRating: 5,
      comment: 'ok',
      createdAt: new Date(),
      updatedAt: new Date(),
      replyComment: null,
      replyUpdatedAt: null,
    },
  ],
  averageRating: 4.5,
  totalReviewCount: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.listReviews.mockResolvedValue(page);
  m.updateMany.mockResolvedValue({ count: 1 });
});

describe('syncLink', () => {
  it('writes reviews and the link when it is still the same link', async () => {
    m.count.mockResolvedValue(1);
    expect(await syncLink(link)).toMatchObject({ ok: true, synced: 1 });
    expect(m.upsert).toHaveBeenCalledTimes(1);
    const arg = m.updateMany.mock.calls[0]?.[0];
    expect(arg.where).toMatchObject({ id: 'l1', gbp_account_id: 'a1', gbp_location_id: 'loc1' });
    expect(arg.where.status).toEqual({ in: ['LINKED', 'NEEDS_ACCESS'] });
    expect(arg.data.status).toBe('LINKED');
  });

  it('a location Google cannot find is a lost location: NEEDS_ACCESS, state flips', async () => {
    m.count.mockResolvedValue(1);
    const { GbpError } = await import('./google-business.js');
    m.listReviews.mockRejectedValue(new GbpError('NOT_FOUND', 'gone'));
    expect(await syncLink(link)).toEqual({ ok: false, code: 'NEEDS_ACCESS' });
    expect(m.updateMany.mock.calls[0]?.[0].data).toMatchObject({
      status: 'NEEDS_ACCESS',
      last_error_code: 'NEEDS_ACCESS',
    });
  });

  // Audit #5: a review deleted on Google was never removed, and a shop over 250 reviews was only
  // ever partly read. `complete` is the proof a full walk happened; only then may rows be culled.
  describe('complete walk (audit #5)', () => {
    const mk = (id: string) => ({ ...page.reviews[0], reviewId: id });

    it('reports complete with the walk start when every page was read and the count matches', async () => {
      m.count.mockResolvedValue(1);
      const before = Date.now();
      const res = await syncLink(link);
      expect(res).toMatchObject({ ok: true, synced: 1 });
      expect(
        (res as { complete?: { since: Date } }).complete?.since.getTime(),
      ).toBeGreaterThanOrEqual(before);
    });

    it('is NOT complete when Google reports more reviews than were read', async () => {
      m.count.mockResolvedValue(1);
      m.listReviews.mockResolvedValue({ ...page, totalReviewCount: 5 });
      expect(await syncLink(link)).not.toHaveProperty('complete');
    });

    it('is NOT complete when Google gave no total to compare against', async () => {
      m.count.mockResolvedValue(1);
      m.listReviews.mockResolvedValue({ ...page, totalReviewCount: null });
      expect(await syncLink(link)).not.toHaveProperty('complete');
    });

    it('an empty page with a non-zero total (a glitch) is NOT complete', async () => {
      m.count.mockResolvedValue(1);
      m.listReviews.mockResolvedValue({ reviews: [], averageRating: null, totalReviewCount: 3 });
      expect(await syncLink(link)).not.toHaveProperty('complete');
    });

    it('stops at maxPages and is NOT complete when pages remain', async () => {
      m.count.mockResolvedValue(1);
      let n = 0;
      m.listReviews.mockImplementation(async () => ({
        reviews: [mk(`g${n++}`)],
        averageRating: 4,
        totalReviewCount: 99,
        nextPageToken: 'more',
      }));
      const res = await syncLink(link, { maxPages: 3 });
      expect(m.listReviews).toHaveBeenCalledTimes(3);
      expect(res).toMatchObject({ ok: true, synced: 3 });
      expect(res).not.toHaveProperty('complete');
    });

    it('walks all pages up to maxPages and is complete when the last page ends the list', async () => {
      m.count.mockResolvedValue(1);
      let n = 0;
      m.listReviews.mockImplementation(async () => {
        n++;
        return {
          reviews: [mk(`g${n}`)],
          averageRating: 4,
          totalReviewCount: 8,
          nextPageToken: n < 8 ? 'more' : null,
        };
      });
      const res = await syncLink(link, { maxPages: 40 });
      expect(m.listReviews).toHaveBeenCalledTimes(8);
      expect(res).toHaveProperty('complete');
    });
  });

  it('writes nothing when the link was unlinked or re-pointed during the Google call', async () => {
    m.count.mockResolvedValue(0);
    expect(await syncLink(link)).toEqual({ ok: true, synced: 0 });
    expect(m.upsert).not.toHaveBeenCalled();
    expect(m.updateMany).not.toHaveBeenCalled();
  });
});
