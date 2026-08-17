import { Prisma, prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hasFeature } from '../../lib/features.js';
import { notFound, validationError, featureUnavailable, forbidden } from '../../plugins/error-handler.js';
import { buildCollectionUrl } from '../../lib/store-urls.js';
import {
  AudienceSpecSchema,
  buildAudienceWhere,
  fillTemplate,
  buildWhatsAppDeepLink,
  type AudienceSpec,
} from './growth-helpers.js';

const CAMPAIGN_TYPES = ['FESTIVAL', 'REACTIVATION', 'PROMOTION', 'AB_TEST'] as const;
const CAMPAIGN_STATUSES = ['DRAFT', 'SCHEDULED', 'SENT'] as const;

const AbVariantSchema = z
  .object({
    label: z.string().min(1).max(40),
    message_template: z.string().min(1).max(2000),
    send_pct: z.number().int().min(1).max(99),
  })
  .array()
  .min(2)
  .max(2)
  .refine((variants) => variants.reduce((s, v) => s + v.send_pct, 0) === 100, 'A/B split must total 100%');

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

const CreateCampaignSchema = CampaignBaseSchema
  .refine((c) => (c.type === 'AB_TEST' ? c.ab_variants != null : true), 'AB_TEST campaigns need two variants')
  .refine((c) => (c.type === 'FESTIVAL' ? c.festival_id != null : true), 'FESTIVAL campaigns need a festival');

// ─── Helpers ──────────────────────────────────────────────────────

async function requireGrowth(retailerId: string): Promise<void> {
  if (!(await hasFeature(retailerId, 'GROWTH_ENGINE'))) {
    throw featureUnavailable('Growth tools');
  }
}

function campaignWithStats(campaign: { id: string; type: string; status: string; name: string; festival_name: string | null; sent_count: number; opened_count: number; schedule_at: Date | null; sent_at: Date | null; message_template: string; product_ids: string[] }) {
  return {
    id: campaign.id,
    type: campaign.type,
    status: campaign.status,
    name: campaign.name,
    festival_name: campaign.festival_name,
    sent_count: campaign.sent_count,
    opened_count: campaign.opened_count,
    schedule_at: campaign.schedule_at,
    sent_at: campaign.sent_at,
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

// ─── Routes ──────────────────────────────────────────────────────

export const growthCampaignRoutes: FastifyPluginAsync = async (server) => {
  const retailerGuard = async (request: { retailerId: string }) => requireGrowth(request.retailerId);

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

    const { type, name, message_template, audience, product_ids, festival_id, schedule_at, ab_variants } = body.data;

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
    return reply.status(201).send({ data: campaignWithStats(campaign) });
  });

  // ─── GET /growth/campaigns/:id ──────────────────────────────────
  server.get('/campaigns/:id', async (request) => {
    const retailerId = request.retailerId;
    await retailerGuard(request);
    const { id } = request.params as { id: string };
    const campaign = await prisma.campaign.findFirst({ where: { id, retailer_id: retailerId } });
    if (!campaign) throw notFound('Campaign');
    const sends = await prisma.campaignSend.groupBy({
      by: ['status'],
      where: { campaign_id: id },
      _count: { _all: true },
    });
    return {
      data: {
        ...campaign,
        sends_breakdown: Object.fromEntries(sends.map((s) => [s.status, s._count._all])),
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
    return reply.send({ data: campaignWithStats(updated) });
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

    const canUseApi =
      retailer?.whatsapp_api_phone_number_id &&
      retailer.whatsapp_api_access_token &&
      retailer.whatsapp_api_template_name &&
      (await hasFeature(retailerId, 'WHATSAPP_BUSINESS_API'));

    // A/B split: assign each customer to a variant by cumulative percentage.
    const variants = (campaign.ab_variants as unknown as { label: string; message_template: string; send_pct: number }[] | null) ?? null;
    const variantFor = (index: number): { label: string; message_template: string } | null => {
      if (!variants || variants.length !== 2) return null;
      const pct = (index % 100) + 1;
      return pct <= variants[0]!.send_pct ? variants[0]! : variants[1]!;
    };

    const messages: { customer: { id: string; name: string; phone: string }; message: string; variantLabel: string | null }[] = [];
    for (let i = 0; i < customers.length; i++) {
      const customer = customers[i]!;
      const variant = variantFor(i);
      const template = variant?.message_template ?? campaign.message_template;
      const message = fillTemplate(template, { ...baseVars, name: customer.name ?? 'there' });
      messages.push({ customer, message, variantLabel: variant?.label ?? null });
    }

    const sends = await prisma.$transaction(
      messages.map((m) =>
        prisma.campaignSend.create({
          data: {
            campaign_id: campaign.id,
            retailer_id: retailerId,
            customer_id: m.customer.id,
            variant_label: m.variantLabel,
          },
        }),
      ),
    );

    // ── Dispatch ──
    const manualLinks: { customer_id: string; name: string; link: string }[] = [];
    let apiSent = 0;
    let apiFailed = 0;

    if (canUseApi) {
      const { whatsapp_api_phone_number_id, whatsapp_api_access_token, whatsapp_api_template_name, whatsapp_api_template_lang } = retailer!;
      const results = await Promise.allSettled(
        messages.map(async (m, i) => {
          const res = await fetch(
            `https://graph.facebook.com/v21.0/${whatsapp_api_phone_number_id}/messages`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
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
      select: { id: true, type: true, festival_name: true, sent_count: true, opened_count: true, status: true },
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

    const cutoff = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);
    const active = await prisma.customerInteraction.findMany({
      where: { retailer_id: retailerId, created_at: { gte: cutoff } },
      select: { customer_id: true },
      distinct: ['customer_id'],
    });
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
          { label: 'Regular reactivation', customer_ids: regular.map((c) => c.id), count: regular.length },
        ],
      },
    };
  });
};

/** Resolve the audience spec into concrete customer ids (incl. inactive_days). */
async function resolveAudienceCustomerIds(retailerId: string, spec: AudienceSpec): Promise<string[]> {
  const where = buildAudienceWhere(spec, retailerId) as NonNullable<
    Parameters<typeof prisma.customer.findMany>[0]
  >['where'];
  let customerIds = await prisma.customer
    .findMany({ where, select: { id: true } })
    .then((rows) => rows.map((r) => r.id));

  if (spec.inactive_days != null) {
    const cutoff = new Date(Date.now() - spec.inactive_days * 24 * 60 * 60 * 1000);
    const active = await prisma.customerInteraction.findMany({
      where: { retailer_id: retailerId, created_at: { gte: cutoff } },
      select: { customer_id: true },
      distinct: ['customer_id'],
    });
    const activeIds = new Set(active.map((a) => a.customer_id));
    customerIds = customerIds.filter((id) => !activeIds.has(id));
  }
  return customerIds;
}
