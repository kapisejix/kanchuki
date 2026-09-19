// Admin test page backend for scripts/batch-clean-photos.py (F: standalone
// product-photo cleanup script, see CLAUDE.md 2026-08-05 entry). Shells out
// to the existing, already-verified Python script instead of reimplementing
// bg-removal/shadow/shine in TypeScript — one behavior, one place.
// The Python discovery + run serialization live in lib/photo-cleanup-runner.ts,
// shared with the retailer-facing pro-cleanup route (products-pro-cleanup.ts).
import { randomUUID } from 'node:crypto';

import type { FastifyPluginAsync } from 'fastify';

import { compressImageToTarget, publicUrl, uploadBuffer } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { PRODUCT_DEMOGRAPHICS, R2_PATHS, STUDIO_ENGINES } from '@kanchuki/shared';
import { z } from 'zod';
import { generateImageToVideo } from '../../lib/fal-video.js';
import { runPhotoCleanup, serializePhotoCleanup } from '../../lib/photo-cleanup-runner.js';
import {
  type StudioProduct,
  buildStudioPrompt,
  directStudioPrompt,
  downloadCompressAndUpload,
  generateStudioImage,
  generateStudioOrderAb,
} from '../../lib/studio-shoot.js';
import { AppError, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin-auth.js';

export interface TryOnFeedRow {
  id: string;
  job_id: string;
  status: 'completed' | 'failed';
  result_url: string | null;
  error: string | null;
  model_url: string | null;
  product_url: string | null;
  category: string;
  duration_ms: number | null;
  ran_at: string;
}

/**
 * Defensive parse of an ADMIN_TRYON audit entry into a typed feed row — same
 * pattern as parseCompressionRun in admin-storage.ts. Failure rows carry an
 * error message; rows without a result_url are treated as failed so the page
 * never renders a broken image tile.
 */
export function parseTryOnResult(id: string, createdAt: Date, metadata: unknown): TryOnFeedRow {
  const m = (metadata ?? {}) as Record<string, unknown>;
  // Narrow through locals — TS can't narrow m.result_url through the aliased
  // hasResult const (it's unknown under Record<string, unknown>).
  const resultUrl = typeof m.result_url === 'string' ? m.result_url : null;
  const isCompleted = m.status === 'completed' && resultUrl !== null;
  return {
    id,
    job_id: typeof m.job_id === 'string' ? m.job_id : '',
    status: isCompleted ? 'completed' : 'failed',
    result_url: resultUrl,
    error: typeof m.error === 'string' ? m.error : null,
    model_url: typeof m.model_url === 'string' ? m.model_url : null,
    product_url: typeof m.product_url === 'string' ? m.product_url : null,
    category: typeof m.category === 'string' ? m.category : 'tops',
    duration_ms: typeof m.duration_ms === 'number' ? m.duration_ms : null,
    ran_at: createdAt.toISOString(),
  };
}

/**
 * The product description both bench routes take.
 *
 * Shared deliberately: the A/B compares two pipeline orders over ONE product
 * description, so a field that existed on /studio-shoot alone would let the
 * comparison be run against a differently-described product than the shot it
 * is meant to improve on.
 *
 * Garment identity matters most here — the bench generates from a pasted R2
 * URL, so there is no product row for generateStudioImage to read, meaning an
 * empty bench tests a WEAKER prompt than production and cannot exercise the
 * garment-identity or top-only guards at all.
 */
const studioBenchFields = {
  product_url: z.string().url(),
  // studio_styles slug — resolved to its prompt/tab. Optional: a free-text
  // `prompt` alone is also valid on the bench.
  slug: z.string().optional(),
  // Model reference for the two-step `vton_*` pipelines. Optional — when
  // omitted, a plain frontal reference is generated for the demographic.
  model_image_url: z.string().url().optional(),
  // Demographic override — decides which person the scene renders.
  // Omitted → generateStudioImage infers it from the product category.
  demographic: z.enum(PRODUCT_DEMOGRAPHICS).optional(),
  // Free-text prompt (paste a formula from AI Models and Scenes.html) —
  // overrides the style's prompt. Admin test bench only.
  prompt: z.string().min(1).max(4000).optional(),
  name: z.string().max(200).optional(),
  category: z.string().max(120).optional(),
  subtype: z.string().max(120).optional(),
  primary_color: z.string().max(60).optional(),
  fabric: z.string().max(60).optional(),
  pattern: z.string().max(60).optional(),
  // Shoulder-to-hem garment length in cm → hem landmark clause in the prompt.
  length_cm: z.number().int().min(20).max(200).optional(),
  // Overrides the default model height for the demographic (cm).
  model_height_cm: z.number().int().min(90).max(210).optional(),
};

/**
 * Bench body → the product shape `generateStudioImage` takes, or undefined when
 * every garment field is blank (which keeps the pre-existing behaviour for
 * anyone pasting a bare URL).
 */
function studioProductFromBench(body: {
  name?: string;
  category?: string;
  subtype?: string;
  primary_color?: string;
  fabric?: string;
  pattern?: string;
  length_cm?: number;
  model_height_cm?: number;
}): StudioProduct | undefined {
  const hasGarmentFields = Boolean(
    body.name ||
      body.category ||
      body.subtype ||
      body.primary_color ||
      body.fabric ||
      body.pattern ||
      body.length_cm,
  );
  if (!hasGarmentFields) return undefined;
  return {
    name: body.name ?? null,
    category: body.category ?? null,
    subtype: body.subtype ?? null,
    primary_color: body.primary_color ?? null,
    fabric: body.fabric ?? null,
    pattern: body.pattern ?? null,
    length_cm: body.length_cm ?? null,
    model_height_cm: body.model_height_cm ?? null,
  };
}

export const adminPhotoCleanupRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── POST /admin/photo-cleanup/run ────────────────────────────────
  // Runs the standalone cleanup script against an uploaded product photo +
  // background image (both already-uploaded R2 URLs — client gets there via
  // the existing /admin/background-images/upload-url presign endpoint, no
  // new upload plumbing needed). Sample/reference image stays client-side
  // only — it's a visual target, never fed into the script.
  //
  // The whole handler runs inside serializeCleanup(): only one Python
  // cleanup process (and thus one onnx model in memory) exists at a time.
  server.post('/photo-cleanup/run', async (request) =>
    serializePhotoCleanup(async () => {
      const body = z
        .object({
          product_url: z.string().url(),
          background_url: z.string().url(),
          shine: z.boolean().default(false),
          blur: z.number().int().min(1).max(100).optional(),
          // Ghost mannequin: fills the hollow neckline/sleeve/waist gaps in
          // the garment silhouette via local LaMa inpainting (no 3rd-party
          // API/key — see docs/photo-feature/ghost-mannequin-research.md
          // for why the earlier Snappyit integration was dead on arrival).
          // Passed straight through to batch-clean-photos.py's
          // --ghost-mannequin flag, which forces composite mode (blur is
          // ignored when set).
          ghost_mannequin: z.boolean().default(false),
          // Pixel rect (x1,y1,x2,y2) to isolate the subject before rembg —
          // fixes the documented rembg failure mode where a second
          // garment/prop in frame gets kept as "foreground" too.
          crop: z
            .object({
              x1: z.number().int(),
              y1: z.number().int(),
              x2: z.number().int(),
              y2: z.number().int(),
            })
            .optional(),
        })
        .parse(request.body);

      // Runs through the shared runner (services/photo-cleanup sidecar in
      // production, local python in dev) — same path as the retailer
      // pro-cleanup route, one behavior, one place. Ghost mannequin's
      // first-ever run also loads the LaMa checkpoint on top of rembg's —
      // give it more room than the default 240s cap.
      const { jpeg } = await runPhotoCleanup(
        {
          photoUrl: body.product_url,
          bgImageUrl: body.background_url,
          blur: body.blur ?? null,
          ghostMannequin: body.ghost_mannequin,
          shine: body.shine,
          crop: body.crop ?? null,
        },
        body.ghost_mannequin ? 600_000 : 240_000,
      );

      // Compress the cleaned output to ≤80KB (quality-first) before it
      // lands in R2 — this is a test tool, the result is a preview, and
      // every stored byte counts (see scripts/compress-r2-images.ts).
      const { buffer: resultBuf } = await compressImageToTarget(jpeg);
      const key = R2_PATHS.photoCleanupTest(`${randomUUID()}.jpg`);
      await uploadBuffer(key, resultBuf, 'image/jpeg');

      return { data: { result_url: publicUrl(key) } };
    }),
  );

  // ─── POST /admin/photo-cleanup/studio-shoot ───────────────────────
  // AI Studio Shoot test bench — runs the SAME generateStudioImage() the
  // retailer feature uses (studio-shoot.ts), but synchronously and without
  // the BullMQ queue / quota / product-row plumbing (admin-only test page,
  // mirrors /photo-cleanup/run's sync shape).
  //
  // `engine` is honoured (see STUDIO_ENGINES), and every engine except the
  // `vton_*` pair receives the product photo directly. When `engine` is omitted
  // the default cascade applies: FLUX Kontext via Fal, falling back to the BFL
  // direct API when Fal is unavailable or errors. `flux_pro` / `flux_schnell` /
  // `gemini_image*` only run when named here — each falls through to Kontext on
  // its own failure, so an engine choice degrades rather than fails.
  server.post('/photo-cleanup/studio-shoot', async (request) => {
    const body = z
      .object({
        ...studioBenchFields,
        engine: z.enum(STUDIO_ENGINES).optional(),
        // false → the photo is a bare garment (hanger / flat-lay): use the
        // placement wording instead of "edit only the background".
        input_has_person: z.boolean().default(true),
        // Run the prompt director (vision pass) and send ITS prompt instead.
        // Single-shot engines only — the vton_* pair builds its own prompts.
        director: z.boolean().default(false),
      })
      .parse(request.body);

    // Bench tests drafts too — no status filter.
    const style = body.slug
      ? await prisma.studioStyle.findFirst({ where: { slug: body.slug } })
      : null;
    if (!style && !body.prompt) {
      throw validationError('Provide a slug or a prompt.', 'slug');
    }

    // Mirror the job's product shape so the bench assembles the SAME
    // garment-identity + colour clauses the retailer path does.
    const product = studioProductFromBench(body);

    const tab = style?.tab ?? 'MODEL';
    // The guard above guarantees at least one of the two is present; the
    // `?? ''` only satisfies the type checker.
    const prompt = body.prompt ?? style?.prompt ?? '';
    const isTwoStep = body.engine === 'vton_kontext' || body.engine === 'vton_gemini';
    let directed: { prompt: string; missing_parts: string[] } | undefined;
    if (body.director && !isTwoStep) {
      directed = await directStudioPrompt(
        body.product_url,
        buildStudioPrompt({
          prompt,
          tab,
          demographic: body.demographic,
          product,
          inputHasPerson: body.input_has_person,
        }),
      );
    }

    const result = await generateStudioImage(body.product_url, {
      prompt,
      tab,
      engine: body.engine,
      demographic: body.demographic,
      humanImageUrl: body.model_image_url,
      product,
      inputHasPerson: body.input_has_person,
      promptOverride: directed?.prompt,
      // A bench run must show the engine it names, not a Kontext fallback.
      strict: true,
    });
    // `!payload` is true exactly when neither field is present, so the guard's
    // meaning is unchanged while `payload` narrows to `string` below.
    const payload = result.base64Data || result.sampleUrl;
    if (result.status !== 'ready' || !payload) {
      throw new AppError(
        'STUDIO_SHOOT_FAILED',
        result.error ?? 'The studio shoot could not be generated.',
        502,
      );
    }

    const key = R2_PATHS.photoCleanupTest(`studio-${randomUUID()}.jpg`);
    const uploaded = await downloadCompressAndUpload(payload, key, Boolean(result.base64Data));
    return {
      data: {
        result_url: uploaded.url,
        slug: style?.slug ?? null,
        // Present only when the director ran — what was actually sent, and
        // which outfit pieces the photo does not show.
        prompt_used: directed?.prompt ?? null,
        missing_parts: directed?.missing_parts ?? null,
      },
    };
  });

  // ─── POST /admin/photo-cleanup/studio-ab ──────────────────────────
  // The SAME product photo down BOTH pipeline orders, returned together for a
  // side-by-side quality call:
  //
  //   forward   reference → try-on (product photo) → scene render
  //   reversed  scene render (product photo)        → try-on (product photo)
  //
  // Neither order is obviously right — the forward one feeds the try-on the
  // plain frontal reference it was trained on and finishes at the scene
  // model's resolution; the reversed one costs a call less but feeds the
  // try-on a generated scene and finishes at FASHN's 576×864. That argument is
  // unresolvable on paper, which is why this exists.
  //
  // Both arms are STRICT — no fallback — so a blank arm means that order
  // failed and `error` names the stage. Everything is re-served from R2: Fal
  // and BFL result URLs expire (BFL's within ten minutes), so linking them
  // directly would leave the comparison board full of broken tiles by the time
  // anyone looks at it twice.
  server.post('/photo-cleanup/studio-ab', async (request) => {
    const body = z
      .object({
        ...studioBenchFields,
        // Restricted to the engines that HAVE two orders — a single-shot engine
        // here would run the same pipeline twice and call it a comparison.
        engine: z.enum(['vton_kontext', 'vton_gemini']).default('vton_kontext'),
      })
      .parse(request.body);

    const style = body.slug
      ? await prisma.studioStyle.findFirst({ where: { slug: body.slug } })
      : null;
    if (!style && !body.prompt) {
      throw validationError('Provide a slug or a prompt.', 'slug');
    }

    const ab = await generateStudioOrderAb(body.product_url, {
      prompt: body.prompt ?? style?.prompt ?? '',
      tab: style?.tab ?? 'MODEL',
      engine: body.engine,
      demographic: body.demographic,
      // Forward arm only — the reversed arm's person comes from its own scene.
      humanImageUrl: body.model_image_url,
      product: studioProductFromBench(body),
      // Gemini answers in base64 and the try-on stage needs a URL it can fetch,
      // so the reversed arm's scene render is re-served mid-pipeline here.
      persistStage: async (payload) => {
        const key = R2_PATHS.photoCleanupTest(`studio-ab-stage-${randomUUID()}.jpg`);
        const uploaded = await downloadCompressAndUpload(
          payload.base64Data ?? payload.sampleUrl ?? '',
          key,
          Boolean(payload.base64Data),
        );
        return uploaded.url;
      },
    });

    // Persist each arm's final image AND its intermediates, in parallel — see
    // the expiry note above. A failed arm still contributes whatever stages it
    // did produce, which is the part that says WHERE it failed.
    const arms = await Promise.all(
      ab.arms.map(async (arm) => {
        const payload = arm.base64Data || arm.sampleUrl;
        return {
          order: arm.order,
          label: arm.label,
          status: arm.status,
          error: arm.error ?? null,
          ms: arm.ms,
          result_url: payload
            ? (
                await downloadCompressAndUpload(
                  payload,
                  R2_PATHS.photoCleanupTest(`studio-ab-${arm.order}-${randomUUID()}.jpg`),
                  Boolean(arm.base64Data),
                )
              ).url
            : null,
          stages: await Promise.all(
            arm.stages.map(async (step) => ({
              label: step.label,
              url: (
                await downloadCompressAndUpload(
                  step.url,
                  R2_PATHS.photoCleanupTest(`studio-ab-${arm.order}-stage-${randomUUID()}.jpg`),
                )
              ).url,
            })),
          ),
        };
      }),
    );

    return {
      data: { engine: ab.engine, slug: style?.slug ?? null, arms, notes: ab.notes },
    };
  });

  // ─── POST /admin/photo-cleanup/image-to-video ─────────────────────
  // F-034 AI Promo Video test bench — the video sibling of /studio-shoot.
  // Synchronous, admin-only, no BullMQ / quota / ProductVideo row (this is a
  // test page; the retailer path in products-video-ai.ts is the async one).
  // Photo URL in → Fal image→video → ffmpeg crop/trim → mp4 in R2 → url out.
  server.post('/photo-cleanup/image-to-video', async (request) => {
    const body = z
      .object({
        product_url: z.string().url(),
        model: z.enum(['seedance', 'wan', 'kling_std', 'kling_pro', 'luma']),
        // Free text on the bench; a curated studio_styles prompt on the
        // retailer side (Phase 2).
        motion_prompt: z.string().min(1).max(2000),
        aspect: z.enum(['9:16', '16:9', '1:1', '4:5']),
        seconds: z.union([z.literal(5), z.literal(6), z.literal(8)]).default(5),
      })
      .parse(request.body);

    const mp4 = await generateImageToVideo(body.product_url, {
      model: body.model,
      motionPrompt: body.motion_prompt,
      aspect: body.aspect,
      seconds: body.seconds,
    });

    const key = R2_PATHS.photoCleanupTest(`promo-${randomUUID()}.mp4`);
    await uploadBuffer(key, mp4, 'video/mp4');
    return { data: { result_url: publicUrl(key) } };
  });

  // ─── GET /admin/photo-cleanup/tryon-results ────────────────────────
  // Reads the ADMIN_TRYON audit trail into a typed results feed.
  server.get('/photo-cleanup/tryon-results', async () => {
    const rows = await prisma.auditLog.findMany({
      where: { action: 'ADMIN_TRYON' },
      orderBy: { created_at: 'desc' },
      take: 50,
      select: { id: true, created_at: true, metadata: true },
    });

    return {
      data: rows.map((r) => parseTryOnResult(r.id, r.created_at, r.metadata)),
    };
  });
};
