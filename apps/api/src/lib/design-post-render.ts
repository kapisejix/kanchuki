// Renders one admin design (design_templates row) for a retailer's own products.
// Shared by POST /me/designs/:id/render (composer) and the F-043 publish tick / style route.
//
// Every variable except custom_text / offer_text comes from the caller's DB rows, never the
// client (RC-138/139). Callers pass product ids they already checked (assertOwnProducts) — the
// queries below still filter by retailer_id, so a foreign id simply yields no row.
import { downloadBuffer, renderDesign } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { type DesignFormat, parseDesignSpec } from '@kanchuki/shared';
import { enquiryPhone } from '../routes/public/public-helpers.js';
import { buildStoreUrl } from './store-urls.js';

const inr = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

export class DesignRenderError extends Error {
  constructor(
    message: string,
    /** Safe to show the retailer. */
    readonly userMessage: string,
  ) {
    super(message);
  }
}

export interface PublishedDesign {
  id: string;
  format: string;
  product_slots: number;
  spec: unknown;
  background_key: string | null;
}

/**
 * PUBLISHED design visible to this plan, else null (draft / hidden / wrong plan look missing).
 * AI styles (ai_prompt set) are excluded: they render only through the AI poster path, never
 * the plain renderer or the scheduler.
 */
export function findPublishedDesign(designId: string, plan: 'STARTER' | 'GROWTH' | 'PRO') {
  return prisma.designTemplate.findFirst({
    where: { id: designId, status: 'PUBLISHED', plans: { has: plan }, ai_prompt: null },
  });
}

/** The AI-style counterpart: PUBLISHED, plan-allowed row whose ai_prompt is set. */
export function findPublishedAiPoster(designId: string, plan: 'STARTER' | 'GROWTH' | 'PRO') {
  return prisma.designTemplate.findFirst({
    where: { id: designId, status: 'PUBLISHED', plans: { has: plan }, ai_prompt: { not: null } },
  });
}

export async function renderDesignJpeg(args: {
  retailerId: string;
  design: PublishedDesign;
  productIds: string[];
  custom?: { custom_text?: string; offer_text?: string };
}): Promise<Buffer> {
  const { retailerId, design, productIds, custom } = args;
  const parsed = parseDesignSpec(design.spec, design.format as DesignFormat, design.product_slots);
  if (!parsed.ok) {
    throw new DesignRenderError('bad spec', 'This design is not available right now');
  }

  const [retailer, products] = await Promise.all([
    prisma.retailer.findUniqueOrThrow({
      where: { id: retailerId },
      select: {
        shop_name: true,
        city: true,
        phone: true,
        whatsapp_number: true,
        public_slug: true,
        logo_r2_key: true,
      },
    }),
    prisma.product.findMany({
      where: { id: { in: productIds }, retailer_id: retailerId, deleted_at: null },
      select: {
        id: true,
        name: true,
        sku: true,
        price_min: true,
        mrp: true,
        fabrics: true,
        fabric_estimate: true,
        photos: { where: { retailer_id: retailerId }, select: { r2_key: true, is_primary: true } },
      },
    }),
  ]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const ordered = productIds
    .map((pid) => byId.get(pid))
    .filter((p): p is NonNullable<typeof p> => !!p);
  const photoKey = (p: (typeof ordered)[number]) =>
    (p.photos.find((x) => x.is_primary) ?? p.photos[0])?.r2_key;
  if (ordered.length === 0 || ordered.some((p) => !photoKey(p))) {
    throw new DesignRenderError('no photo', 'Every product needs a photo to make a design');
  }

  const [background, logo, ...images] = await Promise.all([
    design.background_key ? downloadBuffer(design.background_key) : Promise.resolve(null),
    retailer.logo_r2_key
      ? downloadBuffer(retailer.logo_r2_key).catch(() => null) // no logo → layer is skipped
      : Promise.resolve(null),
    ...ordered.map((p) => downloadBuffer(photoKey(p) as string)),
  ]);
  return renderDesign({
    format: design.format as DesignFormat,
    spec: parsed.spec,
    background,
    shop: {
      texts: {
        shop_name: retailer.shop_name,
        shop_city: retailer.city,
        shop_phone: enquiryPhone(retailer),
        ...(retailer.public_slug
          ? { store_url: buildStoreUrl(retailer.public_slug).replace(/^https?:\/\//, '') }
          : {}),
      },
      logo,
    },
    custom: {
      ...(custom?.custom_text ? { custom_text: custom.custom_text } : {}),
      ...(custom?.offer_text ? { offer_text: custom.offer_text } : {}),
    },
    products: ordered.map((p, i) => {
      const price = p.price_min;
      const off = p.mrp && price && p.mrp > price ? Math.round((1 - price / p.mrp) * 100) : null;
      const fabric = p.fabrics[0] ?? p.fabric_estimate;
      return {
        texts: {
          ...(p.name ? { product_name: p.name } : {}),
          ...(price != null ? { price: inr(price) } : {}),
          ...(p.mrp ? { mrp: inr(p.mrp) } : {}),
          ...(off ? { discount_pct: `${off}% off` } : {}),
          ...(p.sku ? { sku: p.sku } : {}),
          ...(fabric ? { fabric } : {}),
        },
        image: images[i] ?? null,
      };
    }),
  });
}
