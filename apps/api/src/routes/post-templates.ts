// post-templates.ts — retailer-facing read of the admin post-template library
// (Create Post Composer v2 §11, T-9.3). Returns the plan-filtered PUBLISHED
// templates the retailer picks in the Create Post composer and campaign
// creation. Admin CRUD lives in routes/admin/admin-post-templates.ts.
import { type Prisma, prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { forbidden } from '../plugins/error-handler.js';

export const postTemplatesRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /v1/post-templates?context=POST|CAMPAIGN|BOTH ─────────
  // Only PUBLISHED templates assigned to the retailer's plan. `context`
  // filters the picker surface (templates marked BOTH appear in both); when
  // omitted, all PUBLISHED templates for the plan are returned. DRAFT/HIDDEN
  // templates are never visible here.
  server.get('/post-templates', async (request) => {
    if (!request.retailerId) throw forbidden('Sign in to view templates');

    const query = z
      .object({
        context: z.enum(['POST', 'CAMPAIGN', 'BOTH']).optional(),
      })
      .parse(request.query);

    const retailer = await prisma.retailer.findUniqueOrThrow({
      where: { id: request.retailerId },
      select: { plan: true },
    });

    const contextFilter: Prisma.PostTemplateWhereInput = query.context
      ? { OR: [{ context: query.context }, { context: 'BOTH' as const }] }
      : {};

    const rows = await prisma.postTemplate.findMany({
      where: {
        status: 'PUBLISHED',
        plans: { has: retailer.plan },
        ...contextFilter,
      },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        context: true,
        post_type: true,
        caption_template: true,
        hashtags: true,
        occasion: true,
        thumbnail_url: true,
        sort_order: true,
        usage_count: true,
      },
    });
    return { data: rows };
  });
};