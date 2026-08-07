import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleBackfillMissingAiFields } from './backfill-missing-ai-fields.js';

// The job's contract: re-queue tag jobs for ai_tagged products with any of
// the four AI-fields still null; never touch products with a retailer edit,
// mid-tagging, or deleted; cap per run so the queue can't be flooded.

const mockFindMany = vi.fn();
const mockUpdate = vi.fn();
const mockAddTaggingJob = vi.fn();

vi.mock('@kanchuki/db', () => ({
  prisma: {
    product: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

vi.mock('./index.js', () => ({
  addTaggingJob: (...args: unknown[]) => mockAddTaggingJob(...args),
}));

describe('handleBackfillMissingAiFields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('re-queues products that have null name/sku/description/subtype with their primary photo', async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: 'p1',
        retailer_id: 'r1',
        photos: [{ url: 'https://img/p1.jpg', r2_key: 'k1' }],
      },
    ]);
    mockUpdate.mockResolvedValue({});
    mockAddTaggingJob.mockResolvedValue(undefined);

    const result = await handleBackfillMissingAiFields();

    expect(result.requeued).toBe(1);
    expect(result.done).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { ai_tagged: false, ai_tag_error: null },
    });
    expect(mockAddTaggingJob).toHaveBeenCalledWith({
      product_id: 'p1',
      retailer_id: 'r1',
      photo_url: 'https://img/p1.jpg',
      r2_key: 'k1',
      auto_cleanup: false,
    });
  });

  it('queries only ai_tagged, non-deleted products with any AI field null', async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await handleBackfillMissingAiFields();

    const call = mockFindMany.mock.calls[0]?.[0] as {
      where: { ai_tagged: boolean; deleted_at: null; OR: unknown[] };
    };
    expect(call.where.ai_tagged).toBe(true);
    expect(call.where.deleted_at).toBeNull();
    expect(call.where.OR).toEqual([
      { name: null },
      { sku: null },
      { description: null },
      { subtype: null },
    ]);
  });

  it('skips products with no primary photo and caps the run at the queue-flood guard', async () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      id: `p${i}`,
      retailer_id: 'r1',
      photos: i % 2 === 0 ? [{ url: `https://img/p${i}.jpg`, r2_key: `k${i}` }] : [],
    }));
    mockFindMany.mockResolvedValueOnce(rows);
    mockUpdate.mockResolvedValue({});
    mockAddTaggingJob.mockResolvedValue(undefined);

    const result = await handleBackfillMissingAiFields(3);

    expect(result.requeued).toBe(3); // cap hit
    expect(result.skipped_quota_or_error).toBeGreaterThanOrEqual(1); // the no-photo rows
    expect(result.done).toBe(false); // more candidates remain
    expect(mockAddTaggingJob.mock.calls.length).toBe(3);
  });

  it('is a no-op when nothing matches', async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const result = await handleBackfillMissingAiFields();

    expect(result).toEqual({ scanned: 0, requeued: 0, skipped_quota_or_error: 0, done: true });
    expect(mockAddTaggingJob).not.toHaveBeenCalled();
  });
});
