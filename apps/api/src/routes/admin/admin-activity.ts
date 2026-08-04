// Auto-split from admin.ts (scripts/split-admin-routes.mjs) — route bodies verbatim.
import type { FastifyPluginAsync } from 'fastify';

import {
  encryptSecret,
  getReplicaPrisma,
  getSecret,
  getVaultPrisma,
  invalidateSecret,
  maskSecret,
  prisma,
  vaultDelete,
} from '@kanchuki/db';
import { z } from 'zod';
import { adminAuthPreHandler } from '../admin-auth.js';

export const adminActivityRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/activity ────────────────────────────────────────
  // F-014: Platform-wide activity feed with burst detection.
  // Shows recent AuditLog entries across all resources with a simple
  // threshold check: if the same action/resource_type pair from the
  // same actor appears >20 times in the last hour, it's flagged as a burst.
  server.get('/activity', async (request) => {
    const query = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        actor_type: z.string().max(50).optional(),
        action: z.string().max(100).optional(),
        resource_type: z.string().max(100).optional(),
        date_from: z.string().optional(),
        date_to: z.string().optional(),
      })
      .safeParse(request.query);

    const { cursor, limit, actor_type, action, resource_type, date_from, date_to } = query.success
      ? query.data
      : {
          cursor: undefined,
          limit: 50,
          actor_type: undefined,
          action: undefined,
          resource_type: undefined,
          date_from: undefined,
          date_to: undefined,
        };

    const where: Record<string, unknown> = {};
    if (cursor) where.id = { lt: cursor };
    if (actor_type) where.actor_type = { equals: actor_type, mode: 'insensitive' as const };
    if (action) where.action = action;
    if (resource_type)
      where.resource_type = { equals: resource_type, mode: 'insensitive' as const };
    if (date_from || date_to) {
      const created_at: Record<string, Date> = {};
      if (date_from) created_at.gte = new Date(date_from);
      if (date_to) created_at.lte = new Date(date_to);
      where.created_at = created_at;
    }

    // Burst detection: count grouped by (action, resource_type, actor_type) in the last hour
    const oneHourAgo = new Date(Date.now() - 3600000);
    const [burstGroups, logs, totalCount] = await Promise.all([
      prisma.auditLog.groupBy({
        by: ['action', 'resource_type', 'actor_type'],
        where: { created_at: { gte: oneHourAgo } },
        _count: true,
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      prisma.auditLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit + 1,
      }),
      prisma.auditLog.count({ where }),
    ]);

    const hasMore = logs.length > limit;
    const page = hasMore ? logs.slice(0, limit) : logs;

    // Flag bursts: when the same (action, resource_type, actor_type) appears >20 times in the last hour
    const bursts = burstGroups
      .filter((g) => g._count > 20)
      .map((g) => ({
        action: g.action,
        resource_type: g.resource_type,
        actor_type: g.actor_type,
        count: g._count,
        threshold: 20,
        flagged: g._count > 20,
      }));

    return {
      data: {
        logs: page,
        bursts,
      },
      pagination: {
        cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        has_more: hasMore,
        total: totalCount,
      },
    };
  });

  // ─── GET /admin/audit-logs ───────────────────────────────────
  // SECURITY §18: View the audit trail with filtering and pagination.
  // Returns most recent entries first. Filters are optional.
  server.get('/audit-logs', async (request) => {
    const query = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        action: z.string().max(100).optional(),
        actor_type: z.string().max(50).optional(),
        actor_id: z.string().optional(),
        resource_type: z.string().max(100).optional(),
        resource_id: z.string().optional(),
        ip_address: z.string().max(50).optional(),
        date_from: z.string().optional(), // ISO date string
        date_to: z.string().optional(), // ISO date string
      })
      .safeParse(request.query);

    const {
      cursor,
      limit,
      action,
      actor_type,
      actor_id,
      resource_type,
      resource_id,
      ip_address,
      date_from,
      date_to,
    } = query.success
      ? query.data
      : {
          cursor: undefined,
          limit: 50,
          action: undefined,
          actor_type: undefined,
          actor_id: undefined,
          resource_type: undefined,
          resource_id: undefined,
          ip_address: undefined,
          date_from: undefined,
          date_to: undefined,
        };

    const where: Record<string, unknown> = {};
    if (cursor) where.id = { lt: cursor };
    if (action) where.action = { contains: action, mode: 'insensitive' as const };
    if (actor_type) where.actor_type = { equals: actor_type, mode: 'insensitive' as const };
    if (actor_id) where.actor_id = actor_id;
    if (resource_type)
      where.resource_type = { equals: resource_type, mode: 'insensitive' as const };
    if (resource_id) where.resource_id = resource_id;
    if (ip_address) where.ip_address = { contains: ip_address };
    if (date_from || date_to) {
      const created_at: Record<string, Date> = {};
      if (date_from) created_at.gte = new Date(date_from);
      if (date_to) created_at.lte = new Date(date_to);
      where.created_at = created_at;
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: limit + 1,
    });

    const hasMore = logs.length > limit;
    const page = hasMore ? logs.slice(0, limit) : logs;

    return {
      data: page,
      pagination: {
        cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        has_more: hasMore,
      },
    };
  });

};
