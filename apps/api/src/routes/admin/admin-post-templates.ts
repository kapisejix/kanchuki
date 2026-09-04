// Admin-managed post templates (post_templates table) — Create Post Composer
// v2 addendum §11 (docs/tasks/social-create-post-composer.md).
// Mirrors admin-studio-styles.ts: presigned R2 thumbnail upload, status
// toggle, plan assignment, audit-logged CRUD. The retailer-facing read is a
// separate plan-filtered endpoint (T-9.3 GET /v1/post-templates).
import { createHash } from 'node:crypto';
import { deleteObject, getUploadPresignedUrl, publicUrl } from '@kanchuki/ai';
import { type Prisma, prisma } from '@kanchuki/db';
import { R2_PATHS } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

const PLANS = ['STARTER', 'GROWTH', 'PRO'] as const;
const POST_TYPES = ['SINGLE_PRODUCT', 'COLLECTION_LINK', 'CAROUSEL'] as const;

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(300).nullable().optional(),
  context: z.enum(['POST', 'CAMPAIGN', 'BOTH']).default('POST'),
  post_type: z.enum(POST_TYPES).nullable().optional(),
  caption_template: z.string().min(1).max(2200),
  hashtags: z.array(z.string().min(1).max(100)).max(30).default([]),
  occasion: z.string().max(60).nullable().optional(),
  thumbnail_url: z.string().url().nullable().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'HIDDEN']).default('DRAFT'),
  plans: z.array(z.enum(PLANS)).default([]),
  sort_order: z.number().int().min(0).default(0),
});

const PatchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(300).nullable().optional(),
  context: z.enum(['POST', 'CAMPAIGN', 'BOTH']).optional(),
  post_type: z.enum(POST_TYPES).nullable().optional(),
  caption_template: z.string().min(1).max(2200).optional(),
  hashtags: z.array(z.string().min(1).max(100)).max(30).optional(),
  occasion: z.string().max(60).nullable().optional(),
  thumbnail_url: z.string().url().nullable().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'HIDDEN']).optional(),
  plans: z.array(z.enum(PLANS)).optional(),
  sort_order: z.number().int().min(0).optional(),
});

export const adminPostTemplatesRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/post-templates ─────────────────────────────────
  // Full library incl. DRAFT / HIDDEN — admin needs to see everything.
  server.get('/post-templates', async () => {
    const rows = await prisma.postTemplate.findMany({
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
    return { data: rows };
  });

  // ─── POST /admin/post-templates/thumbnail-url ──────────────────
  // Presigned PUT so the admin panel uploads the preview thumbnail
  // straight to R2 (verbatim shape of studio-styles/thumbnail-url).
  server.post('/post-templates/thumbnail-url', async (request) => {
    const body = z
      .object({
        content_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        filename: z.string().min(1).max(200),
      })
      .parse(request.body);
    const ext = body.content_type.split('/')[1];
    const r2Key = R2_PATHS.postTemplateThumb(
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

  // ─── POST /admin/post-templates ────────────────────────────────
  server.post('/post-templates', async (request, reply) => {
    const body = CreateSchema.parse(request.body);
    const row = await prisma.postTemplate.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        context: body.context,
        post_type: body.post_type ?? null,
        caption_template: body.caption_template,
        hashtags: body.hashtags,
        occasion: body.occasion ?? null,
        thumbnail_url: body.thumbnail_url ?? null,
        status: body.status,
        plans: body.plans,
        sort_order: body.sort_order,
      },
    });
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'CREATE',
        resource_type: 'PostTemplate',
        resource_id: row.id,
        metadata: { name: row.name, context: row.context, status: row.status },
        ip_address: request.ip,
      },
    });
    return reply.status(201).send({ data: row });
  });

  // ─── PATCH /admin/post-templates/:id ───────────────────────────
  server.patch('/post-templates/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = PatchSchema.parse(request.body ?? {});
    const existing = await prisma.postTemplate.findUnique({ where: { id } });
    if (!existing) throw notFound('Post template');

    const data: Record<string, unknown> = {};
    for (const k of [
      'name',
      'context',
      'post_type',
      'caption_template',
      'hashtags',
      'status',
      'plans',
      'sort_order',
    ] as const) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    // Nullable fields: undefined = leave as-is, null = clear.
    if (body.description !== undefined) data.description = body.description;
    if (body.occasion !== undefined) data.occasion = body.occasion;
    if (body.thumbnail_url !== undefined) data.thumbnail_url = body.thumbnail_url;

    const row = await prisma.postTemplate.update({ where: { id }, data });
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'PostTemplate',
        resource_id: id,
        metadata: {
          before: { status: existing.status, plans: existing.plans, context: existing.context },
          after: data as Prisma.InputJsonValue,
        },
        ip_address: request.ip,
      },
    });
    return { data: row };
  });

  // ─── DELETE /admin/post-templates/:id ──────────────────────────
  // Hard delete. No FK references — social_posts/campaigns snapshot the
  // resolved text, so history survives. R2 thumbnail cleanup is skipped: the
  // thumbnail public URL is not tied to a persisted R2 key.
  server.delete('/post-templates/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.postTemplate.findUnique({ where: { id } });
    if (!existing) throw notFound('Post template');
    await prisma.postTemplate.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'DELETE',
        resource_type: 'PostTemplate',
        resource_id: id,
        metadata: { name: existing.name, context: existing.context },
        ip_address: request.ip,
      },
    });
    return { data: { id, deleted: true } };
  });
};