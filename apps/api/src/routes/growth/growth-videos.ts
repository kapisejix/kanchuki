import { deleteObject, getUploadPresignedUrl, publicUrl } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { R2_PATHS } from '@kanchuki/shared';
import { createId } from '@paralleldrive/cuid2';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addKenBurnsVideoJob } from '../../jobs/index.js';
import { handleGenerateKenBurnsVideo } from '../../jobs/generate-ken-burns-video.js';
import { hasFeature } from '../../lib/features.js';
import { featureUnavailable, notFound, validationError } from '../../plugins/error-handler.js';
import { photoUrlToDisplay } from '../products/products-helpers.js';

export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;
export const MAX_VIDEO_BYTES = 50_000_000; // 50MB — compressed clips only (5-10s)

export const growthVideoRoutes: FastifyPluginAsync = async (server) => {
  const guard = async (retailerId: string) => {
    if (!(await hasFeature(retailerId, 'GROWTH_ENGINE'))) throw featureUnavailable('Growth tools');
  };

  // ─── POST /growth/products/:id/videos/upload-url ────────────────
  // Presigned R2 upload for a short product clip. Mirrors the photo
  // upload-url pattern (products-media.ts).
  server.post('/products/:id/videos/upload-url', async (request, reply) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    const product = await prisma.product.findFirst({
      where: { id, retailer_id: retailerId, deleted_at: null },
      include: { _count: { select: { videos: true } } },
    });
    if (!product) throw notFound('Product');
    if (product._count.videos >= 3) throw validationError('Maximum 3 videos per product');

    const body = z
      .object({
        filename: z.string().min(1).max(255),
        content_type: z.enum(VIDEO_MIME_TYPES),
        size_bytes: z.number().int().min(1).max(MAX_VIDEO_BYTES),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');
    const { content_type } = body.data;

    const ext =
      content_type === 'video/webm' ? 'webm' : content_type === 'video/quicktime' ? 'mov' : 'mp4';
    const filename = `${createId()}.${ext}`;
    const r2Key = R2_PATHS.productVideo(retailerId, id, filename);

    let uploadUrl: string;
    try {
      uploadUrl = await getUploadPresignedUrl(r2Key, content_type, 300);
    } catch (err) {
      console.error('R2 presigned URL generation failed (video):', err);
      throw validationError('Video storage is not configured. Please contact support.');
    }

    return reply.send({
      data: { upload_url: uploadUrl, r2_key: r2Key, public_url: publicUrl(r2Key), expires_in: 300 },
    });
  });

  // ─── POST /growth/products/:id/videos ───────────────────────────
  // Confirm an uploaded clip (client PUT to upload_url, then reports back).
  server.post('/products/:id/videos', async (request, reply) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    const product = await prisma.product.findFirst({
      where: { id, retailer_id: retailerId, deleted_at: null },
      include: { _count: { select: { videos: true } } },
    });
    if (!product) throw notFound('Product');
    if (product._count.videos >= 3) throw validationError('Maximum 3 videos per product');

    const body = z
      .object({
        r2_key: z.string().min(1),
        public_url: z.string().min(1),
        duration_sec: z.number().int().min(1).max(120).optional(),
        is_main: z.boolean().optional(),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const { r2_key, public_url, duration_sec, is_main } = body.data;
    const existing = await prisma.productVideo.findFirst({ where: { r2_key } });
    if (existing) throw validationError('This video was already saved');

    const video = await prisma.$transaction(async (tx) => {
      if (is_main) {
        await tx.productVideo.updateMany({ where: { product_id: id }, data: { is_main: false } });
      }
      return tx.productVideo.create({
        data: {
          product_id: id,
          retailer_id: retailerId,
          r2_key,
          public_url,
          duration_sec: duration_sec ?? null,
          is_main: is_main ?? false,
        },
      });
    });
    return reply.status(201).send({ data: video });
  });

  // ─── POST /growth/products/:id/video/generate ───────────────────
  // F-033 Slice 1: enqueue a Ken Burns pan/zoom slideshow built from the
  // product's own photos — no upload needed. Same 3-video cap + feature
  // gate as manual upload above; the ffmpeg job itself needs ≥2 photos.
  server.post('/products/:id/video/generate', async (request, reply) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };

    const product = await prisma.product.findFirst({
      where: { id, retailer_id: retailerId, deleted_at: null },
      include: { _count: { select: { videos: true, photos: true } } },
    });
    if (!product) throw notFound('Product');
    if (product._count.videos >= 3) throw validationError('Maximum 3 videos per product');
    if (product._count.photos < 2) {
      throw validationError('Add at least 2 photos before generating a video');
    }

    try {
      await addKenBurnsVideoJob({ product_id: id, retailer_id: retailerId });
    } catch (err) {
      server.log.warn({ err }, 'Maintenance queue unavailable — running Ken Burns video directly');
      void handleGenerateKenBurnsVideo({ product_id: id, retailer_id: retailerId }).catch((e) => {
        server.log.error({ err: e }, 'Direct Ken Burns video generation failed');
      });
    }
    return reply.status(202).send({ data: { message: 'Video generation started' } });
  });

  // ─── GET /growth/products/:id/videos ────────────────────────────
  server.get('/products/:id/videos', async (request) => {
    const retailerId = request.retailerId;
    const { id } = request.params as { id: string };
    const product = await prisma.product.findFirst({
      where: { id, retailer_id: retailerId, deleted_at: null },
    });
    if (!product) throw notFound('Product');
    const videos = await prisma.productVideo.findMany({
      where: { product_id: id },
      orderBy: [{ is_main: 'desc' }, { created_at: 'desc' }],
    });
    const videosWithUrls = await Promise.all(
      videos.map(async (v) => ({
        ...v,
        public_url:
          (await photoUrlToDisplay({ url: v.public_url, r2_key: v.r2_key })) ?? v.public_url,
      })),
    );
    return { data: videosWithUrls };
  });

  // ─── DELETE /growth/videos/:id ──────────────────────────────────
  server.delete('/videos/:id', async (request, reply) => {
    const retailerId = request.retailerId;
    const { id } = request.params as { id: string };
    const video = await prisma.productVideo.findFirst({ where: { id, retailer_id: retailerId } });
    if (!video) throw notFound('Video');
    await prisma.productVideo.delete({ where: { id } });
    if (video.r2_key) {
      try {
        await deleteObject(video.r2_key);
      } catch {
        // Non-fatal R2 cleanup
      }
    }
    return reply.status(204).send();
  });
};
