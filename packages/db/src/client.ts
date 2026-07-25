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
    // No replica configured — fall back to primary (with warning)
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
