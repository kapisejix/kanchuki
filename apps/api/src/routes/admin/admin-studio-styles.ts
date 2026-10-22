// Admin-managed AI Studio Shoot style catalog (studio_styles table).
// Mirrors admin-media.ts (background-images library): presigned R2 upload,
// status toggle, audit-logged CRUD. The retailer-facing read is a separate
// plan-filtered endpoint (products-studio.ts GET /studio-styles).
import { createHash } from 'node:crypto';
import { deleteObject, getUploadPresignedUrl, publicUrl } from '@kanchuki/ai';
import { type Prisma, prisma } from '@kanchuki/db';
import { R2_PATHS, STUDIO_ENGINES } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  IMAGE_KINDS,
  stagingKey,
  verifyUpload,
  UPLOAD_URL_RATE_LIMIT,
} from '../../lib/upload-guard.js';
import { AppError, notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

/** Real image under the admin thumbnail prefix → server-built public URL + final key. */
function verifyThumb(r2Key: string) {
  return verifyUpload({
    r2Key,
    allowed: IMAGE_KINDS,
    maxBytes: 10_000_000,
    prefix: R2_PATHS.studioStyleThumb(''),
  });
}

const SLUG = /^[a-z0-9_]{2,40}$/;
// Shared with the other three surfaces that validate/render this list — see
// STUDIO_ENGINES in @kanchuki/shared for why it is not a local literal.
const ENGINES = STUDIO_ENGINES;
const DEMOS = ['womens', 'mens', 'teen_girl', 'teen_boy', 'kids_girl', 'kids_boy'] as const;
const PLANS = ['STARTER', 'GROWTH', 'PRO'] as const;

const CreateSchema = z.object({
  slug: z.string().regex(SLUG, 'slug must be lowercase letters, digits, underscore (2-40 chars)'),
  label: z.string().min(1).max(100),
  description: z.string().min(1).max(300),
  prompt: z.string().min(1).max(4000),
  tab: z.enum(['PRODUCT', 'MODEL']),
  status: z.enum(['DRAFT', 'PUBLISHED', 'HIDDEN']).default('DRAFT'),
  plans: z.array(z.enum(PLANS)).default([]),
  engine: z.enum(ENGINES).nullable().optional(),
  audience: z.array(z.enum(DEMOS)).default([]),
  // thumbnail_url is never taken from the client: it is built from the verified key.
  thumbnail_r2_key: z.string().optional(),
  sort_order: z.number().int().min(0).default(0),
});

const PatchSchema = z.object({
  slug: z.string().optional(), // accepted only if unchanged; else 422
  label: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(300).optional(),
  prompt: z.string().min(1).max(4000).optional(),
  tab: z.enum(['PRODUCT', 'MODEL']).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'HIDDEN']).optional(),
  plans: z.array(z.enum(PLANS)).optional(),
  engine: z.enum(ENGINES).nullable().optional(),
  audience: z.array(z.enum(DEMOS)).optional(),
  thumbnail_r2_key: z.string().nullable().optional(), // null clears the thumbnail
  sort_order: z.number().int().min(0).optional(),
});

export const adminStudioStylesRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/studio-styles ──────────────────────────────────
  // Full library incl. DRAFT / HIDDEN — admin needs to see everything.
  server.get('/studio-styles', async () => {
    const rows = await prisma.studioStyle.findMany({
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
    return { data: rows };
  });

  // ─── POST /admin/studio-styles/thumbnail-url ───────────────────
  // Presigned PUT so the admin panel uploads the sample-output image
  // straight to R2 (verbatim shape of background-images/upload-url).
  server.post('/studio-styles/thumbnail-url', UPLOAD_URL_RATE_LIMIT, async (request) => {
    const body = z
      .object({
        content_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        filename: z.string().min(1).max(200),
        // Exact byte length of the PUT, bound into the signature (RC-080). Same max as verifyUpload.
        content_length: z.number().int().min(1).max(10_000_000).optional(),
      })
      .parse(request.body);
    const ext = body.content_type.split('/')[1];
    const r2Key = stagingKey(
      R2_PATHS.studioStyleThumb(
        `${createHash('sha256')
          .update(body.filename + Date.now())
          .digest('hex')
          .slice(0, 16)}.${ext}`,
      ),
    );
    const uploadUrl = await getUploadPresignedUrl(
      r2Key,
      body.content_type,
      300,
      body.content_length,
    );
    return {
      data: { upload_url: uploadUrl, r2_key: r2Key, public_url: publicUrl(r2Key), expires_in: 300 },
    };
  });

  // ─── POST /admin/studio-styles ─────────────────────────────────
  server.post('/studio-styles', async (request, reply) => {
    const body = CreateSchema.parse(request.body);
    const dupe = await prisma.studioStyle.findFirst({ where: { slug: body.slug } });
    if (dupe) throw new AppError('CONFLICT', 'A style with this slug already exists.', 409);
    const thumb = body.thumbnail_r2_key ? await verifyThumb(body.thumbnail_r2_key) : null;

    const row = await prisma.studioStyle.create({
      data: {
        slug: body.slug,
        label: body.label,
        description: body.description,
        prompt: body.prompt,
        tab: body.tab,
        status: body.status,
        plans: body.plans,
        engine: body.engine ?? null,
        audience: body.audience,
        ...(thumb ? { thumbnail_url: thumb.url, thumbnail_r2_key: thumb.r2Key } : {}),
        sort_order: body.sort_order,
      },
    });
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'CREATE',
        resource_type: 'StudioStyle',
        resource_id: row.id,
        metadata: { slug: row.slug, label: row.label, tab: row.tab },
        ip_address: request.ip,
      },
    });
    return reply.status(201).send({ data: row });
  });

  // ─── PATCH /admin/studio-styles/:id ────────────────────────────
  server.patch('/studio-styles/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = PatchSchema.parse(request.body ?? {});
    const existing = await prisma.studioStyle.findUnique({ where: { id } });
    if (!existing) throw notFound('Studio style');
    if (body.slug !== undefined && body.slug !== existing.slug) {
      throw validationError('slug is immutable after creation', 'slug');
    }

    const data: Record<string, unknown> = {};
    for (const k of [
      'label',
      'description',
      'prompt',
      'tab',
      'status',
      'plans',
      'audience',
      'sort_order',
    ] as const) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    if (body.engine !== undefined) data.engine = body.engine; // null clears
    if (body.thumbnail_r2_key !== undefined) {
      const thumb = body.thumbnail_r2_key ? await verifyThumb(body.thumbnail_r2_key) : null;
      data.thumbnail_r2_key = thumb?.r2Key ?? null;
      data.thumbnail_url = thumb?.url ?? null;
    }

    const row = await prisma.studioStyle.update({ where: { id }, data });
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'StudioStyle',
        resource_id: id,
        metadata: {
          before: { status: existing.status, plans: existing.plans },
          after: data as Prisma.InputJsonValue,
        },
        ip_address: request.ip,
      },
    });
    return { data: row };
  });

  // ─── DELETE /admin/studio-styles/:id ───────────────────────────
  // Hard delete. No FK from ProductPhoto (studio provenance is metadata
  // JSON), so past generations keep their metadata. R2 thumb cleanup is
  // best-effort.
  server.delete('/studio-styles/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.studioStyle.findUnique({ where: { id } });
    if (!existing) throw notFound('Studio style');
    await prisma.studioStyle.delete({ where: { id } });
    if (existing.thumbnail_r2_key) {
      try {
        await deleteObject(existing.thumbnail_r2_key);
      } catch (err) {
        request.log.warn({ err, id }, 'R2 thumb delete failed for studio style');
      }
    }
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'DELETE',
        resource_type: 'StudioStyle',
        resource_id: id,
        metadata: { slug: existing.slug, label: existing.label },
        ip_address: request.ip,
      },
    });
    return { data: { id, deleted: true } };
  });
};
