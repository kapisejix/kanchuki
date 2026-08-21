// Retailer-facing "professional photo" cleanup — the capture-flow backend for
// the multi-shot product-add flow (see docs/photo-feature/
// ai-photo-requirements-analysis-and-thoughts-2026-08-07.md §6 build items 1-3).
//
// The mobile capture screen uploads the retailer's raw kept shots to R2
// (existing /products/upload-url presign), then calls this endpoint. Each
// photo runs through scripts/batch-clean-photos.py — rembg background removal
// + composite onto white or the retailer's chosen backdrop, plus (optional)
// SAM2-based hanger/mannequin/stand removal (--remove-hardware, auto masks)
// OR the interactive tap-to-fix override (--prompt-points / --prompt-excludes,
// SAM2 point prompts from the retailer's taps on leftover hardware), and
// optional garment tight-crop (--tight-crop). The sharpest cleaned shot is
// auto-flagged primary via Laplacian variance (scoreSharpness) — no extra AI
// cost.
//
// Execution lives in lib/photo-cleanup-runner.ts runPhotoCleanup(): PRODUCTION
// sends the photo bytes to the photo-cleanup sidecar (services/photo-cleanup,
// Hetzner CX43 — the torch/SAM2 stack peaks ~2.2GB, far over the API's 2GB
// container); local dev shells out to python directly. Serialized via
// serializePhotoCleanup either way.
//
// Metering: each cleaned photo increments the existing BG_REMOVAL quota
// (F-010/F-023 rails, same counter as the tag-product auto-cleanup and the
// manual per-photo cleanup endpoint); per-photo crop rects also draw from
// IMAGE_CROP. The ₹0 default path (rembg+SAM2+LaMa, self-hosted) never
// touches AI credits.
import { spawnSync } from 'node:child_process';

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import {
  compressImageToTarget,
  fetchImageBuffer,
  isDarkImage,
  pickSharpest,
  publicUrl,
  scoreSharpness,
  uploadBuffer,
} from '@kanchuki/ai';
import { getSecret, prisma } from '@kanchuki/db';
import { pickContrastBackground } from '../../lib/backgrounds.js';
import { runPhotoCleanup, serializePhotoCleanup } from '../../lib/photo-cleanup-runner.js';
import { checkQuota, incrementUsage } from '../../lib/quota.js';
import { serviceUnavailable, validationError } from '../../plugins/error-handler.js';

const CropRectSchema = z.object({
  x1: z.number().int(),
  y1: z.number().int(),
  x2: z.number().int(),
  y2: z.number().int(),
});

/** Normalized (0..1, relative to the raw frame the retailer tapped) point. */
const TapPointSchema = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);

const ProCleanupSchema = z.object({
  // Raw kept shots already uploaded to R2 via /products/upload-url.
  photos: z
    .array(
      z.object({
        r2_key: z.string().min(1),
        url: z.string().url(),
        // Optional per-photo manual crop rect (x1,y1,x2,y2 pixel region) —
        // pre-trims to the garment before segmentation.
        crop: CropRectSchema.optional(),
        // Tap-to-fix: retailer tapped leftover hanger/mannequin on the
        // options screen → SAM2 point prompts (foreground points). Only
        // sent for photos the retailer explicitly marked.
        hardware_points: z.array(TapPointSchema).max(10).optional(),
        // Optional negative points marking the garment so the prompted mask
        // can't swallow it (merged-mask case).
        garment_points: z.array(TapPointSchema).max(10).optional(),
      }),
    )
    .min(1)
    .max(5),
  // Remove hanger / mannequin / stand hardware via SAM2 auto-masks + LaMa
  // (best-effort server-side: skips gracefully when torch/sam2 isn't
  // installed, response carries hardware_skipped so the UI can surface it).
  // Auto-scan is the fallback — photos with hardware_points use the point
  // prompts instead.
  remove_hardware: z.boolean().default(false),
  // Crop the final composite to the garment bounding box + margin.
  tight_crop: z.boolean().default(true),
  // Retailer's chosen backdrop from the F-011 library; null = white.
  background_image_id: z.string().nullable().optional().default(null),
});

// Runner error-message signals that mean the cleanup ENVIRONMENT is down
// (sidecar unreachable, python/deps missing, network/timeout) rather than the
// photos themselves being unprocessable — see lib/photo-cleanup-runner.ts for
// where these strings originate. Used only to pick the all-fail response so
// the mobile capture screen can show a targeted "use Photo mode instead"
// message instead of a generic failure.
const CLEANUP_UNAVAILABLE_SIGNALS = [
  'no module named',
  'python3/python not found',
  'no working python3/python',
  'cleanup service',
  'killed — hit the',
  'fetch failed',
  'aborted',
  'econnrefused',
  'eai_again',
  'enotfound',
];

interface ProCleanupPhotoRow {
  r2_key: string;
  url: string;
  score: number;
  is_primary: boolean;
  hardware_removed: boolean;
  hardware_skipped: boolean;
  tap_removed: boolean;
  error: string | null;
}

/** Sibling R2 key for the cleaned copy — same dir as the raw upload, `-pro`
 * suffix (mirrors lib/photo-cleanup.ts originalR2Key's replace pattern). */
function cleanedR2Key(rawKey: string): string {
  return rawKey.replace(/(\.[^./]+)$/, '-pro$1');
}

export const productsProCleanupRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /products/pro-cleanup ──────────────────────────────────
  server.post('/pro-cleanup', async (request, reply) =>
    serializePhotoCleanup(async () => {
      const retailerId = request.retailerId;
      const body = ProCleanupSchema.safeParse(request.body);
      if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

      const { photos, remove_hardware, tight_crop, background_image_id } = body.data;

      // Ownership guard: every r2_key must sit under this retailer's own path
      // prefix (upload-url mints keys there) — stops a retailer from pointing
      // the pipeline at another store's raw photo.
      const prefix = `retailers/${retailerId}/`;
      for (const p of photos) {
        if (!p.r2_key.startsWith(prefix)) throw validationError('Invalid photo key');
      }

      // F-010 quota gates — BG_REMOVAL for every cleaned photo, IMAGE_CROP
      // for photos with a manual crop rect.
      const cropCount = photos.filter((p) => p.crop).length;
      await checkQuota(retailerId, 'BG_REMOVAL', photos.length);
      if (cropCount > 0) await checkQuota(retailerId, 'IMAGE_CROP', cropCount);

      let bgUrl: string | null = null;
      if (background_image_id) {
        const bg = await prisma.backgroundImage.findFirst({
          where: { id: background_image_id, is_active: true },
        });
        if (!bg) throw validationError('Background image not found or inactive');
        bgUrl = bg.image_url;
      } else {
        // F-028 auto-contrast: no explicit pick → classify the FIRST raw shot
        // by average frame luminance (pro mode frames the garment edge-to-edge,
        // so frame tone ≈ garment tone) and match an opposing-tone backdrop.
        // Best-effort: classification failure falls back to white.
        try {
          const firstRaw = await fetchImageBuffer(photos[0]?.url ?? '');
          const isDark = await isDarkImage(firstRaw);
          if (isDark !== null) bgUrl = await pickContrastBackground(isDark ? 'dark' : 'light');
        } catch (err) {
          request.log.warn({ err }, 'Auto-contrast background classification failed — using white');
        }
      }

      const rows: ProCleanupPhotoRow[] = [];
      for (const [i, photo] of photos.entries()) {
        try {
          // Tap-to-fix photos run the SAM2 predictor cold path — the long
          // cap covers torch + SAM2 + LaMa loading on the sidecar's first
          // run (or a local cold start).
          const needsSam2 = remove_hardware || (photo.hardware_points?.length ?? 0) > 0;
          const { output, jpeg } = await runPhotoCleanup(
            {
              photoUrl: photo.url,
              bgImageUrl: bgUrl,
              removeHardware: remove_hardware,
              tightCrop: tight_crop,
              crop: photo.crop ?? null,
              promptPoints: photo.hardware_points ?? [],
              promptExcludes: photo.garment_points ?? [],
            },
            needsSam2 ? 600_000 : 240_000,
          );

          const { buffer: cleaned } = await compressImageToTarget(jpeg);
          const key = cleanedR2Key(photo.r2_key);
          await uploadBuffer(key, cleaned, 'image/jpeg');

          rows.push({
            r2_key: key,
            url: publicUrl(key),
            score: await scoreSharpness(cleaned),
            is_primary: false,
            hardware_removed: output.includes('remove-hardware: inpainted'),
            hardware_skipped: output.includes('HARDWARE_SKIPPED'),
            tap_removed: output.includes('point-prompt inpainted'),
            error: null,
          });
          await incrementUsage(retailerId, 'BG_REMOVAL');
          if (photo.crop) await incrementUsage(retailerId, 'IMAGE_CROP');
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          request.log.error({ err, photo_index: i }, 'pro-cleanup photo failed');
          rows.push({
            r2_key: photo.r2_key,
            url: photo.url,
            score: 0,
            is_primary: false,
            hardware_removed: false,
            hardware_skipped: false,
            tap_removed: false,
            error: message.slice(0, 300),
          });
        }
      }

      const okRows = rows.filter((r) => !r.error);
      if (okRows.length === 0) {
        // Cleanup-environment failure (sidecar/python down, network) vs.
        // unprocessable photos — 503 SERVICE_UNAVAILABLE tells the mobile
        // capture screen to suggest Photo mode instead of a generic error.
        const environmentDown = rows.some((r) =>
          CLEANUP_UNAVAILABLE_SIGNALS.some((signal) =>
            (r.error ?? '').toLowerCase().includes(signal),
          ),
        );
        if (environmentDown) {
          throw serviceUnavailable(
            'Professional photo processing is temporarily unavailable. Please try again later or use Photo mode instead.',
          );
        }
        throw validationError(
          `All ${rows.length} photo(s) failed to process — please retry or pick different shots.`,
        );
      }
      // okRows entries are the same object references as in rows — marking
      // the primary here propagates to the full response list.
      const primaryIdx = pickSharpest(okRows);
      const primaryRow = okRows[primaryIdx];
      if (primaryRow) primaryRow.is_primary = true;

      await prisma.auditLog.create({
        data: {
          actor_type: 'retailer',
          actor_id: retailerId,
          action: 'PHOTO_CLEANUP',
          resource_type: 'Product',
          metadata: {
            photo_count: okRows.length,
            remove_hardware,
            tight_crop,
            background_image_id,
            hardware_removed_count: okRows.filter((r) => r.hardware_removed).length,
            hardware_skipped_count: okRows.filter((r) => r.hardware_skipped).length,
            tap_removed_count: okRows.filter((r) => r.tap_removed).length,
            primary_score: okRows[primaryIdx]?.score ?? null,
          },
          ip_address: request.ip,
        },
      });

      return reply.status(200).send({
        data: {
          photos: rows,
          primary_url: okRows[primaryIdx]?.url ?? null,
        },
      });
    }),
  );

  // ─── GET /products/pro-cleanup/status ─────────────────────────────
  // Availability probe for the mobile capture screen: lets the Pro chip show
  // as unavailable UP-FRONT (before the retailer shoots 3-5 photos and only
  // then discovers a 503 at Process). Service mode → ping the sidecar /health
  // with a short cap; local mode → check for a python binary (the runner's
  // real dep check still happens at run time — production always uses service
  // mode). The client fails open, so a flaky probe never blocks a working
  // feature.
  server.get('/pro-cleanup/status', async () => {
    const serviceUrl = (await getSecret('PHOTO_CLEANUP_SERVICE_URL'))?.trim();
    let serviceHealthy: boolean | null = null;
    let localPythonAvailable = false;
    if (serviceUrl) {
      try {
        const res = await fetch(`${serviceUrl.replace(/\/+$/, '')}/health`, {
          signal: AbortSignal.timeout(3_000),
        });
        serviceHealthy = res.ok;
      } catch {
        serviceHealthy = false;
      }
    } else {
      localPythonAvailable = hasPythonBinary();
    }
    const available = serviceUrl ? serviceHealthy === true : localPythonAvailable;
    return {
      data: {
        available,
        mode: serviceUrl ? 'service' : 'local',
        service_url_set: Boolean(serviceUrl),
        service_healthy: serviceHealthy,
        local_python_available: localPythonAvailable,
      },
    };
  });
};

/** Cheap local-mode availability probe — does this host expose a
 * python3/python binary the runner could exec? (Only reached when
 * PHOTO_CLEANUP_SERVICE_URL is unset, i.e. local dev; missing deps still get
 * caught at run time with the clear "no working python3/python" error.) */
function hasPythonBinary(): boolean {
  for (const bin of ['python3', 'python']) {
    try {
      const res = spawnSync(bin, ['--version'], { timeout: 3_000 });
      if (!res.error && res.status === 0) return true;
    } catch {
      // spawn failed — try the next binary name
    }
  }
  return false;
}
