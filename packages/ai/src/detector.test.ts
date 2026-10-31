// H5-2 / RC-148 — detectCropAndTag writes the fetched bytes to the public CDN, so it must
// sniff them first (the verifyUpload gate every other write path already has).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  uploadBuffer: vi.fn(),
  ssrfSafeFetch: vi.fn(),
  tag: vi.fn(),
}));

vi.mock('./r2.js', () => ({
  uploadBuffer: m.uploadBuffer,
  publicUrl: (k: string) => `https://cdn/${k}`,
}));
vi.mock('./safe-fetch.js', () => ({
  ssrfSafeFetch: m.ssrfSafeFetch,
  readCappedBuffer: async (res: Response) => Buffer.from(await res.arrayBuffer()),
}));
vi.mock('./tagger.js', () => ({ tagProductImageUrl: m.tag }));

const { detectCropAndTag } = await import('./detector.js');

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);

const serve = (body: Buffer) => m.ssrfSafeFetch.mockResolvedValue(new Response(body));

beforeEach(() => {
  vi.resetAllMocks();
  m.uploadBuffer.mockResolvedValue(undefined);
  m.tag.mockResolvedValue({});
});

describe('detectCropAndTag — only real images reach the public CDN', () => {
  it.each([
    ['JPEG', JPEG],
    ['PNG', PNG],
    ['WebP', WEBP],
  ])('uploads a %s', async (_n, bytes) => {
    serve(bytes);
    const [item] = await detectCropAndTag('https://x.example/a', 'r1');
    expect(m.uploadBuffer).toHaveBeenCalledTimes(1);
    expect(item?.r2Key).toMatch(/^catalog-import\/r1\/[0-9a-f]{16}\.jpg$/);
  });

  it.each([
    ['HTML', Buffer.from('<html><script>alert(1)</script></html>')],
    ['PDF', Buffer.from('%PDF-1.7 payload')],
    ['executable', Buffer.from('MZ\x90\x00payload')],
    ['empty', Buffer.alloc(0)],
  ])('rejects %s bytes before any upload or AI call', async (_n, bytes) => {
    serve(bytes);
    await expect(detectCropAndTag('https://x.example/a', 'r1')).rejects.toThrow(/JPEG\/PNG\/WebP/);
    expect(m.uploadBuffer).not.toHaveBeenCalled();
    expect(m.tag).not.toHaveBeenCalled();
  });
});
