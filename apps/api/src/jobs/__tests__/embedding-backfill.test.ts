// Tests for embedding-backfill cron job (Task 17).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.hoisted(() => vi.fn());
const mockAddEmbeddingJob = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    product: {
      findMany: mockFindMany,
    },
  },
}));

vi.mock('../index.js', () => ({
  addEmbeddingJob: mockAddEmbeddingJob,
}));

import { handleEmbeddingBackfill } from '../embedding-backfill.js';

describe('handleEmbeddingBackfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should enqueue embedding jobs for products without embeddings', async () => {
    mockFindMany
      .mockResolvedValueOnce([
        { id: 'prod-1', retailer_id: 'ret-1' },
        { id: 'prod-2', retailer_id: 'ret-2' },
      ])
      .mockResolvedValueOnce([]);

    const result = await handleEmbeddingBackfill();

    expect(result.enqueued).toBe(2);
    expect(mockAddEmbeddingJob).toHaveBeenCalledTimes(2);
    expect(mockAddEmbeddingJob).toHaveBeenCalledWith({
      product_id: 'prod-1',
      retailer_id: 'ret-1',
    });
  });

  it('should paginate through large backlogs', async () => {
    mockFindMany
      .mockResolvedValueOnce(Array.from({ length: 50 }, (_, i) => ({ id: `prod-${i}`, retailer_id: 'ret-1' })))
      .mockResolvedValueOnce(Array.from({ length: 30 }, (_, i) => ({ id: `prod-${50 + i}`, retailer_id: 'ret-1' })))
      .mockResolvedValueOnce([]);

    const result = await handleEmbeddingBackfill();

    expect(result.enqueued).toBe(80);
    expect(mockAddEmbeddingJob).toHaveBeenCalledTimes(80);
  });

  it('should return 0 when no products need backfill', async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const result = await handleEmbeddingBackfill();

    expect(result.enqueued).toBe(0);
    expect(mockAddEmbeddingJob).not.toHaveBeenCalled();
  });

  it('should only backfill AI-tagged AVAILABLE products', async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await handleEmbeddingBackfill();

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'AVAILABLE',
          ai_tagged: true,
          embedding: null,
        }),
      }),
    );
  });
});
