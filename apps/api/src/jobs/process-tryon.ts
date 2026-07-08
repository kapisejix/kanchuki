import { prisma } from '@kanchuki/db'
import { triggerTryOn, pollTryOn, saveTryOnResultToR2, deleteObject, tryonResultR2Key, publicUrl } from '@kanchuki/ai'

export interface TryOnJobData {
  try_on_job_id: string
  retailer_id: string
  product_id: string
  customer_photo_r2_key: string  // R2 key or URL for remote flow
  measurement_id?: string | null
  is_remote?: boolean  // If true, customer_photo_r2_key is a URL, not an R2 key
}

const POLL_INTERVAL_MS = 2000
const MAX_POLL_ATTEMPTS = 30  // 60 seconds max wait

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function handleProcessTryOn(data: TryOnJobData): Promise<void> {
  const { try_on_job_id, retailer_id, product_id, customer_photo_r2_key, is_remote } = data

  try {
    // Get product photo URL
    const product = await prisma.product.findFirst({
      where: { id: product_id, retailer_id, deleted_at: null },
      select: {
        photos: {
          where: { is_primary: true },
          take: 1,
          select: { url: true },
        },
      },
    })
    if (!product || !product.photos[0]?.url) {
      throw new Error('Product not found or has no photo')
    }

    const productPhotoUrl = product.photos[0].url

    // For remote flow, customer_photo_r2_key is already a URL
    // For in-store flow, it's an R2 key that needs to be converted to a URL
    const customerPhotoUrl = is_remote
      ? customer_photo_r2_key
      : publicUrl(customer_photo_r2_key)

    // Mark as processing
    await prisma.tryOnJob.update({
      where: { id: try_on_job_id },
      data: {
        status: 'PROCESSING',
        started_at: new Date(),
      },
    })

    // Trigger FASHN API
    const triggerResult = await triggerTryOn({
      customerPhotoUrl,
      productPhotoUrl,
    })

    // Update with FASHN job ID
    await prisma.tryOnJob.update({
      where: { id: try_on_job_id },
      data: { api_job_id: triggerResult.jobId },
    })

    // Poll for completion
    let finalResult = triggerResult
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await delay(POLL_INTERVAL_MS)
      finalResult = await pollTryOn(triggerResult.jobId)

      if (finalResult.status === 'completed' || finalResult.status === 'failed') break
    }

    if (finalResult.status === 'completed' && finalResult.outputUrls.length > 0) {
      // Save result to R2
      const resultPublicUrl = await saveTryOnResultToR2(
        triggerResult.jobId,
        finalResult.outputUrls[0]!,
        try_on_job_id,
      )

      // Calculate cost (fast mode = 1 credit = $0.075)
      const costUsd = 0.075

      // Update job as completed
      await prisma.tryOnJob.update({
        where: { id: try_on_job_id },
        data: {
          status: 'COMPLETED',
          result_url: resultPublicUrl,
          result_r2_key: tryonResultR2Key(try_on_job_id),
          api_cost_usd: costUsd,
          completed_at: new Date(),
          result_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
          customer_photo_deleted_at: new Date(),
        },
      })

      // Delete customer photo from R2 (privacy)
      // Only for in-store flow where it's an R2 key
      if (!is_remote) {
        await deleteObject(customer_photo_r2_key).catch(() => {
          // Non-critical — photo removal isn't required for correctness
        })
      }
    } else {
      // Failed or timed out
      const errorMsg = finalResult.errorMessage ?? 'Try-on processing failed or timed out'
      await prisma.tryOnJob.update({
        where: { id: try_on_job_id },
        data: {
          status: 'FAILED',
          error_message: errorMsg,
          completed_at: new Date(),
        },
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await prisma.tryOnJob.update({
      where: { id: try_on_job_id },
      data: {
        status: 'FAILED',
        error_message: message.slice(0, 500),
        completed_at: new Date(),
      },
    })
    throw err // re-throw for BullMQ retry
  }
}
