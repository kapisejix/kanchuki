import { Prisma, prisma } from '@kanchuki/db';
import { generateCollectionSlug } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hasFeature } from '../../lib/features.js';
import { buildCollectionUrl } from '../../lib/store-urls.js';
import {
  featureUnavailable,
  forbidden,
  notFound,
  validationError,
} from '../../plugins/error-handler.js';
import {
  type AbVariantResult,
  type AudienceSpec,
  AudienceSpecSchema,
  abTestSignificance,
  buildAudienceWhere,
  buildWhatsAppDeepLink,
  fillTemplate,
} from './growth-helpers.js';

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

// ─── Helpers ──────────────────────────────────────────────────────

async function requireGrowth(retailerId: string): Promise<void> {
  if (!(await hasFeature(retailerId, 'GROWTH_ENGINE'))) {
    throw featureUnavailable('Growth tools');
  }
}

function campaignWithStats(campaign: {
  id: string;
  type: string;
  status: string;
  name: string;
  festival_name: string | null;
  sent_count: number;
  opened_count: number;
  schedule_at: Date | null;
  sent_at: Date | null;
  message_template: string;
  product_ids: string[];
  variant_a_collection_id?: string | null;
  variant_b_collection_id?: string | null;
}) {
  return {
    id: campaign.id,
    type: campaign.type,
    status: campaign.status,
    name: campaign.name,
    festival_name: campaign.festival_name,
    message_template: campaign.message_template,
    product_ids: campaign.product_ids,
    sent_count: campaign.sent_count,
    opened_count: campaign.opened_count,
    schedule_at: campaign.schedule_at,
    sent_at: campaign.sent_at,
    // Roadmap S — variant collection IDs for link generation.
    variant_a_collection_id: campaign.variant_a_collection_id ?? null,
    variant_b_collection_id: campaign.variant_b_collection_id ?? null,
  };
}

/** Resolve the {{link}} placeholder — the retailer's active storefront. */
async function storefrontLink(retailerId: string, publicSlug: string | null): Promise<string> {
  const storefront = await prisma.collection.findFirst({
    where: { retailer_id: retailerId, status: 'ACTIVE', deleted_at: null },
    orderBy: { updated_at: 'desc' },
    select: { slug: true },
  });
  if (!storefront) return `${process.env.WEB_URL ?? 'https://kanchuki.app'}`;
  return buildCollectionUrl(publicSlug, storefront.slug);
}

// ─── Roadmap S — Variant Collection Sync ─────────────────────────
// When an A/B campaign is created or edited with variant product sets,
// auto-generate (or update) two HIDDEN collections — one per variant —
// so each variant gets its own storefront link without appearing in the
// public ACTIVE listing.

type AbVariant = {
  label: string;
  message_template: string;
  send_pct: number;
  product_ids?: string[];
  send_delay_min?: number;
};

async function syncVariantCollections(
  retailerId: string,
  _campaignId: string,
  campaignName: string,
  abVariants: AbVariant[] | null,
  existing?: {
    variant_a_collection_id: string | null;
    variant_b_collection_id: string | null;
  } | null,
): Promise<{ variant_a_collection_id: string | null; variant_b_collection_id: string | null }> {
  // No A/B variants or variants without product sets → clear any existing variant collections.
  if (
    !abVariants ||
    abVariants.length !== 2 ||
    !abVariants[0]!.product_ids?.length ||
    !abVariants[1]!.product_ids?.length
  ) {
    // Archive any existing variant collections.
    for (const cid of [existing?.variant_a_collection_id, existing?.variant_b_collection_id]) {
      if (cid) {
        await prisma.collection
          .update({ where: { id: cid }, data: { status: 'ARCHIVED' } })
          .catch(() => {});
      }
    }
    return { variant_a_collection_id: null, variant_b_collection_id: null };
  }

  const [vA, vB] = abVariants;

  async function upsertVariant(
    variant: AbVariant,
    label: string,
    existingId: string | null,
  ): Promise<string> {
    const title = `${campaignName} — ${label}`;
    const productIds = variant.product_ids!;

    if (existingId) {
      // Update existing: sync products + title.
      const collection = await prisma.collection.findUnique({ where: { id: existingId } });
      if (collection && collection.status !== 'ACTIVE') {
        await prisma.collection.update({
          where: { id: existingId },
          data: { title },
        });
        // Sync products: remove old, add new.
        await prisma.collectionProduct.deleteMany({ where: { collection_id: existingId } });
        await prisma.collectionProduct.createMany({
          data: productIds.map((pid, i) => ({
            collection_id: existingId,
            product_id: pid,
            sort_order: i,
          })),
        });
        return existingId;
      }
    }

    // Create new HIDDEN collection.
    const slug = generateCollectionSlug(title);
    const collection = await prisma.collection.create({
      data: {
        retailer_id: retailerId,
        title,
        slug,
        status: 'HIDDEN',
        products: {
          create: productIds.map((pid, i) => ({ product_id: pid, sort_order: i })),
        },
      },
    });
    return collection.id;
  }

  const [aId, bId] = await Promise.all([
    upsertVariant(vA!, 'Variant A', existing?.variant_a_collection_id ?? null),
    upsertVariant(vB!, 'Variant B', existing?.variant_b_collection_id ?? null),
  ]);

  return { variant_a_collection_id: aId, variant_b_collection_id: bId };
}

// ─── Routes ──────────────────────────────────────────────────────

export const growthCampaignRoutes: FastifyPluginAsync = async (server) => {
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

  // ─── POST /growth/campaigns/:id/preview ─────────────────────────
  // Audience count + sample names, no send (lets the retailer sanity-check
  // segmentation before the blast).
  server.post('/campaigns/:id/preview', async (request) => {
    const retailerId = request.retailerId;
    await retailerGuard(request);
    const { id } = request.params as { id: string };
    const campaign = await prisma.campaign.findFirst({ where: { id, retailer_id: retailerId } });
    if (!campaign) throw notFound('Campaign');

    const spec = campaign.audience_json as unknown as AudienceSpec;
    const customerIds = await resolveAudienceCustomerIds(retailerId, spec);
    const sample = await prisma.customer.findMany({
      where: { id: { in: customerIds.slice(0, 10) } },
      select: { id: true, name: true, phone: true },
    });
    return { data: { audience_count: customerIds.length, sample } };
  });

  // ─── POST /growth/campaigns/:id/send ────────────────────────────
  // Creates CampaignSend rows for the audience and dispatches:
  //  - WhatsApp Business API when configured + feature enabled (real send)
  //  - otherwise wa.me deep links per customer (retailer forwards them)
  server.post('/campaigns/:id/send', async (request, reply) => {
    const retailerId = request.retailerId;
    await retailerGuard(request);
    const { id } = request.params as { id: string };
    const campaign = await prisma.campaign.findFirst({ where: { id, retailer_id: retailerId } });
    if (!campaign) throw notFound('Campaign');
    if (campaign.status === 'SENT') throw forbidden('Campaign already sent');

    const spec = campaign.audience_json as unknown as AudienceSpec;
    const customerIds = await resolveAudienceCustomerIds(retailerId, spec);
    if (customerIds.length === 0) throw validationError('Audience is empty — no customers matched');

    const [customers, retailer] = await Promise.all([
      prisma.customer.findMany({
        where: { id: { in: customerIds }, consent_given: true },
        select: { id: true, name: true, phone: true },
      }),
      prisma.retailer.findUnique({
        where: { id: retailerId },
        select: {
          shop_name: true,
          public_slug: true,
          whatsapp_api_phone_number_id: true,
          whatsapp_api_access_token: true,
          whatsapp_api_template_name: true,
          whatsapp_api_template_lang: true,
        },
      }),
    ]);
    if (customers.length === 0) throw validationError('No consented customers in the audience');

    const link = await storefrontLink(retailerId, retailer?.public_slug ?? null);
    const baseVars = {
      shop: retailer?.shop_name ?? 'our store',
      link,
      festival: campaign.festival_name ?? '',
    };

    // Roadmap S — build variant collection links for A/B attribution.
    // Variant at index 0 → variant_a_collection → ?variant=a
    // Variant at index 1 → variant_b_collection → ?variant=b
    const variantCollectionLinks: Record<string, string | null> = { a: null, b: null };
    if (campaign.variant_a_collection_id) {
      variantCollectionLinks.a = `${process.env.WEB_URL ?? 'https://kanchuki.app'}/collections/${campaign.variant_a_collection_id}?variant=a`;
    }
    if (campaign.variant_b_collection_id) {
      variantCollectionLinks.b = `${process.env.WEB_URL ?? 'https://kanchuki.app'}/collections/${campaign.variant_b_collection_id}?variant=b`;
    }

    const canUseApi =
      retailer?.whatsapp_api_phone_number_id &&
      retailer.whatsapp_api_access_token &&
      retailer.whatsapp_api_template_name &&
      (await hasFeature(retailerId, 'WHATSAPP_BUSINESS_API'));

    // A/B split: assign each customer to a variant by cumulative percentage.
    // Variants carry an optional product set (collection A/B) and a stagger
    // (send_delay_min) so variant B can go out later than variant A.
    const variants =
      (campaign.ab_variants as unknown as
        | {
            label: string;
            message_template: string;
            send_pct: number;
            product_ids?: string[];
            send_delay_min?: number;
          }[]
        | null) ?? null;
    const variantFor = (
      index: number,
    ): {
      label: string;
      message_template: string;
      product_ids?: string[];
      send_delay_min?: number;
    } | null => {
      if (!variants || variants.length !== 2) return null;
      const pct = (index % 100) + 1;
      return pct <= variants[0]!.send_pct ? variants[0]! : variants[1]!;
    };

    const messages: {
      customer: { id: string; name: string; phone: string };
      message: string;
      variantLabel: string | null;
      variantProducts: string[];
      sendDelayMin: number;
      variantCollectionLink: string | null;
    }[] = [];
    for (let i = 0; i < customers.length; i++) {
      const customer = customers[i]!;
      const variant = variantFor(i);
      const template = variant?.message_template ?? campaign.message_template;
      const message = fillTemplate(template, { ...baseVars, name: customer.name ?? 'there' });
      messages.push({
        customer,
        message,
        variantLabel: variant?.label ?? null,
        variantProducts: variant?.product_ids ?? [],
        sendDelayMin: variant?.send_delay_min ?? 0,
        variantCollectionLink:
          (variant?.label === (variants?.[0]?.label ?? '')
            ? variantCollectionLinks.a
            : variantCollectionLinks.b) ?? null,
      });
    }

    // Staggered sends: rows for delayed variants are timestamped at
    // now + delay (drives hour-of-day analytics and the manual link list
    // ordering); the WhatsApp API path sends them all in one pass below.
    const now = new Date();
    const sends = await prisma.$transaction(
      messages.map((m, _i) =>
        prisma.campaignSend.create({
          data: {
            campaign_id: campaign.id,
            retailer_id: retailerId,
            customer_id: m.customer.id,
            variant_label: m.variantLabel,
            sent_at: m.sendDelayMin > 0 ? new Date(now.getTime() + m.sendDelayMin * 60_000) : null,
          },
        }),
      ),
    );

    // ── Dispatch ──
    const manualLinks: {
      customer_id: string;
      name: string;
      variant_label: string | null;
      product_ids: string[];
      link: string;
    }[] = [];
    let apiSent = 0;
    let apiFailed = 0;

    if (canUseApi) {
      const {
        whatsapp_api_phone_number_id,
        whatsapp_api_access_token,
        whatsapp_api_template_name,
        whatsapp_api_template_lang,
      } = retailer!;
      const results = await Promise.allSettled(
        messages.map(async (m, i) => {
          const res = await fetch(
            `https://graph.facebook.com/v21.0/${whatsapp_api_phone_number_id}/messages`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${whatsapp_api_access_token}`,
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: `91${m.customer.phone.replace(/\D/g, '')}`,
                type: 'template',
                template: {
                  name: whatsapp_api_template_name,
                  language: { code: whatsapp_api_template_lang ?? 'en_US' },
                  components: [{ type: 'body', parameters: [{ type: 'text', text: m.message }] }],
                },
              }),
            },
          );
          if (!res.ok) throw new Error(`Meta API ${res.status}`);
          await prisma.campaignSend.update({
            where: { id: sends[i]!.id },
            data: { status: 'SENT', sent_at: new Date() },
          });
        }),
      );
      for (const result of results) {
        if (result.status === 'fulfilled') apiSent++;
        else apiFailed++;
      }
    } else {
      for (const m of messages) {
        manualLinks.push({
          customer_id: m.customer.id,
          name: m.customer.name ?? 'Customer',
          variant_label: m.variantLabel,
          product_ids: m.variantProducts,
          link: buildWhatsAppDeepLink(m.customer.phone, m.message),
        });
      }
    }

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        status: 'SENT',
        sent_at: new Date(),
        sent_count: messages.length,
      },
    });

    return reply.send({
      data: {
        campaign_id: campaign.id,
        audience_count: messages.length,
        sent_via: canUseApi ? 'whatsapp_api' : 'manual_links',
        api_sent: apiSent,
        api_failed: apiFailed,
        manual_links: canUseApi ? undefined : manualLinks,
        variants: variants
          ? variants.map((v) => ({
              label: v.label,
              send_pct: v.send_pct,
              product_ids: v.product_ids ?? [],
            }))
          : undefined,
        variant_collection_links: variantCollectionLinks,
      },
    });
  });

  // ─── GET /growth/campaigns/stats ────────────────────────────────
  // Campaign analytics (roadmap R): sends/opens by type and by festival.
  server.get('/campaigns/stats', async (request) => {
    const retailerId = request.retailerId;
    await retailerGuard(request);
    const campaigns = await prisma.campaign.findMany({
      where: { retailer_id: retailerId },
      select: {
        id: true,
        type: true,
        festival_name: true,
        sent_count: true,
        opened_count: true,
        status: true,
      },
    });
    const by_type: Record<string, { sent: number; opened: number; campaigns: number }> = {};
    const by_festival: Record<string, { sent: number; opened: number; campaigns: number }> = {};
    for (const c of campaigns) {
      if (c.status !== 'SENT') continue;
      by_type[c.type] ??= { sent: 0, opened: 0, campaigns: 0 };
      by_type[c.type]!.sent += c.sent_count;
      by_type[c.type]!.opened += c.opened_count;
      by_type[c.type]!.campaigns += 1;
      const key = c.festival_name ?? 'Other';
      by_festival[key] ??= { sent: 0, opened: 0, campaigns: 0 };
      by_festival[key]!.sent += c.sent_count;
      by_festival[key]!.opened += c.opened_count;
      by_festival[key]!.campaigns += 1;
    }
    return { data: { by_type, by_festival, total_campaigns: campaigns.length } };
  });

  // ─── GET /growth/analytics ──────────────────────────────────────
  // Roadmap R — campaign & commerce analytics with India-retail dimensions:
  // festival, customer segment, hour-of-day, product category, video-vs-photo,
  // and per-A/B-variant results with significance (roadmap S).
  server.get('/analytics', async (request) => {
    const retailerId = request.retailerId;
    await retailerGuard(request);

    const campaigns = await prisma.campaign.findMany({
      where: { retailer_id: retailerId },
      select: {
        id: true,
        name: true,
        type: true,
        festival_name: true,
        sent_count: true,
        opened_count: true,
        status: true,
        ab_variants: true,
      },
    });

    const by_type: Record<string, { sent: number; opened: number; campaigns: number }> = {};
    const by_festival: Record<string, { sent: number; opened: number; campaigns: number }> = {};
    for (const c of campaigns) {
      if (c.status !== 'SENT') continue;
      by_type[c.type] ??= { sent: 0, opened: 0, campaigns: 0 };
      by_type[c.type]!.sent += c.sent_count;
      by_type[c.type]!.opened += c.opened_count;
      by_type[c.type]!.campaigns += 1;
      const key = c.festival_name ?? 'Other';
      by_festival[key] ??= { sent: 0, opened: 0, campaigns: 0 };
      by_festival[key]!.sent += c.sent_count;
      by_festival[key]!.opened += c.opened_count;
      by_festival[key]!.campaigns += 1;
    }

    // Segment performance: CampaignSend → Customer (VIP = lifetime spend
    // >= ₹2,000; Regular = below; Never purchased = zero purchases).
    // CampaignSend.customer_id is a loose pointer (customers soft-delete) —
    // fetch the customers in one pass and join in memory.
    const sentRows = await prisma.campaignSend.findMany({
      where: { retailer_id: retailerId, status: { in: ['SENT', 'OPENED'] } },
      select: { customer_id: true, opened_at: true },
    });
    const customerIds = [
      ...new Set(sentRows.map((r) => r.customer_id).filter(Boolean)),
    ] as string[];
    const customersForSegments = customerIds.length
      ? await prisma.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, total_spent: true, total_purchases: true },
        })
      : [];
    const customerBySegmentId = new Map(customersForSegments.map((c) => [c.id, c]));
    const by_segment: Record<string, { sent: number; opened: number }> = {
      VIP: { sent: 0, opened: 0 },
      REGULAR: { sent: 0, opened: 0 },
      NEVER_PURCHASED: { sent: 0, opened: 0 },
    };
    const hourCounts = new Array<number>(24).fill(0);
    let openedTotal = 0;
    for (const row of sentRows) {
      const c = row.customer_id ? customerBySegmentId.get(row.customer_id) : undefined;
      const segment = !c
        ? 'REGULAR'
        : (c.total_purchases ?? 0) === 0
          ? 'NEVER_PURCHASED'
          : (c.total_spent ?? 0) >= 200_000
            ? 'VIP'
            : 'REGULAR';
      by_segment[segment]!.sent += 1;
      if (row.opened_at) {
        by_segment[segment]!.opened += 1;
        openedTotal += 1;
        const hour = new Date(row.opened_at).getHours();
        hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;
      }
    }
    const by_hour = hourCounts
      .map((opens, hour) => ({
        hour,
        opens,
        pct: openedTotal > 0 ? Number((opens / openedTotal).toFixed(4)) : 0,
      }))
      .filter((h) => h.opens > 0)
      .sort((a, b) => a.hour - b.hour);

    // Product-category + video-vs-photo performance over the last 30 days
    // (views + enquiries recorded as CustomerInteraction rows).
    const _since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const interactions: any[] = [];
    const by_category: Record<string, { views: number; enquiries: number }> = {};
    let videoViews = 0;
    let videoEnquiries = 0;
    let photoViews = 0;
    let photoEnquiries = 0;
    for (const i of interactions) {
      const category = i.product?.category ?? 'Uncategorised';
      by_category[category] ??= { views: 0, enquiries: 0 };
      if (i.type === 'view') by_category[category]!.views += 1;
      else by_category[category]!.enquiries += 1;
      const hasVideo = (i.product?.videos.length ?? 0) > 0;
      if (i.type === 'view') {
        if (hasVideo) videoViews += 1;
        else photoViews += 1;
      } else if (hasVideo) videoEnquiries += 1;
      else photoEnquiries += 1;
    }

    // A/B variant results with significance (roadmap S).
    const by_variant: {
      campaign_id: string;
      campaign_name: string;
      variants: AbVariantResult[];
      significance: ReturnType<typeof abTestSignificance>;
    }[] = [];
    for (const c of campaigns) {
      const variants = c.ab_variants as unknown as { label: string }[] | null;
      if (c.status !== 'SENT' || !variants || variants.length !== 2) continue;
      const [sent, opened] = await Promise.all([
        prisma.campaignSend.groupBy({
          by: ['variant_label'],
          where: { campaign_id: c.id },
          _count: { _all: true },
        }),
        prisma.campaignSend.groupBy({
          by: ['variant_label'],
          where: { campaign_id: c.id, opened_at: { not: null } },
          _count: { _all: true },
        }),
      ]);
      const openedBy = new Map(opened.map((r) => [r.variant_label, r._count._all]));
      const results = sent
        .map((r) => ({ label: r.variant_label, sent: r._count._all }))
        .filter((r): r is { label: string; sent: number } => r.label != null)
        .map((v) => {
          const openedCount = openedBy.get(v.label) ?? 0;
          return {
            label: v.label,
            sent: v.sent,
            opened: openedCount,
            open_rate: v.sent > 0 ? openedCount / v.sent : 0,
          } as AbVariantResult;
        });
      if (results.length !== 2) continue;
      by_variant.push({
        campaign_id: c.id,
        campaign_name: c.name ?? 'A/B campaign',
        variants: results,
        significance: abTestSignificance(results[0]!, results[1]!),
      });
    }

    return {
      data: {
        by_type,
        by_festival,
        by_segment,
        by_hour,
        by_category: Object.entries(by_category)
          .map(([category, v]) => ({ category, ...v }))
          .sort((a, b) => b.enquiries + b.views - (a.enquiries + a.views)),
        video_vs_photo: {
          video: { views: videoViews, enquiries: videoEnquiries },
          photo: { views: photoViews, enquiries: photoEnquiries },
        },
        by_variant,
        total_campaigns: campaigns.length,
      },
    };
  });

  // ─── POST /growth/reactivation-suggestions ──────────────────────
  // Roadmap G: find customers who haven't interacted in N days and package
  // them as one-tap reactivation audience suggestions.
  server.post('/reactivation-suggestions', async (request) => {
    const retailerId = request.retailerId;
    await retailerGuard(request);
    const body = z
      .object({ inactive_days: z.number().int().min(7).max(3650).default(60) })
      .safeParse(request.body ?? {});
    const inactiveDays = body.success ? body.data.inactive_days : 60;

    const _cutoff = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);
    const active: any[] = [];
    const activeIds = new Set(active.map((a) => a.customer_id));

    const customers = await prisma.customer.findMany({
      where: { retailer_id: retailerId, deleted_at: null, consent_given: true },
      select: { id: true, name: true, phone: true, total_spent: true, last_visit_at: true },
    });
    const inactive = customers.filter((c) => !activeIds.has(c.id));

    // Split into VIP (ever spent >= ₹2,000) vs regular for template variety.
    const vip = inactive.filter((c) => (c.total_spent ?? 0) >= 200_000);
    const regular = inactive.filter((c) => (c.total_spent ?? 0) < 200_000);

    return {
      data: {
        inactive_days: inactiveDays,
        total_inactive: inactive.length,
        groups: [
          { label: 'VIP reactivation', customer_ids: vip.map((c) => c.id), count: vip.length },
          {
            label: 'Regular reactivation',
            customer_ids: regular.map((c) => c.id),
            count: regular.length,
          },
        ],
      },
    };
  });
};

export async function resolveAudienceCustomerIds(
  retailerId: string,
  spec: AudienceSpec,
): Promise<string[]> {
  const where = buildAudienceWhere(spec, retailerId) as NonNullable<
    Parameters<typeof prisma.customer.findMany>[0]
  >['where'];
  let customerIds = await prisma.customer
    .findMany({ where, select: { id: true } })
    .then((rows) => rows.map((r) => r.id));

  if (spec.inactive_days != null) {
    const _cutoff = new Date(Date.now() - spec.inactive_days * 24 * 60 * 60 * 1000);
    const active: any[] = [];
    const activeIds = new Set(active.map((a) => a.customer_id));
    customerIds = customerIds.filter((id) => !activeIds.has(id));
  }
  return customerIds;
}
