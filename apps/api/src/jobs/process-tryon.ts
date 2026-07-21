import {
  deleteObject,
  publicUrl,
  saveTrainingConsentCopy,
  saveTryOnResultToR2,
  triggerTryOn,
  tryonResultR2Key,
  uploadBuffer,
} from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';

// Bump this string whenever the consent copy shown at capture time changes
// (docs/SECURITY.md §3b) — old TrainingPhotoConsent rows keep their original
// version so it's always clear what the customer actually agreed to.
const TRAINING_CONSENT_VERSION = '2026-07-13-v1';

export interface TryOnJobData {
  try_on_job_id: string;
  retailer_id: string;
  product_id: string;
  customer_photo_r2_key: string; // R2 key or URL for remote flow
  measurement_id?: string | null;
  is_remote?: boolean; // If true, customer_photo_r2_key is a URL, not an R2 key
  consent_to_training?: boolean; // F-102d — explicit opt-in, separate from processing consent
}

export async function handleProcessTryOn(data: TryOnJobData): Promise<void> {
  const {
    try_on_job_id,
    retailer_id,
    product_id,
    customer_photo_r2_key,
    is_remote,
    consent_to_training,
  } = data;

  try {
    // Get product photo URL
    const product = await prisma.product.findFirst({
      where: { id: product_id, retailer_id, deleted_at: null },
      select: {
        category: true,
        photos: {
          select: { url: true, is_primary: true, piece_type: true },
        },
      },
    });
    const primaryPhoto = product?.photos.find((p) => p.is_primary);
    if (!product || !primaryPhoto?.url) {
      throw new Error('Product not found or has no photo');
    }

    const productPhotoUrl = primaryPhoto.url;
    const pieceGarmentUrls = {
      upper: product.photos.find((p) => p.piece_type === 'upper')?.url,
      lower: product.photos.find((p) => p.piece_type === 'lower')?.url,
    };

    // For remote flow: customer_photo_r2_key may be a base64 data URL.
    // V-Tone's Python requests.get() can't fetch data: URLs, so upload to R2 first.
    // For in-store flow: it's an R2 key that needs to be converted to a public URL.
    let customerPhotoUrl: string;
    if (is_remote) {
      if (customer_photo_r2_key.startsWith('data:')) {
        // Decode base64 data URL → upload to R2 → use R2 public URL
        const matches = customer_photo_r2_key.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!matches) {
          throw new Error('Invalid customer photo: expected data:image/*;base64,...');
        }
        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        const b64 = matches[2];
        if (!b64) throw new Error('Invalid base64 data');
        const buffer = Buffer.from(b64, 'base64');
        const r2Key = tryonResultR2Key(try_on_job_id).replace('result', 'customer-input');
        await uploadBuffer(r2Key, buffer, `image/${ext}`);
        customerPhotoUrl = publicUrl(r2Key);
      } else {
        // Already a regular HTTP(S) URL
        customerPhotoUrl = customer_photo_r2_key;
      }
    } else {
      customerPhotoUrl = publicUrl(customer_photo_r2_key);
    }

    // Mark as processing
    await prisma.tryOnJob.update({
      where: { id: try_on_job_id },
      data: {
        status: 'PROCESSING',
        started_at: new Date(),
      },
    });

    // Trigger try-on engine (Fashion V-Tone v1.5)
    const triggerResult = await triggerTryOn({
      customerPhotoUrl,
      productPhotoUrl,
      productCategory: product.category,
      pieceGarmentUrls,
    });

    // Update with job ID
    await prisma.tryOnJob.update({
      where: { id: try_on_job_id },
      data: { api_job_id: triggerResult.jobId },
    });

    // Engine is synchronous — result already available from triggerTryOn
    const finalResult = triggerResult;

    if (finalResult.status === 'completed' && finalResult.outputUrls.length > 0) {
      // Save result to R2
      const outputUrl = finalResult.outputUrls[0];
      if (!outputUrl) throw new Error('No output URL from try-on engine');
      const resultPublicUrl = await saveTryOnResultToR2(try_on_job_id, outputUrl);

      // Calculate cost per try-on (V-Tone: ~$0.0003 on CPU, ~$0.003 on L4 GPU)
      const costUsd = 0.003;

      // Update job as completed
      await prisma.tryOnJob.update({
        where: { id: try_on_job_id },
        data: {
          status: 'COMPLETED',
          result_url: resultPublicUrl,
          result_r2_key: tryonResultR2Key(try_on_job_id),
          api_cost_usd: costUsd,
          completed_at: new Date(),
          result_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
          customer_photo_deleted_at: new Date(),
        },
      });

      // Log usage for billing/quotas
      await prisma.tryOnUsageLog
        .create({
          data: {
            retailer_id,
            try_on_job_id,
            product_id,
            cost_usd: costUsd,
            source: is_remote ? 'REMOTE' : 'IN_STORE',
            completed_at: new Date(),
          },
        })
        .catch(() => {
          // Non-critical — usage logging is informational, not required
        });

      // F-102d: customer explicitly opted in — persist a copy of this try-on's
      // photos to the admin-only training store BEFORE the privacy-delete
      // below runs. Failure here must never fail the try-on itself; the
      // customer already has their result regardless of whether training
      // storage succeeds.
      if (consent_to_training) {
        try {
          const copy = await saveTrainingConsentCopy(
            try_on_job_id,
            customerPhotoUrl,
            productPhotoUrl,
            resultPublicUrl,
          );
          await prisma.trainingPhotoConsent.create({
            data: {
              try_on_job_id,
              customer_photo_r2_key: copy.customerPhotoR2Key,
              garment_photo_r2_key: copy.garmentPhotoR2Key,
              result_r2_key: copy.resultR2Key,
              consent_version: TRAINING_CONSENT_VERSION,
              source: is_remote ? 'REMOTE' : 'IN_STORE',
              // revocation_token uses the Prisma @default(cuid()) — auto-generated
            },
          });
        } catch (err) {
          console.error(`[TryOn] training-consent copy failed for ${try_on_job_id}:`, err);
        }
      }

      // Delete customer photo from R2 (privacy)
      // Only for in-store flow where it's an R2 key
      if (!is_remote) {
        await deleteObject(customer_photo_r2_key).catch(() => {
          // Non-critical — photo removal isn't required for correctness
        });
      }
    } else {
      // Failed or timed out
      const errorMsg = finalResult.errorMessage ?? 'Try-on processing failed or timed out';
      await prisma.tryOnJob.update({
        where: { id: try_on_job_id },
        data: {
          status: 'FAILED',
          error_message: errorMsg,
          completed_at: new Date(),
        },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.tryOnJob.update({
      where: { id: try_on_job_id },
      data: {
        status: 'FAILED',
        error_message: message.slice(0, 500),
        completed_at: new Date(),
      },
    });
    throw err; // re-throw for BullMQ retry
  }
}
