// Phase 4: Festival Background Library — retailer-facing routes.
//
// Retailers browse admin-curated seasonal background images and apply
// them to product photos via the FLUX studio-shoot pipeline.
//
// Plan gate: FESTIVAL_BACKGROUNDS (Growth/Pro plans).

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createId } from '@paralleldrive/cuid2';
import { hasFeature } from '../../lib/features.js';
import { isStudioShootConfigured, getStudioJobStatus } from '../../lib/studio-shoot.js';
import { addStudioShootJob } from '../../jobs/index.js';
import {
  featureUnavailable,
  notFound,
  serviceUnavailable,
  validationError,
} from '../../plugins/error-handler.js';

// ─── Route ─────────────────────────────────────────────────────────

export const growthBackgroundRoutes: FastifyPluginAsync = async (server) => {
  const guard = async (retailerId: string) => {
    if (!(await hasFeature(retailerId, 'FESTIVAL_BACKGROUNDS')))
      throw featureUnavailable('Festival Background Library');
  };

  // ─── GET /growth/backgrounds ────────────────────────────────────
  // List available backgrounds. Filters: active only by default;
  // optionally filter by occasion, season, region.
  server.get('/backgrounds', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);

    const { occasion, season, region } = request.query as {
      occasion?: string;
      season?: string;
      region?: string;
    };

    const now = new Date();
    const where: Record<string, unknown> = {
      is_active: true,
      // Only show backgrounds within their validity window (if set)
      AND: [
        { OR: [{ valid_from: null }, { valid_from: { lte: now } }] },
        { OR: [{ valid_to: null }, { valid_to: { gte: now } }] },
      ],
    };
    if (occasion) where.occasion = occasion;
    if (season) where.season = season;
    if (region) where.region = region;

    const backgrounds = await prisma.festivalBackground.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { usage_count: 'desc' }, { created_at: 'desc' }],
    });

    return { data: backgrounds };
  });

  // ─── GET /growth/backgrounds/all ────────────────────────────────
  // List ALL backgrounds (including inactive) — for the retailer to see
  // what's available even if admin hasn't activated yet.
  server.get('/backgrounds/all', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);

    const backgrounds = await prisma.festivalBackground.findMany({
      orderBy: [{ priority: 'desc' }, { created_at: 'desc' }],
    });

    return { data: backgrounds };
  });

  // ─── GET /growth/backgrounds/stats ──────────────────────────────
  server.get('/backgrounds/stats', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);

    const [total, active, occasions] = await Promise.all([
      prisma.festivalBackground.count(),
      prisma.festivalBackground.count({ where: { is_active: true } }),
      prisma.festivalBackground.groupBy({
        by: ['occasion'],
        _count: { id: true },
        where: { is_active: true },
        orderBy: { _count: { id: 'desc' } },
      }),
    ]);

    return {
      data: {
        total,
        active,
        occasions: occasions.map((r) => ({ occasion: r.occasion, count: r._count.id })),
      },
    };
  });

  // ─── GET /growth/backgrounds/occasions ──────────────────────────
  // Distinct occasion list for filter chips.
  server.get('/backgrounds/occasions', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);

    const rows = await prisma.festivalBackground.groupBy({
      by: ['occasion'],
      where: { is_active: true },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    return {
      data: rows.map((r) => ({ occasion: r.occasion, count: r._count.id })),
    };
  });

  // ─── GET /growth/backgrounds/:id ────────────────────────────────
  server.get('/backgrounds/:id', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    const bg = await prisma.festivalBackground.findUnique({ where: { id } });
    if (!bg) throw notFound('Festival background');
    return { data: bg };
  });

  // ─── POST /growth/backgrounds/:id/apply ─────────────────────────
  // Apply a festival background to a product photo. Delegates to the
  // FLUX studio-shoot pipeline (same as products-festival-background.ts
  // but accessible from the backgrounds browsing screen).
  server.post('/backgrounds/:id/apply', async (request, reply) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    if (!isStudioShootConfigured()) {
      throw serviceUnavailable('AI generation is not configured yet. Please try again later.');
    }

    const bg = await prisma.festivalBackground.findUnique({ where: { id } });
    if (!bg) throw notFound('Festival background');
    if (!bg.is_active) throw validationError('This background is not currently active');

    const body = z
      .object({
        product_id: z.string().min(1),
        photo_id: z.string().min(1).optional(),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    // Verify product belongs to retailer
    const product = await prisma.product.findFirst({
      where: { id: body.data.product_id, retailer_id: retailerId, deleted_at: null },
      select: { id: true },
    });
    if (!product) throw notFound('Product');

    // Find the photo to apply to
    let photoId = body.data.photo_id;
    if (!photoId) {
      // Use the product's main/first photo
      const photo = await prisma.productPhoto.findFirst({
        where: { product_id: body.data.product_id, retailer_id: retailerId },
        orderBy: [{ is_primary: 'desc' }, { created_at: 'desc' }],
        select: { id: true },
      });
      if (!photo) throw validationError('Product has no photos. Upload a photo first.');
      photoId = photo.id;
    } else {
      // Verify photo belongs to retailer
      const photo = await prisma.productPhoto.findFirst({
        where: { id: photoId, product_id: body.data.product_id, retailer_id: retailerId },
        select: { id: true },
      });
      if (!photo) throw notFound('Product photo');
    }

    // Use the background's occasion to pick a studio template
    const templateId = getOccasionTemplate(bg.occasion);

    const jobId = createId();
    await addStudioShootJob({
      job_id: jobId,
      retailer_id: retailerId,
      product_id: body.data.product_id,
      photo_id: photoId,
      template: templateId as any,
    });

    // Increment usage count
    await prisma.festivalBackground.update({
      where: { id },
      data: { usage_count: { increment: 1 } },
    });

    return reply.status(202).send({ data: { job_id: jobId, status: 'processing' } });
  });

  // ─── POST /growth/backgrounds/:id/apply/status ──────────────────
  // Poll generation status after applying a background.
  server.post('/backgrounds/:id/apply/status', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    const bg = await prisma.festivalBackground.findUnique({ where: { id } });
    if (!bg) throw notFound('Festival background');

    const body = z.object({ job_id: z.string().min(1) }).safeParse(request.body);
    if (!body.success) throw validationError('job_id is required');

    const status = await getStudioJobStatus(body.data.job_id);
    if (status) return { data: status };

    return { data: { status: 'processing' } };
  });
};

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Map an occasion string to a studio template id (must exist in
 * STUDIO_TEMPLATES — getStudioTemplate() 422s on an unknown id).
 * The festive/diwali/wedding backdrop presets were removed 2026-08-29 when
 * the list was trimmed to 9; festive occasions now fall back to the ornate
 * `seated_haveli_steps` scene, everything else to `editorial_vogue`.
 */
function getOccasionTemplate(occasion: string): string {
  const lower = occasion.toLowerCase();
  if (
    lower.includes('diwali') ||
    lower.includes('light') ||
    lower.includes('wedding') ||
    lower.includes('shaadi') ||
    lower.includes('festive') ||
    lower.includes('gold') ||
    lower.includes('navratri') ||
    lower.includes('durga') ||
    lower.includes('eid') ||
    lower.includes('holi')
  ) {
    return 'seated_haveli_steps';
  }
  return 'editorial_vogue';
}
