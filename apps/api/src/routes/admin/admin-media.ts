// Auto-split from admin.ts (scripts/split-admin-routes.mjs) — route bodies verbatim.
import type { FastifyPluginAsync } from 'fastify';

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  deleteObject,
  fetchImageBuffer,
  getUploadPresignedUrl,
  isDarkImage,
  publicUrl,
  runVisionAsk,
} from '@kanchuki/ai';
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

/** Ask a vision model for a short Title-Case name for a backdrop scene.
 * Best-effort — returns null on any failure so the caller falls back. */
async function nameBackgroundScene(
  buf: Buffer,
  url: string,
  log: { warn: (o: unknown, m: string) => void },
): Promise<string | null> {
  const lower = url.toLowerCase();
  const mediaType = lower.endsWith('.png')
    ? 'image/png'
    : lower.endsWith('.webp')
      ? 'image/webp'
      : 'image/jpeg';
  try {
    const answer = await runVisionAsk({
      images: [{ buffer: buf, mediaType }],
      systemPrompt:
        'You name studio product-photography backdrops for a catalog tool. Reply with ONLY a 2-4 word Title Case name for the backdrop scene shown (e.g. "Royal Palace Courtyard", "Marigold Festive Backdrop", "Plain White Studio"). No quotes, no punctuation, no explanation.',
      userPrompt: 'Name this backdrop scene.',
      maxTokens: 20,
    });
    const cleaned = answer
      .trim()
      .replace(/^["']|["']$/g, '')
      .split(/[\n.]/)[0]!
      .trim()
      .slice(0, 100);
    return cleaned || null;
  } catch (err) {
    log.warn({ err, url }, 'AI naming failed for background image');
    return null;
  }
}

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
  // F-028: computes the image's tone (average luminance → LIGHT/DARK) so the
  // auto-contrast pipeline can pick it — admin can override with an explicit
  // tone instead. Best-effort: unclassifiable images just get tone null
  // (never auto-picked, still selectable by hand).
  server.post('/background-images', async (request) => {
    const body = z
      .object({
        // Optional — omit it and the scene is auto-named from the image.
        name: z.string().min(1).max(100).optional(),
        image_url: z.string().url(),
        thumbnail_url: z.string().url().optional(),
        tone: z.enum(['LIGHT', 'DARK']).optional(),
      })
      .parse(request.body);

    let tone: 'LIGHT' | 'DARK' | null = body.tone ?? null;
    let name: string | null = body.name ?? null;
    if (!tone || !name) {
      try {
        const buf = await fetchImageBuffer(body.image_url);
        if (!tone) {
          const isDark = await isDarkImage(buf);
          tone = isDark === true ? 'DARK' : isDark === false ? 'LIGHT' : null;
        }
        if (!name) name = await nameBackgroundScene(buf, body.image_url, request.log);
      } catch (err) {
        request.log.warn(
          { err, image_url: body.image_url },
          'Tone/name classification failed for background image',
        );
      }
    }
    if (!name) name = `Backdrop ${new Date().toISOString().slice(0, 10)}`;

    const row = await prisma.backgroundImage.create({
      data: {
        name,
        image_url: body.image_url,
        ...(body.thumbnail_url ? { thumbnail_url: body.thumbnail_url } : {}),
        ...(tone ? { tone } : {}),
      },
    });

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
  // Toggle visibility in the retailer picker, rename, or override tone.
  // Deactivating keeps existing product selections intact while hiding the
  // backdrop from new picks; DELETE (below) removes it outright.
  server.patch('/background-images/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        name: z.string().min(1).max(100).optional(),
        is_active: z.boolean().optional(),
        // F-028 admin override: null clears back to unclassified.
        tone: z.enum(['LIGHT', 'DARK']).nullable().optional(),
      })
      .parse(request.body);

    const existing = await prisma.backgroundImage.findUnique({ where: { id } });
    if (!existing) throw notFound('Background image');

    const row = await prisma.backgroundImage.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
        // Explicit undefined = untouched; null clears the tone.
        ...(body.tone !== undefined ? { tone: body.tone } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'BackgroundImage',
        resource_id: id,
        metadata: {
          before: { name: existing.name, is_active: existing.is_active, tone: existing.tone },
          after: {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
            ...(body.tone !== undefined ? { tone: body.tone } : {}),
          },
        },
        ip_address: request.ip,
      },
    });

    return { data: row };
  });

  // ─── DELETE /admin/background-images/:id ─────────────────────────
  // Hard delete. Product.background_image_id FK is ON DELETE SET NULL, so
  // products currently using this backdrop fall back to Auto — nothing
  // breaks. R2 object cleanup is best-effort.
  server.delete('/background-images/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);

    const existing = await prisma.backgroundImage.findUnique({ where: { id } });
    if (!existing) throw notFound('Background image');

    await prisma.backgroundImage.delete({ where: { id } });

    try {
      await deleteObject(new URL(existing.image_url).pathname.slice(1));
    } catch (err) {
      request.log.warn({ err, id }, 'R2 delete failed for background image');
    }

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'DELETE',
        resource_type: 'BackgroundImage',
        resource_id: id,
        metadata: { name: existing.name, image_url: existing.image_url },
        ip_address: request.ip,
      },
    });

    return { data: { id, deleted: true } };
  });
};
