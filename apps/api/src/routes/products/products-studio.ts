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
// Quota: STUDIO_SHOOT is a metered QuotaResourceType (F-010) — checkQuota
// gates the enqueue here, incrementUsage fires in the job on success
// (jobs/studio-shoot.ts). Admin sets the per-plan cap at /admin/plan-limits.
import { prisma } from '@kanchuki/db';
import { getStudioTemplate, type StudioTemplateId } from '@kanchuki/shared';
import { createId } from '@paralleldrive/cuid2';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addStudioShootJob } from '../../jobs/index.js';
import { getStudioJobStatus, isStudioShootConfigured } from '../../lib/studio-shoot.js';
import { checkQuota, getQuotaStatus } from '../../lib/quota.js';
import { notFound, serviceUnavailable, validationError } from '../../plugins/error-handler.js';

const StudioShootBodySchema = z.object({
  template: z.string().min(1),
  engine: z.enum(['flux_pro', 'imagen_3', 'idm_vton', 'flux_schnell', 'imagen_3_fast', 'bfl_kontext']).optional(),
  model_id: z.string().optional(),
});

export const productsStudioRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /products/studio-styles ────────────────────────────────
  // The retailer-facing catalog: PUBLISHED styles this plan may use.
  // Prompt + engine are deliberately omitted (server-side only).
  server.get('/studio-styles', async (request) => {
    const retailer = await prisma.retailer.findUniqueOrThrow({
      where: { id: request.retailerId },
      select: { plan: true },
    });
    const rows = await prisma.studioStyle.findMany({
      where: { status: 'PUBLISHED', plans: { has: retailer.plan } },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      select: { slug: true, label: true, description: true, tab: true, audience: true, thumbnail_url: true },
    });
    return { data: rows };
  });

  // ─── POST /products/:id/photos/:photoId/studio-shoot ─────────────
  // Enqueue a studio-shoot generation job. Returns 202 immediately; the
  // mobile app polls GET .../studio-shoot/status?job_id= for the result.
  server.post('/:id/photos/:photoId/studio-shoot', async (request, reply) => {
    const { id, photoId } = request.params as { id: string; photoId: string };

    // All plans get AI Studio Shoots — the STUDIO_SHOOT quota (admin-set
    // per-plan image cap at /admin/plan-limits) is the only limiter.
    if (!(await isStudioShootConfigured())) {
      throw serviceUnavailable('AI Studio Shoots are not configured yet. Please configure an API key in Admin → Integrations.');
    }

    await checkQuota(request.retailerId, 'STUDIO_SHOOT');

    const body = StudioShootBodySchema.safeParse(request.body ?? {});
    if (!body.success) {
      throw validationError(body.error.issues[0]?.message ?? 'Invalid studio template', 'template');
    }
    const template = getStudioTemplate(body.data.template);
    if (!template && !body.data.model_id) {
      throw validationError('Unknown studio template. Choose one of the available presets.', 'template');
    }

    // Photo must belong to this retailer's product.
    const isVariant = photoId.startsWith('variant-');
    const realPhotoId = isVariant ? photoId.replace('variant-', '') : photoId;

    let photo = await prisma.productPhoto.findFirst({
      where: { id: realPhotoId, product_id: id, retailer_id: request.retailerId },
      select: { id: true, width: true, height: true, size_bytes: true },
    });

    if (!photo && isVariant) {
      const variant = await prisma.productVariant.findFirst({
        where: { id: realPhotoId, product_id: id, retailer_id: request.retailerId },
      });
      if (variant && variant.photo_url && variant.r2_key) {
        let variantPhoto = await prisma.productPhoto.findFirst({
          where: { product_id: id, r2_key: variant.r2_key },
          select: { id: true, width: true, height: true, size_bytes: true },
        });
        if (!variantPhoto) {
          variantPhoto = await prisma.productPhoto.create({
            data: {
              product_id: id,
              retailer_id: request.retailerId,
              url: variant.photo_url,
              r2_key: variant.r2_key,
              is_primary: false,
            },
            select: { id: true, width: true, height: true, size_bytes: true },
          });
        }
        photo = variantPhoto;
      }
    }
    if (!photo) throw notFound('Product photo');

    // BFL/Fal accepts ≤20MP (megapixels) and ≤20MB.
    const MAX_MP = 20_000_000 // 20 megapixels
    const MAX_BYTES = 20 * 1024 * 1024 // 20 MB
    if (photo.width && photo.height) {
      const megapixels = photo.width * photo.height
      if (megapixels > MAX_MP) {
        throw validationError(
          `Image is too large (${(megapixels / 1_000_000).toFixed(1)}MP). Maximum is 20MP. Please use a smaller image.`,
          'photo',
        )
      }
    }
    if (photo.size_bytes && photo.size_bytes > MAX_BYTES) {
      throw validationError(
        `Image file is too large (${(photo.size_bytes / 1024 / 1024).toFixed(1)}MB). Maximum is 20MB. Please compress the image first.`,
        'photo',
      )
    }

    const jobId = createId();
    await addStudioShootJob({
      job_id: jobId,
      retailer_id: request.retailerId,
      product_id: id,
      photo_id: photo.id,
      template: (template?.id ?? body.data.template) as StudioTemplateId,
      engine: body.data.engine,
      model_id: body.data.model_id,
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

  // ─── GET /products/:id/photos/:photoId/studio-shoot/quota ────────
  // Return current retailer quota status (used, limit, remaining, plan)
  server.get('/:id/photos/:photoId/studio-shoot/quota', async (request) => {
    const retailer = await prisma.retailer.findUniqueOrThrow({
      where: { id: request.retailerId },
      select: { plan: true },
    });

    const quota = await getQuotaStatus(request.retailerId, 'STUDIO_SHOOT');
    return {
      data: {
        plan: retailer.plan,
        ...quota,
      },
    };
  });
};
