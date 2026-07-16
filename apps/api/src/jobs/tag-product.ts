import { prisma, Prisma } from '@kanchuki/db'
import { tagProductImageUrls, fetchImageBuffer, uploadBuffer, cleanupProductPhoto } from '@kanchuki/ai'
import { addEmbeddingJob } from './index.js'
import type { TaggingJobData } from './index.js'
import { checkQuota, incrementUsage } from '../lib/quota.js'

export async function handleTagProduct(data: TaggingJobData): Promise<void> {
  const { product_id, retailer_id, photo_url, r2_key, auto_cleanup = true } = data

  try {
    // F-010: no prior enforcement existed for AI tagging calls — this is the
    // first gate. Falls through as a no-op until plan_limits has a row for
    // AI_TAGGING_CALL. Errors here flow into the same catch below (ai_tag_error
    // + BullMQ retry) as any other failure in this job.
    await checkQuota(retailer_id, 'AI_TAGGING_CALL')

    // Mark photo as tagging in progress
    await prisma.productPhoto.updateMany({
      where: { product_id, retailer_id },
      data: { ai_tagged: false },
    })

    // Tag from the original, untouched photo FIRST. Background removal below
    // overwrites this same r2_key/photo_url with a bg-stripped version, and
    // general-purpose bg removal can over-strip a busy/patterned garment shot
    // down to a near-blank cutout — feeding that into Claude Vision produced
    // null category/color/occasions instead of a bad-but-present garment photo.
    const tags = await tagProductImageUrls([photo_url])
    await incrementUsage(retailer_id, 'AI_TAGGING_CALL')

    // Auto catalog photo cleanup (PRO-REQUIREMENTS.md): overwrite the raw
    // retailer upload in place with a background-stripped, white-backdrop
    // version. Same r2_key/photo_url, so no DB write needed. Best-effort —
    // ponytail: swallow failures, a raw-but-tagged photo beats a failed job.
    // Retailer-toggleable via auto_cleanup (product/add.tsx) for shots that
    // shouldn't be cropped/bg-stripped (e.g. styled mannequin display).
    if (auto_cleanup) {
      try {
        await checkQuota(retailer_id, 'BG_REMOVAL')
        const raw = await fetchImageBuffer(photo_url)
        const cleaned = await cleanupProductPhoto(raw)
        await uploadBuffer(r2_key, cleaned, 'image/jpeg')
        await incrementUsage(retailer_id, 'BG_REMOVAL')
      } catch (err) {
        console.error(`Photo cleanup failed for product ${product_id}, keeping raw photo:`, err)
      }
    }

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
