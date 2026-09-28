// F-037 Phase 4 — retailer-facing engagement view
// (docs/tasks/pending/customer-engagement-analytics.md §6 Phase 4).
//
// Same rollup table (RetailerEngagementDaily) the admin dashboard reads
// (apps/api/src/lib/engagement-view.ts), scoped to the caller's OWN store —
// no customer id parameter exists on this route at all, which is the
// enforcement of the §4 privacy boundary ("a retailer sees only aggregate
// stats for their own store, never per-customer trails").

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { loadRetailerEngagementView } from '../../lib/engagement-view.js';

export const growthEngagementRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /engagement ─────────────────────────────────────────────
  server.get('/engagement', async (request) => {
    const retailerId = request.retailerId;
    const query = z
      .object({ days: z.coerce.number().int().min(1).max(90).default(30) })
      .parse(request.query ?? {});

    const view = await loadRetailerEngagementView(retailerId, query.days);
    return { data: view };
  });
};
