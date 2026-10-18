// Tests for the one-off AI occasion backfill.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQueryRaw = vi.hoisted(() => vi.fn());
const mockExecuteRaw = vi.hoisted(() => vi.fn());
const mockFindProducts = vi.hoisted(() => vi.fn());
const mockSuggest = vi.hoisted(() => vi.fn());
const mockAddEmbeddingJob = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    $queryRaw: mockQueryRaw,
    $executeRaw: mockExecuteRaw,
    product: { findMany: mockFindProducts },
  },
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

/** One page of candidates, then an empty page. */
const page = (...ids: string[]) => {
  mockQueryRaw.mockResolvedValueOnce(ids.map((id) => ({ id }))).mockResolvedValueOnce([]);
  mockFindProducts.mockResolvedValueOnce(ids.map(row));
};

/** The SQL text of a tagged-template call to $queryRaw / $executeRaw. */
const sqlOf = (mock: ReturnType<typeof vi.fn>, call = 0) =>
  (mock.mock.calls[call]?.[0] as string[]).join('?');

beforeEach(() => {
  vi.clearAllMocks();
  mockExecuteRaw.mockResolvedValue(1);
  mockAddEmbeddingJob.mockResolvedValue(undefined);
});

describe('handleOccasionBackfill', () => {
  it('selects NULL as well as empty occasions (the column is a nullable TEXT[])', async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    await handleOccasionBackfill();
    const sql = sqlOf(mockQueryRaw);
    expect(sql).toContain('occasions IS NULL OR cardinality(occasions) = 0');
    expect(sql).toContain('ai_tagged');
    expect(sql).toContain('deleted_at IS NULL');
  });

  it('writes with a NULL/empty re-check and queues a re-embed', async () => {
    page('p1');
    mockSuggest.mockResolvedValue(['Wedding']);

    const res = await handleOccasionBackfill();

    expect(sqlOf(mockExecuteRaw)).toContain('occasions IS NULL OR cardinality(occasions) = 0');
    expect(mockExecuteRaw.mock.calls[0]?.slice(1)).toEqual([['Wedding'], 'p1']);
    expect(mockAddEmbeddingJob).toHaveBeenCalledWith({ product_id: 'p1', retailer_id: 'r1' });
    expect(res).toMatchObject({ scanned: 1, updated: 1, empty: 0 });
  });

  it('does not re-embed when a concurrent edit won the race (0 rows changed)', async () => {
    page('p1');
    mockSuggest.mockResolvedValue(['Festive']);
    mockExecuteRaw.mockResolvedValue(0);

    const res = await handleOccasionBackfill();

    expect(res.updated).toBe(0);
    expect(mockAddEmbeddingJob).not.toHaveBeenCalled();
  });

  it('counts empty replies and writes nothing for them', async () => {
    page('p1');
    mockSuggest.mockResolvedValue([]);

    const res = await handleOccasionBackfill();

    expect(res).toMatchObject({ scanned: 1, updated: 0, empty: 1 });
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  it('dry run calls the AI and reports samples but writes nothing', async () => {
    page('p1');
    mockSuggest.mockResolvedValue(['Casual']);

    const res = await handleOccasionBackfill({ dryRun: true });

    expect(res.samples).toEqual([
      { id: 'p1', category: 'Saree', subtype: null, occasions: ['Casual'] },
    ]);
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(mockAddEmbeddingJob).not.toHaveBeenCalled();
  });

  it('stops at the limit and pages past the last id', async () => {
    mockQueryRaw.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    mockFindProducts.mockResolvedValue([row('p1'), row('p2')]);
    mockSuggest.mockResolvedValue(['Casual']);

    const res = await handleOccasionBackfill({ limit: 2 });

    expect(res.scanned).toBe(2);
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    expect(mockQueryRaw.mock.calls[0]?.slice(1)).toEqual(['', 2]); // cursor '', LIMIT 2
  });

  it('advances the cursor between pages', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([{ id: 'p1' }])
      .mockResolvedValueOnce([{ id: 'p2' }])
      .mockResolvedValueOnce([]);
    mockFindProducts.mockResolvedValueOnce([row('p1')]).mockResolvedValueOnce([row('p2')]);
    mockSuggest.mockResolvedValue(['Casual']);

    await handleOccasionBackfill();

    expect(mockQueryRaw.mock.calls[1]?.[1]).toBe('p1');
  });

  it('fails the job when the AI call fails (no silent success)', async () => {
    page('p1');
    mockSuggest.mockRejectedValue(new Error('providers down'));
    await expect(handleOccasionBackfill()).rejects.toThrow('providers down');
  });
});
