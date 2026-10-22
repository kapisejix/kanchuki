// Server-side checks for presigned-PUT uploads. The presigned URL fixes the key
// and the declared Content-Type but NOT the body, so every "confirm" endpoint
// (the one that records an uploaded r2_key) must call verifyUpload() before it
// stores anything. It also stops a client from recording another retailer's key
// or an arbitrary external URL as its own upload.
//
// Presign routes hand out a STAGED key (`uploads/pending/<final key>`), so an
// upload that is never confirmed stays under one prefix an R2 lifecycle rule can
// expire. verifyUpload promotes a passing staged object to its final key.
import { copyObject, deleteObject, inspectObject, publicUrl } from '@kanchuki/ai';
import { validationError } from '../plugins/error-handler.js';

export type UploadKind =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'application/pdf'
  | 'video/mp4'
  | 'video/quicktime'
  | 'video/webm';

export const IMAGE_KINDS: readonly UploadKind[] = ['image/jpeg', 'image/png', 'image/webp'];
export const VIDEO_KINDS: readonly UploadKind[] = ['video/mp4', 'video/quicktime', 'video/webm'];

// ISO-BMFF brands that are still images, not video (HEIC/HEIF/AVIF share the ftyp box).
const IMAGE_FTYP_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
  'avif',
  'avis',
]);

/** What the BYTES are, not what the client declared. */
export function sniffUploadType(b: Buffer): UploadKind | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (
    b.length >= 8 &&
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    b.length >= 12 &&
    b.toString('latin1', 0, 4) === 'RIFF' &&
    b.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (b.length >= 5 && b.toString('latin1', 0, 5) === '%PDF-') return 'application/pdf';
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    return 'video/webm';
  }
  if (b.length >= 12 && b.toString('latin1', 4, 8) === 'ftyp') {
    const brand = b.toString('latin1', 8, 12);
    if (IMAGE_FTYP_BRANDS.has(brand)) return null;
    return brand === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  }
  // Older QuickTime files open with a moov/mdat/wide atom instead of ftyp.
  if (b.length >= 8 && ['moov', 'mdat', 'wide'].includes(b.toString('latin1', 4, 8))) {
    return 'video/quicktime';
  }
  return null;
}

/** Image-only sniff for multipart photo bodies (try-on, My Style). HEIC/SVG/anything else → null. */
export function sniffImageType(b: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  const kind = sniffUploadType(b);
  return kind && IMAGE_KINDS.includes(kind)
    ? (kind as 'image/jpeg' | 'image/png' | 'image/webp')
    : null;
}

export const STAGING_PREFIX = 'uploads/pending/';

/** Key a presign route hands the client; verifyUpload moves it to `finalKey`. */
export function stagingKey(finalKey: string): string {
  return `${STAGING_PREFIX}${finalKey}`;
}

/** The final key a staged key promotes to; a final key is returned as-is. */
export function unstagedKey(key: string): string {
  return key.startsWith(STAGING_PREFIX) ? key.slice(STAGING_PREFIX.length) : key;
}

/**
 * Where an upload's bytes are right now: the staged key until a confirm promotes
 * it, the final key after. For pre-confirm readers (AI suggest) that may be
 * called with a staged key the client still holds after the confirm.
 */
export async function currentKey(key: string): Promise<string> {
  const finalKey = unstagedKey(key);
  return finalKey !== key && !(await inspectObject(key, 1)) ? finalKey : key;
}

/** True when `key` lives under this retailer's own R2 prefix (no traversal). */
export function isOwnedKey(
  retailerId: string,
  key: string,
  prefix = `retailers/${retailerId}/`,
): boolean {
  // An empty prefix would match every key, so it never counts as ownership.
  return (
    prefix.length > 0 &&
    key.startsWith(prefix) &&
    !key.includes('..') &&
    !key.includes('//') &&
    !key.includes('\\')
  );
}

/**
 * Confirm an upload: key is the caller's own, object exists, is within
 * `maxBytes`, and its magic bytes are one of `allowed`. Accepts the staged key a
 * presign route returned or the final key. A passing staged object is copied to
 * the final key and the staged copy deleted; a failing staged object is deleted.
 * A retry after a promote (staged gone, final present) verifies the final key.
 * Returns the server-built public URL and the FINAL key — callers store those,
 * never the client-supplied key or url.
 */
export async function verifyUpload(
  opts: { r2Key: string; allowed: readonly UploadKind[]; maxBytes: number } & (
    | {
        retailerId: string;
        /** Key prefix the retailer owns; default `retailers/<id>/`. Must end in the retailer id + '/'. */
        prefix?: string;
      }
    // Admin uploads: no retailer; the caller names the platform prefix (e.g. `admin/studio-styles/`).
    | { retailerId?: never; prefix: string }
  ),
): Promise<{ url: string; kind: UploadKind; r2Key: string }> {
  const { retailerId, r2Key, allowed, maxBytes, prefix } = opts;
  const finalKey = unstagedKey(r2Key);
  const staged = finalKey !== r2Key;
  if (!isOwnedKey(retailerId ?? '', finalKey, prefix))
    throw validationError('Invalid upload reference', 'r2_key');

  let key = r2Key;
  let obj = await inspectObject(r2Key);
  if (!obj && staged) {
    key = finalKey;
    obj = await inspectObject(finalKey);
  }
  if (!obj) throw validationError('Upload not found — please upload the file again', 'r2_key');

  const kind = sniffUploadType(obj.head);
  if (obj.size > maxBytes || !kind || !allowed.includes(kind)) {
    // ponytail: only a staged object is deleted on reject — a final key may be a
    // live object another row points at (e.g. confirmed at the wrong endpoint).
    if (key !== finalKey) await deleteObject(key).catch(() => {});
    throw validationError(
      obj.size > maxBytes ? 'File too large' : 'File is not an allowed image or document type',
      'r2_key',
    );
  }
  if (key !== finalKey) {
    await copyObject(key, finalKey);
    // A failed delete leaves a staged copy for the lifecycle rule; not fatal.
    await deleteObject(key).catch(() => {});
  }
  return { url: publicUrl(finalKey), kind, r2Key: finalKey };
}
