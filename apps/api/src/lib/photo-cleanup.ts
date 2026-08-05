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
export async function preserveOriginalPhoto(
  photoId: string,
  r2Key: string,
  existingMetadata: unknown,
  raw: Buffer,
): Promise<void> {
  const meta = (existingMetadata as Record<string, unknown> | null) ?? {};
  if (meta['original_r2_key']) return;
  const key = originalR2Key(r2Key);
  await uploadBuffer(key, raw, 'image/jpeg');
  await prisma.productPhoto.update({
    where: { id: photoId },
    data: { metadata: { ...meta, original_r2_key: key } },
  });
}
