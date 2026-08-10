import { uploadBuffer } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';

// Background-removal cleanup overwrites a photo's own r2_key with the
// bg-stripped version (see products-media.ts, tag-product.ts) — the raw
// retailer upload was never kept anywhere. This preserves it at a sibling
// key so the mobile slider can show both.
function originalR2Key(r2Key: string): string {
  return r2Key.replace(/(\.[^./]+)$/, '-original$1');
}

/**
 * Uploads `raw` to a sibling R2 key and records it on the photo row —
 * but only the first time. Cleanup can re-run (retag, background swap),
 * and on a later run `raw` is already the cleaned photo, so once
 * metadata.original_r2_key is set, leave it alone.
 */
/**
 * In-place edits (cleanup/rotate/background) overwrite a photo's bytes at
 * its existing r2_key — the stored URL never changes, so CDN/client image
 * caches (expo-image, browser, Cloudflare edge) keep serving the pre-edit
 * bytes indefinitely. Stamping a version query param on the stored URL after
 * every in-place overwrite forces a fresh fetch everywhere that URL is used
 * (retailer app, customer storefront, admin) — not just this session.
 */
export function bumpPhotoUrlVersion(url: string): string {
  return `${url.split('?')[0]}?v=${Date.now()}`;
}

export async function preserveOriginalPhoto(
  photoId: string,
  r2Key: string,
  existingMetadata: unknown,
  raw: Buffer,
): Promise<void> {
  const meta = (existingMetadata as Record<string, unknown> | null) ?? {};
  if (meta.original_r2_key) return;
  const key = originalR2Key(r2Key);
  await uploadBuffer(key, raw, 'image/jpeg');
  await prisma.productPhoto.update({
    where: { id: photoId },
    data: { metadata: { ...meta, original_r2_key: key } },
  });
}
