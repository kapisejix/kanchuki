// T5 — AI custom-prompt social design job (runs on the STUDIO_SHOOT queue, job name
// 'ai-custom-design'). docs/tasks/pending/admin-social-design-templates.md §5.
//
// Flow: POST /me/ai-designs reserved one AI_CUSTOM_TEMPLATE slot (keyed by job_id) and wrote a
// PENDING ai_custom_designs row with id = job_id. This job generates the image with the SAME
// FLUX Kontext path AI Studio Shoot uses, stores it under retailers/<id>/designs/<hex>.jpg (the
// path the composer's IMAGE post accepts) and flips the row to READY. The row — not Redis — is the
// record, so the result survives a reload and the poll route just reads it.
//
// The slot stays spent only once the row is READY; every other exit hands it back in `finally`
// (BullMQ counts a plain `return` as completed, so its `failed` hook never sees those).
import { randomBytes } from 'node:crypto';
import {
  type AiDesignFormat,
  type AiDesignOverlay,
  downloadBuffer,
  finishDesignImage,
} from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { buildDesignPrompt, buildPosterPrompt } from '../lib/ai-custom-design.js';
import { recordBflStudioUsage } from '../lib/ai-usage.js';
import { findPublishedAiPoster, renderDesignJpeg } from '../lib/design-post-render.js';
import { markJobQuotaSpent, refundJobQuota } from '../lib/quota.js';
import { downloadCompressAndUpload, generateStudioImage } from '../lib/studio-shoot.js';
import { studioSourceUrl } from './studio-shoot.js';

export interface AiCustomDesignJobData {
  job_id: string;
  retailer_id: string;
  product_id: string;
  photo_id: string;
  /** Already passed sanitizeDesignPrompt in the route. */
  prompt: string;
  /** Output shape; ORIGINAL (or missing, for a job queued before this field) keeps the model's aspect. */
  format?: AiDesignFormat;
  /** Free price / badge / logo overlay from the built-in slide renderer (forces 4:5). */
  overlay?: AiDesignOverlay | null;
  /** AI poster request (Task 8 job body): the admin design + the retailer's typed text. */
  template_id?: string;
  custom_text?: string;
  offer_text?: string;
}

// Social posters get a bigger budget than the 80 KB catalog default (they are shown full-screen).
const POSTER_BUDGET = { maxBytes: 450 * 1024, maxDimension: 2000, startQuality: 92 };

export const GENERIC_FAILURE = 'The design could not be made. Please try again.';

async function markFailed(id: string, retailerId: string, error: string): Promise<void> {
  try {
    await prisma.aiCustomDesign.updateMany({
      where: { id, retailer_id: retailerId, status: 'PENDING' },
      data: { status: 'FAILED', error },
    });
  } catch (err) {
    // The poll route would show PENDING forever; the hourly quota sweep still settles the slot.
    console.error(`[ai-custom-design] could not mark ${id} failed:`, err);
  }
}

export async function handleAiCustomDesign(data: AiCustomDesignJobData): Promise<void> {
  const {
    job_id,
    retailer_id,
    product_id,
    photo_id,
    prompt,
    format = 'ORIGINAL',
    overlay = null,
    template_id,
    custom_text,
    offer_text,
  } = data;
  let spent = false;
  try {
    // Queue = trust boundary: re-check the photo belongs to this retailer's product.
    const photo = await prisma.productPhoto.findFirst({
      where: { id: photo_id, product_id, retailer_id },
    });
    const sourceUrl = photo ? await studioSourceUrl(photo) : null;
    if (!photo || !sourceUrl) {
      await markFailed(job_id, retailer_id, 'The product photo is no longer available.');
      return;
    }
    // AI poster: re-resolve the design now (it may have been unpublished or the plan changed
    // since the route queued us). Gone => no model call, the finally block refunds the slot.
    let poster: NonNullable<Awaited<ReturnType<typeof findPublishedAiPoster>>> | null = null;
    let posterPrompt: string | null = null;
    if (template_id) {
      const retailer = await prisma.retailer.findUnique({
        where: { id: retailer_id },
        select: { plan: true },
      });
      poster = retailer ? await findPublishedAiPoster(template_id, retailer.plan) : null;
      if (!poster?.ai_prompt) {
        await markFailed(job_id, retailer_id, 'This design is no longer available.');
        return;
      }
      posterPrompt = poster.ai_prompt;
    }
    const product = await prisma.product.findFirst({
      where: { id: product_id, retailer_id, deleted_at: null },
      select: {
        name: true,
        category: true,
        subtype: true,
        primary_color: true,
        secondary_colors: true,
        fabric_estimate: true,
        pattern: true,
        embellishments: true,
        price_min: true,
        retailer: { select: { shop_name: true, logo_r2_key: true } },
      },
    });
    if (!product) {
      await markFailed(job_id, retailer_id, 'The product is no longer available.');
      return;
    }

    const result = await generateStudioImage(sourceUrl, {
      // Poster: admin prompt only. The retailer's typed text is rendered over the scene, never sent to the model.
      prompt: posterPrompt ? buildPosterPrompt(posterPrompt) : buildDesignPrompt(prompt),
      tab: 'PRODUCT',
      product: {
        name: product.name,
        category: product.category,
        subtype: product.subtype,
        primary_color: product.primary_color,
        secondary_colors: product.secondary_colors,
        fabric: product.fabric_estimate,
        pattern: product.pattern,
        embellishments: product.embellishments,
      },
    });
    const payload = result.base64Data || result.sampleUrl;
    if (result.status !== 'ready' || !payload) {
      await markFailed(job_id, retailer_id, GENERIC_FAILURE);
      return;
    }

    // hex name: the mobile composer only accepts /retailers/<id>/designs/<hex>.jpg
    const key = `retailers/${retailer_id}/designs/${randomBytes(12).toString('hex')}.jpg`;
    // Only an overlay needs the retailer's logo; a missing/unreadable one falls back to the store-name pill.
    const logo =
      !poster && overlay === 'logo_corner' && product.retailer?.logo_r2_key
        ? await downloadBuffer(product.retailer.logo_r2_key).catch(() => null)
        : null;
    const uploaded = await downloadCompressAndUpload(payload, key, Boolean(result.base64Data), {
      compress: POSTER_BUDGET,
      transform: (raw) =>
        poster
          ? renderDesignJpeg({
              retailerId: retailer_id,
              design: poster,
              productIds: [product_id],
              custom: { custom_text, offer_text },
              backgroundOverride: raw,
              omitProductImages: true,
            })
          : finishDesignImage(raw, {
              format,
              overlay,
              slide: {
                pricePaise: product.price_min ?? null,
                storeName: product.retailer?.shop_name ?? '',
                festival: null,
                logo,
              },
            }),
    });

    await prisma.aiCustomDesign.update({
      where: { id: job_id },
      data: { status: 'READY', image_key: uploaded.key, image_url: uploaded.url, error: null },
    });
    // READY is the durable trace of a paid result: settle the slot as spent. A failed mark is
    // logged, not fatal; the sweep sees the READY row and marks it spent instead of refunding.
    spent = true;
    if (poster) {
      // Counter only (same as schedule-render's bump): a failure never fails a paid result.
      await prisma.designTemplate
        .update({ where: { id: poster.id }, data: { usage_count: { increment: 1 } } })
        .catch((err) => console.error('[ai-custom-design] usage_count bump failed:', err));
    }
    await markJobQuotaSpent(job_id, 'AI_CUSTOM_TEMPLATE').catch((err) => {
      console.error(`[ai-custom-design] failed to mark quota spent for ${job_id}:`, err);
    });
    recordBflStudioUsage(retailer_id, 'ai_custom');
  } catch (err) {
    console.error(`[ai-custom-design] job ${job_id} failed:`, err);
    await markFailed(job_id, retailer_id, GENERIC_FAILURE);
    // Throw so BullMQ marks the job failed (no auto-retry: each run costs real credits).
    throw err;
  } finally {
    if (!spent) {
      await refundJobQuota(job_id, 'AI_CUSTOM_TEMPLATE').catch((err) => {
        console.error(`[ai-custom-design] failed to refund quota for ${job_id}:`, err);
      });
    }
  }
}
