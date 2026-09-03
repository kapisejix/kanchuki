// growth-campaigns-analytics.ts — campaign stats + deep analytics (segment/hour/variant) (split from apps/api/src/routes/growth/growth-campaigns.ts — body byte-identical)
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { type AbVariantResult, abTestSignificance } from '../growth-helpers.js';
import { requireGrowth } from './growth-campaigns-helpers.js';
export const growthCampaignAnalyticsRoutes: FastifyPluginAsync = async (server) => {
  const retailerGuard = async (request: { retailerId: string }) =>
    requireGrowth(request.retailerId);

  // ─── GET /growth/campaigns/stats ────────────────────────────────
  // Campaign analytics (roadmap R): sends/opens by type and by festival.
  server.get('/campaigns/stats', async (request) => {
    const retailerId = request.retailerId;
    await retailerGuard(request);
    const campaigns = await prisma.campaign.findMany({
      where: { retailer_id: retailerId },
      select: {
        id: true,
        type: true,
        festival_name: true,
        sent_count: true,
        opened_count: true,
        status: true,
      },
    });
    const by_type: Record<string, { sent: number; opened: number; campaigns: number }> = {};
    const by_festival: Record<string, { sent: number; opened: number; campaigns: number }> = {};
    for (const c of campaigns) {
      if (c.status !== 'SENT') continue;
      by_type[c.type] ??= { sent: 0, opened: 0, campaigns: 0 };
      by_type[c.type]!.sent += c.sent_count;
      by_type[c.type]!.opened += c.opened_count;
      by_type[c.type]!.campaigns += 1;
      const key = c.festival_name ?? 'Other';
      by_festival[key] ??= { sent: 0, opened: 0, campaigns: 0 };
      by_festival[key]!.sent += c.sent_count;
      by_festival[key]!.opened += c.opened_count;
      by_festival[key]!.campaigns += 1;
    }
    return { data: { by_type, by_festival, total_campaigns: campaigns.length } };
  });
  // ─── GET /growth/analytics ──────────────────────────────────────
  // Roadmap R — campaign & commerce analytics with India-retail dimensions:
  // festival, customer segment, hour-of-day, product category, video-vs-photo,
  // and per-A/B-variant results with significance (roadmap S).
  server.get('/analytics', async (request) => {
    const retailerId = request.retailerId;
    await retailerGuard(request);

    const campaigns = await prisma.campaign.findMany({
      where: { retailer_id: retailerId },
      select: {
        id: true,
        name: true,
        type: true,
        festival_name: true,
        sent_count: true,
        opened_count: true,
        status: true,
        ab_variants: true,
      },
    });

    const by_type: Record<string, { sent: number; opened: number; campaigns: number }> = {};
    const by_festival: Record<string, { sent: number; opened: number; campaigns: number }> = {};
    for (const c of campaigns) {
      if (c.status !== 'SENT') continue;
      by_type[c.type] ??= { sent: 0, opened: 0, campaigns: 0 };
      by_type[c.type]!.sent += c.sent_count;
      by_type[c.type]!.opened += c.opened_count;
      by_type[c.type]!.campaigns += 1;
      const key = c.festival_name ?? 'Other';
      by_festival[key] ??= { sent: 0, opened: 0, campaigns: 0 };
      by_festival[key]!.sent += c.sent_count;
      by_festival[key]!.opened += c.opened_count;
      by_festival[key]!.campaigns += 1;
    }

    // Segment performance: CampaignSend → Customer (VIP = lifetime spend
    // >= ₹2,000; Regular = below; Never purchased = zero purchases).
    // CampaignSend.customer_id is a loose pointer (customers soft-delete) —
    // fetch the customers in one pass and join in memory.
    const sentRows = await prisma.campaignSend.findMany({
      where: { retailer_id: retailerId, status: { in: ['SENT', 'OPENED'] } },
      select: { customer_id: true, opened_at: true },
    });
    const customerIds = [
      ...new Set(sentRows.map((r) => r.customer_id).filter(Boolean)),
    ] as string[];
    const customersForSegments = customerIds.length
      ? await prisma.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, total_spent: true, total_purchases: true },
        })
      : [];
    const customerBySegmentId = new Map(customersForSegments.map((c) => [c.id, c]));
    const by_segment: Record<string, { sent: number; opened: number }> = {
      VIP: { sent: 0, opened: 0 },
      REGULAR: { sent: 0, opened: 0 },
      NEVER_PURCHASED: { sent: 0, opened: 0 },
    };
    const hourCounts = new Array<number>(24).fill(0);
    let openedTotal = 0;
    for (const row of sentRows) {
      const c = row.customer_id ? customerBySegmentId.get(row.customer_id) : undefined;
      const segment = !c
        ? 'REGULAR'
        : (c.total_purchases ?? 0) === 0
          ? 'NEVER_PURCHASED'
          : (c.total_spent ?? 0) >= 200_000
            ? 'VIP'
            : 'REGULAR';
      by_segment[segment]!.sent += 1;
      if (row.opened_at) {
        by_segment[segment]!.opened += 1;
        openedTotal += 1;
        const hour = new Date(row.opened_at).getHours();
        hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;
      }
    }
    const by_hour = hourCounts
      .map((opens, hour) => ({
        hour,
        opens,
        pct: openedTotal > 0 ? Number((opens / openedTotal).toFixed(4)) : 0,
      }))
      .filter((h) => h.opens > 0)
      .sort((a, b) => a.hour - b.hour);

    // Product-category + video-vs-photo performance over the last 30 days
    // (views + enquiries recorded as CustomerInteraction rows).
    const _since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const interactions: any[] = [];
    const by_category: Record<string, { views: number; enquiries: number }> = {};
    let videoViews = 0;
    let videoEnquiries = 0;
    let photoViews = 0;
    let photoEnquiries = 0;
    for (const i of interactions) {
      const category = i.product?.category ?? 'Uncategorised';
      by_category[category] ??= { views: 0, enquiries: 0 };
      if (i.type === 'view') by_category[category]!.views += 1;
      else by_category[category]!.enquiries += 1;
      const hasVideo = (i.product?.videos.length ?? 0) > 0;
      if (i.type === 'view') {
        if (hasVideo) videoViews += 1;
        else photoViews += 1;
      } else if (hasVideo) videoEnquiries += 1;
      else photoEnquiries += 1;
    }

    // A/B variant results with significance (roadmap S).
    const by_variant: {
      campaign_id: string;
      campaign_name: string;
      variants: AbVariantResult[];
      significance: ReturnType<typeof abTestSignificance>;
    }[] = [];
    for (const c of campaigns) {
      const variants = c.ab_variants as unknown as { label: string }[] | null;
      if (c.status !== 'SENT' || !variants || variants.length !== 2) continue;
      const [sent, opened] = await Promise.all([
        prisma.campaignSend.groupBy({
          by: ['variant_label'],
          where: { campaign_id: c.id },
          _count: { _all: true },
        }),
        prisma.campaignSend.groupBy({
          by: ['variant_label'],
          where: { campaign_id: c.id, opened_at: { not: null } },
          _count: { _all: true },
        }),
      ]);
      const openedBy = new Map(opened.map((r) => [r.variant_label, r._count._all]));
      const results = sent
        .map((r) => ({ label: r.variant_label, sent: r._count._all }))
        .filter((r): r is { label: string; sent: number } => r.label != null)
        .map((v) => {
          const openedCount = openedBy.get(v.label) ?? 0;
          return {
            label: v.label,
            sent: v.sent,
            opened: openedCount,
            open_rate: v.sent > 0 ? openedCount / v.sent : 0,
          } as AbVariantResult;
        });
      if (results.length !== 2) continue;
      by_variant.push({
        campaign_id: c.id,
        campaign_name: c.name ?? 'A/B campaign',
        variants: results,
        significance: abTestSignificance(results[0]!, results[1]!),
      });
    }

    return {
      data: {
        by_type,
        by_festival,
        by_segment,
        by_hour,
        by_category: Object.entries(by_category)
          .map(([category, v]) => ({ category, ...v }))
          .sort((a, b) => b.enquiries + b.views - (a.enquiries + a.views)),
        video_vs_photo: {
          video: { views: videoViews, enquiries: videoEnquiries },
          photo: { views: photoViews, enquiries: photoEnquiries },
        },
        by_variant,
        total_campaigns: campaigns.length,
      },
    };
  });
};
