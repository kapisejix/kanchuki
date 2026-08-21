import { createHash, randomBytes } from 'node:crypto';
import {
  DUPLICATE_HAMMING_THRESHOLD,
  detectCropAndTag,
  fetchImageBuffer,
  getUploadPresignedUrl,
  hammingDistance,
  publicUrl,
  reserveAiCredits,
} from '@kanchuki/ai';
import { prisma, withRetry } from '@kanchuki/db';
import { PLAN_LIMITS, SIZE_OPTIONS } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addTaggingJob } from '../jobs/index.js';
import { recordAiUsage } from '../lib/ai-usage.js';
import { checkQuota, incrementUsage } from '../lib/quota.js';
import { createSkuSequencer } from '../lib/sku.js';
import { notFound, planLimitExceeded, validationError } from '../plugins/error-handler.js';

// ─── Types ────────────────────────────────────────────────────────

interface DetectedItemResponse {
  description: string;
  cropped_url: string;
  cropped_r2_key: string;
  page_number?: number;
  phash: string;
  is_duplicate: boolean;
  duplicate_of_product_id: string | null;
  tags: {
    category: string | null;
    subtype: string | null;
    product_name: string | null;
    short_description: string | null;
    primary_color: string | null;
    secondary_colors: string[];
    fabric_estimate: string | null;
    pattern: string | null;
    embellishments: string[];
    neck_style: string | null;
    sleeve_type: string | null;
    style: string[];
    fabrics: string[];
    price_range_estimate: string | null;
    design_number_visible: string | null;
    is_catalog_image: boolean;
    search_tags: string[];
  };
}

// ─── Schemas ──────────────────────────────────────────────────────

const DetectItemsSchema = z.object({
  image_url: z.string().url(),
});

const ImportPdfSchema = z.object({
  pdf_url: z.string().url(),
  max_pages: z.number().int().min(1).max(50).optional().default(10),
  page_images: z.array(z.string().url()).max(50).optional(),
});

const BulkCreateProductsSchema = z.object({
  // F-001d: applied to every item that doesn't set its own section_id below —
  // "enter rack/shelf once per photo, not once per item"
  default_section_id: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        cropped_r2_key: z.string().min(1),
        cropped_url: z.string().url(),
        category: z.string().nullable().optional(),
        subtype: z.string().nullable().optional(),
        product_name: z.string().nullable().optional(),
        short_description: z.string().nullable().optional(),
        primary_color: z.string().nullable().optional(),
        fabric_estimate: z.string().nullable().optional(),
        pattern: z.string().nullable().optional(),
        styles: z.array(z.string().max(100)).max(10).optional(),
        fabrics: z.array(z.string().max(100)).max(10).optional(),
        search_tags: z.array(z.string()).optional(),
        sizes: z.array(z.enum(SIZE_OPTIONS)).optional(),
        price_min: z.number().int().nullable().optional(),
        price_max: z.number().int().nullable().optional(),
        section_id: z.string().nullable().optional(),
        phash: z.string().nullable().optional(),
      }),
    )
    .min(1)
    .max(100),
});

const UploadUrlSchema = z.object({
  filename: z.string().min(1),
  content_type: z.string().min(1),
  size_bytes: z.number().int().positive(),
});

// ─── Helpers ──────────────────────────────────────────────────────

function randHex(length: number): string {
  return randomBytes(length).toString('hex');
}

// F-001d: flags a crop as a likely duplicate of something already in the
// retailer's catalog (same rack shot twice, or already present via a
// supplier PDF import). Non-blocking — caller still lets the retailer save.
async function flagDuplicates(
  retailerId: string,
  items: Array<{ phash: string }>,
): Promise<Array<{ is_duplicate: boolean; duplicate_of_product_id: string | null }>> {
  if (items.length === 0) return [];

  const existing = await prisma.productPhoto.findMany({
    where: { retailer_id: retailerId, phash: { not: null } },
    select: { phash: true, product_id: true },
  });

  return items.map((item) => {
    let best: { product_id: string; distance: number } | null = null;
    for (const photo of existing) {
      const photoPhash = photo.phash;
      if (!photoPhash) continue;
      const distance = hammingDistance(item.phash, photoPhash);
      if (!best || distance < best.distance) best = { product_id: photo.product_id, distance };
    }
    const isDuplicate = best !== null && best.distance <= DUPLICATE_HAMMING_THRESHOLD;
    return {
      is_duplicate: isDuplicate,
      duplicate_of_product_id: isDuplicate ? (best?.product_id ?? null) : null,
    };
  });
}

// ─── Plugin ───────────────────────────────────────────────────────

export const catalogImportRoutes: FastifyPluginAsync = async (server) => {
  // ═══════════════════════════════════════════════════════════════
  //  POST /catalog-import/upload-url
  // ═══════════════════════════════════════════════════════════════

  server.post('/catalog-import/upload-url', async (request, reply) => {
    const retailerId = request.retailerId;

    const parsed = UploadUrlSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? 'Invalid');

    const { content_type, size_bytes } = parsed.data;

    const isPdf = content_type === 'application/pdf';
    const maxSize = isPdf ? 50 * 1024 * 1024 : 15 * 1024 * 1024;
    if (size_bytes > maxSize) {
      return reply.status(413).send({
        error: 'FILE_TOO_LARGE',
        message: `Maximum file size is ${isPdf ? '50MB' : '15MB'}`,
      });
    }

    const prefix = isPdf ? 'catalog-pdf' : 'catalog-source';
    const ext = isPdf ? '.pdf' : '.jpg';
    const r2Key = `${prefix}/${retailerId}/${randHex(16)}${ext}`;
    let upload_url: string;
    try {
      upload_url = await getUploadPresignedUrl(r2Key, content_type);
    } catch (err) {
      console.error('R2 presigned URL generation failed:', err);
      throw validationError(
        'Photo storage is not configured. Please contact support to enable catalog imports.',
      );
    }
    const public_url = publicUrl(r2Key);

    return reply.status(200).send({
      data: { upload_url, r2_key: r2Key, public_url, expires_in: 3600 },
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  POST /catalog-import/detect-items
  //  F-001c: Multi-item detection from a single photo
  // ═══════════════════════════════════════════════════════════════

  server.post('/catalog-import/detect-items', async (request, reply) => {
    const retailerId = request.retailerId;

    const parsed = DetectItemsSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? 'Invalid');

    const { image_url } = parsed.data;

    // F-010: gate before spending Vision API + crop cost; detectCropAndTag can
    // return several items from one photo, so the exact count isn't known
    // until after it runs — per-call weighted credits are recorded by the
    // onProviderUsed callback below.
    await checkQuota(retailerId, 'IMAGE_CROP');
    await checkQuota(retailerId, 'AI_TAGGING_CALL', await reserveAiCredits());

    try {
      const items = await detectCropAndTag(image_url, retailerId, {
        onProviderUsed: recordAiUsage(retailerId),
        beforeCall: async () => checkQuota(retailerId, 'AI_TAGGING_CALL', await reserveAiCredits()),
      });
      incrementUsage(retailerId, 'IMAGE_CROP', items.length).catch((err) => {
        request.log.error({ err, retailer_id: retailerId }, 'Failed to record crop usage');
      });
      const dupes = await flagDuplicates(retailerId, items);

      const response: DetectedItemResponse[] = items.map((item, i) => ({
        description: item.description,
        cropped_url: item.croppedUrl,
        cropped_r2_key: item.r2Key,
        phash: item.phash,
        is_duplicate: dupes[i]?.is_duplicate ?? false,
        duplicate_of_product_id: dupes[i]?.duplicate_of_product_id ?? null,
        tags: item.tags,
      }));

      return reply.status(200).send({
        data: {
          source_type: 'image' as const,
          total_items: response.length,
          items: response,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Detection failed';
      request.log.error({ err, image_url }, 'Multi-item detection failed');
      return reply.status(500).send({ error: 'DETECTION_FAILED', message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //  POST /catalog-import/import-pdf
  //  F-001b: PDF catalog import — dual-path client/server rendering
  // ═══════════════════════════════════════════════════════════════

  server.post('/catalog-import/import-pdf', async (request, reply) => {
    const retailerId = request.retailerId;

    const parsed = ImportPdfSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? 'Invalid');

    const { pdf_url, max_pages, page_images } = parsed.data;

    // F-010: gate once for the whole page batch (not per-page — one DB round
    // trip, not N). Exact item count is only known after detection finishes,
    // so increment by the real total below.
    if (page_images && page_images.length > 0) {
      await checkQuota(retailerId, 'IMAGE_CROP');
      await checkQuota(retailerId, 'AI_TAGGING_CALL', await reserveAiCredits());
    }

    try {
      // Path A: Client already rendered pages → detect on each
      if (page_images && page_images.length > 0) {
        const pageCount = Math.min(page_images.length, max_pages);
        const allItems: DetectedItemResponse[] = [];

        for (let i = 0; i < pageCount; i++) {
          try {
            const pageImg = page_images[i];
            if (!pageImg) continue;
            const items = await detectCropAndTag(pageImg, retailerId, {
              onProviderUsed: recordAiUsage(retailerId),
              beforeCall: async () =>
                checkQuota(retailerId, 'AI_TAGGING_CALL', await reserveAiCredits()),
            });
            for (const item of items) {
              allItems.push({
                description: `Page ${i + 1}: ${item.description}`,
                cropped_url: item.croppedUrl,
                cropped_r2_key: item.r2Key,
                page_number: i + 1,
                phash: item.phash,
                is_duplicate: false,
                duplicate_of_product_id: null,
                tags: item.tags,
              });
            }
          } catch (err) {
            request.log.warn({ err, pageNum: i + 1 }, 'Detection failed for PDF page');
          }
        }

        incrementUsage(retailerId, 'IMAGE_CROP', allItems.length).catch((err) => {
          request.log.error({ err, retailer_id: retailerId }, 'Failed to record crop usage');
        });

        const dupes = await flagDuplicates(retailerId, allItems);
        allItems.forEach((item, i) => {
          item.is_duplicate = dupes[i]?.is_duplicate ?? false;
          item.duplicate_of_product_id = dupes[i]?.duplicate_of_product_id ?? null;
        });

        return reply.status(200).send({
          data: {
            source_type: 'pdf' as const,
            total_items: allItems.length,
            total_pages: pageCount,
            items: allItems,
          },
        });
      }

      // Path B: Raw PDF — parse metadata only with pdfjs-dist
      let pageCount = 0;
      const pageDimensions: Array<{ width: number; height: number }> = [];

      try {
        const pdfjsLib = await import('pdfjs-dist');
        const pdfBuffer = await fetchImageBuffer(pdf_url);
        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(pdfBuffer),
        });
        const pdf = await loadingTask.promise;

        pageCount = Math.min(pdf.numPages, max_pages);

        for (let i = 1; i <= pageCount; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1 });
          pageDimensions.push({
            width: Math.round(viewport.width),
            height: Math.round(viewport.height),
          });
        }
      } catch (parseErr) {
        request.log.warn(
          { err: parseErr, pdf_url },
          'pdfjs-dist parse only — page rendering requires node-canvas',
        );
      }

      if (pageCount === 0) {
        return reply.status(400).send({
          error: 'PDF_PARSE_FAILED',
          message: 'Could not parse the PDF. Ensure it is a valid PDF file.',
        });
      }

      return reply.status(200).send({
        data: {
          source_type: 'pdf' as const,
          total_items: 0,
          total_pages: pageCount,
          page_dimensions: pageDimensions,
          items: [],
          render_required: true,
          render_note:
            'PDF pages need client-side rendering. Use your device PDF viewer ' +
            'to render each page as an image, then re-submit with page_images[] URLs.',
          render_url: '/v1/catalog-import/import-pdf',
          max_page_images: max_pages,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PDF import failed';
      request.log.error({ err, pdf_url }, 'PDF catalog import failed');
      return reply.status(500).send({ error: 'PDF_IMPORT_FAILED', message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //  POST /catalog-import/bulk-create-products
  //  Save reviewed-and-approved items as real products
  // ═══════════════════════════════════════════════════════════════

  server.post('/catalog-import/bulk-create-products', async (request, reply) => {
    const retailerId = request.retailerId;

    const parsed = BulkCreateProductsSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? 'Invalid');

    const { items, default_section_id } = parsed.data;

    // F-001d: resolve rack/shelf location + plan limits (retry on transient DB errors)
    const { validSectionIds, retailer } = await withRetry(async () => {
      const requestedSectionIds = [
        ...new Set(
          [default_section_id, ...items.map((i) => i.section_id)].filter((id): id is string => !!id),
        ),
      ];
      const validSectionIds = new Set(
        requestedSectionIds.length
          ? (
              await prisma.storeSection.findMany({
                where: { retailer_id: retailerId, id: { in: requestedSectionIds } },
                select: { id: true },
              })
            ).map((s) => s.id)
          : [],
      );

      const retailer = await prisma.retailer.findUnique({
        where: { id: retailerId },
        select: {
          plan: true,
          plan_status: true,
          _count: { select: { products: true } },
        },
      });

      if (!retailer) throw notFound('Retailer');

      return { validSectionIds, retailer };
    }, { label: 'catalog-import-validate' });

    const resolveSectionId = (itemSectionId: string | null | undefined): string | undefined => {
      const candidate = itemSectionId ?? default_section_id;
      return candidate && validSectionIds.has(candidate) ? candidate : undefined;
    };

    const limits = PLAN_LIMITS[retailer.plan as keyof typeof PLAN_LIMITS];
    if (limits) {
      const currentCount = retailer._count.products;
      if (limits.max_products !== null && currentCount + items.length > limits.max_products) {
        throw planLimitExceeded('products');
      }
    }
    // F-010: real quota gate — seed-plan-limits.ts seeds a PRODUCT_UPLOAD row
    // per plan. The PLAN_LIMITS check above stays authoritative for the exact
    // per-retailer number; this is what RetailerLimitOverride/addons hook into.
    await checkQuota(retailerId, 'PRODUCT_UPLOAD', items.length);

    // Create products in parallel, 10 at a time
    const created: Array<{ id: string; cropped_url: string }> = [];

    // Shares one count-per-prefix cache across the whole batch instead of a
    // DB round trip per item (and avoids intra-batch SKU collisions when
    // several items share a prefix, e.g. 5 kurtas in one import).
    const nextSku = createSkuSequencer(retailerId);

    const productData = await Promise.all(
      items.map(async (item) => ({
        retailer_id: retailerId,
        status: 'AVAILABLE' as const,
        category: item.category ?? undefined,
        subtype: item.subtype ?? undefined,
        name: item.product_name ?? undefined,
        description: item.short_description ?? undefined,
        sku: await nextSku(item.subtype ?? item.category),
        primary_color: item.primary_color ?? undefined,
        fabric_estimate: item.fabric_estimate ?? undefined,
        pattern: item.pattern ?? undefined,
        styles: item.styles ?? undefined,
        fabrics: item.fabrics ?? undefined,
        search_tags: item.search_tags ?? undefined,
        sizes: item.sizes ?? undefined,
        price_min: item.price_min ?? undefined,
        price_max: item.price_max ?? undefined,
        section_id: resolveSectionId(item.section_id),
        photos: {
          create: {
            retailer_id: retailerId,
            is_primary: true,
            r2_key: item.cropped_r2_key,
            url: item.cropped_url,
            phash: item.phash ?? undefined,
          },
        },
      })),
    );

    for (let i = 0; i < productData.length; i += 10) {
      const batch = productData.slice(i, i + 10);
      const products = await Promise.all(
        batch.map((data) =>
          prisma.product.create({
            data,
            select: { id: true, photos: { take: 1, select: { url: true, r2_key: true } } },
          }),
        ),
      );

      for (const product of products) {
        if (product.photos[0]) {
          addTaggingJob({
            product_id: product.id,
            retailer_id: retailerId,
            photo_url: product.photos[0].url,
            r2_key: product.photos[0].r2_key,
          }).catch((err: unknown) =>
            request.log.warn({ err, productId: product.id }, 'Failed to queue AI tagging'),
          );
        }
        created.push({
          id: product.id,
          cropped_url: product.photos[0]?.url ?? '',
        });
      }
    }

    incrementUsage(retailerId, 'PRODUCT_UPLOAD', created.length).catch((err) => {
      request.log.error({ err, retailer_id: retailerId }, 'Failed to record product-upload usage');
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: retailerId,
        action: 'create',
        resource_type: 'Product',
        resource_id: `bulk_import:${request.id}`,
        metadata: {
          total_requested: items.length,
          total_created: created.length,
          product_ids: created.map((c) => c.id),
        },
        ip_address: request.ip,
      },
    });

    return reply.status(201).send({
      data: {
        total_requested: items.length,
        total_created: created.length,
        products: created,
      },
    });
  });
};
