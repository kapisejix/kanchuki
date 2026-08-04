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

export const adminModerationRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // F-015: ACCOUNT SUSPENSION
  // ═══════════════════════════════════════════════════════════════

  // ─── GET /admin/deletion-vault ───────────────────────────────────
  // F-016: View vault entries (read-only). Searchable by source_table,
  // source_id, or retailer_id. Paginated with cursor-based pagination.
  // Returns vault entries sorted by deleted_at descending.
  server.get('/deletion-vault', async (request) => {
    const query = z
      .object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        source_table: z.string().max(100).optional(),
        source_id: z.string().max(100).optional(),
        retailer_id: z.string().max(100).optional(),
      })
      .safeParse(request.query);

    const { cursor, limit, source_table, source_id, retailer_id } = query.success
      ? query.data
      : {
          cursor: undefined,
          limit: 50,
          source_table: undefined,
          source_id: undefined,
          retailer_id: undefined,
        };

    // Build where clause dynamically
    const where: Record<string, unknown> = {};
    if (source_table) where.source_table = { equals: source_table, mode: 'insensitive' as const };
    if (source_id) where.source_id = { contains: source_id, mode: 'insensitive' as const };
    if (retailer_id) where.retailer_id = { equals: retailer_id, mode: 'insensitive' as const };
    if (cursor) where.id = { lt: cursor };

    // Query the vault database (separate Postgres instance)
    const vault = await getVaultPrisma();
    if (!vault) {
      return {
        data: { entries: [], total_count: 0, vault_configured: false },
      };
    }

    const [entries, totalCount] = await Promise.all([
      vault.deletedRecord.findMany({
        where,
        orderBy: { deleted_at: 'desc' },
        take: limit + 1,
      }),
      vault.deletedRecord.count({ where }),
    ]);

    const hasMore = entries.length > limit;
    const page = hasMore ? entries.slice(0, limit) : entries;

    return {
      data: {
        entries: page.map((entry: Record<string, unknown>) => ({
          id: entry.id,
          source_table: entry.source_table,
          source_id: entry.source_id,
          retailer_id: entry.retailer_id,
          payload: entry.payload,
          delete_reason: entry.delete_reason,
          deleted_by: entry.deleted_by,
          deleted_at: entry.deleted_at,
        })),
        total_count: totalCount,
        vault_configured: true,
      },
      pagination: {
        cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        has_more: hasMore,
      },
    };
  });
};
