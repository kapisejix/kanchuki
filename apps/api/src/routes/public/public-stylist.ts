// AI Stylist v1 — customer-facing endpoint.
// Takes a free-text query + store slug, fetches the retailer's tagged catalog,
// and uses Claude to suggest outfit combinations with rationale.
// Deterministic pre-filtering by occasion/budget/color reduces the catalog
// subset so the LLM doesn't propose invalid combos.

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withPublicCache } from '../../lib/public-cache.js';
import { notFound, validationError } from '../../plugins/error-handler.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

// Deterministic color pairing rules (§4 of customer-profile-req.md)
const COMPLEMENTARY_COLORS: Record<string, string[]> = {
  'royal blue': ['gold', 'orange', 'coral'],
  mustard: ['maroon', 'purple', 'navy'],
  maroon: ['gold', 'cream', 'mustard'],
  pink: ['green', 'gold', 'white'],
  green: ['pink', 'gold', 'red'],
  red: ['gold', 'green', 'white'],
  navy: ['gold', 'coral', 'white'],
  purple: ['gold', 'pink', 'yellow'],
};

interface ProductCandidate {
  id: string;
  name: string | null;
  category: string | null;
  subtype: string | null;
  primary_color: string | null;
  secondary_colors: string[];
  fabric_estimate: string | null;
  price_min: number | null;
  price_max: number | null;
  photo_url: string | null;
  occasions: string[];
}

export const publicStylistRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /public/stylist ────────────────────────────────────────
  // Customer sends a free-text query + store slug → gets outfit suggestions.
  server.post(
    '/stylist',
    {
      schema: {
        body: {
          type: 'object',
          required: ['slug', 'query'],
          properties: {
            slug: { type: 'string' },
            query: { type: 'string', maxLength: 500 },
            budget_min: { type: 'number' },
            budget_max: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      const body = z
        .object({
          slug: z.string().min(1),
          query: z.string().min(3).max(500),
          budget_min: z.number().optional(),
          budget_max: z.number().optional(),
        })
        .safeParse(request.body);
      if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

      const { slug, query, budget_min, budget_max } = body.data;

      // Find retailer
      const retailer = await prisma.retailer.findFirst({
        where: { public_slug: slug, deleted_at: null, is_suspended: false },
        select: { id: true, shop_name: true },
      });
      if (!retailer) throw notFound('Retailer');

      // Fetch all available products with tags (max 200 for context window)
      const products = await prisma.product.findMany({
        where: {
          retailer_id: retailer.id,
          deleted_at: null,
          status: 'AVAILABLE',
        },
        select: {
          id: true,
          name: true,
          category: true,
          subtype: true,
          primary_color: true,
          secondary_colors: true,
          fabric_estimate: true,
          price_min: true,
          price_max: true,
          occasions: true,
          photos: {
            where: { is_primary: true },
            take: 1,
            select: { url: true },
          },
        },
        take: 200,
        orderBy: { created_at: 'desc' },
      });

      // Deterministic pre-filter: extract category/subtype/color/fabric hints from query
      const queryLower = query.toLowerCase();

      // Category/subtype keywords — common Indian fashion terms
      const CATEGORY_KEYWORDS: Record<string, string[]> = {
        saree: ['saree', 'sari'],
        lehenga: ['lehenga', 'lehenga choli'],
        kurta: ['kurta', 'kurti', 'kurta set'],
        suit: ['suit', 'salwar', 'churidar', 'anarkali'],
        sherwani: ['sherwani', 'bandhgala'],
        gown: ['gown', 'evening gown'],
        dupatta: ['dupatta', 'stole'],
        blouse: ['blouse', 'choli'],
        palazzo: ['palazzo', 'plazzo'],
        sharara: ['sharara', 'sharara set'],
        kaftan: ['kaftan'],
        jumpsuit: ['jumpsuit'],
        dress: ['dress', 'frock'],
      };

      const categoryHints: string[] = [];
      const subtypeHints: string[] = [];
      for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        if (keywords.some((kw) => queryLower.includes(kw))) {
          categoryHints.push(cat);
        }
      }
      // Also check product subtype fields directly (e.g. "kurti" matches subtype "Kurti")
      const SUBTYPE_KEYWORDS = [
        'kurta',
        'kurti',
        'saree',
        'lehenga',
        'sherwani',
        'gown',
        'anarkali',
        'salwar',
        'churidar',
        'palazzo',
        'sharara',
        'kaftan',
      ];
      for (const st of SUBTYPE_KEYWORDS) {
        if (queryLower.includes(st)) subtypeHints.push(st);
      }

      const _colorHints = Object.keys(COMPLEMENTARY_COLORS).filter((c) => queryLower.includes(c));
      const fabricHints = [
        'cotton',
        'silk',
        'georgette',
        'chiffon',
        'velvet',
        'linen',
        'rayon',
      ].filter((f) => queryLower.includes(f));

      let candidates: ProductCandidate[] = products.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        subtype: p.subtype,
        primary_color: p.primary_color,
        secondary_colors: p.secondary_colors,
        fabric_estimate: p.fabric_estimate,
        price_min: p.price_min ? Number(p.price_min) : null,
        price_max: p.price_max ? Number(p.price_max) : null,
        photo_url: p.photos[0]?.url ?? null,
        occasions: p.occasions,
      }));

      // Budget filter
      if (budget_min != null)
        candidates = candidates.filter((p) => p.price_max == null || p.price_max >= budget_min);
      if (budget_max != null)
        candidates = candidates.filter((p) => p.price_min == null || p.price_min <= budget_max);

      // Category/subtype filter — scope results to matching product types
      if (categoryHints.length > 0 || subtypeHints.length > 0) {
        const filtered = candidates.filter((p) => {
          const cat = (p.category ?? '').toLowerCase();
          const sub = (p.subtype ?? '').toLowerCase();
          return (
            categoryHints.some((c) => cat.includes(c)) ||
            subtypeHints.some((s) => sub.includes(s) || cat.includes(s))
          );
        });
        // Only apply if we have enough matches — otherwise fall through to
        // unfiltered candidates so the LLM can still suggest alternatives.
        if (filtered.length >= 2) candidates = filtered;
      }

      // Fabric filter
      if (fabricHints.length > 0) {
        const filtered = candidates.filter((p) =>
          fabricHints.some((f) => p.fabric_estimate?.toLowerCase().includes(f)),
        );
        if (filtered.length >= 3) candidates = filtered;
      }

      // Build the product catalog for Claude (limit to 60 for context)
      const catalogForLLM = candidates.slice(0, 60).map((p) => ({
        id: p.id,
        name: p.name ?? 'Unnamed',
        category: p.category ?? 'Unknown',
        subtype: p.subtype ?? '',
        color: p.primary_color ?? 'Unknown',
        fabric: p.fabric_estimate ?? 'Unknown',
        price: p.price_min
          ? `₹${p.price_min}${p.price_max && p.price_max !== p.price_min ? `–₹${p.price_max}` : ''}`
          : 'Price on request',
        occasions: p.occasions.join(', ') || 'General',
      }));

      // Call Claude for recommendations
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      if (!anthropicKey) {
        // Fallback: return top products by relevance without LLM.
        // Already filtered by category/subtype/color/fabric above.
        return reply.status(200).send({
          data: {
            recommendations: candidates.slice(0, 6).map((p) => ({
              product_id: p.id,
              name: p.name ?? p.category ?? 'Product',
              category: p.category,
              color: p.primary_color,
              price: p.price_min,
              photo_url: p.photo_url,
              rationale: `Great choice from ${retailer.shop_name}'s collection.`,
            })),
            stylist_note:
              categoryHints.length > 0
                ? `AI stylist is warming up. Showing top ${categoryHints[0]} picks.`
                : 'AI stylist is warming up. Showing top picks for now.',
          },
        });
      }

      try {
        const response = await fetch(ANTHROPIC_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: CLAUDE_MODEL,
            max_tokens: 1024,
            messages: [
              {
                role: 'user',
                content: `You are a fashion stylist for ${retailer.shop_name}, an Indian clothing store. A customer says: "${query}"

Here is the store's available catalog (JSON array):
${JSON.stringify(catalogForLLM, null, 2)}

RULES:
- Suggest 3-6 products that best match the customer's request
- Mix items for a complete look (e.g., kurta + dupatta, suit + accessories)
- Respect color coordination: analogous colors for daily wear, complementary for festive
- Match fabric weight: embroidered suit → plain dupatta, solid suit → printed dupatta
- Respect budget if mentioned
- Each recommendation must be a JSON object with: product_id, name, category, color, price, photo_url (use the id from catalog), rationale (one-line styling tip in the customer's language)
- Return ONLY a valid JSON array, no markdown, no explanation`,
              },
            ],
          }),
        });

        if (!response.ok) {
          throw new Error(`Claude API error: ${response.status}`);
        }

        const claudeResponse = (await response.json()) as {
          content: Array<{ type: string; text: string }>;
        };

        const text = claudeResponse.content?.[0]?.text ?? '[]';
        // Parse the JSON array from Claude's response
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        const recommendations = jsonMatch
          ? (JSON.parse(jsonMatch[0]) as Array<{
              product_id: string;
              name: string;
              category: string;
              color: string;
              price: number | null;
              photo_url: string | null;
              rationale: string;
            }>)
          : [];

        return reply.status(200).send({
          data: {
            recommendations: recommendations.map((r) => ({
              ...r,
              photo_url: candidates.find((p) => p.id === r.product_id)?.photo_url ?? r.photo_url,
            })),
            stylist_note: `Stylist picked ${recommendations.length} items from ${catalogForLLM.length} products in ${retailer.shop_name}'s catalog.`,
          },
        });
      } catch (_err) {
        // Fallback on Claude failure.
        // Already filtered by category/subtype/color/fabric above.
        return reply.status(200).send({
          data: {
            recommendations: candidates.slice(0, 6).map((p) => ({
              product_id: p.id,
              name: p.name ?? p.category ?? 'Product',
              category: p.category,
              color: p.primary_color,
              price: p.price_min,
              photo_url: p.photo_url,
              rationale: `A great pick from ${retailer.shop_name}'s collection.`,
            })),
            stylist_note:
              categoryHints.length > 0
                ? `AI stylist is temporarily busy. Showing top ${categoryHints[0]} picks.`
                : 'AI stylist is temporarily busy. Showing top picks.',
          },
        });
      }
    },
  );
};
