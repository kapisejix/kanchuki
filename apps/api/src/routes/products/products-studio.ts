// F-032 Phase A — AI Studio Shoots (PhotoRoom-style).
//
// Retailer-facing endpoints for generating a subject-consistent studio
// background on a product photo via FLUX Kontext. TEMPLATE-ONLY (no
// free-text prompts): the retailer picks one of the 4 presets in
// STUDIO_TEMPLATES (@kanchuki/shared) and the API does the rest.
//
// Flow: POST → 202 {job_id} → mobile polls GET status?job_id= until
// 'ready' (returns the new photo) or 'failed' (returns the error). The
// generation runs on the STUDIO_SHOOT BullMQ queue (10–60s), never holding
// this HTTP request open.
//
// Plan gate: Growth/Pro only (spec §24.7 — studio shoots are included in
// those plans' AI cost budget). STARTER → 402 FEATURE_UNAVAILABLE.
// Quota: generation cost is tracked via the job's AuditLog-style status +
// the ProductPhoto metadata; a dedicated metered quota resource is a
// follow-up (would need a QuotaResourceType enum migration).
import { prisma } from '@kanchuki/db';
import { getStudioTemplate, type StudioTemplateId } from '@kanchuki/shared';
import { createId } from '@paralleldrive/cuid2';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addStudioShootJob } from '../../jobs/index.js';
import { getStudioJobStatus, isStudioShootConfigured } from '../../lib/studio-shoot.js';
import { featureUnavailable, notFound, serviceUnavailable, validationError } from '../../plugins/error-handler.js';

const StudioShootBodySchema = z.object({
  template: z.string().min(1),
});

export const productsStudioRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /products/:id/photos/:photoId/studio-shoot ─────────────
  // Enqueue a studio-shoot generation job. Returns 202 immediately; the
  // mobile app polls GET .../studio-shoot/status?job_id= for the result.
  server.post('/:id/photos/:photoId/studio-shoot', async (request, reply) => {
    const { id, photoId } = request.params as { id: string; photoId: string };

    // Plan gate — Growth/Pro only (spec §24.7).
    const retailer = await prisma.retailer.findUniqueOrThrow({
      where: { id: request.retailerId },
      select: { plan: true },
    });
    if (retailer.plan === 'STARTER') {
      throw featureUnavailable('AI Studio Shoots');
    }

    if (!isStudioShootConfigured()) {
      throw serviceUnavailable('AI Studio Shoots are not configured yet. Please try again later.');
    }

    const body = StudioShootBodySchema.safeParse(request.body ?? {});
    if (!body.success) {
      throw validationError(body.error.issues[0]?.message ?? 'Invalid studio template', 'template');
    }
    const template = getStudioTemplate(body.data.template);
    if (!template) {
      throw validationError('Unknown studio template. Choose one of the available presets.', 'template');
    }

    // Photo must belong to this retailer's product.
    const photo = await prisma.productPhoto.findFirst({
      where: { id: photoId, product_id: id, retailer_id: request.retailerId },
      select: { id: true },
    });
    if (!photo) throw notFound('Product photo');

    const jobId = createId();
    await addStudioShootJob({
      job_id: jobId,
      retailer_id: request.retailerId,
      product_id: id,
      photo_id: photo.id,
      template: body.data.template as StudioTemplateId,
    });

    return reply.status(202).send({ data: { job_id: jobId, status: 'processing' } });
  });

  // ─── GET /products/:id/photos/:photoId/studio-shoot/status ────────
  // Poll endpoint: returns 'processing' until the job finishes, then
  // 'ready' with the new photo, or 'failed' with a safe error message.
  server.get('/:id/photos/:photoId/studio-shoot/status', async (request) => {
    const { id, photoId } = request.params as { id: string; photoId: string };
    const q = z.object({ job_id: z.string().min(1) }).safeParse(request.query);
    if (!q.success) throw validationError('job_id is required', 'job_id');
    const jobId = q.data.job_id;

    // Photo must belong to this retailer (also makes job_id an opaque,
    // retailer-scoped handle — can't probe other retailers' jobs).
    const photo = await prisma.productPhoto.findFirst({
      where: { id: photoId, product_id: id, retailer_id: request.retailerId },
      select: { id: true },
    });
    if (!photo) throw notFound('Product photo');

    const status = await getStudioJobStatus(jobId);
    if (status) return { data: status };

    // Redis status absent (expired / Redis blip after completion) — fall
    // back to the persisted studio photo row so a completed job never reads
    // as stuck.
    const completed = await prisma.productPhoto.findFirst({
      where: {
        product_id: id,
        retailer_id: request.retailerId,
        metadata: { path: ['studio', 'job_id'], equals: jobId },
      },
      select: { id: true, url: true },
    });
    if (completed) {
      return { data: { status: 'ready', photo_id: completed.id, url: completed.url } };
    }

    // Nothing yet — still processing (or the job failed and the Redis TTL
    // expired; the retailer retries and the next status read decides).
    return { data: { status: 'processing' } };
  });
};
