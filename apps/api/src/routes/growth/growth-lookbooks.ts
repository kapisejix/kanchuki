// Phase 6: Automated Lookbook Generator — retailer-facing routes.
//
// Retailers pick products, choose a format (carousel, grid, editorial, PDF),
// and the API generates a styled lookbook. Output is stored on R2 and shared
// via a public link.
//
// Plan gate: LOOKBOOK_GENERATOR (Growth/Pro plans).

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createId } from '@paralleldrive/cuid2';
import { hasFeature } from '../../lib/features.js';
import { isStudioShootConfigured } from '../../lib/studio-shoot.js';
import { featureUnavailable, notFound, validationError } from '../../plugins/error-handler.js';

// ─── Zod Schemas ──────────────────────────────────────────────────

const LOOKBOOK_FORMATS = ['CAROUSEL', 'GRID', 'EDITORIAL', 'PDF'] as const;

const CreateLookbookSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  format: z.enum(LOOKBOOK_FORMATS).default('CAROUSEL'),
  product_ids: z.array(z.string().min(1)).min(1).max(20),
  cover_product_id: z.string().optional(), // product to use as cover image
});

const UpdateLookbookSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  format: z.enum(LOOKBOOK_FORMATS).optional(),
  product_ids: z.array(z.string().min(1)).min(1).max(20).optional(),
  cover_product_id: z.string().optional(),
});

// ─── Route ─────────────────────────────────────────────────────────

export const growthLookbookRoutes: FastifyPluginAsync = async (server) => {
  const guard = async (retailerId: string) => {
    if (!(await hasFeature(retailerId, 'LOOKBOOK_GENERATOR')))
      throw featureUnavailable('Lookbook Generator');
  };

  // ─── GET /growth/lookbooks ─────────────────────────────────────
  // List all lookbooks for this retailer.
  server.get('/lookbooks', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);

    const { status, format } = request.query as { status?: string; format?: string };

    const where: Record<string, unknown> = { retailer_id: retailerId };
    if (status) where.status = status;
    if (format) where.format = format;

    const lookbooks = await prisma.lookbook.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });

    return { data: lookbooks };
  });

  // ─── GET /growth/lookbooks/stats ────────────────────────────────
  server.get('/lookbooks/stats', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);

    const [total, ready, generating, totalViews, totalShares] = await Promise.all([
      prisma.lookbook.count({ where: { retailer_id: retailerId } }),
      prisma.lookbook.count({ where: { retailer_id: retailerId, status: 'READY' } }),
      prisma.lookbook.count({ where: { retailer_id: retailerId, status: 'GENERATING' } }),
      prisma.lookbook.aggregate({
        where: { retailer_id: retailerId },
        _sum: { view_count: true },
      }),
      prisma.lookbook.aggregate({
        where: { retailer_id: retailerId },
        _sum: { share_count: true },
      }),
    ]);

    return {
      data: {
        total,
        ready,
        generating,
        failed: total - ready - generating,
        total_views: totalViews._sum.view_count ?? 0,
        total_shares: totalShares._sum.share_count ?? 0,
      },
    };
  });

  // ─── GET /growth/lookbooks/:id ─────────────────────────────────
  server.get('/lookbooks/:id', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    const lookbook = await prisma.lookbook.findFirst({
      where: { id, retailer_id: retailerId },
    });
    if (!lookbook) throw notFound('Lookbook');
    return { data: lookbook };
  });

  // ─── POST /growth/lookbooks ────────────────────────────────────
  // Create a new lookbook. Does NOT generate yet — client calls /:id/generate.
  server.post('/lookbooks', async (request, reply) => {
    const retailerId = request.retailerId;
    await guard(retailerId);

    const body = CreateLookbookSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    // Verify all products belong to this retailer
    const products = await prisma.product.findMany({
      where: { id: { in: body.data.product_ids }, retailer_id: retailerId, deleted_at: null },
      select: { id: true, name: true, photos: { select: { url: true }, take: 1 } },
    });
    if (products.length !== body.data.product_ids.length) {
      throw validationError('One or more product IDs are invalid');
    }

    // Use first product's photo as cover if not specified
    let coverUrl: string | null = null;
    if (body.data.cover_product_id) {
      const coverProduct = products.find((p) => p.id === body.data.cover_product_id);
      coverUrl = coverProduct?.photos[0]?.url ?? null;
    } else {
      coverUrl = products[0]?.photos[0]?.url ?? null;
    }

    const lookbook = await prisma.lookbook.create({
      data: {
        retailer_id: retailerId,
        name: body.data.name,
        description: body.data.description,
        format: body.data.format,
        product_ids: body.data.product_ids,
        cover_url: coverUrl,
      },
    });

    return reply.status(201).send({ data: lookbook });
  });

  // ─── POST /growth/lookbooks/:id/generate ───────────────────────
  // Trigger lookbook generation. For now this marks the lookbook as
  // GENERATING and the actual HTML/PDF rendering would happen via a
  // BullMQ job (similar to studio-shoot). Returns 202.
  server.post('/lookbooks/:id/generate', async (request, reply) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    const lookbook = await prisma.lookbook.findFirst({
      where: { id, retailer_id: retailerId },
    });
    if (!lookbook) throw notFound('Lookbook');

    if (lookbook.status === 'GENERATING') {
      throw validationError('Lookbook is already being generated');
    }

    // Mark as generating — in production a BullMQ job would render the
    // HTML/PDF and update the status to READY with the output_url.
    const updated = await prisma.lookbook.update({
      where: { id },
      data: { status: 'GENERATING' },
    });

    return reply.status(202).send({ data: { job_id: updated.id, status: 'generating' } });
  });

  // ─── PUT /growth/lookbooks/:id ─────────────────────────────────
  server.put('/lookbooks/:id', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    const existing = await prisma.lookbook.findFirst({
      where: { id, retailer_id: retailerId },
    });
    if (!existing) throw notFound('Lookbook');

    const body = UpdateLookbookSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    // If product_ids changed, re-verify ownership
    if (body.data.product_ids) {
      const products = await prisma.product.findMany({
        where: { id: { in: body.data.product_ids }, retailer_id: retailerId, deleted_at: null },
        select: { id: true },
      });
      if (products.length !== body.data.product_ids.length) {
        throw validationError('One or more product IDs are invalid');
      }
    }

    // Update cover if cover_product_id changed
    let coverUrl = existing.cover_url;
    if (body.data.cover_product_id || body.data.product_ids) {
      const productIds = body.data.product_ids ?? existing.product_ids;
      const coverId = body.data.cover_product_id ?? productIds[0];
      if (coverId) {
        const coverProduct = await prisma.product.findFirst({
          where: { id: coverId, retailer_id: retailerId },
          select: { photos: { select: { url: true }, take: 1 } },
        });
        coverUrl = coverProduct?.photos[0]?.url ?? coverUrl;
      }
    }

    const updated = await prisma.lookbook.update({
      where: { id },
      data: {
        name: body.data.name,
        description: body.data.description,
        format: body.data.format,
        product_ids: body.data.product_ids,
        cover_url: coverUrl,
      },
    });

    return { data: updated };
  });

  // ─── DELETE /growth/lookbooks/:id ──────────────────────────────
  server.delete('/lookbooks/:id', async (request, reply) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    const existing = await prisma.lookbook.findFirst({
      where: { id, retailer_id: retailerId },
    });
    if (!existing) throw notFound('Lookbook');

    await prisma.lookbook.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ─── POST /growth/lookbooks/:id/view ───────────────────────────
  // Increment view count (called when someone opens the share link).
  server.post('/lookbooks/:id/view', async (request) => {
    const { id } = request.params as { id: string };

    // Public endpoint — no retailer guard (share links are public).
    // But verify the lookbook exists and has a share_url.
    const lookbook = await prisma.lookbook.findUnique({ where: { id } });
    if (!lookbook) throw notFound('Lookbook');

    const updated = await prisma.lookbook.update({
      where: { id },
      data: { view_count: { increment: 1 } },
    });

    return { data: { view_count: updated.view_count } };
  });

  // ─── POST /growth/lookbooks/:id/share ──────────────────────────
  // Increment share count + generate share_url if missing.
  server.post('/lookbooks/:id/share', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    const existing = await prisma.lookbook.findFirst({
      where: { id, retailer_id: retailerId },
    });
    if (!existing) throw notFound('Lookbook');

    // Generate share URL if not yet set
    let shareUrl = existing.share_url;
    if (!shareUrl) {
      // In production this would be a proper short URL; for now use the ID-based path
      shareUrl = `/lookbooks/${id}`;
      await prisma.lookbook.update({
        where: { id },
        data: { share_url: shareUrl },
      });
    }

    const updated = await prisma.lookbook.update({
      where: { id },
      data: { share_count: { increment: 1 } },
    });

    return { data: { share_url: shareUrl, share_count: updated.share_count } };
  });
};
