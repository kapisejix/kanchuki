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
}

interface Ctx {
  retailerId: string;
  storeName: string;
  logoKey: string | null;
  photos: { id: string; product_id: string; url: string; r2_key: string; is_primary: boolean }[];
  products: Map<string, { name: string | null; price_min: number | null }>;
  buffers: Map<string, Buffer>;
}

async function loadCtx(retailerId: string, productIds: string[]): Promise<Ctx> {
  const [retailer, photos, products] = await Promise.all([
    prisma.retailer.findUniqueOrThrow({
      where: { id: retailerId },
      select: { shop_name: true, logo_r2_key: true },
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
    retailerId,
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

const keyFor = (retailerId: string, postId: string, tag: string) =>
  `retailers/${retailerId}/schedule/${postId}-${tag}-${Date.now().toString(36)}.jpg`;

async function renderItem(
  ctx: Ctx,
  item: RenderItem,
  template: SlideTemplate,
  postId: string,
  at: Date,
): Promise<string> {
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
  template: SlideTemplate,
  at: Date,
): Promise<string> {
  const ctx = await loadCtx(retailerId, [item.product_id]);
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
  const ctx = await loadCtx(retailerId, [...new Set(items.map((i) => i.product_id))]);

  const templated = (i: RenderItem) =>
    i.image_level === 'TEMPLATE' && isSlideTemplate(i.template_id);
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
          key = await renderItem(ctx, item, item.template_id as SlideTemplate, postId, scheduledAt);
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
