// Admin Suits Design Category routes (docs/tasks/suits-designs.md §5/§9).
//
// Admin owns the category list AND the category → related-category links
// ("a Saree product also shows Blouse designs" = Saree.related includes
// Blouse). Nothing here is a code map — every link is a row in the implicit
// self-M2M join table (_RelatedShowcaseCategories), written via
// PUT /:id/related. Deleting a category is refused while designs sit in it
// (the FK is RESTRICT) — deactivate instead to hide it from new picks.

import { type Prisma, prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError, notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

const NAME_RE = /^[A-Za-z][A-Za-z0-9 &'()-]{0,99}$/;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const CreateSchema = z.object({
  name: z.string().regex(NAME_RE, 'Name must start with a letter (letters, digits, spaces, & - )'),
  slug: z
    .string()
    .regex(/^[a-z0-9-]{1,60}$/)
    .optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

const UpdateSchema = z.object({
  name: z.string().regex(NAME_RE).optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9-]{1,60}$/)
    .optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

export const adminShowcaseDesignCategoryRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /admin/showcase-design-categories ───────────────────────
  // Full list incl. inactive rows + related links on both sides.
  server.get('/showcase-design-categories', async () => {
    const rows = await prisma.showcaseDesignCategory.findMany({
      include: {
        related_to: { select: { id: true, name: true, slug: true } },
        related_from: { select: { id: true, name: true, slug: true } },
        _count: { select: { designs: true } },
      },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    });
    return {
      data: rows.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        sort_order: c.sort_order,
        is_active: c.is_active,
        design_count: c._count.designs,
        created_at: c.created_at,
        updated_at: c.updated_at,
        // Related is symmetric (self-M2M): dedupe by id across both directions.
        related: [
          ...c.related_to.map((r) => ({ id: r.id, name: r.name, slug: r.slug })),
          ...c.related_from.map((r) => ({ id: r.id, name: r.name, slug: r.slug })),
        ].filter((r, i, all) => all.findIndex((x) => x.id === r.id) === i),
      })),
    };
  });

  // ─── POST /admin/showcase-design-categories ─────────────────────
  server.post('/showcase-design-categories', async (request, reply) => {
    const body = CreateSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const name = body.data.name.trim();
    const slug = body.data.slug ?? slugify(name);

    const clash = await prisma.showcaseDesignCategory.findFirst({
      where: { OR: [{ name }, { slug }] },
      select: { id: true },
    });
    if (clash)
      throw new AppError('CONFLICT', 'A category with this name or slug already exists.', 409);

    const row = await prisma.showcaseDesignCategory.create({
      data: {
        name,
        slug,
        ...(body.data.sort_order !== undefined ? { sort_order: body.data.sort_order } : {}),
        ...(body.data.is_active !== undefined ? { is_active: body.data.is_active } : {}),
      },
    });
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'CREATE',
        resource_type: 'ShowcaseDesignCategory',
        resource_id: row.id,
        metadata: { name: row.name, slug: row.slug },
        ip_address: request.ip,
      },
    });
    return reply.status(201).send({ data: row });
  });

  // ─── PATCH /admin/showcase-design-categories/:id ────────────────
  server.patch('/showcase-design-categories/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = UpdateSchema.safeParse(request.body ?? {});
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const existing = await prisma.showcaseDesignCategory.findUnique({ where: { id } });
    if (!existing) throw notFound('Design category');

    const data: Record<string, unknown> = {};
    let name: string | undefined;
    if (body.data.name !== undefined) name = body.data.name.trim();
    if (name !== undefined && name !== existing.name) {
      const clash = await prisma.showcaseDesignCategory.findFirst({
        where: { name, id: { not: id } },
        select: { id: true },
      });
      if (clash) throw new AppError('CONFLICT', 'A category with this name already exists.', 409);
      data.name = name;
      // Renaming auto-derives a new slug unless admin pinned one.
      if (!body.data.slug) data.slug = slugify(name);
    }
    if (body.data.slug !== undefined && body.data.slug !== existing.slug) {
      const clash = await prisma.showcaseDesignCategory.findFirst({
        where: { slug: body.data.slug, id: { not: id } },
        select: { id: true },
      });
      if (clash) throw new AppError('CONFLICT', 'A category with this slug already exists.', 409);
      data.slug = body.data.slug;
    }
    if (body.data.sort_order !== undefined) data.sort_order = body.data.sort_order;
    if (body.data.is_active !== undefined) data.is_active = body.data.is_active;

    const row = await prisma.showcaseDesignCategory.update({ where: { id }, data });
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'ShowcaseDesignCategory',
        resource_id: id,
        metadata: {
          before: { name: existing.name, slug: existing.slug },
          after: data as Prisma.InputJsonValue,
        },
        ip_address: request.ip,
      },
    });
    return { data: row };
  });

  // ─── PUT /admin/showcase-design-categories/:id/related ──────────
  // Full-replace the related set for one category (idempotent upsert of the
  // implicit self-M2M rows). A category is always implicitly related to
  // itself by the product-resolution logic, so related_ids may omit it.
  server.put('/showcase-design-categories/:id/related', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({ related_ids: z.array(z.string().min(1)).max(50) })
      .safeParse(request.body);
    if (!body.success) throw validationError('related_ids is required (1-50 ids)');

    const existing = await prisma.showcaseDesignCategory.findUnique({ where: { id } });
    if (!existing) throw notFound('Design category');

    // Never trust the client — every related id must be a real category.
    const valid = await prisma.showcaseDesignCategory.findMany({
      where: { id: { in: body.data.related_ids } },
      select: { id: true },
    });
    if (valid.length !== body.data.related_ids.length) {
      throw validationError('One or more related category ids do not exist');
    }

    // Self-M2M via implicit join table: clear BOTH directions (the union of
    // related_to + related_from is what the product resolver expands), then
    // reconnect the new set one-way (A → X). Self is implied by the resolver
    // and never stored as a join row.
    await prisma.showcaseDesignCategory.update({
      where: { id },
      data: { related_to: { set: [] } },
    });
    await prisma.showcaseDesignCategory.update({
      where: { id },
      data: { related_from: { set: [] } },
    });
    const withoutSelf = body.data.related_ids.filter((rid) => rid !== id);
    const row = await prisma.showcaseDesignCategory.update({
      where: { id },
      data: { related_to: { connect: withoutSelf.map((rid) => ({ id: rid })) } },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'UPDATE',
        resource_type: 'ShowcaseDesignCategory',
        resource_id: id,
        metadata: { related: { to: withoutSelf } },
        ip_address: request.ip,
      },
    });
    return { data: { id: row.id, related_ids: withoutSelf } };
  });

  // ─── DELETE /admin/showcase-design-categories/:id ───────────────
  // FK from showcase_designs is RESTRICT — refuse while designs exist;
  // deactivate instead to hide the category from new picks.
  server.delete('/showcase-design-categories/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await prisma.showcaseDesignCategory.findUnique({
      where: { id },
      include: { _count: { select: { designs: true } } },
    });
    if (!existing) throw notFound('Design category');
    if (existing._count.designs > 0) {
      throw validationError('This category still has designs — deactivate it instead of deleting');
    }

    await prisma.showcaseDesignCategory.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        actor_type: 'admin',
        action: 'DELETE',
        resource_type: 'ShowcaseDesignCategory',
        resource_id: id,
        metadata: { name: existing.name, slug: existing.slug },
        ip_address: request.ip,
      },
    });
    return { data: { id, deleted: true } };
  });
};
