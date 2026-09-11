// Admin Suits Designs routes (docs/tasks/suits-designs.md §5) — cloned from
// admin-design-references.ts, extended with the watermark create path.
//
// - Default owner is GLOBAL (retailer_id = NULL) → shown on every storefront.
// - ?scope=global|retailer (+ optional retailer_id) filters the list; the
//   admin can also publish a design UNDER a retailer (e.g. moderation) by
//   passing retailer_id on create.
// - Create watermarks server-side with the same pipeline as the retailer
//   route (lib/showcase-watermark.ts), owner = the design's retailer or null.
// - DELETE hard-removes the row + both R2 objects (best effort).

import { createHash } from 'node:crypto';
import {
  deleteObject,
  getUploadPresignedUrl,
  publicUrl,
  suggestDesignNameAndColor,
} from '@kanchuki/ai';
import { type Prisma, prisma } from '@kanchuki/db';
import { R2_PATHS } from '@kanchuki/shared';
import { createId } from '@paralleldrive/cuid2';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { watermarkShowcaseDesign } from '../../lib/showcase-watermark.js';
import { notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const CreateSchema = z.object({
  category_id: z.string().min(1),
  name: z.string().min(1).max(150).optional().nullable(),
  raw_r2_key: z.string().min(1),
  retailer_id: z.string().min(1).optional().nullable(), // null/absent = global
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

const UpdateSchema = z.object({
  category_id: z.string().min(1).optional(),
  name: z.string().min(1).max(150).optional().nullable(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  retailer_id: z.string().min(1).nullable().optional(),
  // Photo replace — re-watermarks from the new raw upload.
  raw_r2_key: z.string().min(1).optional(),
});

// `raw_r2_key` is client-supplied — keep it inside the Suits Designs namespace
// (and no path traversal) so a create/replace can't be pointed at an arbitrary
// bucket object to watermark + republish, or at a victim key that a later row
// delete would then free.
function assertShowcaseRawKey(rawKey: string): void {
  if (!rawKey.startsWith('showcase-designs/') || rawKey.includes('..')) {
    throw validationError('Invalid upload reference');
  }
}

async function categoryForWrite(categoryId: string): Promise<{ id: string; slug: string }> {
  const category = await prisma.showcaseDesignCategory.findUnique({
    where: { id: categoryId },
    select: { id: true, slug: true },
  });
  if (!category) throw validationError('Unknown design category');
  return category;
}

export const adminShowcaseDesignRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/showcase-designs ─────────────────────────────────
  // ?scope=global|retailer&retailer_id=<id>&category=<slug> — full library,
  // including inactive rows (admin must see what's hidden to re-activate).
  server.get('/showcase-designs', async (request) => {
    const { scope, retailer_id, category } = request.query as {
      scope?: string;
      retailer_id?: string;
      category?: string;
    };

    const where: Record<string, unknown> = {};
    if (category) where.category_slug = category;
    if (scope === 'global') {
      where.retailer_id = null;
    } else if (scope === 'retailer') {
      where.retailer_id = retailer_id ?? { not: null };
    } else if (retailer_id) {
      where.retailer_id = retailer_id;
    }

    const rows = await prisma.showcaseDesign.findMany({
      where,
      include: {
        category: { select: { name: true } },
        retailer: { select: { id: true, shop_name: true } },
      },
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
        owner:
          row.retailer_id === null
            ? { type: 'global' }
            : {
                type: 'retailer',
                id: row.retailer_id,
                shop_name: row.retailer?.shop_name ?? null,
              },
      })),
    };
  });

  // ─── GET /admin/showcase-designs/stats ────────────────────────────
  server.get('/showcase-designs/stats', async () => {
    const [total, active, globalCount, retailerCount, byCategory] = await Promise.all([
      prisma.showcaseDesign.count(),
      prisma.showcaseDesign.count({ where: { is_active: true } }),
      prisma.showcaseDesign.count({ where: { retailer_id: null } }),
      prisma.showcaseDesign.count({ where: { retailer_id: { not: null } } }),
      prisma.showcaseDesign.groupBy({ by: ['category_slug'], _count: { id: true } }),
    ]);
    return {
      data: {
        total,
        active,
        inactive: total - active,
        global: globalCount,
        retailer: retailerCount,
        by_category: byCategory.map((c) => ({
          category_slug: c.category_slug,
          count: c._count.id,
        })),
      },
    };
  });

  // ─── GET /admin/showcase-designs/owners ───────────────────────────
  // Distinct retailers that own ≥1 showcase design (any active state — the
  // admin moderates hidden rows too). Feeds the retailer-scope Owner filter
  // on the admin panel: shop_name + count resolve server-side so the panel
  // never guesses labels or paginates a list to find them.
  server.get('/showcase-designs/owners', async () => {
    const groups = await prisma.showcaseDesign.groupBy({
      by: ['retailer_id'],
      where: { retailer_id: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { retailer_id: 'desc' } },
    });
    const ids = groups.map((g) => g.retailer_id).filter((id): id is string => id !== null);
    const retailers =
      ids.length === 0
        ? []
        : await prisma.retailer.findMany({
            where: { id: { in: ids } },
            select: { id: true, shop_name: true },
          });
    const shopNames = new Map(retailers.map((r) => [r.id, r.shop_name]));
    return {
      data: groups
        .filter((g) => g.retailer_id !== null)
        .map((g) => ({
          id: g.retailer_id as string,
          shop_name: shopNames.get(g.retailer_id as string) ?? null,
          design_count: g._count._all,
        })),
    };
  });

  // ─── GET /admin/showcase-designs/:id ──────────────────────────────
  server.get('/showcase-designs/:id', async (request) => {
    const { id } = request.params as { id: string };
    const row = await prisma.showcaseDesign.findUnique({
      where: { id },
      include: { category: { select: { name: true } } },
    });
    if (!row) throw notFound('Design');
    return { data: row };
  });

  // ─── POST /admin/showcase-designs/upload-url ─────────────────────
  // Presigned PUT so the admin panel uploads the raw image straight to R2
  // (global path — retailer-scoped uploads happen in the retailer flow).
  server.post('/showcase-designs/upload-url', async (request) => {
    const body = z
      .object({ content_type: z.enum(ALLOWED_MIME_TYPES), filename: z.string().min(1).max(200) })
      .parse(request.body);
    const ext =
      body.content_type === 'image/png'
        ? 'png'
        : body.content_type === 'image/webp'
          ? 'webp'
          : 'jpg';
    const r2Key = R2_PATHS.showcaseDesignRaw(
      'global',
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

  // ─── POST /admin/showcase-designs/suggest — AI name + color ───────
  // Admin equivalent of the retailer suggest route: pre-fill the upload form
  // with an AI-generated retail-ready name + dominant color (e.g.
  // "Pink Blouse - Deep Neck") from an already-uploaded raw design photo.
  // Fail-open — an AI outage returns nulls so the admin can type a name.
  server.post('/showcase-designs/suggest', async (request, reply) => {
    const body = z.object({ raw_r2_key: z.string().min(1) }).safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');
    assertShowcaseRawKey(body.data.raw_r2_key);
    const suggestion = await suggestDesignNameAndColor(publicUrl(body.data.raw_r2_key));
    return reply.status(200).send({ data: suggestion });
  });

  // ─── POST /admin/showcase-designs ────────────────────────────────
  // Create runs the same watermark step the retailer route runs — owner is
  // retailer_id when provided (design shown under that store), else global.
  // A missing name is auto-filled by AI (fail-open to null).
  server.post('/showcase-designs', async (request, reply) => {
    const body = CreateSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    assertShowcaseRawKey(body.data.raw_r2_key);
    const category = await categoryForWrite(body.data.category_id);
    let name = body.data.name ?? null;
    if (!name) {
      const suggestion = await suggestDesignNameAndColor(publicUrl(body.data.raw_r2_key));
      name = suggestion.name;
    }
    const ownerRetailerId = body.data.retailer_id ?? null;
    if (ownerRetailerId) {
      const retailer = await prisma.retailer.findUnique({
        where: { id: ownerRetailerId },
        select: { id: true },
      });
      if (!retailer) throw validationError('Unknown retailer');
    }

    const ownerKey = ownerRetailerId ?? 'global';
    const finalR2Key = R2_PATHS.showcaseDesign(ownerKey, `${createId()}.jpg`);
    await watermarkShowcaseDesign({ rawR2Key: body.data.raw_r2_key, finalR2Key, ownerRetailerId });

    const row = await prisma.showcaseDesign.create({
      data: {
        retailer_id: ownerRetailerId,
        category_id: category.id,
        category_slug: category.slug,
        name: name,
        image_url: publicUrl(finalR2Key),
        r2_key: finalR2Key,
        original_r2_key: body.data.raw_r2_key,
        ...(body.data.is_active !== undefined ? { is_active: body.data.is_active } : {}),
        ...(body.data.sort_order !== undefined ? { sort_order: body.data.sort_order } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'CREATE',
        resource_type: 'ShowcaseDesign',
        resource_id: row.id,
        metadata: {
          name: row.name,
          category_slug: row.category_slug,
          owner: ownerRetailerId ?? 'global',
        },
        ip_address: request.ip,
      },
    });
    return reply.status(201).send({ data: row });
  });

  // ─── PATCH /admin/showcase-designs/:id ───────────────────────────
  // Rename / recategorise / toggle active / reassign owner / replace photo.
  server.patch('/showcase-designs/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = UpdateSchema.safeParse(request.body ?? {});
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const existing = await prisma.showcaseDesign.findUnique({ where: { id } });
    if (!existing) throw notFound('Design');

    const data: Record<string, unknown> = {};
    if (body.data.name !== undefined) data.name = body.data.name;
    if (body.data.is_active !== undefined) data.is_active = body.data.is_active;
    if (body.data.sort_order !== undefined) data.sort_order = body.data.sort_order;
    if (body.data.retailer_id !== undefined) {
      if (body.data.retailer_id !== null) {
        const retailer = await prisma.retailer.findUnique({
          where: { id: body.data.retailer_id },
          select: { id: true },
        });
        if (!retailer) throw validationError('Unknown retailer');
      }
      data.retailer_id = body.data.retailer_id;
    }
    if (body.data.category_id && body.data.category_id !== existing.category_id) {
      const category = await categoryForWrite(body.data.category_id);
      data.category_id = category.id;
      data.category_slug = category.slug;
    }

    if (body.data.raw_r2_key) {
      assertShowcaseRawKey(body.data.raw_r2_key);
      const ownerKey = (data.retailer_id as string | null) ?? existing.retailer_id ?? 'global';
      const finalR2Key = R2_PATHS.showcaseDesign(ownerKey, `${createId()}.jpg`);
      await watermarkShowcaseDesign({
        rawR2Key: body.data.raw_r2_key,
        finalR2Key,
        ownerRetailerId: ownerKey === 'global' ? null : ownerKey,
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

    const row = await prisma.showcaseDesign.update({ where: { id: existing.id }, data });
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
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
    return { data: row };
  });

  // ─── DELETE /admin/showcase-designs/:id ───────────────────────────
  server.delete('/showcase-designs/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.showcaseDesign.findUnique({ where: { id } });
    if (!existing) throw notFound('Design');

    await prisma.showcaseDesign.delete({ where: { id: existing.id } });

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
        actor_type: 'admin',
        action: 'DELETE',
        resource_type: 'ShowcaseDesign',
        resource_id: existing.id,
        metadata: { name: existing.name, category_slug: existing.category_slug },
        ip_address: request.ip,
      },
    });
    return { data: { id, deleted: true } };
  });
};
