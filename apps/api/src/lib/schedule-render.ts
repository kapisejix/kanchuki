// F-043 Task 4 — turns a scheduled post's slides into the image URLs Meta gets.
//
// Used by the publish tick (render-at-publish, so price/festival are fresh and
// a bulk "apply to all" costs nothing up front) and by the single-slide "Style
// this" route (immediate render for the retailer's preview, key persisted).
//
// Rules (docs/tasks/pending/post-scheduler.md §3, §7):
//   • ORIGINAL slide  → the product photo as-is.
//   • TEMPLATE slide  → rendered once, stored on `resolved_image_key`, reused.
//   • Any templated slide (or a cover) in the post → the remaining originals
//     are centre-cropped to 4:5 too, so Instagram sees one aspect ratio.
//   • Cover (plan.cover_style) → collage of up to 4 photos, prepended, only
//     for 2–9 slides (hard cap 10). Not a DB row — built per publish.
//   • Every failure degrades to the original photo; a render problem must
//     never stop a post going out.
import {
  type SlideTemplate,
  downloadBuffer,
  isCoverStyle,
  isSlideTemplate,
  normalizePhoto,
  publicUrl,
  renderCollage,
  renderSlide,
  uploadBuffer,
} from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { findPublishedDesign, renderDesignJpeg } from './design-post-render.js';

const MAX_SLIDES = 10;
const FESTIVAL_WINDOW_MS = 7 * 86_400_000;

export interface RenderItem {
  id: string;
  product_id: string;
  position: number;
  photo_id: string | null;
  image_level: 'ORIGINAL' | 'TEMPLATE';
  template_id: string | null;
  resolved_image_key: string | null;
  /** {custom_text?, offer_text?} for an admin design; ignored for built-in templates. */
  design_vars?: unknown;
}

interface Ctx {
  /** Product ids of the whole post in slide order: a multi-slot design fills its slots from here. */
  order: string[];
  retailerId: string;
  plan: 'STARTER' | 'GROWTH' | 'PRO';
  storeName: string;
  logoKey: string | null;
  photos: { id: string; product_id: string; url: string; r2_key: string; is_primary: boolean }[];
  products: Map<string, { name: string | null; price_min: number | null }>;
  buffers: Map<string, Buffer>;
}

async function loadCtx(
  retailerId: string,
  productIds: string[],
  order: string[] = productIds,
): Promise<Ctx> {
  const [retailer, photos, products] = await Promise.all([
    prisma.retailer.findUniqueOrThrow({
      where: { id: retailerId },
      select: { shop_name: true, logo_r2_key: true, plan: true },
    }),
    prisma.productPhoto.findMany({
      where: { retailer_id: retailerId, product_id: { in: productIds } },
      select: { id: true, product_id: true, url: true, r2_key: true, is_primary: true },
    }),
    prisma.product.findMany({
      where: { retailer_id: retailerId, id: { in: productIds } },
      select: { id: true, name: true, price_min: true },
    }),
  ]);
  return {
    order,
    retailerId,
    plan: retailer.plan,
    storeName: retailer.shop_name ?? '',
    logoKey: retailer.logo_r2_key,
    photos,
    products: new Map(products.map((p) => [p.id, p])),
    buffers: new Map(),
  };
}

const photoFor = (ctx: Ctx, item: RenderItem) => {
  const own = ctx.photos.filter((p) => p.product_id === item.product_id);
  return own.find((p) => p.id === item.photo_id) ?? own.find((p) => p.is_primary) ?? own[0];
};

async function bytes(ctx: Ctx, key: string): Promise<Buffer> {
  const hit = ctx.buffers.get(key);
  if (hit) return hit;
  const buf = await downloadBuffer(key);
  ctx.buffers.set(key, buf);
  return buf;
}

async function nearestFestival(at: Date): Promise<string | null> {
  const f = await prisma.festival.findFirst({
    where: {
      deleted_at: null,
      starts_at: { lte: new Date(at.getTime() + FESTIVAL_WINDOW_MS) },
      ends_at: { gte: at },
    },
    orderBy: { starts_at: 'asc' },
    select: { name: true },
  });
  return f?.name ?? null;
}

/**
 * A slide has one product but a design may have N slots: this slide's product first, then the
 * post's next products in order, wrapping round (a 4-slot design on a 2-slide post repeats).
 */
export function slotProducts(order: string[], productId: string, slots: number): string[] {
  const at = Math.max(0, order.indexOf(productId));
  const ring = order.length > 0 ? order : [productId];
  return Array.from({ length: slots }, (_, n) => ring[(at + n) % ring.length] as string);
}

/** Stored design_vars -> render input; anything malformed renders as empty text. */
function designVars(v: unknown): { custom_text?: string; offer_text?: string } {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  return {
    ...(typeof o.custom_text === 'string' ? { custom_text: o.custom_text.slice(0, 80) } : {}),
    ...(typeof o.offer_text === 'string' ? { offer_text: o.offer_text.slice(0, 80) } : {}),
  };
}

const keyFor = (retailerId: string, postId: string, tag: string) =>
  `retailers/${retailerId}/schedule/${postId}-${tag}-${Date.now().toString(36)}.jpg`;

async function renderItem(
  ctx: Ctx,
  item: RenderItem,
  template: string,
  postId: string,
  at: Date,
): Promise<string> {
  // A non-built-in template id is an admin design (design_templates.id): same render the
  // composer uses, with this slide's product. Draft / hidden / wrong-plan => throws => the
  // caller falls back to the original photo, so a retired design never blocks a post.
  if (!isSlideTemplate(template)) {
    const design = await findPublishedDesign(template, ctx.plan);
    if (!design) throw new Error('design unavailable');
    const out = await renderDesignJpeg({
      retailerId: ctx.retailerId,
      design,
      productIds: slotProducts(ctx.order, item.product_id, design.product_slots),
      custom: designVars(item.design_vars),
    });
    const key = keyFor(ctx.retailerId, postId, `${item.position}-design`);
    await uploadBuffer(key, out, 'image/jpeg');
    await bumpDesignUsage(design.id);
    return key;
  }
  const photo = photoFor(ctx, item);
  if (!photo) throw new Error('no photo');
  const [buf, festival, logo] = await Promise.all([
    bytes(ctx, photo.r2_key),
    template === 'festival_frame' ? nearestFestival(at) : Promise.resolve(null),
    template === 'logo_corner' && ctx.logoKey
      ? bytes(ctx, ctx.logoKey).catch(() => null)
      : Promise.resolve(null),
  ]);
  const out = await renderSlide(template, {
    photo: buf,
    pricePaise: ctx.products.get(item.product_id)?.price_min ?? null,
    storeName: ctx.storeName,
    festival,
    logo,
  });
  const key = keyFor(ctx.retailerId, postId, `${item.position}-${template}`);
  await uploadBuffer(key, out, 'image/jpeg');
  return key;
}

/**
 * Immediate render for the "Style this" route: renders, stores the key on the
 * item, returns it. Throws on failure (the route reports it; the tick doesn't).
 */
export async function styleItemNow(
  retailerId: string,
  postId: string,
  item: RenderItem,
  template: string,
  at: Date,
): Promise<string> {
  const siblings = await prisma.scheduledPostItem.findMany({
    where: { scheduled_post_id: postId, retailer_id: retailerId },
    orderBy: { position: 'asc' },
    select: { product_id: true },
  });
  const order = siblings.map((s) => s.product_id);
  const ctx = await loadCtx(retailerId, [item.product_id], order.length ? order : undefined);
  const key = await renderItem(ctx, item, template, postId, at);
  await prisma.scheduledPostItem.updateMany({
    where: { id: item.id, retailer_id: retailerId },
    data: { image_level: 'TEMPLATE', template_id: template, resolved_image_key: key },
  });
  return key;
}

/** Public URLs for a post's slides, in publish order (cover first if built). */
export async function resolvePostImages(args: {
  retailerId: string;
  postId: string;
  scheduledAt: Date;
  coverStyle: string | null;
  items: RenderItem[];
}): Promise<string[]> {
  const { retailerId, postId, scheduledAt, coverStyle, items } = args;
  const ctx = await loadCtx(
    retailerId,
    [...new Set(items.map((i) => i.product_id))],
    items.map((i) => i.product_id),
  );

  const templated = (i: RenderItem) => i.image_level === 'TEMPLATE' && !!i.template_id;
  const withCover = isCoverStyle(coverStyle) && items.length >= 2 && items.length < MAX_SLIDES;
  const normalizeRest = withCover || items.some(templated);

  const urls: string[] = [];
  for (const item of items) {
    const photo = photoFor(ctx, item);
    if (!photo) continue; // tick already guards "no photos at all"
    try {
      if (templated(item)) {
        let key = item.resolved_image_key;
        if (!key) {
          key = await renderItem(ctx, item, item.template_id as string, postId, scheduledAt);
          await prisma.scheduledPostItem.updateMany({
            where: { id: item.id, retailer_id: retailerId },
            data: { resolved_image_key: key },
          });
        }
        urls.push(publicUrl(key));
        continue;
      }
      if (normalizeRest) {
        const out = await normalizePhoto(await bytes(ctx, photo.r2_key));
        const key = keyFor(retailerId, postId, `${item.position}-norm`);
        await uploadBuffer(key, out, 'image/jpeg');
        urls.push(publicUrl(key));
        continue;
      }
    } catch (err) {
      console.error('[schedule-render] slide fell back to original', item.id, err);
    }
    urls.push(photo.url);
  }

  if (withCover && urls.length >= 2) {
    try {
      const sources = await Promise.all(
        items
          .slice(0, 4)
          .map((i) => photoFor(ctx, i))
          .filter((p): p is NonNullable<typeof p> => !!p)
          .map((p) => bytes(ctx, p.r2_key)),
      );
      const out = await renderCollage(sources, ctx.storeName);
      const key = keyFor(retailerId, postId, 'cover');
      await uploadBuffer(key, out, 'image/jpeg');
      urls.unshift(publicUrl(key));
    } catch (err) {
      console.error('[schedule-render] cover skipped', postId, err);
    }
  }
  return urls;
}

/** Counter only: a failed bump is logged and never loses a rendered slide. */
async function bumpDesignUsage(designId: string): Promise<void> {
  try {
    await prisma.designTemplate.update({
      where: { id: designId },
      data: { usage_count: { increment: 1 } },
    });
  } catch (err) {
    console.error('[schedule-render] usage_count bump failed', designId, err);
  }
}
