import {
  compressImageToTarget,
  fetchImageBuffer,
  publicUrl,
  readCappedBuffer,
  runVisionAsk,
  ssrfSafeFetch,
  uploadBuffer,
} from '@kanchuki/ai';
import { getSecret, prisma } from '@kanchuki/db';
import { type Demographic, type STUDIO_ENGINES, demographicForCategory } from '@kanchuki/shared';
// F-032 Phase A — AI Studio Shoots via Black Forest Labs FLUX.1 Kontext [pro].
//
// What this is: a retailer taps "Studio shoot" on a product photo, picks a
// TEMPLATE (no free-text prompts — see STUDIO_TEMPLATES in @kanchuki/shared),
// and the API generates a subject-consistent studio image: the original
// photo goes in, FLUX Kontext replaces the background while preserving the
// product's pixels (the "own the subject, not the scene" lesson — the exact
// thing the flat-paste look gets wrong). The result is stored as a NEW
// product photo (never overwriting the source), so the original stays one
// tap away and the edited image can be set as primary.
//
// BFL contract (verified 2026-08-13, docs.bfl.ml/kontext/kontext_image_editing):
//   - SUBMIT  POST https://api.bfl.ai/v1/flux-kontext-pro
//             headers: x-key: <BFL_API_KEY>  (NOT Authorization / Bearer)
//             body: { prompt, input_image, aspect_ratio? }
//               input_image = base64 OR a public URL, ≤20MB/20MP.
//               aspect_ratio omitted → matches the input image dimensions.
//             → { id, polling_url }
//   - POLL    GET <polling_url> with the same x-key
//             status: Pending | Processing | Ready | Error | Failed | Content Moderated
//             Ready → result.sample = SIGNED URL, valid only 10 minutes —
//             we must download + re-serve from R2, never link it directly.
//   - LIMITS  24 active tasks (6 for kontext-max) — 429 when exceeded;
//             402 = out of credits.
//
// Env: BFL_API_KEY on the API service. Generation is ASYNC (10–60s), so the
// route enqueues a BullMQ job and the mobile app polls a status endpoint —
// never holds an HTTP request open across inference (same pattern as the
// V-Tone admin tool / spin-frame extraction).
import { Redis } from 'ioredis';
import { AppError } from '../plugins/error-handler.js';
import {
  generateFashnTryon,
  generateFluxKontext,
  generateFluxProImage,
  generateFluxSchnellImage,
  resolveFalKey,
} from './fal-client.js';
import { generateGeminiImage, resolveGeminiKey } from './gemini-image.js';

const BFL_BASE = 'https://api.bfl.ai/v1';
export const STUDIO_SHOOT_CONCURRENCY = 3;

export async function resolveBflKey(): Promise<string | null> {
  const secret = await getSecret('BFL_API_KEY').catch(() => null);
  return secret || process.env.BFL_API_KEY || null;
}

export async function isStudioShootConfigured(): Promise<boolean> {
  const fal = await resolveFalKey();
  if (fal) return true;
  const gemini = await resolveGeminiKey();
  if (gemini) return true;
  const bfl = await resolveBflKey();
  if (bfl) return true;
  return false;
}

/**
 * The `studio_styles.engine` dial, derived from STUDIO_ENGINES in
 * @kanchuki/shared rather than restated here. Two API validators and two admin
 * selectors already read that list; a union restated alongside it is a value
 * that is either storable-but-unselectable or selectable-but-rejected, which is
 * exactly the drift the shared constant exists to stop. `undefined` = the
 * default cascade.
 */
export type StudioEngine = (typeof STUDIO_ENGINES)[number];

/** The subset of a studio-shoot job payload that comes from a studio_styles row. */
export interface StudioStyleJobFields {
  slug: string;
  prompt: string;
  tab: 'PRODUCT' | 'MODEL';
  engine?: StudioEngine;
  audience: string[];
  style_id: string;
}

/**
 * Resolve a `studio_styles` slug into the job-payload fields. Throws 422 if the
 * slug is unknown. Any status is accepted — the retailer route does its own
 * PUBLISHED + per-plan check before calling this; the internal callers
 * (festival background, growth backgrounds/social) use curated slugs.
 */
export async function resolveStudioStyleJob(slug: string): Promise<StudioStyleJobFields> {
  const style = await prisma.studioStyle.findFirst({ where: { slug } });
  if (!style) throw new AppError('VALIDATION_ERROR', `Unknown studio style: ${slug}`, 422);
  return {
    slug: style.slug,
    prompt: style.prompt,
    tab: style.tab,
    engine: (style.engine as StudioEngine | null) ?? undefined,
    audience: style.audience,
    style_id: style.id,
  };
}

export interface StudioGenerationResult {
  status: 'ready' | 'failed';
  /** Present when ready — a signed URL or base64 payload */
  sampleUrl?: string;
  base64Data?: string;
  error?: string;
}

/** How long to poll for a single generation before giving up. */
const POLL_TIMEOUT_MS = 180_000;
const POLL_INTERVALS_MS = [
  1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 3_000, 3_000, 5_000, 5_000,
  10_000, 10_000, 15_000, 15_000,
];

/**
 * Poll interval for the Nth attempt, clamped to the final (slowest) entry so
 * long jobs stop ramping up. Keeps the indexed lookup non-nullable in one place.
 */
function pollIntervalMs(attempt: number): number {
  const clamped = Math.min(attempt, POLL_INTERVALS_MS.length - 1);
  const interval = POLL_INTERVALS_MS[clamped];
  if (interval === undefined) throw new Error('POLL_INTERVALS_MS must not be empty');
  return interval;
}

/**
 * The person to render for each product demographic. Fed into every
 * model scene so a male / teen / kids product no longer renders as an
 * adult woman (the old hardcoded "graceful Indian fashion model").
 */
const PERSON_CLAUSE: Record<Demographic, string> = {
  womens: 'a graceful adult Indian woman fashion model',
  mens: 'a dignified adult Indian man fashion model',
  teen_girl: 'an Indian teenage girl model, about 15 years old',
  teen_boy: 'an Indian teenage boy model, about 15 years old',
  kids_girl: 'a young Indian girl child model, about 6 years old',
  kids_boy: 'a young Indian boy child model, about 6 years old',
};

/** Explicit demographic (admin bench) wins; otherwise infer from the product. */
function resolveDemographic(
  explicit: string | undefined,
  product?: { category?: string | null; name?: string | null },
): Demographic {
  if (explicit && explicit in PERSON_CLAUSE) return explicit as Demographic;
  return demographicForCategory(product?.category, product?.name);
}

/**
 * A garment that is only ever the top half of an outfit (kurti, blouse, tee,
 * top, tunic, crop top, shirt). MODEL scenes describe a full standing pose,
 * so with nothing else in frame Kontext invents legs and pairs the top with
 * trousers/palazzo/leggings that don't exist in the source photo — the
 * "auto adds a bottom" complaint. Detected once here so every MODEL caller
 * (retailer route, growth backgrounds, admin bench) gets the same guard,
 * not just the one template that names it explicitly.
 */
const TOP_ONLY_RE = /\b(kurti|blouse|t-?shirt|tee|top|tunic|crop top|shirt)\b/i;
function isTopOnlyGarment(...parts: (string | null | undefined)[]): boolean {
  return TOP_ONLY_RE.test(parts.filter(Boolean).join(' '));
}

/**
 * A garment whose TYPE is never named has to be inferred from pixels alone,
 * and for Indian ethnic wear the likely confusions are expensive: a salwar
 * reads as a dhoti (both loose gathered trousers), a churidar as leggings, and
 * a dupatta drape gets re-invented as a wrapped scarf. A generative model
 * resolves that ambiguity toward whichever garment is more common in its
 * training data — not toward this retailer's product. Naming the type is the
 * cheapest anchor available, and it is data the product row already holds
 * (`subtype` / `category` / `name`).
 */
const GARMENT_TEXT_MAX = 120;

/**
 * `product.name` is retailer-entered free text that ends up inside a
 * third-party image prompt — drop control characters (a newline would split
 * the instruction), neutralise double quotes (would break the `"name"`
 * phrasing), collapse whitespace and bound the length so one pathological
 * product name cannot dominate the assembled prompt.
 */
function sanitizeGarmentText(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) out += ' ';
    else if (ch === '"') out += "'";
    else out += ch;
  }
  return out.replace(/\s+/g, ' ').trim().slice(0, GARMENT_TEXT_MAX);
}

/**
 * The garment-identity clause appended to EVERY generation (both tabs).
 * When the product row names a type, state it; when it doesn't, still forbid
 * substitution — that half needs no row data and is what stops the model
 * quietly swapping in a garment it knows better.
 */
function garmentIdentityClause(product?: {
  name?: string | null;
  category?: string | null;
  subtype?: string | null;
}): string {
  const category = product?.category ? sanitizeGarmentText(product.category) : '';
  const subtype = product?.subtype ? sanitizeGarmentText(product.subtype) : '';
  const name = product?.name ? sanitizeGarmentText(product.name) : '';

  // Most specific first — "Kurta Set / Kurta" carries more than either alone.
  const type = [subtype, category].filter(Boolean).join(' / ');

  const sentences: string[] = [];
  if (type) sentences.push(`The garment in the photograph is a ${type}.`);
  if (name) sentences.push(`The product is named "${name}".`);
  sentences.push(
    'Preserve its exact garment type, cut and silhouette — do NOT substitute it for a different garment.',
    'Reproduce how it is worn exactly as photographed: do not re-drape, re-tuck, re-layer or restyle it, and keep any dupatta, stole or sash in its original placement.',
  );
  return sentences.join(' ');
}

/**
 * The shared "change only the scene" instruction. Prefixed to EVERY prompt on
 * every engine — it is what makes Kontext an editor rather than a regenerator.
 */
const SCENE_GUARD =
  'Edit ONLY the background, setting and scene of this photograph. Keep the garment itself pixel-identical to the input: exact same colour, dye, print, pattern, embroidery, fabric, cut, drape and proportions. Do not recolour, restyle or regenerate the clothing.';

/**
 * SCENE_GUARD assumes the photo already shows a person ("edit the background"),
 * which contradicts "put this garment on a model" for a hanger / flat-lay photo.
 * Used instead when the caller says the input has no person (admin bench only).
 */
const PLACEMENT_GUARD =
  'The input photograph shows a garment on its own, with no person. Reproduce that exact garment on the model described below: exact same colour, dye, print, pattern, embroidery, fabric, cut and proportions. Do not recolour, restyle or redesign it.';

// Model height (cm) per demographic — a constant WE choose, so it needs no measuring.
const MODEL_HEIGHT_CM: Record<Demographic, number> = {
  womens: 165,
  mens: 175,
  teen_girl: 155,
  teen_boy: 160,
  kids_girl: 115,
  kids_boy: 118,
};

// Approximate hem height as a fraction of standing height (anthropometric
// rules of thumb, not clinical values — tune against real renders).
const HEM_LANDMARKS: [fraction: number, phrase: string][] = [
  [0.04, 'at the ankle'],
  [0.2, 'at mid-calf'],
  [0.285, 'at the knee'],
  [0.39, 'at mid-thigh'],
  [0.52, 'at the hip'],
];

/**
 * Turn the retailer's garment length (shoulder → hem, cm) into a body landmark
 * for the prompt: shoulder ≈ 0.82H, so the hem sits ≈ 0.82H − length above the
 * floor. A photo carries no scale, so the length must come from product data.
 */
export function hemLandmarkClause(
  demographic: Demographic,
  lengthCm: number,
  modelHeightCm?: number | null,
): string {
  const h = modelHeightCm || MODEL_HEIGHT_CM[demographic];
  const hem = 0.82 * h - lengthCm;
  const where =
    hem <= 0
      ? 'reaching the floor'
      : (HEM_LANDMARKS.reduce((best, cur) =>
          Math.abs(cur[0] - hem / h) < Math.abs(best[0] - hem / h) ? cur : best,
        )[1] ?? 'at the knee');
  return `The garment is ${lengthCm} cm long from the shoulder; on this model (${h} cm tall) its hem falls ${where}${hem > 0 ? `, about ${Math.round(hem)} cm above the floor` : ''}. Do not shorten or lengthen it.`;
}

// ─── Two-step pipeline: garment-conditioned try-on, then a scene swap ───
//
// Why this exists: no single call gives both properties a studio shoot needs.
// A prompt-driven model (Kontext, Gemini, Flux) produces the person and the
// scene, but can only *guess* the garment — naming it in the prompt narrows the
// guess, it does not make it your product. A garment-conditioned try-on model
// puts the real garment on the model but knows nothing about studios, poses or
// lighting. So the pipeline splits the two:
//
//   human reference (supplied, or generated plain and frontal)
//     └─ FASHN v1.5 try-on ← THE PRODUCT PHOTO   (garment fidelity)
//          └─ scene swap                          (pose / scene / lighting)
//
// The scene renderer is the `engine` value: `vton_kontext` finishes with FLUX
// Kontext (pixel-locking, cheap) and `vton_gemini` with Gemini native image
// (`gemini-3.1-flash-image`, which also accepts the image, and whose realism is
// why anyone asks for Gemini in the first place). Both are opt-in per row so
// they can be compared on the admin bench before a retailer sees either.
//
// The step-1 input is deliberately a plain frontal full-body reference with no
// scene: try-on models are trained on plain human photographs, so a dramatic
// pose or a cropped frame (see the top-only guard) is out of distribution and
// is the likeliest way this stage disappoints. Pass `humanImageUrl` to
// substitute any reference — including a previously generated scene — which
// makes the reversed order testable without new code.
const MODEL_REFERENCE_PROMPT = (person: string): string =>
  `Full-length studio photograph of ${person} standing upright and facing the camera, arms relaxed at the sides, calm neutral expression, wearing a plain light-grey fitted t-shirt and plain straight-legged trousers, seamless light-grey studio backdrop with no props or furniture, even soft frontal lighting, sharp focus on the whole figure, the entire body from the top of the head to the feet inside the frame.`;

interface TwoStepOptions {
  /** The cleaned product photo — the garment that must survive. */
  productImageUrl: string;
  /** Optional model reference. Omitted → one is generated for the demographic. */
  humanImageUrl?: string;
  /** Scene wording (already demographic-swapped by the caller). */
  basePrompt: string;
  /** Garment-identity clause — see garmentIdentityClause. */
  garmentSpec: string;
  /** Colour-accuracy clause. */
  colorEnforcement: string;
  /** Person description, used ONLY to generate the step-0 reference. */
  personClause: string;
  /** Which model renders step 2 — see the pipeline comment above. */
  sceneRenderer: 'kontext' | 'gemini';
  onProgress?: (p: { progress: number; etaMs: number }) => void;
}

/**
 * Returns a null `result` when a stage fails, so `generateStudioImage` can
 * fall through to the single-shot Kontext path instead of failing the whole
 * job — with the stages it managed and the failing stage's name alongside it,
 * which is what the bench A/B reports instead of falling back.
 */
async function runTwoStepStudio(opts: TwoStepOptions): Promise<StudioRunOutcome> {
  const { onProgress } = opts;
  const stages: StudioStage[] = [];
  try {
    // Step 0 — a plain reference model, only when the caller supplied none.
    let humanImageUrl = opts.humanImageUrl;
    if (humanImageUrl) {
      stages.push({ label: 'Model reference (supplied)', url: humanImageUrl });
    } else {
      onProgress?.({ progress: 10, etaMs: 60_000 });
      const reference = await stage('Model reference', () =>
        generateFluxProImage(MODEL_REFERENCE_PROMPT(opts.personClause)),
      );
      humanImageUrl = reference.sampleUrl;
      stages.push({
        label: 'Model reference — generated plain and frontal',
        url: reference.sampleUrl,
      });
    }

    // Step 1 — the garment, conditioned on the product photo rather than
    // described to a prompt.
    onProgress?.({ progress: 35, etaMs: 45_000 });
    const worn = await stage('Try-on', () =>
      generateFashnTryon(humanImageUrl, opts.productImageUrl),
    );
    stages.push({ label: 'Try-on — the product photo on the reference', url: worn.sampleUrl });

    // Step 2 — scene, pose and lighting only; the person and garment are
    // explicitly off-limits.
    onProgress?.({ progress: 65, etaMs: 25_000 });
    const scenePrompt = `${SCENE_GUARD} ${opts.garmentSpec} This photograph already shows the correct model wearing the correct garment: preserve the person, their face, their pose and the clothing exactly as they are, and change ONLY the background, environment and lighting. ${opts.basePrompt} ${opts.colorEnforcement}`;
    // Gemini takes the image as an input block and returns base64 (no signed
    // URL to re-serve); Kontext returns a signed URL. Callers already handle
    // both payloads — see the `base64Data || sampleUrl` resolution in the job
    // and the bench route.
    if (opts.sceneRenderer === 'gemini') {
      const scene = await stage('Gemini scene render', () =>
        generateGeminiImage(scenePrompt, {
          inputImageUrl: worn.sampleUrl,
          onProgress,
        }),
      );
      return { result: { status: 'ready', base64Data: scene.base64Data }, stages };
    }
    const scene = await stage('Kontext scene render', () =>
      generateFluxKontext(scenePrompt, worn.sampleUrl, onProgress),
    );
    return { result: { status: 'ready', sampleUrl: scene.sampleUrl }, stages };
  } catch (err) {
    console.error('[studio-shoot] two-step (try-on → scene) failed, falling back:', err);
    return {
      result: null,
      stages,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Bench A/B: both pipeline orders, one product photo ─────────────
//
// Neither order is obviously better, and the arguments run in opposite
// directions:
//
//   forward   reference → try-on (product photo) → scene render
//     + the try-on runs on a plain frontal reference, which is what try-on
//       models are trained on
//     + the scene render finishes, so the final image is at the scene
//       model's resolution
//     − three provider calls
//
//   reversed  scene render (product photo) → try-on (product photo)
//     + two provider calls, and the scene render is the single-shot render
//       the feature already produces, so it is a known quantity
//     − the try-on runs on a generated scene (out of distribution), and its
//       output is 576×864 because FASHN v1.5 is the last stage
//
// `generateStudioOrderAb` below runs both over the same photo and returns them
// together. It exists on the admin bench only — the point is a human quality
// call, not a metric, and there is no automatic way to score "this is my
// product".

/**
 * One intermediate image produced by a multi-stage pipeline. The bench shows
 * these so a disappointing result can be attributed to a stage instead of to
 * the pipeline as a whole.
 */
export interface StudioStage {
  label: string;
  url: string;
}

/**
 * A multi-stage pipeline's outcome: an image, or an explanation.
 *
 * `generateStudioImage` only needs `result` (null → fall through to the
 * single-shot path), but the bench needs `error`. A swallowed failure reason is
 * why "the try-on stage failed" previously took rounds of prompt work to see.
 */
interface StudioRunOutcome {
  result: StudioGenerationResult | null;
  /** Intermediates that were actually produced, in stage order. */
  stages: StudioStage[];
  error?: string;
}

/**
 * Run one stage, naming it in any error it throws.
 *
 * In a three-call pipeline the raw message does not say WHICH call failed
 * ("Fal.ai task submission failed (500)" is true of the try-on and the scene
 * render alike), and the stage is the entire diagnosis.
 */
async function stage<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw new Error(`${label}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * The product fields that shape the prompt — a subset of the product row,
 * restricted to what actually changes the words sent to the model.
 */
export interface StudioProduct {
  name?: string | null;
  category?: string | null;
  subtype?: string | null;
  primary_color?: string | null;
  secondary_colors?: string[];
  fabric?: string | null;
  pattern?: string | null;
  embellishments?: string[];
  /** Shoulder-to-hem garment length in cm — retailer data, never inferred. */
  length_cm?: number | null;
  /** Overrides the per-demographic model height (cm) — admin bench. */
  model_height_cm?: number | null;
}

/** Everything the prompt needs, assembled once per generation. */
interface StudioPromptContext {
  /** Garment-identity clause — see garmentIdentityClause. */
  garmentSpec: string;
  /** Colour-accuracy clause. */
  colorEnforcement: string;
  /** Full scene prompt: guard + garment identity + scene + colour. */
  promptText: string;
  /** The person to render for `demographic`. */
  personClause: string;
  /** Scene wording: person-swapped on MODEL, verbatim on PRODUCT. */
  basePrompt: string;
  demographic: Demographic;
}

/**
 * Assemble the prompt pieces.
 *
 * Extracted from `generateStudioImage` so the bench A/B can run byte-identical
 * text down both pipeline orders. Two copies of this assembly would drift, and
 * the drift would be invisible in exactly the way that matters: the arms would
 * then differ by prompt wording as well as by stage order, and the comparison
 * would silently stop being about the order.
 */
function buildStudioPromptContext(opts: {
  prompt: string;
  tab: 'PRODUCT' | 'MODEL';
  demographic?: string;
  product?: StudioProduct;
  /** false → the input is a bare garment photo; swap SCENE_GUARD for PLACEMENT_GUARD. Default true. */
  inputHasPerson?: boolean;
}): StudioPromptContext {
  const { product } = opts;
  const colorSpec = [
    product?.primary_color ? `exact primary color is ${product.primary_color}` : '',
    product?.secondary_colors?.length
      ? `secondary colors are ${product.secondary_colors.join(', ')}`
      : '',
    product?.fabric ? `fabric: ${product.fabric}` : '',
    product?.pattern ? `pattern: ${product.pattern}` : '',
    product?.embellishments?.length ? `embellishments: ${product.embellishments.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  // Named once, used by both tabs — see garmentIdentityClause for why the
  // garment TYPE is load-bearing rather than decorative.
  const garmentSpec = garmentIdentityClause(product);

  const demographic = resolveDemographic(opts.demographic, product);
  const personClause = PERSON_CLAUSE[demographic];

  let basePrompt: string = opts.prompt;

  // Demographic person-swap: the curated MODEL scene prompts hardcode
  // "a graceful Indian fashion model" (an adult woman). For a male / teen /
  // kids product — or an explicit bench demographic — force the right person
  // into the scene and neutralise the stock wording. PRODUCT scenes have no
  // person and are used verbatim.
  if (opts.tab === 'MODEL') {
    basePrompt = basePrompt.replace(
      /a (?:graceful|professional|dignified|charming|elegant|young)[^.,]*?Indian (?:fashion model|lady \/ female fashion model|gentleman \/ male fashion model|lady|gentleman|boy model|woman fashion model|man fashion model)/gi,
      personClause,
    );
    basePrompt = `The person wearing this garment is ${personClause}. ${basePrompt}`;
    if (product?.length_cm) {
      basePrompt += ` ${hemLandmarkClause(demographic, product.length_cm, product.model_height_cm)}`;
    }
    if (isTopOnlyGarment(product?.subtype, product?.category, product?.name)) {
      basePrompt += ` This garment is a standalone top — it is NOT part of a full outfit. Frame the shot from the head down to the hip only. Do NOT show the model's legs, hips-down or feet, and do NOT add, invent or imply any trousers, palazzo, leggings, jeans or skirt that is not visible in the original product photo.`;
    }
  }

  const colorEnforcement = colorSpec
    ? ` The garment has ${colorSpec}. CRITICAL COLOR ACCURACY: Absolutely preserve the garment's exact fabric dye, color tone, embroidery, and saturation without any tinting, hue shift, or color alteration. Use neutral 5500K daylight-balanced CRI-98 key lighting on the garment.`
    : ` CRITICAL COLOR ACCURACY: Preserve the garment's exact original color, hue, dye, saturation, and embroidery 100% faithfully to the input photo without color shifting or tinting. Use neutral 5500K daylight-balanced key lighting on the garment.`;

  const guard = opts.inputHasPerson === false ? PLACEMENT_GUARD : SCENE_GUARD;
  const promptText = `${guard} ${garmentSpec} ${basePrompt} ${colorEnforcement}`;
  return { garmentSpec, colorEnforcement, promptText, personClause, basePrompt, demographic };
}

/** The single-shot prompt exactly as `generateStudioImage` would assemble it. */
export function buildStudioPrompt(opts: {
  prompt: string;
  tab: 'PRODUCT' | 'MODEL';
  demographic?: string;
  product?: StudioProduct;
  inputHasPerson?: boolean;
}): string {
  return buildStudioPromptContext(opts).promptText;
}

const DIRECTOR_SYSTEM =
  "You are the prompt director for an Indian fashion catalogue image generator. You see the retailer's product photo and a DRAFT prompt; the image model will receive the same photo plus your final prompt. " +
  'Rewrite the draft into one final prompt. Rules: (1) describe the garment exactly as visible — type, colour, print, embroidery, neckline, sleeves, fabric sheen; (2) state which pieces of an outfit are visible and which are NOT, and never add a garment that is not visible (plain footwear is allowed); (3) keep every constraint in the draft — colour accuracy, hem length, person, scene, framing; (4) under 250 words, plain prose. ' +
  'Reply with ONLY JSON: {"prompt": string, "missing_parts": string[]} where missing_parts lists outfit pieces a shopper might assume but the photo does not show (empty array if none).';

/**
 * Prompt director — the layer the chat apps add invisibly. One vision pass over
 * the product photo turns the draft prompt into a garment-aware final prompt and
 * reports what the photo does not show. Admin bench only for now.
 */
export async function directStudioPrompt(
  inputImageUrl: string,
  draft: string,
): Promise<{ prompt: string; missing_parts: string[] }> {
  const buffer = await fetchImageBuffer(inputImageUrl);
  const lower = inputImageUrl.toLowerCase().split('?')[0] ?? '';
  const mediaType = lower.endsWith('.png')
    ? 'image/png'
    : lower.endsWith('.webp')
      ? 'image/webp'
      : 'image/jpeg';
  const raw = await runVisionAsk({
    images: [{ buffer, mediaType }],
    systemPrompt: DIRECTOR_SYSTEM,
    userPrompt: `DRAFT PROMPT:\n${draft}`,
    maxTokens: 900,
  });
  try {
    const json = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()) as {
      prompt?: unknown;
      missing_parts?: unknown;
    };
    if (typeof json.prompt !== 'string' || !json.prompt.trim()) throw new Error('no prompt');
    const missing = Array.isArray(json.missing_parts)
      ? json.missing_parts.filter((p): p is string => typeof p === 'string')
      : [];
    return { prompt: json.prompt.trim(), missing_parts: missing };
  } catch {
    throw new AppError(
      'STUDIO_SHOOT_FAILED',
      `Prompt director returned unusable output: ${raw.slice(0, 200)}`,
      502,
    );
  }
}

/** Which half of the two-step pipeline renders the scene. */
type SceneRenderer = 'kontext' | 'gemini';

interface ReversedOptions {
  /** The cleaned product photo — the garment that must survive. */
  productImageUrl: string;
  /** The fully-assembled scene prompt, same text the single-shot path sends. */
  promptText: string;
  sceneRenderer: SceneRenderer;
  /** Re-serve a base64 intermediate so a later stage can fetch it. */
  persistStage?: (payload: { base64Data?: string; sampleUrl?: string }) => Promise<string>;
  onProgress?: (p: { progress: number; etaMs: number }) => void;
}

/**
 * The same two stages, the other way round: render the scene first, then dress
 * the person it invented in the real garment.
 *
 * The scene render's own garment is thrown away — this order spends the scene
 * render's fidelity to buy pose, background and lighting quality, then replaces
 * the clothing entirely. It also ends on the try-on, so the result is FASHN's
 * 576×864 rather than the scene model's resolution.
 *
 * Gemini returns base64 and the try-on needs a URL it can fetch, which is what
 * `persistStage` is for; without it the reversed order cannot use Gemini as the
 * scene renderer and says so rather than failing obscurely at the try-on.
 */
async function runReversedStudio(opts: ReversedOptions): Promise<StudioRunOutcome> {
  const stages: StudioStage[] = [];
  try {
    let sceneUrl: string;
    if (opts.sceneRenderer === 'gemini') {
      const scene = await stage('Gemini scene render', () =>
        generateGeminiImage(opts.promptText, {
          inputImageUrl: opts.productImageUrl,
          onProgress: opts.onProgress,
        }),
      );
      const persistStage = opts.persistStage;
      if (!persistStage) {
        return {
          result: null,
          stages,
          error:
            'Gemini scene render: the reversed order needs a persistStage upload before the try-on stage can fetch the result.',
        };
      }
      sceneUrl = await stage('Gemini scene render (persist)', () =>
        persistStage({ base64Data: scene.base64Data }),
      );
    } else {
      const scene = await stage('Kontext scene render', () =>
        generateFluxKontext(opts.promptText, opts.productImageUrl, opts.onProgress),
      );
      sceneUrl = scene.sampleUrl;
    }
    stages.push({
      label: 'Scene render — the garment was guessed from the prompt',
      url: sceneUrl,
    });

    const worn = await stage('Try-on', () => generateFashnTryon(sceneUrl, opts.productImageUrl));
    return { result: { status: 'ready', sampleUrl: worn.sampleUrl }, stages };
  } catch (err) {
    console.error('[studio-shoot] reversed order (scene → try-on) failed:', err);
    return {
      result: null,
      stages,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** The two pipeline orders the bench can compare. */
export type StudioOrder = 'forward' | 'reversed';

/** One arm of the A/B — a whole pipeline, and how far it got. */
export interface StudioAbArm {
  order: StudioOrder;
  label: string;
  status: 'ready' | 'failed';
  /** Intermediates that ran, in stage order. Empty if stage one failed. */
  stages: StudioStage[];
  /** Final image — exactly one of these is set (Gemini finishes on base64). */
  base64Data?: string;
  sampleUrl?: string;
  /** Which stage failed, prefixed by its name. */
  error?: string;
  ms: number;
}

export interface StudioOrderAb {
  engine: StudioVtonEngine;
  /** Forward first, always — the bench renders them side by side in this order. */
  arms: StudioAbArm[];
  /** Caveats that change how the two images should be read. */
  notes: string[];
}

/**
 * Engine values that select the two-step pipeline (i.e. that have two orders).
 * Derived from STUDIO_ENGINES rather than restated, so adding or renaming an
 * engine cannot leave the bench A/B accepting a value the type does not have.
 */
export type StudioVtonEngine = Extract<StudioEngine, 'vton_kontext' | 'vton_gemini'>;

/**
 * Run BOTH pipeline orders over the same product photo and return them
 * together, for a side-by-side quality call on the admin bench.
 *
 * Both arms are STRICT: a failed stage fails that arm and is reported with the
 * stage name. `generateStudioImage` would instead fall back to a single-shot
 * Kontext render, and letting it do that here would turn "which order is
 * better" into a silent comparison of two different pipelines — the same class
 * of mistake as the bench that sent less product data than production and could
 * not reproduce the bug it was opened to test.
 *
 * The arms are independent, so they run concurrently; serialising them would
 * double the wait for a comparison that is the entire point of the run.
 */
export async function generateStudioOrderAb(
  inputImageUrl: string,
  opts: {
    prompt: string;
    tab: 'PRODUCT' | 'MODEL';
    engine?: StudioVtonEngine;
    demographic?: Demographic | string;
    /** Forward arm only — the reversed arm's person comes from its own scene. */
    humanImageUrl?: string;
    product?: StudioProduct;
    persistStage?: (payload: { base64Data?: string; sampleUrl?: string }) => Promise<string>;
    onProgress?: (p: { progress: number; etaMs: number }) => void;
  },
): Promise<StudioOrderAb> {
  const engine: StudioVtonEngine = opts.engine ?? 'vton_kontext';
  const sceneRenderer: SceneRenderer = engine === 'vton_gemini' ? 'gemini' : 'kontext';
  const ctx = buildStudioPromptContext({
    prompt: opts.prompt,
    tab: opts.tab,
    demographic: typeof opts.demographic === 'string' ? opts.demographic : undefined,
    product: opts.product,
  });

  const notes: string[] = [
    'Both arms are strict: a failed stage fails that arm and names the stage. The retailer path would fall back to a single-shot Kontext render instead, so a blank arm here is not what a retailer would get.',
  ];
  if (opts.tab === 'PRODUCT') {
    notes.push(
      'This is a product-only scene, so it renders nobody — the reversed arm has no person for the try-on stage to condition on and will most likely fail.',
    );
  }
  if (opts.humanImageUrl) {
    notes.push(
      "A model reference was supplied, so the forward arm conditions on it while the reversed arm's person comes from its own scene render — the arms then differ by more than stage order.",
    );
  }
  notes.push(
    'The reversed arm finishes on the try-on output (FASHN v1.5 returns 576×864) while the forward arm finishes on the scene renderer at its own resolution — expect the reversed image to look softer, which is the stage order rather than a defect.',
  );
  notes.push(
    `Provider calls this run: ${opts.humanImageUrl ? 4 : 5} — forward ${opts.humanImageUrl ? 2 : 3}, reversed 2.`,
  );

  const runArm = async (order: StudioOrder): Promise<StudioAbArm> => {
    const started = Date.now();
    const label = order === 'forward' ? 'Forward — garment first' : 'Reversed — scene first';
    try {
      const run =
        order === 'forward'
          ? await runTwoStepStudio({
              productImageUrl: inputImageUrl,
              humanImageUrl: opts.humanImageUrl,
              basePrompt: ctx.basePrompt,
              garmentSpec: ctx.garmentSpec,
              colorEnforcement: ctx.colorEnforcement,
              personClause: ctx.personClause,
              sceneRenderer,
              onProgress: opts.onProgress,
            })
          : await runReversedStudio({
              productImageUrl: inputImageUrl,
              promptText: ctx.promptText,
              sceneRenderer,
              persistStage: opts.persistStage,
              onProgress: opts.onProgress,
            });

      if (!run.result) {
        return {
          order,
          label,
          status: 'failed',
          stages: run.stages,
          error: run.error ?? 'The pipeline produced no image.',
          ms: Date.now() - started,
        };
      }
      return {
        order,
        label,
        status: 'ready',
        stages: run.stages,
        base64Data: run.result.base64Data,
        sampleUrl: run.result.sampleUrl,
        ms: Date.now() - started,
      };
    } catch (err) {
      // Neither runner throws — both return a failure outcome — so this is a
      // belt-and-braces guard: one broken arm must not cost the other's result,
      // and a rejected promise would take down the whole `Promise.all`.
      return {
        order,
        label,
        status: 'failed',
        stages: [],
        error: err instanceof Error ? err.message : String(err),
        ms: Date.now() - started,
      };
    }
  };

  const [forward, reversed] = await Promise.all([runArm('forward'), runArm('reversed')]);
  return { engine, arms: [forward, reversed], notes };
}

/**
 * Generate a studio product photo or AI fashion-model shot for a resolved
 * prompt (the caller — retailer route, job, or admin bench — pulls the prompt
 * from a `studio_styles` row).
 *
 * `tab: 'MODEL'` injects a demographic-correct person clause and neutralises
 * any stock "graceful Indian fashion model" wording in the prompt.
 * `tab: 'PRODUCT'` uses the prompt verbatim (product-only scenes, no person).
 */
export async function generateStudioImage(
  inputImageUrl: string,
  opts: {
    prompt: string;
    tab: 'PRODUCT' | 'MODEL';
    engine?: StudioEngine;
    /** Demographic override (admin bench). Omitted → inferred from the
     * product category. Decides which person a MODEL scene renders. */
    demographic?: Demographic | string;
    /**
     * Model reference image for the `vton_kontext` pipeline. Omitted → a plain
     * frontal reference is generated for the demographic. Supply your own to
     * test the reversed (scene-first) order without code changes.
     */
    humanImageUrl?: string;
    onProgress?: (progress: { progress: number; etaMs: number }) => void;
    product?: StudioProduct;
    /** false → input is a bare garment photo (no person); see PLACEMENT_GUARD. Default true. */
    inputHasPerson?: boolean;
    /** Replaces the assembled prompt on the single-shot engines (prompt director output). */
    promptOverride?: string;
    /** Explicitly-chosen engine failing throws instead of falling back to Kontext (admin bench). */
    strict?: boolean;
  },
): Promise<StudioGenerationResult> {
  const { prompt, tab, engine, onProgress } = opts;
  const falKey = await resolveFalKey();
  const geminiKey = await resolveGeminiKey();
  const bflAuthKey = await resolveBflKey();

  if (!falKey && !geminiKey && !bflAuthKey) {
    throw new AppError(
      'STUDIO_SHOOT_FAILED',
      'AI Studio Shoots are not configured. Please add an API key in Admin → Integrations.',
      503,
    );
  }

  // Prompt assembly lives in buildStudioPromptContext so the bench A/B hands
  // both pipeline orders byte-identical text (see that function for why).
  const {
    garmentSpec,
    colorEnforcement,
    basePrompt,
    personClause: indianModelDesc,
    promptText: builtPrompt,
  } = buildStudioPromptContext({
    prompt,
    tab,
    demographic: typeof opts.demographic === 'string' ? opts.demographic : undefined,
    product: opts.product,
    inputHasPerson: opts.inputHasPerson,
  });
  const promptText = opts.promptOverride ?? builtPrompt;
  const fail = (label: string, err: unknown): never => {
    throw new AppError(
      'STUDIO_SHOOT_FAILED',
      `${label}: ${err instanceof Error ? err.message : String(err)}`,
      502,
    );
  };
  if (opts.strict && (engine === 'gemini_image' || engine === 'gemini_image_pro') && !geminiKey) {
    fail(engine, 'no Gemini API key configured');
  }

  // FLUX Kontext is an instruction-edit model: it changes only what the
  // prompt names and leaves the rest of the pixels alone. Plain flux img2img
  // (strength 0.65) regenerates most of the frame, and a generative model —
  // Gemini included, even though it now receives the photo — is free to
  // reinterpret the garment, which is the "changed the product colour" bug.
  // So the default path is Kontext only; flux_pro / gemini / flux_schnell run
  // only when a caller explicitly asks via `engine`.

  // Two-step pipeline — garment-conditioned try-on, then a scene swap. Falls
  // through to the single-shot default below when the try-on stage fails, so a
  // provider outage degrades the shot rather than failing the job.
  if (engine === 'vton_kontext' || engine === 'vton_gemini') {
    // `result` is null when a stage failed; `error` names which one.
    const twoStep = await runTwoStepStudio({
      productImageUrl: inputImageUrl,
      humanImageUrl: opts.humanImageUrl,
      basePrompt,
      garmentSpec,
      colorEnforcement,
      personClause: indianModelDesc,
      sceneRenderer: engine === 'vton_gemini' ? 'gemini' : 'kontext',
      onProgress,
    });
    if (twoStep.result) return twoStep.result;
  }

  // Explicit engine override (admin bench / future UI) — attempt it, but
  // still fall through to Kontext if it errors.
  if (engine === 'flux_pro' && falKey) {
    try {
      const res = await generateFluxProImage(promptText, { inputImageUrl, onProgress });
      return { status: 'ready', sampleUrl: res.sampleUrl };
    } catch (err) {
      console.error('[studio-shoot] flux_pro (explicit) failed, falling back to Kontext:', err);
    }
  }
  // Gemini native image (Nano Banana). Unlike the Imagen `:predict` client this
  // replaces, it IS handed the product photo — the scene guard and the
  // garment-identity clause are instructions to an editor, not a description
  // for a generator.
  if ((engine === 'gemini_image' || engine === 'gemini_image_pro') && geminiKey) {
    try {
      const res = await generateGeminiImage(promptText, {
        inputImageUrl,
        model: engine === 'gemini_image_pro' ? 'gemini-3-pro-image' : 'gemini-3.1-flash-image',
        onProgress,
      });
      return { status: 'ready', base64Data: res.base64Data };
    } catch (err) {
      if (opts.strict) fail(engine, err);
      console.error('[studio-shoot] gemini (explicit) failed, falling back to Kontext:', err);
    }
  }
  if (engine === 'flux_schnell' && falKey) {
    try {
      const res = await generateFluxSchnellImage(promptText, { inputImageUrl, onProgress });
      return { status: 'ready', sampleUrl: res.sampleUrl };
    } catch (err) {
      console.error('[studio-shoot] flux_schnell (explicit) failed, falling back to Kontext:', err);
    }
  }

  // DEFAULT: FLUX Kontext via Fal (subject-preserving). Falls through to the
  // BFL direct API below when Fal errors or only BFL_API_KEY is configured.
  if (falKey) {
    try {
      const res = await generateFluxKontext(promptText, inputImageUrl, onProgress);
      return { status: 'ready', sampleUrl: res.sampleUrl };
    } catch (err) {
      console.error('[studio-shoot] Fal Kontext failed, trying BFL direct:', err);
      if (!bflAuthKey) throw err;
    }
  }

  // Fallback: Black Forest Labs FLUX Kontext Pro (direct API)
  if (!bflAuthKey) {
    throw new AppError(
      'STUDIO_SHOOT_FAILED',
      'AI Studio Shoots are not configured. Please add an API key in Admin → Integrations.',
      503,
    );
  }

  let submit: { id?: string; polling_url?: string };
  try {
    const res = await fetch(`${BFL_BASE}/flux-kontext-pro`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'x-key': bflAuthKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Send the fully-assembled prompt (basePrompt + colour tail + any
        // runway/model/customPrompt tweak) — NOT the bare template string.
        prompt: promptText,
        input_image: inputImageUrl,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    submit = (await res.json()) as { id?: string; polling_url?: string };
    if (!res.ok) {
      const reason =
        res.status === 402
          ? 'AI Studio Shoots are temporarily unavailable (out of credits). Please try again later.'
          : res.status === 429
            ? 'Too many studio shoots right now. Please try again in a minute.'
            : 'AI Studio Shoots could not be started. Please try again.';
      throw new AppError('STUDIO_SHOOT_FAILED', reason, res.status >= 500 ? 503 : 429);
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      'STUDIO_SHOOT_FAILED',
      'AI Studio Shoots could not be started. Please try again.',
      503,
    );
  }

  const pollingUrl = submit.polling_url;
  if (!pollingUrl) {
    throw new AppError(
      'STUDIO_SHOOT_FAILED',
      'AI Studio Shoots returned no task. Please retry.',
      503,
    );
  }

  const startTime = Date.now();
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let pollIntervalIndex = 0;
  while (Date.now() < deadline) {
    let poll: { status?: string; result?: { sample?: string }; error?: string };
    try {
      const res = await fetch(pollingUrl, {
        headers: { accept: 'application/json', 'x-key': bflAuthKey },
        signal: AbortSignal.timeout(10_000),
      });
      poll = (await res.json()) as {
        status?: string;
        result?: { sample?: string };
        error?: string;
      };
    } catch {
      // Transient network hiccup — keep polling until the deadline.
      await sleep(pollIntervalMs(pollIntervalIndex));
      pollIntervalIndex++;

      // Update progress during wait
      if (onProgress) {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(95, Math.floor((elapsed / POLL_TIMEOUT_MS) * 100));
        const etaMs = Math.max(0, POLL_TIMEOUT_MS - elapsed);
        onProgress({ progress, etaMs });
      }

      continue;
    }

    if (poll.status === 'Ready' && poll.result?.sample) {
      if (onProgress) {
        onProgress({ progress: 100, etaMs: 0 });
      }
      return { status: 'ready', sampleUrl: poll.result.sample };
    }
    if (
      poll.status === 'Error' ||
      poll.status === 'Failed' ||
      poll.status === 'Content Moderated'
    ) {
      if (onProgress) {
        onProgress({ progress: 0, etaMs: 0 });
      }
      return {
        status: 'failed',
        error: poll.error ?? 'The studio shoot could not be generated. Please try again.',
      };
    }

    // Update progress during polling
    if (onProgress) {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(90, Math.floor((elapsed / POLL_TIMEOUT_MS) * 100)); // Cap at 90% until complete
      const etaMs = Math.max(0, POLL_TIMEOUT_MS - elapsed);
      onProgress({ progress, etaMs });
    }

    await sleep(pollIntervalMs(pollIntervalIndex));
    pollIntervalIndex++;
  }

  if (onProgress) {
    onProgress({ progress: 0, etaMs: 0 });
  }
  return { status: 'failed', error: 'The studio shoot timed out. Please try again.' };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Download → compress → upload (re-serve from R2) ───────────────

export interface StudioR2Output {
  key: string;
  url: string;
  width: number;
  height: number;
}

/**
 * Fetch the BFL signed result URL (10-min validity), quality-compress to
 * ≤80KB, and store under the given R2 key. Returns the new key + public URL.
 * Uses the SSRF-safe downloader — the URL comes from a third party.
 */
export async function downloadCompressAndUpload(
  sampleUrlOrBase64: string,
  r2Key: string,
  isBase64 = false,
): Promise<StudioR2Output> {
  let raw: Buffer;
  if (isBase64) {
    raw = Buffer.from(sampleUrlOrBase64, 'base64');
  } else {
    const res = await ssrfSafeFetch(sampleUrlOrBase64);
    if (!res.ok) throw new Error(`Failed to fetch studio result: ${res.status}`);
    raw = await readCappedBuffer(res);
  }
  const { buffer, width, height } = await compressImageToTarget(raw);
  await uploadBuffer(r2Key, buffer, 'image/jpeg');
  return { key: r2Key, url: publicUrl(r2Key), width, height };
}

// ─── Job status (Redis, short-fail — mirrors msg91-otp/public-cache) ─
// The route returns 202 + job_id; the mobile app polls the status endpoint
// while the BullMQ job runs. Status lives in Redis with a TTL — it's a
// transient progress signal, not a record of truth (the DB photo row is).
// Own short-fail client (NOT getRedis()/BullMQ — maxRetriesPerRequest: null
// would retry forever on a down connection and hang the hot path).

export interface StudioJobStatus {
  status: 'processing' | 'ready' | 'failed';
  photo_id?: string;
  url?: string;
  error?: string;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Estimated time until completion in milliseconds */
  etaMs?: number;
}

const STATUS_KEY = (jobId: string) => `studio:job:${jobId}`;
const STATUS_TTL_SEC = 60 * 30; // 30 min — far longer than a generation

export interface StudioRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<'OK' | null>;
}

let studioRedis: Redis | null = null;

function getStudioRedis(): Redis {
  studioRedis ??= new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 10_000,
  });
  return studioRedis;
}

async function awaitRedisReady(redis: Redis): Promise<void> {
  if (redis.status === 'ready') return;
  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      redis.off('error', onError);
      resolve();
    };
    const onError = (err: Error) => {
      redis.off('ready', onReady);
      reject(err);
    };
    redis.once('ready', onReady);
    redis.once('error', onError);
  });
}

// Same VITEST bypass convention as msg91-otp/public-cache — route tests run
// without Redis and stay deterministic.
function redisAvailable(): boolean {
  return process.env.VITEST !== 'true';
}

/** Write the job status (best-effort — a Redis blip must not fail the job). */
export async function setStudioJobStatus(jobId: string, status: StudioJobStatus): Promise<void> {
  if (!redisAvailable()) return;
  const redis = getStudioRedis();
  try {
    await awaitRedisReady(redis);
    await redis.set(STATUS_KEY(jobId), JSON.stringify(status), 'EX', STATUS_TTL_SEC);
  } catch (err) {
    console.error(`[studio-shoot] failed to write status for ${jobId}:`, err);
  }
}

/** Read the job status — returns null when absent/expired/Redis down. */
export async function getStudioJobStatus(jobId: string): Promise<StudioJobStatus | null> {
  if (!redisAvailable()) return null;
  const redis = getStudioRedis();
  try {
    await awaitRedisReady(redis);
    const raw = await redis.get(STATUS_KEY(jobId));
    return raw ? (JSON.parse(raw) as StudioJobStatus) : null;
  } catch {
    return null;
  }
}
