// F-037 Phase 3 — admin behavior analytics
// (docs/tasks/pending/customer-engagement-analytics.md §3.4, §6).
//
// Two views, reading ONLY the Phase 2 rollup tables (RetailerEngagementDaily,
// CustomerEngagementSummary) — never CustomerInteraction directly, per the
// spec's own rule (§7.2).
//
//   GET /engagement/retailers/:id            — store-level, aggregate only,
//                                               the default landing view.
//   GET /engagement/customers/:customerId    — per-customer drill-down, raw
//                                               interaction history. This is
//                                               an investigation tool, not a
//                                               browsing screen (§3.4/§4) —
//                                               every call writes an AuditLog
//                                               row before returning data, so
//                                               "who looked at this shopper's
//                                               data" always has an answer.
//
// Standard-admin segment ('engagement' in admin-access.ts), not Super-Admin —
// this is support/behavior data, same tier as 'customers'.

import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { loadRetailerEngagementView } from '../../lib/engagement-view.js';
import { notFound } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

export const adminEngagementRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /engagement/retailers/:id ──────────────────────────────
  server.get('/engagement/retailers/:id', async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const query = z
      .object({ days: z.coerce.number().int().min(1).max(90).default(30) })
      .parse(request.query ?? {});

    const retailer = await prisma.retailer.findUnique({
      where: { id: params.id },
      select: { id: true, shop_name: true },
    });
    if (!retailer) throw notFound('Retailer');

    const view = await loadRetailerEngagementView(params.id, query.days);

    return {
      data: { retailer: { id: retailer.id, shop_name: retailer.shop_name }, ...view },
    };
  });

  // ─── GET /engagement/customers/:customerId ──────────────────────
  // Investigation tool: every call is audited BEFORE the data is returned.
  server.get('/engagement/customers/:customerId', async (request) => {
    const params = z.object({ customerId: z.string().min(1) }).parse(request.params);
    const query = z.object({ retailer_id: z.string().min(1) }).parse(request.query ?? {});

    const summary = await prisma.customerEngagementSummary.findUnique({
      where: {
        customer_account_id_retailer_id: {
          customer_account_id: params.customerId,
          retailer_id: query.retailer_id,
        },
      },
    });
    if (!summary) throw notFound('Engagement summary for this customer at this store');

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        actor_id: request.adminId ?? 'system',
        action: 'ADMIN_VIEWED_CUSTOMER_ENGAGEMENT',
        resource_type: 'CustomerAccount',
        resource_id: params.customerId,
        metadata: { retailer_id: query.retailer_id },
        ip_address: request.ip,
      },
    });

    const history = await prisma.customerInteraction.findMany({
      where: { customer_account_id: params.customerId, retailer_id: query.retailer_id },
      orderBy: { created_at: 'desc' },
      take: 50,
      select: { id: true, type: true, product_id: true, metadata: true, created_at: true },
    });

    return {
      data: {
        summary: {
          total_dwell_ms: summary.total_dwell_ms.toString(),
          view_count: summary.view_count,
          favorite_count: summary.favorite_count,
          enquiry_count: summary.enquiry_count,
          last_active_at: summary.last_active_at,
        },
        history,
      },
    };
  });
};
