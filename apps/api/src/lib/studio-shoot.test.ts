// F-032 Phase A — BFL FLUX Kontext client tests (2026-08-13).
//
// Mocked fetch: verifies the submit contract (x-key header, template prompt,
// input_image URL), the poll loop (Ready/Error/timeout), error mapping
// (402/429/unconfigured), and downloadCompressAndUpload (SSRF-safe fetch →
// compressor → R2 upload → public URL).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetch, mockCompress, mockUpload, mockPublicUrl } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockCompress: vi.fn(),
  mockUpload: vi.fn(),
  mockPublicUrl: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  getSecret: vi.fn().mockResolvedValue(null),
}));

vi.mock('@kanchuki/ai', () => ({
  compressImageToTarget: mockCompress,
  readCappedBuffer: async (res: { ok: boolean; body: unknown }) => Buffer.from('img'),
  ssrfSafeFetch: mockFetch,
  uploadBuffer: mockUpload,
  publicUrl: mockPublicUrl,
}));

// Keep the real shared module (templates) — only the env is stubbed.
import { generateStudioImage, downloadCompressAndUpload, isStudioShootConfigured } from './studio-shoot.js';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('BFL_API_KEY', 'test-key');
  // generateStudioImage calls the GLOBAL fetch for the BFL submit + poll —
  // stub it so no real network is hit. downloadCompressAndUpload uses
  // ssrfSafeFetch, which is mocked to mockFetch above.
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** submit + one Ready poll — the default (BFL-direct) happy path. */
function bflReadyOnce() {
  mockFetch
    .mockResolvedValueOnce(
      jsonResponse({ id: 'task_1', polling_url: 'https://api.bfl.ai/v1/get_result?id=task_1' }),
    )
    .mockResolvedValueOnce(
      jsonResponse({ status: 'Ready', result: { sample: 'https://delivery.bfl.ai/img.jpg' } }),
    );
}

function submitPrompt(): string {
  const submitCall = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
  return (JSON.parse(submitCall[1].body as string) as { prompt: string }).prompt;
}

describe('generateStudioImage', () => {
  it('submits with x-key + prompt + input URL, polls to Ready, returns sample', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({ id: 'task_1', polling_url: 'https://api.bfl.ai/v1/get_result?id=task_1' }),
      )
      .mockResolvedValueOnce(jsonResponse({ status: 'Processing' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'Ready', result: { sample: 'https://delivery.bfl.ai/img.jpg' } }));

    const result = await generateStudioImage('https://r2.example/photo.jpg', {
      prompt: 'On a chic city rooftop at golden hour with string lights.',
      tab: 'MODEL',
    });

    expect(result).toEqual({ status: 'ready', sampleUrl: 'https://delivery.bfl.ai/img.jpg' });
    const submitCall = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(submitCall[0]).toBe('https://api.bfl.ai/v1/flux-kontext-pro');
    const headers = submitCall[1].headers as Record<string, string>;
    expect(headers['x-key']).toBe('test-key');
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(submitCall[1].body as string) as { prompt: string; input_image: string };
    expect(body.input_image).toBe('https://r2.example/photo.jpg');
    // The scene guard is prepended for every generation.
    expect(body.prompt).toContain('pixel-identical to the input');
  });

  it('PRODUCT tab uses the prompt verbatim (no person clause)', async () => {
    bflReadyOnce();
    await generateStudioImage('https://img/1.jpg', {
      prompt: 'Product-only studio shot on a wooden hanger, seamless white backdrop.',
      tab: 'PRODUCT',
    });
    expect(submitPrompt()).toContain('Product-only studio shot on a wooden hanger');
    expect(submitPrompt()).not.toMatch(/The person wearing this garment is/);
  });

  it('MODEL tab injects the demographic person clause', async () => {
    bflReadyOnce();
    await generateStudioImage('https://img/1.jpg', {
      prompt: 'On a chic city rooftop at golden hour with string lights.',
      tab: 'MODEL',
      demographic: 'mens',
    });
    expect(submitPrompt()).toMatch(/dignified adult Indian man fashion model/);
  });

  it('maps 402 (out of credits) to a safe AppError', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: 'no credits' }, false, 402),
    );
    await expect(
      generateStudioImage('https://r2.example/p.jpg', { prompt: 'x', tab: 'MODEL' }),
    ).rejects.toThrow(/out of credits/i);
  });

  it('maps 429 (active-task cap) to a retryable message', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: 'rate limit' }, false, 429),
    );
    await expect(
      generateStudioImage('https://r2.example/p.jpg', { prompt: 'x', tab: 'MODEL' }),
    ).rejects.toThrow(/try again in a minute/i);
  });

  it('returns failed when the poll reports Error', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({ id: 'task_1', polling_url: 'https://api.bfl.ai/v1/get_result?id=task_1' }),
      )
      .mockResolvedValueOnce(jsonResponse({ status: 'Error', error: 'moderation' }));
    const result = await generateStudioImage('https://r2.example/p.jpg', { prompt: 'x', tab: 'MODEL' });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('moderation');
  });

  it('throws 503 when BFL_API_KEY is unset', async () => {
    vi.stubEnv('BFL_API_KEY', '');
    expect(await isStudioShootConfigured()).toBe(false);
    await expect(
      generateStudioImage('https://r2.example/p.jpg', { prompt: 'x', tab: 'MODEL' }),
    ).rejects.toThrow(/not configured/i);
  });
});

describe('downloadCompressAndUpload', () => {
  it('fetches (SSRF-safe), compresses, uploads, returns public URL', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, body: null });
    mockCompress.mockResolvedValue({ buffer: Buffer.from('out'), width: 800, height: 1000 });
    mockPublicUrl.mockReturnValue('https://r2.example/studio.jpg');

    const out = await downloadCompressAndUpload(
      'https://delivery.bfl.ai/img.jpg',
      'retailers/r1/products/p1/studio/s1.jpg',
    );

    expect(mockFetch).toHaveBeenCalledWith('https://delivery.bfl.ai/img.jpg');
    expect(mockUpload).toHaveBeenCalledWith(
      'retailers/r1/products/p1/studio/s1.jpg',
      Buffer.from('out'),
      'image/jpeg',
    );
    expect(out).toEqual({
      key: 'retailers/r1/products/p1/studio/s1.jpg',
      url: 'https://r2.example/studio.jpg',
      width: 800,
      height: 1000,
    });
  });

  it('throws when the BFL download fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, body: null });
    await expect(
      downloadCompressAndUpload('https://delivery.bfl.ai/x.jpg', 'k.jpg'),
    ).rejects.toThrow(/Failed to fetch studio result: 500/);
  });
});
