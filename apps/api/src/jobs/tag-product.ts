import {
  fetchImageBuffer,
  reserveAiCredits,
  tagProductImageUrls,
  uploadBuffer,
} from '@kanchuki/ai';
import { type Prisma, prisma } from '@kanchuki/db';
import { classifyColorTone } from '@kanchuki/shared';
import { recordAiUsage } from '../lib/ai-usage.js';
import { pickContrastBackground } from '../lib/backgrounds.js';
import { resolveAttributeNames } from '../lib/default-attributes.js';
import { resolveCategoryId } from '../lib/default-categories.js';
import { bumpPhotoUrlVersion, preserveOriginalPhoto } from '../lib/photo-cleanup.js';
import { checkQuota, incrementUsage } from '../lib/quota.js';
import { withUniqueSku } from '../lib/sku.js';
import { maybeEnqueueProductSync } from './catalog-sync.js';
import { addEmbeddingJob } from './index.js';
import type { TaggingJobData } from './index.js';

export async function handleTagProduct(data: TaggingJobData): Promise<void> {
  const { product_id, retailer_id, photo_url } = data;

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
    // null category/color instead of a bad-but-present garment photo.
    // onProviderUsed: weighted quota increment + per-call attribution log.
    const tags = await tagProductImageUrls([photo_url], {
      onProviderUsed: recordAiUsage(retailer_id),
    });

    // Only fill name/sku/description/subtype/styles/fabrics when still unset
    // — never clobber a retailer's manual edit on a later re-tag/retry.
    const current = await prisma.product.findUnique({
      where: { id: product_id },
      select: {
        name: true,
        sku: true,
        description: true,
        subtype: true,
        category_id: true,
        styles: true,
        fabrics: true,
        search_tags: true,
      },
    });

    // F-024: auto-assign the merchandising category. Same never-clobber rule
    // as the name fields — only set category_id when the retailer hasn't
    // already picked one. resolveCategoryId matches the AI's free-text
    // category (+ subtype as a secondary needle) against the retailer's own
    // ProductCategory list (seeded defaults + custom rows) with
    // singular/plural-tolerant matching, so "Kurti" lands on the retailer's
    // "Kurtis" group and the storefront "Shop By Categories" grid fills
    // itself. No match → null, manual assignment as today.
    const matchedCategoryId =
      current?.category_id == null
        ? await resolveCategoryId(retailer_id, tags.category, tags.subtype)
        : current.category_id;

    // F-027: soft-match AI-detected Style/Fabric names against the
    // retailer's own ProductAttribute rows so the stored values are the
    // pickable canonical names (the mobile chips + storefront facets light
    // up). Same never-clobber rule as the name fields.
    const matchedStyles =
      current?.styles == null || current.styles.length === 0
        ? await resolveAttributeNames(retailer_id, 'STYLE', tags.style)
        : current.styles;
    const matchedFabrics =
      current?.fabrics == null || current.fabrics.length === 0
        ? await resolveAttributeNames(retailer_id, 'FABRIC', tags.fabrics)
        : current.fabrics;

    const mergedSearchTags = Array.from(
      new Set([
        'New Arrivals',
        ...(current?.search_tags ?? []),
        ...(tags.search_tags ?? []),
        ...(tags.category ? [tags.category] : []),
        ...(tags.subtype ? [tags.subtype] : []),
      ]),
    ).filter(Boolean);

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
          // Same never-clobber rule as the name fields — a retailer's manual
          // Style/Fabric picks (single-product edit or bulk review screen)
          // survive re-tags; AI fills them only when still empty, matched to
          // the retailer's own attribute list.
          ...(matchedStyles === current?.styles ? {} : { styles: matchedStyles }),
          ...(matchedFabrics === current?.fabrics ? {} : { fabrics: matchedFabrics }),
          pattern: tags.pattern,
          embellishments: tags.embellishments,
          neck_style: tags.neck_style,
          sleeve_type: tags.sleeve_type,
          search_tags: mergedSearchTags,
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

    // Phase II: WhatsApp catalog — the product is now fully formed (name,
    // price, category, tags), so push it to the retailer's Meta catalog.
    // Fire-and-forget + fail-open: the hook no-ops unless the retailer has
    // catalog sync enabled; a catalog hiccup must never fail tagging.
    maybeEnqueueProductSync(retailer_id, product_id).catch((err) => {
      console.error(`Failed to enqueue catalog sync after tagging product ${product_id}:`, err);
    });
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
