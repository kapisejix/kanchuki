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
    expect(await syncLink(link)).toEqual({ ok: true, synced: 1 });
    expect(m.upsert).toHaveBeenCalledTimes(1);
    const arg = m.updateMany.mock.calls[0]?.[0];
    expect(arg.where).toMatchObject({ id: 'l1', gbp_account_id: 'a1', gbp_location_id: 'loc1' });
    expect(arg.where.status).toEqual({ in: ['LINKED', 'NEEDS_ACCESS'] });
    expect(arg.data.status).toBe('LINKED');
  });

  it('writes nothing when the link was unlinked or re-pointed during the Google call', async () => {
    m.count.mockResolvedValue(0);
    expect(await syncLink(link)).toEqual({ ok: true, synced: 0 });
    expect(m.upsert).not.toHaveBeenCalled();
    expect(m.updateMany).not.toHaveBeenCalled();
  });
});
