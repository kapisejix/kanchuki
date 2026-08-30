// F-032 Phase B — Automated Festival Background Library.
// Extends AI Studio Shoots with seasonal festival backgrounds.
//
// Retailer-facing endpoints for applying pre-generated festival backgrounds
// to product images with automatic seasonal rotation.
//
// Flow: POST → 202 {job_id} → mobile polls GET .../festival-background/status?job_id= until
// 'ready' (returns the new photo) or 'failed' (returns the error).
//
// Plan gate: Growth/Pro only (spec §24.7 — studio shoots are included in
// those plans' AI cost budget). STARTER → 402 FEATURE_UNAVAILABLE.
import { prisma } from '@kanchuki/db';
import { createId } from '@paralleldrive/cuid2';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addStudioShootJob } from '../../jobs/index.js';
import { getStudioJobStatus, isStudioShootConfigured, resolveStudioStyleJob } from '../../lib/studio-shoot.js';
import { featureUnavailable, notFound, serviceUnavailable, validationError } from '../../plugins/error-handler.js';

// Ornate backdrop the festival flow falls back to when no explicit override is
// passed. Seeded by migration 078 (studio_styles); the seasonal festive/wedding
// presets were retired when STUDIO_TEMPLATES was trimmed 2026-08-29.
const FESTIVAL_FALLBACK_SLUG = 'seated_haveli_steps';

const FestivalBackgroundBodySchema = z.object({
  // Optional: override automatic seasonal selection
  templateId: z.string().optional(),
});

export const productsFestivalBackgroundRoutes: FastifyPluginAsync = async (
  server
) => {
  // ─── POST /products/:id/photos/:photoId/festival-background ────────
  // Apply automatic seasonal festival background to product photo.
  // Returns 202 immediately; mobile app polls status endpoint for result.
  server.post(
    '/:id/photos/:photoId/festival-background',
    async (request, reply) => {
      const { id, photoId } = request.params as {
        id: string;
        photoId: string;
      };

      // Plan gate — Growth/Pro only (spec §24.7).
      const retailer = await prisma.retailer.findUniqueOrThrow({
        where: { id: request.retailerId },
        select: { plan: true },
      });
      if (retailer.plan === 'STARTER') {
        throw featureUnavailable('AI Studio Shoots');
      }

      if (!isStudioShootConfigured()) {
        throw serviceUnavailable(
          'AI Studio Shoots are not configured yet. Please try again later.'
        );
      }

      const body = FestivalBackgroundBodySchema.safeParse(
        request.body ?? {}
      );
      if (!body.success) {
        throw validationError(
          body.error.issues[0]?.message ?? 'Invalid request',
          'body'
        );
      }

      // Photo must belong to this retailer's product.
      const photo = await prisma.productPhoto.findFirst({
        where: { id: photoId, product_id: id, retailer_id: request.retailerId },
        select: { id: true },
      });
      if (!photo) throw notFound('Product photo');

      // Resolve the backdrop from the DB catalog (studio_styles): an explicit
      // override slug, else the ornate festival fallback. Any status is
      // accepted — this feature is already Growth/Pro-gated above.
      const styleJob = await resolveStudioStyleJob(
        body.data.templateId || FESTIVAL_FALLBACK_SLUG,
      );

      const jobId = createId();
      await addStudioShootJob({
        job_id: jobId,
        retailer_id: request.retailerId,
        product_id: id,
        photo_id: photo.id,
        ...styleJob,
      });

      return reply.status(202).send({
        data: { job_id: jobId, status: 'processing' },
      });
    }
  );

  // ─── GET /products/:id/photos/:photoId/festival-background/status ────────
  // Poll endpoint: returns 'processing' until the job finishes, then
  // 'ready' with the new photo, or 'failed' with a safe error message.
  server.get(
    '/:id/photos/:photoId/festival-background/status',
    async (request) => {
      const { id, photoId } = request.params as {
        id: string;
        photoId: string;
      };
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
        return {
          data: { status: 'ready', photo_id: completed.id, url: completed.url },
        };
      }

      // Nothing yet — still processing (or the job failed and the Redis TTL
      // expired; the retailer retries and the next status read decides).
      return { data: { status: 'processing' } };
    }
  );
};
