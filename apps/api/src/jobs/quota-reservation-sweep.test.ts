// RC-102 sweep: a RESERVED row older than the cutoff is settled by what its job left behind.
// A paid result -> SPENT (never refunded); no trace -> REFUNDED; one failing row does not
// stop the rest.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RESERVATION_MIN_AGE_MS, handleQuotaReservationSweep } from './quota-reservation-sweep.js';

const m = vi.hoisted(() => ({
  findMany: vi.fn(),
  photoFind: vi.fn(),
  tryOnFind: vi.fn(),
  refund: vi.fn(),
  refundCustomer: vi.fn(),
  spent: vi.fn(),
  spentCustomer: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    quotaReservation: { findMany: m.findMany },
    productPhoto: { findFirst: m.photoFind },
    tryOnJob: { findUnique: m.tryOnFind },
  },
}));
vi.mock('../lib/quota.js', () => ({
  refundJobQuota: m.refund,
  refundCustomerJobQuota: m.refundCustomer,
  markJobQuotaSpent: m.spent,
  markCustomerJobQuotaSpent: m.spentCustomer,
}));

const NOW = new Date('2026-10-27T12:00:00Z');
const retailerRow = (job_id: string, resource_type: string) => ({
  job_id,
  resource_type,
  retailer_id: 'ret1',
  customer_account_id: null,
});
const customerRow = (job_id: string, resource_type: string) => ({
  job_id,
  resource_type,
  retailer_id: null,
  customer_account_id: 'cust1',
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const f of [m.refund, m.refundCustomer, m.spent, m.spentCustomer]) {
    f.mockResolvedValue(undefined);
  }
  m.photoFind.mockResolvedValue(null);
  m.tryOnFind.mockResolvedValue(null);
});

describe('handleQuotaReservationSweep', () => {
  it('only reads RESERVED rows older than the cutoff', async () => {
    m.findMany.mockResolvedValue([]);
    await handleQuotaReservationSweep(NOW);
    const where = m.findMany.mock.calls[0]?.[0].where;
    expect(where.state).toBe('RESERVED');
    expect(where.created_at.lt).toEqual(new Date(NOW.getTime() - RESERVATION_MIN_AGE_MS));
  });

  it('refunds a studio shoot with no photo, marks one with a photo spent', async () => {
    m.findMany.mockResolvedValue([
      retailerRow('lost', 'STUDIO_SHOOT'),
      retailerRow('paid', 'STUDIO_SHOOT'),
    ]);
    m.photoFind.mockImplementation(({ where }) =>
      Promise.resolve(where.metadata.equals === 'paid' ? { id: 'p1' } : null),
    );
    const res = await handleQuotaReservationSweep(NOW);
    expect(m.refund).toHaveBeenCalledExactlyOnceWith('lost', 'STUDIO_SHOOT');
    expect(m.spent).toHaveBeenCalledExactlyOnceWith('paid', 'STUDIO_SHOOT');
    expect(res).toEqual({ spent: 1, refunded: 1, failed: 0 });
  });

  it('try-on: gpu_ms or COMPLETED = spent; FAILED without gpu_ms or a missing row = refunded', async () => {
    m.findMany.mockResolvedValue([
      retailerRow('ran', 'TRY_ON_GENERATION'),
      retailerRow('done', 'TRY_ON_GENERATION'),
      retailerRow('early', 'TRY_ON_GENERATION'),
      retailerRow('gone', 'TRY_ON_GENERATION'),
    ]);
    const jobs: Record<string, unknown> = {
      ran: { gpu_ms: 4000, status: 'DISCARDED' },
      done: { gpu_ms: null, status: 'COMPLETED' },
      early: { gpu_ms: null, status: 'FAILED' },
    };
    m.tryOnFind.mockImplementation(({ where }) => Promise.resolve(jobs[where.id] ?? null));
    const res = await handleQuotaReservationSweep(NOW);
    expect(m.spent.mock.calls.map((c) => c[0])).toEqual(['ran', 'done']);
    expect(m.refund.mock.calls.map((c) => c[0])).toEqual(['early', 'gone']);
    expect(res).toEqual({ spent: 2, refunded: 2, failed: 0 });
  });

  it('shopper rows use the customer-scope functions; My Style has no trace so it refunds', async () => {
    m.findMany.mockResolvedValue([
      customerRow('a', 'STYLE_ANALYSIS'),
      customerRow('b', 'TRY_ON_GENERATION'),
    ]);
    m.tryOnFind.mockResolvedValue({ gpu_ms: 1, status: 'COMPLETED' });
    await handleQuotaReservationSweep(NOW);
    expect(m.refundCustomer).toHaveBeenCalledExactlyOnceWith('a', 'STYLE_ANALYSIS');
    expect(m.spentCustomer).toHaveBeenCalledExactlyOnceWith('b', 'TRY_ON_GENERATION');
    expect(m.refund).not.toHaveBeenCalled();
    expect(m.spent).not.toHaveBeenCalled();
  });

  // Review finding 1 (RC-102): pins a KNOWN GAP. A try-on whose GPU ran but whose R2 save threw is
  // FAILED with gpu_ms null; if its mark-spent write had also failed, the row is still RESERVED
  // and the sweep refunds a paid run. Update this test if the failure path starts writing gpu_ms.
  it('KNOWN GAP: a still-RESERVED try-on row on a FAILED job with no gpu_ms is refunded', async () => {
    m.findMany.mockResolvedValue([retailerRow('paid_but_failed_save', 'TRY_ON_GENERATION')]);
    m.tryOnFind.mockResolvedValue({ gpu_ms: null, status: 'FAILED' });
    const res = await handleQuotaReservationSweep(NOW);
    expect(m.refund).toHaveBeenCalledExactlyOnceWith('paid_but_failed_save', 'TRY_ON_GENERATION');
    expect(res).toEqual({ spent: 0, refunded: 1, failed: 0 });
  });

  it('one failing row is counted and the rest still settle', async () => {
    m.findMany.mockResolvedValue([
      retailerRow('bad', 'STUDIO_SHOOT'),
      retailerRow('ok', 'STUDIO_SHOOT'),
    ]);
    m.refund.mockImplementation((id: string) =>
      id === 'bad' ? Promise.reject(new Error('db down')) : Promise.resolve(),
    );
    const res = await handleQuotaReservationSweep(NOW);
    expect(res).toEqual({ spent: 0, refunded: 1, failed: 1 });
    expect(m.refund).toHaveBeenCalledTimes(2);
  });
});
