// Shared audit-log-as-key-value-store helpers extracted from admin-settings.ts
// (scripts/check-route-size.sh split). Route modules import from here.
import { type Prisma, prisma } from '@kanchuki/db';

export async function getSetting(key: string): Promise<Record<string, unknown> | null> {
  try {
    // Find the most recent audit log entry for this setting type
    const entry = await prisma.auditLog.findFirst({
      where: { action: `SETTING_${key}`, resource_type: 'AdminSetting' },
      orderBy: { created_at: 'desc' },
      select: { metadata: true },
    });
    return entry?.metadata as Record<string, unknown> | null;
  } catch {
    return null;
  }
}

export async function saveSetting(key: string, value: Record<string, unknown>): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actor_type: 'admin',
      action: `SETTING_${key}`,
      resource_type: 'AdminSetting',
      metadata: value as Prisma.InputJsonValue,
    },
  });
}
