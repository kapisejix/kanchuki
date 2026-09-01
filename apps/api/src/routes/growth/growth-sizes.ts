import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hasFeature } from '../../lib/features.js';
import { featureUnavailable, notFound, validationError } from '../../plugins/error-handler.js';

// ─── Roadmap N — Indian Size & Fit: product-level size recommendation ──
// Size recommendation engine removed — this route returns a basic fallback.
export const growthSizeRoutes: FastifyPluginAsync = async (server) => {
  server.post('/customers/:id/recommended-size', async (request) => {
    const retailerId = request.retailerId;
    if (!(await hasFeature(retailerId, 'GROWTH_ENGINE'))) throw featureUnavailable('Growth tools');
    const { id } = request.params as { id: string };

    const body = z
      .object({ product_id: z.string().min(1) })
      .safeParse(request.body);
    if (!body.success) throw validationError('product_id is required');

    const [customer, product] = await Promise.all([
      prisma.customer.findFirst({ where: { id, retailer_id: retailerId, deleted_at: null } }),
      prisma.product.findFirst({
        where: { id: body.data.product_id, retailer_id: retailerId, deleted_at: null },
      }),
    ]);
    if (!customer) throw notFound('Customer');
    if (!product) throw notFound('Product');

    // Fallback: return usual_size if set, otherwise null
    return {
      data: {
        suggested_size: customer.usual_size ?? null,
        basis: customer.usual_size ? 'USUAL' : null,
      },
    };
  });
};
