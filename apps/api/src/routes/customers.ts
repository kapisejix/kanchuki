import { createHash } from 'node:crypto';
import { prisma, vaultDelete } from '@kanchuki/db';
import { SIZE_OPTIONS, isValidIndianPhone, normalizeIndianPhone } from '@kanchuki/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { isRealOwner, maskPhoneForRequest } from '../plugins/auth.js';
import { notFound, validationError } from '../plugins/error-handler.js';

const CustomerSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z
    .string()
    .min(10)
    .max(15)
    .refine((v) => isValidIndianPhone(v), 'Enter a valid 10-digit Indian mobile number'),
  email: z.string().email().max(320).optional(),
  address_line1: z.string().max(200).optional(),
  address_line2: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().max(10).optional(),
  pref_colors: z.array(z.string().max(50)).max(20).optional().default([]),
  pref_styles: z.array(z.string().max(100)).max(10).optional().default([]),
  pref_fabrics: z.array(z.string().max(100)).max(10).optional().default([]),
  budget_min: z.number().int().min(0).max(100_000_000).optional(),
  budget_max: z.number().int().min(0).max(100_000_000).optional(),
  usual_size: z.enum(SIZE_OPTIONS).optional().nullable(),
  notes: z.string().max(2000).optional(),
  // Retailer attests the customer agreed (in-store) to WhatsApp offers/updates.
  // Campaign send filters on this — false (the Prisma default) = never messaged.
  consent_given: z.boolean().optional(),
});

// H4-2/RC-096: phone_hash (SHA-256 of a 10-digit number, brute-forceable) and
// customer_account_id (a passport identity) never leave the API, for any role.
function toCustomerDto<
  C extends { phone: string; phone_hash: string | null; customer_account_id: string | null },
>(request: FastifyRequest, c: C) {
  const { phone_hash: _hash, customer_account_id: _account, ...safe } = c;
  return { ...safe, phone: maskPhoneForRequest(request, c.phone) };
}

export const customerRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /customers ────────────────────────────────────────────
  // H2-6/RC-145: bounds the "already exists" phone probe; no response shape can hide it.
  server.post(
    '/',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: 60 * 1000,
          // preHandler, not the default onRequest: auth sets retailerId/staffId in a preHandler,
          // and an empty key at onRequest would pool every retailer into one bucket.
          hook: 'preHandler',
          keyGenerator: (r) => `${r.retailerId}:${r.staffId ?? 'owner'}`,
        },
      },
    },
    async (request, reply) => {
      const retailerId = request.retailerId;

      const body = CustomerSchema.safeParse(request.body);
      if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

      const normalizedPhone = normalizeIndianPhone(body.data.phone);
      const phone_hash = createHash('sha256').update(normalizedPhone).digest('hex');

      // H2-7/RC-146: the unique index covers soft-deleted rows, so look them up too.
      const existing = await prisma.customer.findFirst({
        where: { retailer_id: retailerId, phone: normalizedPhone },
      });
      // Staff get the same 422 for a deleted number as for an active one: they cannot undo the
      // owner's delete, and the H2-6 probe answer is identical in both cases.
      if (existing && (existing.deleted_at === null || !isRealOwner(request)))
        throw validationError('A customer with this phone number already exists', 'phone');

      const fresh = { ...body.data, phone: normalizedPhone, phone_hash };
      const customer = existing
        ? await prisma.customer.update({
            where: { id: existing.id },
            data: {
              // a re-added customer starts clean: nothing inherited from before the delete
              email: null,
              address_line1: null,
              address_line2: null,
              city: null,
              state: null,
              pincode: null,
              budget_min: null,
              budget_max: null,
              usual_size: null,
              notes: null,
              consent_given: false,
              consent_at: null,
              pref_occasions: [],
              ...fresh,
              deleted_at: null,
            },
          })
        : await prisma.customer.create({ data: { retailer_id: retailerId, ...fresh } });

      await prisma.auditLog.create({
        data: {
          actor_type: 'retailer',
          actor_id: retailerId,
          action: 'create',
          resource_type: 'Customer',
          resource_id: customer.id,
          metadata: existing ? { name: customer.name, restored: true } : { name: customer.name },
          ip_address: request.ip,
        },
      });

      return reply.status(201).send({ data: toCustomerDto(request, customer) });
    },
  );

  // ─── GET /customers ─────────────────────────────────────────────
  server.get('/', async (request) => {
    const query = z
      .object({
        search: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .safeParse(request.query);
    if (!query.success) throw validationError('Invalid query');

    const { search, cursor, limit } = query.data;

    const customers = await prisma.customer.findMany({
      where: {
        retailer_id: request.retailerId,
        deleted_at: null,
        ...(search
          ? {
              // Staff may not search by digits — that would let them
              // reconstruct a masked number one prefix at a time.
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                ...(isRealOwner(request) ? [{ phone: { contains: search } }] : []),
              ],
            }
          : {}),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = customers.length > limit;
    const page = (hasMore ? customers.slice(0, limit) : customers).map((c) =>
      toCustomerDto(request, c),
    );
    return {
      data: page,
      pagination: {
        cursor: hasMore ? (customers[limit - 1]?.id ?? null) : null,
        has_more: hasMore,
      },
    };
  });

  // ─── GET /customers/:id ─────────────────────────────────────────
  server.get('/:id', async (request) => {
    const { id } = request.params as { id: string };

    const customer = await prisma.customer.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    });
    if (!customer) throw notFound('Customer');

    return { data: toCustomerDto(request, customer) };
  });

  // ─── PUT /customers/:id ─────────────────────────────────────────
  server.put('/:id', async (request) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.customer.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    });
    if (!existing) throw notFound('Customer');

    const body = CustomerSchema.partial().safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    // H2-7/RC-146: a phone held by another row (active or soft-deleted) would hit the unique index.
    if (body.data.phone) {
      const taken = await prisma.customer.findFirst({
        where: {
          retailer_id: request.retailerId,
          phone: normalizeIndianPhone(body.data.phone),
          id: { not: id },
        },
        select: { id: true },
      });
      if (taken) throw validationError('A customer with this phone number already exists', 'phone');
    }

    const data = body.data.phone
      ? {
          ...body.data,
          phone: normalizeIndianPhone(body.data.phone),
          phone_hash: createHash('sha256')
            .update(normalizeIndianPhone(body.data.phone))
            .digest('hex'),
        }
      : body.data;

    const updated = await prisma.customer.update({ where: { id }, data });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'update',
        resource_type: 'Customer',
        resource_id: id,
        metadata: { name: updated.name, updated_fields: Object.keys(body.data) },
        ip_address: request.ip,
      },
    });

    return { data: toCustomerDto(request, updated) };
  });

  // ─── DELETE /customers/:id ──────────────────────────────────────
  server.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.customer.findFirst({
      where: { id, retailer_id: request.retailerId, deleted_at: null },
    });
    if (!existing) throw notFound('Customer');

    await prisma.customer.update({
      where: { id },
      data: { deleted_at: new Date() },
    });

    vaultDelete({
      source_table: 'customers',
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
        resource_type: 'Customer',
        resource_id: id,
        metadata: { name: existing.name },
        ip_address: request.ip,
      },
    });

    return reply.status(204).send();
  });
};
