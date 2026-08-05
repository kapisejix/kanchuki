// Auto-split from products.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { MATCH_SIMILARITY_THRESHOLD, MIN_CONFIDENCE_FOR_MATCHING } from '@kanchuki/ai';
import { type Prisma, prisma, vaultDelete } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { addEmbeddingJob, addTaggingJob } from '../../jobs/index.js';
import { NEW_ARRIVAL_DAYS, isNewArrival } from '../../lib/product-flags.js';
import { checkQuota, incrementUsage } from '../../lib/quota.js';
import {
  forbidden,
  notFound,
  planLimitExceeded,
  validationError,
} from '../../plugins/error-handler.js';
import {
  CreateProductSchema,
  ListProductsQuerySchema,
  UpdateProductSchema,
  photoUrlToDisplay,
  revalidateCollectionsForProduct,
} from './products-helpers.js';

export const productsCrudRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /products ─────────────────────────────────────────────
  server.post('/', async (request, reply) => {
    const retailerId = request.retailerId;

    const retailer = await prisma.retailer.findUniqueOrThrow({
      where: { id: retailerId },
      select: { max_products: true },
    });
    const currentCount = await prisma.product.count({
      where: { retailer_id: retailerId, deleted_at: null },
    });
    if (currentCount >= retailer.max_products) {
      throw planLimitExceeded('products');
    }
    // F-010: generalized quota gate — seed-plan-limits.ts seeds a real
    // PRODUCT_UPLOAD row per plan (LIFETIME cap mirroring max_products), so
    // this is live enforcement, not a no-op. Kept alongside the max_products
    // check above (which stays authoritative for the exact number) since
    // this is also what RetailerLimitOverride/addon purchases hook into.
    await checkQuota(retailerId, 'PRODUCT_UPLOAD');

    const body = CreateProductSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const { photo_r2_key, photo_url, metadata, auto_cleanup, ...rest } = body.data;

    if (rest.section_id) {
      const section = await prisma.storeSection.findFirst({
        where: { id: rest.section_id, retailer_id: retailerId },
      });
      if (!section) throw forbidden('Section does not belong to your store');
    }
    if (rest.category_id) {
      const cat = await prisma.productCategory.findFirst({
        where: { id: rest.category_id, retailer_id: retailerId },
      });
      if (!cat) throw forbidden('Category does not belong to your store');
    }

    let product: Awaited<ReturnType<typeof prisma.product.create>>;
    try {
      product = await prisma.product.create({
        data: {
          retailer_id: retailerId,
          metadata: metadata !== undefined ? (metadata as Prisma.InputJsonValue) : undefined,
          ...rest,
          photos: {
            create: [
              { url: photo_url, r2_key: photo_r2_key, is_primary: true, retailer_id: retailerId },
            ],
          },
        },
        include: { photos: true, section: { select: { name: true } } },
      });
    } catch (err) {
      if ((err as { code?: string } | null)?.code === 'P2002') {
        throw validationError('This SKU is already in use', 'sku');
      }
      throw err;
    }

    // Best-effort — a failed usage-counter write shouldn't fail an upload
    // that already succeeded.
    incrementUsage(retailerId, 'PRODUCT_UPLOAD').catch((err) => {
      request.log.error({ err, product_id: product.id }, 'Failed to record product-upload usage');
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: retailerId,
        action: 'create',
        resource_type: 'Product',
        resource_id: product.id,
        metadata: {
          category: product.category,
          primary_color: product.primary_color,
        },
        ip_address: request.ip,
      },
    });

    // Fire-and-forget: if Redis/BullMQ is down the tagging job won't block
    // product creation. We set ai_tag_error so the UI shows a failure banner
    // instead of spinning "AI tagging in progress..." forever.
    addTaggingJob({
      product_id: product.id,
      retailer_id: retailerId,
      photo_url,
      r2_key: photo_r2_key,
      auto_cleanup,
    }).catch(async (err) => {
      request.log.error({ err, product_id: product.id }, 'Failed to queue tagging job');
      try {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            ai_tagged: false,
            ai_tag_error: 'Background AI tagging unavailable — try again later',
          },
        });
      } catch {}
    });

    return reply.status(201).send({ data: product });
  });

  // ─── GET /products ──────────────────────────────────────────────
  server.get('/', async (request) => {
    const query = ListProductsQuerySchema.safeParse(request.query);
    if (!query.success) throw validationError(query.error.issues[0]?.message ?? 'Invalid query');

    const { status, category, category_id, cursor, limit, is_new_arrival, sku } = query.data;

    // When is_new_arrival filter is active, compute the cutoff date so the
    // query only returns products created within the last 30 days — no cron,
    // no migration, no stored flag. This is a derived, time-sensitive filter
    // that automatically expires as products age past the window.
    const arrivalCutoff = is_new_arrival
      ? (() => {
          const d = new Date();
          d.setDate(d.getDate() - NEW_ARRIVAL_DAYS);
          return d;
        })()
      : undefined;

    const products = await prisma.product.findMany({
      where: {
        retailer_id: request.retailerId,
        deleted_at: null,
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
        ...(category_id ? { category_id } : {}),
        ...(arrivalCutoff ? { created_at: { gte: arrivalCutoff } } : {}),
        // SKUs are stored uppercase — normalize what the scanner read
        ...(sku ? { sku: sku.toUpperCase() } : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      include: {
        photos: { where: { is_primary: true }, take: 1 },
        section: { select: { name: true } },
      },
      orderBy: { created_at: 'desc' },
      take: limit + 1,
    });

    const hasMore = products.length > limit;
    const page = hasMore ? products.slice(0, limit) : products;

    const data = await Promise.all(
      page.map(async (p) => ({
        ...p,
        primary_photo_url: await photoUrlToDisplay(
          p.photos[0]
            ? { url: p.photos[0].url, r2_key: (p.photos[0] as { r2_key?: string }).r2_key ?? null }
            : null,
        ),
        is_new_arrival: isNewArrival(p.created_at),
        photos: undefined,
      })),
    );

    return {
      data,
      pagination: {
        cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        has_more: hasMore,
      },
    };
  });

  // ─── GET /products/:id ──────────────────────────────────────────
  server.get('/:id', async (request) => {
    const { id } = request.params as { id: string };

    const product = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
      include: {
        photos: { orderBy: { sort_order: 'asc' } },
        spin_frames: { orderBy: { frame_index: 'asc' } },
        variants: true,
        section: { select: { name: true } },
      },
    });
    if (!product) throw notFound('Product');

    // Generate presigned URLs for all photos
    const photosWithUrls = await Promise.all(
      (product.photos ?? []).map(async (photo) => ({
        ...photo,
        url: (await photoUrlToDisplay({ url: photo.url, r2_key: photo.r2_key })) ?? photo.url,
      })),
    );

    // Generate presigned URLs for spin frames (same fallback as photos)
    const spinFramesWithUrls = await Promise.all(
      (product.spin_frames ?? []).map(async (frame) => ({
        ...frame,
        url: (await photoUrlToDisplay({ url: frame.url, r2_key: frame.r2_key })) ?? frame.url,
      })),
    );

    // Generate presigned URLs for variant photos using their r2_key
    const variantsWithUrls = await Promise.all(
      (product.variants ?? []).map(async (variant) => {
        if (!variant.photo_url) return variant;
        const displayUrl = await photoUrlToDisplay({
          url: variant.photo_url,
          r2_key: variant.r2_key,
        });
        return { ...variant, photo_url: displayUrl ?? variant.photo_url };
      }),
    );

    return {
      data: {
        ...product,
        photos: photosWithUrls,
        spin_frames: spinFramesWithUrls,
        variants: variantsWithUrls,
      },
    };
  });

  // ─── GET /products/:id/interested-customers ──────────────────────
  server.get('/:id/interested-customers', async (request) => {
    // F-020: a delegated catalog-upload session must not reach customer PII
    // for a retailer whose real login was never shared (see auth.ts).
    if (request.catalogDelegate) throw forbidden('This session can only manage the catalog');

    const { id } = request.params as { id: string };
    const retailerId = request.retailerId;

    const query = z
      .object({ limit: z.coerce.number().int().min(1).max(50).default(12) })
      .safeParse(request.query);
    if (!query.success) throw validationError('Invalid query');
    const { limit } = query.data;

    const product = await prisma.product.findFirst({
      where: { id, retailer_id: retailerId, deleted_at: null },
      select: { id: true },
    });
    if (!product) throw notFound('Product');

    type MatchRow = {
      customer_id: string;
      name: string;
      phone: string;
      match_score: number;
    };

    const rows = await prisma.$queryRaw<MatchRow[]>`
      SELECT
        c.id AS customer_id,
        c.name,
        c.phone,
        (1 - (dna.preference_vector <=> pe.embedding)) AS match_score
      FROM customer_fashion_dna dna
      JOIN customers c ON c.id = dna.customer_id
      JOIN product_embeddings pe ON pe.product_id = ${id}
      WHERE dna.retailer_id = ${retailerId}
        AND c.deleted_at IS NULL
        AND dna.confidence_score >= ${MIN_CONFIDENCE_FOR_MATCHING}
      ORDER BY match_score DESC
      LIMIT ${limit * 2}
    `;

    const customers = rows
      .filter((r) => Number(r.match_score) > MATCH_SIMILARITY_THRESHOLD)
      .slice(0, limit)
      .map((r) => ({
        id: r.customer_id,
        name: r.name,
        phone: r.phone,
        match_score: Number(r.match_score),
      }));

    return { data: { customers } };
  });

  // ─── PUT /products/:id ──────────────────────────────────────────
  server.put('/:id', async (request) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    });
    if (!existing) throw notFound('Product');

    const body = UpdateProductSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const { metadata, ...rest } = body.data;
    let updated: Awaited<ReturnType<typeof prisma.product.update>>;
    try {
      updated = await prisma.product.update({
        where: { id },
        data: {
          metadata: metadata !== undefined ? (metadata as Prisma.InputJsonValue) : undefined,
          ...rest,
        },
        include: { photos: true, section: { select: { name: true } } },
      });
    } catch (err) {
      if ((err as { code?: string } | null)?.code === 'P2002') {
        throw validationError('This SKU is already in use', 'sku');
      }
      throw err;
    }

    const embeddingFields = [
      'category',
      'primary_color',
      'fabric_estimate',
      'occasions',
      'search_tags',
    ];
    const needsReembed = embeddingFields.some((f) => f in body.data);
    if (needsReembed) {
      addEmbeddingJob({ product_id: id, retailer_id: request.retailerId }).catch(() => {
        // Non-critical — embedding can be regenerated later
      });
    }

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'update',
        resource_type: 'Product',
        resource_id: id,
        metadata: { updated_fields: Object.keys(body.data) },
        ip_address: request.ip,
      },
    });

    return { data: updated };
  });

  // ─── PATCH /products/:id/status ─────────────────────────────────
  server.patch('/:id/status', async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({ status: z.enum(['AVAILABLE', 'SOLD', 'RESERVED', 'NOT_SURE']) })
      .safeParse(request.body);
    if (!body.success) throw validationError('Invalid status');

    const existing = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    });
    if (!existing) throw notFound('Product');

    const updated = await prisma.product.update({
      where: { id },
      data: { status: body.data.status },
      select: { id: true, status: true },
    });

    void revalidateCollectionsForProduct(id);

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'update',
        resource_type: 'Product',
        resource_id: id,
        metadata: { previous_status: existing.status, new_status: body.data.status },
        ip_address: request.ip,
      },
    });

    return { data: updated };
  });

  // ─── POST /products/bulk-delete ──────────────────────────────────
  server.post('/bulk-delete', async (request, reply) => {
    const body = z
      .object({ ids: z.array(z.string().min(1)).min(1).max(100) })
      .safeParse(request.body);
    if (!body.success) throw validationError('Provide 1-100 product ids');

    // Fetch products before delete for vault snapshot
    const productsToDelete = await prisma.product.findMany({
      where: { id: { in: body.data.ids }, retailer_id: request.retailerId, deleted_at: null },
    });

    const result = await prisma.product.updateMany({
      where: { id: { in: body.data.ids }, retailer_id: request.retailerId, deleted_at: null },
      data: { deleted_at: new Date() },
    });

    // F-016: Vault snapshot each deleted product (fire-and-forget, concurrent)
    Promise.allSettled(
      productsToDelete.map((p) =>
        vaultDelete({
          source_table: 'products',
          source_id: p.id,
          retailer_id: request.retailerId,
          payload: p as unknown as Record<string, unknown>,
          delete_reason: 'user_delete',
          deleted_by: request.retailerId,
        }),
      ),
    );

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'delete',
        resource_type: 'Product',
        resource_id: `bulk:${body.data.ids.join(',')}`,
        metadata: { deleted_count: result.count, product_ids: body.data.ids },
        ip_address: request.ip,
      },
    });

    return reply.status(200).send({ data: { deleted_count: result.count } });
  });

  // ─── DELETE /products/:id ───────────────────────────────────────
  server.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.product.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    });
    if (!existing) throw notFound('Product');

    await prisma.product.update({
      where: { id },
      data: { deleted_at: new Date() },
    });

    // F-016: Vault snapshot of the deleted product (fire-and-forget)
    vaultDelete({
      source_table: 'products',
      source_id: id,
      retailer_id: request.retailerId,
      payload: existing as unknown as Record<string, unknown>,
      delete_reason: 'user_delete',
      deleted_by: request.retailerId,
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'delete',
        resource_type: 'Product',
        resource_id: id,
        metadata: { previous_status: existing.status },
        ip_address: request.ip,
      },
    });

    return reply.status(204).send();
  });
};
