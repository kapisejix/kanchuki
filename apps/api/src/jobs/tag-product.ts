import { prisma, Prisma } from '@kanchuki/db'
import { tagProductImageUrls, fetchImageBuffer, uploadBuffer, cleanupProductPhoto } from '@kanchuki/ai'
import { addEmbeddingJob } from './index.js'
import type { TaggingJobData } from './index.js'

export async function handleTagProduct(data: TaggingJobData): Promise<void> {
  const { product_id, retailer_id, photo_url, back_photo_url, r2_key } = data

  try {
    // Mark photo as tagging in progress
    await prisma.productPhoto.updateMany({
      where: { product_id, retailer_id },
      data: { ai_tagged: false },
    })

    // Auto catalog photo cleanup (PRO-REQUIREMENTS.md): overwrite the raw
    // retailer upload in place with a background-stripped, white-backdrop
    // version. Same r2_key/photo_url, so no DB write needed. Best-effort —
    // ponytail: swallow failures, a raw-but-tagged photo beats a failed job.
    try {
      const raw = await fetchImageBuffer(photo_url)
      const cleaned = await cleanupProductPhoto(raw)
      await uploadBuffer(r2_key, cleaned, 'image/jpeg')
    } catch (err) {
      console.error(`Photo cleanup failed for product ${product_id}, keeping raw photo:`, err)
    }

    const urls = back_photo_url ? [photo_url, back_photo_url] : [photo_url]
    const tags = await tagProductImageUrls(urls)

    // Update product with AI tags
    await prisma.product.update({
      where: { id: product_id },
      data: {
        ai_tagged: true,
        ai_tag_error: null,
        category: tags.category,
        product_type: tags.product_type,
        primary_color: tags.primary_color,
        secondary_colors: tags.secondary_colors,
        fabric_estimate: tags.fabric_estimate,
        pattern: tags.pattern,
        embellishments: tags.embellishments,
        neck_style: tags.neck_style,
        sleeve_type: tags.sleeve_type,
        occasions: tags.occasions,
        search_tags: tags.search_tags,
        ...(tags.design_number_visible
          ? {
              metadata: {
                design_number: tags.design_number_visible,
                is_catalog_image: tags.is_catalog_image,
              },
            }
          : {}),
      },
    })

    await prisma.productPhoto.updateMany({
      where: { product_id, is_primary: true },
      data: {
        ai_tagged: true,
        ai_raw_response: tags as unknown as Prisma.InputJsonValue,
      },
    })

    // Queue embedding generation now that we have tags
    // If this fails, the error propagates to the outer catch which sets
    // ai_tagged: false + ai_tag_error, giving the user visible feedback
    // in the product detail screen. BullMQ retries with exponential backoff.
    await addEmbeddingJob({ product_id, retailer_id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await prisma.product.update({
      where: { id: product_id },
      data: { ai_tagged: false, ai_tag_error: message.slice(0, 500) },
    })
    throw err // re-throw so BullMQ records the failure and retries
  }
}
