// Retailer aggregate taste analytics.
//
// GET /retailers/me/visitor-taste
//
// The CustomerFashionDNA source was removed in the feature teardown
// (chore/remove-unwanted-features, migration 082). The endpoint is kept so the
// mobile taste-analytics screen still resolves, but no preference source
// remains — it reports the raw visitor count with empty taste dimensions.

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';

const K_ANON_THRESHOLD = 5;

export const retailersVisitorTasteRoutes: FastifyPluginAsync = async (server) => {
  server.get('/me/visitor-taste', async (request, reply) => {
    const totalVisitors = await prisma.customerStoreVisit.count({
      where: { retailer_id: request.retailerId },
    });

    return reply.status(200).send({
      data: {
        total_visitors: totalVisitors,
        passport_visitors: 0,
        top_colors: {},
        top_styles: {},
        top_fabrics: {},
        top_occasions: {},
        budget: { avg_min: null, avg_max: null, range_distribution: {} },
        k_anonymity_threshold: K_ANON_THRESHOLD,
        has_sufficient_data: false,
      },
    });
  });
};
