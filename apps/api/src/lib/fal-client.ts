import { getSecret } from '@kanchuki/db';
import { AppError } from '../plugins/error-handler.js';

const FAL_BASE = 'https://queue.fal.run';

export async function resolveFalKey(): Promise<string | null> {
  const secret = await getSecret('FAL_API_KEY').catch(() => null);
  return secret || process.env.FAL_API_KEY || process.env.FAL_KEY || null;
}

export function isFalConfigured(): boolean {
  return Boolean(process.env.FAL_API_KEY || process.env.FAL_KEY);
}

/**
 * Submit and poll a Fal.ai model task (FLUX Pro / Kontext, FASHN v1.5
 * try-on).
 */
export async function runFalTask(
  modelEndpoint: string,
  input: Record<string, unknown>,
  onProgress?: (progress: { progress: number; etaMs: number }) => void,
): Promise<{ sampleUrl: string }> {
  const apiKey = await resolveFalKey();
  if (!apiKey) {
    throw new AppError(
      'STUDIO_SHOOT_FAILED',
      'Fal.ai API key is not configured in Admin → Integrations.',
      503,
    );
  }

  // 1. Submit task to Fal queue
  const submitUrl = `${FAL_BASE}/${modelEndpoint}`;
  const submitRes = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(30_000),
  });

  if (!submitRes.ok) {
    const errorText = await submitRes.text().catch(() => '');
    if (submitRes.status === 402 || submitRes.status === 403) {
      throw new AppError(
        'STUDIO_SHOOT_FAILED',
        'Fal.ai account has insufficient balance or invalid key.',
        402,
      );
    }
    throw new AppError(
      'STUDIO_SHOOT_FAILED',
      `Fal.ai task submission failed (${submitRes.status}): ${errorText}`,
      503,
    );
  }

  const submitData = (await submitRes.json()) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
    images?: { url: string }[];
    image?: { url: string };
  };

  // If Fal returns the image synchronously
  if (submitData.images?.[0]?.url) return { sampleUrl: submitData.images[0].url };
  if (submitData.image?.url) return { sampleUrl: submitData.image.url };

  const requestId = submitData.request_id;
  const statusUrl =
    submitData.status_url || `${FAL_BASE}/${modelEndpoint}/requests/${requestId}/status`;
  const responseUrl =
    submitData.response_url || `${FAL_BASE}/${modelEndpoint}/requests/${requestId}`;

  // 2. Poll until completed
  const startTime = Date.now();
  const timeoutMs = 180_000;
  const deadline = startTime + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));

    const elapsed = Date.now() - startTime;
    if (onProgress) {
      const progress = Math.min(95, Math.floor((elapsed / timeoutMs) * 100));
      const etaMs = Math.max(0, timeoutMs - elapsed);
      onProgress({ progress, etaMs });
    }

    try {
      const statusRes = await fetch(statusUrl, {
        headers: { Authorization: `Key ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (statusRes.ok) {
        const statusJson = (await statusRes.json()) as { status?: string; error?: string };
        if (statusJson.status === 'COMPLETED') {
          // Fetch final response
          const finalRes = await fetch(responseUrl, {
            headers: { Authorization: `Key ${apiKey}` },
            signal: AbortSignal.timeout(10_000),
          });
          const finalData = (await finalRes.json()) as {
            images?: { url: string }[];
            image?: { url: string };
          };
          const resultUrl = finalData.images?.[0]?.url || finalData.image?.url;
          if (!resultUrl) throw new Error('No output image in Fal completed response');

          if (onProgress) onProgress({ progress: 100, etaMs: 0 });
          return { sampleUrl: resultUrl };
        }
        if (statusJson.status === 'FAILED' || statusJson.status === 'ERROR') {
          throw new AppError(
            'STUDIO_SHOOT_FAILED',
            statusJson.error ?? 'Fal generation failed.',
            500,
          );
        }
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      // Transient error, keep polling
    }
  }

  throw new AppError('STUDIO_SHOOT_FAILED', 'Generation timed out. Please try again.', 504);
}

/**
 * Run Flux Image-to-Image transformation to preserve exact garment colors and structure.
 */
export async function generateFluxImageToImage(
  prompt: string,
  inputImageUrl: string,
  options?: { strength?: number; onProgress?: (p: { progress: number; etaMs: number }) => void },
): Promise<{ sampleUrl: string }> {
  const input: Record<string, unknown> = {
    prompt,
    image_url: inputImageUrl,
    strength: options?.strength ?? 0.65,
    guidance_scale: 3.5,
    num_inference_steps: 28,
    enable_safety_checker: true,
  };

  return runFalTask('fal-ai/flux/dev/image-to-image', input, options?.onProgress);
}

/**
 * FLUX.1 Kontext [pro] via fal.ai — instruction-based image edit that keeps
 * everything the prompt does NOT mention (i.e. the garment) pixel-unchanged.
 * This is the correct model for "swap the scene, keep the product". Plain
 * flux img2img (strength 0.65) and Imagen (txt2img) both regenerate the
 * clothing and shift its colour — do not use them for studio shoots.
 */
export async function generateFluxKontext(
  prompt: string,
  inputImageUrl: string,
  onProgress?: (p: { progress: number; etaMs: number }) => void,
): Promise<{ sampleUrl: string }> {
  return runFalTask(
    'fal-ai/flux-pro/kontext',
    {
      prompt,
      image_url: inputImageUrl,
      guidance_scale: 3.5,
      num_images: 1,
      output_format: 'jpeg',
      safety_tolerance: '2',
    },
    onProgress,
  );
}

/**
 * Run Flux 1.1 Pro image generation.
 */
export async function generateFluxProImage(
  prompt: string,
  options?: {
    inputImageUrl?: string;
    onProgress?: (p: { progress: number; etaMs: number }) => void;
  },
): Promise<{ sampleUrl: string }> {
  if (options?.inputImageUrl) {
    return generateFluxImageToImage(prompt, options.inputImageUrl, {
      onProgress: options.onProgress,
    });
  }

  const input: Record<string, unknown> = {
    prompt,
    negative_prompt:
      'color shift, hue change, altered fabric color, color bleed, recoloring, washed out colors, oversaturated, tinted fabric, distorted embroidery, mismatched patterns, altered texture, color cast',
    image_size: 'portrait_4_3',
    num_inference_steps: 28,
    guidance_scale: 3.5,
    enable_safety_checker: true,
  };

  return runFalTask('fal-ai/flux-pro/v1.1', input, options?.onProgress);
}

// ─── Deliberately absent: the IDM-VTON / CatVTON try-on helper ──────────────
//
// A `generateIdmVtonTryon()` used to sit here. It was deleted on 2026-09-18
// rather than repaired:
//   - nothing called it (its last caller went with the 2026-08-30 studio-styles
//     rework, which replaced the photo-identity models with a prompt path), so
//     it had never executed once — the same shape as `generateFashnTryon()`,
//     which turned out to be pointed at an endpoint that would 404.
//   - its input names (`human_img_url`, `garm_img_url`, `garment_des`) were never
//     verified against the model's schema, so the first real caller would have
//     discovered that, not the tests.
//   - IDM-VTON's released checkpoints are CC BY-NC-SA-ND (non-commercial, and
//     no-derivatives, which blocks redistributing a fine-tune) — see
//     `docs/TECH-STACK.md (ADR-006 section)`.
// The self-hosted `services/fashion-vtone` (FASHN VTON v1.5) is not wired into
// the API either.
//
// The live try-on step is FASHN v1.5, below — garment-conditioned, so the
// retailer's actual dye, print and embroidery survive. Do not revive the above:
// `retired-tryon-guard.test.ts` fails if that name, that endpoint, or its
// parameter names reappear as code under apps/, packages/ or scripts/.

/**
 * FASHN v1.5 Virtual Try-On via fal.ai — maskless, garment-conditioned. This is
 * the half of a studio shoot that keeps the ACTUAL product: the model is
 * conditioned on the garment image, so its colour, print and embroidery survive
 * in a way no text prompt can enforce.
 *
 * Contract verified 2026-09-18 against fal.ai/models/fal-ai/fashn/tryon/v1.5/api —
 * the previous version of this function had never been called, and it was wrong
 * in ways that would have 404'd or been silently ignored on first use:
 *   - endpoint was `fal-ai/fashn/tryon-v1.5` (dashes) — the real path is
 *     `fal-ai/fashn/tryon/v1.5` (slashes), so the submit would 404.
 *   - it sent `long_top`, `nsfw_filter`, `cover_feet`, `adjust_hands` and
 *     `restore_background` — NONE of these exist in the v1.5 schema. (Docs and
 *     BUILD-LOG credited this function with "Indian long_top support"; that
 *     came from the phantom parameter, not a real capability.)
 *   - moderation is `moderation_level`, not `nsfw_filter`.
 *
 * Real inputs: model_image*, garment_image*, category, mode, garment_photo_type,
 * moderation_level, seed, num_samples, segmentation_free, sync_mode,
 * output_format. Default `category: 'auto'` lets FASHN detect the garment class
 * rather than us guessing it from our own taxonomy — a kurta SET is not cleanly
 * "tops", and one-pieces (saree, gown, anarkali) are their own class.
 *
 * Output is 576x864 at v1.5 ($0.075/generation).
 */
export async function generateFashnTryon(
  humanImageUrl: string,
  garmentImageUrl: string,
  category: 'tops' | 'bottoms' | 'one-pieces' | 'auto' = 'auto',
  options?: {
    mode?: 'quality' | 'balanced' | 'performance';
    garmentPhotoType?: 'auto' | 'flat-lay' | 'model';
    onProgress?: (p: { progress: number; etaMs: number }) => void;
  },
): Promise<{ sampleUrl: string }> {
  const input = {
    model_image: humanImageUrl,
    garment_image: garmentImageUrl,
    category,
    mode: options?.mode ?? 'quality',
    garment_photo_type: options?.garmentPhotoType ?? 'flat-lay',
    moderation_level: 'permissive',
    num_samples: 1,
    output_format: 'jpeg',
  };

  return runFalTask('fal-ai/fashn/tryon/v1.5', input, options?.onProgress);
}

/**
 * Fal image-EDIT engines for the admin model bench. Every entry takes the
 * product photo (`image_urls`) plus a prompt and returns `images[0].url`, which
 * is the shape `runFalTask` already parses — so one table replaces eight
 * near-identical helpers.
 *
 * Request bodies were read from each endpoint's own OpenAPI
 * (`GET api.fal.ai/v1/models?endpoint_id=…&expand=openapi-3.0`) on 2026-09-19,
 * not guessed: an invented parameter name is what made the first FASHN helper
 * 404. Only `output_format`/`quality`/`resolution` are set beyond the required
 * pair, to keep output a JPEG at each model's default size. Re-read the schema
 * before adding a field.
 *
 * Keys must stay a subset of STUDIO_ENGINES (@kanchuki/shared) — a test checks.
 */
export const FAL_EDIT_ENGINES = {
  flux2_pro: { endpoint: 'fal-ai/flux-2-pro/edit', extra: { output_format: 'jpeg' } },
  gpt_image_2_low: {
    endpoint: 'openai/gpt-image-2/edit',
    extra: { quality: 'low', output_format: 'jpeg', num_images: 1 },
  },
  gpt_image_2_medium: {
    endpoint: 'openai/gpt-image-2/edit',
    extra: { quality: 'medium', output_format: 'jpeg', num_images: 1 },
  },
  gpt_image_2_high: {
    endpoint: 'openai/gpt-image-2/edit',
    extra: { quality: 'high', output_format: 'jpeg', num_images: 1 },
  },
  qwen_edit: {
    endpoint: 'fal-ai/qwen-image-edit-2511',
    extra: { output_format: 'jpeg', num_images: 1 },
  },
  nano_banana: {
    endpoint: 'fal-ai/nano-banana/edit',
    extra: { output_format: 'jpeg', num_images: 1 },
  },
  grok_imagine: {
    endpoint: 'xai/grok-imagine-image/v2.0/edit',
    extra: { output_format: 'jpeg', num_images: 1, resolution: '1k' },
  },
} as const satisfies Record<string, { endpoint: string; extra: Record<string, unknown> }>;

export type FalEditEngine = keyof typeof FAL_EDIT_ENGINES;

export function isFalEditEngine(engine: string | undefined): engine is FalEditEngine {
  return engine !== undefined && Object.hasOwn(FAL_EDIT_ENGINES, engine);
}

export async function generateFalEdit(
  engine: FalEditEngine,
  prompt: string,
  inputImageUrl: string,
  onProgress?: (progress: { progress: number; etaMs: number }) => void,
): Promise<{ sampleUrl: string }> {
  const { endpoint, extra } = FAL_EDIT_ENGINES[engine];
  return runFalTask(endpoint, { prompt, image_urls: [inputImageUrl], ...extra }, onProgress);
}
