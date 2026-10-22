// Server-side checks for presigned-PUT uploads. The presigned URL fixes the key
// and the declared Content-Type but NOT the body, so every "confirm" endpoint
// (the one that records an uploaded r2_key) must call verifyUpload() before it
// stores anything. It also stops a client from recording another retailer's key
// or an arbitrary external URL as its own upload.
import { deleteObject, inspectObject, publicUrl } from '@kanchuki/ai';
import { validationError } from '../plugins/error-handler.js';

export type UploadKind = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export const IMAGE_KINDS: readonly UploadKind[] = ['image/jpeg', 'image/png', 'image/webp'];

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
  return null;
}

/** True when `key` lives under this retailer's own R2 prefix (no traversal). */
export function isOwnedKey(retailerId: string, key: string): boolean {
  return (
    key.startsWith(`retailers/${retailerId}/`) &&
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
export async function verifyUpload(opts: {
  retailerId: string;
  r2Key: string;
  allowed: readonly UploadKind[];
  maxBytes: number;
}): Promise<{ url: string; kind: UploadKind }> {
  const { retailerId, r2Key, allowed, maxBytes } = opts;
  if (!isOwnedKey(retailerId, r2Key)) throw validationError('Invalid upload reference', 'r2_key');

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
