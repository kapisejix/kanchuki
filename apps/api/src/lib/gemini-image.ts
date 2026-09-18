// Gemini native image generation ("Nano Banana") via the Interactions API.
//
// Replaces `imagen-client.ts`, which called `imagen-3.0-generate-002` on
// `models/{model}:predict` — a DIFFUSION TEXT-TO-IMAGE endpoint. Two things
// were wrong with it, and only the second one is obvious:
//
//   1. Wrong family. `imagen-3.0-*` is not Gemini's image capability. That is
//      the Nano Banana line — `gemini-3.1-flash-image` (Nano Banana 2),
//      `gemini-3-pro-image` (Nano Banana Pro), `gemini-3.1-flash-lite-image`
//      (Nano Banana 2 Lite); `gemini-2.5-flash-image` is the legacy one.
//   2. Structurally incapable of this job. Its body was `instances: [{ prompt }]`
//      with no image field at all, and `generateStudioImage()` never handed it
//      the product photo either. So the model rendered a garment it had never
//      seen, from a prompt that never named a garment type — "a plausible
//      stranger in a plausible stranger's clothes" was the correct output.
//
// Contract verified 2026-09-18 against ai.google.dev/api/interactions-api and
// ai.google.dev/gemini-api/docs/image-generation:
//   - POST https://generativelanguage.googleapis.com/v1beta/interactions
//     header `x-goog-api-key: <key>` (the key goes in a header, NOT a `?key=`
//     query param — a query param ends up in logs and error strings).
//     body: { model, input: [{type:'text',text}, {type:'image',mime_type,data}] }
//     `input` is a plain string for text-only, or an array of content blocks.
//     An ImageContent block takes base64 `data` (+ `mime_type`); a bare `uri`
//     field exists in the schema but the documented input examples all use
//     base64, and a URL would make the model fetch our R2 object with our
//     credentials out of the picture.
//   - Response is an Interaction resource:
//     { id, object:'interaction', status, steps:[{ type:'model_output',
//       content:[ {type:'text',text} | {type:'image',data,mime_type} ] }] }
//     There is no top-level `predictions`/`images` array — the SDKs expose an
//     `output_image` convenience property that reads the steps, and for REST we
//     read the steps ourselves.
//   - `response_format: { type:'image', aspect_ratio }` requests an image
//     output. `image_size` (0.5K/1K/2K/4K) is deliberately NOT sent: 1K is the
//     default, it varies by model (Flash Lite is 1K-only), and a field we
//     cannot exercise is a field that 400s in production.
//
// Unlike the old client this one genuinely receives the photograph, so the
// SCENE_GUARD + garment-identity clauses that `studio-shoot.ts` assembles are
// instructions to an editor rather than a wish addressed to a generator.
import { readCappedBuffer, ssrfSafeFetch } from '@kanchuki/ai';
import { getSecret } from '@kanchuki/db';
import { AppError } from '../plugins/error-handler.js';

/**
 * The Nano Banana models we expose as engines. `gemini-3.1-flash-image` is the
 * generalist workhorse; `gemini-3-pro-image` is the premium tier.
 */
export type GeminiImageModel = 'gemini-3.1-flash-image' | 'gemini-3-pro-image';

const INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

/**
 * The Interactions API is synchronous and a 1K–4K image takes 10–60s. Matches
 * the old Imagen client's ceiling; the caller degrades to Kontext on timeout
 * rather than failing the job.
 */
const REQUEST_TIMEOUT_MS = 120_000;

/** Gemini's own mime-type allowlist, minus the ones nothing here produces. */
const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
};

export async function resolveGeminiKey(): Promise<string | null> {
  const secret = await getSecret('GEMINI_API_KEY').catch(() => null);
  return secret || process.env.GEMINI_API_KEY || null;
}

/**
 * The image block's `mime_type` is required and must be honest — declaring a
 * PNG as JPEG is the kind of thing that works until it doesn't. Our own keys
 * are `.jpg` (the compressor outputs JPEG), but the bench accepts any pasted
 * R2 URL, so read the extension and fall back to JPEG.
 */
export function inferImageMimeType(url: string): string {
  const path = url.split('?')[0]?.split('#')[0] ?? '';
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return MIME_BY_EXTENSION[ext] ?? 'image/jpeg';
}

/**
 * Pull the generated image out of an Interaction resource.
 *
 * LAST matching block wins, not first. Gemini 3 image models run a thinking
 * pass that emits interim "thought images" before the final output, and the
 * docs define `output_image` as the last generated image block for exactly
 * that reason — taking the first would hand back a draft the user never asked
 * for, and it would look like a quality regression rather than a parsing bug.
 *
 * Exported for tests: this is the one piece of the contract most likely to
 * drift when the API version changes.
 */
export function parseInteractionImage(
  payload: unknown,
): { base64Data: string; mimeType: string } | null {
  const steps = (payload as { steps?: unknown } | null)?.steps;
  if (!Array.isArray(steps)) return null;

  let found: { base64Data: string; mimeType: string } | null = null;
  for (const step of steps) {
    const content = (step as { content?: unknown } | null)?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      const b = block as { type?: unknown; data?: unknown; mime_type?: unknown } | null;
      if (!b || b.type !== 'image') continue;
      if (typeof b.data !== 'string' || b.data.length === 0) continue;
      found = {
        base64Data: b.data,
        mimeType: typeof b.mime_type === 'string' ? b.mime_type : 'image/jpeg',
      };
    }
  }
  return found;
}

/** `errors[].message` on a failed interaction, for a usable log/error line. */
function interactionError(payload: unknown): string | null {
  const errors = (payload as { errors?: unknown } | null)?.errors;
  if (!Array.isArray(errors)) return null;
  for (const e of errors) {
    const message = (e as { message?: unknown } | null)?.message;
    if (typeof message === 'string' && message) return message;
  }
  return null;
}

/**
 * Generate an image from a prompt, optionally editing a supplied photograph.
 *
 * When `inputImageUrl` is passed the photograph reaches the model as a real
 * input block — that is the entire difference between this and the client it
 * replaces.
 */
export async function generateGeminiImage(
  prompt: string,
  options?: {
    /** The photograph to edit. Omitted → text-to-image. */
    inputImageUrl?: string;
    model?: GeminiImageModel;
    aspectRatio?: '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
    onProgress?: (progress: { progress: number; etaMs: number }) => void;
  },
): Promise<{ base64Data: string; mimeType: string }> {
  const apiKey = await resolveGeminiKey();
  if (!apiKey) {
    throw new AppError(
      'STUDIO_SHOOT_FAILED',
      'Google Gemini API key is not configured in Admin → Integrations.',
      503,
    );
  }

  const input: Record<string, unknown>[] = [{ type: 'text', text: prompt }];

  if (options?.inputImageUrl) {
    // The image arrives as a URL because that is what the caller holds (an R2
    // public URL / signed URL). The API wants bytes, so fetch it — SSRF-safe,
    // because in the bench case the URL is admin-pasted.
    const res = await ssrfSafeFetch(options.inputImageUrl);
    if (!res.ok) {
      throw new AppError(
        'STUDIO_SHOOT_FAILED',
        `Could not read the source photo for Gemini (${res.status}).`,
        502,
      );
    }
    const bytes = await readCappedBuffer(res);
    input.push({
      type: 'image',
      mime_type: inferImageMimeType(options.inputImageUrl),
      data: bytes.toString('base64'),
    });
  }

  options?.onProgress?.({ progress: 45, etaMs: 20_000 });

  const res = await fetch(INTERACTIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      model: options?.model ?? 'gemini-3.1-flash-image',
      input,
      response_format: {
        type: 'image',
        aspect_ratio: options?.aspectRatio ?? '3:4',
      },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const bodyText = await res.text().catch(() => '');

  if (!res.ok) {
    throw new AppError(
      'STUDIO_SHOOT_FAILED',
      `Gemini image generation failed (${res.status}): ${bodyText.slice(0, 300)}`,
      503,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    throw new AppError('STUDIO_SHOOT_FAILED', 'Gemini returned an unreadable response.', 502);
  }

  // A 200 can still carry a failed interaction — check the resource status
  // before looking for an image, or a safety refusal reads as "no image".
  const status = (payload as { status?: unknown }).status;
  if (status === 'failed' || status === 'cancelled' || status === 'budget_exceeded') {
    throw new AppError(
      'STUDIO_SHOOT_FAILED',
      interactionError(payload) ?? `Gemini did not produce an image (${String(status)}).`,
      502,
    );
  }

  const image = parseInteractionImage(payload);
  if (!image) {
    throw new AppError('STUDIO_SHOOT_FAILED', 'No image was returned by Gemini.', 502);
  }

  options?.onProgress?.({ progress: 100, etaMs: 0 });
  return image;
}
