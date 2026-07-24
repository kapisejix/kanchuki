import { getUploadPresignedUrl, publicUrl } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { R2_PATHS } from '@kanchuki/shared';
import { createId } from '@paralleldrive/cuid2';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../plugins/error-handler.js';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const CreateCategorySchema = z.object({
  name: z.string().min(1).max(100),
  image_url: z.string().url().optional(),
  image_r2_key: z.string().optional(),
});

const UpdateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  image_url: z.string().url().nullable().optional(),
  image_r2_key: z.string().nullable().optional(),
  sort_order: z.number().int().optional(),
});

export const categoryRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /categories/upload-url ─────────────────────────────────
  server.post('/upload-url', async (request, reply) => {
    const body = z
      .object({
        filename: z.string().min(1).max(255),
        content_type: z.enum(ALLOWED_MIME_TYPES),
        size_bytes: z.number().int().min(1).max(5_000_000),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const { content_type } = body.data;
    const ext =
      content_type === 'image/png' ? 'png' : content_type === 'image/webp' ? 'webp' : 'jpg';
    const r2Key = R2_PATHS.categoryImage(request.retailerId, `${createId()}.${ext}`);

    let uploadUrl: string;
    try {
      uploadUrl = await getUploadPresignedUrl(r2Key, content_type, 300);
    } catch {
      throw validationError('Photo storage is not configured. Please contact support.');
    }

    return reply.status(200).send({
      data: { upload_url: uploadUrl, r2_key: r2Key, public_url: publicUrl(r2Key), expires_in: 300 },
    });
  });

  // ─── POST /categories ─────────────────────────────────────────────
  server.post('/', async (request, reply) => {
    const body = CreateCategorySchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const existing = await prisma.productCategory.findUnique({
      where: { retailer_id_name: { retailer_id: request.retailerId, name: body.data.name } },
    });
    if (existing) throw validationError('A category with this name already exists', 'name');

    const category = await prisma.productCategory.create({
      data: {
        retailer_id: request.retailerId,
        name: body.data.name,
        image_url: body.data.image_url,
        image_r2_key: body.data.image_r2_key,
      },
    });

    return reply.status(201).send({ data: category });
  });

  // ─── GET /categories ───────────────────────────────────────────────
  server.get('/', async (request) => {
    const categories = await prisma.productCategory.findMany({
      where: { retailer_id: request.retailerId },
      include: { _count: { select: { products: true } } },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });

    return {
      data: categories.map((c) => ({ ...c, product_count: c._count.products, _count: undefined })),
    };
  });

  // ─── GET /categories/:id ────────────────────────────────────────────
  server.get('/:id', async (request) => {
    const { id } = request.params as { id: string };

    const category = await prisma.productCategory.findFirst({
      where: { id, retailer_id: request.retailerId },
      include: { _count: { select: { products: true } } },
    });
    if (!category) throw notFound('Category');

    return { data: { ...category, product_count: category._count.products, _count: undefined } };
  });

  // ─── PATCH /categories/:id ──────────────────────────────────────────
  server.patch('/:id', async (request) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.productCategory.findFirst({
      where: { id, retailer_id: request.retailerId },
    });
    if (!existing) throw notFound('Category');

    const body = UpdateCategorySchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    if (body.data.name && body.data.name !== existing.name) {
      const clash = await prisma.productCategory.findUnique({
        where: { retailer_id_name: { retailer_id: request.retailerId, name: body.data.name } },
      });
      if (clash) throw validationError('A category with this name already exists', 'name');
    }

    const updated = await prisma.productCategory.update({ where: { id }, data: body.data });
    return { data: updated };
  });

  // ─── DELETE /categories/:id ─────────────────────────────────────────
  // Products in this category are not deleted — category_id is cleared via
  // the FK's ON DELETE SET NULL (see 030_product_categories migration).
  server.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.productCategory.findFirst({
      where: { id, retailer_id: request.retailerId },
    });
    if (!existing) throw notFound('Category');

    await prisma.productCategory.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ─── POST /categories/:id/products ─────────────────────────────────
  // Bulk-assign existing products to this category (mirrors bulk-delete in products.ts).
  server.post('/:id/products', async (request, reply) => {
    const { id } = request.params as { id: string };

    const category = await prisma.productCategory.findFirst({
      where: { id, retailer_id: request.retailerId },
    });
    if (!category) throw notFound('Category');

    const body = z
      .object({ product_ids: z.array(z.string().min(1)).min(1).max(200) })
      .safeParse(request.body);
    if (!body.success) throw validationError('Provide 1-200 product ids');

    const result = await prisma.product.updateMany({
      where: { id: { in: body.data.product_ids }, retailer_id: request.retailerId, deleted_at: null },
      data: { category_id: id },
    });

    return reply.status(200).send({ data: { assigned_count: result.count } });
  });
};
