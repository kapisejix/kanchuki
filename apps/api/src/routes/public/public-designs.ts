// Public endpoint for the Unstitched Design Gallery (§9 of customer-profile-req.md).
// Customers browse reference designs by category and share to tailor via WhatsApp.

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withPublicCache } from '../../lib/public-cache.js';

const DESIGN_CATEGORIES = ['NECKLINE', 'BLOUSE_BACK', 'SLEEVE', 'SALWAR', 'SILHOUETTE'] as const;

export const publicDesignRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /public/designs ────────────────────────────────────────
  // List all active design references, optionally filtered by category.
  server.get(
    '/designs',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            category: { type: 'string', enum: [...DESIGN_CATEGORIES] },
          },
        },
      },
      config: {
        cacheControl: 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
      },
    },
    async (request, reply) => {
      const { category } = request.query as { category?: string };

      reply.header(
        'Cache-Control',
        'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
      );

      return withPublicCache(request.url, async () => {
        const where: Record<string, unknown> = { is_active: true };
        if (
          category &&
          DESIGN_CATEGORIES.includes(category as (typeof DESIGN_CATEGORIES)[number])
        ) {
          where.category = category;
        }

        const designs = await prisma.designReference.findMany({
          where,
          select: {
            id: true,
            category: true,
            option: true,
            name: true,
            image_url: true,
            description: true,
            sort_order: true,
          },
          orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
        });

        // Group by category for the gallery UI
        const grouped: Record<string, typeof designs> = {};
        for (const d of designs) {
          if (!grouped[d.category]) grouped[d.category] = [];
          grouped[d.category]!.push(d);
        }

        return {
          data: designs,
          grouped,
          categories: DESIGN_CATEGORIES.map((c) => ({
            key: c,
            label: c
              .replace(/_/g, ' ')
              .toLowerCase()
              .replace(/\b\w/g, (l) => l.toUpperCase()),
            count: grouped[c]?.length ?? 0,
          })),
        };
      });
    },
  );

  // ─── GET /public/designs/:id ────────────────────────────────────
  // Single design reference detail.
  server.get(
    '/designs/:id',
    {
      config: {
        cacheControl: 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };

      const design = await prisma.designReference.findFirst({
        where: { id, is_active: true },
        select: {
          id: true,
          category: true,
          option: true,
          name: true,
          image_url: true,
          description: true,
        },
      });

      return { data: design };
    },
  );
};
