// Auto-split from admin.ts (scripts/split-admin-routes.mjs) — route bodies verbatim.
import type { FastifyPluginAsync } from 'fastify';

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getUploadPresignedUrl, publicUrl } from '@kanchuki/ai';
import {
  encryptSecret,
  getReplicaPrisma,
  getSecret,
  getVaultPrisma,
  invalidateSecret,
  maskSecret,
  prisma,
  vaultDelete,
} from '@kanchuki/db';
import { INTEGRATION_KEYS, PLAN_PRICING, R2_PATHS } from '@kanchuki/shared';
import { z } from 'zod';
import { forbidden, notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

export const adminMediaRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/background-images ───────────────────────────────
  // F-011: full library incl. inactive rows (admin needs to see what's
  // hidden from the retailer picker in order to re-activate it).
  server.get('/background-images', async () => {
    const rows = await prisma.backgroundImage.findMany({ orderBy: { created_at: 'desc' } });
    return { data: rows };
  });

  // ─── POST /admin/background-images/upload-url ───────────────────
  // Presigned PUT so the admin panel uploads image bytes straight to R2,
  // same pattern as the retailer spin-video upload (products.ts).
  server.post('/background-images/upload-url', async (request) => {
    const body = z
      .object({
        content_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        filename: z.string().min(1).max(200),
      })
      .parse(request.body);

    const ext = body.content_type.split('/')[1];
    const r2Key = R2_PATHS.backgroundImage(
      `${createHash('sha256')
        .update(body.filename + Date.now())
        .digest('hex')
        .slice(0, 16)}.${ext}`,
    );
    const uploadUrl = await getUploadPresignedUrl(r2Key, body.content_type, 300);

    return {
      data: { upload_url: uploadUrl, r2_key: r2Key, public_url: publicUrl(r2Key), expires_in: 300 },
    };
  });

  // ─── POST /admin/background-images ───────────────────────────────
  // Registers a background already uploaded via the presigned URL above.
  server.post('/background-images', async (request) => {
    const body = z
      .object({
        name: z.string().min(1).max(100),
        image_url: z.string().url(),
        thumbnail_url: z.string().url().optional(),
      })
      .parse(request.body);

    const row = await prisma.backgroundImage.create({ data: body });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'CREATE',
        resource_type: 'BackgroundImage',
        resource_id: row.id,
        metadata: { name: row.name, image_url: row.image_url },
        ip_address: request.ip,
      },
    });

    return { data: row };
  });

  // ─── PATCH /admin/background-images/:id ──────────────────────────
  // Toggle visibility in the retailer picker or rename. No hard delete —
  // products may already reference a row (background_image_id FK is
  // ON DELETE SET NULL), so deactivating keeps existing selections intact
  // while hiding it from new picks.
  server.patch('/background-images/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        name: z.string().min(1).max(100).optional(),
        is_active: z.boolean().optional(),
      })
      .parse(request.body);

    const existing = await prisma.backgroundImage.findUnique({ where: { id } });
    if (!existing) throw notFound('Background image');

    const row = await prisma.backgroundImage.update({ where: { id }, data: body });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'BackgroundImage',
        resource_id: id,
        metadata: {
          before: { name: existing.name, is_active: existing.is_active },
          after: {
            ...(body.name ? { name: body.name } : {}),
            ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
          },
        },
        ip_address: request.ip,
      },
    });

    return { data: row };
  });
};
