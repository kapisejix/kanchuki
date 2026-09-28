// Real social-proof counts for the customer storefront — F-037, the
// engagement idea the spec records as "deferred, not blocked"
// (docs/tasks/pending/customer-engagement-analytics.md §2 row 5 + §6 Phase 4).
//
// The source is the Phase 2 nightly rollup (`RetailerEngagementDaily`), never
// `customer_interactions`. The spec's own §7.2 rule — "never query raw
// CustomerInteraction for dashboard charts" — applies with more force on the
// public hot path, where one WhatsApp broadcast fans out to thousands of reads.
// This is the same `mergeTopLists()` the admin and retailer engagement views
// use; the only new thing here is the per-product map shape the storefront wants.
//
// Two honesty rules, both straight from the spec (§2 row 5 "real counts only,
// never fabricated"; §7.4 "do not ship '12 people viewed this' as a
// static/fake number"):
//
//   1. A product with no entry in the map gets no chip. A zero is never
//      emitted as a stand-in — because a zero would be a claim this data cannot
//      support. Only the top 10 VIEWed / top 10 FAVORITEd products per day are
//      stored, so "not in the list" means "did not make the top 10", which is
//      not the same fact as "nobody viewed it".
//   2. The window the counts actually cover is reported alongside them. The
//      rollup summarizes completed days only (the job runs 01:00 UTC for the
//      previous day), so the newest row is normally *yesterday* — the client
//      labels the chip from `window`, so it can say "viewed yesterday" instead
//      of misdating the count as "today".

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { mergeTopLists } from '../../lib/engagement-view.js';
import { withPublicCache } from '../../lib/public-cache.js';
import { notFound, validationError } from '../../plugins/error-handler.js';

// Daily aggregate — 300s matches the other rollup-derived public reads.
const CACHE_HEADERS = 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600';
/** "this week" = the last 7 rollup days, inclusive of the newest. */
const WEEK_DAYS = 7;
/** The job stores top-10 lists, so 10 is this endpoint's ceiling per list. */
const TOP_N = 10;

/**
 * Both counts are optional on purpose. A missing key means "this store has no
 * real count for this product" and the client renders no chip; a present key
 * is always a real summed count of real events.
 */
export interface SocialProofCounts {
  viewed_today?: number;
  favorited_week?: number;
}

export interface SocialProofWindow {
  /** UTC day `viewed_today` comes from — the newest rollup day, or null when
   *  the store has no rollup yet. */
  today: string | null;
  /** Inclusive UTC day range `favorited_week` covers. */
  week_from: string | null;
  week_to: string | null;
}

export interface SocialProofResult {
  products: Record<string, SocialProofCounts>;
  window: SocialProofWindow;
}

interface RollupDay {
  date: Date;
  top_products: unknown;
  top_favorited_products: unknown;
}

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/** UTC midnight `days` before `now` (injectable for tests). */
function utcDaysAgo(days: number, now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

/**
 * Fold the store's rollup days into the per-product chip map.
 *
 * `days` must be newest-first: `viewed_today` is the newest day ALONE (one
 * day's list, straight through), while `favorited_week` sums counts per product
 * across the week's rows and re-ranks — `mergeTopLists`, the same
 * sum-then-rerank the admin and retailer views do, not concatenate-and-truncate
 * (which would silently under-count a product that ranked on two days).
 */
export function buildSocialProofMap(days: RollupDay[]): SocialProofResult {
  const newest = days[0] ?? null;
  const week = days.slice(0, WEEK_DAYS);
  const oldest = week[week.length - 1] ?? null;

  const viewedToday = mergeTopLists(
    days.slice(0, 1).map((d) => d.top_products),
    TOP_N,
  );
  const favoritedWeek = mergeTopLists(
    week.map((d) => d.top_favorited_products),
    TOP_N,
  );

  const products: Record<string, SocialProofCounts> = {};
  // Each key is written only alongside a real count — nothing is seeded to 0.
  for (const { value, count } of viewedToday) products[value] = { viewed_today: count };
  for (const { value, count } of favoritedWeek) {
    const entry = products[value];
    if (entry) entry.favorited_week = count;
    else products[value] = { favorited_week: count };
  }

  return {
    products,
    window: {
      today: newest ? isoDay(newest.date) : null,
      week_from: oldest ? isoDay(oldest.date) : null,
      week_to: newest ? isoDay(newest.date) : null,
    },
  };
}

export const publicEngagementChipsRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /engagement-chips?store=<slug> ─────────────────────────
  // Aggregate counts only: no customer id in the request, no per-customer row
  // read, no way to name a second store — the §4 privacy boundary holds by
  // construction, the same way the retailer-facing view does.
  server.get(
    '/engagement-chips',
    { config: { cacheControl: CACHE_HEADERS } },
    async (request, reply) => {
      const parsed = z
        .object({ store: z.string().trim().min(1).max(200) })
        .safeParse(request.query);
      if (!parsed.success) throw validationError('store is required');

      reply.header('Cache-Control', CACHE_HEADERS);
      return withPublicCache(request.url, async () => {
        const retailer = await prisma.retailer.findFirst({
          where: {
            public_slug: parsed.data.store,
            deleted_at: null,
            is_suspended: false,
          },
          select: { id: true },
        });
        if (!retailer) throw notFound('Store');

        // Newest-first, so buildSocialProofMap can treat index 0 as "today".
        // `take` matches the `since` window, so the query and the merge agree on
        // what "7 days" means instead of relying on the caller's default limit.
        const days = await prisma.retailerEngagementDaily.findMany({
          where: { retailer_id: retailer.id, date: { gte: utcDaysAgo(WEEK_DAYS) } },
          orderBy: { date: 'desc' },
          take: WEEK_DAYS,
          select: { date: true, top_products: true, top_favorited_products: true },
        });

        return { data: buildSocialProofMap(days) };
      });
    },
  );
};
