// growth-campaigns-crud.ts — festival calendar + campaign CRUD (split from apps/api/src/routes/growth/growth-campaigns.ts — body byte-identical)
import { Prisma, prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { forbidden, notFound, validationError } from '../../../plugins/error-handler.js';
import { AudienceSpecSchema } from '../growth-helpers.js';
import {
  type AbVariant,
  campaignWithStats,
  requireGrowth,
  syncVariantCollections,
} from './growth-campaigns-helpers.js';
const CAMPAIGN_TYPES = ['FESTIVAL', 'REACTIVATION', 'PROMOTION', 'AB_TEST'] as const;
const _CAMPAIGN_STATUSES = ['DRAFT', 'SCHEDULED', 'SENT'] as const;

const _COLLECTION_STATUS_HIDDEN = 'HIDDEN' as const;

const AbVariantSchema = z
  .object({
    label: z.string().min(1).max(40),
    message_template: z.string().min(1).max(2000),
    send_pct: z.number().int().min(1).max(99),
    // Roadmap S — collection A/B: per-variant product set (ordering = array
    // order) and an optional stagger so variant B goes out later.
    product_ids: z.array(z.string()).max(50).optional(),
    send_delay_min: z.number().int().min(0).max(1440).optional(),
  })
  .array()
  .min(2)
  .max(2)
  .refine(
    (variants) => variants.reduce((s, v) => s + v.send_pct, 0) === 100,
    'A/B split must total 100%',
  );

const CampaignBaseSchema = z.object({
  type: z.enum(CAMPAIGN_TYPES),
  name: z.string().min(1).max(120),
  message_template: z.string().min(1).max(2000),
  audience: AudienceSpecSchema,
  product_ids: z.array(z.string()).max(50).optional(),
  // Festival ids are numeric auto-increment (admin-managed calendar).
  festival_id: z.coerce.number().int().positive().optional(),
  schedule_at: z.string().datetime().optional(),
  ab_variants: AbVariantSchema.optional(),
});

const CreateCampaignSchema = CampaignBaseSchema.refine(
  (c) => (c.type === 'AB_TEST' ? c.ab_variants != null : true),
  'AB_TEST campaigns need two variants',
).refine(
  (c) => (c.type === 'FESTIVAL' ? c.festival_id != null : true),
  'FESTIVAL campaigns need a festival',
);

export const growthCampaignCrudRoutes: FastifyPluginAsync = async (server) => {
  const retailerGuard = async (request: { retailerId: string }) =>
    requireGrowth(request.retailerId);

  // ─── GET /growth/festivals ──────────────────────────────────────
  // Admin-seeded festival calendar (roadmap D). ?upcoming=true filters to
  // festivals that haven't ended yet.
  server.get('/festivals', async (request) => {
    await retailerGuard(request);
    const query = z.object({ upcoming: z.string().optional() }).safeParse(request.query);
    const upcoming = query.success ? query.data.upcoming === 'true' : false;
    const now = new Date();
    return {
      data: await prisma.festival.findMany({
        where: upcoming ? { ends_at: { gte: now } } : undefined,
        orderBy: { starts_at: 'asc' },
      }),
    };
  });
  // ─── GET /growth/campaigns ──────────────────────────────────────
  server.get('/campaigns', async (request) => {
    const retailerId = request.retailerId;
    await retailerGuard(request);
    const campaigns = await prisma.campaign.findMany({
      where: { retailer_id: retailerId },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    return { data: campaigns.map(campaignWithStats) };
  });
  // ─── POST /growth/campaigns ─────────────────────────────────────
  server.post('/campaigns', async (request, reply) => {
    const retailerId = request.retailerId;
    await retailerGuard(request);

    const body = CreateCampaignSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const {
      type,
      name,
      message_template,
      audience,
      product_ids,
      festival_id,
      schedule_at,
      ab_variants,
    } = body.data;

    let festival_name: string | null = null;
    if (festival_id) {
      const festival = await prisma.festival.findUnique({ where: { id: festival_id } });
      if (!festival) throw validationError('Unknown festival');
      festival_name = festival.name;
    }

    const campaign = await prisma.campaign.create({
      data: {
        retailer_id: retailerId,
        type,
        name,
        message_template,
        audience_json: audience as unknown as object,
        product_ids: product_ids ?? [],
        festival_id: festival_id ?? null,
        festival_name,
        ab_variants: ab_variants ? (ab_variants as unknown as object) : Prisma.JsonNull,
        schedule_at: schedule_at ? new Date(schedule_at) : null,
      },
    });

    // Roadmap S — auto-generate HIDDEN variant collections for A/B campaigns.
    const variantIds = await syncVariantCollections(
      retailerId,
      campaign.id,
      name,
      (ab_variants as unknown as AbVariant[] | null) ?? null,
    );
    if (variantIds.variant_a_collection_id || variantIds.variant_b_collection_id) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: variantIds,
      });
    }

    return reply.status(201).send({ data: campaignWithStats({ ...campaign, ...variantIds }) });
  });
  // ─── GET /growth/campaigns/:id ──────────────────────────────────
  // Includes per-status sends AND per-A/B-variant sent/opened (roadmap S) so
  // the detail screen can show which variant is winning.
  server.get('/campaigns/:id', async (request) => {
    const retailerId = request.retailerId;
    await retailerGuard(request);
    const { id } = request.params as { id: string };
    const campaign = await prisma.campaign.findFirst({ where: { id, retailer_id: retailerId } });
    if (!campaign) throw notFound('Campaign');
    const [sends, variantSent, variantOpened] = await Promise.all([
      prisma.campaignSend.groupBy({
        by: ['status'],
        where: { campaign_id: id },
        _count: { _all: true },
      }),
      prisma.campaignSend.groupBy({
        by: ['variant_label'],
        where: { campaign_id: id },
        _count: { _all: true },
      }),
      prisma.campaignSend.groupBy({
        by: ['variant_label'],
        where: { campaign_id: id, opened_at: { not: null } },
        _count: { _all: true },
      }),
    ]);

    let variant_breakdown:
      | { label: string; sent: number; opened: number; open_rate: number; winner: boolean | null }[]
      | null = null;
    if (variantSent.length > 0) {
      const openedBy = new Map(variantOpened.map((r) => [r.variant_label, r._count._all]));
      variant_breakdown = variantSent
        .map((r) => ({ label: r.variant_label, sent: r._count._all }))
        .filter((r): r is { label: string; sent: number } => r.label != null)
        .map((v) => {
          const opened = openedBy.get(v.label) ?? 0;
          return {
            ...v,
            opened,
            open_rate: v.sent > 0 ? Number((opened / v.sent).toFixed(4)) : 0,
            winner: null,
          };
        });
      const maxOpened = Math.max(...variant_breakdown.map((v) => v.opened));
      const winners = variant_breakdown.filter((v) => v.opened > 0 && v.opened === maxOpened);
      if (winners.length === 1) winners[0]!.winner = true;
    }

    return {
      data: {
        ...campaign,
        sends_breakdown: Object.fromEntries(sends.map((s) => [s.status, s._count._all])),
        variant_breakdown,
      },
    };
  });
  // ─── PUT /growth/campaigns/:id ──────────────────────────────────
  server.put('/campaigns/:id', async (request, reply) => {
    const retailerId = request.retailerId;
    await retailerGuard(request);
    const { id } = request.params as { id: string };
    const existing = await prisma.campaign.findFirst({ where: { id, retailer_id: retailerId } });
    if (!existing) throw notFound('Campaign');
    if (existing.status !== 'DRAFT' && existing.status !== 'SCHEDULED') {
      throw forbidden('Sent campaigns cannot be edited');
    }

    const body = CampaignBaseSchema.partial().safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');
    const data = body.data;

    let festival_name: string | null | undefined;
    if (data.festival_id) {
      const festival = await prisma.festival.findUnique({ where: { id: data.festival_id } });
      if (!festival) throw validationError('Unknown festival');
      festival_name = festival.name;
    }

    const updated = await prisma.campaign.update({
      where: { id },
      data: {
        name: data.name,
        message_template: data.message_template,
        audience_json: data.audience ? (data.audience as unknown as object) : undefined,
        product_ids: data.product_ids,
        ...(data.festival_id
          ? { festival_id: data.festival_id, festival_name: festival_name ?? null }
          : { festival_id: null, festival_name: null }),
        ab_variants: data.ab_variants ? (data.ab_variants as unknown as object) : Prisma.JsonNull,
        schedule_at: data.schedule_at ? new Date(data.schedule_at) : null,
      },
    });

    // Roadmap S — sync variant collections when A/B product sets change.
    const abVariants =
      (data.ab_variants as unknown as AbVariant[] | null) ??
      (existing.ab_variants as unknown as AbVariant[] | null);
    const variantIds = await syncVariantCollections(
      retailerId,
      id,
      data.name ?? existing.name,
      abVariants,
      existing,
    );
    if (
      variantIds.variant_a_collection_id !== existing.variant_a_collection_id ||
      variantIds.variant_b_collection_id !== existing.variant_b_collection_id
    ) {
      await prisma.campaign.update({ where: { id }, data: variantIds });
    }

    return reply.send({ data: campaignWithStats({ ...updated, ...variantIds }) });
  });
  // ─── DELETE /growth/campaigns/:id ───────────────────────────────
  server.delete('/campaigns/:id', async (request, reply) => {
    const retailerId = request.retailerId;
    await retailerGuard(request);
    const { id } = request.params as { id: string };
    const existing = await prisma.campaign.findFirst({ where: { id, retailer_id: retailerId } });
    if (!existing) throw notFound('Campaign');
    if (existing.status === 'SENT') throw forbidden('Sent campaigns cannot be deleted');
    await prisma.campaign.delete({ where: { id } });
    return reply.status(204).send();
  });
};
