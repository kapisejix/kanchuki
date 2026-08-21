import { PrismaClient, Prisma } from '@prisma/client'

// ─── Connection pool settings ─────────────────────────────────────────────
// Appends pool parameters to the DATABASE_URL so Prisma's engine uses them.
// Defaults are conservative; override via env vars if Railway's Postgres needs
// different values (e.g. behind pgbouncer).
const POOL_CONFIG = {
  connection_limit: Number(process.env['DB_CONNECTION_LIMIT']) || 10,
  pool_timeout: Number(process.env['DB_POOL_TIMEOUT']) || 10000, // 10s
  connect_timeout: Number(process.env['DB_CONNECT_TIMEOUT']) || 10000, // 10s
}

function withPoolParams(url: string): string {
  const u = new URL(url)
  for (const [key, value] of Object.entries(POOL_CONFIG)) {
    // Only set if not already present in the URL
    if (!u.searchParams.has(key)) {
      u.searchParams.set(key, String(value))
    }
  }
  return u.toString()
}

// ─── Transient error classification ───────────────────────────────────────
// Errors that are safe to retry — the operation was not committed.
const TRANSIENT_ERROR_PATTERNS = [
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /EPIPE/i,
  /Connection.*terminat/i,
  /Connection.*closed/i,
  /Server.*closed.*connection/i,
  /Pool.*is.*full/i,
  /too.*many.*connections/i,
  /could not.*connect/i,
  /timeout.*expired/i,
  /connection.*refused/i,
  /the.*database.*system.*is.*starting.*up/i,
  /P1001/, // Prisma: Can't reach database server
  /P1002/, // Prisma: Database server closed the connection
  /P1008/, // Prisma: Operations timed out
  /P1017/, // Prisma: Server has closed the connection
  /P2024/, // Prisma: Timed out fetching a new connection from the pool
]

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  const code = (err as { code?: string } | null)?.code
  if (code && ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE'].includes(code)) return true
  return TRANSIENT_ERROR_PATTERNS.some((p) => p.test(msg))
}

// ─── Retry wrapper ────────────────────────────────────────────────────────
// Retries transient DB errors with exponential backoff. Non-transient errors
// (constraint violations, not-found, etc.) rethrow immediately.

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number
  /** Base delay in ms between retries. Default: 500 */
  baseDelayMs?: number
  /** Optional label for logging */
  label?: string
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 500, label = 'db-op' } = opts
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt >= maxAttempts || !isTransientError(err)) {
        throw err
      }
      const delay = baseDelayMs * 2 ** (attempt - 1)
      const detail = err instanceof Error ? err.message : String(err)
      console.warn(
        `[db] ${label} attempt ${attempt}/${maxAttempts} failed (${detail}), retrying in ${delay}ms…`,
      )
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastError
}

// ─── Health check ─────────────────────────────────────────────────────────
// Lightweight probe: runs `SELECT 1`. Returns { ok, latencyMs, error? }.
// Use in /health or readiness probes.

export async function dbHealthCheck(): Promise<{
  ok: boolean
  latencyMs: number
  error?: string
}> {
  const start = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return { ok: true, latencyMs: Date.now() - start }
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ─── Prisma client singletons ────────────────────────────────────────────

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  replicaPrisma: PrismaClient | undefined
  purgePrisma: PrismaClient | undefined
}

function buildPrimaryClient(): PrismaClient {
  const baseUrl = process.env['DATABASE_URL']
  if (!baseUrl) throw new Error('[db] DATABASE_URL is not set')
  return new PrismaClient({
    datasources: { db: { url: withPoolParams(baseUrl) } },
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? buildPrimaryClient()

if (process.env['NODE_ENV'] !== 'production') globalForPrisma.prisma = prisma

// ─── Graceful shutdown ────────────────────────────────────────────────────
// On SIGTERM/SIGINT (Railway sends SIGTERM on deploy/stop), disconnect all
// pools cleanly so in-flight queries can finish and connections are released.

function gracefulShutdown() {
  console.log('[db] Shutting down — disconnecting Prisma pool…')
  void prisma.$disconnect()
  if (globalForPrisma.replicaPrisma) void globalForPrisma.replicaPrisma.$disconnect()
  if (globalForPrisma.purgePrisma) void globalForPrisma.purgePrisma.$disconnect()
}

// Register once (idempotent — safe if client.ts is imported multiple times)
const shutdownKey = '__prisma_shutdown_registered'
if (!(globalThis as Record<string, unknown>)[shutdownKey]) {
  ;(globalThis as Record<string, unknown>)[shutdownKey] = true
  process.on('SIGTERM', gracefulShutdown)
  process.on('SIGINT', gracefulShutdown)
}

// ─── Read-replica client ─────────────────────────────────────────────────

/**
 * Read-replica Prisma client — connects to DATABASE_URL_REPLICA.
 * Used by the admin query console for read-only queries.
 * Throws if REPLICA is not configured — fails closed rather than
 * running admin ad-hoc queries against the primary write database.
 *
 * SECURITY §13: All admin SQL queries run against this replica,
 * never against the primary write database.
 */
export function getReplicaPrisma(): PrismaClient {
  const replicaUrl = process.env['DATABASE_URL_REPLICA']
  if (!replicaUrl) {
    throw new Error(
      '[db] DATABASE_URL_REPLICA is not set — refusing to run admin queries against the primary database. ' +
        'Provision a read replica and set DATABASE_URL_REPLICA to enable the admin query console.',
    )
  }

  if (!globalForPrisma.replicaPrisma) {
    globalForPrisma.replicaPrisma = new PrismaClient({
      datasources: { db: { url: withPoolParams(replicaUrl) } },
      log: process.env['NODE_ENV'] === 'development' ? ['error', 'warn'] : ['error'],
    })
  }

  return globalForPrisma.replicaPrisma
}

// ─── Purge-cron client ───────────────────────────────────────────────────

/**
 * Purge-cron Prisma client — connects to PURGE_DATABASE_URL (the narrowly
 * scoped `kanchuki_purge` role: SELECT/INSERT/UPDATE inherited from
 * `kanchuki_app`, plus DELETE on exactly the tables the purge cron hard-deletes
 * — no TRUNCATE, no DROP, no DDL).
 *
 * SECURITY §19: the main DATABASE_URL must keep the DELETE-less `kanchuki_app`
 * role, and `kanchuki_migrator` must stay human-only — so this client is only
 * for code paths that hard-delete on purpose: the 15-day purge cron
 * (apps/api/src/jobs/purge-soft-deleted.ts) and the retailer-initiated
 * "delete permanently" route (apps/api/src/routes/products.ts `/:id/purge`).
 *
 * Falls back to the primary client when PURGE_DATABASE_URL is unset (local dev
 * without the scoped role). In that case the cron still runs with whatever
 * privileges the dev DATABASE_URL has — which, once role separation is applied,
 * is no DELETE, so the purge would fail with permission denied.
 */
export function getPurgePrisma(): PrismaClient {
  const purgeUrl = process.env['PURGE_DATABASE_URL']
  if (!purgeUrl) {
    console.warn(
      '[db] PURGE_DATABASE_URL is not set — purge cron will run with the primary client. ' +
        'Under SECURITY §19 the primary role (kanchuki_app) has no DELETE, so the purge will ' +
        'fail with permission denied. Set PURGE_DATABASE_URL to a kanchuki_purge-scoped URL.',
    )
    return prisma
  }

  if (!globalForPrisma.purgePrisma) {
    globalForPrisma.purgePrisma = new PrismaClient({
      datasources: { db: { url: withPoolParams(purgeUrl) } },
      log: process.env['NODE_ENV'] === 'development' ? ['error', 'warn'] : ['error'],
    })
  }

  return globalForPrisma.purgePrisma
}
