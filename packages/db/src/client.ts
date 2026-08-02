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
 * Falls back to the primary client if REPLICA is not configured.
 *
 * SECURITY §13: All admin SQL queries run against this replica,
 * never against the primary write database.
 */
export function getReplicaPrisma(): PrismaClient {
  const replicaUrl = process.env['DATABASE_URL_REPLICA']
  if (!replicaUrl) {
    // B-002: No replica configured — falling back to primary.
    // Admin queries will run against the production write database.
    // Set DATABASE_URL_REPLICA to a read replica or standby to fix this.
    console.warn(
      '[db] DATABASE_URL_REPLICA is not set — admin queries are running against the PRIMARY database. ' +
      'This adds unnecessary load and violates the security isolation intended by SECURITY §13. ' +
      'Provision a read replica and set DATABASE_URL_REPLICA to fix this.',
    )
    return prisma
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
 * role, and `kanchuki_migrator` must stay human-only — so the 30-day purge cron
 * (apps/api/src/jobs/purge-soft-deleted.ts) is the ONLY consumer of this client.
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
