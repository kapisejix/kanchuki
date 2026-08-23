import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hasFeature } from '../../lib/features.js';
import { checkQuota, incrementUsage } from '../../lib/quota.js';
import { featureUnavailable, notFound, validationError } from '../../plugins/error-handler.js';
import { recordAiUsage } from '../../lib/ai-usage.js';
import {
  parseCampaignIntent,
  generateCampaignMessage,
  type CampaignIntent,
  type SuggestedProduct,
} from '@kanchuki/ai';
import {
  buildAudienceWhere,
  fillTemplate,
  type AudienceSpec,
} from './growth-helpers.js';
import { resolveAudienceCustomerIds } from './growth-campaigns.js';

// ─── Request / Response schemas ──────────────────────────────────────

const AiCampaignRequestSchema = z.object({
  prompt: z.string().min(3).max(2000),
});

export type AiCampaignDraft = {
  name: string;
  type: CampaignIntent['campaign_type'];
  festival_id: number | null;
  message_template: string;
  audience: AudienceSpec;
  product_ids: string[];
  schedule_hint: string | null;
  rationale: string;
  matched_products: SuggestedProduct[];
  audience_count: number;
};

// ─── Route ───────────────────────────────────────────────────────────

export const growthAiCampaignRoutes: FastifyPluginAsync = async (server) => {
  const retailerGuard = async (request: { retailerId: string }): Promise<void> => {
    if (!(await hasFeature(request.retailerId, 'GROWTH_ENGINE'))) {
      throw featureUnavailable('Growth tools');
    }
  };

  // ─── POST /v1/growth/ai-campaign ──────────────────────────────────
  // Roadmap E — AI Campaign Assistant.
  // Input: natural language prompt.
  // Output: campaign draft (name, type, audience, products, message template).
  // The draft is NOT saved — the retailer reviews and saves it via the normal
  // campaign create endpoint.
  server.post('/ai-campaign', async (request) => {
    const retailerId = request.retailerId;
    await retailerGuard(request);

    const body = AiCampaignRequestSchema.safeParse(request.body);
    if (!body.success) throw validationError('prompt is required (3–2000 chars)');

    const prompt = body.data.prompt.trim();

    // Step 1: Parse intent with AI
    await checkQuota(retailerId, 'AI_TAGGING_CALL');
    await incrementUsage(retailerId, 'AI_TAGGING_CALL');

    let intent: CampaignIntent;
    try {
      intent = await parseCampaignIntent(prompt);
    } catch (err) {
      throw validationError(`Failed to understand request: ${err instanceof Error ? err.message : 'unknown error'}`);
    }

    // Step 2: Query matching products
    const productWhere: Record<string, unknown> = {
      retailer_id: retailerId,
      status: 'AVAILABLE',
      deleted_at: null,
    };

    const criteria = intent.product_criteria;
    if (criteria.category) {
      productWhere['category'] = { equals: criteria.category, mode: 'insensitive' } as never;
    }
    if (criteria.colors?.length) {
      productWhere['OR'] = [
        { primary_color: { in: criteria.colors, mode: 'insensitive' } },
        { secondary_colors: { hasSome: criteria.colors } },
        { search_tags: { hasSome: criteria.colors } },
      ];
    }
    if (criteria.styles?.length) {
      productWhere['OR'] = [
        ...(productWhere['OR'] as Record<string, unknown>[] ?? []),
        { styles: { hasSome: criteria.styles } },
        { search_tags: { hasSome: criteria.styles } },
      ];
    }
    if (criteria.fabrics?.length) {
      productWhere['OR'] = [
        ...(productWhere['OR'] as Record<string, unknown>[] ?? []),
        { fabrics: { hasSome: criteria.fabrics } },
        { fabric_estimate: { in: criteria.fabrics, mode: 'insensitive' } },
      ];
    }
    if (criteria.max_price_paise || criteria.min_price_paise) {
      productWhere['price_min'] = {
        ...(criteria.max_price_paise ? { lte: criteria.max_price_paise } : {}),
        ...(criteria.min_price_paise ? { gte: criteria.min_price_paise } : {}),
      };
    }

    const matchedProducts = await prisma.product.findMany({
      where: productWhere as never,
      select: {
        id: true,
        name: true,
        category: true,
        primary_color: true,
        price_min: true,
      },
      orderBy: { updated_at: 'desc' },
      take: criteria.limit ?? 15,
    });

    const suggestedProducts: SuggestedProduct[] = matchedProducts.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      primary_color: p.primary_color,
      price_min: p.price_min,
    }));

    // Step 3: Generate message template with AI
    const messageResult = await generateCampaignMessage(intent, suggestedProducts);

    // Step 4: Resolve audience count
    const customerIds = await resolveAudienceCustomerIds(retailerId, intent.audience);
    const audienceCount = customerIds.length;

    // Step 5: Build festival_id if campaign_type is FESTIVAL but AI didn't fill it
    let festivalId = intent.festival_id;
    if (festivalId == null && intent.campaign_type === 'FESTIVAL') {
      const festival = await prisma.festival.findFirst({
        where: { name: { equals: prompt.split(' ').slice(0, 3).join(' '), mode: 'insensitive' } },
        select: { id: true },
      });
      if (festival) festivalId = festival.id;
    }

    const draft: AiCampaignDraft = {
      name: intent.name,
      type: intent.campaign_type,
      festival_id: festivalId,
      message_template: messageResult.message_template,
      audience: intent.audience,
      product_ids: suggestedProducts.map((p) => p.id),
      schedule_hint: intent.schedule_hint,
      rationale: messageResult.rationale,
      matched_products: suggestedProducts,
      audience_count: audienceCount,
    };

    return { data: draft };
  });
};
