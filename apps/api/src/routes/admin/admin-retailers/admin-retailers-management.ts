// Auto-split from admin/admin-retailers.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../../admin-auth.js';

export const adminRetailersManagementRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/retailers/:id/overrides ─────────────────────────
  // F-010: List per-retailer limit overrides for a specific retailer.
  server.get('/retailers/:id/overrides', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const retailer = await prisma.retailer.findUnique({ where: { id, deleted_at: null } });
    if (!retailer) throw notFound('Retailer');

    const overrides = await prisma.retailerLimitOverride.findMany({
      where: { retailer_id: id },
      orderBy: { resource_type: 'asc' },
    });
    return { data: overrides };
  });

  // ─── POST /admin/retailers/:id/overrides ────────────────────────
  // F-010: Create or update a per-retailer limit override.
  server.post('/retailers/:id/overrides', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        resource_type: z.enum([
          'PRODUCT_UPLOAD',
          'AI_TAGGING_CALL',
          'TRY_ON',
          'IMAGE_CROP',
          'BG_REMOVAL',
          'API_REQUEST',
        ]),
        limit_per_period: z.number().int().min(-1),
        period: z.enum(['DAY', 'MONTH', 'LIFETIME']),
        reason: z.string().max(200).optional(),
      })
      .parse(request.body);

    const retailer = await prisma.retailer.findUnique({ where: { id, deleted_at: null } });
    if (!retailer) throw notFound('Retailer');

    // Capture before-state for audit log
    const prevOverride = await prisma.retailerLimitOverride.findUnique({
      where: { retailer_id_resource_type: { retailer_id: id, resource_type: body.resource_type } },
    });

    const override = await prisma.retailerLimitOverride.upsert({
      where: {
        retailer_id_resource_type: { retailer_id: id, resource_type: body.resource_type },
      },
      create: { retailer_id: id, ...body },
      update: { limit_per_period: body.limit_per_period, period: body.period, reason: body.reason },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: prevOverride ? 'UPDATE' : 'CREATE',
        resource_type: 'RetailerLimitOverride',
        resource_id: override.id,
        metadata: {
          retailer_id: id,
          before: prevOverride
            ? {
                limit_per_period: prevOverride.limit_per_period,
                period: prevOverride.period,
                reason: prevOverride.reason,
              }
            : null,
          after: {
            resource_type: body.resource_type,
            limit_per_period: body.limit_per_period,
            period: body.period,
            reason: body.reason ?? null,
          },
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ retailer_id: id, resource_type: body.resource_type }, 'Override set');
    return { data: override };
  });

  // ─── DELETE /admin/retailers/:id/overrides/:overrideId ───────────
  // F-010: Remove a per-retailer limit override, falling back to plan default.
  server.delete('/retailers/:id/overrides/:overrideId', async (request, reply) => {
    const { id, overrideId } = z
      .object({ id: z.string(), overrideId: z.string() })
      .parse(request.params);

    const existing = await prisma.retailerLimitOverride.findFirst({
      where: { id: overrideId, retailer_id: id },
    });
    if (!existing) throw notFound('Override');

    await prisma.retailerLimitOverride.delete({ where: { id: overrideId } });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'DELETE',
        resource_type: 'RetailerLimitOverride',
        resource_id: overrideId,
        metadata: {
          retailer_id: id,
          before: {
            resource_type: existing.resource_type,
            limit_per_period: existing.limit_per_period,
            period: existing.period,
            reason: existing.reason,
          },
        },
        ip_address: request.ip,
      },
    });

    request.log.info(
      { retailer_id: id, resource_type: existing.resource_type },
      'Override removed',
    );
    return reply.status(204).send();
  });

  // ─── POST /admin/retailers/:id/suspend ──────────────────────────
  // Suspend a retailer account. Reason required.
  server.post('/retailers/:id/suspend', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ reason: z.string().min(1).max(500) }).parse(request.body);

    const retailer = await prisma.retailer.findUnique({ where: { id, deleted_at: null } });
    if (!retailer) throw notFound('Retailer');
    if (retailer.is_suspended) throw validationError('Retailer is already suspended');

    await prisma.retailer.update({
      where: { id },
      data: { is_suspended: true, suspended_at: new Date(), suspended_reason: body.reason },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'SUSPEND',
        resource_type: 'Retailer',
        resource_id: id,
        metadata: { reason: body.reason, shop_name: retailer.shop_name },
        ip_address: request.ip,
      },
    });

    request.log.info({ retailer_id: id, reason: body.reason }, 'Retailer suspended');
    return {
      data: {
        is_suspended: true,
        suspended_at: new Date().toISOString(),
        suspended_reason: body.reason,
      },
    };
  });

  // ─── POST /admin/retailers/:id/unsuspend ────────────────────────
  server.post('/retailers/:id/unsuspend', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const retailer = await prisma.retailer.findUnique({ where: { id, deleted_at: null } });
    if (!retailer) throw notFound('Retailer');
    if (!retailer.is_suspended) throw validationError('Retailer is not suspended');

    await prisma.retailer.update({
      where: { id },
      data: {
        is_suspended: false,
        suspended_at: null,
        suspended_reason: null,
        suspended_by_id: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UNSUSPEND',
        resource_type: 'Retailer',
        resource_id: id,
        metadata: { shop_name: retailer.shop_name, was_reason: retailer.suspended_reason },
        ip_address: request.ip,
      },
    });

    request.log.info({ retailer_id: id }, 'Retailer unsuspended');
    return { data: { is_suspended: false } };
  });

  // ─── POST /admin/customers/:customerId/block ────────────────────
  server.post('/customers/:customerId/block', async (request) => {
    const { customerId } = z.object({ customerId: z.string() }).parse(request.params);
    const body = z.object({ reason: z.string().min(1).max(500) }).parse(request.body);

    const customer = await prisma.customer.findUnique({
      where: { id: customerId, deleted_at: null },
    });
    if (!customer) throw notFound('Customer');
    if (customer.is_blocked) throw validationError('Customer is already blocked');

    await prisma.customer.update({
      where: { id: customerId },
      data: { is_blocked: true, blocked_at: new Date(), blocked_reason: body.reason },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'BLOCK_CUSTOMER',
        resource_type: 'Customer',
        resource_id: customerId,
        metadata: {
          reason: body.reason,
          customer_name: customer.name,
          retailer_id: customer.retailer_id,
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ customer_id: customerId, reason: body.reason }, 'Customer blocked');
    return {
      data: { is_blocked: true, blocked_at: new Date().toISOString(), blocked_reason: body.reason },
    };
  });

  // ─── POST /admin/customers/:customerId/unblock ──────────────────
  server.post('/customers/:customerId/unblock', async (request) => {
    const { customerId } = z.object({ customerId: z.string() }).parse(request.params);

    const customer = await prisma.customer.findUnique({
      where: { id: customerId, deleted_at: null },
    });
    if (!customer) throw notFound('Customer');
    if (!customer.is_blocked) throw validationError('Customer is not blocked');

    await prisma.customer.update({
      where: { id: customerId },
      data: { is_blocked: false, blocked_at: null, blocked_reason: null },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UNBLOCK_CUSTOMER',
        resource_type: 'Customer',
        resource_id: customerId,
        metadata: { customer_name: customer.name },
        ip_address: request.ip,
      },
    });

    request.log.info({ customer_id: customerId }, 'Customer unblocked');
    return { data: { is_blocked: false } };
  });
};
