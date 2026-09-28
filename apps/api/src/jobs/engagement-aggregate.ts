// Nightly engagement aggregation — F-037 Phase 2
// (docs/tasks/pending/customer-engagement-analytics.md §6).
//
// Reads raw `CustomerInteraction` rows (never queried live by a dashboard —
// §3.3/§7.2 of the spec) and writes two rollups:
//
//  - RetailerEngagementDaily: one row per (retailer, day). Fully recomputed
//    for the target day on every run (not incremented), so a rerun for the
//    same day is always safe — no watermark/cursor state to get wrong.
//  - CustomerEngagementSummary: one row per (customer, retailer), recomputed
//    from ALL of that pair's history every run. Same safety property, at the
//    cost of rescanning the whole table nightly.
//
// ponytail: full-table rescan for CustomerEngagementSummary, no incremental
// state. Fine at MVP interaction volume; switch to a watermark (store the
// last folded-in created_at on the summary row itself) if this job's runtime
// becomes a problem — the row already has a natural place to put it
// (last_active_at doubles as the watermark once dwell/counts are stored
// alongside it).
//
// The target day is always "yesterday" relative to `now` (UTC) — the day
// just completed, matching the referral jobs' convention of only summarizing
// periods that have fully ended.

import { prisma } from '@kanchuki/db';

const TOP_N = 10;

/** UTC midnight of the day before `now`. */
function targetDayStart(now: Date): Date {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - 1);
  return start;
}

interface RetailerDayCounts {
  retailer_id: string;
  total_dwell_ms: string; // bigint comes back as text — see the ::text casts below
  view_count: number;
  search_count: number;
  favorite_count: number;
  unfavorite_count: number;
  enquiry_count: number;
  zero_result_count: number;
}

interface TopRow {
  retailer_id: string;
  value: string;
  cnt: number;
}

export interface EngagementAggregateSummary {
  target_day: string; // YYYY-MM-DD (UTC)
  retailer_days_written: number;
  customer_summaries_written: number;
  errors: number;
}

/**
 * Run the nightly rollup. `now` is injectable for tests; the job always
 * summarizes the UTC day immediately before it.
 */
export async function handleEngagementAggregate(
  opts: { now?: Date } = {},
): Promise<EngagementAggregateSummary> {
  const now = opts.now ?? new Date();
  const dayStart = targetDayStart(now);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const summary: EngagementAggregateSummary = {
    target_day: dayStart.toISOString().slice(0, 10),
    retailer_days_written: 0,
    customer_summaries_written: 0,
    errors: 0,
  };

  // ─── Retailer-day counts + dwell ────────────────────────────────
  const dayCounts = await prisma.$queryRawUnsafe<RetailerDayCounts[]>(
    `SELECT
       retailer_id,
       COALESCE(SUM(CASE WHEN type = 'VIEW' THEN (metadata->>'dwell_ms')::bigint ELSE 0 END), 0)::text AS total_dwell_ms,
       COUNT(*) FILTER (WHERE type = 'VIEW')::int AS view_count,
       COUNT(*) FILTER (WHERE type = 'SEARCH')::int AS search_count,
       COUNT(*) FILTER (WHERE type = 'FAVORITE')::int AS favorite_count,
       COUNT(*) FILTER (WHERE type = 'UNFAVORITE')::int AS unfavorite_count,
       COUNT(*) FILTER (WHERE type = 'ENQUIRY')::int AS enquiry_count,
       COUNT(*) FILTER (WHERE type = 'SEARCH' AND (metadata->>'result_count')::int = 0)::int AS zero_result_count
     FROM customer_interactions
     WHERE created_at >= $1 AND created_at < $2
     GROUP BY retailer_id`,
    dayStart,
    dayEnd,
  );

  // ─── Top-10 viewed products per retailer, that day ─────────────
  const topProducts = await prisma.$queryRawUnsafe<TopRow[]>(
    `SELECT retailer_id, product_id AS value, cnt::int AS cnt FROM (
       SELECT retailer_id, product_id, COUNT(*) AS cnt,
              ROW_NUMBER() OVER (PARTITION BY retailer_id ORDER BY COUNT(*) DESC) AS rn
       FROM customer_interactions
       WHERE type = 'VIEW' AND product_id IS NOT NULL
         AND created_at >= $1 AND created_at < $2
       GROUP BY retailer_id, product_id
     ) ranked WHERE rn <= ${TOP_N}`,
    dayStart,
    dayEnd,
  );

  // ─── Top-10 search terms per retailer, that day ────────────────
  const topSearches = await prisma.$queryRawUnsafe<TopRow[]>(
    `SELECT retailer_id, query AS value, cnt::int AS cnt FROM (
       SELECT retailer_id, metadata->>'query' AS query, COUNT(*) AS cnt,
              ROW_NUMBER() OVER (PARTITION BY retailer_id ORDER BY COUNT(*) DESC) AS rn
       FROM customer_interactions
       WHERE type = 'SEARCH' AND COALESCE(metadata->>'query', '') <> ''
         AND created_at >= $1 AND created_at < $2
       GROUP BY retailer_id, metadata->>'query'
     ) ranked WHERE rn <= ${TOP_N}`,
    dayStart,
    dayEnd,
  );

  // ─── Top-10 zero-result search terms per retailer, that day ────
  // The catalog-gap report (§3.3): "12 customers searched X and found nothing".
  const zeroResultTerms = await prisma.$queryRawUnsafe<TopRow[]>(
    `SELECT retailer_id, query AS value, cnt::int AS cnt FROM (
       SELECT retailer_id, metadata->>'query' AS query, COUNT(*) AS cnt,
              ROW_NUMBER() OVER (PARTITION BY retailer_id ORDER BY COUNT(*) DESC) AS rn
       FROM customer_interactions
       WHERE type = 'SEARCH' AND COALESCE(metadata->>'query', '') <> ''
         AND (metadata->>'result_count')::int = 0
         AND created_at >= $1 AND created_at < $2
       GROUP BY retailer_id, metadata->>'query'
     ) ranked WHERE rn <= ${TOP_N}`,
    dayStart,
    dayEnd,
  );

  const groupByRetailer = (rows: TopRow[]): Map<string, { value: string; count: number }[]> => {
    const map = new Map<string, { value: string; count: number }[]>();
    for (const row of rows) {
      const list = map.get(row.retailer_id) ?? [];
      list.push({ value: row.value, count: row.cnt });
      map.set(row.retailer_id, list);
    }
    return map;
  };
  const topProductsByRetailer = groupByRetailer(topProducts);
  const topSearchesByRetailer = groupByRetailer(topSearches);
  const zeroResultByRetailer = groupByRetailer(zeroResultTerms);

  for (const row of dayCounts) {
    try {
      await prisma.retailerEngagementDaily.upsert({
        where: { retailer_id_date: { retailer_id: row.retailer_id, date: dayStart } },
        create: {
          retailer_id: row.retailer_id,
          date: dayStart,
          total_dwell_ms: BigInt(row.total_dwell_ms),
          view_count: row.view_count,
          search_count: row.search_count,
          favorite_count: row.favorite_count,
          unfavorite_count: row.unfavorite_count,
          enquiry_count: row.enquiry_count,
          zero_result_count: row.zero_result_count,
          top_products: (topProductsByRetailer.get(row.retailer_id) ?? []) as never,
          top_searches: (topSearchesByRetailer.get(row.retailer_id) ?? []) as never,
          zero_result_terms: (zeroResultByRetailer.get(row.retailer_id) ?? []) as never,
        },
        update: {
          total_dwell_ms: BigInt(row.total_dwell_ms),
          view_count: row.view_count,
          search_count: row.search_count,
          favorite_count: row.favorite_count,
          unfavorite_count: row.unfavorite_count,
          enquiry_count: row.enquiry_count,
          zero_result_count: row.zero_result_count,
          top_products: (topProductsByRetailer.get(row.retailer_id) ?? []) as never,
          top_searches: (topSearchesByRetailer.get(row.retailer_id) ?? []) as never,
          zero_result_terms: (zeroResultByRetailer.get(row.retailer_id) ?? []) as never,
        },
      });
      summary.retailer_days_written += 1;
    } catch (error) {
      summary.errors += 1;
      console.error(
        `[engagement-aggregate] retailer-day write failed for ${row.retailer_id}:`,
        error,
      );
    }
  }

  // ─── Customer × retailer cumulative summary — full recompute ──
  interface CustomerSummaryRow {
    customer_account_id: string;
    retailer_id: string;
    total_dwell_ms: string;
    view_count: number;
    favorite_count: number;
    enquiry_count: number;
    last_active_at: Date;
  }
  const customerSummaries = await prisma.$queryRawUnsafe<CustomerSummaryRow[]>(
    `SELECT
       customer_account_id,
       retailer_id,
       COALESCE(SUM(CASE WHEN type = 'VIEW' THEN (metadata->>'dwell_ms')::bigint ELSE 0 END), 0)::text AS total_dwell_ms,
       COUNT(*) FILTER (WHERE type = 'VIEW')::int AS view_count,
       COUNT(*) FILTER (WHERE type = 'FAVORITE')::int AS favorite_count,
       COUNT(*) FILTER (WHERE type = 'ENQUIRY')::int AS enquiry_count,
       MAX(created_at) AS last_active_at
     FROM customer_interactions
     GROUP BY customer_account_id, retailer_id`,
  );

  for (const row of customerSummaries) {
    try {
      await prisma.customerEngagementSummary.upsert({
        where: {
          customer_account_id_retailer_id: {
            customer_account_id: row.customer_account_id,
            retailer_id: row.retailer_id,
          },
        },
        create: {
          customer_account_id: row.customer_account_id,
          retailer_id: row.retailer_id,
          total_dwell_ms: BigInt(row.total_dwell_ms),
          view_count: row.view_count,
          favorite_count: row.favorite_count,
          enquiry_count: row.enquiry_count,
          last_active_at: row.last_active_at,
        },
        update: {
          total_dwell_ms: BigInt(row.total_dwell_ms),
          view_count: row.view_count,
          favorite_count: row.favorite_count,
          enquiry_count: row.enquiry_count,
          last_active_at: row.last_active_at,
        },
      });
      summary.customer_summaries_written += 1;
    } catch (error) {
      summary.errors += 1;
      console.error(
        `[engagement-aggregate] customer-summary write failed for ${row.customer_account_id}/${row.retailer_id}:`,
        error,
      );
    }
  }

  return summary;
}
