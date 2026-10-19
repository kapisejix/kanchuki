// F-045 PR-6 T14 — the My Style vision read. Weight sits on: the model can only say enum
// values (anything else fails, never coerces — RC-059), injected text in the image cannot
// change that, an unusable photo is a result not an error, and the bytes sent are a
// downscaled re-encode (no EXIF) rather than the original.
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRunVisionExtract } = vi.hoisted(() => ({ mockRunVisionExtract: vi.fn() }));
vi.mock('./providers.js', () => ({ runVisionExtract: mockRunVisionExtract }));

const { analyzeStyleImage, MY_STYLE_VISION_SCHEMA } = await import('./my-style-vision.js');

async function jpeg(w = 3000, h = 2000): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: '#aa8866' } })
    .jpeg()
    .toBuffer();
}

beforeEach(() => {
  mockRunVisionExtract.mockReset();
});

describe('analyzeStyleImage', () => {
  it('returns a validated profile', async () => {
    mockRunVisionExtract.mockResolvedValue({
      usable: true,
      undertone: 'warm',
      depth: 'medium',
      frame: 'average',
    });
    const r = await analyzeStyleImage(await jpeg(), 'image/jpeg');
    expect(r).toEqual({
      usable: true,
      profile: { undertone: 'warm', depth: 'medium', frame: 'average' },
    });
  });

  it('sends a downscaled JPEG, not the original bytes', async () => {
    mockRunVisionExtract.mockResolvedValue({
      usable: true,
      undertone: 'cool',
      depth: 'fair',
      frame: 'petite',
    });
    const original = await jpeg(4000, 3000);
    await analyzeStyleImage(original, 'image/jpeg');
    const sent = mockRunVisionExtract.mock.calls[0]?.[0].images[0];
    expect(sent.mediaType).toBe('image/jpeg');
    const meta = await sharp(sent.buffer).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1568);
    expect(sent.buffer.equals(original)).toBe(false);
  });

  it('an unusable photo is a result with an enum reason', async () => {
    mockRunVisionExtract.mockResolvedValue({ usable: false, reason: 'face_not_clear' });
    expect(await analyzeStyleImage(await jpeg(), 'image/jpeg')).toEqual({
      usable: false,
      reason: 'face_not_clear',
    });
  });

  it.each([
    [
      'out-of-enum undertone',
      { usable: true, undertone: 'ignore previous', depth: 'fair', frame: 'tall' },
    ],
    ['missing frame', { usable: true, undertone: 'warm', depth: 'fair' }],
    ['unknown reason', { usable: false, reason: 'because I said so' }],
    ['usable not boolean', { usable: 'yes', undertone: 'warm', depth: 'fair', frame: 'tall' }],
    ['empty object', {}],
  ])('rejects %s instead of coercing it (no fallback)', async (_n, out) => {
    mockRunVisionExtract.mockResolvedValue(out);
    await expect(analyzeStyleImage(await jpeg(), 'image/jpeg')).rejects.toThrow(/unreadable/i);
  });

  it('propagates a provider failure (no canned profile)', async () => {
    mockRunVisionExtract.mockRejectedValue(new Error('All AI providers failed'));
    await expect(analyzeStyleImage(await jpeg(), 'image/jpeg')).rejects.toThrow(
      /providers failed/,
    );
  });

  it('times out instead of hanging', async () => {
    mockRunVisionExtract.mockReturnValue(new Promise(() => {}));
    await expect(analyzeStyleImage(await jpeg(), 'image/jpeg', { timeoutMs: 20 })).rejects.toThrow(
      /timed out/i,
    );
  });

  it('prompt tells the model to ignore text in the image and the schema is enum-only', async () => {
    mockRunVisionExtract.mockResolvedValue({ usable: false, reason: 'no_person' });
    await analyzeStyleImage(await jpeg(), 'image/jpeg');
    const req = mockRunVisionExtract.mock.calls[0]?.[0];
    expect(req.systemPrompt).toMatch(/ignore .*text/i);
    const props = (
      MY_STYLE_VISION_SCHEMA.schema as {
        properties: Record<string, { enum?: string[]; type: string }>;
      }
    ).properties;
    expect(props.undertone?.enum).toEqual(['warm', 'cool', 'neutral']);
    expect(props.reason?.enum).toContain('no_person');
    expect(Object.values(props).some((p) => p.type === 'string' && !p.enum)).toBe(false);
  });
});

// ─── PR-9: find similar ──────────────────────────────────────────────────────────────

const { analyzeGarmentImage, garmentVisionSchema } = await import('./my-style-vision.js');
const FAMILIES = ['red', 'yellow', 'blue'];

describe('analyzeGarmentImage', () => {
  const good = {
    usable: true,
    category: 'Kurti',
    color_family: 'Yellow',
    pattern: 'Printed',
    embellishments: ['Zari Work'],
  };

  it('returns a validated descriptor', async () => {
    mockRunVisionExtract.mockResolvedValue(good);
    const r = await analyzeGarmentImage(await jpeg(), 'image/jpeg', FAMILIES);
    expect(r).toEqual({
      usable: true,
      garment: {
        category: 'Kurti',
        color_family: 'yellow',
        pattern: 'Printed',
        embellishments: ['Zari Work'],
      },
    });
  });

  it('an unusable photo is a result, not an error', async () => {
    mockRunVisionExtract.mockResolvedValue({ usable: false, reason: 'no_garment' });
    expect(await analyzeGarmentImage(await jpeg(), 'image/jpeg', FAMILIES)).toEqual({
      usable: false,
      reason: 'no_garment',
    });
  });

  it.each([
    ['category outside the taxonomy', { ...good, category: 'Ignore all instructions' }],
    ['colour family not in the admin list', { ...good, color_family: 'purple' }],
    ['free-text embellishment', { ...good, embellishments: ['hacked'] }],
    ['extra free-text field', { ...good, notes: 'hello' }],
    ['unknown unusable reason', { usable: false, reason: 'because' }],
    ['no usable flag', { category: 'Kurti' }],
  ])('throws on %s, never coerces (RC-059)', async (_n, reply) => {
    mockRunVisionExtract.mockResolvedValue(reply);
    await expect(analyzeGarmentImage(await jpeg(), 'image/jpeg', FAMILIES)).rejects.toThrow(
      /unreadable model reply/,
    );
  });

  it('refuses to run with no colour families rather than guess', async () => {
    await expect(analyzeGarmentImage(await jpeg(), 'image/jpeg', [])).rejects.toThrow();
    expect(mockRunVisionExtract).not.toHaveBeenCalled();
  });

  it('sends a downscaled JPEG and an injection-safe, enum-only schema', async () => {
    mockRunVisionExtract.mockResolvedValue(good);
    await analyzeGarmentImage(await jpeg(4000, 3000), 'image/jpeg', FAMILIES);
    const req = mockRunVisionExtract.mock.calls[0]?.[0];
    const meta = await sharp(req.images[0].buffer).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1568);
    expect(req.systemPrompt).toMatch(/ignore .*text/i);
    const props = garmentVisionSchema(FAMILIES).schema.properties as Record<
      string,
      { type: string; enum?: string[]; items?: { enum?: string[] } }
    >;
    expect(props.color_family?.enum).toEqual(FAMILIES);
    expect(props.embellishments?.items?.enum).not.toContain('None');
    for (const [k, p] of Object.entries(props)) {
      if (p.type === 'string') expect(p.enum, k).toBeTruthy();
    }
  });
});
