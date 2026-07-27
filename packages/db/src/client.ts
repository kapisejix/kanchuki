import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  replicaPrisma: PrismaClient | undefined
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
