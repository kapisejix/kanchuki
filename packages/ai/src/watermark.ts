/**
 * T2.1 — server-side watermark compositing for Suits Designs
 * (docs/tasks/suits-designs.md). Composites a semi-transparent logo over a
 * source image and re-encodes as baseline JPEG.
 *
 * The caller owns logo selection (retailer logo → platform logo → builtin);
 * this helper only composites whatever logoBuf it is handed.
 */

// Lazy import — same reason as image-compress.ts/image-rotate.ts/detector.ts:
// sharp's native dlopen can crash on Windows+pnpm when loaded eagerly.
let _sharp: any = null;
async function getSharp() {
  if (!_sharp) {
    const mod = await import('sharp');
    _sharp = mod.default ?? mod;
  }
  return _sharp;
}

export type WatermarkGravity =
  | 'northwest'
  | 'north'
  | 'northeast'
  | 'west'
  | 'center'
  | 'east'
  | 'southwest'
  | 'south'
  | 'southeast';

export interface WatermarkOptions {
  /** Logo alpha multiplier, 0–1 (default 0.35). */
  opacity?: number;
  /** Logo width as a fraction of the source width, ~0–1 (default 0.18). */
  scale?: number;
  /** Corner / edge the logo sits in (default 'southeast'). */
  gravity?: WatermarkGravity;
  /**
   * Source pixel cap — decompression-bomb guard (default 50MP). Test hook:
   * pass a tiny cap to prove oversized input is rejected before decoding.
   */
  maxPixels?: number;
  /** Output JPEG quality 50–95 (default 88). */
  quality?: number;
}

export interface WatermarkResult {
  buffer: Buffer;
  width: number;
  height: number;
}

/** Decompression-bomb guard: refuse absurd single-dimension images too. */
const MAX_DIMENSION = 12_000;
const MAX_PIXELS_DEFAULT = 50_000_000;
const MIN_LOGO_DIM = 1;

export class WatermarkInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WatermarkInputError';
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}

/**
 * Composite `logoBuf` over `srcBuf` at the given opacity/scale/gravity and
 * re-encode as baseline JPEG (mozjpeg off — progressive output blanks out in
 * expo-image's grid cache; see image-compress.ts).
 *
 * Logo dimensions are derived from `scale` × the SOURCE width (kept inside the
 * source bounds); its alpha channel is multiplied by `opacity` in raw pixels,
 * then composited over the source. Source + logo are validated by header-only
 * metadata reads before any full decode, so an oversized / non-image input
 * throws WatermarkInputError instead of exhausting memory.
 */
export async function watermark(
  srcBuf: Buffer,
  logoBuf: Buffer,
  options: WatermarkOptions = {},
): Promise<WatermarkResult> {
  if (!Buffer.isBuffer(srcBuf) || srcBuf.length === 0) {
    throw new WatermarkInputError('Source image buffer is empty');
  }
  if (!Buffer.isBuffer(logoBuf) || logoBuf.length === 0) {
    throw new WatermarkInputError('Watermark logo buffer is empty');
  }

  const opacity = clamp(options.opacity ?? 0.35, 0.05, 1);
  const scale = clamp(options.scale ?? 0.18, 0.02, 1);
  const gravity = options.gravity ?? 'southeast';
  const maxPixels = options.maxPixels ?? MAX_PIXELS_DEFAULT;
  const quality = clampInt(options.quality ?? 88, 50, 95);

  const s = await getSharp();

  // Header-only metadata reads — reject before any full decode (bomb guard).
  let srcMeta: { width?: number; height?: number };
  try {
    srcMeta = await s(srcBuf).metadata();
  } catch {
    throw new WatermarkInputError('Source is not a decodable image');
  }
  if (!srcMeta.width || !srcMeta.height) {
    throw new WatermarkInputError('Source image has no dimensions');
  }
  if (
    srcMeta.width * srcMeta.height > maxPixels ||
    srcMeta.width > MAX_DIMENSION ||
    srcMeta.height > MAX_DIMENSION
  ) {
    throw new WatermarkInputError(
      `Source image is too large (${srcMeta.width}x${srcMeta.height}) — refusing to process`,
    );
  }

  let logoMeta: { width?: number; height?: number };
  try {
    logoMeta = await s(logoBuf).metadata();
  } catch {
    throw new WatermarkInputError('Watermark logo is not a decodable image');
  }
  if (!logoMeta.width || !logoMeta.height) {
    throw new WatermarkInputError('Watermark logo has no dimensions');
  }

  const logoWidth = Math.max(MIN_LOGO_DIM, Math.round(srcMeta.width * scale));
  const logoHeight = Math.max(
    MIN_LOGO_DIM,
    Math.round(logoMeta.height * (logoWidth / logoMeta.width)),
  );

  // Fade the logo: decode to raw RGBA, multiply the alpha channel by opacity,
  // re-encode as PNG (transparent around the logo stays transparent).
  const logoRaw = await s(logoBuf)
    .resize(logoWidth, logoHeight, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px = logoRaw.data as Buffer;
  for (let i = 3; i < px.length; i += 4) {
    // writeUInt8/readUInt8 avoid noUncheckedIndexedAccess on px[i]
    px.writeUInt8(Math.round(px.readUInt8(i) * opacity), i);
  }
  const fadedLogo = await s(px, {
    raw: { width: logoRaw.info.width, height: logoRaw.info.height, channels: 4 },
  })
    .png()
    .toBuffer();

  const { data, info } = await s(srcBuf)
    .composite([{ input: fadedLogo, gravity }])
    .jpeg({ quality, mozjpeg: false })
    .toBuffer({ resolveWithObject: true });

  return { buffer: data, width: info.width, height: info.height };
}
