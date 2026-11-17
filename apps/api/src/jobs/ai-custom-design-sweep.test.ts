// Stale-PENDING sweep for ai_custom_designs: a row still PENDING past the reservation cutoff
// (process died mid-job, or markFailed's own write failed) is flipped to FAILED so the retailer's
// poll stops showing PENDING forever. A DB error propagates so BullMQ marks the cron failed.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAiCustomDesignSweep } from './ai-custom-design-sweep.js';
import { GENERIC_FAILURE } from './ai-custom-design.js';
import { RESERVATION_MIN_AGE_MS } from './quota-reservation-sweep.js';

const m = vi.hoisted(() => ({ updateMany: vi.fn() }));

vi.mock('@kanchuki/db', () => ({ prisma: { aiCustomDesign: { updateMany: m.updateMany } } }));

const NOW = new Date('2026-11-17T12:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  m.updateMany.mockResolvedValue({ count: 0 });
});

describe('handleAiCustomDesignSweep', () => {
  it('only touches PENDING rows older than the reservation cutoff', async () => {
    await handleAiCustomDesignSweep(NOW);
    const where = m.updateMany.mock.lastCall?.[0].where;
    expect(where.status).toBe('PENDING');
    expect(where.created_at.lt).toEqual(new Date(NOW.getTime() - RESERVATION_MIN_AGE_MS));
  });

  it('flips them to FAILED with the generic error', async () => {
    await handleAiCustomDesignSweep(NOW);
    expect(m.updateMany.mock.lastCall?.[0].data).toEqual({
      status: 'FAILED',
      error: GENERIC_FAILURE,
    });
  });

  it('returns how many rows it failed', async () => {
    m.updateMany.mockResolvedValue({ count: 3 });
    expect(await handleAiCustomDesignSweep(NOW)).toEqual({ failed: 3 });
  });

  it('lets a DB error propagate so the cron run is marked failed', async () => {
    m.updateMany.mockRejectedValue(new Error('db down'));
    await expect(handleAiCustomDesignSweep(NOW)).rejects.toThrow('db down');
  });
});
