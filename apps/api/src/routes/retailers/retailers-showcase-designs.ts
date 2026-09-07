// Retailer Suits Designs routes (docs/tasks/suits-designs.md §5).
//
// A retailer manages THEIR OWN designs plus sees (read-only) the global ones
// admin published. Flow per design: mobile compresses + uploads the RAW image
// to R2 (POST /upload-url → PUT), then POSTs {category_id, name, raw_r2_key};
// the server watermarks (§2.5) and stores the final image. Global rows are
// never writable from here — ownership check = retailer_id === self.
//
// Gating: SHOWCASE_DESIGNS PlanFeature (fails closed). Quota: live active
// count vs the plan's SHOWCASE_DESIGNS plan_limits row (delete/inactive frees
// a slot) — see lib/showcase-quota.ts.

import {
  deleteObject,
  getUploadPresignedUrl,
  publicUrl,
  suggestDesignNameAndColor,
} from '@kanchuki/ai';
import { type Prisma, prisma } from '@kanchuki/db';
import { recordAiUsage } from '../../lib/ai-usage.js';
import { R2_PATHS } from '@kanchuki/shared';
import { createId } from '@paralleldrive/cuid2';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hasFeature } from '../../lib/features.js';
import { assertShowcaseQuota, getShowcaseUsage } from '../../lib/showcase-quota.js';
import { watermarkShowcaseDesign } from '../../lib/showcase-watermark.js';
import { featureUnavailable, notFound, validationError } from '../../plugins/error-handler.js';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const CreateSchema = z.object({
  category_id: z.string().min(1),
  name: z.string().min(1).max(150).optional().nullable(),
  raw_r2_key: z.string().min(1),
});

const UpdateSchema = z.object({
  category_id: z.string().min(1).optional(),
  name: z.string().min(1).max(150).optional().nullable(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  // Present only on a photo replace — re-watermarks from the new raw upload.
  raw_r2_key: z.string().min(1).optional(),
});

/**
 * The client hands us the R2 key it PUT the raw upload to. It must be one this
 * retailer's own `upload-url` minted — otherwise a retailer could point
 * `raw_r2_key` at ANY object in the bucket (another store's design, a product
 * photo, an admin asset) and the server would download it, re-watermark it with
 * this retailer's logo, and publish/own it (and later free-delete it on row
 * delete via `original_r2_key`). Scope it to `showcase-designs/<self>/raw/`.
 */
function assertOwnRawKey(rawKey: string, retailerId: string): void {
  const prefix = R2_PATHS.showcaseDesignRaw(retailerId, '');
  if (!rawKey.startsWith(prefix) || rawKey.includes('..')) {
    throw validationError('Invalid upload reference');
  }
}

/** Resolve a design's category and keep the denormalised slug in sync. */
async function categoryForUpdate(categoryId: string): Promise<{ id: string; slug: string }> {
  const category = await prisma.showcaseDesignCategory.findUnique({
    where: { id: categoryId },
    select: { id: true, slug: true },
  });
  if (!category) throw validationError('Unknown design category');
  return category;
}

export const retailersShowcaseDesignRoutes: FastifyPluginAsync = async (server) => {
  const gate = async (retailerId: string): Promise<void> => {
    if (!(await hasFeature(retailerId, 'SHOWCASE_DESIGNS'))) {
      throw featureUnavailable('Suits Designs');
    }
  };

  // ─── GET /me/showcase-designs — own + global, ?category=<slug> ─────
  server.get('/me/showcase-designs', async (request) => {
    await gate(request.retailerId);
    const { category } = request.query as { category?: string };

    const rows = await prisma.showcaseDesign.findMany({
      where: {
        OR: [{ retailer_id: request.retailerId }, { retailer_id: null, is_active: true }],
        ...(category ? { category_slug: category } : {}),
      },
      include: { category: { select: { name: true } } },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'desc' }],
    });

    return {
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        image_url: row.image_url,
        category_id: row.category_id,
        category_slug: row.category_slug,
        category_name: row.category?.name ?? null,
        is_active: row.is_active,
        sort_order: row.sort_order,
        created_at: row.created_at,
        updated_at: row.updated_at,
        // Global rows are admin-published and read-only here.
        owner: row.retailer_id === null ? 'global' : 'self',
      })),
    };
  });

  // ─── GET /me/showcase-designs/categories — active + related links ──
  server.get('/me/showcase-designs/categories', async (request) => {
    await gate(request.retailerId);
    const categories = await prisma.showcaseDesignCategory.findMany({
      where: { is_active: true },
      include: {
        related_to: { select: { id: true, name: true, slug: true } },
        related_from: { select: { id: true, name: true, slug: true } },
      },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    });

    return {
      data: categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        sort_order: c.sort_order,
        // The chips for the Add screen + the "also show" expansion set.
        related: [...c.related_to, ...c.related_from].map((r) => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
        })),
      })),
    };
  });

  // ─── GET /me/showcase-designs/usage — {used, limit} for the badge ──
  server.get('/me/showcase-designs/usage', async (request) => {
    await gate(request.retailerId);
    return { data: await getShowcaseUsage(request.retailerId) };
  });

  // ─── POST /me/showcase-designs/upload-url — presigned raw PUT ──────
  server.post('/me/showcase-designs/upload-url', async (request, reply) => {
    await gate(request.retailerId);
    const body = z
      .object({
        content_type: z.enum(ALLOWED_MIME_TYPES),
        filename: z.string().min(1).max(200),
      })
      .parse(request.body);
    const ext =
      body.content_type === 'image/png'
        ? 'png'
        : body.content_type === 'image/webp'
          ? 'webp'
          : 'jpg';
    const r2Key = R2_PATHS.showcaseDesignRaw(request.retailerId, `${createId()}.${ext}`);

    let uploadUrl: string;
    try {
      uploadUrl = await getUploadPresignedUrl(r2Key, body.content_type, 300);
    } catch {
      throw validationError('Photo storage is not configured. Please contact support.');
    }
    return reply.status(200).send({
      data: { upload_url: uploadUrl, r2_key: r2Key, public_url: publicUrl(r2Key), expires_in: 300 },
    });
  });

  // ─── POST /me/showcase-designs/suggest — AI name + color ──────────
  // Lightweight AI suggestion for the upload screen: given an already-uploaded
  // raw design photo (and optional category), returns a retail-ready name +
  // dominant color (e.g. "Pink Blouse - Deep Neck"). Fail-open — an AI outage
  // or fetch error returns nulls so the retailer can still type a name.
  server.post('/me/showcase-designs/suggest', async (request, reply) => {
    await gate(request.retailerId);
    const body = z
      .object({ raw_r2_key: z.string().min(1) })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    assertOwnRawKey(body.data.raw_r2_key, request.retailerId);

    const suggestion = await suggestDesignNameAndColor(publicUrl(body.data.raw_r2_key), {
      onProviderUsed: recordAiUsage(request.retailerId),
    });
    return reply.status(200).send({ data: suggestion });
  });

  // ─── POST /me/showcase-designs — quota → watermark → create ───────
  server.post('/me/showcase-designs', async (request, reply) => {
    await gate(request.retailerId);
    const body = CreateSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    assertOwnRawKey(body.data.raw_r2_key, request.retailerId);
    await assertShowcaseQuota(request.retailerId);
    const category = await categoryForUpdate(body.data.category_id);

    // Auto-suggest a name when the retailer saved without one (AI, fail-open
    // to null so a blank name never blocks the upload). Reuses the same
    // multi-provider vision call + usage attribution as product tagging.
    let name = body.data.name ?? null;
    if (!name) {
      const suggestion = await suggestDesignNameAndColor(publicUrl(body.data.raw_r2_key), {
        onProviderUsed: recordAiUsage(request.retailerId),
      });
      name = suggestion.name;
    }

    const finalR2Key = R2_PATHS.showcaseDesign(request.retailerId, `${createId()}.jpg`);
    await watermarkShowcaseDesign({
      rawR2Key: body.data.raw_r2_key,
      finalR2Key,
      ownerRetailerId: request.retailerId,
    });

    const row = await prisma.showcaseDesign.create({
      data: {
        retailer_id: request.retailerId,
        category_id: category.id,
        category_slug: category.slug,
        name: name,
        image_url: publicUrl(finalR2Key),
        r2_key: finalR2Key,
        original_r2_key: body.data.raw_r2_key,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'create',
        resource_type: 'ShowcaseDesign',
        resource_id: row.id,
        metadata: { name: row.name, category_slug: row.category_slug },
        ip_address: request.ip,
      },
    });
    return reply.status(201).send({ data: row });
  });

  // ─── PUT /me/showcase-designs/:id — owner-only update/replace ──────
  server.put<{ Params: { id: string } }>('/me/showcase-designs/:id', async (request) => {
    await gate(request.retailerId);
    const body = UpdateSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const existing = await prisma.showcaseDesign.findFirst({
      where: { id: request.params.id, retailer_id: request.retailerId },
    });
    if (!existing) throw notFound('Design'); // global + others' rows are read-only

    const data: Record<string, unknown> = {};
    if (body.data.name !== undefined) data.name = body.data.name;
    if (body.data.is_active !== undefined) data.is_active = body.data.is_active;
    if (body.data.sort_order !== undefined) data.sort_order = body.data.sort_order;

    if (body.data.category_id && body.data.category_id !== existing.category_id) {
      const category = await categoryForUpdate(body.data.category_id);
      data.category_id = category.id;
      data.category_slug = category.slug;
    }

    // Photo replace: watermark the new raw → swap r2_key/image_url, then
    // best-effort delete the OLD final + OLD raw (new raw is the caller's).
    if (body.data.raw_r2_key) {
      assertOwnRawKey(body.data.raw_r2_key, request.retailerId);
      const finalR2Key = R2_PATHS.showcaseDesign(request.retailerId, `${createId()}.jpg`);
      await watermarkShowcaseDesign({
        rawR2Key: body.data.raw_r2_key,
        finalR2Key,
        ownerRetailerId: request.retailerId,
      });
      data.r2_key = finalR2Key;
      data.image_url = publicUrl(finalR2Key);
      data.original_r2_key = body.data.raw_r2_key;
      const oldObjects = [existing.r2_key, existing.original_r2_key].filter(
        (k): k is string => !!k,
      );
      await Promise.all(
        oldObjects.map((k) =>
          deleteObject(k).catch((err) =>
            request.log.warn({ err, key: k }, 'R2 delete failed for replaced design photo'),
          ),
        ),
      );
    }

    const updated = await prisma.showcaseDesign.update({ where: { id: existing.id }, data });
    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'update',
        resource_type: 'ShowcaseDesign',
        resource_id: existing.id,
        metadata: {
          before: {
            name: existing.name,
            category_slug: existing.category_slug,
            is_active: existing.is_active,
          },
          after: data as Prisma.InputJsonValue,
        },
        ip_address: request.ip,
      },
    });
    return { data: updated };
  });

  // ─── DELETE /me/showcase-designs/:id — owner-only hard delete ──────
  server.delete<{ Params: { id: string } }>('/me/showcase-designs/:id', async (request, reply) => {
    await gate(request.retailerId);
    const existing = await prisma.showcaseDesign.findFirst({
      where: { id: request.params.id, retailer_id: request.retailerId },
    });
    if (!existing) throw notFound('Design');

    await prisma.showcaseDesign.delete({ where: { id: existing.id } });

    // Best-effort R2 cleanup — same as product-photo delete.
    const objects = [existing.r2_key, existing.original_r2_key].filter((k): k is string => !!k);
    await Promise.all(
      objects.map((k) =>
        deleteObject(k).catch((err) =>
          request.log.warn({ err, key: k }, 'R2 delete failed for design'),
        ),
      ),
    );

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'delete',
        resource_type: 'ShowcaseDesign',
        resource_id: existing.id,
        metadata: { name: existing.name, category_slug: existing.category_slug },
        ip_address: request.ip,
      },
    });
    return reply.status(204).send();
  });
};
