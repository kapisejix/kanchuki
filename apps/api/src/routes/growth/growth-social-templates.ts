// Phase 5: AI Social Media Templates — retailer-facing routes.
//
// Retailers create social media image presets using the FLUX studio-shoot
// pipeline. They pick a product, choose an occasion/template type, and the
// API generates a festive overlay + AI caption + hashtags.
//
// Plan gate: SOCIAL_TEMPLATES (Growth/Pro plans).

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hasFeature } from '../../lib/features.js';
import {
  isStudioShootConfigured,
  getStudioJobStatus,
  resolveStudioStyleJob,
} from '../../lib/studio-shoot.js';
import { addStudioShootJob } from '../../jobs/index.js';
import { createId } from '@paralleldrive/cuid2';
import {
  featureUnavailable,
  notFound,
  serviceUnavailable,
  validationError,
} from '../../plugins/error-handler.js';

// ─── Zod Schemas ──────────────────────────────────────────────────

const TEMPLATE_TYPES = [
  'INSTAGRAM_POST',
  'INSTAGRAM_REEL',
  'INSTAGRAM_STORY',
  'WHATSAPP_STATUS',
  'WHATSAPP_CATALOG',
  'FACEBOOK_POST',
  'FACEBOOK_STORY',
  'PDF_FLYER',
] as const;

const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  template_type: z.enum(TEMPLATE_TYPES).default('INSTAGRAM_POST'),
  occasion: z.string().max(80).optional(),
  product_ids: z.array(z.string().min(1)).min(1).max(10),
  studio_template: z.string().min(1), // e.g. "gold_festive", "white_studio"
});

const UpdateTemplateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  template_type: z.enum(TEMPLATE_TYPES).optional(),
  occasion: z.string().max(80).optional(),
  caption: z.string().max(2000).optional(),
  hashtags: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});

// ─── Route ─────────────────────────────────────────────────────────

export const growthSocialTemplateRoutes: FastifyPluginAsync = async (server) => {
  const guard = async (retailerId: string) => {
    if (!(await hasFeature(retailerId, 'SOCIAL_TEMPLATES')))
      throw featureUnavailable('AI Social Media Templates');
  };

  // ─── GET /growth/social-templates ───────────────────────────────
  // List all templates for this retailer.
  server.get('/social-templates', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);

    const { template_type, occasion } = request.query as {
      template_type?: string;
      occasion?: string;
    };

    const where: Record<string, unknown> = { retailer_id: retailerId };
    if (template_type) where.template_type = template_type;
    if (occasion) where.occasion = occasion;

    const templates = await prisma.socialTemplate.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });

    return { data: templates };
  });

  // ─── GET /growth/social-templates/stats ─────────────────────────
  server.get('/social-templates/stats', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);

    const [total, active, totalUsage] = await Promise.all([
      prisma.socialTemplate.count({ where: { retailer_id: retailerId } }),
      prisma.socialTemplate.count({ where: { retailer_id: retailerId, is_active: true } }),
      prisma.socialTemplate.aggregate({
        where: { retailer_id: retailerId },
        _sum: { usage_count: true },
      }),
    ]);

    return {
      data: {
        total,
        active,
        inactive: total - active,
        total_usage: totalUsage._sum.usage_count ?? 0,
      },
    };
  });

  // ─── GET /growth/social-templates/:id ───────────────────────────
  server.get('/social-templates/:id', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    const template = await prisma.socialTemplate.findFirst({
      where: { id, retailer_id: retailerId },
    });
    if (!template) throw notFound('Social template');
    return { data: template };
  });

  // ─── POST /growth/social-templates ──────────────────────────────
  // Create a new template. Does NOT generate the image yet — the client
  // calls POST /:id/generate after creating.
  server.post('/social-templates', async (request, reply) => {
    const retailerId = request.retailerId;
    await guard(retailerId);

    const body = CreateTemplateSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    // Verify every product belongs to retailer
    const products = await prisma.product.findMany({
      where: { id: { in: body.data.product_ids }, retailer_id: retailerId, deleted_at: null },
      select: { id: true },
    });
    if (products.length !== body.data.product_ids.length) throw notFound('Product');

    const template = await prisma.socialTemplate.create({
      data: {
        retailer_id: retailerId,
        name: body.data.name,
        description: body.data.description,
        template_type: body.data.template_type,
        occasion: body.data.occasion,
        background_style: body.data.studio_template,
        product_ids: body.data.product_ids,
      },
    });

    return reply.status(201).send({ data: template });
  });

  // ─── POST /growth/social-templates/:id/generate ─────────────────
  // Trigger image generation for a template using the FLUX studio-shoot
  // pipeline. The client must supply a product_id (the first product in
  // product_ids by default). Returns 202 with a job_id to poll.
  server.post('/social-templates/:id/generate', async (request, reply) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    if (!isStudioShootConfigured()) {
      throw serviceUnavailable('AI generation is not configured yet. Please try again later.');
    }

    const template = await prisma.socialTemplate.findFirst({
      where: { id, retailer_id: retailerId },
    });
    if (!template) throw notFound('Social template');

    const body = z
      .object({ product_id: z.string().min(1).optional() })
      .safeParse(request.body ?? {});
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const productId = body.data.product_id ?? template.product_ids[0];
    if (!productId) throw validationError('No product associated with this template');

    // Find the product's main photo
    const photo = await prisma.productPhoto.findFirst({
      where: { product_id: productId, retailer_id: retailerId },
      orderBy: [{ is_primary: 'desc' }, { created_at: 'desc' }],
      select: { id: true },
    });
    if (!photo) throw validationError('Product has no photos. Upload a photo first.');

    if (!template.background_style)
      throw validationError('No background style set on this template');
    const styleJob = await resolveStudioStyleJob(template.background_style);

    const jobId = createId();
    await addStudioShootJob({
      job_id: jobId,
      retailer_id: retailerId,
      product_id: productId,
      photo_id: photo.id,
      ...styleJob,
    });

    return reply.status(202).send({ data: { job_id: jobId, status: 'processing' } });
  });

  // ─── GET /growth/social-templates/:id/generate/status ───────────
  // Poll generation status. Same pattern as products-studio.ts.
  server.get('/social-templates/:id/generate/status', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };
    const q = z.object({ job_id: z.string().min(1) }).safeParse(request.query);
    if (!q.success) throw validationError('job_id is required', 'job_id');

    const template = await prisma.socialTemplate.findFirst({
      where: { id, retailer_id: retailerId },
      select: { id: true },
    });
    if (!template) throw notFound('Social template');

    const status = await getStudioJobStatus(q.data.job_id);
    if (status) return { data: status };

    return { data: { status: 'processing' } };
  });

  // ─── PUT /growth/social-templates/:id ───────────────────────────
  // Update template metadata (caption, hashtags, name, etc.)
  server.put('/social-templates/:id', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    const existing = await prisma.socialTemplate.findFirst({
      where: { id, retailer_id: retailerId },
    });
    if (!existing) throw notFound('Social template');

    const body = UpdateTemplateSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const updated = await prisma.socialTemplate.update({
      where: { id },
      data: body.data,
    });

    return { data: updated };
  });

  // ─── DELETE /growth/social-templates/:id ────────────────────────
  server.delete('/social-templates/:id', async (request, reply) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    const existing = await prisma.socialTemplate.findFirst({
      where: { id, retailer_id: retailerId },
    });
    if (!existing) throw notFound('Social template');

    await prisma.socialTemplate.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ─── POST /growth/social-templates/:id/use ──────────────────────
  // Increment usage count (called when retailer shares a template).
  server.post('/social-templates/:id/use', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    const existing = await prisma.socialTemplate.findFirst({
      where: { id, retailer_id: retailerId },
    });
    if (!existing) throw notFound('Social template');

    const updated = await prisma.socialTemplate.update({
      where: { id },
      data: { usage_count: { increment: 1 } },
    });

    return { data: updated };
  });
};
