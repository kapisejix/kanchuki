// Auto-split from admin-settings.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { execSync } from 'node:child_process';
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { adminAuthPreHandler } from '../admin.js';

export const adminBackupsStatusRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/backups/status ────────────────────────────────────
  // Quick backup health summary for the admin dashboard.
  server.get('/backups/status', async () => {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last7d = new Date(Date.now() - 7 * 86400000);

    const [recentBackups, lastFailure, totalBackups] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          action: { in: ['SCHEDULED_BACKUP', 'SCHEDULED_BACKUP_FAILED'] },
          resource_type: 'DatabaseBackup',
          created_at: { gte: last24h },
        },
        orderBy: { created_at: 'desc' },
        take: 5,
        select: { action: true, created_at: true, metadata: true },
      }),
      prisma.auditLog.findFirst({
        where: {
          action: 'SCHEDULED_BACKUP_FAILED',
          resource_type: 'DatabaseBackup',
          created_at: { gte: last7d },
        },
        orderBy: { created_at: 'desc' },
        select: { created_at: true, metadata: true },
      }),
      prisma.auditLog.count({
        where: { action: 'SCHEDULED_BACKUP', resource_type: 'DatabaseBackup' },
      }),
    ]);

    const lastSuccess = recentBackups.find((b) => b.action === 'SCHEDULED_BACKUP');
    const lastSuccessMeta = lastSuccess?.metadata as Record<string, unknown> | null;

    return {
      data: {
        total_backups: totalBackups,
        last_24h: {
          attempts: recentBackups.length,
          success_count: recentBackups.filter((b) => b.action === 'SCHEDULED_BACKUP').length,
          failure_count: recentBackups.filter((b) => b.action === 'SCHEDULED_BACKUP_FAILED').length,
        },
        last_successful: lastSuccess
          ? {
              time: lastSuccess.created_at.toISOString(),
              r2_key: (lastSuccessMeta?.r2_key as string) ?? null,
              size_bytes: (lastSuccessMeta?.compressed_size_bytes as number) ?? null,
              integrity_verified: (lastSuccessMeta?.integrity_verified as boolean) ?? false,
            }
          : null,
        last_failure: lastFailure
          ? {
              time: lastFailure.created_at.toISOString(),
              error:
                ((lastFailure.metadata as Record<string, unknown>)?.error as string) ?? 'Unknown',
            }
          : null,
        docker_available: (() => {
          try {
            execSync('docker --version', { stdio: 'pipe', timeout: 3000 });
            return true;
          } catch {
            return false;
          }
        })(),
      },
    };
  });
};
