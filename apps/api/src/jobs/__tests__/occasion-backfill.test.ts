// Tests for the one-off AI occasion backfill.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindProducts = vi.hoisted(() => vi.fn());
const mockUpdateMany = vi.hoisted(() => vi.fn());
const mockSuggest = vi.hoisted(() => vi.fn());
const mockAddEmbeddingJob = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: { product: { findMany: mockFindProducts, updateMany: mockUpdateMany } },
}));
vi.mock('@kanchuki/ai', () => ({ suggestOccasionsFromText: mockSuggest }));
vi.mock('../index.js', () => ({ addEmbeddingJob: mockAddEmbeddingJob }));

import { handleOccasionBackfill } from '../occasion-backfill.js';

const row = (id: string) => ({
  id,
  retailer_id: 'r1',
  category: 'Saree',
  subtype: null,
  pattern: null,
  styles: [],
  fabrics: [],
  embellishments: [],
  search_tags: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateMany.mockResolvedValue({ count: 1 });
  mockAddEmbeddingJob.mockResolvedValue(undefined);
});

describe('handleOccasionBackfill', () => {
  it('selects only AI-tagged, live products with empty occasions', async () => {
    mockFindProducts.mockResolvedValueOnce([]);
    await handleOccasionBackfill();
    expect(mockFindProducts.mock.calls[0]?.[0].where).toMatchObject({
      ai_tagged: true,
      deleted_at: null,
      occasions: { isEmpty: true },
    });
  });

  it('writes with an empty-array re-check and queues a re-embed', async () => {
    mockFindProducts.mockResolvedValueOnce([row('p1')]).mockResolvedValueOnce([]);
    mockSuggest.mockResolvedValue(['Wedding']);

    const res = await handleOccasionBackfill();

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 'p1', occasions: { isEmpty: true } },
      data: { occasions: ['Wedding'] },
    });
    expect(mockAddEmbeddingJob).toHaveBeenCalledWith({ product_id: 'p1', retailer_id: 'r1' });
    expect(res).toMatchObject({ scanned: 1, updated: 1, empty: 0 });
  });

  it('does not re-embed when a concurrent edit won the race (count 0)', async () => {
    mockFindProducts.mockResolvedValueOnce([row('p1')]).mockResolvedValueOnce([]);
    mockSuggest.mockResolvedValue(['Festive']);
    mockUpdateMany.mockResolvedValue({ count: 0 });

    const res = await handleOccasionBackfill();

    expect(res.updated).toBe(0);
    expect(mockAddEmbeddingJob).not.toHaveBeenCalled();
  });

  it('counts empty replies and writes nothing for them', async () => {
    mockFindProducts.mockResolvedValueOnce([row('p1')]).mockResolvedValueOnce([]);
    mockSuggest.mockResolvedValue([]);

    const res = await handleOccasionBackfill();

    expect(res).toMatchObject({ scanned: 1, updated: 0, empty: 1 });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('dry run calls the AI and reports samples but writes nothing', async () => {
    mockFindProducts.mockResolvedValueOnce([row('p1')]).mockResolvedValueOnce([]);
    mockSuggest.mockResolvedValue(['Casual']);

    const res = await handleOccasionBackfill({ dryRun: true });

    expect(res.samples).toEqual([
      { id: 'p1', category: 'Saree', subtype: null, occasions: ['Casual'] },
    ]);
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockAddEmbeddingJob).not.toHaveBeenCalled();
  });

  it('stops at the limit', async () => {
    mockFindProducts.mockResolvedValue([row('p1'), row('p2')]);
    mockSuggest.mockResolvedValue(['Casual']);

    const res = await handleOccasionBackfill({ limit: 2 });

    expect(res.scanned).toBe(2);
    expect(mockFindProducts).toHaveBeenCalledTimes(1);
    expect(mockFindProducts.mock.calls[0]?.[0].take).toBe(2);
  });

  it('fails the job when the AI call fails (no silent success)', async () => {
    mockFindProducts.mockResolvedValueOnce([row('p1')]);
    mockSuggest.mockRejectedValue(new Error('providers down'));
    await expect(handleOccasionBackfill()).rejects.toThrow('providers down');
  });
});
