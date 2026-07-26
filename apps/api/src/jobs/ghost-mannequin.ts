import { generateGhostMannequin, publicUrl, uploadBuffer } from '@kanchuki/ai';
import type { Prisma } from '@kanchuki/db';
import { prisma } from '@kanchuki/db';
import { R2_PATHS } from '@kanchuki/shared';

export interface GhostMannequinJobData {
  /** The product whose primary photo needs a ghost-mannequin version */
  product_id: string;
  /** Retailer that owns the product */
  retailer_id: string;
  /** Public URL of the source garment photo (the product's primary photo) */
  photo_url: string;
  /** R2 key of the source photo, used for upload-into-place */
  photo_r2_key: string;
  /** The ProductPhoto.id being processed — updates its url on success */
  product_photo_id: string;
}

/**
 * handleGhostMannequin — async job handler for F-001e.
 *
 * Flow:
 * 1. Sends the product's primary photo to Snappyit ghost-mannequin API
 * 2. Receives the hollow-body result image
 * 3. Uploads the result to R2 at a deterministic key
 * 4. Updates the ProductPhoto record so the catalog shows the new image
 * 5. On failure: logs and completes silently — never blocks product save
 */
export async function handleGhostMannequin(data: GhostMannequinJobData): Promise<void> {
  const { product_id, retailer_id, photo_url, product_photo_id } = data;

  try {
    // 1. Call Snappyit API
    const result = await generateGhostMannequin(photo_url);

    // 2. Upload result to R2
    const r2Key = R2_PATHS.ghostMannequin(retailer_id, product_id);
    await uploadBuffer(r2Key, result.outputBuffer, 'image/jpeg');

    const resultUrl = publicUrl(r2Key);

    // 3. Update the ProductPhoto — replace the source URL with the
    //    ghost-mannequin result and store generation provenance in metadata.
    await prisma.productPhoto.update({
      where: { id: product_photo_id },
      data: {
        url: resultUrl,
        r2_key: r2Key,
        metadata: {
          ghost_mannequin_provider: 'snappyit',
          ghost_mannequin_generated_at: new Date().toISOString(),
          original_photo_url: photo_url,
        } as Prisma.InputJsonValue,
      },
    });

    console.log(
      `[GhostMannequin] Generated for product ${product_id}: ${resultUrl}`,
    );
  } catch (err) {
    // F-001e: log + re-throw for BullMQ retry. This does NOT block product
    // save — the product was already created before this job was queued.
    // BullMQ retries (2 attempts, 10s backoff) handle transient API failures.
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[GhostMannequin] Failed for product ${product_id} (photo ${product_photo_id}): ${message}`,
    );

    // Record the failure in metadata so admin can see it without digging into
    // job queue logs. Best-effort — failure recording shouldn't cascade.
    await prisma.productPhoto
      .update({
        where: { id: product_photo_id },
        data: {
          metadata: {
            ghost_mannequin_error: message.slice(0, 500),
            ghost_mannequin_failed_at: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      })
      .catch(() => {});

    throw err; // re-throw so BullMQ records the failure and retries
  }
}

export default handleGhostMannequin
