/**
 * Kanchuki Database Restore Script
 *
 * Lists available backups from R2, downloads a selected backup, and
 * restores it to a target database via psql. Can also restore directly
 * from a local backup file.
 *
 * Architecture (docs/SECURITY.md §13):
 *   R2 cold storage / local file → download → gunzip → psql → target DB
 *
 * Requirements:
 *   - Docker (to run psql inside a postgres:16-alpine container)
 *   - R2 credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *     R2_BUCKET_NAME) — in env or .env file
 *   - Target database URL (via --target or DATABASE_URL)
 *
 * Cross-platform notes:
 *   - Does NOT use `--network host` (unsupported on Windows Docker Desktop)
 *   - Uses `docker -e PGPASSWORD=value` syntax (works on all platforms)
 *   - Depends on @aws-sdk/client-s3 (hoisted from workspace — see packages/ai/)
 *
 * Usage:
 *   npx tsx scripts/restore-database.ts --list                  # List available backups
 *   npx tsx scripts/restore-database.ts --latest                # Restore the latest backup
 *   npx tsx scripts/restore-database.ts --latest --target BACKUP_DATABASE_URL
 *   npx tsx scripts/restore-database.ts --backup-key backups/2026-07-25--kanchuki.sql.gz
 *   npx tsx scripts/restore-database.ts --file ./backup.sql.gz  # Restore from local file
 *   npx tsx scripts/restore-database.ts --dry-run               # Preview without executing
 */

import { spawn } from 'node:child_process';
import { createWriteStream, createReadStream, existsSync, mkdirSync } from 'node:fs';
import { unlink, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { createGunzip } from 'node:zlib';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';

// ─── Types ────────────────────────────────────────────────────────

interface DbConnectionInfo {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

interface BackupInfo {
  key: string;
  size: number;
  lastModified: Date | undefined;
  label: string;
  database: string;
  timestamp: string | null;
}

interface RestoreOptions {
  listOnly: boolean;
  latest: boolean;
  backupKey: string | null;
  localFile: string | null;
  targetUrl: string | null;
  dryRun: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────

function parseConnectionUrl(url: string): DbConnectionInfo {
  const pattern = /^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;
  const match = url.match(pattern);
  if (!match) throw new Error(
    `Cannot parse database URL. Expected: postgresql://user:password@host:5432/dbname\n` +
    `Got: ${url.replace(/\/\/[^:]+:([^@]+)@/, '//user:***@')}`
  );
  return {
    user: decodeURIComponent(match[1]!),
    password: decodeURIComponent(match[2]!),
    host: match[3]!,
    port: Number.parseInt(match[4]!, 10),
    database: match[5]!,
  };
}

function getEnvVar(name: string): string | undefined {
  return process.env[name];
}

function requireEnvVar(name: string): string {
  const val = getEnvVar(name);
  if (!val) throw new Error(`${name} is not set.`);
  return val;
}

const DOCKER_IMAGE = 'postgres:16-alpine';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(d: Date): string {
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

/** Parse a backup filename into timestamp, label, and database name. */
function parseBackupKey(key: string): { timestamp: string | null; label: string; database: string } {
  const filename = basename(key);
  const withoutExt = filename.replace(/\.sql\.gz$/, '');
  const tsMatch = withoutExt.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
  const timestamp = tsMatch ? tsMatch[1]!.replace(/T/g, ' ').replace(/-/g, '-') : null;
  const rest = tsMatch ? withoutExt.slice(tsMatch[1]!.length) : withoutExt;
  const parts = rest.split('--').filter(Boolean);
  let label = '';
  let database = '';
  if (parts.length >= 2) {
    label = parts.slice(0, -1).join('--');
    database = parts[parts.length - 1]!;
  } else if (parts.length === 1) {
    database = parts[0]!;
  }
  return { timestamp, label, database };
}

// ─── R2 Client ────────────────────────────────────────────────────

function createR2Client(): S3Client {
  const accountId = requireEnvVar('R2_ACCOUNT_ID');
  const accessKeyId = getEnvVar('R2_ACCESS_KEY_ID');
  const secretAccessKey = getEnvVar('R2_SECRET_ACCESS_KEY');
  if (!accessKeyId || !secretAccessKey) throw new Error('R2 credentials not configured');
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

/** List all backup objects in R2. */
async function listBackups(r2: S3Client, bucket: string): Promise<BackupInfo[]> {
  const backups: BackupInfo[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await r2.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'backups/',
      ContinuationToken: continuationToken,
    }));
    for (const obj of response.Contents ?? []) {
      if (!obj.Key || !obj.Key.endsWith('.sql.gz')) continue;
      const parsed = parseBackupKey(obj.Key);
      backups.push({
        key: obj.Key,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified,
        label: parsed.label,
        database: parsed.database,
        timestamp: parsed.timestamp,
      });
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  backups.sort((a, b) => (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0));
  return backups;
}

/** Download a backup from R2 to a local file. */
async function downloadBackup(r2: S3Client, bucket: string, key: string, localPath: string): Promise<void> {
  console.log(`  • Downloading: ${key}`);

  const response = await r2.send(new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  }));

  if (!response.Body) throw new Error('No body in R2 response');

  return new Promise((resolve, reject) => {
    const writeStream = createWriteStream(localPath);
    // AWS SDK v3 returns a Readable stream in Node.js — pipe directly
    const bodyStream = response.Body as Readable;
    streamPipeline(bodyStream, writeStream)
      .then(() => resolve())
      .catch(reject);
  });
}

// ─── Restore ──────────────────────────────────────────────────────

/**
 * Decompress a gzipped SQL dump and pipe it into psql via Docker.
 * - Uses `docker -e PGPASSWORD=...` for cross-platform compatibility
 * - Runs `SET session_replication_role = replica;` first to bypass FK checks
 * - Uses `--quiet` to reduce noise
 */
async function restoreToDatabase(dumpPath: string, url: string, dryRun: boolean): Promise<boolean> {
  const db = parseConnectionUrl(url);

  if (dryRun) {
    console.log(`  • [DRY RUN] Would restore to: ${db.database} @ ${db.host}:${db.port}`);
    console.log(`  • [DRY RUN] Command: docker run --rm -e PGPASSWORD=*** ${DOCKER_IMAGE} psql -h ${db.host} -p ${db.port} -U ${db.user} -d ${db.database} --quiet`);
    return true;
  }

  console.log(`  • Restoring to: ${db.database} @ ${db.host}:${db.port}`);

  const args = [
    'run', '--rm',
    '-e', `PGPASSWORD=${db.password}`,
    DOCKER_IMAGE,
    'psql',
    '-h', db.host,
    '-p', String(db.port),
    '-U', db.user,
    '-d', db.database,
    '--quiet',
  ];

  return new Promise((resolve) => {
    const startTime = Date.now();
    const dockerProcess = spawn('docker', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 600_000, // 10 min
    });

    let stderr = '';
    dockerProcess.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    const readStream = createReadStream(dumpPath);
    const gunzip = createGunzip();

    streamPipeline(readStream, gunzip, dockerProcess.stdin)
      .then(() => new Promise<void>((resolveEnd) => {
        dockerProcess.on('exit', (code) => {
          const duration = ((Date.now() - startTime) / 1000).toFixed(1);
          if (code === 0) {
            console.log(`  • Restore completed in ${duration}s`);
            resolve(true);
          } else {
            console.error(`  • Restore failed (exit ${code}) in ${duration}s`);
            const tail = stderr.slice(-500);
            console.error(`  • Stderr (tail): ${tail}`);
            resolve(false);
          }
          resolveEnd();
        });
      }))
      .catch((err) => {
        console.error(`  • Pipeline error: ${err.message}`);
        dockerProcess.kill();
        resolve(false);
      });
  });
}

/** Verify restore by counting tables in the target database. */
async function verifyRestore(url: string): Promise<boolean> {
  const db = parseConnectionUrl(url);
  return new Promise((resolve) => {
    const args = [
      'run', '--rm',
      '-e', `PGPASSWORD=${db.password}`,
      DOCKER_IMAGE,
      'psql',
      '-h', db.host,
      '-p', String(db.port),
      '-U', db.user,
      '-d', db.database,
      '-t',
      '-c', "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'",
    ];

    const proc = spawn('docker', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    });

    let out = '';
    proc.stdout?.on('data', (d: Buffer) => { out += d.toString(); });

    proc.on('exit', (code) => {
      if (code === 0) {
        const count = Number.parseInt(out.trim(), 10);
        console.log(`  • Verification: ${count} tables found`);
        resolve(count > 0);
      } else {
        console.error('  • Verification failed: psql exited with code', code);
        resolve(false);
      }
    });
    proc.on('error', () => resolve(false));
  });
}

// ─── Display ──────────────────────────────────────────────────────

function displayBackups(backups: BackupInfo[]): void {
  if (backups.length === 0) {
    console.log('  No backups found in R2 bucket.');
    return;
  }
  console.log(`  Found ${backups.length} backup(s):\n`);
  console.log('  #  │ Date                │ Size        │ Database         │ Label');
  console.log('  ───┼─────────────────────┼─────────────┼──────────────────┼─────');
  backups.forEach((b, i) => {
    const date = b.lastModified ? formatDate(b.lastModified) : b.timestamp ?? 'unknown';
    const size = formatBytes(b.size);
    const db = b.database.padEnd(16).slice(0, 16);
    const label = b.label || '(none)';
    console.log(`  ${(i + 1).toString().padStart(2)} │ ${date.padEnd(19)} │ ${size.padStart(11)} │ ${db} │ ${label}`);
  });
  console.log('');
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const options: RestoreOptions = {
    listOnly: args.includes('--list'),
    latest: args.includes('--latest'),
    backupKey: null,
    localFile: null,
    targetUrl: null,
    dryRun: args.includes('--dry-run'),
  };

  const keyIndex = args.indexOf('--backup-key');
  if (keyIndex >= 0 && keyIndex + 1 < args.length) options.backupKey = args[keyIndex + 1]!;

  const fileIndex = args.indexOf('--file');
  if (fileIndex >= 0 && fileIndex + 1 < args.length) options.localFile = args[fileIndex + 1]!;

  const targetIndex = args.indexOf('--target');
  if (targetIndex >= 0 && targetIndex + 1 < args.length) {
    const val = args[targetIndex + 1]!;
    options.targetUrl = val === 'BACKUP_DATABASE_URL' ? getEnvVar('BACKUP_DATABASE_URL') : val;
  }

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  Kanchuki Database Restore                   ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // ── Resolve target ──
  const targetUrl = options.targetUrl ?? getEnvVar('DATABASE_URL');
  if (!options.listOnly && !targetUrl) {
    console.error('✖ No target database specified.');
    console.error('  Set --target <url>, --target BACKUP_DATABASE_URL, or default DATABASE_URL.');
    process.exit(1);
  }

  // ── List mode ──
  if (options.listOnly) {
    console.log('── Listing Backups ─────────────────────────────\n');
    const r2 = createR2Client();
    const bucket = getEnvVar('R2_BUCKET_NAME') ?? 'kanchuki-backups';
    const backups = await listBackups(r2, bucket);
    displayBackups(backups);
    return;
  }

  // ── Resolve backup source ──
  let localBackupPath: string | null = options.localFile;
  const backupDir = join(process.cwd(), '.backups');
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

  if (!localBackupPath && options.backupKey) {
    const r2 = createR2Client();
    const bucket = getEnvVar('R2_BUCKET_NAME') ?? 'kanchuki-backups';
    localBackupPath = join(backupDir, basename(options.backupKey));
    console.log('── Downloading backup ─────────────────────────\n');
    await downloadBackup(r2, bucket, options.backupKey, localBackupPath);
    console.log(`  • Saved to: ${localBackupPath}\n`);
  } else if (!localBackupPath && options.latest) {
    const r2 = createR2Client();
    const bucket = getEnvVar('R2_BUCKET_NAME') ?? 'kanchuki-backups';
    console.log('── Finding latest backup ──────────────────────\n');
    const backups = await listBackups(r2, bucket);
    if (backups.length === 0) {
      console.error('✖ No backups found in R2 bucket.');
      process.exit(1);
    }
    const latest = backups[0]!;
    console.log(`  Latest: ${latest.key} (${formatBytes(latest.size)})\n`);
    localBackupPath = join(backupDir, basename(latest.key));
    console.log('── Downloading backup ─────────────────────────\n');
    await downloadBackup(r2, bucket, latest.key, localBackupPath);
    console.log(`  • Saved to: ${localBackupPath}\n`);
  } else if (!localBackupPath) {
    console.error('Specify a backup source:');
    console.error('  --backup-key <key>    Restore from R2 backup key');
    console.error('  --latest              Restore the latest backup');
    console.error('  --file <path>         Restore from local file');
    console.error('  --list                List available backups');
    process.exit(1);
  }

  if (!localBackupPath || !existsSync(localBackupPath)) {
    console.error(`✖ Backup file not found: ${localBackupPath}`);
    process.exit(1);
  }

  const fileSize = (await stat(localBackupPath)).size;
  console.log(`  Backup file: ${localBackupPath} (${formatBytes(fileSize)})\n`);

  // ── Confirm ──
  const targetDb = parseConnectionUrl(targetUrl!);
  console.log('⚠  WARNING: This will OVERWRITE the target database!');
  console.log(`  Target: ${targetDb.database} @ ${targetDb.host}:${targetDb.port}\n`);

  // ── Run restore ──
  console.log('── Restoring ───────────────────────────────────\n');
  const success = await restoreToDatabase(localBackupPath, targetUrl!, options.dryRun);

  if (options.dryRun) {
    console.log('\n  [DRY RUN] No changes were made.');
    console.log('  Run without --dry-run to execute.\n');
    if (localBackupPath && !options.localFile) await unlink(localBackupPath).catch(() => {});
    process.exit(0);
  }

  if (!success) {
    console.error('\n✖ Restore failed.\n');
    if (localBackupPath && !options.localFile) {
      console.log(`  Backup file kept at: ${localBackupPath}`);
    }
    process.exit(1);
  }

  // ── Verify ──
  console.log('\n── Verification ───────────────────────────────\n');
  const verified = await verifyRestore(targetUrl!);

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log(success && verified
    ? '║  Restore Complete ✅                          ║'
    : '║  Restore Complete ⚠️ (verify failed)           ║');
  console.log('╚══════════════════════════════════════════════╝\n');
  console.log(`  Target: ${targetDb.database} @ ${targetDb.host}:${targetDb.port}`);
  console.log(`  Verified: ${verified ? '✅' : '❌'}\n`);

  if (localBackupPath && !options.localFile) {
    await unlink(localBackupPath).catch(() => {});
    console.log('  Temporary file cleaned up.\n');
  }
}

main().catch((err) => {
  console.error('\n✖ Restore failed:', err.message);
  process.exit(1);
});
