// Auto-split from products.ts (scripts/check-route-size.sh) — route bodies verbatim.
import {
  cleanupProductPhoto,
  fetchImageBuffer,
  getUploadPresignedUrl,
  publicUrl,
  rotateImage,
  uploadBuffer,
} from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { R2_PATHS } from '@kanchuki/shared';
import { createId } from '@paralleldrive/cuid2';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addSpinFrameJob } from '../../jobs/index.js';
import { hasFeature } from '../../lib/features.js';
import { preserveOriginalPhoto } from '../../lib/photo-cleanup.js';
import { checkQuota, incrementUsage } from '../../lib/quota.js';
import { featureUnavailable, notFound, validationError } from '../../plugins/error-handler.js';
import {
  ALLOWED_MIME_TYPES,
  ALLOWED_SPIN_VIDEO_MIME_TYPES,
  type AllowedMime,
  MAX_SPIN_VIDEO_BYTES,
  photoUrlToDisplay,
} from './products-helpers.js';

export const productsMediaRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /products/background-images ─────────────────────────────
  // F-011: retailer-facing picker — active, admin-curated backgrounds only.
  // 2026-08-09 (user decision): the CUSTOM_BACKGROUND_LIBRARY plan gate was
  // removed — the F-028 auto-contrast pipeline already applies backdrops to
  // every plan ungated, so the manual picker is now consistent with it.
  server.get('/background-images', async () => {
    const rows = await prisma.backgroundImage.findMany({
      where: { is_active: true },
      orderBy: { created_at: 'desc' },
    });
    return { data: rows };
  });

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
    } catch (err) {
      console.error('R2 presigned URL generation failed:', err);
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
      include: { product: { include: { background_image: true } } },
    });
    if (!photo) throw notFound('Product photo');

    await checkQuota(request.retailerId, 'BG_REMOVAL');

    // F-029 per-photo backdrop: an explicit background_image_id in the body
    // wins over the product-level background — the mobile edit screen's
    // background picker targets the photo the retailer is currently viewing,
    // not just the product's primary photo. null → white, like the product
    // picker's "Auto" chip.
    const body = z
      .object({ background_image_id: z.string().nullable().optional() })
      .safeParse(request.body ?? {});
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    let bgUrl: string | undefined;
    if (body.data.background_image_id) {
      // 2026-08-09 (user decision): no plan gate — same as GET
      // /background-images, every retailer can composite onto an
      // admin-curated backdrop. Active-only lookup stays.
      const bg = await prisma.backgroundImage.findFirst({
        where: { id: body.data.background_image_id, is_active: true },
      });
      if (!bg) throw validationError('Background image not found or inactive');
      bgUrl = bg.image_url;
    } else {
      bgUrl = photo.product.background_image?.is_active
        ? photo.product.background_image.image_url
        : undefined;
    }
    try {
      const raw = await fetchImageBuffer(photo.url);
      await preserveOriginalPhoto(photo.id, photo.r2_key, photo.metadata, raw);
      const cleaned = await cleanupProductPhoto(raw, bgUrl);
      await uploadBuffer(photo.r2_key, cleaned, 'image/jpeg');
    } catch (err) {
      // Surface the REAL reason (fetch / bg-removal model / R2 write) instead
      // of the old blanket "storage not configured" — the mobile edit screen
      // shows this text, so a retailer can tell a quota/model failure from
      // an R2 outage instead of assuming the save silently didn't happen.
      console.error('Photo cleanup/upload failed:', err);
      const reason = err instanceof Error ? err.message.slice(0, 300) : 'unknown error';
      throw validationError(`Photo cleanup failed — ${reason}`);
    }
    await incrementUsage(request.retailerId, 'BG_REMOVAL');

    return reply.status(200).send({ data: { id: photo.id, url: photo.url } });
  });

  // ─── POST /products/:id/photos/:photoId/rotate ─────────────────────
  // Rotates 90° clockwise, relative to whatever is currently stored at the
  // target key — not a lossless/pristine-tracked rotation (see design spec
  // docs/superpowers/specs/2026-08-09-photo-rotate-and-background-picker-design.md
  // for why that tradeoff was deliberate). target='original' rotates the
  // preserved pre-cleanup upload (metadata.original_r2_key, written by
  // preserveOriginalPhoto() in lib/photo-cleanup.ts); target='primary'
  // (default) rotates the current photo.r2_key. No quota charge — cheap CPU
  // op, not an AI/BG_REMOVAL call.
  server.post('/:id/photos/:photoId/rotate', async (request, reply) => {
    const { id, photoId } = request.params as { id: string; photoId: string };

    const photo = await prisma.productPhoto.findFirst({
      where: { id: photoId, product_id: id, retailer_id: request.retailerId },
    });
    if (!photo) throw notFound('Product photo');

    const body = z
      .object({ target: z.enum(['primary', 'original']).optional() })
      .safeParse(request.body ?? {});
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');
    const target = body.data.target ?? 'primary';

    if (target === 'original') {
      const meta = (photo.metadata as Record<string, unknown> | null) ?? {};
      const originalR2Key = meta.original_r2_key;
      if (typeof originalR2Key !== 'string') {
        throw validationError(
          'No original photo to rotate — this photo was never background-cleaned',
        );
      }
      try {
        const sourceUrl = await photoUrlToDisplay({ url: '', r2_key: originalR2Key });
        const raw = await fetchImageBuffer(sourceUrl ?? '');
        const rotated = await rotateImage(raw, 90);
        await uploadBuffer(originalR2Key, rotated.buffer, 'image/jpeg');
        const url = await photoUrlToDisplay({ url: '', r2_key: originalR2Key });
        return reply.status(200).send({ data: { id: photo.id, target, url: url ?? '' } });
      } catch (err) {
        console.error('Photo rotate failed:', err);
        throw validationError('Photo storage is not configured. Please contact support.');
      }
    }

    try {
      const raw = await fetchImageBuffer(photo.url);
      const rotated = await rotateImage(raw, 90);
      await uploadBuffer(photo.r2_key, rotated.buffer, 'image/jpeg');
      const url = (await photoUrlToDisplay({ url: photo.url, r2_key: photo.r2_key })) ?? photo.url;

      let width: number | undefined;
      let height: number | undefined;
      if (photo.width != null && photo.height != null) {
        width = rotated.width;
        height = rotated.height;
        await prisma.productPhoto.update({ where: { id: photoId }, data: { width, height } });
      }

      return reply.status(200).send({ data: { id: photo.id, target, url, width, height } });
    } catch (err) {
      console.error('Photo rotate failed:', err);
      throw validationError('Photo storage is not configured. Please contact support.');
    }
  });

  // ─── PATCH /products/:id/background ────────────────────────────────
  // F-011: retailer picks a background from the admin library (or null for
  // white). Re-runs cleanupProductPhoto on the primary photo with the new
  // backdrop. Spin frames pick up the selection on their next
  // extraction (extract-spin-frames.ts reads background_image_id at
  // generation time) — not retroactively reprocessed here.
  // 2026-08-09 (user decision): plan gate removed — see GET /background-images.
  server.patch('/:id/background', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({ background_image_id: z.string().nullable() }).parse(request.body);

    const product = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
      include: { photos: { where: { is_primary: true }, take: 1 } },
    });
    if (!product) throw notFound('Product');

    let bgUrl: string | undefined;
    if (body.background_image_id) {
      const bg = await prisma.backgroundImage.findFirst({
        where: { id: body.background_image_id, is_active: true },
      });
      if (!bg) throw validationError('Background image not found or inactive');
      bgUrl = bg.image_url;
    }

    await prisma.product.update({
      where: { id },
      data: { background_image_id: body.background_image_id },
    });

    const photo = product.photos[0];
    if (photo) {
      await checkQuota(request.retailerId, 'BG_REMOVAL');
      const raw = await fetchImageBuffer(photo.url);
      await preserveOriginalPhoto(photo.id, photo.r2_key, photo.metadata, raw);
      const cleaned = await cleanupProductPhoto(raw, bgUrl);
      await uploadBuffer(photo.r2_key, cleaned, 'image/jpeg');
      await incrementUsage(request.retailerId, 'BG_REMOVAL');
    }

    return reply.status(200).send({
      data: { background_image_id: body.background_image_id, photo_url: photo?.url ?? null },
    });
  });

  // ─── POST /products/:id/spin-video/upload-url ─────────────────────
  // F-013: gated behind SPIN_360 feature.
  server.post('/:id/spin-video/upload-url', async (request, reply) => {
    const { id } = request.params as { id: string };

    if (!(await hasFeature(request.retailerId, 'SPIN_360'))) {
      throw featureUnavailable('360° Product Spin');
    }

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
  // F-013: gated behind SPIN_360 feature.
  server.post('/:id/spin-video', async (request, reply) => {
    const { id } = request.params as { id: string };

    if (!(await hasFeature(request.retailerId, 'SPIN_360'))) {
      throw featureUnavailable('360° Product Spin');
    }

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
      .object({
        piece_type: z.enum(['upper', 'lower']).nullable().optional(),
        // F-029: only `true` is meaningful — a false payload would otherwise
        // silently fall into the piece_type branch and be ignored. literal
        // makes the contract match the behavior (a false sends 422).
        is_primary: z.literal(true).optional(),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    // F-029 extension: "Set as main" — exactly one primary photo per product.
    // Demote every other photo first, then promote this one, atomically. The
    // catalog/customer surfaces all order by is_primary desc, so this single
    // flag flip is what makes the photo the main image everywhere.
    if (body.data.is_primary === true) {
      await prisma.$transaction([
        prisma.productPhoto.updateMany({
          where: { product_id: id, retailer_id: request.retailerId },
          data: { is_primary: false },
        }),
        prisma.productPhoto.update({
          where: { id: photoId },
          data: { is_primary: true },
        }),
      ]);
      const updated = await prisma.productPhoto.findUnique({ where: { id: photoId } });
      return { data: updated };
    }

    const updated = await prisma.productPhoto.update({
      where: { id: photoId },
      data: { piece_type: body.data.piece_type ?? null },
    });
    return { data: updated };
  });
};
