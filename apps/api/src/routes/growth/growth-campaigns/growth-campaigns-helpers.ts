import { prisma } from '@kanchuki/db';
import { generateCollectionSlug } from '@kanchuki/shared';
import { hasFeature } from '../../../lib/features.js';
import { buildCollectionUrl } from '../../../lib/store-urls.js';
import { featureUnavailable } from '../../../plugins/error-handler.js';
import { type AudienceSpec, buildAudienceWhere } from '../growth-helpers.js';

// Shared helpers for the growth-campaign route modules (split from
// growth-campaigns.ts). Bodies moved byte-for-byte by
// scripts/_tmp-split-route-modules.cjs.

export async function requireGrowth(retailerId: string): Promise<void> {
  if (!(await hasFeature(retailerId, 'GROWTH_ENGINE'))) {
    throw featureUnavailable('Growth tools');
  }
}

export function campaignWithStats(campaign: {
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
export async function storefrontLink(
  retailerId: string,
  publicSlug: string | null,
): Promise<string> {
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

export type AbVariant = {
  label: string;
  message_template: string;
  send_pct: number;
  product_ids?: string[];
  send_delay_min?: number;
};

export async function syncVariantCollections(
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
