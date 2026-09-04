// growth-social-caption-suggest.ts — AI caption suggestion for the Create Post
// composer (R-9 / T-6.1). Reuses the @kanchuki/ai campaign-assistant path
// (generateSocialPostCaption). NEVER blocks publishing: on any AI/quota
// failure it fails open to the same templated caption the fan-out auto-caption
// would build, so the composer's "suggest" button is purely additive.
import { generateSocialPostCaption } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { recordAiUsage } from '../../lib/ai-usage.js';
import { hasFeature } from '../../lib/features.js';
import { checkQuota } from '../../lib/quota.js';
import { resolvePostTemplate } from '../../lib/post-template-placeholders.js';
import { featureUnavailable, validationError } from '../../plugins/error-handler.js';

const SUGGEST_SCHEMA = z.object({
  product_ids: z.array(z.string().min(1)).max(10).default([]),
  post_type: z.enum(['SINGLE_PRODUCT', 'CAROUSEL', 'COLLECTION_LINK']).default('SINGLE_PRODUCT'),
  festival: z.string().max(60).optional(),
});

function formatBarePrice(paise: number): string {
  const rupees = paise / 100;
  const isWhole = Number.isInteger(rupees);
  return rupees.toLocaleString('en-IN', {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2,
  });
}

export const growthSocialCaptionSuggestRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /v1/growth/social-caption-suggest ──────────────────────
  server.post('/social-caption-suggest', async (request) => {
    const retailerId = request.retailerId;
    if (!(await hasFeature(retailerId, 'GROWTH_ENGINE'))) {
      throw featureUnavailable('Growth tools');
    }

    const parsed = SUGGEST_SCHEMA.safeParse(request.body);
    if (!parsed.success) throw validationError('Invalid caption-suggest payload');
    const { product_ids, post_type, festival } = parsed.data;

    // Load the retailer's own products + profile (retailer-scoped, R-11 spirit).
    const products = await prisma.product.findMany({
      where: { id: { in: product_ids }, retailer_id: retailerId, deleted_at: null },
      select: { id: true, name: true, category: true, price_min: true, price_max: true },
    });
    const retailer = await prisma.retailer.findUniqueOrThrow({
      where: { id: retailerId },
      select: { shop_name: true },
    });

    const names = products.map((p) => p.name?.trim()).filter(Boolean) as string[];
    const prices = products
      .map((p) => p.price_min)
      .filter((v): v is number => v != null);
    const priceRange = prices.length > 0
      ? `₹${formatBarePrice(Math.min(...prices))}` +
        (prices.some((v) => v !== Math.min(...prices)) ? ` – ₹${formatBarePrice(Math.max(...prices))}` : '')
      : undefined;

    // AI generation, fail-open. Quota exhaustion (AI_TAGGING_CALL) must NOT
    // break the suggest button — fall through to the template caption.
    try {
      await checkQuota(retailerId, 'AI_TAGGING_CALL');
      const result = await generateSocialPostCaption({
        productNames: names,
        category: products[0]?.category?.trim() || undefined,
        priceRange,
        storeName: retailer.shop_name?.trim() || undefined,
        festival: festival?.trim() || undefined,
        postType: post_type,
        // recordAiUsage handles the weighted AI_TAGGING_CALL quota increment
        // AND the per-call AiUsageLog row with the real serving provider.
        onProviderUsed: recordAiUsage(retailerId),
      });
      return {
        data: {
          caption: result.caption,
          hashtags: result.hashtags,
          source: 'ai',
        },
      };
    } catch {
      // Fail-open: the same templated caption the fan-out auto-caption uses.
      const caption = resolvePostTemplate(
        'New in: {product_names} — ₹{price} in {category} at {store_name}',
        {
          productNames: names,
          pricePaise: prices[0],
          category: products[0]?.category,
          storeName: retailer.shop_name,
        },
      );
      return { data: { caption, hashtags: [], source: 'template' } };
    }
  });
};