// F-039 Phase 2 — CatVTON virtual try-on, on the RunPod serverless worker.
//
// Deleted with the feature on 2026-08-31 (migration 082) and rebuilt here
// against the worker that survived that teardown (see
// `docs/tasks/pending/catvton-runpod-tryon-launch.md` T0/T3). The worker lives
// in `services/tryon/`; the GHCR image `ghcr.io/kapisejix/kanchuki-tryon` was
// verified alive and pullable 2026-09-26.
//
// ─── Why the wearer photo goes inline instead of as a URL ────────────────────
// The worker's contract is URL-in: `handler_runpod.py` does `requests.get()`
// on `person_image_url` / `garment_image_url`. That is fine for the garment —
// it is the retailer's own product photo, already legitimately on R2 — but the
// wearer's photo must NEVER be persisted (T6: same rule as the Style Match Lite
// selfie call). There is no "upload, hand over a URL, delete it right after"
// middle ground that satisfies that: an upload *is* a write, and a crash
// between the two calls leaves the photo behind with no retention policy
// covering it.
//
// So we send the wearer's bytes inline, as base64 in the job payload, and the
// worker decodes them in memory. That means `handler_runpod.py` grew a
// `person_image_base64` input (additive, URL input still works) — and the
// GHCR image must be rebuilt before this path works against a live endpoint.
//
// ─── Deliberately not carried over from the pre-teardown client ──────────────
// The old `tryon.ts` background-removed the garment through
// `@imgly/background-removal-node`, cached the cutout under
// `tryon-preprocessed/<sha256>.png`, and re-uploaded it so the worker had a
// clean garment. T3's route spec says the garment is "the product's own
// existing photo (already on R2, no re-upload)", so this rebuild skips that
// stage: one fewer R2 object per product, no onnxruntime work on the hot path,
// and the presigned product-photo URL goes straight to the worker. It is the
// pre-teardown quality note ("raw uploads are rarely bg-clean") that this costs
// us, so it is the first thing to add back if output quality needs it.
//
// Two-call piece chaining (upper + lower garment photos) is also gone. It
// depended on `PIECE_TAGGABLE_CATEGORIES`, which the teardown removed from
// `@kanchuki/shared`; the `ProductPhoto.piece_type` column survived, but the
// category list it was meant to be read against did not. T3's route takes one
// garment photo, so the single-call path is the whole contract for now.
import { getSecret } from '@kanchuki/db';
import { uploadBuffer } from './r2.js';
import { readCappedBuffer, ssrfSafeFetch } from './safe-fetch.js';

const R2_TRYON_PREFIX = 'tryon-results';

/** RunPod holds the request open for the whole inference (~35–45s cold, less
 *  warm). The endpoint's own timeout is 120s, so match it rather than cut the
 *  call off below what the worker is allowed to take. */
const RUNPOD_TIMEOUT_MS = 120_000;

/** Cap on an inline (`data:`) result we did not generate — the http path is
 *  already capped by `readCappedBuffer`. Generous, not a budget. */
const MAX_RESULT_BYTES = 12 * 1024 * 1024;

export type ClothType = 'upper' | 'lower' | 'overall';

// Categories that are a 2+ piece outfit shot as a single set (kameez+salwar,
// choli+skirt, kurta+pajama, a saree's continuous drape) — the worker has to be
// told the garment covers the whole body, because the photo alone reads as a
// top half. Everything else is treated as an upper-body garment.
const MULTIPIECE_AS_OVERALL = new Set([
  'Ladies Suit',
  'Readymade Suit',
  "Men's Kurta Pajama",
  'Lehenga',
  'Saree',
]);

// Draping physics CatVTON cannot represent — excluded rather than sent through
// a mask that would silently produce a wrong image.
const UNSUPPORTED_CATEGORIES = new Set(['Dupatta']);

export function isUnsupportedTryOnCategory(category: string | null | undefined): boolean {
  return !!category && UNSUPPORTED_CATEGORIES.has(category);
}

/** Map our product category to the worker's `cloth_type`. */
export function clothTypeForCategory(category: string | null | undefined): ClothType {
  if (category && MULTIPIECE_AS_OVERALL.has(category)) return 'overall';
  return 'upper';
}

export interface TryOnRequest {
  /** Raw bytes of the wearer's photo. Sent inline to the worker and never
   *  written to storage by anything in this module. */
  personImage: Buffer;
  /** MIME type of `personImage` (e.g. `image/jpeg`) — preserved into the
   *  inline data URI so the worker decodes the right format. */
  personImageContentType: string;
  /** The garment: a fetchable URL of the retailer's own product photo
   *  (public or presigned — the worker fetches it). */
  garmentImageUrl: string;
  clothType: ClothType;
}

export interface TryOnResult {
  /** Where the worker put the generated image. Fetch it with
   *  `saveTryOnResultToR2` to persist it. */
  outputUrl: string;
  /** Worker-reported inference time, when it reported one. */
  latencyMs: number | null;
}

/** Raised when no CatVTON endpoint is configured — distinct from a failed
 *  generation so the route can answer "not available" instead of "failed". */
export class TryOnNotConfiguredError extends Error {
  constructor() {
    super(
      'No try-on engine configured. Set CATVTON_API_URL in Admin → Integrations ' +
        'to the RunPod serverless endpoint URL (https://api.runpod.ai/v2/{endpoint_id}).',
    );
    this.name = 'TryOnNotConfiguredError';
  }
}

// Resolved per call, not at module load: getSecret() reads the Admin →
// Integrations vault first and falls back to env, so a key an admin saves is
// picked up without an API restart. getSecret() caches internally, so this is
// not a per-request DB hit.
async function resolveEndpoint(): Promise<string> {
  const url = (await getSecret('CATVTON_API_URL'))?.trim().replace(/\/+$/, '');
  if (!url) throw new TryOnNotConfiguredError();
  return url;
}

/** True when the try-on engine has an endpoint to call. Mirrors the
 *  `isStudioShootConfigured()` shape the studio-shoot route gates on. */
export async function isCatVtonConfigured(): Promise<boolean> {
  try {
    await resolveEndpoint();
    return true;
  } catch {
    return false;
  }
}

function toDataUri(image: { buffer: Buffer; contentType: string }): string {
  return `data:${image.contentType || 'image/jpeg'};base64,${image.buffer.toString('base64')}`;
}

/**
 * POST a job to the RunPod endpoint's synchronous route and unwrap the
 * response. RunPod answers `{ output: <handler return>, ... }` on success and
 * `{ error }` when the job itself failed (timeout, worker crash) — the two
 * layers are distinct and both have to be checked, because the worker's own
 * `{ error }` arrives *inside* `output`.
 */
async function postTryOnJob(
  endpoint: string,
  apiKey: string | undefined,
  input: Record<string, unknown>,
): Promise<TryOnResult> {
  const res = await fetch(`${endpoint}/runsync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    signal: AbortSignal.timeout(RUNPOD_TIMEOUT_MS),
    body: JSON.stringify({ input }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`CatVTON request failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const raw = (await res.json()) as Record<string, unknown>;

  const jobError = raw['error'];
  if (jobError) throw new Error(`RunPod error: ${String(jobError)}`);

  const output = raw['output'] as Record<string, unknown> | undefined;
  const handlerError = output?.['error'];
  if (handlerError) throw new Error(`CatVTON handler error: ${String(handlerError)}`);

  const resultUrl = output?.['result_url'];
  if (typeof resultUrl !== 'string' || !resultUrl) {
    // `status` is the worker's own verdict; surface it rather than only the
    // missing field, because a bare "no result_url" hides an OOM/timeout.
    throw new Error(
      `CatVTON returned no result_url (worker status: ${String(output?.['status'] ?? raw['status'] ?? 'unknown')}). ` +
        `Full response: ${JSON.stringify(raw).slice(0, 500)}`,
    );
  }

  const latencyMs = output?.['latency_ms'];
  return {
    outputUrl: resultUrl,
    latencyMs: typeof latencyMs === 'number' ? latencyMs : null,
  };
}

/**
 * Run one try-on. The wearer's photo is sent inline (see the header note) and
 * this module never writes it anywhere; only the returned result URL is
 * persisted, by `saveTryOnResultToR2`, and only if the caller asks.
 */
export async function generateTryOn(request: TryOnRequest): Promise<TryOnResult> {
  if (request.personImage.length === 0) {
    throw new Error('Try-on needs a non-empty wearer photo.');
  }

  const endpoint = await resolveEndpoint();
  const apiKey = (await getSecret('RUNPOD_API_KEY'))?.trim() || undefined;

  return postTryOnJob(endpoint, apiKey, {
    person_image_base64: toDataUri({
      buffer: request.personImage,
      contentType: request.personImageContentType,
    }),
    garment_image_url: request.garmentImageUrl,
    cloth_type: request.clothType,
  });
}

// ─── Result persistence ──────────────────────────────────────────────────────

/** R2 key for a completed try-on's generated image. */
export function tryonResultR2Key(jobId: string): string {
  return `${R2_TRYON_PREFIX}/${jobId}/result.jpg`;
}

/**
 * Read the generated image back off the worker's URL. The worker falls back to
 * returning a `data:` URI when its own R2 credentials aren't configured (see
 * `upload_result` in `handler_runpod.py`), so both forms are real cases and
 * both are handled here.
 */
async function readResultBytes(sourceUrl: string): Promise<Buffer> {
  if (sourceUrl.startsWith('data:')) {
    const comma = sourceUrl.indexOf(',');
    if (comma === -1) throw new Error('CatVTON returned a malformed data: URI.');
    const buffer = Buffer.from(sourceUrl.slice(comma + 1), 'base64');
    if (buffer.length > MAX_RESULT_BYTES) {
      throw new Error(`CatVTON result is too large (${buffer.length} bytes).`);
    }
    return buffer;
  }

  // The worker's own R2 URL is not one we minted, so it is fetched through the
  // SSRF-safe client rather than plain `fetch` (which also caps the body —
  // 25MB in readCappedBuffer, comfortably above MAX_RESULT_BYTES above).
  const res = await ssrfSafeFetch(sourceUrl);
  if (!res.ok) throw new Error(`Could not download the try-on result (${res.status}).`);
  return readCappedBuffer(res);
}

/**
 * Persist a completed try-on's generated image to R2 and return its **key**.
 *
 * The key, not a URL: the generated image is a photo of a real person, so the
 * caller should hand out a presigned GET URL minted per read rather than a
 * long-lived public URL (same rule the product photos already follow).
 */
export async function saveTryOnResultToR2(jobId: string, sourceUrl: string): Promise<string> {
  const buffer = await readResultBytes(sourceUrl);
  const key = tryonResultR2Key(jobId);
  await uploadBuffer(key, buffer, 'image/jpeg');
  return key;
}
