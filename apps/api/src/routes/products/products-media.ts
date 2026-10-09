// Auto-split from products.ts (scripts/check-route-size.sh) — route bodies verbatim.
import {
  deleteObject,
  fetchImageBuffer,
  getUploadPresignedUrl,
  publicUrl,
  uploadBuffer,
} from '@kanchuki/ai';
import { type Prisma, prisma } from '@kanchuki/db';
import { R2_PATHS } from '@kanchuki/shared';
import { createId } from '@paralleldrive/cuid2';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hasFeature } from '../../lib/features.js';
import { bumpPhotoUrlVersion, preserveOriginalPhoto } from '../../lib/photo-cleanup.js';
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

    // Spin frame extraction removed — SPIN_360 feature dropped

    return reply.status(202).send({ data: { spin_status: 'removed' } });
  });

  // ─── PATCH /products/:id/photos/:photoId ──────────────────────────
  server.patch('/:id/photos/:photoId', async (request) => {
    const { id, photoId } = request.params as { id: string; photoId: string };

    // "Set as main" can target a variant preview slide (synthetic `variant-<id>`
    // from the mobile carousel) — materialize it into a real ProductPhoto row
    // first, same as the cleanup route above, so it can carry is_primary.
    let realPhotoId = photoId;
    if (photoId.startsWith('variant-')) {
      const variant = await prisma.productVariant.findFirst({
        where: {
          id: photoId.replace('variant-', ''),
          product_id: id,
          retailer_id: request.retailerId,
        },
      });
      if (!variant?.photo_url || !variant.r2_key) throw notFound('Product photo');
      const existing = await prisma.productPhoto.findFirst({
        where: { product_id: id, r2_key: variant.r2_key },
      });
      realPhotoId =
        existing?.id ??
        (
          await prisma.productPhoto.create({
            data: {
              product_id: id,
              retailer_id: request.retailerId,
              url: variant.photo_url,
              r2_key: variant.r2_key,
              is_primary: false,
            },
          })
        ).id;
    }

    const photo = await prisma.productPhoto.findFirst({
      where: { id: realPhotoId, product_id: id, retailer_id: request.retailerId },
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
          where: { id: realPhotoId },
          data: { is_primary: true },
        }),
      ]);
      const updated = await prisma.productPhoto.findUnique({ where: { id: realPhotoId } });
      return { data: updated };
    }

    const updated = await prisma.productPhoto.update({
      where: { id: realPhotoId },
      data: { piece_type: body.data.piece_type ?? null },
    });
    return { data: updated };
  });

  // ─── DELETE /products/:id/photos/:photoId ─────────────────────────
  // Retailer-triggered photo deletion. Supports standard product photos,
  // variant-linked photos ('variant-{id}'), and original unedited previews ('{id}-original').
  // Automatically promotes the next photo to primary if the main photo is deleted.
  server.delete('/:id/photos/:photoId', async (request, reply) => {
    try {
      const { id, photoId } = request.params as { id: string; photoId: string };

      const product = await prisma.product.findFirst({
        where: { id, retailer_id: request.retailerId, deleted_at: null },
        include: { photos: { orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }] } },
      });
      if (!product) throw notFound('Product');

      const isVariant = photoId.startsWith('variant-');
      const isOriginal = photoId.endsWith('-original');

      if (isVariant) {
        const variantId = photoId.replace('variant-', '');
        const variant = await prisma.productVariant.findFirst({
          where: { id: variantId, product_id: id, retailer_id: request.retailerId },
        });
        // Idempotent: already-detached variant photo (double-tap / stale list)
        // returns success, not 404.
        if (!variant) {
          return reply.status(200).send({ data: { success: true, deleted_id: photoId } });
        }
        const r2Key = variant.r2_key;
        await prisma.productVariant.update({
          where: { id: variantId },
          data: { photo_url: null, r2_key: null },
        });
        if (r2Key) {
          try {
            await deleteObject(r2Key);
          } catch {
            // Non-fatal R2 cleanup
          }
        }
        return reply.status(200).send({ data: { success: true, deleted_id: photoId } });
      }

      if (isOriginal) {
        const basePhotoId = photoId.replace('-original', '');
        const photo = await prisma.productPhoto.findFirst({
          where: { id: basePhotoId, product_id: id, retailer_id: request.retailerId },
        });
        if (!photo) {
          return reply.status(200).send({ data: { success: true, deleted_id: photoId } });
        }
        // Typed as Prisma's JSON object rather than Record<string, unknown> so
        // the remainder writes back as `metadata` without an `as any`.
        const meta = (photo.metadata as Prisma.JsonObject | null) ?? {};
        // Checked rather than cast: metadata is free-form JSON, so the key may
        // be absent or non-string on rows written by an older path.
        const originalR2Key =
          typeof meta.original_r2_key === 'string' ? meta.original_r2_key : undefined;
        const { original_r2_key, original_url, ...restMeta } = meta;
        await prisma.productPhoto.update({
          where: { id: basePhotoId },
          data: { metadata: restMeta },
        });
        if (originalR2Key) {
          try {
            await deleteObject(originalR2Key);
          } catch {
            // Non-fatal R2 cleanup
          }
        }
        return reply.status(200).send({ data: { success: true, deleted_id: photoId } });
      }

      const targetPhoto = product.photos.find((p) => p.id === photoId);
      // Idempotent: a retry after the row is already gone (double-tap on the
      // trash icon, or a tap against a stale displayPhotos list before the
      // post-delete refetch lands) should succeed. The 404 this used to throw
      // surfaced on the client as "Failed to delete photo".
      if (!targetPhoto) {
        return reply.status(200).send({ data: { success: true, deleted_id: photoId } });
      }

      // Swallow P2025 (record already gone): a double-tap / stale-list retry
      // would otherwise surface as a 500 "Something went wrong".
      try {
        await prisma.productPhoto.delete({ where: { id: photoId } });
      } catch (e) {
        if ((e as { code?: string }).code !== 'P2025') throw e;
      }

      if (targetPhoto.r2_key) {
        try {
          await deleteObject(targetPhoto.r2_key);
        } catch {
          // Non-fatal R2 cleanup
        }
      }

      // If the deleted photo was primary, promote the first remaining photo
      if (targetPhoto.is_primary) {
        const remaining = product.photos.filter((p) => p.id !== photoId);
        const nextPrimary = remaining[0];
        if (nextPrimary) {
          try {
            await prisma.productPhoto.update({
              where: { id: nextPrimary.id },
              data: { is_primary: true },
            });
          } catch (e) {
            if ((e as { code?: string }).code !== 'P2025') throw e;
          }
        }
      }

      return reply.status(200).send({ data: { success: true, deleted_id: photoId } });
    } catch (err) {
      console.error('[DELETE PHOTO HANDLER ERROR]:', err);
      throw err;
    }
  });
};
