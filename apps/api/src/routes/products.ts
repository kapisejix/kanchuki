import {
  cleanupProductPhoto,
  fetchImageBuffer,
  getDownloadPresignedUrl,
  getUploadPresignedUrl,
  publicUrl,
  uploadBuffer,
} from '@kanchuki/ai';
import { MATCH_SIMILARITY_THRESHOLD, MIN_CONFIDENCE_FOR_MATCHING, detectColor } from '@kanchuki/ai';
import { type Prisma, prisma } from '@kanchuki/db';
import { R2_PATHS } from '@kanchuki/shared';
import { createId } from '@paralleldrive/cuid2';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addEmbeddingJob, addSpinFrameJob, addTaggingJob } from '../jobs/index.js';
import { checkQuota, incrementUsage } from '../lib/quota.js';
import {
  forbidden,
  notFound,
  planLimitExceeded,
  validationError,
} from '../plugins/error-handler.js';

// ─── On-Demand ISR Revalidation ───────────────────────────────────
// After a product status change, purge the ISR cache for every collection
// link page that includes this product, so the badge updates instantly.

const WEB_URL = process.env.WEB_URL ?? '';
const REVALIDATION_SECRET = process.env.REVALIDATION_SECRET ?? '';

async function revalidateCollectionsForProduct(productId: string): Promise<void> {
  if (!WEB_URL || !REVALIDATION_SECRET) return;

  try {
    const collectionProducts = await prisma.collectionProduct.findMany({
      where: { product_id: productId },
      include: {
        collection: {
          select: { slug: true },
        },
      },
    });

    const slugs = [...new Set(collectionProducts.map((cp) => cp.collection.slug))];
    if (slugs.length === 0) return;

    await Promise.allSettled(
      slugs.map((slug) =>
        fetch(`${WEB_URL}/api/revalidate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret: REVALIDATION_SECRET, collection_slug: slug }),
          signal: AbortSignal.timeout(5000),
        }),
      ),
    );
  } catch {
    // Revalidation is best-effort
  }
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

const ALLOWED_SPIN_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime'] as const;
const MAX_SPIN_VIDEO_BYTES = 50_000_000; // ~50MB, a few seconds of 1080p

const CreateProductSchema = z.object({
  photo_r2_key: z.string().min(1),
  photo_url: z.string().url(),
  price_min: z.number().int().min(0).max(100_000_000).optional(),
  price_max: z.number().int().min(0).max(100_000_000).optional(),
  mrp: z.number().int().min(0).max(100_000_000).optional(),
  category: z.string().max(100).optional(),
  product_type: z.string().max(50).optional(),
  primary_color: z.string().max(50).optional(),
  secondary_colors: z.array(z.string().max(50)).max(10).optional(),
  fabric_estimate: z.string().max(100).optional(),
  pattern: z.string().max(100).optional(),
  embellishments: z.array(z.string().max(100)).max(10).optional(),
  neck_style: z.string().max(100).optional(),
  sleeve_type: z.string().max(100).optional(),
  occasions: z.array(z.string().max(100)).max(10).optional(),
  search_tags: z.array(z.string().max(100)).max(20).optional(),
  section_id: z.string().optional(),
  location_notes: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['AVAILABLE', 'SOLD', 'RESERVED', 'NOT_SURE']).optional(),
  auto_cleanup: z.boolean().optional().default(true),
});

const UpdateProductSchema = CreateProductSchema.partial().omit({
  photo_r2_key: true,
  photo_url: true,
});

const NEW_ARRIVAL_DAYS = 30;

function isNewArrival(createdAt: Date | string): boolean {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - NEW_ARRIVAL_DAYS);
  return new Date(createdAt) >= cutoff;
}

const ListProductsQuerySchema = z.object({
  status: z.enum(['AVAILABLE', 'SOLD', 'RESERVED', 'NOT_SURE']).optional(),
  category: z.string().optional(),
  is_new_arrival: z.coerce.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Photo URL helper ──────────────────────────────────────────────
// If the stored public URL does not start with http (R2_PUBLIC_URL may not be set),
// generate a presigned GET URL instead.  getSignedUrl is fast (no network call,
// just HMAC signing), so this works on every request without caching.

async function photoUrlToDisplay(
  photo: { url: string; r2_key: string | null } | null | undefined,
): Promise<string | null> {
  if (!photo) return null;
  // Already a valid HTTP(S) URL — use as-is (includes R2 public URLs,
  // Cloudflare CDN URLs, presigned URLs, externally-hosted photos, etc.)
  if (photo.url.startsWith('http://') || photo.url.startsWith('https://')) {
    return photo.url;
  }
  // URL is a relative path (R2_PUBLIC_URL not set) — try presigned GET URL
  if (photo.r2_key) {
    try {
      return await getDownloadPresignedUrl(photo.r2_key, 3600);
    } catch {
      // Presigned URL generation failed (R2 credentials not configured).
      // Return the original URL as a last-resort fallback — it won't load
      // in the browser, but it's better than silently showing null and a
      // blank card with no indication of the problem.
      return photo.url || null;
    }
  }
  // No r2_key and URL is relative — nothing we can do
  return photo.url || null;
}

export const productRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /products/upload-url ──────────────────────────────────
  server.post('/upload-url', async (request, reply) => {
    const body = z
      .object({
        filename: z.string().min(1).max(255),
        content_type: z.enum(ALLOWED_MIME_TYPES),
        size_bytes: z.number().int().min(1).max(10_000_000),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const { content_type, size_bytes } = body.data;
    if (size_bytes > 10_000_000) throw validationError('File too large (max 10MB)', 'size_bytes');

    const productId = createId();
    const ext =
      content_type === 'image/jpeg' ? 'jpg' : content_type === 'image/png' ? 'png' : 'webp';
    const filename = `${createId()}.${ext}`;
    const r2Key = R2_PATHS.productPhoto(request.retailerId, productId, filename);

    let uploadUrl: string;
    try {
      uploadUrl = await getUploadPresignedUrl(r2Key, content_type, 300);
    } catch {
      throw validationError(
        'Photo storage is not configured. Please contact support to enable photo uploads.',
      );
    }

    return reply.status(200).send({
      data: {
        upload_url: uploadUrl,
        r2_key: r2Key,
        public_url: publicUrl(r2Key),
        product_id: productId,
        expires_in: 300,
      },
    });
  });

  // ─── POST /products ─────────────────────────────────────────────
  server.post('/', async (request, reply) => {
    const retailerId = request.retailerId;

    const retailer = await prisma.retailer.findUniqueOrThrow({
      where: { id: retailerId },
      select: { max_products: true },
    });
    const currentCount = await prisma.product.count({
      where: { retailer_id: retailerId, deleted_at: null },
    });
    if (currentCount >= retailer.max_products) {
      throw planLimitExceeded('products');
    }
    // F-010: generalized quota gate, additive for now — plan_limits has no
    // seed row for PRODUCT_UPLOAD yet so this is a no-op until an admin adds
    // one. The max_products check above stays authoritative until then.
    await checkQuota(retailerId, 'PRODUCT_UPLOAD');

    const body = CreateProductSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const { photo_r2_key, photo_url, metadata, auto_cleanup, ...rest } = body.data;

    if (rest.section_id) {
      const section = await prisma.storeSection.findFirst({
        where: { id: rest.section_id, retailer_id: retailerId },
      });
      if (!section) throw forbidden('Section does not belong to your store');
    }

    const product = await prisma.product.create({
      data: {
        retailer_id: retailerId,
        metadata: metadata !== undefined ? (metadata as Prisma.InputJsonValue) : undefined,
        ...rest,
        photos: {
          create: [
            { url: photo_url, r2_key: photo_r2_key, is_primary: true, retailer_id: retailerId },
          ],
        },
      },
      include: { photos: true, section: { select: { name: true } } },
    });

    // Best-effort — a failed usage-counter write shouldn't fail an upload
    // that already succeeded.
    incrementUsage(retailerId, 'PRODUCT_UPLOAD').catch((err) => {
      request.log.error({ err, product_id: product.id }, 'Failed to record product-upload usage');
    });

    // Fire-and-forget: if Redis/BullMQ is down the tagging job won't block
    // product creation. We set ai_tag_error so the UI shows a failure banner
    // instead of spinning "AI tagging in progress..." forever.
    addTaggingJob({
      product_id: product.id,
      retailer_id: retailerId,
      photo_url,
      r2_key: photo_r2_key,
      auto_cleanup,
    }).catch(async (err) => {
      request.log.error({ err, product_id: product.id }, 'Failed to queue tagging job');
      try {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            ai_tagged: false,
            ai_tag_error: 'Background AI tagging unavailable — try again later',
          },
        });
      } catch {}
    });

    return reply.status(201).send({ data: product });
  });

  // ─── GET /products ──────────────────────────────────────────────
  server.get('/', async (request) => {
    const query = ListProductsQuerySchema.safeParse(request.query);
    if (!query.success) throw validationError(query.error.issues[0]?.message ?? 'Invalid query');

    const { status, category, cursor, limit, is_new_arrival } = query.data;

    // When is_new_arrival filter is active, compute the cutoff date so the
    // query only returns products created within the last 30 days — no cron,
    // no migration, no stored flag. This is a derived, time-sensitive filter
    // that automatically expires as products age past the window.
    const arrivalCutoff = is_new_arrival
      ? (() => {
          const d = new Date();
          d.setDate(d.getDate() - NEW_ARRIVAL_DAYS);
          return d;
        })()
      : undefined;

    const products = await prisma.product.findMany({
      where: {
        retailer_id: request.retailerId,
        deleted_at: null,
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
        ...(arrivalCutoff ? { created_at: { gte: arrivalCutoff } } : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      include: {
        photos: { where: { is_primary: true }, take: 1 },
        section: { select: { name: true } },
      },
      orderBy: { created_at: 'desc' },
      take: limit + 1,
    });

    const hasMore = products.length > limit;
    const page = hasMore ? products.slice(0, limit) : products;

    const data = await Promise.all(
      page.map(async (p) => ({
        ...p,
        primary_photo_url: await photoUrlToDisplay(
          p.photos[0]
            ? { url: p.photos[0].url, r2_key: (p.photos[0] as { r2_key?: string }).r2_key ?? null }
            : null,
        ),
        is_new_arrival: isNewArrival(p.created_at),
        photos: undefined,
      })),
    );

    return {
      data,
      pagination: {
        cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        has_more: hasMore,
      },
    };
  });

  // ─── GET /products/:id ──────────────────────────────────────────
  server.get('/:id', async (request) => {
    const { id } = request.params as { id: string };

    const product = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
      include: {
        photos: { orderBy: { sort_order: 'asc' } },
        spin_frames: { orderBy: { frame_index: 'asc' } },
        variants: true,
        section: { select: { name: true } },
      },
    });
    if (!product) throw notFound('Product');

    // Generate presigned URLs for all photos
    const photosWithUrls = await Promise.all(
      (product.photos ?? []).map(async (photo) => ({
        ...photo,
        url: (await photoUrlToDisplay({ url: photo.url, r2_key: photo.r2_key })) ?? photo.url,
      })),
    );

    // Generate presigned URLs for spin frames (same fallback as photos)
    const spinFramesWithUrls = await Promise.all(
      (product.spin_frames ?? []).map(async (frame) => ({
        ...frame,
        url: (await photoUrlToDisplay({ url: frame.url, r2_key: frame.r2_key })) ?? frame.url,
      })),
    );

    // Generate presigned URLs for variant photos using their r2_key
    const variantsWithUrls = await Promise.all(
      (product.variants ?? []).map(async (variant) => {
        if (!variant.photo_url) return variant;
        const displayUrl = await photoUrlToDisplay({
          url: variant.photo_url,
          r2_key: variant.r2_key,
        });
        return { ...variant, photo_url: displayUrl ?? variant.photo_url };
      }),
    );

    return {
      data: {
        ...product,
        photos: photosWithUrls,
        spin_frames: spinFramesWithUrls,
        variants: variantsWithUrls,
      },
    };
  });

  // ─── GET /products/:id/interested-customers ──────────────────────
  server.get('/:id/interested-customers', async (request) => {
    const { id } = request.params as { id: string };
    const retailerId = request.retailerId;

    const query = z
      .object({ limit: z.coerce.number().int().min(1).max(50).default(12) })
      .safeParse(request.query);
    if (!query.success) throw validationError('Invalid query');
    const { limit } = query.data;

    const product = await prisma.product.findFirst({
      where: { id, retailer_id: retailerId, deleted_at: null },
      select: { id: true },
    });
    if (!product) throw notFound('Product');

    type MatchRow = {
      customer_id: string;
      name: string;
      phone: string;
      match_score: number;
    };

    const rows = await prisma.$queryRaw<MatchRow[]>`
      SELECT
        c.id AS customer_id,
        c.name,
        c.phone,
        (1 - (dna.preference_vector <=> pe.embedding)) AS match_score
      FROM customer_fashion_dna dna
      JOIN customers c ON c.id = dna.customer_id
      JOIN product_embeddings pe ON pe.product_id = ${id}
      WHERE dna.retailer_id = ${retailerId}
        AND c.deleted_at IS NULL
        AND dna.confidence_score >= ${MIN_CONFIDENCE_FOR_MATCHING}
      ORDER BY match_score DESC
      LIMIT ${limit * 2}
    `;

    const customers = rows
      .filter((r) => Number(r.match_score) > MATCH_SIMILARITY_THRESHOLD)
      .slice(0, limit)
      .map((r) => ({
        id: r.customer_id,
        name: r.name,
        phone: r.phone,
        match_score: Number(r.match_score),
      }));

    return { data: { customers } };
  });

  // ─── PUT /products/:id ──────────────────────────────────────────
  server.put('/:id', async (request) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    });
    if (!existing) throw notFound('Product');

    const body = UpdateProductSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const { metadata, ...rest } = body.data;
    const updated = await prisma.product.update({
      where: { id },
      data: {
        metadata: metadata !== undefined ? (metadata as Prisma.InputJsonValue) : undefined,
        ...rest,
      },
      include: { photos: true, section: { select: { name: true } } },
    });

    const embeddingFields = [
      'category',
      'primary_color',
      'fabric_estimate',
      'occasions',
      'search_tags',
    ];
    const needsReembed = embeddingFields.some((f) => f in body.data);
    if (needsReembed) {
      addEmbeddingJob({ product_id: id, retailer_id: request.retailerId }).catch(() => {
        // Non-critical — embedding can be regenerated later
      });
    }

    return { data: updated };
  });

  // ─── PATCH /products/:id/status ─────────────────────────────────
  server.patch('/:id/status', async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({ status: z.enum(['AVAILABLE', 'SOLD', 'RESERVED', 'NOT_SURE']) })
      .safeParse(request.body);
    if (!body.success) throw validationError('Invalid status');

    const existing = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    });
    if (!existing) throw notFound('Product');

    const updated = await prisma.product.update({
      where: { id },
      data: { status: body.data.status },
      select: { id: true, status: true },
    });

    void revalidateCollectionsForProduct(id);

    return { data: updated };
  });

  // ─── POST /products/bulk-delete ──────────────────────────────────
  server.post('/bulk-delete', async (request, reply) => {
    const body = z
      .object({ ids: z.array(z.string().min(1)).min(1).max(100) })
      .safeParse(request.body);
    if (!body.success) throw validationError('Provide 1-100 product ids');

    const result = await prisma.product.updateMany({
      where: { id: { in: body.data.ids }, retailer_id: request.retailerId, deleted_at: null },
      data: { deleted_at: new Date() },
    });

    return reply.status(200).send({ data: { deleted_count: result.count } });
  });

  // ─── DELETE /products/:id ───────────────────────────────────────
  server.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    });
    if (!existing) throw notFound('Product');

    await prisma.product.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
    return reply.status(204).send();
  });

  // ─── POST /products/:id/photos ──────────────────────────────────
  server.post('/:id/photos', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
      include: { _count: { select: { photos: true } } },
    });
    if (!existing) throw notFound('Product');
    if (existing._count.photos >= 10) throw validationError('Maximum 10 photos per product');

    const body = z
      .object({
        r2_key: z.string().min(1),
        url: z.string().url(),
        is_primary: z.boolean().optional(),
        piece_type: z.enum(['upper', 'lower']).optional(),
        content_type: z.enum(ALLOWED_MIME_TYPES as unknown as [AllowedMime, ...AllowedMime[]]),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const photo = await prisma.productPhoto.create({
      data: {
        product_id: id,
        retailer_id: request.retailerId,
        r2_key: body.data.r2_key,
        url: body.data.url,
        is_primary: body.data.is_primary ?? false,
        piece_type: body.data.piece_type,
      },
    });
    return reply.status(201).send({ data: photo });
  });

  // ─── POST /products/:id/photos/:photoId/cleanup ───────────────────
  // Manual retailer-triggered crop + white-background removal, for photos
  // added after product creation or where auto_cleanup was off at upload
  // time. Reuses the same cleanupProductPhoto pipeline as the automatic
  // post-upload job (apps/api/src/jobs/tag-product.ts).
  server.post('/:id/photos/:photoId/cleanup', async (request, reply) => {
    const { id, photoId } = request.params as { id: string; photoId: string };

    const photo = await prisma.productPhoto.findFirst({
      where: { id: photoId, product_id: id, retailer_id: request.retailerId },
    });
    if (!photo) throw notFound('Product photo');

    await checkQuota(request.retailerId, 'BG_REMOVAL');

    const raw = await fetchImageBuffer(photo.url);
    const cleaned = await cleanupProductPhoto(raw);
    await uploadBuffer(photo.r2_key, cleaned, 'image/jpeg');
    await incrementUsage(request.retailerId, 'BG_REMOVAL');

    return reply.status(200).send({ data: { id: photo.id, url: photo.url } });
  });

  // ─── POST /products/:id/spin-video/upload-url ─────────────────────
  server.post('/:id/spin-video/upload-url', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    });
    if (!existing) throw notFound('Product');

    const body = z
      .object({
        content_type: z.enum(ALLOWED_SPIN_VIDEO_MIME_TYPES),
        size_bytes: z.number().int().min(1).max(MAX_SPIN_VIDEO_BYTES),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const r2Key = R2_PATHS.spinVideo(request.retailerId, id);
    let uploadUrl: string;
    try {
      uploadUrl = await getUploadPresignedUrl(r2Key, body.data.content_type, 300);
    } catch {
      throw validationError(
        'Video storage is not configured. Please contact support to enable spin videos.',
      );
    }

    return reply.status(200).send({
      data: { upload_url: uploadUrl, r2_key: r2Key, expires_in: 300 },
    });
  });

  // ─── POST /products/:id/spin-video ────────────────────────────────
  // Confirms the video finished uploading to R2 and queues frame extraction.
  server.post('/:id/spin-video', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    });
    if (!existing) throw notFound('Product');

    const body = z.object({ r2_key: z.string().min(1) }).safeParse(request.body);
    if (!body.success) throw validationError('r2_key required');

    await prisma.product.update({
      where: { id },
      data: { spin_status: 'processing', spin_error: null },
    });
    await addSpinFrameJob({
      product_id: id,
      retailer_id: request.retailerId,
      video_r2_key: body.data.r2_key,
    });

    return reply.status(202).send({ data: { spin_status: 'processing' } });
  });

  // ─── PATCH /products/:id/photos/:photoId ──────────────────────────
  server.patch('/:id/photos/:photoId', async (request) => {
    const { id, photoId } = request.params as { id: string; photoId: string };

    const photo = await prisma.productPhoto.findFirst({
      where: { id: photoId, product_id: id, retailer_id: request.retailerId },
    });
    if (!photo) throw notFound('Product photo');

    const body = z
      .object({ piece_type: z.enum(['upper', 'lower']).nullable() })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const updated = await prisma.productPhoto.update({
      where: { id: photoId },
      data: { piece_type: body.data.piece_type },
    });
    return { data: updated };
  });

  // ─── POST /products/:id/variants ─────────────────────────────────
  server.post('/:id/variants', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
      include: { _count: { select: { variants: true } } },
    });
    if (!existing) throw notFound('Product');
    if (existing._count.variants >= 20)
      throw validationError('Maximum 20 color variants per product');

    const body = z
      .object({
        color: z.string().min(1).max(50),
        r2_key: z.string().min(1),
        url: z.string().url(),
        price_override: z.number().int().min(0).max(100_000_000).optional(),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const variant = await prisma.productVariant.create({
      data: {
        product_id: id,
        retailer_id: request.retailerId,
        color: body.data.color,
        photo_url: body.data.url,
        r2_key: body.data.r2_key,
        price_override: body.data.price_override,
        is_ai_preview: false,
      },
    });
    return reply.status(201).send({ data: variant });
  });

  // ─── GET /products/:id/variants ──────────────────────────────────
  server.get('/:id/variants', async (request) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    });
    if (!existing) throw notFound('Product');

    const variants = await prisma.productVariant.findMany({
      where: { product_id: id, retailer_id: request.retailerId },
      orderBy: { created_at: 'asc' },
    });

    // Generate presigned URLs for variant photos
    const variantsWithUrls = await Promise.all(
      variants.map(async (variant) => {
        if (!variant.photo_url) return variant;
        const displayUrl = await photoUrlToDisplay({
          url: variant.photo_url,
          r2_key: variant.r2_key,
        });
        return { ...variant, photo_url: displayUrl ?? variant.photo_url };
      }),
    );

    return { data: variantsWithUrls };
  });

  // ─── POST /products/detect-color ───────────────────────────────
  // Lightweight Claude Haiku call that extracts only the dominant color
  // from a variant/product photo. Designed for the "Add Color Variant"
  // screen to pre-fill the color field instead of requiring manual entry.
  server.post('/detect-color', async (request, reply) => {
    const body = z.object({ image_url: z.string().url() }).safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    try {
      const color = await detectColor(body.data.image_url);
      return reply.status(200).send({ data: { color } });
    } catch (err) {
      request.log.error({ err, image_url: body.data.image_url }, 'Color detection failed');
      return reply.status(200).send({ data: { color: null } });
    }
  });

  // ─── DELETE /products/:id/variants/:variantId ────────────────────
  server.delete('/:id/variants/:variantId', async (request, reply) => {
    const { id, variantId } = request.params as { id: string; variantId: string };

    const variant = await prisma.productVariant.findFirst({
      where: { id: variantId, product_id: id, retailer_id: request.retailerId },
    });
    if (!variant) throw notFound('Variant');

    await prisma.productVariant.delete({ where: { id: variantId } });
    return reply.status(204).send();
  });
};
