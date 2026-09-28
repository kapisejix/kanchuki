// F-037 Phase 2 — nightly engagement aggregation
// (docs/tasks/pending/customer-engagement-analytics.md §6).
//
// Three things are asserted:
//  1. targetDayStart is pure and picks the day BEFORE `now`, at UTC midnight —
//     the job must never summarize a day that has not fully ended.
//  2. The five raw queries' results land in the right upsert fields — the
//     bigint dwell sum, the per-type counts, and the three top-N lists each
//     grouped by their own retailer_id, not cross-contaminated.
//  3. A write failure on one row is isolated (counted, not thrown) so one bad
//     row cannot abandon the rest of the night's rollup.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQueryRawUnsafe, mockRetailerDailyUpsert, mockCustomerSummaryUpsert } = vi.hoisted(
  () => ({
    mockQueryRawUnsafe: vi.fn(),
    mockRetailerDailyUpsert: vi.fn(),
    mockCustomerSummaryUpsert: vi.fn(),
  }),
);

vi.mock('@kanchuki/db', () => ({
  prisma: {
    $queryRawUnsafe: mockQueryRawUnsafe,
    retailerEngagementDaily: { upsert: mockRetailerDailyUpsert },
    customerEngagementSummary: { upsert: mockCustomerSummaryUpsert },
  },
}));

import { handleEngagementAggregate } from './engagement-aggregate.js';

const NOW = new Date('2026-09-29T01:00:00.000Z'); // job runs just after midnight UTC
const DAY_START = new Date('2026-09-28T00:00:00.000Z'); // "yesterday" relative to NOW

describe('handleEngagementAggregate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRetailerDailyUpsert.mockResolvedValue({});
    mockCustomerSummaryUpsert.mockResolvedValue({});
  });

  it('summarizes the day BEFORE now, never the day still in progress', async () => {
    mockQueryRawUnsafe.mockResolvedValue([]); // all 5 raw calls return empty
    const summary = await handleEngagementAggregate({ now: NOW });
    expect(summary.target_day).toBe('2026-09-28');

    // The first query's date-range params are the actual bound the job enforces.
    const [, dayStartArg, dayEndArg] = mockQueryRawUnsafe.mock.calls[0] as [string, Date, Date];
    expect(dayStartArg.toISOString()).toBe('2026-09-28T00:00:00.000Z');
    expect(dayEndArg.toISOString()).toBe('2026-09-29T00:00:00.000Z');
  });

  it('writes dwell/count/top-N fields per retailer without cross-contamination', async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([
        {
          retailer_id: 'r_1',
          total_dwell_ms: '4200',
          view_count: 3,
          search_count: 2,
          favorite_count: 1,
          unfavorite_count: 0,
          enquiry_count: 1,
          zero_result_count: 1,
        },
        {
          retailer_id: 'r_2',
          total_dwell_ms: '9000',
          view_count: 5,
          search_count: 0,
          favorite_count: 0,
          unfavorite_count: 0,
          enquiry_count: 0,
          zero_result_count: 0,
        },
      ]) // dayCounts
      .mockResolvedValueOnce([
        { retailer_id: 'r_1', value: 'p_1', cnt: 3 },
        { retailer_id: 'r_2', value: 'p_9', cnt: 5 },
      ]) // topProducts
      .mockResolvedValueOnce([{ retailer_id: 'r_1', value: 'pink cotton suit', cnt: 2 }]) // topSearches
      .mockResolvedValueOnce([{ retailer_id: 'r_1', value: 'lehenga under 1500', cnt: 1 }]) // zeroResultTerms
      .mockResolvedValueOnce([]); // customerSummaries

    const summary = await handleEngagementAggregate({ now: NOW });

    expect(summary.retailer_days_written).toBe(2);
    expect(mockRetailerDailyUpsert).toHaveBeenCalledTimes(2);

    const r1Call = mockRetailerDailyUpsert.mock.calls.find(
      (c) => c[0].where.retailer_id_date.retailer_id === 'r_1',
    );
    if (!r1Call) throw new Error('expected r_1 upsert call not found');
    expect(r1Call[0]).toMatchObject({
      where: { retailer_id_date: { retailer_id: 'r_1', date: DAY_START } },
      create: expect.objectContaining({
        total_dwell_ms: 4200n,
        view_count: 3,
        search_count: 2,
        favorite_count: 1,
        enquiry_count: 1,
        zero_result_count: 1,
        top_products: [{ value: 'p_1', count: 3 }],
        top_searches: [{ value: 'pink cotton suit', count: 2 }],
        zero_result_terms: [{ value: 'lehenga under 1500', count: 1 }],
      }),
    });

    // r_2 had no search/top-product-list rows of its own beyond one product —
    // it must not see r_1's search terms.
    const r2Call = mockRetailerDailyUpsert.mock.calls.find(
      (c) => c[0].where.retailer_id_date.retailer_id === 'r_2',
    );
    if (!r2Call) throw new Error('expected r_2 upsert call not found');
    expect(r2Call[0].create).toMatchObject({
      total_dwell_ms: 9000n,
      top_products: [{ value: 'p_9', count: 5 }],
      top_searches: [],
      zero_result_terms: [],
    });
  });

  it('recomputes customer summaries cumulatively, converting bigint text to BigInt', async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([]) // dayCounts
      .mockResolvedValueOnce([]) // topProducts
      .mockResolvedValueOnce([]) // topSearches
      .mockResolvedValueOnce([]) // zeroResultTerms
      .mockResolvedValueOnce([
        {
          customer_account_id: 'ca_1',
          retailer_id: 'r_1',
          total_dwell_ms: '15000',
          view_count: 7,
          favorite_count: 2,
          enquiry_count: 1,
          last_active_at: new Date('2026-09-27T10:00:00.000Z'),
        },
      ]);

    const summary = await handleEngagementAggregate({ now: NOW });

    expect(summary.customer_summaries_written).toBe(1);
    expect(mockCustomerSummaryUpsert).toHaveBeenCalledWith({
      where: {
        customer_account_id_retailer_id: { customer_account_id: 'ca_1', retailer_id: 'r_1' },
      },
      create: {
        customer_account_id: 'ca_1',
        retailer_id: 'r_1',
        total_dwell_ms: 15000n,
        view_count: 7,
        favorite_count: 2,
        enquiry_count: 1,
        last_active_at: new Date('2026-09-27T10:00:00.000Z'),
      },
      update: {
        total_dwell_ms: 15000n,
        view_count: 7,
        favorite_count: 2,
        enquiry_count: 1,
        last_active_at: new Date('2026-09-27T10:00:00.000Z'),
      },
    });
  });

  it('isolates a failed row: counted as an error, the rest of the run still completes', async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([
        {
          retailer_id: 'r_bad',
          total_dwell_ms: '0',
          view_count: 1,
          search_count: 0,
          favorite_count: 0,
          unfavorite_count: 0,
          enquiry_count: 0,
          zero_result_count: 0,
        },
        {
          retailer_id: 'r_ok',
          total_dwell_ms: '0',
          view_count: 1,
          search_count: 0,
          favorite_count: 0,
          unfavorite_count: 0,
          enquiry_count: 0,
          zero_result_count: 0,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    mockRetailerDailyUpsert.mockImplementation(
      (args: { where: { retailer_id_date: { retailer_id: string } } }) => {
        if (args.where.retailer_id_date.retailer_id === 'r_bad') {
          throw new Error('constraint violation');
        }
        return Promise.resolve({});
      },
    );

    const summary = await handleEngagementAggregate({ now: NOW });

    expect(summary.errors).toBe(1);
    expect(summary.retailer_days_written).toBe(1); // only r_ok counted
    expect(mockRetailerDailyUpsert).toHaveBeenCalledTimes(2); // both attempted
  });
});
