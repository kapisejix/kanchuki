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

      // Deterministic pre-filter: extract category/age/gender/occasion/fabric
      // hints from the free-text query.
      //
      // Root cause this replaces: the old table keyed synonyms like "kurta"
      // and matched them against `category`/`subtype` by substring — but the
      // AI-tagging enum stores "Kurti", not "Kurta", so that key could never
      // match its own catalog data. It also had zero kids/age/gender
      // vocabulary, so a query like "2 years boy" produced no hints at all,
      // which (see below) meant the filter step was skipped entirely and the
      // customer got whatever was uploaded most recently — often ladies
      // suits, regardless of what they asked for.
      //
      // Fix: each key below is the literal substring expected to appear in
      // `category`/`subtype` (matching the real AI-tagging enum — see
      // CLAUDE.md "Product Auto-Tagging"), and the synonyms are the
      // customer-facing words that should resolve to it.
      const queryLower = query.toLowerCase();

      const PRODUCT_TYPE_SYNONYMS: Record<string, string[]> = {
        saree: ['saree', 'sari'],
        lehenga: ['lehenga'],
        kurti: ['kurti', 'kurta', 'kurta set'],
        suit: ['suit', 'salwar', 'churidar', 'anarkali'],
        sherwani: ['sherwani', 'bandhgala'],
        gown: ['gown', 'evening gown'],
        dupatta: ['dupatta', 'stole'],
        blouse: ['blouse', 'choli'],
        palazzo: ['palazzo', 'plazzo'],
        sharara: ['sharara'],
        kaftan: ['kaftan'],
        jumpsuit: ['jumpsuit'],
        dress: ['dress', 'frock'],
        // "Kids Ethnic Wear" is a real category value — match it whenever the
        // query names a child, an age under 13, or a specific kid's garment.
        kids: [
          'kid',
          'kids',
          'child',
          'children',
          'toddler',
          'infant',
          'baby',
          'boy',
          'girl',
          'son',
          'daughter',
          'niece',
          'nephew',
        ],
        // "Men's Kurta Pajama" — match explicit men's-wear language.
        men: ['men', 'mens', "men's", 'gents', 'husband', 'father'],
      };

      const typeHints = Object.keys(PRODUCT_TYPE_SYNONYMS).filter((key) =>
        (PRODUCT_TYPE_SYNONYMS[key] ?? []).some((syn) => queryLower.includes(syn)),
      );
      // "a 2 year old", "for a 5-year-old boy" etc. — under-13 age mention
      // implies kids' wear even without the word "kids"/"boy"/"girl".
      const ageMatch = queryLower.match(/\b(\d{1,2})\s*[- ]?\s*(?:years?|yrs?)\b/);
      if (ageMatch && Number(ageMatch[1]) < 13 && !typeHints.includes('kids')) {
        typeHints.push('kids');
      }

      // Occasion synonyms → the literal `occasions` enum value they mean (see
      // CLAUDE.md AI-tagging occasions list). Previously the occasion was
      // never matched against the query at all.
      const OCCASION_SYNONYMS: Record<string, string[]> = {
        wedding: ['wedding', 'shadi', 'bridal', 'marriage'],
        festive: ['festive', 'diwali', 'navratri', 'festival'],
        sangeet: ['sangeet'],
        mehendi: ['mehendi', 'mehandi'],
        pooja: ['pooja', 'puja'],
        'party wear': ['party', 'celebration'],
        'office wear': ['office', 'work wear'],
        'daily wear': ['daily wear', 'everyday'],
        'special occasion': [
          'function',
          'family function',
          'get-together',
          'gathering',
          'special occasion',
        ],
        casual: ['casual'],
      };
      const occasionHints = Object.keys(OCCASION_SYNONYMS).filter((key) =>
        (OCCASION_SYNONYMS[key] ?? []).some((syn) => queryLower.includes(syn)),
      );

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

      // Category/age/gender filter — HARD constraint. Unlike fabric/occasion
      // below, a stated garment type, age, or gender is not a nice-to-have: a
      // customer asking for kids' wear must never see ladies suits just
      // because the store has more of those in stock. No match → no
      // fallback substitution (this is the root-cause fix — the old
      // threshold-based fallback is exactly why an unrelated category always
      // won when the store had nothing matching).
      let noStockForRequest = false;
      if (typeHints.length > 0) {
        const filtered = candidates.filter((p) => {
          const cat = (p.category ?? '').toLowerCase();
          const sub = (p.subtype ?? '').toLowerCase();
          return typeHints.some((hint) => cat.includes(hint) || sub.includes(hint));
        });
        if (filtered.length === 0) noStockForRequest = true;
        candidates = filtered;
      }

      // Occasion filter — soft, same threshold convention as fabric below
      // (occasion tagging isn't universal, so a strict match can starve the
      // LLM of otherwise-good candidates).
      if (!noStockForRequest && occasionHints.length > 0) {
        const filtered = candidates.filter((p) =>
          p.occasions.some((o) => occasionHints.some((h) => o.toLowerCase().includes(h))),
        );
        if (filtered.length >= 2) candidates = filtered;
      }

      // Fabric filter — soft, same convention.
      if (!noStockForRequest && fabricHints.length > 0) {
        const filtered = candidates.filter((p) =>
          fabricHints.some((f) => p.fabric_estimate?.toLowerCase().includes(f)),
        );
        if (filtered.length >= 3) candidates = filtered;
      }

      // The customer named a specific type/age/gender and this store has
      // none — say so plainly instead of substituting an unrelated item, and
      // skip the Claude call entirely since there is nothing to recommend.
      if (noStockForRequest) {
        return reply.status(200).send({
          data: {
            recommendations: [],
            stylist_note: `${retailer.shop_name} doesn't have matching items in stock right now — try a different request or browse the full catalog.`,
          },
        });
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
              typeHints.length > 0
                ? `AI stylist is warming up. Showing top ${typeHints[0]} picks.`
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
- Recommend ONLY from the catalog above — every product_id must exist in it, never invent or substitute one
- If the customer names an age group, gender, or specific garment type, every recommendation must match it — do not suggest a different category just because it's popular in this store
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

        // Never trust the LLM's product_id blindly — drop anything that
        // isn't actually in this store's filtered catalog rather than
        // showing a hallucinated card (no photo, possibly wrong category).
        const validRecommendations = recommendations
          .map((r) => {
            const match = candidates.find((p) => p.id === r.product_id);
            return match ? { ...r, photo_url: match.photo_url } : null;
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);

        return reply.status(200).send({
          data: {
            recommendations: validRecommendations,
            stylist_note: `Stylist picked ${validRecommendations.length} items from ${catalogForLLM.length} products in ${retailer.shop_name}'s catalog.`,
          },
        });
      } catch (_err) {
        // Fallback on Claude failure.
        // Already filtered by category/age/gender/occasion/fabric above.
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
              typeHints.length > 0
                ? `AI stylist is temporarily busy. Showing top ${typeHints[0]} picks.`
                : 'AI stylist is temporarily busy. Showing top picks.',
          },
        });
      }
    },
  );

  // ─── GET /stylist/suggestions?slug=<store> ───────────────────────
  // The starter-chip suggestions shown before the customer types anything.
  // Previously these were 5 hardcoded queries (saree/lehenga/kurta/suit)
  // shown to every store regardless of what it actually sells — a kids-wear
  // or men's-wear-only store showed ladies-suit suggestions nobody in its
  // catalog could fulfil. Built from this store's own most-common
  // category/occasion/color instead.
  server.get('/stylist/suggestions', async (request, reply) => {
    const qs = z.object({ slug: z.string().min(1) }).safeParse(request.query);
    if (!qs.success) throw validationError('Invalid slug');

    return withPublicCache(request.url, async () => {
      const retailer = await prisma.retailer.findFirst({
        where: { public_slug: qs.data.slug, deleted_at: null, is_suspended: false },
        select: { id: true },
      });
      if (!retailer) throw notFound('Retailer');

      const products = await prisma.product.findMany({
        where: { retailer_id: retailer.id, deleted_at: null, status: 'AVAILABLE' },
        select: { category: true, occasions: true, primary_color: true },
        take: 200,
        orderBy: { created_at: 'desc' },
      });

      const rankByFrequency = (values: string[]): string[] => {
        const counts = new Map<string, number>();
        for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
      };

      const topCategories = rankByFrequency(
        products.map((p) => p.category).filter((c): c is string => !!c),
      );
      const topOccasions = rankByFrequency(products.flatMap((p) => p.occasions));
      const topColors = rankByFrequency(
        products.map((p) => p.primary_color).filter((c): c is string => !!c),
      );

      const suggestions: string[] = [];
      for (let i = 0; i < Math.min(5, topCategories.length); i++) {
        const category = topCategories[i];
        const occasion = topOccasions.length > 0 ? topOccasions[i % topOccasions.length] : null;
        const color = topColors.length > 0 ? topColors[i % topColors.length] : null;
        const parts = [color, category, occasion ? `for ${occasion.toLowerCase()}` : null].filter(
          Boolean,
        );
        suggestions.push(parts.join(' '));
      }

      return reply.status(200).send({ data: { suggestions } });
    });
  });
};
