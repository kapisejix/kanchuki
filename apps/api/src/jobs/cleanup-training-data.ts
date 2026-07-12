import { prisma } from '@kanchuki/db'
import { deleteObject } from '@kanchuki/ai'

/**
 * Cleanup job for consented training-data (F-102d).
 *
 * Runs daily (via BullMQ repeatable job) and deletes:
 * 1. R2 objects under training-data/ prefix older than RETENTION_DAYS
 * 2. Corresponding TrainingPhotoConsent DB rows
 *
 * This prevents unbounded data accumulation in the training-data/ R2 prefix,
 * which is deliberately NOT covered by the 24h tryon-results cleanup cron.
 * See docs/SECURITY.md §3b and docs/PRO-REQUIREMENTS.md F-102d.
 */
const RETENTION_DAYS = 180

export async function handleCleanupTrainingData(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

  console.log(`[cleanup-training-data] Querying rows consented_at < ${cutoff.toISOString()}...`)

  // Fetch expired consent rows — batch size avoids loading everything into memory
  const BATCH_SIZE = 50
  let totalDeleted = 0
  let cursor: string | undefined

  while (true) {
    const expiredRows = await prisma.trainingPhotoConsent.findMany({
      where: { consented_at: { lt: cutoff } },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: BATCH_SIZE,
      orderBy: [{ consented_at: 'asc' }, { id: 'asc' }],
    })

    if (expiredRows.length === 0) break

    for (const row of expiredRows) {
      // Delete each R2 object — all operations are best-effort so a single
      // object failure doesn't prevent cleanup of the rest.
      const keysToDelete = [
        row.customer_photo_r2_key,
        row.garment_photo_r2_key,
        ...(row.result_r2_key ? [row.result_r2_key] : []),
      ]

      for (const key of keysToDelete) {
        try {
          await deleteObject(key)
        } catch (err) {
          console.error(
            `[cleanup-training-data] Failed to delete R2 object ${key} ` +
              `for consent row ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }

      // Delete the DB row
      try {
        await prisma.trainingPhotoConsent.delete({ where: { id: row.id } })
        totalDeleted++
      } catch (err) {
        console.error(
          `[cleanup-training-data] Failed to delete consent row ${row.id}: ` +
            `${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }

    // Advance cursor for next batch
    const last = expiredRows[expiredRows.length - 1]
    cursor = last?.id
  }

  console.log(`[cleanup-training-data] Complete: ${totalDeleted} expired consent rows cleaned up`)
}
