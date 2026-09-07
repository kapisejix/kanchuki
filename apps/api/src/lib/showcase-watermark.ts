/**
 * T2.2 — resolves what to stamp on a Suits Design at upload time
 * (docs/tasks/suits-designs.md §2.5 / §4).
 *
 * Watermark config is one JSON blob in the AuditLog-as-KV settings store
 * (key `showcase_watermark`, read via getSetting/saveSetting — the same
 * mechanism theme.ts uses for `app_theme`), NOT a migration-seeded table and
 * NOT integration_settings (that table is encrypted secrets). Code defaults
 * below are the fallback until an admin PUTs a blob over them.
 *
 * Logo precedence for a retailer-owned design: retailer.logo_r2_key →
 * platform watermark logo (settings) → built-in Kanchuki brand asset.
 * Global/admin designs always use platform → built-in.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { downloadBuffer, uploadBuffer, watermark } from '@kanchuki/ai';
import type { WatermarkGravity } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import { getSetting } from '../routes/admin-settings/settings-store.js';

export const SHOWCASE_WATERMARK_SETTING_KEY = 'showcase_watermark';

export interface ShowcaseWatermarkConfig {
  /** Master switch — false stores the raw image as the final (no stamp). */
  enabled: boolean;
  /** Platform/global watermark logo (R2 object key). null = fall through to the built-in logo. */
  logo_r2_key: string | null;
  /** Logo alpha multiplier, 0–1. */
  opacity: number;
  /** Logo width as a fraction of the source image width. */
  scale: number;
  /** Corner the logo sits in. */
  gravity: WatermarkGravity;
  /** Thumbnails shown on the product-detail strip before "View more". */
  strip_count: number;
}

export type ShowcaseLogoSource = 'retailer' | 'platform' | 'builtin' | 'none';

export interface ResolvedShowcaseWatermark extends ShowcaseWatermarkConfig {
  logoBuf: Buffer;
  logo_source: ShowcaseLogoSource;
}

// Watermark is OFF by default (raw image stored as-is). Re-enable later by
// setting `enabled: true` in the saved settings blob (or via the admin PUT).
export const DEFAULT_SHOWCASE_WATERMARK: ShowcaseWatermarkConfig = {
  enabled: false,
  logo_r2_key: null,
  opacity: 0.35,
  scale: 0.18,
  gravity: 'southeast',
  strip_count: 6,
};

const VALID_GRAVITIES: WatermarkGravity[] = [
  'northwest',
  'north',
  'northeast',
  'west',
  'center',
  'east',
  'southwest',
  'south',
  'southeast',
];

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return clamp(n, min, max);
}

/**
 * Merge a partial saved blob (metadata JSON from the settings store) over the
 * code defaults. Unknown/malformed fields fall back — an admin cannot save a
 * value that breaks the compositor.
 */
export function mergeShowcaseWatermark(saved: unknown): ShowcaseWatermarkConfig {
  if (!saved || typeof saved !== 'object') return { ...DEFAULT_SHOWCASE_WATERMARK };
  const s = saved as Record<string, unknown>;
  const gravity =
    typeof s.gravity === 'string' && (VALID_GRAVITIES as string[]).includes(s.gravity)
      ? (s.gravity as WatermarkGravity)
      : DEFAULT_SHOWCASE_WATERMARK.gravity;
  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULT_SHOWCASE_WATERMARK.enabled,
    logo_r2_key:
      typeof s.logo_r2_key === 'string' && s.logo_r2_key.length > 0 ? s.logo_r2_key : null,
    opacity: asNumber(s.opacity, DEFAULT_SHOWCASE_WATERMARK.opacity, 0.05, 1),
    scale: asNumber(s.scale, DEFAULT_SHOWCASE_WATERMARK.scale, 0.02, 1),
    gravity,
    strip_count: Math.round(asNumber(s.strip_count, DEFAULT_SHOWCASE_WATERMARK.strip_count, 1, 24)),
  };
}

/** Pure logo-selection decision (unit-testable, no I/O). */
export function pickWatermarkLogoKey(args: {
  retailerLogoKey: string | null;
  platformLogoKey: string | null;
  isGlobal: boolean;
}): string | null {
  if (args.isGlobal) return args.platformLogoKey;
  return args.retailerLogoKey ?? args.platformLogoKey;
}

/** Current watermark config — saved settings blob merged over defaults. */
export async function getShowcaseWatermarkConfig(): Promise<ShowcaseWatermarkConfig> {
  const saved = await getSetting(SHOWCASE_WATERMARK_SETTING_KEY);
  return mergeShowcaseWatermark(saved);
}

// Built-in fallback logo — the Kanchuki brand asset. The API Dockerfile's
// build context is the repo root (COPY . .), and this module sits exactly
// three levels under it in both src (dev/tsx/vitest) and dist (prod tsc), so
// a static relative URL resolves in every environment.
const BUILTIN_LOGO_URL = new URL('../../../web/public/kanchuki-logo.png', import.meta.url);

async function readBuiltinLogo(): Promise<Buffer> {
  return readFile(fileURLToPath(BUILTIN_LOGO_URL));
}

/**
 * Everything the watermark step needs for one upload: config + the logo bytes.
 * - ownerRetailerId null (admin/global design) → platform logo → built-in.
 * - retailer-owned → retailer.logo_r2_key → platform logo → built-in.
 */
export async function resolveWatermark(
  ownerRetailerId: string | null,
): Promise<ResolvedShowcaseWatermark> {
  const config = await getShowcaseWatermarkConfig();

  let retailerLogoKey: string | null = null;
  if (ownerRetailerId) {
    const retailer = await prisma.retailer.findUnique({
      where: { id: ownerRetailerId },
      select: { logo_r2_key: true },
    });
    retailerLogoKey = retailer?.logo_r2_key ?? null;
  }

  const isGlobal = !ownerRetailerId;
  const key = pickWatermarkLogoKey({
    retailerLogoKey,
    platformLogoKey: config.logo_r2_key,
    isGlobal,
  });

  const logo_source: ShowcaseLogoSource = key
    ? !isGlobal && key === retailerLogoKey
      ? 'retailer'
      : 'platform'
    : 'builtin';

  const logoBuf = key ? await downloadBuffer(key) : await readBuiltinLogo();

  return { ...config, logoBuf, logo_source };
}

/**
 * Run the full watermark step for one design create/replace: download the raw
 * upload, composite the resolved logo, upload the final JPEG, and hand back
 * the metadata the caller stores. Shared by the retailer + admin routes —
 * the only difference is `ownerRetailerId` (null → platform logo / global).
 */
export async function watermarkShowcaseDesign(input: {
  rawR2Key: string;
  /** Pre-built final object key (owner-scoped, e.g. R2_PATHS.showcaseDesign). */
  finalR2Key: string;
  /** null = admin/global design (always platform logo). */
  ownerRetailerId: string | null;
}): Promise<{ logo_source: ShowcaseLogoSource; width: number; height: number }> {
  const config = await getShowcaseWatermarkConfig();
  const raw = await downloadBuffer(input.rawR2Key);
  if (!config.enabled) {
    // Watermark disabled — store the raw upload as the final image so the
    // pipeline (final key / image_url / future re-stamp from original_r2_key)
    // is unchanged, just unstamped. Skip logo resolution entirely.
    await uploadBuffer(input.finalR2Key, raw, 'image/jpeg');
    return { logo_source: 'none', width: 0, height: 0 };
  }
  const cfg = await resolveWatermark(input.ownerRetailerId);
  const { buffer, width, height } = await watermark(raw, cfg.logoBuf, {
    opacity: cfg.opacity,
    scale: cfg.scale,
    gravity: cfg.gravity,
  });
  await uploadBuffer(input.finalR2Key, buffer, 'image/jpeg');
  return { logo_source: cfg.logo_source, width, height };
}
