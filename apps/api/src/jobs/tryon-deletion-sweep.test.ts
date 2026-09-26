// F-039 Phase 2 — the retry path for try-on images a withdrawal could not
// delete. The assertion that carries the most weight is the first one: the
// sweep's WHERE clause is what keeps it from ever touching an image whose owner
// is still consented.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleTryOnDeletionSweep } from './tryon-deletion-sweep.js';

const { mockFindMany, mockUpdateMany, mockDeleteObject } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockDeleteObject: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: { tryOnJob: { findMany: mockFindMany, updateMany: mockUpdateMany } },
}));

vi.mock('@kanchuki/ai', () => ({ deleteObject: mockDeleteObject }));

const J1 = { id: 'j1', result_url: 'tryon-results/j1/a.jpg' };
const J2 = { id: 'j2', result_url: 'tryon-results/j2/b.jpg' };

beforeEach(() => {
  vi.clearAllMocks();
  mockFindMany.mockResolvedValue([]);
  mockUpdateMany.mockResolvedValue({ count: 1 });
  mockDeleteObject.mockResolvedValue(undefined);
});

describe('handleTryOnDeletionSweep', () => {
  it('only ever looks at withdrawn rows that still carry a key', async () => {
    await handleTryOnDeletionSweep();

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { consent_withdrawn_at: { not: null }, result_url: { not: null } },
      }),
    );
  });

  it('deletes each owed object and clears only the pointer', async () => {
    mockFindMany.mockResolvedValue([J1, J2]);

    const result = await handleTryOnDeletionSweep();

    expect(mockDeleteObject.mock.calls.map((c) => c[0])).toEqual([
      'tryon-results/j1/a.jpg',
      'tryon-results/j2/b.jpg',
    ]);
    // `consent_withdrawn_at` is never part of the update: the withdrawal is the
    // audit record and has to outlive the cleanup it triggered. The key is
    // matched too, so an update can never clear a pointer that has moved on.
    for (const call of mockUpdateMany.mock.calls) {
      expect(call[0].where).toEqual({ id: expect.any(String), result_url: expect.any(String) });
      expect(call[0].data).toEqual({ result_url: null });
    }
    expect(result).toEqual({ owed: 2, deleted: 2, failed: 0 });
  });

  it('leaves the key in place when the delete fails, so the next run retries it', async () => {
    mockFindMany.mockResolvedValue([J1]);
    mockDeleteObject.mockRejectedValue(new Error('R2 unreachable'));

    const result = await handleTryOnDeletionSweep();

    expect(result).toEqual({ owed: 1, deleted: 0, failed: 1 });
    // No pointer cleared: it is the only thing that can still find the object.
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('drains a backlog oldest-first, in bounded batches', async () => {
    await handleTryOnDeletionSweep();

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { consent_withdrawn_at: 'asc' }, take: 100 }),
    );
  });

  it('does nothing, quietly, when nothing is owed', async () => {
    const result = await handleTryOnDeletionSweep();

    expect(mockDeleteObject).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ owed: 0, deleted: 0, failed: 0 });
  });
});
