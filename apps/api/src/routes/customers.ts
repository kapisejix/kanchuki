import { createHash } from 'node:crypto';
import { prisma, vaultDelete } from '@kanchuki/db';
import { SIZE_OPTIONS, isValidIndianPhone, normalizeIndianPhone } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
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
});

export const customerRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /customers ────────────────────────────────────────────
  server.post('/', async (request, reply) => {
    const retailerId = request.retailerId;

    const body = CustomerSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const normalizedPhone = normalizeIndianPhone(body.data.phone);
    const phone_hash = createHash('sha256').update(normalizedPhone).digest('hex');

    const existing = await prisma.customer.findFirst({
      where: { retailer_id: retailerId, phone: normalizedPhone, deleted_at: null },
    });
    if (existing)
      throw validationError('A customer with this phone number already exists', 'phone');

    const customer = await prisma.customer.create({
      data: {
        retailer_id: retailerId,
        ...body.data,
        phone: normalizedPhone,
        phone_hash,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: retailerId,
        action: 'create',
        resource_type: 'Customer',
        resource_id: customer.id,
        metadata: { name: customer.name },
        ip_address: request.ip,
      },
    });

    return reply.status(201).send({ data: customer });
  });

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
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = customers.length > limit;
    return {
      data: hasMore ? customers.slice(0, limit) : customers,
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

    return { data: customer };
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

    return { data: updated };
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
