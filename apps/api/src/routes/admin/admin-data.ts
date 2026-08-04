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

export const adminDataRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── POST /admin/query ─────────────────────────────────────────────
  // SECURITY §14: Admin read-only SQL query console. Runs against the
  // read-replica (DATABASE_URL_REPLICA) — NEVER against the primary DB.
  // Only SELECT, EXPLAIN, and WITH queries are permitted.
  // All queries are logged to the audit trail.
  server.post('/query', async (request) => {
    const body = z.object({ query: z.string().min(1).max(10000) }).parse(request.body);

    const sql = body.query.trim();

    // ── Read-only enforcement ─────────────────────────────────────
    // Strip leading SQL comments (-- and /* */)
    const stripped = sql.replace(/^\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/)*\s*/m, '').trim();
    const firstWord = stripped.split(/[\s(]/)[0]?.toUpperCase() ?? '';

    const READ_ONLY_STATEMENTS = ['SELECT', 'EXPLAIN', 'WITH'];
    if (!READ_ONLY_STATEMENTS.includes(firstWord)) {
      throw validationError(
        `Only SELECT, EXPLAIN, and WITH queries are allowed (got "${firstWord}")`,
      );
    }

    // Block multi-statement queries (semicolons outside string literals)
    // Simple heuristic: count semicolons that aren't inside quotes
    const strippedQuotes = sql.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '');
    const semicolonCount = (strippedQuotes.match(/;/g) ?? []).length;
    if (semicolonCount > 1) {
      throw validationError('Multi-statement queries are not allowed');
    }

    // ── Execute on replica ─────────────────────────────────────────
    const replica = getReplicaPrisma();
    const start = performance.now();

    let rows: unknown[];
    try {
      // Timeout via Promise.race — 30 seconds max
      // Timer is cleaned up via .finally() to avoid dangling timeout handles
      let timer: NodeJS.Timeout | undefined;
      const timerPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Query timed out after 30 seconds')), 30000);
      });
      // SET TRANSACTION READ ONLY makes Postgres itself reject any write —
      // including writable CTEs (`WITH x AS (DELETE ... RETURNING *) SELECT ...`)
      // that slip past the keyword check above.
      const result = (await Promise.race([
        replica.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
          return tx.$queryRawUnsafe(sql);
        }),
        timerPromise,
      ]).finally(() => clearTimeout(timer))) as unknown[];

      rows = Array.isArray(result) ? result : [result];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Query execution failed';
      request.log.warn({ query: sql.slice(0, 200) }, `Admin query failed: ${message}`);

      await prisma.auditLog.create({
        data: {
          actor_type: 'admin',
          action: 'QUERY_ERROR',
          resource_type: 'DatabaseQuery',
          metadata: {
            query_preview: sql.slice(0, 500),
            error: message.slice(0, 500),
            execution_time_ms: Math.round(performance.now() - start),
          },
          ip_address: request.ip,
        },
      });

      return {
        data: {
          error: message,
          execution_time_ms: Math.round(performance.now() - start),
        },
      };
    }

    const elapsed = Math.round(performance.now() - start);
    const MAX_ROWS = 1000;
    const truncated = rows.length > MAX_ROWS;
    const displayRows = truncated ? rows.slice(0, MAX_ROWS) : rows;
    const columns =
      displayRows.length > 0 ? Object.keys(displayRows[0] as Record<string, unknown>) : [];

    // ── Audit log ──────────────────────────────────────────────────
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'QUERY',
        resource_type: 'DatabaseQuery',
        metadata: {
          query_preview: sql.slice(0, 500),
          row_count: rows.length,
          truncated,
          execution_time_ms: elapsed,
          column_count: columns.length,
        },
        ip_address: request.ip,
      },
    });

    request.log.info({ row_count: rows.length, elapsed }, 'Admin query executed');

    return {
      data: {
        columns,
        rows: displayRows,
        row_count: rows.length,
        truncated,
        execution_time_ms: elapsed,
      },
    };
  });

  // ─── GET /admin/schema ─────────────────────────────────────────────
  // Fetch database schema (tables, columns, types) from information_schema.
  // Used by the Query Console's Schema Explorer sidebar.
  server.get('/schema', async (_request) => {
    const replica = getReplicaPrisma();

    interface SchemaRow {
      table_schema: string;
      table_name: string;
      table_type: string;
      column_name: string | null;
      data_type: string | null;
      is_nullable: string | null;
      column_default: string | null;
      is_primary_key: boolean;
      ordinal_position: number | null;
      character_maximum_length: number | null;
      numeric_precision: number | null;
    }

    const rows = await replica.$queryRawUnsafe<SchemaRow[]>(`
      SELECT
        t.table_schema,
        t.table_name,
        t.table_type,
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        (pk.column_name IS NOT NULL) AS is_primary_key,
        c.ordinal_position,
        c.character_maximum_length,
        c.numeric_precision
      FROM information_schema.tables t
      LEFT JOIN information_schema.columns c
        ON c.table_schema = t.table_schema
        AND c.table_name = t.table_name
      LEFT JOIN (
        SELECT ku.table_schema, ku.table_name, ku.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku
          ON ku.constraint_name = tc.constraint_name
          AND ku.table_schema = tc.table_schema
          AND ku.table_name = tc.table_name
        WHERE tc.constraint_type = 'PRIMARY KEY'
      ) pk
        ON pk.table_schema = t.table_schema
        AND pk.table_name = t.table_name
        AND pk.column_name = c.column_name
      WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_schema, t.table_name, c.ordinal_position
    `);

    // Group by schema → table → columns
    const schemaMap = new Map<
      string,
      {
        schema_name: string;
        tables: Map<
          string,
          {
            table_name: string;
            table_type: string;
            columns: Array<{
              column_name: string;
              data_type: string | null;
              is_nullable: boolean;
              column_default: string | null;
              is_primary_key: boolean;
              ordinal_position: number | null;
              character_maximum_length: number | null;
              numeric_precision: number | null;
            }>;
            column_count: number;
          }
        >;
        table_count: number;
      }
    >();

    for (const row of rows) {
      if (!row.table_schema || !row.table_name) continue;

      let schemaEntry = schemaMap.get(row.table_schema);
      if (!schemaEntry) {
        schemaEntry = { schema_name: row.table_schema, tables: new Map(), table_count: 0 };
        schemaMap.set(row.table_schema, schemaEntry);
      }

      let tableEntry = schemaEntry.tables.get(row.table_name);
      if (!tableEntry) {
        tableEntry = {
          table_name: row.table_name,
          table_type: row.table_type ?? 'BASE TABLE',
          columns: [],
          column_count: 0,
        };
        schemaEntry.tables.set(row.table_name, tableEntry);
      }

      if (row.column_name) {
        tableEntry.columns.push({
          column_name: row.column_name,
          data_type: row.data_type,
          is_nullable: row.is_nullable === 'YES',
          column_default: row.column_default,
          is_primary_key: row.is_primary_key,
          ordinal_position: row.ordinal_position,
          character_maximum_length: row.character_maximum_length,
          numeric_precision: row.numeric_precision,
        });
        tableEntry.column_count = tableEntry.columns.length;
      }
    }

    // Convert maps to plain arrays for JSON serialization
    const schemas = Array.from(schemaMap.values())
      .map((s) => ({
        ...s,
        tables: Array.from(s.tables.values())
          .map((t) => ({
            ...t,
            columns: t.columns.sort(
              (a, b) => (a.ordinal_position ?? 0) - (b.ordinal_position ?? 0),
            ),
          }))
          .sort((a, b) => a.table_name.localeCompare(b.table_name)),
      }))
      .sort((a, b) => a.schema_name.localeCompare(b.schema_name));

    const total_tables = schemas.reduce((sum, s) => sum + s.table_count, 0);
    const total_columns = schemas.reduce(
      (sum, s) => sum + s.tables.reduce((tsum, t) => tsum + t.column_count, 0),
      0,
    );

    return {
      data: {
        schemas,
        summary: {
          total_schemas: schemas.length,
          total_tables,
          total_columns,
        },
      },
    };
  });

  // ─── GET /admin/database/status ───────────────────────────────────
  // Database Health Dashboard — shows primary DB stats, replica lag,
  // backup info, and vault DB status. All queries are read-only and
  // run against the primary or replica as appropriate.
  server.get('/database/status', async (_request) => {
    // ── Primary DB stats ──────────────────────────────────────────
    interface DbStat {
      server_version: string;
      active_connections: bigint;
      max_connections: bigint;
      database_size: string;
      cache_hit_ratio: number;
      uptime_seconds: bigint;
      xact_total: bigint;
      xact_commit: bigint;
      xact_rollback: bigint;
      deadlocks: bigint;
      temp_files: bigint;
      temp_bytes: string;
    }

    let primary: DbStat | null = null;
    let primaryError: string | null = null;

    try {
      const result = await prisma.$queryRawUnsafe<DbStat[]>(`
        SELECT
          version() AS server_version,
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') AS active_connections,
          (SELECT setting::bigint FROM pg_settings WHERE name = 'max_connections') AS max_connections,
          pg_size_pretty(pg_database_size(current_database())) AS database_size,
          (
            SELECT round(
              (1 - (blks_read::numeric / NULLIF(COALESCE(blks_hit, 0) + COALESCE(blks_read, 0), 0))) * 100,
              2
            )
            FROM pg_stat_database
            WHERE datname = current_database()
          ) AS cache_hit_ratio,
          extract(epoch FROM now() - pg_postmaster_start_time())::bigint AS uptime_seconds,
          (SELECT xact_commit + xact_rollback FROM pg_stat_database WHERE datname = current_database()) AS xact_total,
          (SELECT xact_commit FROM pg_stat_database WHERE datname = current_database()) AS xact_commit,
          (SELECT xact_rollback FROM pg_stat_database WHERE datname = current_database()) AS xact_rollback,
          (SELECT deadlocks FROM pg_stat_database WHERE datname = current_database()) AS deadlocks,
          (SELECT temp_files FROM pg_stat_database WHERE datname = current_database()) AS temp_files,
          pg_size_pretty((SELECT COALESCE(temp_bytes, 0) FROM pg_stat_database WHERE datname = current_database())) AS temp_bytes
        FROM pg_stat_bgwriter
        LIMIT 1
      `);
      primary = result[0] ?? null;
    } catch (err) {
      primaryError = err instanceof Error ? err.message : 'Unknown error querying primary DB';
    }

    // ── Replica lag ───────────────────────────────────────────────
    let replica: {
      connected: boolean;
      lag_bytes: bigint | null;
      lag_seconds: number | null;
      error: string | null;
    } | null = null;

    try {
      const replicaPrisma = getReplicaPrisma();
      const result = await replicaPrisma.$queryRawUnsafe<
        {
          application_name: string;
          state: string;
          write_lag: number | null;
          flush_lag: number | null;
          replay_lag: number | null;
        }[]
      >(`
        SELECT
          application_name,
          state,
          write_lag,
          flush_lag,
          replay_lag
        FROM pg_stat_replication
        LIMIT 5
      `);

      const wal = result[0];
      if (wal) {
        // Use the largest lag value in seconds, or null
        const lagSeconds = Math.max(wal.write_lag ?? 0, wal.flush_lag ?? 0, wal.replay_lag ?? 0);
        replica = {
          connected: wal.state === 'streaming',
          lag_bytes: null, // not directly available from pg_stat_replication
          lag_seconds: lagSeconds > 0 ? lagSeconds : null,
          error: null,
        };
      } else {
        // No replicas configured — this is normal for a single-instance setup
        replica = { connected: false, lag_bytes: null, lag_seconds: null, error: null };
      }
    } catch (err) {
      replica = {
        connected: false,
        lag_bytes: null,
        lag_seconds: null,
        error: err instanceof Error ? err.message : 'Unknown replica error',
      };
    }

    // ── Backup info ───────────────────────────────────────────────
    // Read from R2 if possible, otherwise report unknown
    let backup: {
      latest_key: string | null;
      latest_age_hours: number | null;
      total_count: number;
      total_size_formatted: string;
    } | null = null;

    try {
      // First try to read from the backup metadata if we have an S3 client
      const r2 = new S3Client({
        region: 'auto',
        endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID ?? ''}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? '',
          secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? '',
        },
      });

      const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME ?? 'kanchuki-backups';

      // TODO: MaxKeys=100 will under-report count/size if 100+ backup files exist.
      // Increase or implement pagination once the project has many backups.
      const listResult = await r2.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: 'backups/',
          MaxKeys: 100,
        }),
      );

      const objects = (listResult.Contents ?? [])
        .filter((obj) => obj.Key?.endsWith('.sql.gz'))
        .sort((a, b) => {
          const aTime = a.LastModified?.getTime() ?? 0;
          const bTime = b.LastModified?.getTime() ?? 0;
          return bTime - aTime;
        });

      const totalSizeBytes = objects.reduce((sum, obj) => sum + (obj.Size ?? 0), 0);
      const latestBackup = objects[0] ?? null;

      backup = {
        latest_key: latestBackup?.Key?.split('/').pop()?.replace('.sql.gz', '') ?? null,
        latest_age_hours: latestBackup?.LastModified
          ? (Date.now() - latestBackup.LastModified.getTime()) / (1000 * 60 * 60)
          : null,
        total_count: objects.length,
        total_size_formatted:
          totalSizeBytes > 0
            ? totalSizeBytes >= 1073741824
              ? `${(totalSizeBytes / 1073741824).toFixed(1)} GB`
              : `${(totalSizeBytes / 1048576).toFixed(0)} MB`
            : '0 MB',
      };
    } catch {
      // R2 not configured or unavailable — report backup status as unknown
      backup = null;
    }

    // ── Vault DB status ───────────────────────────────────────────
    let vaultStatus: { connected: boolean; record_count: number } = {
      connected: false,
      record_count: 0,
    };

    try {
      const vault = await getVaultPrisma();
      if (vault) {
        const count = await vault.deletedRecord.count();
        vaultStatus = { connected: true, record_count: count };
      }
    } catch {
      vaultStatus = { connected: false, record_count: 0 };
    }

    // ── Guardrail migration status ────────────────────────────────
    let guardrailsActive = false;
    try {
      const result = await prisma.$queryRawUnsafe<
        { trigger_name: string; event_manipulation: string; event_object_table: string }[]
      >(`
        SELECT trigger_name, event_manipulation, event_object_table
        FROM information_schema.triggers
        WHERE trigger_name = 'prevent_hard_delete'
        LIMIT 1
      `);
      guardrailsActive = result.length > 0;
    } catch {
      guardrailsActive = false;
    }

    return {
      data: {
        primary: primary
          ? {
              server_version: primary.server_version.split(' ')[0] ?? primary.server_version,
              active_connections: Number(primary.active_connections),
              max_connections: Number(primary.max_connections),
              connection_usage_pct: Math.round(
                (Number(primary.active_connections) / Number(primary.max_connections)) * 100,
              ),
              database_size: primary.database_size,
              cache_hit_ratio: Number(primary.cache_hit_ratio),
              uptime_seconds: Number(primary.uptime_seconds),
              transactions: {
                committed: Number(primary.xact_commit),
                rolled_back: Number(primary.xact_rollback),
                total: Number(primary.xact_total),
              },
              deadlocks: Number(primary.deadlocks),
              temp_files: Number(primary.temp_files),
              temp_bytes: primary.temp_bytes,
              healthy: Number(primary.active_connections) < Number(primary.max_connections) * 0.8,
            }
          : { error: primaryError },
        replica,
        backup,
        vault: vaultStatus,
        guardrails: {
          active: guardrailsActive,
        },
      },
    };
  });
};
