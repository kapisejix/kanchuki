import { getSecret } from '@kanchuki/db';
import { AppError } from '../plugins/error-handler.js';

export async function resolveGeminiKey(): Promise<string | null> {
  const secret = await getSecret('GEMINI_API_KEY').catch(() => null);
  return secret || process.env.GEMINI_API_KEY || null;
}

export function isImagenConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Generate image via Google Imagen 3 / Imagen 3 Fast.
 */
export async function generateGoogleImagen(
  prompt: string,
  options?: {
    model?: 'imagen-3.0-generate-002' | 'imagen-3.0-fast-generate-001';
    aspectRatio?: '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
    onProgress?: (progress: { progress: number; etaMs: number }) => void;
  },
): Promise<{ sampleUrl?: string; base64Data?: string; mimeType: string }> {
  const apiKey = await resolveGeminiKey();
  if (!apiKey) {
    throw new AppError(
      'STUDIO_SHOOT_FAILED',
      'Google Gemini API key is not configured in Admin → Integrations.',
      503,
    );
  }

  const model = options?.model ?? 'imagen-3.0-generate-002';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`;

  if (options?.onProgress) {
    options.onProgress({ progress: 30, etaMs: 8000 });
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: options?.aspectRatio ?? '3:4',
        personGeneration: 'ALLOW_ADULT',
        safetySetting: 'block_medium_and_above',
        outputOptions: { mimeType: 'image/jpeg' },
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new AppError(
      'STUDIO_SHOOT_FAILED',
      `Google Imagen generation failed (${res.status}): ${errorText}`,
      503,
    );
  }

  const data = (await res.json()) as {
    predictions?: { bytesBase64Encoded?: string; mimeType?: string }[];
  };

  const prediction = data.predictions?.[0];
  if (!prediction?.bytesBase64Encoded) {
    throw new AppError('STUDIO_SHOOT_FAILED', 'No image returned from Google Imagen 3.', 500);
  }

  if (options?.onProgress) {
    options.onProgress({ progress: 100, etaMs: 0 });
  }

  return {
    base64Data: prediction.bytesBase64Encoded,
    mimeType: prediction.mimeType ?? 'image/jpeg',
  };
}
