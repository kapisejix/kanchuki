// Shared store-level engagement view — F-037 Phase 3 (admin) + Phase 4
// (retailer-facing). Both callers read the same Phase 2 rollup table
// (RetailerEngagementDaily) and must compute the range the same way, so the
// merge/funnel math lives here once rather than twice.

import { prisma } from '@kanchuki/db';

export interface TopEntry {
  value: string;
  count: number;
}

/** Sum counts for the same value across several days' top-N lists, re-rank, take N. */
export function mergeTopLists(lists: unknown[], limit = 10): TopEntry[] {
  const totals = new Map<string, number>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const entry of list as TopEntry[]) {
      if (!entry || typeof entry.value !== 'string') continue;
      totals.set(entry.value, (totals.get(entry.value) ?? 0) + (entry.count ?? 0));
    }
  }
  return [...totals.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** view→favorite→enquiry conversion, guarded against divide-by-zero. */
export function funnelRates(views: number, favorites: number, enquiries: number) {
  const rate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);
  return {
    view_count: views,
    favorite_count: favorites,
    enquiry_count: enquiries,
    view_to_favorite_pct: rate(favorites, views),
    view_to_enquiry_pct: rate(enquiries, views),
  };
}

export interface RetailerEngagementView {
  range_days: number;
  dwell_trend: { date: string; total_dwell_ms: string; view_count: number }[];
  totals: {
    total_dwell_ms: string;
    view_count: number;
    search_count: number;
    favorite_count: number;
    unfavorite_count: number;
    enquiry_count: number;
    zero_result_count: number;
  };
  top_products: TopEntry[];
  top_favorited_products: TopEntry[];
  top_searches: TopEntry[];
  zero_result_terms: TopEntry[];
  funnel: ReturnType<typeof funnelRates>;
}

/** Aggregate-only, one retailer's own RetailerEngagementDaily rows over `days`. */
export async function loadRetailerEngagementView(
  retailerId: string,
  requestedDays: number,
): Promise<RetailerEngagementView> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - requestedDays);

  const days = await prisma.retailerEngagementDaily.findMany({
    where: { retailer_id: retailerId, date: { gte: since } },
    orderBy: { date: 'asc' },
  });

  const dwell_trend = days.map((d) => ({
    date: d.date.toISOString().slice(0, 10),
    total_dwell_ms: d.total_dwell_ms.toString(),
    view_count: d.view_count,
  }));

  const totals = days.reduce(
    (acc, d) => ({
      total_dwell_ms: acc.total_dwell_ms + d.total_dwell_ms,
      view_count: acc.view_count + d.view_count,
      search_count: acc.search_count + d.search_count,
      favorite_count: acc.favorite_count + d.favorite_count,
      unfavorite_count: acc.unfavorite_count + d.unfavorite_count,
      enquiry_count: acc.enquiry_count + d.enquiry_count,
      zero_result_count: acc.zero_result_count + d.zero_result_count,
    }),
    {
      total_dwell_ms: 0n,
      view_count: 0,
      search_count: 0,
      favorite_count: 0,
      unfavorite_count: 0,
      enquiry_count: 0,
      zero_result_count: 0,
    },
  );

  return {
    range_days: requestedDays,
    dwell_trend,
    totals: { ...totals, total_dwell_ms: totals.total_dwell_ms.toString() },
    top_products: mergeTopLists(days.map((d) => d.top_products)),
    top_favorited_products: mergeTopLists(days.map((d) => d.top_favorited_products)),
    top_searches: mergeTopLists(days.map((d) => d.top_searches)),
    zero_result_terms: mergeTopLists(days.map((d) => d.zero_result_terms)),
    funnel: funnelRates(totals.view_count, totals.favorite_count, totals.enquiry_count),
  };
}
