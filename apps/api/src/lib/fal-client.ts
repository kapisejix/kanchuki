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
 * Submit and poll a Fal.ai model task (Flux 1.1 Pro, Schnell, or IDM-VTON).
 */
export async function runFalTask(
  modelEndpoint: string,
  input: Record<string, unknown>,
  onProgress?: (progress: { progress: number; etaMs: number }) => void,
): Promise<{ sampleUrl: string }> {
  const apiKey = await resolveFalKey();
  if (!apiKey) {
    throw new AppError('STUDIO_SHOOT_FAILED', 'Fal.ai API key is not configured in Admin → Integrations.', 503);
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
      throw new AppError('STUDIO_SHOOT_FAILED', 'Fal.ai account has insufficient balance or invalid key.', 402);
    }
    throw new AppError('STUDIO_SHOOT_FAILED', `Fal.ai task submission failed (${submitRes.status}): ${errorText}`, 503);
  }

  const submitData = (await submitRes.json()) as { request_id?: string; status_url?: string; response_url?: string; images?: { url: string }[]; image?: { url: string } };

  // If Fal returns the image synchronously
  if (submitData.images?.[0]?.url) return { sampleUrl: submitData.images[0].url };
  if (submitData.image?.url) return { sampleUrl: submitData.image.url };

  const requestId = submitData.request_id;
  const statusUrl = submitData.status_url || `${FAL_BASE}/${modelEndpoint}/requests/${requestId}/status`;
  const responseUrl = submitData.response_url || `${FAL_BASE}/${modelEndpoint}/requests/${requestId}`;

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
          const finalData = (await finalRes.json()) as { images?: { url: string }[]; image?: { url: string } };
          const resultUrl = finalData.images?.[0]?.url || finalData.image?.url;
          if (!resultUrl) throw new Error('No output image in Fal completed response');

          if (onProgress) onProgress({ progress: 100, etaMs: 0 });
          return { sampleUrl: resultUrl };
        }
        if (statusJson.status === 'FAILED' || statusJson.status === 'ERROR') {
          throw new AppError('STUDIO_SHOOT_FAILED', statusJson.error ?? 'Fal generation failed.', 500);
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
 * Run Flux 1.1 Pro image generation.
 */
export async function generateFluxProImage(
  prompt: string,
  options?: { inputImageUrl?: string; onProgress?: (p: { progress: number; etaMs: number }) => void },
): Promise<{ sampleUrl: string }> {
  const input: Record<string, unknown> = {
    prompt,
    image_size: 'portrait_4_3',
    num_inference_steps: 28,
    guidance_scale: 3.5,
    enable_safety_checker: true,
  };

  if (options?.inputImageUrl) {
    input.image_url = options.inputImageUrl;
  }

  return runFalTask('fal-ai/flux-pro/v1.1', input, options?.onProgress);
}

/**
 * Run Flux Schnell (fast & budget-friendly) generation.
 */
export async function generateFluxSchnellImage(
  prompt: string,
  options?: { inputImageUrl?: string; onProgress?: (p: { progress: number; etaMs: number }) => void },
): Promise<{ sampleUrl: string }> {
  const input: Record<string, unknown> = {
    prompt,
    image_size: 'portrait_4_3',
    num_inference_steps: 4,
    enable_safety_checker: true,
  };

  if (options?.inputImageUrl) {
    input.image_url = options.inputImageUrl;
  }

  return runFalTask('fal-ai/flux/schnell', input, options?.onProgress);
}

/**
 * Run IDM-VTON / CatVTON Virtual Try-On (drape garment photo onto model photo).
 */
export async function generateIdmVtonTryon(
  humanImageUrl: string,
  garmentImageUrl: string,
  description = 'Indian ethnic wear garment',
  onProgress?: (p: { progress: number; etaMs: number }) => void,
): Promise<{ sampleUrl: string }> {
  const input = {
    human_img_url: humanImageUrl,
    garm_img_url: garmentImageUrl,
    garment_des: description,
    is_checked: true,
    is_checked_crop: false,
    denoise_steps: 30,
    seed: 42,
  };

  return runFalTask('fal-ai/idm-vton', input, onProgress);
}

