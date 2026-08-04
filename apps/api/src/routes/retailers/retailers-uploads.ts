// Auto-split from retailers.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { getUploadPresignedUrl, publicUrl } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { R2_PATHS } from '@kanchuki/shared';
import { createId } from '@paralleldrive/cuid2';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { validationError } from '../../plugins/error-handler.js';

export const retailersUploadsRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /retailers/me/banner-upload-url ────────────────────────
  // Store banner image shown as a hero section on customer-facing pages.
  server.post('/me/banner-upload-url', async (request, reply) => {
    const body = z
      .object({
        filename: z.string().min(1).max(255),
        content_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        size_bytes: z.number().int().min(1).max(10_000_000), // 10MB — banners are large
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const { content_type } = body.data;
    const ext =
      content_type === 'image/png' ? 'png' : content_type === 'image/webp' ? 'webp' : 'jpg';
    const r2Key = R2_PATHS.retailerBanner(request.retailerId, `${createId()}.${ext}`);

    let uploadUrl: string;
    try {
      uploadUrl = await getUploadPresignedUrl(r2Key, content_type, 300);
    } catch {
      throw validationError('Banner storage is not configured. Please contact support.');
    }

    return reply.status(200).send({
      data: { upload_url: uploadUrl, r2_key: r2Key, public_url: publicUrl(r2Key), expires_in: 300 },
    });
  });

  // ─── POST /retailers/me/logo-upload-url ─────────────────────────
  server.post('/me/logo-upload-url', async (request, reply) => {
    const body = z
      .object({
        filename: z.string().min(1).max(255),
        content_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        size_bytes: z.number().int().min(1).max(5_000_000),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const { content_type } = body.data;
    const ext =
      content_type === 'image/png' ? 'png' : content_type === 'image/webp' ? 'webp' : 'jpg';
    const r2Key = R2_PATHS.retailerLogo(request.retailerId, `${createId()}.${ext}`);

    let uploadUrl: string;
    try {
      uploadUrl = await getUploadPresignedUrl(r2Key, content_type, 300);
    } catch (err) {
      console.error('R2 presigned URL generation failed:', err);
      throw validationError('Photo storage is not configured. Please contact support.');
    }

    return reply.status(200).send({
      data: { upload_url: uploadUrl, r2_key: r2Key, public_url: publicUrl(r2Key), expires_in: 300 },
    });
  });

  // ─── POST /retailers/me/kyc-upload-url ──────────────────────────
  // KYC docs: GST certificate accepts PDF or image; Aadhar front/back are photos only.
  server.post('/me/kyc-upload-url', async (request, reply) => {
    const body = z
      .object({
        doc_type: z.enum(['gst', 'aadhar_front', 'aadhar_back']),
        filename: z.string().min(1).max(255),
        content_type: z.enum(['image/jpeg', 'image/png', 'application/pdf']),
        size_bytes: z.number().int().min(1).max(10_000_000),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const { doc_type, content_type } = body.data;
    if (doc_type !== 'gst' && content_type === 'application/pdf') {
      throw validationError('Aadhar upload must be a photo, not a PDF');
    }

    const ext =
      content_type === 'application/pdf' ? 'pdf' : content_type === 'image/png' ? 'png' : 'jpg';
    const r2Key = R2_PATHS.retailerKyc(request.retailerId, doc_type, `${createId()}.${ext}`);

    let uploadUrl: string;
    try {
      uploadUrl = await getUploadPresignedUrl(r2Key, content_type, 300);
    } catch {
      throw validationError('Document storage is not configured. Please contact support.');
    }

    return reply.status(200).send({
      data: { upload_url: uploadUrl, r2_key: r2Key, public_url: publicUrl(r2Key), expires_in: 300 },
    });
  });

  // ─── PATCH /retailers/me/kyc ─────────────────────────────────────
  // Records one uploaded KYC doc. Once all three (GST + Aadhar front + back)
  // are on file, flips status NOT_SUBMITTED -> PENDING for admin review.
  server.patch('/me/kyc', async (request) => {
    const body = z
      .object({
        doc_type: z.enum(['gst', 'aadhar_front', 'aadhar_back']),
        r2_key: z.string().min(1).max(500),
        url: z.string().min(1).max(500),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');
    const { doc_type, r2_key, url } = body.data;

    const fieldMap = {
      gst: { urlField: 'kyc_gst_url', keyField: 'kyc_gst_r2_key' },
      aadhar_front: { urlField: 'kyc_aadhar_front_url', keyField: 'kyc_aadhar_front_r2_key' },
      aadhar_back: { urlField: 'kyc_aadhar_back_url', keyField: 'kyc_aadhar_back_r2_key' },
    } as const;
    const { urlField, keyField } = fieldMap[doc_type];

    const updated = await prisma.retailer.update({
      where: { id: request.retailerId },
      data: { [urlField]: url, [keyField]: r2_key },
    });

    let kyc_status = updated.kyc_status;
    if (
      updated.kyc_gst_url &&
      updated.kyc_aadhar_front_url &&
      updated.kyc_aadhar_back_url &&
      updated.kyc_status === 'NOT_SUBMITTED'
    ) {
      const submitted = await prisma.retailer.update({
        where: { id: request.retailerId },
        data: { kyc_status: 'PENDING', kyc_submitted_at: new Date() },
        select: { kyc_status: true },
      });
      kyc_status = submitted.kyc_status;
    }

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'update',
        resource_type: 'Retailer',
        resource_id: request.retailerId,
        metadata: { kyc_update: doc_type },
        ip_address: request.ip,
      },
    });

    return { data: { kyc_status } };
  });
};
