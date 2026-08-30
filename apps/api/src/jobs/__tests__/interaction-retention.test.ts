// Tests for interaction-retention cron job (Task 14).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.hoisted(() => vi.fn());
const mockDeleteMany = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    customerInteraction: {
      findMany: mockFindMany,
      deleteMany: mockDeleteMany,
    },
  },
}));

import { handleInteractionRetention } from '../interaction-retention.js';

describe('handleInteractionRetention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delete old interactions not in keep list', async () => {
    // First batch returns 2 items, second batch returns empty
    mockFindMany
      .mockResolvedValueOnce([{ id: 'int-1' }, { id: 'int-2' }])
      .mockResolvedValueOnce([]);
    mockDeleteMany.mockResolvedValue({ count: 2 });

    const result = await handleInteractionRetention();

    expect(result.deleted).toBe(2);
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['int-1', 'int-2'] } },
    });
  });

  it('should paginate through large datasets', async () => {
    // 3 batches: 500, 500, 0
    mockFindMany
      .mockResolvedValueOnce(Array.from({ length: 500 }, (_, i) => ({ id: `int-${i}` })))
      .mockResolvedValueOnce(Array.from({ length: 500 }, (_, i) => ({ id: `int-${500 + i}` })))
      .mockResolvedValueOnce([]);
    mockDeleteMany.mockResolvedValue({ count: 500 });

    const result = await handleInteractionRetention();

    expect(result.deleted).toBe(1000);
    expect(mockDeleteMany).toHaveBeenCalledTimes(2);
  });

  it('should not delete purchase or enquiry interactions', async () => {
    mockFindMany.mockResolvedValueOnce([]);
    mockDeleteMany.mockResolvedValue({ count: 0 });

    await handleInteractionRetention();

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: { notIn: ['purchase', 'enquiry'] },
        }),
      }),
    );
  });

  it('should return 0 deleted when no old interactions exist', async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const result = await handleInteractionRetention();

    expect(result.deleted).toBe(0);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });
});
