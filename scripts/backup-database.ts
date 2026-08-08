/**
 * Kanchuki Database Backup Script
 *
 * Creates a compressed pg_dump (plain SQL format) of the primary database,
 * uploads it to Cloudflare R2 for cold storage, and optionally restores it
 * to the backup/replica database for warm-standby readiness.
 *
 * Architecture (docs/SECURITY.md §13):
 *   Primary DB (Supabase) → pg_dump (plain SQL) + gzip → R2 cold storage
 *                                                       → Backup DB (warm standby via psql)
 *
 * Requirements:
 *   - Docker (to run pg_dump inside a postgres:16-alpine container)
 *   - R2 credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *     R2_BUCKET_NAME) — in env or .env file
 *   - DATABASE_URL pointing to the primary database
 *   - BACKUP_DATABASE_URL (optional) for warm-standby restore
 *
 * Cross-platform notes:
 *   - Does NOT use `--network host` (unsupported on Windows Docker Desktop)
 *   - Cloud databases (Supabase/Railway) are internet-reachable without it
 *   - Uses `docker -e ENV_VAR=value` syntax (works on all platforms)
 *   - Depends on @aws-sdk/client-s3 (hoisted from workspace — see packages/ai/)
 *
 * Usage:
 *   npx tsx scripts/backup-database.ts                          # Full: R2 + backup DB
 *   npx tsx scripts/backup-database.ts --r2-only                # R2 only, skip backup DB
 *   npx tsx scripts/backup-database.ts --db-only                # Backup DB only, skip R2
 *   npx tsx scripts/backup-database.ts --local-only             # Save locally, no cloud/DB
 *   npx tsx scripts/backup-database.ts --label "pre-migration"  # Custom label
 *   npx tsx scripts/backup-database.ts --env-file .env.prod     # Custom env file
 */

import { spawn } from 'node:child_process';
import { createWriteStream, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { createGzip, createGunzip } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// ─── Types ────────────────────────────────────────────────────────

interface DbConnectionInfo {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

interface BackupMetadata {
  timestamp: string;
  label: string;
  source_database: string;
  source_host: string;
  compressed_size_bytes: number;
  checksum: string;
  r2_key: string | null;
  backup_db_restore_attempted: boolean;
  backup_db_restore_succeeded: boolean;
  duration_seconds: number;
  docker_image: string;
  pg_dump_version: string | null;
  table_count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────

/** Parse a PostgreSQL connection URL into its components. */
function parseConnectionUrl(url: string): DbConnectionInfo {
  // postgresql://user:password@host:port/dbname
  const pattern = /^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;
  const match = url.match(pattern);
  if (!match) throw new Error(
    `Cannot parse DATABASE_URL. Expected format: postgresql://user:password@host:5432/dbname\n` +
    `Got: ${url.replace(/\/\/[^:]+:([^@]+)@/, '//user:***@')} (password masked)`
  );
  return {
    user: decodeURIComponent(match[1]!),
    password: decodeURIComponent(match[2]!),
    host: match[3]!,
    port: Number.parseInt(match[4]!, 10),
    // Strip any query string / fragment (e.g. Supabase pooler URLs end with
    // "/dbname?pgbouncer=true") — the query params are NOT part of the
    // database name, and leaving them in breaks both the pg_dump -d argument
    // and the backup filename ('?' is illegal in Windows filenames).
    database: match[5]!.split(/[?#]/)[0]!,
  };
}

function getEnvVar(name: string): string | undefined {
  return process.env[name];
}

function requireEnvVar(name: string): string {
  const val = getEnvVar(name);
  if (!val) throw new Error(
    `${name} is not set. Set it in your environment or .env file.\n` +
    `Example: ${name}="postgresql://user:password@host:5432/dbname"`
  );
  return val;
}

/** Generate a timestamped R2 key for the backup. */
function generateBackupKey(database: string, label: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').replace(/\.\d+Z$/, '');
  const labelPart = label ? `--${label.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
  // .sql.gz — plain SQL format compressed with gzip
  return `backups/${ts}${labelPart}--${database}.sql.gz`;
}

/** Calculate SHA-256 checksum of a file. */
async function calculateChecksum(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// ─── Docker Helpers ────────────────────────────────────────────────

const DOCKER_IMAGE = 'postgres:17-alpine';

/** Check Docker is running. */
async function ensureDockerRunning(): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', ['info'], {
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 15_000,
    });
    proc.on('error', () => reject(new Error(
      'Docker is not available. Install Docker Desktop from https://www.docker.com/products/docker-desktop/'
    )));
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(
        'Docker is installed but not running. Start Docker Desktop and try again.'
      ));
    });
  });
}

/** Build docker run args for a psql/pg_dump command targeting a specific DB. */
function dockerRunArgs(
  db: DbConnectionInfo,
  tool: string,
  extraArgs: string[],
): string[] {
  return [
    'run', '--rm',
    '-e', `PGPASSWORD=${db.password}`,
    DOCKER_IMAGE,
    tool,
    '-h', db.host,
    '-p', String(db.port),
    '-U', db.user,
    '-d', db.database,
    ...extraArgs,
  ];
}

/**
 * Get pg_dump version for metadata.
 */
async function getPgDumpVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn('docker', ['run', '--rm', DOCKER_IMAGE, 'pg_dump', '--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15_000,
    });
    let output = '';
    proc.stdout?.on('data', (d: Buffer) => { output += d.toString(); });
    proc.on('exit', () => resolve(output.trim() || null));
    proc.on('error', () => resolve(null));
  });
}

// ─── pg_dump via Docker ───────────────────────────────────────────

/**
 * Run pg_dump (plain SQL format) via Docker, compressing to gzip on-the-fly.
 * Plain SQL + gzip is cross-platform compatible and can be restored with psql.
 */
async function runPgDump(
  db: DbConnectionInfo,
  outputPath: string,
): Promise<void> {
  console.log(`  • Database: ${db.database} @ ${db.host}:${db.port}`);
  console.log(`  • Output: ${outputPath}`);

  const outDir = outputPath.substring(0, outputPath.lastIndexOf('/'));
  if (outDir && !existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  // pg_dump plain SQL format — compress with gzip for smaller storage
  // --schema=public: Kanchuki data lives entirely in the public schema. The
  // app role can't LOCK Supabase's auth/storage/realtime schemas, and dumping
  // them would fail with permission denied (and they're Supabase-managed).
  const args = dockerRunArgs(db, 'pg_dump', [
    '--no-owner',
    '--no-acl',
    '--no-comments',
    '--no-publications',
    '--no-subscriptions',
    '--format=plain',
    '--schema=public',
  ]);

  console.log(`  • Command: docker ${args.slice(0, 4).join(' ')} ... pg_dump --format=plain ...`);

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const dockerProcess = spawn('docker', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300_000, // 5 min
    });

    // Collect stderr continuously — a one-shot .read() after exit misses
    // chunks (it hid the pg_dump version-mismatch error behind an empty
    // string and a bare exit 1).
    let stderrBuf = '';
    dockerProcess.stderr?.on('data', (d: Buffer) => {
      stderrBuf += d.toString();
    });

    const writeStream = createWriteStream(outputPath);
    const gzip = createGzip({ level: 9 });

    pipeline(dockerProcess.stdout, gzip, writeStream)
      .then(() => {
        const exitCode = dockerProcess.exitCode ?? 0;
        if (exitCode !== 0) {
          reject(new Error(`pg_dump exited with code ${exitCode}\nStderr: ${stderrBuf.slice(0, 800)}`));
          return;
        }
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  • Dump completed in ${duration}s`);
        resolve();
      })
      .catch(reject);

    dockerProcess.on('error', reject);
  });
}

// ─── R2 Upload ────────────────────────────────────────────────────

function createR2Client(): S3Client {
  const accountId = requireEnvVar('R2_ACCOUNT_ID');
  const accessKeyId = getEnvVar('R2_ACCESS_KEY_ID');
  const secretAccessKey = getEnvVar('R2_SECRET_ACCESS_KEY');

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      'R2 credentials not configured. Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.\n' +
      'These can be managed via Admin → Integrations (F-012) or set directly in .env.'
    );
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function uploadToR2(
  r2: S3Client,
  bucket: string,
  key: string,
  filePath: string,
  checksum: string,
  label: string,
): Promise<void> {
  console.log(`  • Uploading to R2: ${key}`);

  const fileBuffer = readFileSync(filePath);

  await r2.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileBuffer,
    ContentType: 'application/gzip',
    Metadata: {
      'backup-timestamp': new Date().toISOString(),
      'backup-label': label || 'unscheduled',
      'backup-checksum': checksum,
      'backup-source': 'kanchuki-backup-script',
    },
  }));

  console.log(`  • Uploaded ${formatBytes(fileBuffer.length)} to R2`);
}

// ─── Restore to Backup DB ─────────────────────────────────────────

/**
 * Restore the gzipped SQL dump to the backup database via:
 *   gunzip → psql (inside Docker)
 *
 * Uses PGPASSWORD via docker -e flag (cross-platform safe).
 */
async function restoreToBackupDb(dumpPath: string, url: string): Promise<boolean> {
  const db = parseConnectionUrl(url);
  console.log(`  • Restoring to backup DB: ${db.database} @ ${db.host}:${db.port}`);

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
      timeout: 600_000, // 10 min for large restores
    });

    let stderr = '';
    dockerProcess.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    // Read gzipped dump → gunzip → pipe to psql
    const readStream = createReadStream(dumpPath);
    const gunzip = createGunzip();

    pipeline(readStream, gunzip, dockerProcess.stdin)
      .then(() => new Promise<void>((resolvePipe) => {
        dockerProcess.on('exit', (code) => {
          const duration = ((Date.now() - startTime) / 1000).toFixed(1);
          if (code === 0) {
            console.log(`  • Backup DB restore completed in ${duration}s`);
            resolve(true);
          } else {
            console.error(`  • Backup DB restore failed (exit ${code}) in ${duration}s`);
            const shortErr = stderr.slice(-300); // tail
            console.error(`  • Stderr (tail): ${shortErr}`);
            resolve(false);
          }
          resolvePipe();
        });
      }))
      .catch((err) => {
        console.error(`  • Pipeline error: ${err.message}`);
        resolve(false);
      });
  });
}

// ─── Table Count ─────────────────────────────────────────────────

async function countTables(db: DbConnectionInfo): Promise<number> {
  try {
    const args = dockerRunArgs(db, 'psql', [
      '-t',
      '-c', "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'",
    ]);

    return new Promise((resolve) => {
      const proc = spawn('docker', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
      });
      let out = '';
      proc.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
      proc.on('exit', () => {
        resolve(Number.parseInt(out.trim(), 10) || 0);
      });
      proc.on('error', () => resolve(-1));
    });
  } catch {
    return -1;
  }
}

// ─── Main ─────────────────────────────────────────────────────────

interface BackupOptions {
  r2Only: boolean;
  dbOnly: boolean;
  localOnly: boolean;
  label: string;
}

async function main() {
  const args = process.argv.slice(2);
  const options: BackupOptions = {
    r2Only: args.includes('--r2-only'),
    dbOnly: args.includes('--db-only'),
    localOnly: args.includes('--local-only'),
    label: '',
  };

  const labelIndex = args.indexOf('--label');
  if (labelIndex >= 0 && labelIndex + 1 < args.length) {
    options.label = args[labelIndex + 1]!;
  }

  const startTime = Date.now();
  const metadata: Partial<BackupMetadata> = {
    timestamp: new Date().toISOString(),
    label: options.label || 'unscheduled',
    docker_image: DOCKER_IMAGE,
    backup_db_restore_attempted: false,
    backup_db_restore_succeeded: false,
    r2_key: null,
    pg_dump_version: null,
    table_count: 0,
  };

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  Kanchuki Database Backup                    ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log(`  Label:   ${options.label || '(unscheduled)'}`);
  console.log(`  Mode:    ${options.localOnly ? 'Local only' : options.r2Only ? 'R2 only' : options.dbOnly ? 'Backup DB only' : 'Full (R2 + backup DB)'}`);
  console.log('');

  // ── Validate prerequisites ──
  await ensureDockerRunning();
  const primaryUrl = requireEnvVar('DATABASE_URL');
  const primaryDb = parseConnectionUrl(primaryUrl);
  metadata.source_database = primaryDb.database;
  metadata.source_host = primaryDb.host;
  metadata.pg_dump_version = await getPgDumpVersion();

  const backupDbUrl = getEnvVar('BACKUP_DATABASE_URL');
  const bucketName = getEnvVar('R2_BUCKET_NAME') ?? 'kanchuki-backups';
  const backupDir = join(process.cwd(), '.backups');
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

  const backupKey = generateBackupKey(primaryDb.database, options.label);
  const localPath = join(backupDir, basename(backupKey));
  metadata.r2_key = backupKey;

  // ── Step 1: pg_dump + compress ──
  console.log('── Step 1: pg_dump + gzip ──────────────────────');
  await runPgDump(primaryDb, localPath);

  const fileStats = await stat(localPath);
  metadata.compressed_size_bytes = fileStats.size;
  console.log(`  • Compressed: ${formatBytes(fileStats.size)}\n`);

  // ── Step 2: Checksum ──
  console.log('── Step 2: Checksum ────────────────────────────');
  metadata.checksum = await calculateChecksum(localPath);
  console.log(`  • SHA-256: ${metadata.checksum}\n`);

  // ── Step 3a: Upload to R2 ──
  if (!options.dbOnly && !options.localOnly) {
    console.log('── Step 3a: Upload to R2 ───────────────────────');
    try {
      const r2 = createR2Client();
      await uploadToR2(r2, bucketName, backupKey, localPath, metadata.checksum, options.label);
    } catch (err: unknown) {
      const error = err as Error;
      console.error(`\n⚠ R2 upload failed: ${error.message}`);
      console.error('  Backup file is still available locally at:', localPath);
    }
    console.log('');
  } else {
    console.log('── Step 3a: R2 upload ─── (skipped)\n');
  }

  // ── Step 3b: Restore to backup DB ──
  if (!options.r2Only && !options.localOnly && backupDbUrl) {
    console.log('── Step 3b: Restore to Backup DB ───────────────');
    metadata.backup_db_restore_attempted = true;
    try {
      metadata.backup_db_restore_succeeded = await restoreToBackupDb(localPath, backupDbUrl);
    } catch (err: unknown) {
      const error = err as Error;
      console.error(`\n⚠ Backup DB restore failed: ${error.message}`);
      metadata.backup_db_restore_succeeded = false;
    }
    console.log('');
  } else {
    console.log('── Step 3b: Backup DB restore ─── (skipped)\n');
    if (!backupDbUrl && !options.r2Only && !options.localOnly) {
      console.log('  (BACKUP_DATABASE_URL not set — skipping)\n');
    }
  }

  // ── Step 4: Metadata ──
  metadata.duration_seconds = (Date.now() - startTime) / 1000;
  metadata.table_count = await countTables(primaryDb);

  const metadataPath = localPath.replace('.sql.gz', '.meta.json');
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`  • Metadata saved: ${metadataPath}\n`);

  // ── Cleanup ──
  if (!options.localOnly && metadata.r2_key) {
    try { await unlink(localPath); } catch { /* non-fatal */ }
  }

  // ── Summary ──
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  Backup Complete                            ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Duration:     ${metadata.duration_seconds.toFixed(1)}s`);
  console.log(`  File:         ${localPath}`);
  console.log(`  Size:         ${formatBytes(metadata.compressed_size_bytes)}`);
  console.log(`  Checksum:     ${metadata.checksum.slice(0, 16)}...`);
  console.log(`  R2 Key:       ${metadata.r2_key}`);
  console.log(`  Tables:       ${metadata.table_count}`);
  if (metadata.backup_db_restore_attempted) {
    console.log(`  Backup DB:    ${metadata.backup_db_restore_succeeded ? '✅ Restored' : '❌ Failed'}`);
  }
  if (!options.localOnly) console.log('  Local file:   cleaned up (saved in R2)');
  else console.log(`  Local file:   ${localPath}`);
  console.log('');
}

main().catch((err) => {
  console.error('\n✖ Backup failed:', err.message);
  process.exit(1);
});
