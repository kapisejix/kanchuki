import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hasFeature } from '../../lib/features.js';
import { notFound, validationError, featureUnavailable } from '../../plugins/error-handler.js';
import { isPromotionEligible, applyPromotionDiscount } from './growth-helpers.js';

const PromotionFieldsSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(20)
    .transform((v) => v.trim().toUpperCase().replace(/\s+/g, '_')),
  discount_type: z.enum(['PERCENT', 'FIXED']),
  discount_value: z.number().int().min(1),
  min_order_paise: z.number().int().min(0).optional(),
  product_ids: z.array(z.string()).max(100).optional(),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional(),
  is_active: z.boolean().optional(),
});

const PromotionSchema = PromotionFieldsSchema.refine(
  (p) => (p.discount_type === 'PERCENT' ? p.discount_value <= 100 : true),
  'Percentage discounts must be ≤ 100%',
);

export const growthPromotionRoutes: FastifyPluginAsync = async (server) => {
  const guard = async (retailerId: string) => {
    if (!(await hasFeature(retailerId, 'GROWTH_ENGINE'))) throw featureUnavailable('Growth tools');
  };

  // ─── GET /growth/promotions ─────────────────────────────────────
  server.get('/promotions', async (request) => {
    await guard(request.retailerId);
    return {
      data: await prisma.promotion.findMany({
        where: { retailer_id: request.retailerId },
        orderBy: { created_at: 'desc' },
      }),
    };
  });

  // ─── POST /growth/promotions ────────────────────────────────────
  server.post('/promotions', async (request, reply) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const body = PromotionSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');
    const { code, ...rest } = body.data;

    const existing = await prisma.promotion.findUnique({
      where: { retailer_id_code: { retailer_id: retailerId, code } },
    });
    if (existing) throw validationError('A promotion with this code already exists');

    const promo = await prisma.promotion.create({
      data: {
        retailer_id: retailerId,
        code,
        discount_type: rest.discount_type,
        discount_value: rest.discount_value,
        min_order_paise: rest.min_order_paise ?? null,
        product_ids: rest.product_ids ?? [],
        starts_at: rest.starts_at ? new Date(rest.starts_at) : null,
        ends_at: rest.ends_at ? new Date(rest.ends_at) : null,
        is_active: rest.is_active ?? true,
      },
    });
    return reply.status(201).send({ data: promo });
  });

  // ─── PUT /growth/promotions/:id ─────────────────────────────────
  server.put('/promotions/:id', async (request, reply) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };
    const existing = await prisma.promotion.findFirst({ where: { id, retailer_id: retailerId } });
    if (!existing) throw notFound('Promotion');

    const body = PromotionFieldsSchema.partial().safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');
    const { code, ...rest } = body.data;

    if (code && code !== existing.code) {
      const dup = await prisma.promotion.findUnique({
        where: { retailer_id_code: { retailer_id: retailerId, code } },
      });
      if (dup) throw validationError('A promotion with this code already exists');
    }

    const updated = await prisma.promotion.update({
      where: { id },
      data: {
        code,
        discount_type: rest.discount_type,
        discount_value: rest.discount_value,
        min_order_paise: rest.min_order_paise,
        product_ids: rest.product_ids,
        starts_at: rest.starts_at ? new Date(rest.starts_at) : undefined,
        ends_at: rest.ends_at ? new Date(rest.ends_at) : undefined,
        is_active: rest.is_active,
      },
    });
    return reply.send({ data: updated });
  });

  // ─── DELETE /growth/promotions/:id ──────────────────────────────
  server.delete('/promotions/:id', async (request, reply) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const { id } = request.params as { id: string };
    const existing = await prisma.promotion.findFirst({ where: { id, retailer_id: retailerId } });
    if (!existing) throw notFound('Promotion');
    await prisma.promotion.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ─── POST /growth/promotions/validate ───────────────────────────
  // Public-facing eligibility check used by the customer checkout when a
  // promo code is entered. Returns the discount to apply.
  server.post('/promotions/validate', async (request) => {
    const retailerId = request.retailerId;
    await guard(retailerId);
    const body = z
      .object({ code: z.string().min(2), subtotal_paise: z.number().int().min(0), product_ids: z.array(z.string()).default([]) })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const promo = await prisma.promotion.findUnique({
      where: { retailer_id_code: { retailer_id: retailerId, code: body.data.code.trim().toUpperCase() } },
    });
    if (!promo || !isPromotionEligible(promo, body.data.subtotal_paise, body.data.product_ids)) {
      throw notFound('Valid promotion');
    }
    const discount_paise = applyPromotionDiscount(promo, body.data.subtotal_paise);
    return { data: { id: promo.id, code: promo.code, discount_paise, total_after_paise: body.data.subtotal_paise - discount_paise } };
  });
};
