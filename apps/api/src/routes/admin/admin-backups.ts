// Auto-split from admin.ts (scripts/split-admin-routes.mjs) — route bodies verbatim.
import type { FastifyPluginAsync } from 'fastify';

import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
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
import { forbidden, notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

export const adminBackupsRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── Backup Management ─────────────────────────────────────────────
  // SECURITY §13: Backups are stored in R2 under the `backups/` prefix.
  // Each backup has a .sql.gz file and a companion .meta.json file.
  //
  // Because pg_dump requires Docker (not available in the Railway runtime),
  // actual backup/restore execution happens via the CLI scripts:
  //   pnpm db:backup
  //   pnpm db:restore --backup-key <key>
  // The API endpoints manage listing, metadata, and audit logging.

  /** Helper: create an S3 client for R2 using env vars (same pattern as scripts/). */
  function createBackupR2Client(): S3Client {
    const accountId = process.env.R2_ACCOUNT_ID;
    if (!accountId) throw validationError('R2_ACCOUNT_ID not configured');
    return new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
      },
    });
  }

  /** Helper: read a JSON object from R2. */
  async function getR2Json(key: string): Promise<Record<string, unknown> | null> {
    const r2 = createBackupR2Client();
    const bucket = process.env.R2_BUCKET_NAME ?? 'kanchuki-prod';
    try {
      const response = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const body = await response.Body?.transformToString();
      return body ? (JSON.parse(body) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  /** Helper: format bytes to human-readable string */
  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  // ─── GET /admin/backups ──────────────────────────────────────────
  // SECURITY §13: List all backups stored in R2 with metadata.
  server.get('/backups', async (_request) => {
    const r2 = createBackupR2Client();
    const bucket = process.env.R2_BUCKET_NAME ?? 'kanchuki-prod';

    // Paginate through all objects (S3/R2 returns max 1000 per page)
    const allObjects: { Key?: string; Size?: number; LastModified?: Date }[] = [];
    let continuationToken: string | undefined;
    do {
      const response = await r2.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: 'backups/',
          ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
        }),
      );
      if (response.Contents) allObjects.push(...response.Contents);
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    const objects = allObjects;

    // Group objects by backup (each backup has .sql.gz + .meta.json)
    const backupMap = new Map<
      string,
      {
        sql_gz: { key: string; size: number; last_modified: Date | undefined } | null;
        meta: Record<string, unknown> | null;
      }
    >();

    for (const obj of objects) {
      const key = obj.Key ?? '';
      if (key.endsWith('.meta.json')) {
        // Extract backup prefix (remove .meta.json)
        const prefix = key.slice(0, -'.meta.json'.length);
        let existing = backupMap.get(prefix);
        if (!existing) {
          existing = { sql_gz: null, meta: null };
          backupMap.set(prefix, existing);
        }
        // Try to read the metadata content
        const meta = await getR2Json(key);
        existing.meta = meta;
      } else if (key.endsWith('.sql.gz')) {
        const prefix = key.slice(0, -'.sql.gz'.length);
        let existing = backupMap.get(prefix);
        if (!existing) {
          existing = { sql_gz: null, meta: null };
          backupMap.set(prefix, existing);
        }
        existing.sql_gz = {
          key,
          size: obj.Size ?? 0,
          last_modified: obj.LastModified,
        };
      }
    }

    // Build backup list sorted by timestamp (newest first)
    const backups = Array.from(backupMap.entries())
      .flatMap(([prefix, v]) => {
        const sqlGz = v.sql_gz;
        if (!sqlGz) return []; // Only include entries with actual backup files
        return [
          {
            prefix,
            key: sqlGz.key,
            size: sqlGz.size,
            size_formatted: formatBytes(sqlGz.size),
            last_modified: sqlGz.last_modified?.toISOString() ?? null,
            metadata: v.meta,
            has_metadata: v.meta !== null,
          },
        ];
      })
      .sort((a, b) => (b.last_modified ?? '').localeCompare(a.last_modified ?? ''));

    // Calculate summary stats
    const total_size = backups.reduce((sum, b) => sum + b.size, 0);
    const latest_backup = backups.length > 0 ? backups[0] : null;

    return {
      data: {
        backups,
        summary: {
          total_count: backups.length,
          total_size,
          total_size_formatted: formatBytes(total_size),
          latest_backup: latest_backup
            ? {
                key: latest_backup.key,
                size_formatted: latest_backup.size_formatted,
                last_modified: latest_backup.last_modified,
                has_metadata: latest_backup.has_metadata,
              }
            : null,
        },
        environment: {
          docker_available: false, // Always false in Railway runtime
          backup_command: 'pnpm db:backup',
          restore_command: 'pnpm db:restore --backup-key <key>',
        },
      },
    };
  });

  // ─── POST /admin/backup/create ────────────────────────────────────
  // SECURITY §13: Trigger a backup. Logs the intent to the audit trail.
  // Actual execution requires the Docker-based CLI script.
  server.post('/backup/create', async (request) => {
    const body = z.object({ label: z.string().max(100).optional() }).safeParse(request.body);
    const label = body.success && body.data.label ? body.data.label : undefined;

    // Log to audit trail
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'BACKUP_CREATE',
        resource_type: 'Database',
        metadata: {
          label: label ?? null,
          triggered_from: 'admin-ui',
          note: 'Backup requires Docker runtime. Run the CLI script manually: pnpm db:backup',
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ label }, 'Backup triggered from admin UI');

    return {
      data: {
        status: 'logged',
        message: 'Backup request logged. Execute the backup via CLI:',
        commands: [
          `pnpm db:backup${label ? ` --label "${label}"` : ''}`,
          '# Or with custom env: npx tsx scripts/backup-database.ts',
        ],
        cli_command: `pnpm db:backup${label ? ` --label "${label}"` : ''}`,
        audit_logged: true,
      },
    };
  });

  // ─── POST /admin/backups/:key/restore ─────────────────────────────
  // SECURITY §13: Trigger a restore from backup. Logs the intent.
  server.post('/backups/restore', async (request) => {
    const body = z
      .object({ key: z.string().min(1), target: z.string().optional() })
      .parse(request.body);

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'BACKUP_RESTORE',
        resource_type: 'Database',
        metadata: {
          backup_key: body.key,
          target: body.target ?? 'primary',
          note: 'Restore requires Docker runtime. Run the CLI script manually: pnpm db:restore',
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ backup_key: body.key }, 'Restore triggered from admin UI');

    return {
      data: {
        status: 'logged',
        message: 'Restore request logged. Execute the restore via CLI:',
        commands: [
          `pnpm db:restore --backup-key "${body.key}"`,
          `# Or with custom target: pnpm db:restore --backup-key "${body.key}" --target "<db-url>"`,
        ],
        cli_command: `pnpm db:restore --backup-key "${body.key}"`,
        audit_logged: true,
      },
    };
  });

  // ─── GET /admin/backups/:key/metadata ─────────────────────────────
  // Fetch the .meta.json file for a specific backup.
  server.get('/backups/:key/metadata', async (request) => {
    const { key } = z.object({ key: z.string() }).parse(request.params);
    // The key is the .sql.gz path — derive the .meta.json path
    const metaKey = key.endsWith('.sql.gz')
      ? `${key.slice(0, -'.sql.gz'.length)}.meta.json`
      : `${key}.meta.json`;

    const meta = await getR2Json(metaKey);
    if (!meta) {
      return { data: { key: metaKey, metadata: null } };
    }

    return { data: { key: metaKey, metadata: meta } };
  });

  // ═══════════════════════════════════════════════════════════════
};
