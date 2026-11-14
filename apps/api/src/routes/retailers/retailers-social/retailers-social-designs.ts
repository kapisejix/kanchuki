// retailers-social-designs.ts — admin design templates for retailers (T4,
// docs/tasks/pending/admin-social-design-templates.md §4.5).
//
// Routes (under /v1/retailers):
//   GET  /me/designs              PUBLISHED designs whose `plans` include the caller's plan
//   POST /me/designs/:id/render   render with the caller's products → public image_url
//
// The image_url feeds the EXISTING composer IMAGE post (POST /me/social/posts).
// The render itself lives in lib/design-post-render.ts (shared with the F-043 scheduler).
// Owner-only by the manager default-deny list (§8.3), re-checked with isRealOwner.
import { createHash, randomBytes } from 'node:crypto';
import { publicUrl, uploadBuffer } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { DESIGN_CUSTOM_MAX_LEN, DESIGN_MAX_PRODUCT_SLOTS } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  DesignRenderError,
  findPublishedDesign,
  renderDesignJpeg,
} from '../../../lib/design-post-render.js';
import { isRealOwner } from '../../../plugins/auth.js';
import { forbidden, notFound, validationError } from '../../../plugins/error-handler.js';
import { assertOwnProducts } from '../../growth/growth-campaigns/growth-campaigns-helpers.js';

const renderSchema = z.object({
  product_ids: z.array(z.string().min(1)).min(1).max(DESIGN_MAX_PRODUCT_SLOTS),
  custom_text: z.string().max(DESIGN_CUSTOM_MAX_LEN).optional(),
  offer_text: z.string().max(DESIGN_CUSTOM_MAX_LEN).optional(),
});

export const retailersSocialDesignsRoutes: FastifyPluginAsync = async (server) => {
  const owner = (request: Parameters<typeof isRealOwner>[0]) => {
    if (!isRealOwner(request)) throw forbidden('Only the shop owner can use designs');
  };

  server.get('/me/designs', async (request) => {
    owner(request);
    const { plan } = await prisma.retailer.findUniqueOrThrow({
      where: { id: request.retailerId },
      select: { plan: true },
    });
    const rows = await prisma.designTemplate.findMany({
      where: { status: 'PUBLISHED', plans: { has: plan } },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        occasion: true,
        format: true,
        product_slots: true,
        thumbnail_key: true,
      },
    });
    return {
      data: rows.map(({ thumbnail_key, ...r }) => ({
        ...r,
        thumbnail_url: thumbnail_key ? publicUrl(thumbnail_key) : null,
      })),
    };
  });

  server.post('/me/designs/:id/render', async (request) => {
    owner(request);
    const { id } = request.params as { id: string };
    const body = renderSchema.safeParse(request.body);
    if (!body.success) throw validationError('Pick 1–6 products and keep the text short');
    const retailerId = request.retailerId;
    const ids = [...new Set(body.data.product_ids)];

    const { plan } = await prisma.retailer.findUniqueOrThrow({
      where: { id: retailerId },
      select: { plan: true },
    });
    // Draft / hidden / wrong-plan designs look exactly like missing ones.
    const design = await findPublishedDesign(id, plan);
    if (!design) throw notFound('Design');
    if (ids.length > design.product_slots) {
      throw validationError(`This design holds at most ${design.product_slots} product(s)`);
    }
    await assertOwnProducts(retailerId, ids);

    try {
      const jpeg = await renderDesignJpeg({
        retailerId,
        design,
        productIds: ids,
        custom: body.data,
      });
      const key = `retailers/${retailerId}/designs/${createHash('sha256')
        .update(randomBytes(8))
        .digest('hex')
        .slice(0, 16)}.jpg`;
      await uploadBuffer(key, jpeg, 'image/jpeg');
      // Counter only; a failed bump must not lose a rendered image.
      await prisma.designTemplate
        .update({ where: { id: design.id }, data: { usage_count: { increment: 1 } } })
        .catch((err) => console.error('[designs] usage_count bump failed', design.id, err));
      return { data: { image_url: publicUrl(key), image_key: key } };
    } catch (err) {
      console.error('[designs] render failed', design.id, err);
      throw validationError(
        err instanceof DesignRenderError
          ? err.userMessage
          : 'Could not make this design. Try another product or design.',
      );
    }
  });
};
