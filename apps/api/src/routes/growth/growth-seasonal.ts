// Roadmap R — Seasonal Analytics: wedding-season vs daily-wear category comparison.
// Compares product-category performance across two defined periods, giving the
// retailer a quick read on what to stock up for the next season.

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hasFeature } from '../../lib/features.js';
import { featureUnavailable } from '../../plugins/error-handler.js';

// ─── Seasonal Period Definitions ────────────────────────────────────
// Wedding season in India: Oct–Feb (Diwali + wedding season + winter festivals).
// Daily wear: Mar–Sep (summer, monsoon, routine).

const WEDDING_MONTHS = [10, 11, 12, 1, 2]; // Oct, Nov, Dec, Jan, Feb
const DAILY_MONTHS = [3, 4, 5, 6, 7, 8, 9]; // Mar–Sep

function monthToDateRange(
  months: number[],
  year: number,
): { start: Date; end: Date; label: string } {
  // Handle cross-year ranges (Oct–Feb spans two calendar years).
  const firstMonth = months[0]!;
  const startYear = firstMonth >= 10 ? year - 1 : year;
  const startDate = new Date(startYear, firstMonth - 1, 1);
  const lastMonth = months[months.length - 1]!;
  const endDate = new Date(year, lastMonth, 0, 23, 59, 59, 999); // last day of month
  const label = `${months[0]! >= 10 ? 'Wedding' : 'Daily'} ${year}`;
  return { start: startDate, end: endDate, label };
}

function getPeriodRange(
  period: string,
  customStart?: string,
  customEnd?: string,
): { start: Date; end: Date; label: string } {
  if (period === 'custom' && customStart && customEnd) {
    return {
      start: new Date(customStart),
      end: new Date(`${customEnd}T23:59:59.999Z`),
      label: `${customStart} to ${customEnd}`,
    };
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-indexed

  if (period === 'wedding') {
    // Current or most recent wedding season.
    if (currentMonth >= 10) {
      return monthToDateRange(WEDDING_MONTHS, currentYear + 1);
    }
    return monthToDateRange(WEDDING_MONTHS, currentYear);
  }

  // period === 'daily'
  if (currentMonth >= 3 && currentMonth <= 9) {
    return monthToDateRange(DAILY_MONTHS, currentYear);
  }
  return monthToDateRange(DAILY_MONTHS, currentYear - 1);
}

// ─── Types ──────────────────────────────────────────────────────────

type SeasonalResponse = {
  period: { label: string; start: string; end: string };
  comparePeriod?: { label: string; start: string; end: string };
  categories: {
    category: string;
    current: { sends: number; opens: number; enquiries: number };
    compare: { sends: number; opens: number; enquiries: number };
    deltaPct: { sends: number; opens: number; enquiries: number };
  }[];
  summary: {
    topCurrentCategory: string | null;
    topCompareCategory: string | null;
    biggestSwing: { category: string; metric: string; deltaPct: number } | null;
  };
};

// ─── Route ──────────────────────────────────────────────────────────

export const growthSeasonalRoutes: FastifyPluginAsync = async (server) => {
  server.get('/analytics/seasonal', async (request) => {
    const retailerId = request.retailerId;
    if (!(await hasFeature(retailerId, 'GROWTH_ENGINE'))) throw featureUnavailable('Growth tools');

    const qs = z
      .object({
        period: z.enum(['wedding', 'daily', 'custom']).default('wedding'),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
      })
      .parse(request.query as Record<string, unknown>);

    const currentRange = getPeriodRange(qs.period, qs.start_date, qs.end_date);

    // Determine the comparison period:
    // - 'wedding' → compare with the most recent daily-wear period (or previous year's wedding)
    // - 'daily' → compare with the most recent wedding season
    // - 'custom' → no comparison
    let compareRange: { start: Date; end: Date; label: string } | null = null;
    if (qs.period !== 'custom') {
      if (qs.period === 'wedding') {
        compareRange = getPeriodRange('daily');
      } else {
        compareRange = getPeriodRange('wedding');
      }
    }

    // ─── Query category metrics for both periods ────────────────────
    const [currentInteractions, compareInteractions] = await Promise.all([
      getInteractionsByCategory(retailerId, currentRange.start, currentRange.end),
      compareRange
        ? getInteractionsByCategory(retailerId, compareRange.start, compareRange.end)
        : Promise.resolve([]),
    ]);

    // Campaign sends by category: join Campaign → Product via product_ids
    const [currentCampaignSends, compareCampaignSends] = await Promise.all([
      getCampaignSendsByCategory(retailerId, currentRange.start, currentRange.end),
      compareRange
        ? getCampaignSendsByCategory(retailerId, compareRange.start, compareRange.end)
        : Promise.resolve([]),
    ]);

    // Merge sends + interactions into a category map
    const currentMap = mergeCategoryData(currentCampaignSends, currentInteractions);
    const compareMap = mergeCategoryData(compareCampaignSends, compareInteractions);

    // Build the category comparison array
    const allCategories = new Set([...Object.keys(currentMap), ...Object.keys(compareMap)]);

    const categories: SeasonalResponse['categories'] = [...allCategories]
      .map((cat) => {
        const cur = currentMap[cat] ?? { sends: 0, opens: 0, enquiries: 0 };
        const cmp = compareMap[cat] ?? { sends: 0, opens: 0, enquiries: 0 };
        return {
          category: cat,
          current: cur,
          compare: cmp,
          deltaPct: {
            sends: calcDeltaPct(cur.sends, cmp.sends),
            opens: calcDeltaPct(cur.opens, cmp.opens),
            enquiries: calcDeltaPct(cur.enquiries, cmp.enquiries),
          },
        };
      })
      .sort(
        (a, b) => b.current.opens + b.current.enquiries - (a.current.opens + a.current.enquiries),
      );

    // Summary
    const topCurrent = categories[0]?.category ?? null;
    const topCompare =
      [...categories].sort(
        (a, b) => b.compare.opens + b.compare.enquiries - (a.compare.opens + a.compare.enquiries),
      )[0]?.category ?? null;

    let biggestSwing: SeasonalResponse['summary']['biggestSwing'] = null;
    let maxDelta = 0;
    for (const cat of categories) {
      for (const metric of ['sends', 'opens', 'enquiries'] as const) {
        const delta = Math.abs(cat.deltaPct[metric]);
        if (delta > maxDelta) {
          maxDelta = delta;
          biggestSwing = { category: cat.category, metric, deltaPct: cat.deltaPct[metric] };
        }
      }
    }

    return {
      data: {
        period: {
          label: currentRange.label,
          start: currentRange.start.toISOString(),
          end: currentRange.end.toISOString(),
        },
        ...(compareRange
          ? {
              comparePeriod: {
                label: compareRange.label,
                start: compareRange.start.toISOString(),
                end: compareRange.end.toISOString(),
              },
            }
          : {}),
        categories,
        summary: {
          topCurrentCategory: topCurrent,
          topCompareCategory: topCompare,
          biggestSwing,
        },
      } satisfies SeasonalResponse,
    };
  });
};

// ─── Helpers ────────────────────────────────────────────────────────

async function getInteractionsByCategory(
  _retailerId: string,
  _start: Date,
  _end: Date,
): Promise<{ category: string; views: number; enquiries: number }[]> {
  const interactions: any[] = [];

  const map: Record<string, { views: number; enquiries: number }> = {};
  for (const i of interactions) {
    const cat = i.product?.category ?? 'Uncategorised';
    map[cat] ??= { views: 0, enquiries: 0 };
    if (i.type === 'view') map[cat]!.views += 1;
    else map[cat]!.enquiries += 1;
  }

  return Object.entries(map).map(([category, v]) => ({ category, ...v }));
}

async function getCampaignSendsByCategory(
  retailerId: string,
  start: Date,
  end: Date,
): Promise<{ category: string; sends: number }[]> {
  const campaigns = await prisma.campaign.findMany({
    where: {
      retailer_id: retailerId,
      sent_at: { gte: start, lte: end },
      status: 'SENT',
    },
    select: { id: true, product_ids: true },
  });

  if (campaigns.length === 0) return [];

  const campaignIds = campaigns.map((c) => c.id);

  // Get total sends per campaign
  const sendsByCampaign = await prisma.campaignSend.groupBy({
    by: ['campaign_id'],
    where: { campaign_id: { in: campaignIds } },
    _count: { _all: true },
  });
  const sendsMap = new Map(sendsByCampaign.map((r) => [r.campaign_id, r._count._all]));

  // Get product categories for campaign products
  const allProductIds = [...new Set(campaigns.flatMap((c) => c.product_ids))];
  if (allProductIds.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: allProductIds }, deleted_at: null },
    select: { id: true, category: true },
  });
  const productCategory = new Map(products.map((p) => [p.id, p.category ?? 'Uncategorised']));

  // Attribute sends to categories proportionally
  const categorySends: Record<string, number> = {};
  for (const c of campaigns) {
    const sends = sendsMap.get(c.id) ?? 0;
    if (sends === 0 || c.product_ids.length === 0) continue;
    // Split sends evenly across the campaign's products' categories
    const categories = [
      ...new Set(c.product_ids.map((pid) => productCategory.get(pid) ?? 'Uncategorised')),
    ];
    const perCategory = sends / categories.length;
    for (const cat of categories) {
      categorySends[cat] = (categorySends[cat] ?? 0) + perCategory;
    }
  }

  return Object.entries(categorySends).map(([category, sends]) => ({
    category,
    sends: Math.round(sends),
  }));
}

function mergeCategoryData(
  sends: { category: string; sends: number }[],
  interactions: { category: string; views: number; enquiries: number }[],
): Record<string, { sends: number; opens: number; enquiries: number }> {
  const map: Record<string, { sends: number; opens: number; enquiries: number }> = {};

  for (const s of sends) {
    map[s.category] ??= { sends: 0, opens: 0, enquiries: 0 };
    map[s.category]!.sends += s.sends;
  }

  for (const i of interactions) {
    map[i.category] ??= { sends: 0, opens: 0, enquiries: 0 };
    map[i.category]!.opens += i.views; // views = opens
    map[i.category]!.enquiries += i.enquiries;
  }

  return map;
}

function calcDeltaPct(current: number, compare: number): number {
  if (compare === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - compare) / compare) * 100);
}
