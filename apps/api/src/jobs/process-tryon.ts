import { prisma } from '@kanchuki/db'
import { triggerTryOn, saveTryOnResultToR2, deleteObject, uploadBuffer, tryonResultR2Key, publicUrl } from '@kanchuki/ai'

export interface TryOnJobData {
  try_on_job_id: string
  retailer_id: string
  product_id: string
  customer_photo_r2_key: string  // R2 key or URL for remote flow
  measurement_id?: string | null
  is_remote?: boolean  // If true, customer_photo_r2_key is a URL, not an R2 key
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

    // For remote flow: customer_photo_r2_key may be a base64 data URL.
    // CatVTON's Python requests.get() can't fetch data: URLs, so upload to R2 first.
    // For in-store flow: it's an R2 key that needs to be converted to a public URL.
    let customerPhotoUrl: string
    if (is_remote) {
      if (customer_photo_r2_key.startsWith('data:')) {
        // Decode base64 data URL → upload to R2 → use R2 public URL
        const matches = customer_photo_r2_key.match(/^data:image\/(\w+);base64,(.+)$/)
        if (!matches) {
          throw new Error('Invalid customer photo: expected data:image/*;base64,...')
        }
        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1]
        const b64 = matches[2]!
        const buffer = Buffer.from(b64, 'base64')
        const r2Key = tryonResultR2Key(try_on_job_id).replace('result', 'customer-input')
        await uploadBuffer(r2Key, buffer, `image/${ext}`)
        customerPhotoUrl = publicUrl(r2Key)
      } else {
        // Already a regular HTTP(S) URL
        customerPhotoUrl = customer_photo_r2_key
      }
    } else {
      customerPhotoUrl = publicUrl(customer_photo_r2_key)
    }

    // Mark as processing
    await prisma.tryOnJob.update({
      where: { id: try_on_job_id },
      data: {
        status: 'PROCESSING',
        started_at: new Date(),
      },
    })

    // Trigger CatVTON try-on engine
    const triggerResult = await triggerTryOn({
      customerPhotoUrl,
      productPhotoUrl,
    })

    // Update with job ID
    await prisma.tryOnJob.update({
      where: { id: try_on_job_id },
      data: { api_job_id: triggerResult.jobId },
    })

    // CatVTON is synchronous — result already available from triggerTryOn
    const finalResult = triggerResult

    if (finalResult.status === 'completed' && finalResult.outputUrls.length > 0) {
      // Save result to R2
      const resultPublicUrl = await saveTryOnResultToR2(
        try_on_job_id,
        finalResult.outputUrls[0]!,
      )

      // Calculate cost per try-on (CatVTON: ~$0.005 on L4 GPU)
      const costUsd = 0.005

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

      // Log usage for billing/quotas
      await prisma.tryOnUsageLog.create({
        data: {
          retailer_id,
          try_on_job_id,
          product_id,
          cost_usd: costUsd,
          source: is_remote ? 'REMOTE' : 'IN_STORE',
          completed_at: new Date(),
        },
      }).catch(() => {
        // Non-critical — usage logging is informational, not required
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
