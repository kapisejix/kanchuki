// The rollup JSON contract — pins the writer's emitted entry shape to what its
// readers actually read (F-037 Phase 2 → Phases 3/4).
//
// WHY THIS FILE EXISTS. The four `RetailerEngagementDaily` JSON columns are
// written by one module and read by two, and nothing connected the two ends.
// `engagement-aggregate.test.ts` pinned the writer against a hand-written
// expectation; `public-engagement-chips.test.ts` and the admin/retailer views
// fed `mergeTopLists()` hand-written fixtures. Each side was therefore pinned
// to `{ value, count }` *independently* — which means a rename on the writer
// alone fails only the writer's own test, whose expectation is itself a
// literal. Every reader test stays green, so the cheapest way back to a green
// suite (update that literal) is exactly the change that makes both readers
// return `[]`: not a crash, not an assertion failure, just an empty list on the
// dashboard and no chips on the storefront.
//
// `schema.prisma` had already drifted the same way: its comment documented
// `{ product_id, count }` for two of these columns and `{ query, count }` for
// the other two, none of which the writer has ever emitted. That is corrected,
// but a comment is prose. These are the assertions.
//
// So: drive the REAL writer, capture what it actually hands to Prisma, and feed
// that same payload to the REAL readers. Rename a key on either side and this
// goes red with the reader's name in the failure.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockQueryRawUnsafe,
  mockRetailerDailyUpsert,
  mockCustomerSummaryUpsert,
  mockDailyFindMany,
} = vi.hoisted(() => ({
  mockQueryRawUnsafe: vi.fn(),
  mockRetailerDailyUpsert: vi.fn(),
  mockCustomerSummaryUpsert: vi.fn(),
  mockDailyFindMany: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    $queryRawUnsafe: mockQueryRawUnsafe,
    retailerEngagementDaily: {
      upsert: mockRetailerDailyUpsert,
      findMany: mockDailyFindMany,
    },
    customerEngagementSummary: { upsert: mockCustomerSummaryUpsert },
  },
}));

// Importing the chips route pulls this in; the route module is only imported
// here for its pure `buildSocialProofMap`, so stub the Redis wrapper rather
// than opening a client (same reason the chips route test stubs it).
vi.mock('../lib/public-cache.js', () => ({
  withPublicCache: async (_url: string, fn: () => Promise<unknown>) => fn(),
}));

import { loadRetailerEngagementView, mergeTopLists } from '../lib/engagement-view.js';
import { buildSocialProofMap } from '../routes/public/public-engagement-chips.js';
import { handleEngagementAggregate } from './engagement-aggregate.js';

const NOW = new Date('2026-09-29T01:00:00.000Z'); // the job runs just after midnight UTC
const ROLLUP_DAY = new Date('2026-09-28T00:00:00.000Z'); // "yesterday" relative to NOW
const RETAILER = 'r_contract';

/** The four JSON columns, in the order the writer builds them. */
const ROLLUP_COLUMNS = [
  'top_products',
  'top_favorited_products',
  'top_searches',
  'zero_result_terms',
] as const;

/** One retailer's day, exactly as the six raw queries return it. */
function mockWriterQueries() {
  mockQueryRawUnsafe
    .mockResolvedValueOnce([
      {
        retailer_id: RETAILER,
        total_dwell_ms: '4200',
        view_count: 12,
        search_count: 3,
        favorite_count: 4,
        unfavorite_count: 0,
        enquiry_count: 1,
        zero_result_count: 1,
      },
    ]) // dayCounts
    .mockResolvedValueOnce([
      { retailer_id: RETAILER, value: 'p_cotton', cnt: 7 },
      { retailer_id: RETAILER, value: 'p_silk', cnt: 2 },
    ]) // topProducts
    .mockResolvedValueOnce([
      { retailer_id: RETAILER, value: 'p_cotton', cnt: 3 },
      { retailer_id: RETAILER, value: 'p_lehenga', cnt: 1 },
    ]) // topFavorited
    .mockResolvedValueOnce([{ retailer_id: RETAILER, value: 'cotton suit', cnt: 5 }]) // topSearches
    .mockResolvedValueOnce([{ retailer_id: RETAILER, value: 'lehenga 1500', cnt: 2 }]) // zeroResultTerms
    .mockResolvedValueOnce([]); // customerSummaries
}

/**
 * Run the real writer and return the object it handed Prisma for RETAILER —
 * i.e. what would land in the JSON columns, not a fixture standing in for it.
 */
async function writerCreatePayload(): Promise<Record<string, unknown>> {
  mockWriterQueries();
  await handleEngagementAggregate({ now: NOW });

  const call = mockRetailerDailyUpsert.mock.calls.find(
    (c) => c[0].where.retailer_id_date.retailer_id === RETAILER,
  );
  if (!call) throw new Error('writer did not upsert a row for the fixture retailer');
  return call[0].create as Record<string, unknown>;
}

/** Read one JSON column out of the captured payload, failing loudly if absent. */
function entries(payload: Record<string, unknown>, column: string): Record<string, unknown>[] {
  const raw = payload[column];
  if (!Array.isArray(raw)) throw new Error(`expected the writer to emit ${column} as an array`);
  return raw as Record<string, unknown>[];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRetailerDailyUpsert.mockResolvedValue({});
  mockCustomerSummaryUpsert.mockResolvedValue({});
});

describe('RetailerEngagementDaily rollup JSON contract (writer ↔ readers)', () => {
  it('the writer emits { value, count } and no other keys, for all four columns', async () => {
    const create = await writerCreatePayload();

    for (const column of ROLLUP_COLUMNS) {
      const list = entries(create, column);
      expect(list.length).toBeGreaterThan(0);
      for (const entry of list) {
        // Exact key set — this is the assertion a one-sided rename hits first.
        expect(Object.keys(entry).sort()).toEqual(['count', 'value']);
        expect(typeof entry.value).toBe('string');
        expect(typeof entry.count).toBe('number');
      }
    }
  });

  it('the shared reader is genuinely key-sensitive, so the round-trips below are not vacuous', () => {
    // Falsification for everything that follows: if mergeTopLists accepted the
    // keys the schema comment used to advertise, the round-trip tests would
    // pass no matter what the writer emitted. It does not accept them.
    expect(mergeTopLists([[{ product_id: 'p_cotton', count: 7 }]])).toEqual([]);
    expect(mergeTopLists([[{ query: 'cotton suit', count: 5 }]])).toEqual([]);
    // ...and it does read the key the writer actually writes.
    expect(mergeTopLists([[{ value: 'p_cotton', count: 7 }]])).toEqual([
      { value: 'p_cotton', count: 7 },
    ]);
  });

  it("reader 1 — the admin/retailer view recovers the writer's own payload", async () => {
    const create = await writerCreatePayload();

    // The row shape loadRetailerEngagementView selects, carrying the writer's
    // columns verbatim — nothing re-typed by hand.
    mockDailyFindMany.mockResolvedValue([{ ...create }]);

    const view = await loadRetailerEngagementView(RETAILER, 7);

    expect(view.top_products).toEqual([
      { value: 'p_cotton', count: 7 },
      { value: 'p_silk', count: 2 },
    ]);
    expect(view.top_favorited_products).toEqual([
      { value: 'p_cotton', count: 3 },
      { value: 'p_lehenga', count: 1 },
    ]);
    expect(view.top_searches).toEqual([{ value: 'cotton suit', count: 5 }]);
    expect(view.zero_result_terms).toEqual([{ value: 'lehenga 1500', count: 2 }]);
  });

  it("reader 2 — the storefront chip map recovers the writer's own payload", async () => {
    const create = await writerCreatePayload();

    const { products, window: win } = buildSocialProofMap([
      {
        date: create.date as Date,
        top_products: create.top_products,
        top_favorited_products: create.top_favorited_products,
      },
    ]);

    // Real writer counts, with the honesty rule still holding: p_silk was
    // viewed but never favorited, p_lehenga favorited but never viewed, and
    // neither gains a zeroed key for the count it does not have.
    expect(products).toEqual({
      p_cotton: { viewed_today: 7, favorited_week: 3 },
      p_silk: { viewed_today: 2 },
      p_lehenga: { favorited_week: 1 },
    });
    expect(win).toEqual({
      today: '2026-09-28',
      week_from: '2026-09-28',
      week_to: '2026-09-28',
    });
    expect(ROLLUP_DAY.toISOString().slice(0, 10)).toBe('2026-09-28');
  });
});
