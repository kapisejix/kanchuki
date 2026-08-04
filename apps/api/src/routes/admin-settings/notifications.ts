// Auto-split from admin-settings.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { adminAuthPreHandler } from '../admin.js';
import { getSetting, saveSetting } from './settings-store.js';

const NOTIFICATION_SETTING_KEY = 'notification_preferences';

const DEFAULT_NOTIFICATION_PREFERENCES: {
  backup_failure: { enabled: boolean; channels: ('admin_bell' | 'email')[] };
  consecutive_failures: { enabled: boolean; threshold: number };
  integrity_failure: { enabled: boolean };
} = {
  backup_failure: { enabled: true, channels: ['admin_bell'] },
  consecutive_failures: { enabled: true, threshold: 2 },
  integrity_failure: { enabled: true },
};

export const adminNotificationsRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/settings/notifications ─────────────────────────────
  server.get('/settings/notifications', async () => {
    const saved = await getSetting(NOTIFICATION_SETTING_KEY);
    const preferences = saved as Record<string, unknown> | null;

    // Merge saved with defaults so new fields always appear
    const merged = {
      backup_failure: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.backup_failure,
        ...((preferences?.backup_failure as Record<string, unknown>) ?? {}),
      },
      consecutive_failures: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.consecutive_failures,
        ...((preferences?.consecutive_failures as Record<string, unknown>) ?? {}),
      },
      integrity_failure: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.integrity_failure,
        ...((preferences?.integrity_failure as Record<string, unknown>) ?? {}),
      },
      // Status summary for the UI
      last_alert: null as { time: string; type: string; message: string } | null,
      consecutive_failures_count: 0,
    };

    // Fetch latest alert for dashboard context
    const [lastAlert, recentBackupEntries] = await Promise.all([
      prisma.auditLog.findFirst({
        where: {
          action: { in: ['BACKUP_FAILURE_ALERT', 'INTEGRITY_FAILURE_ALERT'] },
          resource_type: 'Notification',
        },
        orderBy: { created_at: 'desc' },
        select: { created_at: true, action: true, metadata: true },
      }),
      prisma.auditLog.findMany({
        where: {
          action: {
            in: [
              'SCHEDULED_BACKUP',
              'SCHEDULED_BACKUP_FAILED',
              'WEEKLY_BACKUP',
              'WEEKLY_BACKUP_FAILED',
            ],
          },
          resource_type: 'DatabaseBackup',
        },
        orderBy: { created_at: 'desc' },
        take: 5,
        select: { action: true },
      }),
    ]);

    if (lastAlert) {
      const meta = lastAlert.metadata as Record<string, unknown> | null;
      merged.last_alert = {
        time: lastAlert.created_at.toISOString(),
        type: lastAlert.action,
        message: (meta?.message as string) ?? 'No details',
      };
    }

    // Count consecutive failures
    let consecutiveFailures = 0;
    for (const entry of recentBackupEntries) {
      if (entry.action.endsWith('_FAILED')) consecutiveFailures++;
      else break;
    }
    merged.consecutive_failures_count = consecutiveFailures;

    return { data: merged };
  });

  // ─── PUT /admin/settings/notifications ─────────────────────────────
  server.put('/settings/notifications', async (request) => {
    const body = z
      .object({
        backup_failure: z
          .object({
            enabled: z.boolean(),
            channels: z
              .array(z.enum(['admin_bell', 'email']))
              .min(1)
              .max(5),
          })
          .optional(),
        consecutive_failures: z
          .object({
            enabled: z.boolean(),
            threshold: z.number().int().min(1).max(10),
          })
          .optional(),
        integrity_failure: z
          .object({
            enabled: z.boolean(),
          })
          .optional(),
      })
      .parse(request.body);

    // Load existing preferences to merge (not replace)
    const saved = await getSetting(NOTIFICATION_SETTING_KEY);
    const existing = (saved ?? {}) as Record<string, unknown>;

    const merged = {
      backup_failure: body.backup_failure
        ? { ...DEFAULT_NOTIFICATION_PREFERENCES.backup_failure, ...body.backup_failure }
        : (existing.backup_failure ?? DEFAULT_NOTIFICATION_PREFERENCES.backup_failure),
      consecutive_failures: body.consecutive_failures
        ? { ...DEFAULT_NOTIFICATION_PREFERENCES.consecutive_failures, ...body.consecutive_failures }
        : (existing.consecutive_failures ?? DEFAULT_NOTIFICATION_PREFERENCES.consecutive_failures),
      integrity_failure: body.integrity_failure
        ? { ...DEFAULT_NOTIFICATION_PREFERENCES.integrity_failure, ...body.integrity_failure }
        : (existing.integrity_failure ?? DEFAULT_NOTIFICATION_PREFERENCES.integrity_failure),
    };

    await saveSetting(NOTIFICATION_SETTING_KEY, merged as unknown as Record<string, unknown>);

    request.log.info('Notification preferences updated');
    return { data: merged };
  });

  // ─── GET /admin/alerts ────────────────────────────────────────────
  // Recent system alerts for the admin header bell dropdown.
  server.get('/alerts', async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

    const alerts = await prisma.auditLog.findMany({
      where: {
        action: { in: ['BACKUP_FAILURE_ALERT', 'INTEGRITY_FAILURE_ALERT', 'NOTIFY_TEST'] },
        resource_type: 'Notification',
        created_at: { gte: sevenDaysAgo },
      },
      orderBy: { created_at: 'desc' },
      take: 20,
      select: {
        id: true,
        action: true,
        metadata: true,
        created_at: true,
      },
    });

    return {
      data: alerts.map((a) => {
        const meta = a.metadata as Record<string, unknown> | null;
        return {
          id: a.id,
          type: a.action,
          message: (meta?.message as string) ?? a.action,
          severity: (meta?.severity as string) ?? 'info',
          time: a.created_at.toISOString(),
        };
      }),
    };
  });

  // ─── POST /admin/notify/test ─────────────────────────────────────
  // Send a test notification to verify alert channels are working.
  server.post('/notify/test', async (request) => {
    // Log the test notification — actual SMS/email sending
    // would require a notification service hook (Phase 2).
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'NOTIFY_TEST',
        resource_type: 'Notification',
        metadata: {
          message: 'Test notification from admin panel',
          severity: 'info',
          timestamp: new Date().toISOString(),
        },
        ip_address: request.ip,
      },
    });

    request.log.info('Test notification sent');
    return {
      data: {
        status: 'logged',
        message: 'Test notification logged. Configure SMS/email provider for actual delivery.',
      },
    };
  });
};
