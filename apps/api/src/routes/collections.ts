import { prisma, vaultDelete } from '@kanchuki/db';
import type { Prisma } from '@kanchuki/db';
import { addDays, generateCollectionSlug, normalizeIndianPhone } from '@kanchuki/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { hasFeature } from '../lib/features.js';
import { buildCollectionUrl } from '../lib/store-urls.js';
import { isRealOwner, maskPhoneForRequest } from '../plugins/auth.js';
import {
  AppError,
  featureUnavailable,
  forbidden,
  notFound,
  validationError,
} from '../plugins/error-handler.js';

// RC-066: manager / salesperson / delegates reach these routes through the
// /v1/collections allowlist; the customer's number must be masked server-side.
function maskEnquiry<T extends { customer_phone: string | null }>(
  request: FastifyRequest,
  e: T,
): T {
  return {
    ...e,
    customer_phone: e.customer_phone ? maskPhoneForRequest(request, e.customer_phone) : null,
  };
}

// F-044 E3: an enquiry's assignee is a Staff.id, or the retailer id when the
// owner took it (Q1 — no FK, two target tables).
async function assigneeNames(
  retailerId: string,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const staffIds = [...new Set(ids.filter((id): id is string => !!id && id !== retailerId))];
  const ownerIncluded = ids.includes(retailerId);
  const [staff, owner] = await Promise.all([
    staffIds.length
      ? prisma.staff.findMany({
          where: { id: { in: staffIds }, retailer_id: retailerId },
          select: { id: true, name: true },
        })
      : [],
    ownerIncluded
      ? prisma.retailer.findUnique({ where: { id: retailerId }, select: { owner_name: true } })
      : null,
  ]);
  for (const s of staff) names.set(s.id, s.name);
  if (ownerIncluded) names.set(retailerId, owner?.owner_name ?? 'Owner');
  return names;
}

function assignedTo(names: Map<string, string>, id: string | null) {
  return id ? { id, name: names.get(id) ?? 'Former team member' } : null;
}

// Catalog/support delegates have no identity that can own an enquiry.
function enquiryActorId(request: FastifyRequest): string | null {
  if (request.staffId) return request.staffId;
  return isRealOwner(request) ? request.retailerId : null;
}

function canReassign(request: FastifyRequest): boolean {
  return isRealOwner(request) || (!!request.staffId && request.staffRole !== 'salesperson');
}

function enquiryProductIds(e: { product_id: string | null; product_ids: string[] }): string[] {
  if (e.product_ids.length) return e.product_ids;
  return e.product_id ? [e.product_id] : [];
}

// The retailer's public_slug (store URL segment). Null when the retailer has
// never generated a store QR — buildCollectionUrl falls back to /c/{slug}.
async function retailerPublicSlug(retailerId: string): Promise<string | null> {
  const retailer = await prisma.retailer.findUnique({
    where: { id: retailerId },
    select: { public_slug: true },
  });
  return retailer?.public_slug ?? null;
}

const CreateCollectionSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  product_ids: z.array(z.string()).min(1).max(50),
  customer_id: z.string().optional(),
  expires_days: z.number().int().min(1).max(90).default(30),
});

export const collectionRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /collections ──────────────────────────────────────────
  server.post('/', async (request, reply) => {
    const body = CreateCollectionSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const { title, description, product_ids, customer_id, expires_days } = body.data;
    const retailerId = request.retailerId;

    // Verify products belong to this retailer
    const products = await prisma.product.findMany({
      where: { id: { in: product_ids }, retailer_id: retailerId, deleted_at: null },
      select: { id: true },
    });
    if (products.length !== product_ids.length) {
      throw validationError('One or more products not found in your catalog');
    }

    // Verify customer if provided
    if (customer_id) {
      const customer = await prisma.customer.findFirst({
        where: { id: customer_id, retailer_id: retailerId, deleted_at: null },
      });
      if (!customer) throw notFound('Customer');
    }

    // Generate unique slug (retry on collision)
    let slug = generateCollectionSlug(title);
    let attempts = 0;
    while (attempts < 5) {
      const exists = await prisma.collection.findUnique({ where: { slug } });
      if (!exists) break;
      slug = generateCollectionSlug(title);
      attempts++;
    }

    const collection = await prisma.collection.create({
      data: {
        retailer_id: retailerId,
        customer_id: customer_id ?? null,
        title,
        description: description ?? null,
        slug,
        expires_at: addDays(new Date(), expires_days),
        products: {
          create: product_ids.map((product_id, sort_order) => ({ product_id, sort_order })),
        },
      },
      include: {
        products: {
          include: {
            product: {
              include: { photos: { where: { is_primary: true }, take: 1 } },
            },
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: retailerId,
        action: 'create',
        resource_type: 'Collection',
        resource_id: collection.id,
        metadata: { title, product_count: product_ids.length, customer_id },
        ip_address: request.ip,
      },
    });

    const webUrl = buildCollectionUrl(await retailerPublicSlug(retailerId), slug);
    return reply.status(201).send({ data: { ...collection, url: webUrl } });
  });

  // ─── GET /collections ───────────────────────────────────────────
  server.get('/', async (request) => {
    const query = z
      .object({
        status: z.enum(['ACTIVE', 'EXPIRED', 'ARCHIVED']).optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      })
      .safeParse(request.query);
    if (!query.success) throw validationError('Invalid query');

    const { status, cursor, limit } = query.data;

    const collections = await prisma.collection.findMany({
      where: {
        retailer_id: request.retailerId,
        deleted_at: null,
        ...(status ? { status } : {}),
      },
      include: {
        _count: { select: { products: true } },
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = collections.length > limit;
    const page = hasMore ? collections.slice(0, limit) : collections;
    // One lookup for the whole page — the store segment is per-retailer, not per-collection.
    const publicSlug = await retailerPublicSlug(request.retailerId);

    return {
      data: page.map((c) => ({
        ...c,
        product_count: c._count.products,
        url: buildCollectionUrl(publicSlug, c.slug),
      })),
      pagination: {
        cursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        has_more: hasMore,
      },
    };
  });

  // ─── GET /collections/enquiries (F-044 E3 inbox) ───────────────
  // Static routes registered before /:id.
  server.get('/enquiries', async (request) => {
    const retailerId = request.retailerId;
    const enquiries = await prisma.collectionEnquiry.findMany({
      where: { retailer_id: retailerId },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: 100, // ponytail: newest 100; add cursor paging when a store outgrows it
      include: { collection: { select: { id: true, title: true } } },
    });
    const productIds = [...new Set(enquiries.flatMap(enquiryProductIds))];
    const [products, names, team] = await Promise.all([
      productIds.length
        ? prisma.product.findMany({
            where: { id: { in: productIds }, retailer_id: retailerId },
            select: {
              id: true,
              name: true,
              photos: { where: { is_primary: true }, take: 1, select: { url: true } },
            },
          })
        : [],
      assigneeNames(
        retailerId,
        enquiries.map((e) => e.assigned_staff_id),
      ),
      // Reassign picker: /v1/staff is owner-only, so managers get names (no phones) here.
      canReassign(request)
        ? prisma.staff.findMany({
            where: { retailer_id: retailerId, is_active: true },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : null,
    ]);
    const byId = new Map(
      products.map((p) => [p.id, { id: p.id, name: p.name, photo_url: p.photos[0]?.url ?? null }]),
    );
    return {
      data: enquiries.map(({ product_ids, assigned_staff_id, ...e }) => ({
        ...maskEnquiry(request, e),
        products: enquiryProductIds({ product_id: e.product_id, product_ids }).flatMap(
          (id) => byId.get(id) ?? [],
        ),
        assigned_to: assignedTo(names, assigned_staff_id),
      })),
      ...(team ? { assignees: team } : {}),
    };
  });

  // ─── GET /collections/enquiries/unread-count ───────────────────
  server.get('/enquiries/unread-count', async (request) => ({
    data: {
      count: await prisma.collectionEnquiry.count({
        where: { retailer_id: request.retailerId, status: 'NEW' },
      }),
    },
  }));

  // ─── POST /collections/enquiries/:id/take — first tap wins (D3) ─
  server.post('/enquiries/:id/take', async (request) => {
    const { id } = request.params as { id: string };
    const actor = enquiryActorId(request);
    if (!actor) throw forbidden('Only the shop team can take an enquiry');

    // CAS: only a still-unassigned row is claimed; the loser falls through to 409.
    const { count } = await prisma.collectionEnquiry.updateMany({
      where: { id, retailer_id: request.retailerId, assigned_staff_id: null },
      data: { assigned_staff_id: actor, assigned_at: new Date() },
    });
    const enquiry = await prisma.collectionEnquiry.findFirst({
      where: { id, retailer_id: request.retailerId },
      select: { assigned_staff_id: true },
    });
    if (!enquiry) throw notFound('Enquiry');

    const holder = assignedTo(
      await assigneeNames(request.retailerId, [enquiry.assigned_staff_id]),
      enquiry.assigned_staff_id,
    );
    if (count === 0 && enquiry.assigned_staff_id !== actor) {
      throw new AppError(
        'ENQUIRY_TAKEN',
        `Being handled by ${holder?.name ?? 'someone else'}`,
        409,
      );
    }
    return { data: { id, assigned_to: holder } };
  });

  // ─── PATCH /collections/enquiries/:id/assign — owner + manager ─
  server.patch('/enquiries/:id/assign', async (request) => {
    if (!canReassign(request)) throw forbidden('Only the owner or a manager can reassign');
    const { id } = request.params as { id: string };
    const body = z.object({ staff_id: z.string().min(1) }).safeParse(request.body);
    if (!body.success) throw validationError('staff_id is required', 'staff_id');

    const target = body.data.staff_id;
    if (target !== request.retailerId) {
      const staff = await prisma.staff.findFirst({
        where: { id: target, retailer_id: request.retailerId, is_active: true },
        select: { id: true },
      });
      if (!staff) throw validationError('Team member not found', 'staff_id');
    }

    const { count } = await prisma.collectionEnquiry.updateMany({
      where: { id, retailer_id: request.retailerId },
      data: { assigned_staff_id: target, assigned_at: new Date() },
    });
    if (count === 0) throw notFound('Enquiry');

    return {
      data: {
        id,
        assigned_to: assignedTo(await assigneeNames(request.retailerId, [target]), target),
      },
    };
  });

  // ─── GET /collections/:id ───────────────────────────────────────
  server.get('/:id', async (request) => {
    const { id } = request.params as { id: string };

    const collection = await prisma.collection.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
      include: {
        products: {
          orderBy: { sort_order: 'asc' },
          include: {
            product: {
              include: {
                photos: { where: { is_primary: true }, take: 1 },
                section: { select: { name: true } },
              },
            },
          },
        },
        enquiries: { orderBy: { created_at: 'desc' }, take: 50 },
        _count: { select: { views: true } },
      },
    });
    if (!collection) throw notFound('Collection');

    return {
      data: {
        ...collection,
        enquiries: collection.enquiries.map((e) => maskEnquiry(request, e)),
        url: buildCollectionUrl(await retailerPublicSlug(request.retailerId), collection.slug),
      },
    };
  });

  // ─── GET /collections/:id/analytics ────────────────────────────
  server.get('/:id/analytics', async (request) => {
    const { id } = request.params as { id: string };

    const collection = await prisma.collection.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
      select: {
        id: true,
        title: true,
        slug: true,
        view_count: true,
        unique_viewer_count: true,
        enquiry_count: true,
        favorite_count: true,
      },
    });
    if (!collection) throw notFound('Collection');

    // Top products by enquiry
    const topProducts = await prisma.collectionEnquiry.groupBy({
      by: ['product_id'],
      where: { collection_id: id },
      _count: { product_id: true },
      orderBy: { _count: { product_id: 'desc' } },
      take: 5,
    });

    return { data: { ...collection, top_products: topProducts } };
  });

  // ─── PATCH /collections/:id/enquiries/:enquiryId ───────────────
  server.patch('/:id/enquiries/:enquiryId', async (request) => {
    const { id, enquiryId } = request.params as { id: string; enquiryId: string };

    const body = z
      .object({ status: z.enum(['NEW', 'SEEN', 'REPLIED', 'CLOSED']) })
      .safeParse(request.body);
    if (!body.success) throw validationError('Invalid status');

    // Verify collection belongs to retailer
    const collection = await prisma.collection.findFirst({
      where: { id, retailer_id: request.retailerId },
    });
    if (!collection) throw notFound('Collection');

    const { count } = await prisma.collectionEnquiry.updateMany({
      where: { id: enquiryId, collection_id: id },
      data: { status: body.data.status },
    });
    if (count === 0) throw notFound('Enquiry');

    const updated = await prisma.collectionEnquiry.findUnique({ where: { id: enquiryId } });
    return { data: updated && maskEnquiry(request, updated) };
  });

  // ─── POST /collections/auto-suggest ─────────────────────────────
  // AI-auto-build a personalized collection for a specific customer
  // based on their Fashion DNA preference vector.
  server.post('/auto-suggest', async (request, reply) => {
    const body = z
      .object({
        customer_id: z.string(),
        title: z.string().min(1).max(200).optional(),
        limit: z.number().int().min(1).max(24).default(12),
        category: z.string().optional(),
        price_max: z.coerce.number().int().min(0).optional(),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const { customer_id, title, limit, category, price_max } = body.data;
    const retailerId = request.retailerId;

    // Verify customer belongs to this retailer
    const customer = await prisma.customer.findFirst({
      where: { id: customer_id, retailer_id: retailerId, deleted_at: null },
    });
    if (!customer) throw notFound('Customer');

    let productIds: string[] = [];
    // Fashion DNA matching removed (chore/remove-unwanted-features) — preference-based only.
    const dna_used = false;

    // Match on explicit customer preferences
    if (productIds.length === 0) {
      const prefColors = customer.pref_colors ?? [];
      const prefFabrics = customer.pref_fabrics ?? [];

      const orConditions: Prisma.ProductWhereInput[] = [];
      if (prefColors.length > 0) {
        orConditions.push({ primary_color: { in: prefColors } });
        orConditions.push({ secondary_colors: { hasSome: prefColors } });
      }
      if (prefFabrics.length > 0) orConditions.push({ fabric_estimate: { in: prefFabrics } });

      const fallbackProducts = await prisma.product.findMany({
        where: {
          retailer_id: retailerId,
          deleted_at: null,
          status: 'AVAILABLE',
          ...(orConditions.length > 0 ? { OR: orConditions } : {}),
          ...(price_max != null ? { price_min: { lte: price_max } } : {}),
          ...(category ? { category } : {}),
        },
        take: limit,
        orderBy: { created_at: 'desc' },
        select: { id: true },
      });
      productIds = fallbackProducts.map((p) => p.id);
    }

    if (productIds.length === 0) {
      // Not enough signal for auto-suggest — return empty result
      return reply
        .status(200)
        .send({ data: { collection: null, reason: 'insufficient_preference_data' } });
    }

    // Step 2: Create the collection with matched products
    const collectionTitle = title ?? `AI Picks for ${customer.name}`;

    // Generate unique slug
    let slug = generateCollectionSlug(collectionTitle);
    let attempts = 0;
    while (attempts < 5) {
      const exists = await prisma.collection.findUnique({ where: { slug } });
      if (!exists) break;
      slug = generateCollectionSlug(collectionTitle);
      attempts++;
    }

    const collection = await prisma.collection.create({
      data: {
        retailer_id: retailerId,
        customer_id,
        title: collectionTitle,
        description: `AI-curated collection for ${customer.name} based on their preferences`,
        slug,
        expires_at: addDays(new Date(), 30),
        products: {
          create: productIds.map((product_id, sort_order) => ({ product_id, sort_order })),
        },
      },
      include: {
        products: {
          include: {
            product: {
              include: { photos: { where: { is_primary: true }, take: 1 } },
            },
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: retailerId,
        action: 'create',
        resource_type: 'Collection',
        resource_id: collection.id,
        metadata: { title: collectionTitle, type: 'auto-suggest', dna_used },
        ip_address: request.ip,
      },
    });

    const webUrl = buildCollectionUrl(await retailerPublicSlug(retailerId), slug);
    return reply.status(201).send({
      data: {
        ...collection,
        url: webUrl,
        product_count: productIds.length,
        dna_used,
      },
    });
  });

  // ─── PATCH /collections/:id ─────────────────────────────────────
  // Update collection title and/or expiry. Product list changes are not
  // supported here — create a new collection if you need a different
  // set of products.
  server.patch('/:id', async (request) => {
    const { id } = request.params as { id: string };

    const body = z
      .object({
        title: z.string().min(1).max(200).optional(),
        expires_days: z.number().int().min(1).max(90).optional(),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const existing = await prisma.collection.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    });
    if (!existing) throw notFound('Collection');

    const updateData: Record<string, unknown> = {};
    if (body.data.title) updateData.title = body.data.title;
    if (body.data.expires_days) {
      updateData.expires_at = addDays(new Date(), body.data.expires_days);
    }

    const updated = await prisma.collection.update({
      where: { id },
      data: updateData,
      include: {
        _count: { select: { products: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'update',
        resource_type: 'Collection',
        resource_id: id,
        metadata: { title: updated.title, updated_fields: Object.keys(body.data) },
        ip_address: request.ip,
      },
    });

    return {
      data: {
        ...updated,
        product_count: updated._count.products,
        url: buildCollectionUrl(await retailerPublicSlug(request.retailerId), updated.slug),
      },
    };
  });

  // ─── DELETE /collections/:id ────────────────────────────────────
  server.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.collection.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    });
    if (!existing) throw notFound('Collection');

    await prisma.collection.update({
      where: { id },
      data: { deleted_at: new Date(), status: 'ARCHIVED' },
    });

    // F-016: Vault snapshot of the deleted collection (fire-and-forget)
    vaultDelete({
      source_table: 'collections',
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
        resource_type: 'Collection',
        resource_id: id,
        metadata: { title: existing.title },
        ip_address: request.ip,
      },
    });

    return reply.status(204).send();
  });

  // ─── POST /collections/:id/bulk-send ────────────────────────────
  // Sends the collection link to multiple customers in one call via the
  // retailer's own Meta WhatsApp Business API credentials (configured under
  // /retailers/me/whatsapp-api). Requires a pre-approved message template
  // with exactly one body variable — we fill it with the full personalized
  // message, same text the one-by-one wa.me flow sends.
  // F-013: gated behind WHATSAPP_BUSINESS_API feature.
  server.post('/:id/bulk-send', async (request, reply) => {
    if (!(await hasFeature(request.retailerId, 'WHATSAPP_BUSINESS_API'))) {
      throw featureUnavailable('WhatsApp Business API');
    }
    const { id } = request.params as { id: string };
    const body = z
      .object({ customer_ids: z.array(z.string()).min(1).max(100) })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const retailerId = request.retailerId;

    const [collection, retailer, customers] = await Promise.all([
      prisma.collection.findFirst({
        where: { id, retailer_id: retailerId, deleted_at: null, status: 'ACTIVE' },
      }),
      prisma.retailer.findUnique({
        where: { id: retailerId },
        select: {
          whatsapp_api_phone_number_id: true,
          whatsapp_api_access_token: true,
          whatsapp_api_template_name: true,
          whatsapp_api_template_lang: true,
          public_slug: true,
        },
      }),
      prisma.customer.findMany({
        where: { id: { in: body.data.customer_ids }, retailer_id: retailerId, deleted_at: null },
        select: { id: true, name: true, phone: true },
      }),
    ]);
    if (!collection) throw notFound('Collection');
    if (
      !retailer?.whatsapp_api_phone_number_id ||
      !retailer.whatsapp_api_access_token ||
      !retailer.whatsapp_api_template_name
    ) {
      throw validationError(
        'WhatsApp Business API is not configured. Add it under Settings first, or use the one-by-one share option.',
      );
    }

    const webUrl = buildCollectionUrl(retailer.public_slug, collection.slug);
    const { whatsapp_api_phone_number_id, whatsapp_api_access_token } = retailer;
    const templateName = retailer.whatsapp_api_template_name;
    const templateLang = retailer.whatsapp_api_template_lang ?? 'en_US';

    const results = await Promise.allSettled(
      customers.map(async (customer) => {
        const message = `Hi ${customer.name}! Check out our collection "${collection.title}": ${webUrl}`;
        const res = await fetch(
          `https://graph.facebook.com/v21.0/${whatsapp_api_phone_number_id}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${whatsapp_api_access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: `91${normalizeIndianPhone(customer.phone)}`,
              type: 'template',
              template: {
                name: templateName,
                language: { code: templateLang },
                components: [{ type: 'body', parameters: [{ type: 'text', text: message }] }],
              },
            }),
          },
        );
        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(errBody);
        }
        return customer.id;
      }),
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.flatMap((r, i) => {
      if (r.status !== 'rejected') return [];
      const customer = customers[i];
      if (!customer) return [];
      return [
        {
          customer_id: customer.id,
          error: String((r as PromiseRejectedResult).reason),
        },
      ];
    });

    return reply.status(200).send({ data: { sent, failed_count: failed.length, failed } });
  });
};
