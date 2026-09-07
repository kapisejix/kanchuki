import { createHash } from 'node:crypto';
// Admin config for the Suits Designs watermark — the platform logo + how it
// is stamped on every design (docs/tasks/suits-designs.md §2.2.4 / §4).
//
// The config is ONE JSON blob in the audit-log-as-key-value settings store
// (key `showcase_watermark`, shared with lib/showcase-watermark.ts). Code
// defaults in the lib cover an absent blob; an admin PUTs over them here. The
// `logo_r2_key` is minted by this module's presigned upload (raw image bytes
// never touch the API), stored on the blob, and downloaded server-side at
// design-create time (resolveWatermark → @kanchuki/ai downloadBuffer).
import { deleteObject, getUploadPresignedUrl, publicUrl } from '@kanchuki/ai';
import { R2_PATHS } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  SHOWCASE_WATERMARK_SETTING_KEY,
  type ShowcaseWatermarkConfig,
  getShowcaseWatermarkConfig,
  mergeShowcaseWatermark,
} from '../../lib/showcase-watermark.js';
import { adminAuthPreHandler } from '../admin.js';
import { saveSetting } from './settings-store.js';

const LOGO_PREFIX = 'showcase-watermark/';

// Mirrors VALID_GRAVITIES in lib/showcase-watermark.ts (kept in sync by the
// shared WatermarkGravity type) so an admin can never save an unknown corner.
const GRAVITIES = [
  'northwest',
  'north',
  'northeast',
  'west',
  'center',
  'east',
  'southwest',
  'south',
  'southeast',
] as const;

const WM_BODY_SCHEMA = z
  .object({
    // null clears back to the built-in Kanchuki logo (fallback in the lib).
    logo_r2_key: z.string().trim().min(1).nullable().optional(),
    // Opacity 5–100% / width 2–100% / 1–24 strip thumbs — the same safe
    // bounds mergeShowcaseWatermark clamps to, mirrored so a bad PUT is a
    // clean 422 instead of a silent clamp.
    opacity: z.number().min(0.05).max(1).optional(),
    scale: z.number().min(0.02).max(1).optional(),
    gravity: z.enum(GRAVITIES).optional(),
    strip_count: z.number().int().min(1).max(24).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one watermark setting to update',
  });

type WatermarkBody = z.infer<typeof WM_BODY_SCHEMA>;

/** Shape the web settings page consumes — config + a ready-to-render logo URL. */
function toResponse(config: ShowcaseWatermarkConfig) {
  return {
    ...config,
    logo_url: config.logo_r2_key ? publicUrl(config.logo_r2_key) : null,
  };
}

export const adminShowcaseWatermarkRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  // ─── GET /settings/showcase-watermark ─────────────────────────────
  // Current config — code defaults until an admin saves a blob.
  server.get('/settings/showcase-watermark', async () => {
    const config = await getShowcaseWatermarkConfig();
    return { data: toResponse(config) };
  });

  // ─── PUT /settings/showcase-watermark ─────────────────────────────
  // Partial update merged over the live config (same pattern as theme.ts).
  server.put('/settings/showcase-watermark', async (request) => {
    const body = WM_BODY_SCHEMA.parse(request.body) as WatermarkBody;

    const current = await getShowcaseWatermarkConfig();
    // mergeShowcaseWatermark validates + clamps and coerces logo_r2_key, so a
    // hand-crafted body can never break the compositor.
    const merged = mergeShowcaseWatermark({ ...current, ...body });
    await saveSetting(SHOWCASE_WATERMARK_SETTING_KEY, merged as unknown as Record<string, unknown>);

    // Best-effort cleanup of the replaced/cleared logo — only ever keys this
    // module minted (never a retailer-uploaded key an admin typed by hand).
    const previous = current.logo_r2_key;
    if (previous && previous !== merged.logo_r2_key && previous.startsWith(LOGO_PREFIX)) {
      try {
        await deleteObject(previous);
      } catch (err) {
        request.log.warn({ err, previous }, 'R2 delete failed for replaced watermark logo');
      }
    }

    request.log.info({ merged }, 'Showcase watermark config updated');
    return { data: toResponse(merged) };
  });

  // ─── POST /settings/showcase-watermark/logo-upload-url ────────────
  // Presigned PUT so the admin panel uploads the logo image bytes straight
  // to R2 (same pattern as background-images/upload-url) and only the R2 key
  // is saved to the settings blob.
  server.post('/settings/showcase-watermark/logo-upload-url', async (request) => {
    const body = z
      .object({
        content_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        filename: z.string().min(1).max(200),
      })
      .parse(request.body);

    const ext = body.content_type.split('/')[1];
    const r2Key = R2_PATHS.showcaseWatermarkLogo(
      `${createHash('sha256')
        .update(body.filename + Date.now())
        .digest('hex')
        .slice(0, 16)}.${ext}`,
    );
    const uploadUrl = await getUploadPresignedUrl(r2Key, body.content_type, 300);

    return {
      data: { upload_url: uploadUrl, r2_key: r2Key, public_url: publicUrl(r2Key), expires_in: 300 },
    };
  });
};
