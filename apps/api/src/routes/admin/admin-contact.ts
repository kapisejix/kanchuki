import { prisma } from '@kanchuki/db';
// Admin view of messages submitted through the public /contact form
// (POST /v1/public/contact → AuditLog with resource_type 'ContactSubmission').
// The platform activity feed can already show these as raw audit entries;
// this endpoint is the business-friendly read: parsed name/topic/message
// instead of a JSON blob, newest first, topic-filterable, cursor-paginated.
// No new table or migration — the audit trail IS the store.
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { adminAuthPreHandler } from '../admin-auth.js';

export interface ContactSubmission {
  id: string;
  name: string;
  shop_city: string | null;
  topic: string;
  message: string;
  ip_address: string | null;
  created_at: string;
}

// The /contact form stores { name, shop_city, topic, message } in
// AuditLog.metadata. Metadata is Json (any shape) and rows could predate the
// field — parse defensively so a malformed value degrades to '' instead of
// crashing the whole list.
function parseContactSubmission(entry: {
  id: string;
  metadata: unknown;
  ip_address: string | null;
  created_at: Date;
}): ContactSubmission {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
  return {
    id: entry.id,
    name: asString(meta.name),
    shop_city: asString(meta.shop_city) || null,
    topic: asString(meta.topic),
    message: asString(meta.message),
    ip_address: entry.ip_address,
    created_at: entry.created_at.toISOString(),
  };
}

export const adminContactRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/contact-submissions ─────────────────────────────
  // Newest-first list of contact-form messages with a topic filter.
  // Cursor pagination (id-based, same shape as /admin/activity).
  server.get('/contact-submissions', async (request) => {
    const query = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        topic: z.string().max(100).optional(),
      })
      .safeParse(request.query);

    const { cursor, limit, topic } = query.success
      ? query.data
      : { cursor: undefined, limit: 50, topic: undefined };

    const where: Record<string, unknown> = {
      resource_type: 'ContactSubmission',
    };
    if (cursor) where.id = { lt: cursor };
    if (topic) {
      // Postgres jsonb path filter on AuditLog.metadata.topic — the exact
      // values the public form accepts (see CONTACT_TOPICS in public-misc.ts).
      where.metadata = { path: ['topic'], equals: topic };
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit + 1,
      }),
      prisma.auditLog.count({ where }),
    ]);

    const hasMore = logs.length > limit;
    const page = hasMore ? logs.slice(0, limit) : logs;

    return {
      data: page.map(parseContactSubmission),
      pagination: {
        cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        has_more: hasMore,
        total,
      },
    };
  });
};
