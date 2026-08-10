// Shared product-route helpers/schemas extracted from products.ts
// (scripts/check-route-size.sh split). Route modules import from here.
import { getDownloadPresignedUrl } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { SIZE_OPTIONS } from '@kanchuki/shared';
import { z } from 'zod';

// ─── On-Demand ISR Revalidation ───────────────────────────────────
// After a product status change, purge the ISR cache for every collection
// link page that includes this product, so the badge updates instantly.

const WEB_URL = process.env.WEB_URL ?? '';
const REVALIDATION_SECRET = process.env.REVALIDATION_SECRET ?? '';

export async function revalidateCollectionsForProduct(productId: string): Promise<void> {
  if (!WEB_URL || !REVALIDATION_SECRET) return;

  try {
    const collectionProducts = await prisma.collectionProduct.findMany({
      where: { product_id: productId },
      include: {
        collection: {
          select: {
            slug: true,
            retailer: { select: { public_slug: true } },
          },
        },
      },
    });

    // Canonical collection pages live at /{public_slug}/{slug}; retailers
    // without a store slug fall back to the legacy /c/{slug} path. Revalidate
    // whichever paths apply.
    const pages = [
      ...new Set(
        collectionProducts.map((cp) => {
          const { slug, retailer } = cp.collection;
          return retailer.public_slug ? `/${retailer.public_slug}/${slug}` : `/c/${slug}`;
        }),
      ),
    ];
    if (pages.length === 0) return;

    await Promise.allSettled(
      pages.map((path) =>
        fetch(`${WEB_URL}/api/revalidate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret: REVALIDATION_SECRET, path }),
          signal: AbortSignal.timeout(5000),
        }),
      ),
    );
  } catch {
    // Revalidation is best-effort
  }
}

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

export const ALLOWED_SPIN_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime'] as const;
export const MAX_SPIN_VIDEO_BYTES = 50_000_000; // ~50MB, a few seconds of 1080p

export const CreateProductSchema = z.object({
  photo_r2_key: z.string().min(1),
  photo_url: z.string().url(),
  price_min: z.number().int().min(0).max(100_000_000).optional(),
  price_max: z.number().int().min(0).max(100_000_000).optional(),
  mrp: z.number().int().min(0).max(100_000_000).optional(),
  name: z.string().max(150).optional(),
  sku: z.string().max(40).optional(),
  description: z.string().max(1000).optional(),
  category: z.string().max(100).optional(),
  subtype: z.string().max(100).optional(),
  product_type: z.string().max(50).optional(),
  primary_color: z.string().max(50).optional(),
  secondary_colors: z.array(z.string().max(50)).max(10).optional(),
  fabric_estimate: z.string().max(100).optional(),
  pattern: z.string().max(100).optional(),
  embellishments: z.array(z.string().max(100)).max(10).optional(),
  neck_style: z.string().max(100).optional(),
  sleeve_type: z.string().max(100).optional(),
  occasions: z.array(z.string().max(100)).max(10).optional(),
  styles: z.array(z.string().max(100)).max(10).optional(),
  fabrics: z.array(z.string().max(100)).max(10).optional(),
  search_tags: z.array(z.string().max(100)).max(20).optional(),
  sizes: z.array(z.enum(SIZE_OPTIONS)).max(SIZE_OPTIONS.length).optional(),
  section_id: z.string().optional(),
  category_id: z.string().nullable().optional(),
  location_notes: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['AVAILABLE', 'SOLD', 'RESERVED', 'NOT_SURE']).optional(),
  auto_cleanup: z.boolean().optional().default(true),
  background_image_id: z.string().nullable().optional(),
});

export const UpdateProductSchema = CreateProductSchema.partial().omit({
  photo_r2_key: true,
  photo_url: true,
});

export const ListProductsQuerySchema = z.object({
  status: z.enum(['AVAILABLE', 'SOLD', 'RESERVED', 'NOT_SURE']).optional(),
  category: z.string().optional(),
  category_id: z.string().optional(),
  is_new_arrival: z.coerce.boolean().optional(),
  // F-025 scan-to-sell: exact-match SKU lookup (SKUs are auto-generated per
  // retailer, e.g. LS0001, @@unique([retailer_id, sku])). Same no-owner-gate
  // behavior as the rest of this list endpoint — shop staff (Staff model)
  // may scan-to-sell too, per F-025. Do NOT copy an owner-only gate here.
  sku: z.string().trim().min(1).max(64).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Photo URL helper ──────────────────────────────────────────────
// If the stored public URL does not start with http (R2_PUBLIC_URL may not be set),
// generate a presigned GET URL instead.  getSignedUrl is fast (no network call,
// just HMAC signing), so this works on every request without caching.

export async function photoUrlToDisplay(
  photo: { url: string; r2_key: string | null } | null | undefined,
): Promise<string | null> {
  if (!photo) return null;
  // Already a valid HTTP(S) URL — use as-is (includes R2 public URLs,
  // Cloudflare CDN URLs, presigned URLs, externally-hosted photos, etc.)
  if (photo.url.startsWith('http://') || photo.url.startsWith('https://')) {
    return photo.url;
  }
  // URL is a relative path (R2_PUBLIC_URL not set) — try presigned GET URL
  if (photo.r2_key) {
    try {
      return await getDownloadPresignedUrl(photo.r2_key, 3600);
    } catch {
      // Presigned URL generation failed (R2 credentials not configured).
      // Return the original URL as a last-resort fallback — it won't load
      // in the browser, but it's better than silently showing null and a
      // blank card with no indication of the problem.
      return photo.url || null;
    }
  }
  // No r2_key and URL is relative — nothing we can do
  return photo.url || null;
}
