// Task 28: Retailer aggregate taste analytics.
//
// GET /retailers/me/visitor-taste
// Returns aggregated customer preference data for the retailer's store.
// K-anonymity: suppresses any dimension where fewer than 5 customers contributed.
// Data comes from CustomerFashionDNA (passport-scoped) + CustomerStoreVisit.

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';

const K_ANON_THRESHOLD = 5;

/**
 * Merge multiple JSON objects into a single frequency map.
 * Each JSON is { "color_name": count } style.
 */
function mergeFrequencyMaps(maps: Record<string, number>[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const map of maps) {
    for (const [key, val] of Object.entries(map)) {
      result[key] = (result[key] || 0) + val;
    }
  }
  return result;
}

/**
 * Apply k-anonymity: remove any key with count < threshold.
 */
function applyKAnonymity(freq: Record<string, number>, threshold: number): Record<string, number> {
  const filtered: Record<string, number> = {};
  for (const [key, val] of Object.entries(freq)) {
    if (val >= threshold) {
      filtered[key] = val;
    }
  }
  return filtered;
}

/**
 * Compute aggregate budget stats from JSON budget_range fields.
 */
function aggregateBudget(budgets: Record<string, unknown>[]): { avg_min: number | null; avg_max: number | null; range_distribution: Record<string, number> } {
  let totalMin = 0;
  let totalMax = 0;
  let count = 0;
  const ranges: Record<string, number> = {};

  for (const b of budgets) {
    const min = typeof b.min === 'number' ? b.min : typeof b.budget_min === 'number' ? b.budget_min : null;
    const max = typeof b.max === 'number' ? b.max : typeof b.budget_max === 'number' ? b.budget_max : null;
    if (min != null) totalMin += min;
    if (max != null) totalMax += max;
    if (min != null || max != null) count++;

    // Categorize into ranges
    if (min != null) {
      if (min < 50000) ranges['Under ₹500'] = (ranges['Under ₹500'] || 0) + 1;
      else if (min < 100000) ranges['₹500-₹1000'] = (ranges['₹500-₹1000'] || 0) + 1;
      else if (min < 200000) ranges['₹1000-₹2000'] = (ranges['₹1000-₹2000'] || 0) + 1;
      else if (min < 500000) ranges['₹2000-₹5000'] = (ranges['₹2000-₹5000'] || 0) + 1;
      else ranges['₹5000+'] = (ranges['₹5000+'] || 0) + 1;
    }
  }

  return {
    avg_min: count > 0 ? Math.round(totalMin / count) : null,
    avg_max: count > 0 ? Math.round(totalMax / count) : null,
    range_distribution: applyKAnonymity(ranges, K_ANON_THRESHOLD),
  };
}

export const retailersVisitorTasteRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /retailers/me/visitor-taste ──────────────────────────
  // Aggregate customer taste profile for this store.
  // K-anonymity: any dimension with <5 contributors is suppressed.
  server.get('/me/visitor-taste', async (request, reply) => {
    const retailerId = request.retailerId;

    // Fetch all FashionDNA records for this retailer (passport-scoped)
    const dnaRecords = await prisma.customerFashionDNA.findMany({
      where: { retailer_id: retailerId },
      select: {
        color_affinities: true,
        style_affinities: true,
        fabric_affinities: true,
        occasion_affinities: true,
        budget_range: true,
        customer_account_id: true,
      },
    });

    // Also fetch customer store visits for total visitor count
    const totalVisitors = await prisma.customerStoreVisit.count({
      where: { retailer_id: retailerId },
    });

    const passportVisitors = dnaRecords.length;

    if (passportVisitors === 0) {
      return reply.status(200).send({
        data: {
          total_visitors: totalVisitors,
          passport_visitors: 0,
          top_colors: {},
          top_styles: {},
          top_fabrics: {},
          top_occasions: {},
          budget: { avg_min: null, avg_max: null, range_distribution: {} },
          k_anonymity_threshold: K_ANON_THRESHOLD,
          has_sufficient_data: false,
        },
      });
    }

    // Merge frequency maps
    const colors = mergeFrequencyMaps(dnaRecords.map((r) => r.color_affinities as Record<string, number>));
    const styles = mergeFrequencyMaps(dnaRecords.map((r) => r.style_affinities as Record<string, number>));
    const fabrics = mergeFrequencyMaps(dnaRecords.map((r) => r.fabric_affinities as Record<string, number>));
    const occasions = mergeFrequencyMaps(dnaRecords.map((r) => r.occasion_affinities as Record<string, number>));
    const budget = aggregateBudget(dnaRecords.map((r) => r.budget_range as Record<string, unknown>));

    // Apply k-anonymity
    const kColors = applyKAnonymity(colors, K_ANON_THRESHOLD);
    const kStyles = applyKAnonymity(styles, K_ANON_THRESHOLD);
    const kFabrics = applyKAnonymity(fabrics, K_ANON_THRESHOLD);
    const kOccasions = applyKAnonymity(occasions, K_ANON_THRESHOLD);

    // Sort by frequency
    const sortByCount = (obj: Record<string, number>) =>
      Object.entries(obj)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {} as Record<string, number>);

    return reply.status(200).send({
      data: {
        total_visitors: totalVisitors,
        passport_visitors: passportVisitors,
        top_colors: sortByCount(kColors),
        top_styles: sortByCount(kStyles),
        top_fabrics: sortByCount(kFabrics),
        top_occasions: sortByCount(kOccasions),
        budget,
        k_anonymity_threshold: K_ANON_THRESHOLD,
        has_sufficient_data: passportVisitors >= K_ANON_THRESHOLD,
      },
    });
  });
};
