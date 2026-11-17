// retailers-social-ai-designs.ts — T5 paid AI custom-prompt design
// (docs/tasks/pending/admin-social-design-templates.md §5).
//
// Routes (under /v1/retailers), all owner-only (manager default-deny list, re-checked here):
//   POST /me/ai-designs        {product_id, prompt, format?, overlay?} -> 202 {id}   reserve quota, enqueue
//   GET  /me/ai-designs        the retailer's finished designs, newest first ("My AI designs")
//   GET  /me/ai-designs/:id    {status: PENDING|READY|FAILED, image_url, error}  (poll)
//
// Gates, in order: owner, plan feature AI_CUSTOM_TEMPLATE (fails CLOSED), provider configured,
// prompt hygiene, product + photo ownership, then the ATOMIC quota reserve (METERED: no plan_limits
// row = 0). The model is never called in this request: the BullMQ job does it and hands the slot
// back unless a READY row exists. The finished image feeds the existing composer IMAGE post.
import type { AiDesignFormat, AiDesignOverlay } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { AI_DESIGN_FORMATS, AI_DESIGN_OVERLAYS, DESIGN_CUSTOM_MAX_LEN } from '@kanchuki/shared';
import { createId } from '@paralleldrive/cuid2';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addAiCustomDesignJob } from '../../../jobs/index.js';
import { sanitizeDesignPrompt } from '../../../lib/ai-custom-design.js';
import { findPublishedAiPoster } from '../../../lib/design-post-render.js';
import { hasFeature } from '../../../lib/features.js';
import { checkQuota, refundJobQuota, reserveJobQuota } from '../../../lib/quota.js';
import { isStudioShootConfigured } from '../../../lib/studio-shoot.js';
import { isRealOwner } from '../../../plugins/auth.js';
import {
  featureUnavailable,
  forbidden,
  notFound,
  serviceUnavailable,
  validationError,
} from '../../../plugins/error-handler.js';

const bodySchema = z.object({
  product_id: z.string().min(1),
  prompt: z.string(),
  // Optional finishing (T5 gaps). An overlay forces 4:5, so the format only matters without one.
  format: z.enum(AI_DESIGN_FORMATS).default('ORIGINAL'),
  overlay: z.enum(AI_DESIGN_OVERLAYS).nullish(),
});

// Poster request: typed text is only ever drawn by the renderer, never sent to a model (job, Task 8).
const posterSchema = z.object({
  product_id: z.string().min(1),
  template_id: z.string().min(1),
  custom_text: z.string().max(DESIGN_CUSTOM_MAX_LEN).optional(),
  offer_text: z.string().max(DESIGN_CUSTOM_MAX_LEN).optional(),
});

export const retailersSocialAiDesignsRoutes: FastifyPluginAsync = async (server) => {
  const owner = (request: Parameters<typeof isRealOwner>[0]) => {
    if (!isRealOwner(request)) throw forbidden('Only the shop owner can make AI designs');
  };

  server.post(
    '/me/ai-designs',
    { config: { rateLimit: { max: 10, timeWindow: 60 * 1000 } } },
    async (request, reply) => {
      owner(request);
      const retailerId = request.retailerId;
      if (!(await hasFeature(retailerId, 'AI_CUSTOM_TEMPLATE'))) {
        throw featureUnavailable('AI custom designs');
      }
      if (!(await isStudioShootConfigured())) {
        throw serviceUnavailable('AI designs are not available right now. Please try later.');
      }

      const raw = (request.body ?? {}) as { template_id?: unknown };
      // Poster request (admin-built AI design) vs the existing free-prompt request.
      let prompt: string;
      let format: AiDesignFormat = 'ORIGINAL';
      let overlay: AiDesignOverlay | null = null;
      let poster: { template_id: string; custom_text?: string; offer_text?: string } | null = null;
      let productId: string;
      if (raw.template_id !== undefined) {
        const p = posterSchema.safeParse(request.body);
        if (!p.success)
          throw validationError(
            `Pick a product and a design (text up to ${DESIGN_CUSTOM_MAX_LEN} characters)`,
          );
        const retailer = await prisma.retailer.findUnique({
          where: { id: retailerId },
          select: { plan: true },
        });
        if (!retailer) throw notFound('Retailer');
        // Draft / hidden / wrong plan / non-AI all look the same: 404, before any spend.
        const design = await findPublishedAiPoster(p.data.template_id, retailer.plan);
        if (!design) throw notFound('Design');
        prompt = `Poster: ${design.name}`;
        productId = p.data.product_id;
        poster = {
          template_id: p.data.template_id,
          custom_text: p.data.custom_text,
          offer_text: p.data.offer_text,
        };
      } else {
        const body = bodySchema.safeParse(request.body);
        if (!body.success) throw validationError('Pick a product and describe the design');
        const clean = sanitizeDesignPrompt(body.data.prompt);
        if (!clean.ok) throw validationError(clean.reason, 'prompt');
        prompt = clean.prompt;
        format = body.data.format;
        overlay = body.data.overlay ?? null;
        productId = body.data.product_id;
      }

      const product = await prisma.product.findFirst({
        where: { id: productId, retailer_id: retailerId, deleted_at: null },
        select: {
          id: true,
          photos: {
            where: { retailer_id: retailerId },
            select: { id: true, is_primary: true },
          },
        },
      });
      if (!product) throw notFound('Product');
      const photo = product.photos.find((p) => p.is_primary) ?? product.photos[0];
      if (!photo) throw validationError('This product needs a photo first', 'product_id');

      // Fail-fast read for a clean 402; the real gate is the atomic reserve just below (RC-102).
      await checkQuota(retailerId, 'AI_CUSTOM_TEMPLATE');

      const id = createId();
      await reserveJobQuota(retailerId, 'AI_CUSTOM_TEMPLATE', id);
      try {
        await prisma.aiCustomDesign.create({
          data: { id, retailer_id: retailerId, product_id: product.id, prompt },
        });
        await addAiCustomDesignJob({
          job_id: id,
          retailer_id: retailerId,
          product_id: product.id,
          photo_id: photo.id,
          prompt,
          format,
          overlay,
          ...(poster ?? {}),
        });
      } catch (err) {
        // No job will run, so the slot goes back now and the row must not stay PENDING (the poll
        // would spin forever). Both are best-effort; the original error is what the caller sees.
        await refundJobQuota(id, 'AI_CUSTOM_TEMPLATE').catch((e) =>
          request.log.error({ err: e, job_id: id }, 'Failed to refund AI design quota'),
        );
        await prisma.aiCustomDesign
          .updateMany({
            where: { id, retailer_id: retailerId, status: 'PENDING' },
            data: { status: 'FAILED', error: 'The design could not be started. Please try again.' },
          })
          .catch((e) =>
            request.log.error({ err: e, job_id: id }, 'Failed to mark AI design row failed'),
          );
        throw err;
      }
      return reply.status(202).send({ data: { id, status: 'PENDING' } });
    },
  );

  server.get('/me/ai-designs', async (request) => {
    owner(request);
    const rows = await prisma.aiCustomDesign.findMany({
      where: { retailer_id: request.retailerId, status: 'READY' },
      orderBy: { created_at: 'desc' },
      take: 30,
      select: { id: true, prompt: true, image_url: true, created_at: true },
    });
    return { data: rows };
  });

  server.get('/me/ai-designs/:id', async (request) => {
    owner(request);
    const { id } = request.params as { id: string };
    const row = await prisma.aiCustomDesign.findFirst({
      where: { id, retailer_id: request.retailerId },
      select: { id: true, status: true, image_url: true, error: true },
    });
    if (!row) throw notFound('Design');
    return { data: row };
  });
};
