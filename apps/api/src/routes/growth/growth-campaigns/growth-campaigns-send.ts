// growth-campaigns-send.ts — campaign preview + WhatsApp send dispatch (split from apps/api/src/routes/growth/growth-campaigns.ts — body byte-identical)
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { hasFeature } from '../../../lib/features.js';
import { forbidden, notFound, validationError } from '../../../plugins/error-handler.js';
import { type AudienceSpec, buildWhatsAppDeepLink, fillTemplate } from '../growth-helpers.js';
import {
  requireGrowth,
  resolveAudienceCustomerIds,
  storefrontLink,
} from './growth-campaigns-helpers.js';
export const growthCampaignSendRoutes: FastifyPluginAsync = async (server) => {
  const retailerGuard = async (request: { retailerId: string }) =>
    requireGrowth(request.retailerId);

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
};
