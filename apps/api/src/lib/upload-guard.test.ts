import { beforeEach, describe, expect, it, vi } from 'vitest';

const inspectObject = vi.fn();
const deleteObject = vi.fn(async () => {});
const copyObject = vi.fn(async () => {});
vi.mock('@kanchuki/ai', () => ({
  inspectObject: (...a: unknown[]) => inspectObject(...a),
  copyObject: (...a: unknown[]) => copyObject(...(a as [])),
  deleteObject: (...a: unknown[]) => deleteObject(...(a as [])),
  publicUrl: (k: string) => `https://cdn.test/${k}`,
}));

import {
  IMAGE_KINDS,
  currentKey,
  isOwnedKey,
  sniffImageType,
  sniffUploadType,
  stagingKey,
  verifyUpload,
} from './upload-guard.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
const PDF = Buffer.from('%PDF-1.7\n');
const EXE = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00');
const HTML = Buffer.from('<script>alert(1)</script>');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');

const KEY = 'retailers/r1/products/p1/a.jpg';
const STAGED = stagingKey(KEY);

describe('sniffUploadType', () => {
  it('recognises allowed formats by magic bytes', () => {
    expect(sniffUploadType(JPEG)).toBe('image/jpeg');
    expect(sniffUploadType(PNG)).toBe('image/png');
    expect(sniffUploadType(WEBP)).toBe('image/webp');
    expect(sniffUploadType(PDF)).toBe('application/pdf');
  });
  it.each([
    ['exe', EXE],
    ['html', HTML],
    ['svg', SVG],
    ['empty', Buffer.alloc(0)],
  ])('rejects %s', (_n, buf) => {
    expect(sniffUploadType(buf)).toBeNull();
  });
});

describe('video + HEIC sniffing', () => {
  const ftyp = (brand: string) =>
    Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from(`ftyp${brand}`)]);
  it('mp4 / mov / webm by magic bytes', () => {
    expect(sniffUploadType(ftyp('isom'))).toBe('video/mp4');
    expect(sniffUploadType(ftyp('qt  '))).toBe('video/quicktime');
    expect(sniffUploadType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]))).toBe('video/webm');
  });
  it('HEIC/AVIF are neither video nor an accepted image', () => {
    expect(sniffUploadType(ftyp('heic'))).toBeNull();
    expect(sniffUploadType(ftyp('avif'))).toBeNull();
    expect(sniffImageType(ftyp('heic'))).toBeNull();
  });
  it('sniffImageType refuses pdf and video', () => {
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(PDF)).toBeNull();
    expect(sniffImageType(ftyp('isom'))).toBeNull();
  });
});

describe('custom prefix', () => {
  it('owns keys under the given prefix only', () => {
    expect(isOwnedKey('r1', 'showcase-designs/r1/raw/a.jpg', 'showcase-designs/r1/raw/')).toBe(
      true,
    );
    expect(isOwnedKey('r1', 'showcase-designs/r2/raw/a.jpg', 'showcase-designs/r1/raw/')).toBe(
      false,
    );
    expect(isOwnedKey('r1', 'retailers/r1/a.jpg', 'showcase-designs/r1/raw/')).toBe(false);
  });
});

describe('isOwnedKey', () => {
  it('accepts only the retailer’s own prefix', () => {
    expect(isOwnedKey('r1', KEY)).toBe(true);
    expect(isOwnedKey('r1', 'retailers/r2/products/p/a.jpg')).toBe(false);
    expect(isOwnedKey('r1', 'retailers/r1/../r2/a.jpg')).toBe(false);
    expect(isOwnedKey('r1', 'retailers/r1//x.jpg')).toBe(false);
    expect(isOwnedKey('r1', 'admin/secret.jpg')).toBe(false);
    // r1 must not match r10's prefix
    expect(isOwnedKey('r1', 'retailers/r10/a.jpg')).toBe(false);
  });
});

describe('verifyUpload', () => {
  beforeEach(() => {
    inspectObject.mockReset();
    deleteObject.mockClear();
    copyObject.mockClear();
  });
  const run = (key = KEY, allowed = IMAGE_KINDS, maxBytes = 1000) =>
    verifyUpload({ retailerId: 'r1', r2Key: key, allowed, maxBytes });

  it('returns a server-built url for a real image', async () => {
    inspectObject.mockResolvedValue({ size: 500, head: JPEG });
    await expect(run()).resolves.toEqual({
      url: `https://cdn.test/${KEY}`,
      kind: 'image/jpeg',
      r2Key: KEY,
    });
    expect(copyObject).not.toHaveBeenCalled();
  });

  it('rejects another retailer’s key without touching storage', async () => {
    await expect(run('retailers/r2/x.jpg')).rejects.toThrow();
    expect(inspectObject).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('admin mode: platform prefix, no retailer', async () => {
    inspectObject.mockResolvedValue({ size: 500, head: JPEG });
    const admin = (r2Key: string) =>
      verifyUpload({ r2Key, allowed: IMAGE_KINDS, maxBytes: 1000, prefix: 'admin/studio-styles/' });
    await expect(admin('admin/studio-styles/a.jpg')).resolves.toMatchObject({ kind: 'image/jpeg' });
    await expect(admin('admin/post-templates/a.jpg')).rejects.toThrow();
    await expect(admin('admin/studio-styles/../x.jpg')).rejects.toThrow();
  });

  it('an empty prefix owns nothing (would otherwise match every key)', async () => {
    expect(isOwnedKey('', 'anything/at/all.jpg', '')).toBe(false);
    await expect(
      verifyUpload({ r2Key: 'x.jpg', allowed: IMAGE_KINDS, maxBytes: 1000, prefix: '' }),
    ).rejects.toThrow();
    expect(inspectObject).not.toHaveBeenCalled();
  });

  it('rejects a missing object', async () => {
    inspectObject.mockResolvedValue(null);
    await expect(run()).rejects.toThrow();
  });

  it.each([
    ['executable', EXE],
    ['html', HTML],
    ['svg', SVG],
  ])('rejects %s labelled as an image and deletes the staged object', async (_n, head) => {
    inspectObject.mockResolvedValue({ size: 100, head });
    await expect(run(STAGED)).rejects.toThrow();
    expect(deleteObject).toHaveBeenCalledWith(STAGED);
    expect(copyObject).not.toHaveBeenCalled();
  });

  it('rejects oversize and deletes the staged object', async () => {
    inspectObject.mockResolvedValue({ size: 5000, head: JPEG });
    await expect(run(STAGED)).rejects.toThrow();
    expect(deleteObject).toHaveBeenCalledWith(STAGED);
    expect(copyObject).not.toHaveBeenCalled();
  });

  it('never deletes a FINAL key on reject (it may be a live object)', async () => {
    inspectObject.mockResolvedValue({ size: 100, head: EXE });
    await expect(run()).rejects.toThrow();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('promotes a passing staged upload to its final key', async () => {
    inspectObject.mockResolvedValue({ size: 500, head: JPEG });
    await expect(run(STAGED)).resolves.toEqual({
      url: `https://cdn.test/${KEY}`,
      kind: 'image/jpeg',
      r2Key: KEY,
    });
    expect(inspectObject).toHaveBeenCalledWith(STAGED);
    expect(copyObject).toHaveBeenCalledWith(STAGED, KEY);
    expect(deleteObject).toHaveBeenCalledWith(STAGED);
  });

  it('retry after a promote: staged gone, final present → verifies final, no copy', async () => {
    inspectObject.mockImplementation(async (k: string) =>
      k === KEY ? { size: 500, head: JPEG } : null,
    );
    await expect(run(STAGED)).resolves.toMatchObject({ r2Key: KEY });
    expect(copyObject).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('staged and final both missing → not found', async () => {
    inspectObject.mockResolvedValue(null);
    await expect(run(STAGED)).rejects.toThrow(/not found/);
    expect(inspectObject).toHaveBeenCalledTimes(2);
  });

  it('ownership is checked on the final key behind the staging prefix', async () => {
    await expect(run(stagingKey('retailers/r2/x.jpg'))).rejects.toThrow();
    await expect(run(stagingKey(stagingKey(KEY)))).rejects.toThrow();
    await expect(run('uploads/pending/retailers/r1/../r2/x.jpg')).rejects.toThrow();
    expect(inspectObject).not.toHaveBeenCalled();
  });

  it('currentKey: staged while it exists, final once promoted', async () => {
    inspectObject.mockResolvedValueOnce({ size: 1, head: JPEG });
    await expect(currentKey(STAGED)).resolves.toBe(STAGED);
    inspectObject.mockResolvedValueOnce(null);
    await expect(currentKey(STAGED)).resolves.toBe(KEY);
    await expect(currentKey(KEY)).resolves.toBe(KEY);
  });

  it('PDF only where allowed', async () => {
    inspectObject.mockResolvedValue({ size: 100, head: PDF });
    await expect(run()).rejects.toThrow();
    await expect(run(KEY, [...IMAGE_KINDS, 'application/pdf'])).resolves.toMatchObject({
      kind: 'application/pdf',
    });
  });
});
