// Auto-split from admin-settings.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin.js';

/** Operation types that can be pending approval */
const OPERATION_TYPES = [
  'DEPLOYMENT',
  'BACKUP_RESTORE',
  'BULK_ACTION',
  'CONFIG_CHANGE',
  'DATA_EXPORT',
  'MIGRATION',
] as const;

export const adminOperationsRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  server.get('/operations/pending', async () => {
    // Find audit log entries that represent pending operations
    // (those with action containing 'PENDING_')
    const pendingOps = await prisma.auditLog.findMany({
      where: {
        action: { startsWith: 'PENDING_' },
        created_at: { gte: new Date(Date.now() - 7 * 86400000) }, // Last 7 days
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    });

    return {
      data: pendingOps.map((op) => ({
        id: op.id,
        type: op.action.replace('PENDING_', ''),
        description: ((op.metadata as Record<string, unknown>)?.description as string) ?? op.action,
        requested_by: op.actor_id ?? 'unknown',
        requested_at: op.created_at.toISOString(),
        metadata: op.metadata,
      })),
    };
  });

  server.post('/operations/:id/approve', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ note: z.string().max(500).optional() }).parse(request.body);

    const pending = await prisma.auditLog.findUnique({ where: { id } });
    if (!pending) throw notFound('Pending operation');
    if (!pending.action.startsWith('PENDING_')) {
      throw validationError('Operation is not in pending state');
    }

    // Log the approval
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: `APPROVED_${pending.action.replace('PENDING_', '')}`,
        resource_type: 'AdminOperation',
        resource_id: id,
        metadata: {
          original_action: pending.action,
          original_metadata: pending.metadata,
          note: body.note ?? null,
          approved_at: new Date().toISOString(),
        },
        ip_address: request.ip,
      },
    });

    // Update the original pending entry
    await prisma.auditLog.update({
      where: { id },
      data: {
        metadata: {
          ...((pending.metadata as Record<string, unknown>) ?? {}),
          status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by: request.ip,
        },
      },
    });

    request.log.info({ operation_id: id }, 'Operation approved');
    return { data: { status: 'approved', id } };
  });

  server.post('/operations/:id/reject', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ reason: z.string().min(1).max(1000) }).parse(request.body);

    const pending = await prisma.auditLog.findUnique({ where: { id } });
    if (!pending) throw notFound('Pending operation');
    if (!pending.action.startsWith('PENDING_')) {
      throw validationError('Operation is not in pending state');
    }

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: `REJECTED_${pending.action.replace('PENDING_', '')}`,
        resource_type: 'AdminOperation',
        resource_id: id,
        metadata: {
          original_action: pending.action,
          original_metadata: pending.metadata,
          reason: body.reason,
          rejected_at: new Date().toISOString(),
        },
        ip_address: request.ip,
      },
    });

    await prisma.auditLog.update({
      where: { id },
      data: {
        metadata: {
          ...((pending.metadata as Record<string, unknown>) ?? {}),
          status: 'rejected',
          rejected_at: new Date().toISOString(),
          rejected_by: request.ip,
          rejection_reason: body.reason,
        },
      },
    });

    request.log.info({ operation_id: id }, 'Operation rejected');
    return { data: { status: 'rejected', id } };
  });

  // ─── POST /admin/operations/request ─────────────────────────────
  // Utility endpoint to create a pending operation (used by scripts).
  server.post('/operations/request', async (request) => {
    const body = z
      .object({
        type: z.enum(OPERATION_TYPES),
        description: z.string().min(1).max(1000),
        metadata: z.record(z.unknown()).optional(),
      })
      .parse(request.body);

    const entry = await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: `PENDING_${body.type}`,
        resource_type: 'AdminOperation',
        metadata: {
          description: body.description,
          ...(body.metadata ?? {}),
          status: 'pending',
          created_at: new Date().toISOString(),
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ operation_id: entry.id, type: body.type }, 'Pending operation created');
    return { data: { id: entry.id, status: 'pending' } };
  });
};
