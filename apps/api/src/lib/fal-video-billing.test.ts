// F-034 T5 audit M1: once Fal reports the clip done it has billed us, so the caller must hear
// about it (spend the slot, log the cost) BEFORE our own download/encode can fail.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ safeFetch: vi.fn(), read: vi.fn() }));
vi.mock('@kanchuki/ai', () => ({ ssrfSafeFetch: m.safeFetch, readCappedBuffer: m.read }));
vi.mock('@kanchuki/db', () => ({ getSecret: async () => 'fal-key', prisma: {} }));

const { generateImageToVideo } = await import('./fal-video.js');

const MODEL = {
  model_key: 'kling_2_6',
  endpoint: 'fal-ai/kling-video/v2.6/pro/image-to-video',
  price_usd_per_second: 0.07,
  price_usd_per_million_tokens: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Fal answers the submit with the finished clip straight away (no poll).
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () => new Response(JSON.stringify({ video: { url: 'https://v3.fal.media/c.mp4' } })),
    ),
  );
  m.safeFetch.mockResolvedValue({ ok: true, status: 200 });
});

describe('generateImageToVideo billing order', () => {
  it('reports completion and the cost even when our download then fails', async () => {
    const order: string[] = [];
    m.read.mockImplementation(async () => {
      order.push('download');
      throw new Error('Response exceeded cap');
    });
    const onUsage = vi.fn(() => order.push('usage'));
    await expect(
      generateImageToVideo('https://cdn/p.jpg', {
        model: MODEL,
        motionPrompt: 'push in',
        aspect: '9:16',
        seconds: 5,
        onFalComplete: async () => {
          order.push('complete');
        },
        onUsage,
      }),
    ).rejects.toThrow(/cap/);
    expect(order).toEqual(['complete', 'download', 'usage']);
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ cost_usd: 0.35 }));
  });

  it('downloads the clip under the raised video cap, not the 25 MB photo cap', async () => {
    m.read.mockRejectedValue(new Error('stop'));
    await expect(
      generateImageToVideo('https://cdn/p.jpg', {
        model: MODEL,
        motionPrompt: 'push in',
        aspect: '9:16',
        seconds: 5,
      }),
    ).rejects.toThrow();
    expect(m.safeFetch).toHaveBeenCalledWith(expect.any(String), undefined, 100 * 1024 * 1024);
    expect(m.read).toHaveBeenCalledWith(expect.anything(), 100 * 1024 * 1024);
  });
});
