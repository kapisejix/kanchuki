import {
  cleanupProductPhoto,
  fetchImageBuffer,
  reserveAiCredits,
  tagProductImageUrls,
  uploadBuffer,
} from '@kanchuki/ai';
import { type Prisma, prisma } from '@kanchuki/db';
import { recordAiUsage } from '../lib/ai-usage.js';
import { resolveCategoryId } from '../lib/default-categories.js';
import { preserveOriginalPhoto } from '../lib/photo-cleanup.js';
import { checkQuota, incrementUsage } from '../lib/quota.js';
import { withUniqueSku } from '../lib/sku.js';
import { addEmbeddingJob } from './index.js';
import type { TaggingJobData } from './index.js';

export async function handleTagProduct(data: TaggingJobData): Promise<void> {
  const { product_id, retailer_id, photo_url, r2_key, auto_cleanup = true } = data;

  try {
    // F-010: weighted quota gate — reserves the most expensive currently-
    // healthy provider's credits so the retailer can always afford whichever
    // provider actually serves (failover never incurs an unaffordable cost).
    // Falls through as a no-op until plan_limits has a row for AI_TAGGING_CALL.
    await checkQuota(retailer_id, 'AI_TAGGING_CALL', await reserveAiCredits());

    // Mark photo as tagging in progress
    await prisma.productPhoto.updateMany({
      where: { product_id, retailer_id },
      data: { ai_tagged: false },
    });

    // Tag from the original, untouched photo FIRST. Background removal below
    // overwrites this same r2_key/photo_url with a bg-stripped version, and
    // general-purpose bg removal can over-strip a busy/patterned garment shot
    // down to a near-blank cutout — feeding that into Claude Vision produced
    // null category/color/occasions instead of a bad-but-present garment photo.
    // onProviderUsed: weighted quota increment + per-call attribution log.
    const tags = await tagProductImageUrls([photo_url], {
      onProviderUsed: recordAiUsage(retailer_id),
    });

    // Auto catalog photo cleanup (PRO-REQUIREMENTS.md): overwrite the raw
    // retailer upload in place with a background-stripped, white-backdrop
    // version. Same r2_key/photo_url, so no DB write needed. Best-effort —
    // ponytail: swallow failures, a raw-but-tagged photo beats a failed job.
    // Retailer-toggleable via auto_cleanup (product/add.tsx) for shots that
    // shouldn't be cropped/bg-stripped (e.g. styled mannequin display).
    if (auto_cleanup) {
      try {
        await checkQuota(retailer_id, 'BG_REMOVAL');
        // F-011: use the retailer's picked background instead of white, if set.
        const withBg = await prisma.product.findUnique({
          where: { id: product_id },
          include: { background_image: true },
        });
        const bgUrl = withBg?.background_image?.is_active
          ? withBg.background_image.image_url
          : undefined;
        const raw = await fetchImageBuffer(photo_url);
        const photoRow = await prisma.productPhoto.findFirst({
          where: { product_id, retailer_id, r2_key },
          select: { id: true, metadata: true },
        });
        if (photoRow) {
          await preserveOriginalPhoto(photoRow.id, r2_key, photoRow.metadata, raw);
        }
        const cleaned = await cleanupProductPhoto(raw, bgUrl);
        await uploadBuffer(r2_key, cleaned, 'image/jpeg');
        await incrementUsage(retailer_id, 'BG_REMOVAL');
      } catch (err) {
        console.error(`Photo cleanup failed for product ${product_id}, keeping raw photo:`, err);
      }
    }

    // Only fill name/sku/description/subtype when still unset — never
    // clobber a retailer's manual edit on a later re-tag/retry.
    const current = await prisma.product.findUnique({
      where: { id: product_id },
      select: {
        name: true,
        sku: true,
        description: true,
        subtype: true,
        category_id: true,
      },
    });

    // F-024: auto-assign the merchandising category. Same never-clobber rule
    // as the name fields — only set category_id when the retailer hasn't
    // already picked one. resolveCategoryId matches the AI's free-text
    // category against the retailer's own ProductCategory list (seeded
    // defaults + custom rows), so the storefront "Shop By Categories" grid
    // fills itself. No match → null, manual assignment as today.
    const matchedCategoryId =
      current?.category_id == null
        ? await resolveCategoryId(retailer_id, tags.category)
        : current.category_id;

    const writeProductTags = (sku?: string) =>
      prisma.product.update({
        where: { id: product_id },
        data: {
          ai_tagged: true,
          ai_tag_error: null,
          category: tags.category,
          category_id: matchedCategoryId,
          product_type: tags.product_type,
          primary_color: tags.primary_color,
          secondary_colors: tags.secondary_colors,
          fabric_estimate: tags.fabric_estimate,
          fabrics: tags.fabrics,
          styles: tags.style,
          pattern: tags.pattern,
          embellishments: tags.embellishments,
          neck_style: tags.neck_style,
          sleeve_type: tags.sleeve_type,
          occasions: tags.occasions,
          search_tags: tags.search_tags,
          ...(current?.subtype == null ? { subtype: tags.subtype } : {}),
          ...(current?.name == null ? { name: tags.product_name } : {}),
          ...(current?.description == null ? { description: tags.short_description } : {}),
          ...(sku ? { sku } : {}),
          ...(tags.design_number_visible
            ? {
                metadata: {
                  design_number: tags.design_number_visible,
                  is_catalog_image: tags.is_catalog_image,
                },
              }
            : {}),
        },
      });

    if (current?.sku == null) {
      await withUniqueSku(retailer_id, tags.subtype ?? tags.category, writeProductTags);
    } else {
      await writeProductTags();
    }

    await prisma.productPhoto.updateMany({
      where: { product_id, is_primary: true },
      data: {
        ai_tagged: true,
        ai_raw_response: tags as unknown as Prisma.InputJsonValue,
      },
    });

    // Queue embedding generation now that we have tags
    // If this fails, the error propagates to the outer catch which sets
    // ai_tagged: false + ai_tag_error, giving the user visible feedback
    // in the product detail screen. BullMQ retries with exponential backoff.
    await addEmbeddingJob({ product_id, retailer_id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // ponytail: this write can itself fail on a transient DB error (e.g. pooler
    // hiccup) — don't let that mask the real failure reason from BullMQ/logs.
    try {
      await prisma.product.update({
        where: { id: product_id },
        data: { ai_tagged: false, ai_tag_error: message.slice(0, 500) },
      });
    } catch (persistErr) {
      console.error(`Failed to persist ai_tag_error for product ${product_id}:`, persistErr);
    }
    throw err; // re-throw so BullMQ records the failure and retries
  }
}
