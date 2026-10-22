// Server-side checks for presigned-PUT uploads. The presigned URL fixes the key
// and the declared Content-Type but NOT the body, so every "confirm" endpoint
// (the one that records an uploaded r2_key) must call verifyUpload() before it
// stores anything. It also stops a client from recording another retailer's key
// or an arbitrary external URL as its own upload.
import { deleteObject, inspectObject, publicUrl } from '@kanchuki/ai';
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
 * `maxBytes`, and its magic bytes are one of `allowed`. A failing object is
 * deleted so a rejected upload does not linger in the bucket. Returns the
 * server-built public URL — callers store THAT, never a client-supplied url.
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
): Promise<{ url: string; kind: UploadKind }> {
  const { retailerId, r2Key, allowed, maxBytes, prefix } = opts;
  if (!isOwnedKey(retailerId ?? '', r2Key, prefix))
    throw validationError('Invalid upload reference', 'r2_key');

  const obj = await inspectObject(r2Key);
  if (!obj) throw validationError('Upload not found — please upload the file again', 'r2_key');

  const kind = sniffUploadType(obj.head);
  if (obj.size > maxBytes || !kind || !allowed.includes(kind)) {
    await deleteObject(r2Key).catch(() => {});
    throw validationError(
      obj.size > maxBytes ? 'File too large' : 'File is not an allowed image or document type',
      'r2_key',
    );
  }
  return { url: publicUrl(r2Key), kind };
}
