// Auto-split from products.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { detectColor } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addTaggingJob } from '../../jobs/index.js';
import { recordAiUsage } from '../../lib/ai-usage.js';
import { notFound, validationError } from '../../plugins/error-handler.js';

export const productsAiRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /products/:id/retag ───────────────────────────────────
  // Retailer-triggered re-run of AI tagging. Re-queues the same background
  // tag-product job: it refreshes category/color/fabric/pattern and
  // fills any blank name/subtype/SKU/description (the job only writes those
  // when null, so a retailer edit is never clobbered). auto_cleanup: false —
  // the photo was already cropped/bg-stripped at first upload; re-running
  // cleanup would re-crop a possibly-styled shot.
  server.post('/:id/retag', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
      include: { photos: { where: { is_primary: true }, take: 1 } },
    });
    if (!existing) throw notFound('Product');
    const photo = existing.photos[0];
    if (!photo) throw validationError('No photo to tag');

    // Clear the previous outcome so the mobile screen shows the in-progress
    // state while the re-tag job runs (and can surface a fresh error).
    await prisma.product.update({
      where: { id },
      data: { ai_tagged: false, ai_tag_error: null },
    });

    addTaggingJob({
      product_id: id,
      retailer_id: request.retailerId,
      photo_url: photo.url,
      r2_key: photo.r2_key,
      auto_cleanup: false,
    }).catch(async (err) => {
      request.log.error({ err, product_id: id }, 'Failed to queue re-tag job');
      try {
        await prisma.product.update({
          where: { id },
          data: {
            ai_tagged: false,
            ai_tag_error: 'Background AI tagging unavailable — try again later',
          },
        });
      } catch {}
    });

    return reply.status(202).send({ data: { retag_queued: true } });
  });

  // ─── POST /products/detect-color ───────────────────────────────
  // Lightweight lite-model call that extracts only the dominant color from a
  // variant/product photo. Designed for the "Add Color Variant" screen to
  // pre-fill the color field instead of requiring manual entry. Multi-provider
  // failover keeps it working when the primary model is out of credits; usage
  // is attributed per-call (AI_COLOR_DETECT) but not quota-gated.
  server.post('/detect-color', async (request, reply) => {
    const body = z.object({ image_url: z.string().url() }).safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    try {
      const color = await detectColor(body.data.image_url, {
        onProviderUsed: recordAiUsage(request.retailerId),
      });
      return reply.status(200).send({ data: { color: color || 'Multi-color' } });
    } catch (err) {
      request.log.error({ err, image_url: body.data.image_url }, 'Color detection failed');
      return reply.status(200).send({ data: { color: 'Multi-color' } });
    }
  });
};
