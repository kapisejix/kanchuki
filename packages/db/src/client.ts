import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  replicaPrisma: PrismaClient | undefined
  purgePrisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  })

if (process.env['NODE_ENV'] !== 'production') globalForPrisma.prisma = prisma

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
      datasources: { db: { url: replicaUrl } },
      log: process.env['NODE_ENV'] === 'development' ? ['error', 'warn'] : ['error'],
    })
  }

  return globalForPrisma.replicaPrisma
}

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma
}

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
      datasources: { db: { url: purgeUrl } },
      log: process.env['NODE_ENV'] === 'development' ? ['error', 'warn'] : ['error'],
    })
  }

  return globalForPrisma.purgePrisma
}
